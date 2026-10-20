// WO-006 builder tests: the feed adapter over recorded ATS shapes, the write economy (unchanged postings are not
// rewritten), the run's deadline and concurrency, the scheduled function's door, the shipped board list, and job search
// ranked by fit. No network: fetch is a fake. Run: deno test -A --no-check tests/edge/career-ingest.test.ts
import { boardFetchFeed, directoryBoards, INGEST_PROVIDERS, ingestBoards, memoryPostingsDb, searchWords, type Board } from "../../supabase/functions/_shared/career_ingest.ts";
import { searchPostings } from "../../supabase/functions/_shared/career_search.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { handleIngest } from "../../supabase/functions/career-ingest/handler.ts";
import { CareerProfile } from "../../supabase/functions/_shared/router_core.career.js";
import directory from "../../packages/career-data/board-directory.json" with { type: "json" };
import shipped from "../../supabase/functions/career-ingest/boards.json" with { type: "json" };

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
async function rejects(f: () => Promise<unknown>, re: RegExp) { try { await f(); } catch (e) { assert(re.test(String((e as Error).message)), `wrong error: ${(e as Error).message}`); return; } throw new Error("did not reject"); }
const T0 = Date.UTC(2026, 9, 19, 12), H = 3600000;
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function fakeFetch(routes: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const f = (async (url: string, init?: RequestInit) => { calls.push({ url, headers: (init?.headers || {}) as Record<string, string> }); return await routes(url); }) as unknown as typeof fetch;
  return { f, calls };
}

// Recorded shapes (tests/career-jobs.test.cjs, from real board responses).
const GH = { jobs: [
  { id: 555001, title: "Software Engineer, New Grad", location: { name: "San Francisco, CA" }, absolute_url: "https://boards.greenhouse.io/stripe/jobs/555001", updated_at: "2026-10-10T00:00:00Z", requisition_id: "See Opening ID", departments: [{ name: "Engineering" }], content: "&lt;p&gt;Join our team building payments in Python &amp;amp; React.&lt;/p&gt;" },
  // The same requisition posted in two cities: two postings, two ids (a requisition id is not a posting id).
  { id: 555002, title: "Data Analyst", location: { name: "New York, NY" }, absolute_url: "https://boards.greenhouse.io/stripe/jobs/555002", updated_at: "2026-10-11T00:00:00Z", requisition_id: "REQ-7", content: "SQL" },
  { id: 555003, title: "Data Analyst", location: { name: "Chicago, IL" }, absolute_url: "https://boards.greenhouse.io/stripe/jobs/555003", updated_at: "2026-10-11T00:00:00Z", requisition_id: "REQ-7", content: "SQL" },
] };
const LEVER = [{ id: "lev-1", text: "Investment Banking Analyst", categories: { location: "Chicago, IL", team: "Finance" }, hostedUrl: "https://jobs.lever.co/palantir/lev-1", createdAt: Date.parse("2026-10-11T00:00:00Z"), descriptionPlain: "Financial modeling." }];
const ASHBY = { jobs: [{ id: "ash-1", title: "Software Engineering Intern", location: "New York, NY", departmentName: "Engineering", jobUrl: "https://jobs.ashbyhq.com/ramp/ash-1", publishedAt: "2026-10-11T00:00:00Z", descriptionPlain: "Internship. Python." }] };
const srJob = (i: number) => ({ id: `sr-${i}`, name: `Store Manager ${i}`, company: { name: "Domino's" }, location: { city: "Ann Arbor", region: "MI", country: "US" }, ref: "SAME-REF", releasedDate: "2026-10-08T00:00:00Z" });

Deno.test("WO-006/B1 Greenhouse: ids are the ATS's own (provider:board:id), the stated company, text decoded, the user agent sent", async () => {
  const { f, calls } = fakeFetch(() => res(GH));
  const out = await boardFetchFeed(f, { userAgent: "Trainee job alerts (contact: ops@example.test)" })({ company: "Stripe", provider: "greenhouse", board: "stripe" }) as any[];
  eq(out.map((p) => p.job_id), ["greenhouse:stripe:555001", "greenhouse:stripe:555002", "greenhouse:stripe:555003"], "a shared requisition never merges two postings");
  eq(out[0].company, "Stripe");
  eq(out[0].ats_id, "555001");
  eq(out[0].url, "https://boards.greenhouse.io/stripe/jobs/555001");
  assert(out[0].description.includes("Python & React") && !out[0].description.includes("<p>"), `decoded: ${out[0].description}`);
  eq(calls[0].url, "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true");
  eq(calls[0].headers["user-agent"], "Trainee job alerts (contact: ops@example.test)");
});

