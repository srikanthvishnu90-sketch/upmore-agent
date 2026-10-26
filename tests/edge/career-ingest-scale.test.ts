// Feature 6 (2026-10-25): the live job index at scale. Over fixture feeds (no network, no database): the directory holds
// only boards discovery verified; the URL-shape guard keeps junk links out at ingest; a run of the real scheduled handler
// reads its lane over every provider's reader and records a report with coverage fractions and failure reasons; a body
// equal to the last read is not parsed again; a posting budget bounds a run's CPU; and lanes driven every 5 minutes read
// every board within the hour. Run: deno test -A --no-check tests/edge/career-ingest-scale.test.ts
import { boardFetchFeed, ingestBoards, INGEST_PROVIDERS, memoryPostingsDb, urlShape, type Board, type FeedPosting, type IngestRunRow } from "../../supabase/functions/_shared/career_ingest.ts";
import { bucketOf as tsBucketOf, memoryBoardState } from "../../supabase/functions/_shared/career_shards.ts";
import { bucketOf, laneOf, runReport } from "../../supabase/functions/_shared/career_ingest_lanes.mjs";
import { handleIngest } from "../../supabase/functions/career-ingest/handler.ts";
import { FIX } from "../architect/wo-044-fixtures.ts";
import directory from "../../packages/career-data/board-directory.json" with { type: "json" };
import shipped from "../../supabase/functions/career-ingest/boards.json" with { type: "json" };

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const T0 = Date.UTC(2026, 9, 26, 6, 2), MIN = 60000;
const SECRET = "f".repeat(40);
const envOf = (m: Record<string, string> = {}) => ({ get: (k: string) => ({ CAREER_INGEST_SECRET: SECRET, INGEST_CONTACT_EMAIL: "ops@example.test", ...m } as Record<string, string>)[k] });
const post = (q: string) => new Request(`https://fn.test/${q}`, { method: "POST", headers: { "x-trainee-ingest-secret": SECRET } });

// ------------------------------------------------------------------------------------------------ fixture feeds
// One body per provider: the recorded shapes of tests/edge/career-ingest.test.ts for the first four, WO-044's
// hand-written public shapes for the other seven.
const BODY: Record<string, string> = {
  greenhouse: JSON.stringify({ jobs: [{ id: 555001, title: "Software Engineer", location: { name: "San Francisco, CA" }, absolute_url: "https://boards.greenhouse.io/acme/jobs/555001", updated_at: "2026-10-10T00:00:00Z", content: "Python" }] }),
  lever: JSON.stringify([{ id: "lev-1", text: "Analyst", categories: { location: "Chicago, IL" }, hostedUrl: "https://jobs.lever.co/acme/lev-1", createdAt: Date.parse("2026-10-11T00:00:00Z"), descriptionPlain: "Modeling." }]),
  ashby: JSON.stringify({ jobs: [{ id: "ash-1", title: "Intern", location: "New York, NY", jobUrl: "https://jobs.ashbyhq.com/acme/ash-1", publishedAt: "2026-10-11T00:00:00Z", descriptionPlain: "Python." }] }),
  smartrecruiters: JSON.stringify({ totalFound: 1, content: [{ id: "744000001", name: "Store Manager", location: { city: "Ann Arbor", region: "MI", country: "US" }, releasedDate: "2026-10-08T00:00:00Z" }] }),
  workable: JSON.stringify(FIX.workable), recruitee: JSON.stringify(FIX.recruitee), bamboohr: JSON.stringify(FIX.bamboohr),
  teamtailor: FIX.teamtailor, breezy: JSON.stringify(FIX.breezy), personio: FIX.personio, workday: JSON.stringify(FIX.workday),
};
const HOST: [RegExp, string][] = [[/greenhouse\.io/, "greenhouse"], [/lever\.co/, "lever"], [/ashbyhq\.com/, "ashby"], [/smartrecruiters\.com/, "smartrecruiters"],
  [/workable\.com/, "workable"], [/recruitee\.com/, "recruitee"], [/bamboohr\.com/, "bamboohr"], [/teamtailor\.com/, "teamtailor"], [/breezy\.hr/, "breezy"],
  [/personio\./, "personio"], [/myworkdayjobs\.com/, "workday"]];
