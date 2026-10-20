// WO-037 acceptance tests (architect-authored): the 6-hour refresh at scale and the latency from first seen to alert.
// The sharded scheduler reads every board at least once every 6 hours over a simulated day, at the directory's size and
// at 50,000 boards, through failed runs and runs cut short; a board answers a conditional request with 304 and nothing
// is rewritten or closed; and the latency arithmetic matches the real cron cadences.
// Contract: docs/architect/work-orders/WO-037-discovery-at-scale.md
import {
  BUCKETS, bucketOf, capacityPer, laneBuckets, memoryBoardState, pickDue, sizeIngest, WINDOW_MS, type BoardState,
} from "../../supabase/functions/_shared/career_shards.ts";
import { boardFetchFeed, ingestBoards, memoryPostingsDb, type Board } from "../../supabase/functions/_shared/career_ingest.ts";
import { handleIngest } from "../../supabase/functions/career-ingest/handler.ts";
import { cronOf, latencyReport, maxBurst, parseCron, simulate, worstCase, type Model } from "../../scripts/career/alert_latency.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const boards = (n: number): Board[] => Array.from({ length: n }, (_, i) => ({ company: `C${i}`, provider: ["greenhouse", "lever", "ashby", "smartrecruiters"][i % 4], board: `board-${i}` }));
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// A day and a half of runs every 5 minutes. Each lane's run takes its due boards up to capacity; some runs never happen
// (failed), some are cut by the deadline after a random share of their boards; a board that fails to load is still
// attempted. After the first window, at every run, every board's last attempt must be within 6 hours.
async function simulateDay(n: number, lanes: number, o: { failRun: number; cutRun: number; seed: number }) {
  const st = memoryBoardState(), all = boards(n), r = rng(o.seed), interval = 5 * 60000;
  await st.seed(all);
  const cap = capacityPer({ boards: n, intervalMs: interval, lanes });
  const start = Date.UTC(2026, 9, 20, 0, 2);
  let worst = 0, checks = 0;
  for (let t = start; t < start + 30 * 3600000; t += interval) {
    for (let lane = 0; lane < lanes; lane++) {
      if (r() < o.failRun) continue; // this lane's run did not happen
      const due = await st.due(laneBuckets(lane, lanes), cap);
      const take = r() < o.cutRun ? Math.floor(due.length * r()) : due.length; // stopped at its deadline
      const at = new Date(t + lane).toISOString();
      await st.record(due.slice(0, take).map((s) => ({ ...s, last_attempt_at: at, last_ok_at: r() < 0.03 ? s.last_ok_at : at })));
    }
    if (t >= start + WINDOW_MS) {
      let oldest = Infinity;
      for (const s of st.rows.values()) {
        assert(s.last_attempt_at, `${s.provider}:${s.board} never read`);
        const at = Date.parse(s.last_attempt_at);
        if (at < oldest) oldest = at;
      }
      worst = Math.max(worst, t - oldest);
      checks++;
    }
  }
  return { worst, checks, cap };
}

Deno.test("WO-037/R1 the sharded scheduler reads every board within 6 hours over a simulated day (2,179 boards, one lane)", async () => {
  const r = await simulateDay(2179, 1, { failRun: 0.1, cutRun: 0.1, seed: 1 });
  assert(r.checks > 70, "checked at every run after the first window");
  assert(r.worst <= WINDOW_MS, `oldest read was ${(r.worst / 3600000).toFixed(2)} h ago`);
  eq(r.cap, 46, "ceil(2179 / 72 runs * 1.5 headroom)");
});

Deno.test("WO-037/R2 and at 50,000 boards over 8 lanes, with a tenth of runs lost and a tenth cut short", async () => {
  const r = await simulateDay(50000, 8, { failRun: 0.1, cutRun: 0.1, seed: 2 });
  assert(r.worst <= WINDOW_MS, `oldest read was ${(r.worst / 3600000).toFixed(2)} h ago`);
});

Deno.test("WO-037/R3 lanes partition the boards; the run picks never-read first, then the longest-waiting", () => {
  const lanes = 4, seen = new Set<number>();
  for (let l = 0; l < lanes; l++) for (const b of laneBuckets(l, lanes)) { assert(!seen.has(b), `bucket ${b} in two lanes`); seen.add(b); }
  eq(seen.size, BUCKETS, "every bucket has a lane");
  eq(bucketOf({ provider: "lever", board: "Plaid" }), bucketOf({ provider: "lever", board: "plaid" }), "a board's bucket ignores case");
  const s = (board: string, at: string | null): BoardState => ({ provider: "lever", board, bucket: 3, last_attempt_at: at, last_ok_at: at, last_status: null, etag: null, last_modified: null, fail_count: 0 });
  eq(pickDue([s("a", "2026-10-20T05:00:00Z"), s("b", null), s("c", "2026-10-20T01:00:00Z"), { ...s("d", null), bucket: 4 }], [3], 2).map((x) => x.board), ["b", "c"]);
});