Deno.test("WO-006/B1b a row the table would refuse never reaches it: no https link, no title, an overlong title", async () => {
  const jobs = [
    { id: "ok", text: "Analyst", hostedUrl: "https://jobs.lever.co/a/ok", categories: {} },
    { id: "http", text: "Analyst", hostedUrl: "http://jobs.lever.co/a/http", categories: {} },
    { id: "untitled", text: "", hostedUrl: "https://jobs.lever.co/a/untitled", categories: {} },
    { id: "long", text: "A".repeat(900), hostedUrl: "https://jobs.lever.co/a/long", categories: { location: "L".repeat(1500) } },
  ];
  const out = await boardFetchFeed(fakeFetch(() => res(jobs)).f)({ company: "A", provider: "lever", board: "a" }) as any[];
  eq(out.map((p) => p.ats_id), ["ok", "long"]);
  eq([out[1].title.length, out[1].location.length], [500, 1000], "clipped to the columns' limits");
});

Deno.test("WO-006/B2 Lever and Ashby map to the same shape", async () => {
  const lever = await boardFetchFeed(fakeFetch(() => res(LEVER)).f)({ company: "Palantir", provider: "lever", board: "palantir" }) as any[];
  eq([lever[0].job_id, lever[0].company, lever[0].title, lever[0].url], ["lever:palantir:lev-1", "Palantir", "Investment Banking Analyst", "https://jobs.lever.co/palantir/lev-1"]);
  const ashby = await boardFetchFeed(fakeFetch(() => res(ASHBY)).f)({ company: "Ramp", provider: "ashby", board: "ramp" }) as any[];
  eq([ashby[0].job_id, ashby[0].location, ashby[0].description], ["ashby:ramp:ash-1", "New York, NY", "Internship. Python."]);
});

Deno.test("WO-006/B3 SmartRecruiters is paged; a board past 1,000 postings is a partial read that closes nothing", async () => {
  const small = fakeFetch((url) => { const off = Number(new URL(url).searchParams.get("offset")); return res({ totalFound: 230, content: Array.from({ length: Math.max(0, Math.min(100, 230 - off)) }, (_, i) => srJob(off + i)) }); });
  const r = await boardFetchFeed(small.f)({ company: "Domino's", provider: "smartrecruiters", board: "DominoS" }) as any[];
  assert(Array.isArray(r) && r.length === 230 && small.calls.length === 3, "all three pages read");
  eq(r[0].job_id, "smartrecruiters:dominos:sr-0", "ids are the ATS's own, never the shared ref");
  const big = fakeFetch((url) => { const off = Number(new URL(url).searchParams.get("offset")); return res({ totalFound: 24868, content: Array.from({ length: 100 }, (_, i) => srJob(off + i)) }); });
  const p = await boardFetchFeed(big.f)({ company: "Domino's", provider: "smartrecruiters", board: "DominoS" }) as any;
  eq([p.complete, p.postings.length, big.calls.length], [false, 1000, 10]);
  // Through a run: the partial read adds and refreshes, and never closes a posting it did not reach.
  const db = memoryPostingsDb(), b: Board = { company: "Domino's", provider: "smartrecruiters", board: "DominoS" };
  await db.putMany([{ job_id: "smartrecruiters:dominos:sr-99999", company: "Domino's", title: "Driver", url: "https://x/1", provider: b.provider, board: b.board, first_seen_at: new Date(T0 - H).toISOString(), last_seen_at: new Date(T0 - H).toISOString(), closed_at: null }]);
  const st = await ingestBoards({ boards: [b], db, now: T0, fetchFeed: boardFetchFeed(big.f) });
  eq([st.boards_partial, st.new, st.closed], [1, 1000, 0]);
});