// A fake ATS: boards named "gone*" answer 404, "slow*" time out; a body can be overridden per board.
function fakeAts(over: Map<string, string> = new Map()) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    if (/gone/.test(url)) return new Response("{}", { status: 404 });
    if (/slow/.test(url)) throw new DOMException("The signal has been aborted", "TimeoutError");
    for (const [k, v] of over) if (url.includes(k)) return new Response(v, { status: 200 });
    const p = HOST.find(([re]) => re.test(url))?.[1];
    return new Response(p ? BODY[p] : "{}", { status: p ? 200 : 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const boardOf = (provider: string, i: number): Board => ({ company: `Acme ${provider} ${i}`, provider, board: provider === "workday" ? `acme${i}.wd5/External` : `acme${provider}${i}` });
function runLog() {
  const rows: IngestRunRow[] = [];
  const db = memoryPostingsDb();
  return { rows, db: Object.assign(db, { async recordRun() {}, async recordLaneRun(r: IngestRunRow) { rows.push(r); } }) };
}

// ------------------------------------------------------------------------------------------------ the directory
Deno.test("F6/D1 the board directory holds only verified boards: 27,751 live on eleven ATSs, counted per ATS, the shipped list exactly that set", () => {
  const dir = directory as any;
  const live = dir.boards.filter((b: any) => b.status === "live");
  eq(shipped.length, live.length, "shipped list = live set");
  assert(shipped.length >= 27000, `only ${shipped.length} boards`);
  const per: Record<string, number> = {};
  for (const b of shipped as Board[]) per[b.provider] = (per[b.provider] ?? 0) + 1;
  for (const [p, c] of Object.entries(dir.meta.f06_merge.by_ats as Record<string, { live: number }>)) eq(per[p], c.live, `${p} count recorded`);
  eq(Object.keys(per).sort(), [...INGEST_PROVIDERS].sort(), "every provider ingest reads, and only those");
  // Every board added by the merge was verified: its source is a discovery source and it has a verification date.
  for (const b of live) assert(/^\d{4}-\d{2}-\d{2}$/.test(String(b.last_verified)), `${b.provider}:${b.board_token} never verified`);
  eq(dir.meta.f06_merge.run, "39433413503");
  assert(dir.meta.f06_merge.dropped["verdict dead"] > 0 && dir.meta.f06_merge.dropped["verdict blocked_by_robots"] > 0, "unverified rows are counted as dropped");
});

Deno.test("F6/D2 the lane math in plain JS buckets every shipped board exactly as the ingest function does", () => {
  for (const b of shipped as Board[]) if (bucketOf(b) !== tsBucketOf(b)) throw new Error(`bucket differs for ${b.provider}:${b.board}`);
});

Deno.test("F6/D3 the ingest copy of the URL-shape guard is module 166 byte for byte", async () => {
  const a = await Deno.readTextFile(new URL("../../packages/domain/166-career-url-shape.js", import.meta.url));
  const b = await Deno.readTextFile(new URL("../../supabase/functions/_shared/career_url_shape.js", import.meta.url));
  assert(a === b, "stale: cp packages/domain/166-career-url-shape.js supabase/functions/_shared/career_url_shape.js");
});

// ------------------------------------------------------------------------------------------------ the guard at ingest
Deno.test("F6/G1 junk links never enter the postings table; a junk row stored before closes on the next complete read", async () => {
  const b: Board = { company: "Acme", provider: "greenhouse", board: "acme" };
  const row = (id: string, url: string): FeedPosting => ({ job_id: `greenhouse:acme:${id}`, company: "Acme", title: `Role ${id}`, url });
  const feed = [
    row("1", "https://boards.greenhouse.io/acme/jobs/4012345"),                       // posting
    row("2", "https://careers.acme.test/openings/data-analyst"),                      // unknown: kept, counted
    row("3", "https://data.cityofnewyork.us/resource/kpav-sd4t.json?job_id=7"),        // data endpoint
    row("4", "https://news.ycombinator.com/item?id=4100001"),                         // discussion thread
    row("5", "https://boards.greenhouse.io/acme"),                                    // board root
    row("6", "https://acme.test/jobs/search?q=analyst"),                              // search page
  ];
  const db = memoryPostingsDb();
  await db.put({ ...row("4", "https://news.ycombinator.com/item?id=4100001"), provider: "greenhouse", board: "acme", first_seen_at: "2026-10-01T00:00:00Z", last_seen_at: "2026-10-01T00:00:00Z", closed_at: null });
  const st = await ingestBoards({ boards: [b], db, now: T0, fetchFeed: async () => feed });
  eq((await db.open()).map((p) => p.job_id).sort(), ["greenhouse:acme:1", "greenhouse:acme:2"]);
  eq([st.new, st.url_rejected, st.url_unknown, st.closed], [2, 4, 1, 1]);
  eq(st.url_rejected_shapes, { api_endpoint: 1, thread: 1, search_or_listing: 2 });
  eq(urlShape("https://boards.greenhouse.io/acme/jobs/4012345").verdict, "posting");
  // Every fixture link of every provider's reader passes the guard (a real posting is never refused).
  for (const p of INGEST_PROVIDERS) {
    const r = await boardFetchFeed(fakeAts().f)(boardOf(p, 0));
    const list = Array.isArray(r) ? r : r.postings;
    assert(list.length >= 1, `${p}: no postings from its fixture`);
    for (const x of list) assert(urlShape(x.url).verdict !== "not_posting", `${p}: ${x.url} refused`);
  }
});

// ------------------------------------------------------------------------------------------------ one lane run, reported
Deno.test("F6/R1 a lane run over every provider's reader records a report: boards read of due, failures by reason, postings, coverage fractions", async () => {
  const boards = [...INGEST_PROVIDERS.map((p) => boardOf(p, 1)), { company: "Gone", provider: "lever", board: "gone1" }, { company: "Gone", provider: "ashby", board: "gone2" }, { company: "Slow", provider: "greenhouse", board: "slow1" }];
  const lanes = 2, lane = laneOf(boards[0], lanes);
  const mine = boards.filter((b) => laneOf(b, lanes) === lane);
  const { rows, db } = runLog(), st = memoryBoardState(), ats = fakeAts();
  // INGEST_LANES / INGEST_WINDOW_HOURS say 1 lane and 6 h; the schedule's URL wins. One run an hour owes the whole lane.
  const res = await handleIngest(post(`?lane=${lane}&lanes=${lanes}&window_min=60`), {
    env: envOf({ INGEST_LANES: "1", INGEST_WINDOW_HOURS: "6", INGEST_EVERY_MIN: "60" }), boards, now: () => T0, db: () => db, state: () => st,
    fetchFeed: () => boardFetchFeed(ats.f, { bodyHash: true }) });
  const out = await res.json();
  eq([res.status, out.shard.lanes, out.shard.lane, out.shard.window_min], [200, 2, lane, 60]);
  eq(out.attempted, mine.length, "the whole lane was due (never read) and read");
  const failed = mine.filter((b) => /gone|slow/.test(b.board)).length;
  eq(out.boards_failed, failed);
  const r = out.report;
  assert(r.text.includes(`boards read ${mine.length}/${mine.length} due`), r.text);
  assert(r.text.includes(`read within 60 min: lane ${mine.length - failed}/${mine.length}, directory ${mine.length - failed}/${boards.length}`), r.text);
  const reasons: Record<string, number> = {};
  for (const b of mine) if (/gone/.test(b.board)) reasons["HTTP 404"] = (reasons["HTTP 404"] ?? 0) + 1; else if (/slow/.test(b.board)) reasons["timed out"] = (reasons["timed out"] ?? 0) + 1;
  eq(r.failure_reasons, reasons);
  eq(r.directory_fresh_fraction, +((mine.length - failed) / boards.length).toFixed(4));
  // The run log row (career_ingest_runs) holds the same accounting.
  eq(rows.length, 1);
  const row = rows[0];
  eq([row.lane, row.lanes, row.window_min, row.boards_due, row.boards_read, row.boards_ok + row.boards_failed, row.lane_fresh, row.lane_total, row.directory_total],
    [lane, 2, 60, mine.length, mine.length, mine.length, mine.length - failed, mine.length, boards.length]);
  eq(row.postings_new, out.new);
  assert(row.report === r.text && row.failures.length === failed, "the logged report and failures");
});

// ------------------------------------------------------------------------------------------------ CPU: body hash, budget
Deno.test("F6/C1 a board whose body is the same as its last read is not parsed again; a changed body is, and its new posting is new", async () => {
  const boards = INGEST_PROVIDERS.filter((p) => p !== "smartrecruiters" && p !== "workday").map((p) => boardOf(p, 2)); // the one-request feeds
  const { db } = runLog(), st = memoryBoardState(), over = new Map<string, string>(), ats = fakeAts(over);
  const call = (t: number) => handleIngest(post("?lane=0&lanes=1&window_min=15"), { env: envOf({ INGEST_EVERY_MIN: "15" }), boards, now: () => t, db: () => db, state: () => st,
    fetchFeed: () => boardFetchFeed(ats.f, { bodyHash: true }) }).then((r) => r.json());
  const one = await call(T0);
  eq([one.boards_ok, one.boards_not_modified ?? 0, one.new], [boards.length, 0, boards.length]);
  for (const s of st.rows.values()) assert(/^[0-9a-f]{64}$/.test(String(s.body_sha)), `${s.provider}: no body hash kept`);
  const two = await call(T0 + 20 * MIN);
  eq([two.boards_ok, two.boards_not_modified, two.postings_read ?? 0, two.new], [boards.length, boards.length, 0, 0], "nothing parsed");
  // Lever's body changes: a second posting appears. Only that board is parsed.
  over.set("api.lever.co", JSON.stringify([...JSON.parse(BODY.lever), { id: "lev-2", text: "Associate", categories: { location: "Austin, TX" }, hostedUrl: "https://jobs.lever.co/acme/lev-2", createdAt: Date.parse("2026-10-20T00:00:00Z"), descriptionPlain: "x" }]));
  const three = await call(T0 + 40 * MIN);
  eq([three.boards_not_modified, three.postings_read, three.new], [boards.length - 1, 2, 1]);
  // Without bodyHash (the old path), nothing changes: every read is parsed.
  const plain = await boardFetchFeed(ats.f)(boards[0]);
  assert(Array.isArray(plain), "the default reader still answers a plain list");
});

Deno.test("F6/C2 a posting budget stops a run from starting boards once that many postings were parsed; the rest are read next run", async () => {
  const boards = Array.from({ length: 6 }, (_, i) => ({ company: `B${i}`, provider: "greenhouse", board: `b${i}` }));
  const feed = async (b: Board): Promise<FeedPosting[]> => [1, 2].map((k) => ({ job_id: `greenhouse:${b.board}:${k}`, company: b.company, title: `T${k}`, url: `https://boards.greenhouse.io/${b.board}/jobs/${40000 + k}` }));
  const { db } = runLog(), st = memoryBoardState();
  const call = (t: number) => handleIngest(post("?lane=0&lanes=1&window_min=15&posting_budget=3"), { env: envOf({ INGEST_EVERY_MIN: "15", INGEST_CONCURRENCY: "1" }), boards, now: () => t, db: () => db, state: () => st,
    fetchFeed: () => feed }).then((r) => r.json());
  const one = await call(T0);
  eq([one.attempted, one.postings_read, one.stopped_by, one.shard.posting_budget], [2, 4, "posting_budget", 3]);
  assert(one.report.text.includes("stopped by the posting budget: 4 boards left for the next run"), one.report.text);
  const two = await call(T0 + 5 * MIN), three = await call(T0 + 10 * MIN);
  eq([two.attempted, three.attempted], [2, 2]);
  eq([...st.rows.values()].filter((s) => s.last_ok_at).length, 6, "every board read across three runs");
});

// ------------------------------------------------------------------------------------------------ hourly, end to end
Deno.test("F6/H1 lanes called every 5 minutes read every board within the hour: after the first hour every report counts the directory fresh", async () => {
  const boards = Array.from({ length: 330 }, (_, i) => boardOf(INGEST_PROVIDERS[i % INGEST_PROVIDERS.length], 100 + i));
  const lanes = 3, { rows, db } = runLog(), st = memoryBoardState(), ats = fakeAts();
  const fetchFeed = () => boardFetchFeed(ats.f, { bodyHash: true });
  let worst = 0;
  for (let t = T0; t < T0 + 3 * 60 * MIN; t += 5 * MIN) {
    for (let lane = 0; lane < lanes; lane++) {
      const r = await handleIngest(post(`?lane=${lane}&lanes=${lanes}&window_min=60`), { env: envOf(), boards, now: () => t + lane, db: () => db, state: () => st, fetchFeed });
      eq(r.status, 200);
    }
    if (t >= T0 + 60 * MIN) for (const s of st.rows.values()) worst = Math.max(worst, t + 5 * MIN - Date.parse(String(s.last_ok_at)));
  }
  assert(worst <= 60 * MIN, `a board waited ${worst / MIN} min`);
  const late = rows.filter((r) => Date.parse(r.at) >= T0 + 60 * MIN);
  assert(late.length > 0 && late.every((r) => r.directory_fresh === boards.length && r.directory_total === boards.length), "every report after the first hour: directory fresh = all");
  assert(late.every((r) => r.lane_fresh === r.lane_total), "and every lane fresh");
});

Deno.test("F6/R2 the report reads plainly and its fractions add up", () => {
  const r = runReport({ lane: 3, lanes: 32, due: 120, windowMin: 60, coverage: { lane: { fresh: 860, total: 868 }, directory: { fresh: 27100, total: 27751 } },
    stats: { attempted: 118, boards_ok: 115, boards_failed: 3, boards_not_modified: 80, boards_partial: 0, new: 9812, seen: 4100, reopened: 2, closed: 12, url_rejected: 4,
      failures: [{ board: "a", provider: "lever", error: "HTTP 404" }, { board: "b", provider: "lever", error: "HTTP 404" }, { board: "c", provider: "ashby", error: "timed out after 15s" }] } });
  eq(r.text, "lane 3 of 32; boards read 118/120 due; ok 115 (80 unchanged since the last read); failed 3 (HTTP 404 x2, timed out x1); postings new 9,812, seen 4,100, reopened 2, closed 12; not job links, refused 4; read within 60 min: lane 860/868, directory 27,100/27,751");
  eq([r.read_fraction, r.lane_fresh_fraction, r.directory_fresh_fraction], [0.9833, 0.9908, 0.9765]);
});
