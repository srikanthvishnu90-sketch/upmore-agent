// Feature 6: measure what one ingest lane costs, offline, and size the hourly schedule from it.
// Runs the real scheduled handler (career-ingest/handler.ts: the sharded path, the product's own readers and
// normalizers, the URL-shape guard, the run report) over one real lane of the directory (lane 0 of 64, about 1/64 of the
// boards, every provider in its real share) with fixture feeds: each board answers a body in its provider's public shape
// (tests/architect/wo-044-fixtures.ts for the seven WO-044 providers, the recorded shapes of tests/edge/career-ingest.test.ts
// for the first four) holding as many postings as discovery saw on it (capped at what one read takes), each with a
// ~3,000-character description. The store is in memory but serializes every write and read the way the database client
// would (JSON), so its CPU is charged. The fetch answers at once, so the run's time is CPU: MEASURED on this machine.
// Network latency cannot be measured offline: ASSUMED 600 ms per request (WO-037/WO-044 sizing).
//   deno run -A scripts/career/measure-ingest-lane.ts [--write]     (--write: packages/career-data/ingest-lane-plan.json)
import { boardFetchFeed, memoryPostingsDb, type Board, type FetchFeed } from "../../supabase/functions/_shared/career_ingest.ts";
import { memoryBoardState } from "../../supabase/functions/_shared/career_shards.ts";
import { handleIngest } from "../../supabase/functions/career-ingest/handler.ts";
import { bucketCounts, laneOf, planLanes, simulateFreshness } from "../../supabase/functions/_shared/career_ingest_lanes.mjs";
import { FIX } from "../../tests/architect/wo-044-fixtures.ts";

const root = new URL("../../", import.meta.url);
const dir = JSON.parse(await Deno.readTextFile(new URL("packages/career-data/board-directory.json", root)));
const boardsText = await Deno.readTextFile(new URL("supabase/functions/career-ingest/boards.json", root));
const boards: Board[] = JSON.parse(boardsText);
const seen = new Map<string, number>(dir.boards.filter((b: any) => b.status === "live").map((b: any) => [`${b.provider}:${String(b.board_token).toLowerCase()}`, Number(b.postings_seen) || 0]));
const postingsOf = (b: Board) => seen.get(`${b.provider}:${b.board.toLowerCase()}`) ?? 0;