Deno.test("WO-006/B4 HTTP errors and slow boards fail the board with the reason", async () => {
  await rejects(() => boardFetchFeed(fakeFetch(() => res({}, 503)).f)({ company: "A", provider: "greenhouse", board: "a" }), /HTTP 503/);
  await rejects(() => boardFetchFeed(fakeFetch(() => res({}, 429)).f)({ company: "A", provider: "lever", board: "a" }), /HTTP 429/);
  const hang = ((_u: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("The signal has been aborted", "TimeoutError"))))) as unknown as typeof fetch;
  await rejects(() => boardFetchFeed(hang, { timeoutMs: 50 })({ company: "A", provider: "ashby", board: "a" }), /timed out after 0.05s/);
  // WO-044 reads Workday; a provider no reader knows is still refused.
  await rejects(() => boardFetchFeed(fakeFetch(() => res({})).f)({ company: "A", provider: "someats", board: "a" }), /not supported/);
});

Deno.test("WO-006/B5 an unchanged posting is only touched (and not even that inside touchAfterMs); a changed one is rewritten", async () => {
  const b: Board = { company: "Stripe", provider: "greenhouse", board: "stripe" };
  const writes: number[] = [], touches: number[] = [];
  const mem = memoryPostingsDb();
  const db = { ...mem, putMany: async (ps: any[]) => { writes.push(ps.length); await mem.putMany(ps); }, touch: async (ids: string[], at: string) => { touches.push(ids.length); await mem.touch(ids, at); } };
  const feed = (title: string) => async () => [{ job_id: "greenhouse:stripe:1", company: "Stripe", title, url: "https://x/1", description: "d", posted_at: "2026-10-10T00:00:00.000Z" }];
  await ingestBoards({ boards: [b], db, now: T0, fetchFeed: feed("Analyst") });
  // Postgres returns its own timestamp format; the same instant is not a change.
  await mem.putMany([{ ...(await mem.get("greenhouse:stripe:1"))!, posted_at: "2026-10-10T00:00:00+00:00" }]);
  eq([writes, touches], [[1], []], "the first run writes the posting");
  writes.length = 0;
  await ingestBoards({ boards: [b], db, now: T0 + H, fetchFeed: feed("Analyst"), touchAfterMs: 6 * H });
  eq([writes, touches], [[], []], "seen an hour later, unchanged: nothing written");
  await ingestBoards({ boards: [b], db, now: T0 + 7 * H, fetchFeed: feed("Analyst"), touchAfterMs: 6 * H });
  eq([writes, touches], [[], [1]], "seven hours later: last_seen_at only");
  eq((await mem.get("greenhouse:stripe:1"))!.last_seen_at, new Date(T0 + 7 * H).toISOString());
  await ingestBoards({ boards: [b], db, now: T0 + 8 * H, fetchFeed: feed("Senior Analyst"), touchAfterMs: 6 * H });
  eq(writes[writes.length - 1], 1, "a changed title is rewritten");
  eq((await mem.get("greenhouse:stripe:1"))!.first_seen_at, new Date(T0).toISOString(), "and first_seen_at never moves");
});

Deno.test("WO-006/B6 the deadline: boards not started wait for the next run, and the cursor moves only past boards attempted", async () => {
  const boards = ["a", "b", "c", "d"].map((x) => ({ company: x, provider: "greenhouse", board: x }));
  const db = memoryPostingsDb(), seen: string[] = [];
  let clock = 0;
  const feed = async (b: Board) => { seen.push(b.board); clock += 60; return []; };
  const st = await ingestBoards({ boards, db, now: T0, fetchFeed: feed, deadline: 100, clock: () => clock });
  eq([st.attempted, seen], [2, ["a", "b"]]);
  eq(await db.getCursor(), 2);
});

Deno.test("WO-006/B7 concurrency: at most N boards in flight, every board read once", async () => {
  const boards = Array.from({ length: 10 }, (_, i) => ({ company: `c${i}`, provider: "lever", board: `c${i}` }));
  let inFlight = 0, peak = 0;
  const seen: string[] = [];
  const feed = async (b: Board) => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; seen.push(b.board); return []; };
  const st = await ingestBoards({ boards, db: memoryPostingsDb(), now: T0, fetchFeed: feed, concurrency: 3 });
  eq([peak, st.attempted, new Set(seen).size], [3, 10, 10]);
});