Deno.test("WO-037/R4 a board that answers 304 to its ETag is not re-read: nothing written, nothing closed, the validator kept", async () => {
  const sent: Record<string, string>[] = [];
  let etag = '"v1"', status = 200;
  const fetchFn = (async (_u: string, init?: RequestInit) => {
    sent.push(Object.fromEntries(new Headers(init?.headers).entries()));
    if (status === 304) return new Response(null, { status: 304, headers: { etag } });
    return new Response(JSON.stringify({ jobs: [{ id: 1, title: "Data Analyst", absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1", location: { name: "Remote" }, content: "x" }] }), { status: 200, headers: { etag, "last-modified": "Mon, 19 Oct 2026 10:00:00 GMT" } });
  }) as unknown as typeof fetch;
  const read = boardFetchFeed(fetchFn);
  const b: Board = { company: "Acme", provider: "greenhouse", board: "acme" };
  const first = await read(b);
  assert(!Array.isArray(first) && first.etag === '"v1"' && first.last_modified === "Mon, 19 Oct 2026 10:00:00 GMT" && first.postings.length === 1 && first.complete, "a full read keeps its validators");
  status = 304;
  const second = await read({ ...b, etag: '"v1"', last_modified: "Mon, 19 Oct 2026 10:00:00 GMT" });
  eq(sent[1]["if-none-match"], '"v1"', "the ETag goes back");
  eq(sent[1]["if-modified-since"], "Mon, 19 Oct 2026 10:00:00 GMT");
  assert(!Array.isArray(second) && second.not_modified === true && second.postings.length === 0 && !second.complete, "304 reads as not modified");
  const db = memoryPostingsDb();
  status = 200;
  await ingestBoards({ boards: [b], fetchFeed: read, db, now: Date.UTC(2026, 9, 20) });
  status = 304;
  const outcomes: string[] = [];
  const st = await ingestBoards({ boards: [{ ...b, etag: '"v1"' }], fetchFeed: read, db, now: Date.UTC(2026, 9, 20, 1), useCursor: false, onBoard: (_b, r) => outcomes.push(r.status) });
  eq([st.boards_not_modified, st.closed, st.new, outcomes], [1, 0, 0, ["not_modified"]], "nothing changed, nothing closed");
  eq((await db.open()).length, 1, "the posting stays open");
});

Deno.test("WO-037/R5 the ingest function, sharded: seeds board state, reads its lane's due boards, records every attempt", async () => {
  const SECRET = "s".repeat(40), st = memoryBoardState(), db = memoryPostingsDb(), all = boards(300);
  const fetched: string[] = [];
  const d = {
    env: { get: (k: string) => ({ CAREER_INGEST_SECRET: SECRET, INGEST_CONTACT_EMAIL: "ops@example.test", INGEST_LANES: "2" } as Record<string, string>)[k] },
    boards: all, now: () => Date.UTC(2026, 9, 20, 0, 2),
    db: () => ({ ...db, recordRun: async () => {} }),
    state: () => st,
    fetchFeed: () => async (b: Board) => { fetched.push(b.board); if (b.board === "board-7") throw new Error("HTTP 500"); return []; },
  };
  const res = await handleIngest(new Request("https://fn.test/?lane=1", { method: "POST", headers: { "x-trainee-ingest-secret": SECRET } }), d);
  eq(res.status, 200);
  const body = await res.json();
  eq(st.rows.size, 300, "every board has a state row");
  eq(body.shard.capacity, capacityPer({ boards: 300, intervalMs: 5 * 60000, lanes: 2 }));
  const mine = new Set(laneBuckets(1, 2));
  assert(fetched.length > 0 && fetched.every((name) => mine.has(bucketOf({ provider: all.find((b) => b.board === name)!.provider, board: name }))), "only lane 1's boards");
  const attempted = [...st.rows.values()].filter((s) => s.last_attempt_at);
  eq(attempted.length, fetched.length, "every attempt recorded");
  const failed = [...st.rows.values()].find((s) => s.board === "board-7");
  if (failed?.last_attempt_at) assert(failed.fail_count === 1 && failed.last_ok_at === null && /^failed/.test(failed.last_status!), "a failure is an attempt, not a success");
});

Deno.test("WO-037/R6 sizing is arithmetic on stated inputs: requests per hour, and whether a run fits the Edge limits", () => {
  const s = sizeIngest({ boards: 50000, intervalMs: 5 * 60000, lanes: 8, concurrency: 8, avgLatencyMs: 600, cpuMsPerBoard: 10, wallLimitS: 150, cpuLimitMs: 2000, deadlineS: 100 });
  eq(s.requests_per_hour, 8333, "50,000 boards every 6 hours");
  eq(s.runs_per_window, 72);
  eq(s.boards_per_lane_run_capacity, Math.ceil(50000 / 72 / 8 * 1.5));
  eq(s.fits_cpu, s.cpu_ms_per_run_at_capacity <= 2000);
});

const model = (): Model => ({
  ingest: parseCron("2-59/5 * * * *"), proactive: parseCron("4-59/5 * * * *"), deliver: parseCron("* * * * *"),
  ingestRunMaxS: 125, proactiveRunMaxS: 20, deliverRowsPerRun: 20, sendS: 1.2,
});
Deno.test("WO-037/R7 the latency math from the real schedules: worst case, burst limit, and the alerts the current timing loses", () => {
  const root = new URL("../../", import.meta.url);
  const read = (f: string) => Deno.readTextFileSync(new URL(f, root));
  eq(parseCron(cronOf(read("scripts/launch/schedule-career-ingest.sql"))), { everyMin: 5, offsetMin: 2 });
  eq(parseCron(cronOf(read("scripts/launch/schedule-career-proactive.sql"))), { everyMin: 5, offsetMin: 4 });
  eq(parseCron(cronOf(read("scripts/launch/schedule-trainee-deliver.sql"))), { everyMin: 1, offsetMin: 0 });
  const w = worstCase(model());
  eq(w.parts, { to_alerts_read_s: 120, alerts_run_s: 20, to_delivery_tick_s: 60, backlog_s: 0, send_s: 1.2 });
  eq(w.seconds, 201.2, "2 min to the alerts run + 20 s + 1 min to a delivery tick + 1.2 s");
  assert(/never alerted/.test(w.race), "an ingest run longer than the 2-minute gap can land after the alerts run read");
  eq(worstCase(model(), 45).parts.backlog_s, 2 * 60 + 5 * 1.2, "45 rows ahead: two full ticks, then 5 sends");
  const fixed = { ...model(), proactive: { everyMin: 5, offsetMin: 0 }, raceFixed: true };
  eq(worstCase(fixed).seconds, 180 + 20 + 60 + 1.2, "alerts 3 minutes after ingest: no race");
  assert(worstCase(fixed).seconds <= 900 && maxBurst(fixed) > 100, "inside 15 minutes for one alert; over a hundred at once still fit");
  const now = simulate(model(), { hours: 24, perRun: 5, seed: 7 }), then = simulate(fixed, { hours: 24, perRun: 5, seed: 7 });
  assert(now.missed > 0 && then.missed === 0, `current timing loses alerts (${now.missed}); the proposed one loses none`);
  assert((then.max_s ?? Infinity) <= 900, "every alert inside 15 minutes at 5 an ingest run");
  assert((simulate(fixed, { hours: 6, perRun: 300, seed: 7 }).p95_s ?? 0) > 900, "300 an ingest run outruns 20 sends a minute: over 15 minutes");
});

Deno.test("WO-037/R8 the latency report: first seen -> delivered, quiet-hours waits apart, same numbers as the database function", () => {
  const r = latencyReport([
    { posting_first_seen_at: "2026-10-20T10:00:00Z", created_at: "2026-10-20T10:03:00Z", deliver_at: "2026-10-20T10:03:00Z", delivered_at: "2026-10-20T10:04:00Z" },
    { posting_first_seen_at: "2026-10-20T10:00:00Z", created_at: "2026-10-20T10:08:00Z", deliver_at: "2026-10-20T10:08:00Z", delivered_at: "2026-10-20T10:10:00Z" },
    { posting_first_seen_at: "2026-10-20T22:58:00Z", created_at: "2026-10-20T23:00:00Z", deliver_at: "2026-10-21T07:00:00Z", delivered_at: null },
    { posting_first_seen_at: null, created_at: "2026-10-20T13:00:00Z", deliver_at: "2026-10-20T13:00:00Z", delivered_at: null },
  ]);
  eq([r.alerts, r.delivered, r.held_for_quiet_hours, r.queued_p50_s, r.delivered_p50_s, r.delivered_max_s, r.over_15_min], [3, 2, 1, 330, 420, 600, 0],
    "the same rows as tests/db/career_board_state.test.sql");
});