// ------------------------------------------------------------------------------------------------ fixture bodies
const WORDS = "Own the roadmap for our data platform, partner with engineering and design, write clear specs, ship in small steps, measure outcomes, and mentor others. You bring five years of experience, strong SQL, and care for the people who use what you build. Benefits include health, dental, vision, a learning budget, and flexible hours. ";
const TEXT = WORDS.repeat(10).slice(0, 3000), HTML = `<p>${TEXT.replace(/, /g, ",</p><p>")}</p>`;
const uuid = (i: number) => `${(0x10000000 + i).toString(16)}-0000-4000-8000-${(0x100000000000 + i).toString(16)}`;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const LIMIT: Record<string, number> = { smartrecruiters: 100, workday: 1000 };
function body(b: Board, k: number): string {
  const n = Math.max(0, Math.min(k, LIMIT[b.provider] ?? 1000)), ids = Array.from({ length: n }, (_, i) => i + 1);
  switch (b.provider) {
    case "greenhouse": return JSON.stringify({ name: b.company, jobs: ids.map((i) => ({ id: 4000000 + i, title: `Product Manager ${i}`, absolute_url: `https://job-boards.greenhouse.io/${b.board}/jobs/${4000000 + i}`,
      location: { name: "New York, NY" }, updated_at: "2026-10-19T00:00:00Z", first_published: "2026-10-18T00:00:00Z", content: HTML.replace(/</g, "&lt;").replace(/>/g, "&gt;"), departments: [{ name: "Product" }] })) });
    case "lever": return JSON.stringify(ids.map((i) => ({ id: uuid(i), text: `Account Executive ${i}`, hostedUrl: `https://jobs.lever.co/${b.board}/${uuid(i)}`,
      categories: { location: "Remote, US", team: "Sales", commitment: "Full-time" }, createdAt: 1760745600000, descriptionPlain: TEXT })));
    case "ashby": return JSON.stringify({ jobs: ids.map((i) => ({ id: uuid(i), title: `Software Engineer ${i}`, jobUrl: `https://jobs.ashbyhq.com/${b.board}/${uuid(i)}`,
      location: "San Francisco", publishedAt: "2026-10-18T00:00:00Z", descriptionPlain: TEXT, departmentName: "Engineering" })) });
    case "smartrecruiters": return JSON.stringify({ totalFound: n, content: ids.map((i) => ({ id: String(744000000000 + i), name: `Store Manager ${i}`, ref: `R${i}`,
      location: { city: "Austin", region: "TX", country: "us" }, releasedDate: "2026-10-18T00:00:00Z", department: { label: "Retail" } })) });
    case "workable": { const t = FIX.workable; return JSON.stringify({ ...t, name: b.company, jobs: ids.map((i) => ({ ...clone(t.jobs[0]), shortcode: `SC${i}X`, url: `https://apply.workable.com/j/SC${i}X`, title: `Backend Engineer ${i}`, description: HTML })) }); }
    case "recruitee": { const t = FIX.recruitee; return JSON.stringify({ offers: ids.map((i) => ({ ...clone(t.offers[0]), id: 900 + i, careers_url: `https://${b.board}.recruitee.com/o/role-${i}`, description: HTML })) }); }
    case "bamboohr": { const t = FIX.bamboohr; return JSON.stringify({ meta: { totalCount: n }, result: ids.map((i) => ({ ...clone(t.result[0]), id: String(40 + i), jobOpeningName: `Payroll Specialist ${i}` })) }); }
    case "breezy": { const t = FIX.breezy; return JSON.stringify(ids.map((i) => ({ ...clone(t[0]), id: `p${i}`, friendly_id: `p${i}-support-lead`, url: `https://${b.board}.breezy.hr/p/p${i}-support-lead`, name: `Support Lead ${i}` }))); }
    case "workday": { const t = FIX.workday; return JSON.stringify({ total: n, facets: [], jobPostings: ids.slice(0, 20).map((i) => ({ ...clone(t.jobPostings[0]), externalPath: `/job/Austin-TX/Store-Associate_R${12345 + i}`, title: `Store Associate ${i}` })) }); }
    case "teamtailor": {
      const item = /<item>[\s\S]*<\/item>/.exec(FIX.teamtailor)![0];
      return FIX.teamtailor.replace(item, ids.map((i) => item.replace("3141592", String(3141592 + i)).replace("8d0c-guid", `g${i}`).replace("<p>Build pipelines & dashboards.</p>", HTML)).join("\n"));
    }
    case "personio": {
      const pos = /<position>[\s\S]*<\/position>/.exec(FIX.personio)![0];
      return FIX.personio.replace(pos, ids.map((i) => pos.replace("<id>1234567</id>", `<id>${1234567 + i}</id>`).replace("<p>Run our Go services.</p>", HTML)).join("\n"));
    }
  }
  throw new Error(`no fixture for ${b.provider}`);
}
// The fixture feed: each board answers its own body (a Workday board pages: the same 20 rows each page, ids repeat).
const cache = new Map<string, string>();
const fixtureFeed = (): FetchFeed => (b: Board) => {
  const k = `${b.provider}:${b.board}`;
  if (!cache.has(k)) cache.set(k, body(b, postingsOf(b)));
  const text = cache.get(k)!;
  // bodyHash: true, as the deployed function reads (career-ingest/index.ts).
  return boardFetchFeed((async () => new Response(text, { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch, { bodyHash: true })(b);
};
// A memory store that pays the database client's serialization (rows out as JSON, rows back parsed).
function serializingDb() {
  const m = memoryPostingsDb();
  return { ...m,
    async getMany(ids: string[]) { return JSON.parse(JSON.stringify(await m.getMany(ids))); },
    async putMany(ps: any[]) { JSON.stringify(ps); return m.putMany(ps); },
    async touch(ids: string[], at: string) { JSON.stringify(ids); return m.touch(ids, at); },
    async recordRun() {}, async recordLaneRun(r: unknown) { JSON.stringify(r); },
  };
}

// ------------------------------------------------------------------------------------------------ one lane, measured
const SECRET = "m".repeat(40), LANES_MEASURED = 64, LANE = 0;
const laneBoards = boards.filter((b) => laneOf(b, LANES_MEASURED) === LANE);
for (const b of laneBoards) cache.set(`${b.provider}:${b.board}`, body(b, postingsOf(b))); // bodies built before the clock starts
const env = { get: (k: string) => ({ CAREER_INGEST_SECRET: SECRET, INGEST_CONTACT_EMAIL: "measure@example.test", INGEST_MAX_BOARDS: "2000", INGEST_CONCURRENCY: "8", INGEST_EVERY_MIN: "15" } as Record<string, string>)[k] };
const db = serializingDb(), state = memoryBoardState();
await state.seed(boards);
async function run(label: string) {
  const t0 = performance.now();
  // window_min = INGEST_EVERY_MIN: one run owes the whole lane, so the run reads every board of it.
  const res = await handleIngest(new Request(`https://fn.test/?lane=${LANE}&lanes=${LANES_MEASURED}&window_min=15`, { method: "POST", headers: { "x-trainee-ingest-secret": SECRET } }),
    { env, boards, now: Date.now, db: () => db as any, state: () => state, fetchFeed: () => fixtureFeed() });
  const ms = performance.now() - t0, out = await res.json();
  console.log(`MEASURED ${label}: ${out.attempted} boards, ${out.new} new / ${out.seen} seen postings in ${ms.toFixed(0)} ms (${(ms / Math.max(1, out.attempted)).toFixed(2)} ms per board)`);
  console.log(`  report: ${out.report?.text}`);
  return { ms, boards: out.attempted as number, postings: (out.new + out.seen) as number, report: out.report };
}
const reset = () => { for (const st of state.rows.values()) if (st.last_attempt_at) st.last_attempt_at = "2000-01-01T00:00:00.000Z"; };
const first = await run("first read of lane 0 of 64 (every posting new: the worst case)");
reset();
const same = await run("second read, every body the same (the body hash matches: nothing parsed)");
// Every board's body changes (one title each): every board is parsed again, every posting seen, one rewritten each.
for (const b of laneBoards) { const k = `${b.provider}:${b.board}`; cache.set(k, cache.get(k)!.replace(/Engineer|Manager|Executive|Associate|Specialist|Lead/, "Lead II")); }
reset();
const changed = await run("third read, every body changed (parsed again; postings seen, mostly unchanged)");
// The fixed cost a cold instance pays per run: parse the directory and key and bucket every board.
const t1 = performance.now(); const parsed = JSON.parse(boardsText); const keys = new Map(parsed.map((b: Board) => [`${b.provider}:${b.board.toLowerCase()}`, b])); bucketCounts(parsed); const fixedMs = performance.now() - t1;
console.log(`MEASURED fixed per cold run: parse ${parsed.length} boards + key and bucket them: ${fixedMs.toFixed(1)} ms (${keys.size} keys)`);

const capOf = (b: Board) => Math.min(postingsOf(b), LIMIT[b.provider] ?? 1000);
const reqOf = (b: Board) => { const k = postingsOf(b); return b.provider === "workday" ? Math.max(1, Math.min(50, Math.ceil(k / 20))) : b.provider === "smartrecruiters" ? Math.max(1, Math.ceil(Math.min(k, 1000) / 100)) : 1; };
const requestsPerBoard = boards.reduce((a, b) => a + reqOf(b), 0) / boards.length;
const hit = same.ms / Math.max(1, same.boards);
const measured = { lane_boards: first.boards, lane_postings: first.postings, first_read_ms: Math.round(first.ms), same_body_read_ms: Math.round(same.ms), changed_body_read_ms: Math.round(changed.ms),
  cpuMsPerBoard: +(Math.max(first.ms, changed.ms) / Math.max(1, first.boards)).toFixed(3), cpuMsPerBoardUnchanged: +hit.toFixed(3),
  cpuMsPerPosting: +((Math.max(first.ms, changed.ms) - same.ms) / Math.max(1, first.postings)).toFixed(3), cpuMsPerRun: Math.ceil(fixedMs),
  postingsTotal: boards.reduce((a, b) => a + capOf(b), 0), requestsPerBoard: +requestsPerBoard.toFixed(3),
  machine: `${Deno.build.os} ${Deno.build.arch}, ${navigator.hardwareConcurrency} cores, deno ${Deno.version.deno} (this sandbox; the Edge runtime's CPU is not measured here)` };
const assumed = { latencyMs: 600, changedShare: 0.25, note: "latency: network time per request, not measurable offline; changedShare: boards whose body changes between two reads an hour apart, not measured until ingest runs live" };
const plan = planLanes({ boards, windowMin: 60, intervalMin: 5, measured, assumed, concurrency: 8, limits: { cpuMs: 2000, deadlineS: 100, wallS: 150 } });
if (!plan.ok) { console.error(`NO PLAN: ${plan.reason}`); console.error(JSON.stringify(plan.tried.slice(-3))); Deno.exit(1); }
const sims = [[0, 0], [0.05, 0.05], [0.1, 0.1]].map(([lose, cut]) => {
  const r = simulateFreshness({ boards, lanes: plan.lanes, windowMin: 60, intervalMin: 5, hours: 6, lose, cut, seed: 6 });
  return { hours: 6, lose, cut, worst_age_min: r.worst_age_min, every_board_read: r.every_board_read };
});
console.log(`PLAN ${plan.boards} boards, read within ${plan.window_min} min: ${plan.lanes} lanes every ${plan.interval_min} min; each run up to ${plan.capacity_per_run} boards, ${plan.cpu_ms_per_run} ms CPU (budget ${2000 * plan.cpu_budget}), ${plan.wall_s_per_run} s wall (deadline 100 s); posting budget ${plan.posting_budget} a run; ${plan.invocations_per_hour} invocations and ${plan.requests_per_hour} ATS requests an hour; first full coverage after about ${plan.first_coverage_hours} h`);
for (const r of sims) console.log(`SIMULATED 6 h, runs lost ${r.lose * 100}% and cut short ${r.cut * 100}%: oldest read ${r.worst_age_min} min; every board read: ${r.every_board_read}`);
if (Deno.args.includes("--write")) {
  const { tried: _t, ...keep } = plan;
  const out = { generated_by: "scripts/career/measure-ingest-lane.ts", directory_boards: boards.length, measured, assumed,
    limits: { cpuMs: 2000, deadlineS: 100, wallS: 150, source: "supabase.com/docs/guides/functions/limits (2 s CPU per request; 150 s wall free, 400 s paid)" },
    plan: keep, simulated: sims };
  await Deno.writeTextFile(new URL("packages/career-data/ingest-lane-plan.json", root), JSON.stringify(out, null, 1) + "\n");
  console.log("wrote packages/career-data/ingest-lane-plan.json");
}