Deno.test("WO-006/B8 the shipped board list is the directory's live set: at least 2,179 boards (WO-017), no ATS vendor or demo board, no duplicate", () => {
  eq(shipped, directoryBoards(directory as any), "stale: run deno run -A scripts/build-ingest-boards.ts");
  // WO-044: a merged discovery run grows the list; it never shrinks below WO-017's 2,179.
  assert(shipped.length >= 2179, `shipped ${shipped.length} boards`);
  const keys = shipped.map((b: Board) => `${b.provider}:${b.board.toLowerCase()}`);
  eq(new Set(keys).size, keys.length);
  for (const k of ["lever:leverdemo", "greenhouse:greenhouse", "ashby:ashby", "smartrecruiters:palantir"]) assert(!keys.includes(k), `${k} must not ship`);
  assert(shipped.every((b: Board) => INGEST_PROVIDERS.includes(b.provider)), "only providers the feed adapter reads");
});

const env = (m: Record<string, string>) => ({ get: (k: string) => m[k] });
const SECRET = "x".repeat(24) + "-ingest-secret-test";
function deps(over: Partial<Parameters<typeof handleIngest>[1]> = {}, envMap: Record<string, string> = { CAREER_INGEST_SECRET: SECRET, INGEST_CONTACT_EMAIL: "ops@example.test" }) {
  const runs: any[] = [];
  const mem = memoryPostingsDb();
  const d = { env: env(envMap), boards: [{ company: "Stripe", provider: "greenhouse", board: "stripe" }], now: () => T0,
    db: () => ({ ...mem, recordRun: async (s: any, at: string) => { runs.push({ s, at }); } }),
    fetchFeed: (ua: string) => async () => [{ job_id: "greenhouse:stripe:1", company: "Stripe", title: ua, url: "https://x/1" }], ...over };
  return { d, runs, mem };
}
const post = (secret?: string) => new Request("https://fn.test/career-ingest", { method: "POST", headers: secret ? { "x-trainee-ingest-secret": secret } : {} });

Deno.test("WO-006/B9 the scheduled function: POST with the secret only, not configured is said, stats recorded every run", async () => {
  eq((await handleIngest(new Request("https://fn.test/", { method: "GET" }), deps().d)).status, 405);
  eq((await handleIngest(post(SECRET), deps({}, { INGEST_CONTACT_EMAIL: "ops@example.test" }).d)).status, 503, "no secret set: not configured");
  eq((await handleIngest(post("short"), deps({}, { CAREER_INGEST_SECRET: "short", INGEST_CONTACT_EMAIL: "ops@example.test" }).d)).status, 503, "a guessable secret is not a configuration");
  eq((await handleIngest(post("wrong"), deps().d)).status, 401);
  eq((await handleIngest(post(), deps().d)).status, 401);
  const noContact = await handleIngest(post(SECRET), deps({}, { CAREER_INGEST_SECRET: SECRET }).d);
  eq(noContact.status, 503);
  assert(/INGEST_CONTACT_EMAIL/.test((await noContact.json()).error), "says which setting is missing");
  const { d, runs, mem } = deps();
  const r = await handleIngest(post(SECRET), d);
  eq(r.status, 200);
  const body = await r.json();
  eq([body.boards_ok, body.new, body.directory], [1, 1, 1]);
  eq(runs.length, 1, "the run's stats are recorded");
  eq((await mem.get("greenhouse:stripe:1"))!.title, "Trainee job alerts (contact: ops@example.test)", "boards are told who is reading them");
  const broken = deps({ db: () => ({ ...memoryPostingsDb(), getMany: async () => { throw new Error("read postings: relation does not exist"); }, recordRun: async () => {} }) });
  const e = await handleIngest(post(SECRET), broken.d);
  eq(e.status, 500, "a storage failure is a failure, never a partial success");
});

