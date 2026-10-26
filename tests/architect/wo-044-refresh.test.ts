// WO-044 acceptance tests (architect-authored): the 6-hour refresh still holds for the larger directory. The sharded
// scheduler (WO-037) is indifferent to provider, but the cost of a read is not: a Workday board pages 20 postings a
// request. So: every board read within 6 hours over a simulated day and a quarter at the size this order's discovery run
// reached (rounded up), across all eleven providers, with a tenth of runs lost and a tenth cut short; and the sizing
// arithmetic charges each read its provider's requests. Contract: docs/architect/work-orders/WO-044-discovery-scale.md
import { bucketOf, capacityPer, laneBuckets, memoryBoardState, sizeIngest, WINDOW_MS } from "../../supabase/functions/_shared/career_shards.ts";
import { INGEST_PROVIDERS, memoryPostingsDb, type Board } from "../../supabase/functions/_shared/career_ingest.ts";
import { handleIngest } from "../../supabase/functions/career-ingest/handler.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const boardsOf = (n: number): Board[] => Array.from({ length: n }, (_, i) => ({ company: `C${i}`, provider: INGEST_PROVIDERS[i % INGEST_PROVIDERS.length], board: INGEST_PROVIDERS[i % INGEST_PROVIDERS.length] === "workday" ? `t${i}.wd5/Careers` : `board-${i}` }));
// The capacity a lane's run takes: WO-037's even split, or (WO-044, the handler) at least the lane's own share.
function laneCap(all: Board[], lane: number, lanes: number, laneAware: boolean) {
  const even = capacityPer({ boards: all.length, intervalMs: 5 * 60000, lanes });
  if (!laneAware) return even;
  const mine = new Set(laneBuckets(lane, lanes));
  return Math.max(even, capacityPer({ boards: all.filter((b) => mine.has(bucketOf(b))).length, intervalMs: 5 * 60000, lanes: 1 }));
}
async function worstAge(n: number, lanes: number, seed: number, laneAware = true) {
  const st = memoryBoardState(), r = rng(seed), interval = 5 * 60000;
  const all = boardsOf(n);
  await st.seed(all);
  const caps = Array.from({ length: lanes }, (_, l) => laneCap(all, l, lanes, laneAware));
  const start = Date.UTC(2026, 9, 21, 0, 2);
  let worst = 0;
  for (let t = start; t < start + 30 * 3600000; t += interval) {
    for (let lane = 0; lane < lanes; lane++) {
      if (r() < 0.1) continue;
      const due = await st.due(laneBuckets(lane, lanes), caps[lane]);
      const take = r() < 0.1 ? Math.floor(due.length * r()) : due.length;
      const at = new Date(t + lane).toISOString();
      await st.record(due.slice(0, take).map((s) => ({ ...s, last_attempt_at: at, last_ok_at: at })));
    }
    if (t >= start + WINDOW_MS) {
      let oldest = Infinity;
      for (const s of st.rows.values()) { assert(s.last_attempt_at, `${s.provider}:${s.board} never read`); oldest = Math.min(oldest, Date.parse(s.last_attempt_at)); }
      worst = Math.max(worst, t - oldest);
    }
  }
  return worst;
}

// The directory after this order's discovery run, rounded up (docs/architect/work-orders/WO-044-discovery-scale.md).
const DIRECTORY_AFTER_WO044 = 12000;

Deno.test("WO-044/R1 every board, on every provider, is read within 6 hours at the directory's new size (4 lanes)", async () => {
  const worst = await worstAge(DIRECTORY_AFTER_WO044, 4, 44);
  assert(worst <= WINDOW_MS, `oldest read was ${(worst / 3600000).toFixed(2)} h ago`);
  // The finding behind the handler's change: with WO-037's even split, the heaviest lane falls behind.
  const even = await worstAge(DIRECTORY_AFTER_WO044, 4, 44, false);
  assert(even > WINDOW_MS, `the even split held this time (${(even / 3600000).toFixed(2)} h): the finding no longer reproduces`);
});

Deno.test("WO-044/R3 the ingest function sizes a lane's run by its own boards", async () => {
  const SECRET = "s".repeat(40), all = boardsOf(1200), lanes = 4;
  const heavy = [0, 1, 2, 3].map((l) => ({ l, n: all.filter((b) => new Set(laneBuckets(l, lanes)).has(bucketOf(b))).length })).sort((a, b) => b.n - a.n)[0];
  const st = memoryBoardState();
  const res = await handleIngest(new Request(`https://fn.test/?lane=${heavy.l}`, { method: "POST", headers: { "x-trainee-ingest-secret": SECRET } }), {
    env: { get: (k: string) => ({ CAREER_INGEST_SECRET: SECRET, INGEST_CONTACT_EMAIL: "ops@example.test", INGEST_LANES: String(lanes) } as Record<string, string>)[k] },
    boards: all, now: () => Date.UTC(2026, 9, 21), db: () => ({ ...memoryPostingsDb(), recordRun: async () => {} }), state: () => st,
    fetchFeed: () => async () => [],
  });
  const body = await res.json();
  assert(heavy.n > 300, "the heaviest lane holds more than an even quarter");
  assert(body.shard.capacity === capacityPer({ boards: heavy.n, intervalMs: 5 * 60000, lanes: 1 }), `capacity ${body.shard.capacity} for ${heavy.n} boards`);
});

Deno.test("WO-044/R2 sizing charges a read its provider's requests: Workday's pages count", () => {
  const base = { boards: 50000, intervalMs: 5 * 60000, lanes: 18, concurrency: 8, avgLatencyMs: 600, cpuMsPerBoard: 100, wallLimitS: 150, cpuLimitMs: 2000, deadlineS: 100 };
  const one = sizeIngest(base), mixed = sizeIngest({ ...base, requestsPerBoard: 2.5 });
  assert(mixed.requests_per_hour === Math.round(one.requests_per_hour * 2.5), `${mixed.requests_per_hour} vs ${one.requests_per_hour}`);
  assert(mixed.wall_s_per_run_at_capacity > one.wall_s_per_run_at_capacity, "more requests per read, more wall clock per run");
});