// ------------------------------------------------------------------------------------------------ search
const POOL = [
  { job_id: "g:a:1", company: "Stripe", title: "Data Analyst", location: "Remote - US", url: "https://x/1", description: "Write SQL, build Tableau dashboards, partner with sales on reporting.", first_seen_at: "2026-10-19T10:00:00Z" },
  { job_id: "g:a:2", company: "Ramp", title: "Account Executive", location: "New York, NY", url: "https://x/2", description: "Sell software to finance teams.", first_seen_at: "2026-10-19T12:00:00Z" },
  { job_id: "g:a:3", company: "Mount Sinai", title: "Registered Nurse - ICU", location: "New York, NY", url: "https://x/3", description: "Active New York RN license required.", first_seen_at: "2026-10-19T13:00:00Z" },
  { job_id: "g:a:4", company: "Datadog", title: "Senior Data Analyst", location: "Remote", url: "https://x/4", description: "SQL. 8+ years of experience required.", first_seen_at: "2026-10-19T11:00:00Z" },
  { job_id: "g:a:5", company: "Northwell", title: "Nursing Supervisor", location: "Queens, NY", url: "https://x/5", description: "Lead a nursing unit.", first_seen_at: "2026-10-19T09:00:00Z", closed_at: "2026-10-19T12:00:00Z" },
];
function analyst() {
  const p = CareerProfile.createProfile({});
  CareerProfile.addFact(p, { kind: "experience", text: "Data analyst at Acme for 3 years: SQL dashboards, Tableau reporting, sales data" });
  CareerProfile.addFact(p, { kind: "skill", name: "SQL", text: "SQL" });
  CareerProfile.addFact(p, { kind: "skill", name: "Tableau", text: "Tableau" });
  return p;
}

Deno.test("WO-006/B10 search words: filler is dropped, stems match, closed postings never come back", () => {
  eq(searchWords("any remote data analyst jobs near me?"), ["remote", "data", "analyst"]);
  eq(searchPostings(POOL, "nurse", null).postings.map((p) => p.job_id), ["g:a:3"], "'nurse' finds Registered Nurse; the closed Nursing Supervisor stays closed");
  eq(searchPostings(POOL, "nursing", null).postings.map((p) => p.job_id), ["g:a:3"], "'nursing' finds the open nurse posting too; the closed one never");
  eq(searchPostings(POOL, "analysts", null).total, 2, "a plural finds the singular");
});

Deno.test("WO-006/B11 with confirmed facts, best fit first; a knockout ranks last with its reason; unknown years are never called 0", () => {
  const r = searchPostings(POOL, "", analyst());
  eq(r.ranked_by, "fit");
  eq(r.postings[0].job_id, "g:a:1", "the analyst role their SQL and Tableau match");
  assert(r.postings[0].fit!.reasons.some((x) => /SQL, Tableau/.test(x)), "the reason names the matched skills");
  const last = r.postings[r.postings.length - 1];
  eq([last.job_id, last.fit!.excluded], ["g:a:3", true], "the RN-license posting ranks last, not hidden");
  assert(/RN license/i.test(last.fit!.reasons.join(" ")), "with the reason");
  const senior = r.postings.find((p) => p.job_id === "g:a:4")!;
  assert(!JSON.stringify(senior.fit).includes("0 yrs") && !JSON.stringify(senior.fit).includes("shows 0"), `years they never dated are unknown, not 0: ${JSON.stringify(senior.fit)}`);
  const drafts = CareerProfile.createProfile({});
  CareerProfile.addFact(drafts, { kind: "skill", name: "SQL", text: "SQL", needs_confirmation: true, status: "draft" });
  eq(searchPostings(POOL, "", drafts).ranked_by, "newest", "unconfirmed facts never score");
  eq(searchPostings(POOL, "", null).postings.map((p) => p.job_id), ["g:a:3", "g:a:2", "g:a:4", "g:a:1"], "no profile: newest first");
});

Deno.test("WO-006/B12 search_jobs passes the query to the store and returns fit without the posting text", async () => {
  const asked: string[] = [];
  const t = careerTools({ postings: async (q) => { asked.push(q); return POOL; } }).find((x) => x.name === "search_jobs")!;
  const r = await t.run({ query: "data analyst", limit: 5 }, { userId: "u1", threadId: "t1", now: T0, state: { profile: analyst() } }) as any;
  eq(asked, ["data analyst"]);
  eq([r.source, r.ranked_by, r.postings.map((p: any) => p.job_id)], ["live", "fit", ["g:a:1", "g:a:4"]]);
  assert(r.postings.every((p: any) => p.url && p.first_seen_at && !("description" in p)), "links and times, no full text (tool results stay small)");
});
