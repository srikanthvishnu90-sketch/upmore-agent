// WO-044 acceptance tests (architect-authored): the seven new board readers are wired into ingest the way the four
// before them are. Each reads its provider's public shape (hand-written fixtures, the same as the discovery tests use),
// gives every posting the ATS's own id (provider:board:<id>), an https link, a title, a place and a date where the board
// says one, and runs through the product's own normalizer. A body that is not the board's shape fails the board (it
// closes nothing); Workday's paged search is read-only and a board past its page cap is a partial read; the one-request
// GET feeds take a conditional request; the table's constraints take every provider ingest reads.
// Contract: docs/architect/work-orders/WO-044-discovery-scale.md
import { boardFetchFeed, directoryBoards, ingestBoards, INGEST_PROVIDERS, memoryPostingsDb, type Board } from "../../supabase/functions/_shared/career_ingest.ts";
import { FEEDS, MORE_PROVIDERS, workdayParts, workdayPostedAt, xmlBlocks, xmlField } from "../../supabase/functions/_shared/career_ingest_feeds.ts";
import { FIX } from "./wo-044-fixtures.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
function fakeFetch(routes: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; method: string; body: string | null; headers: Record<string, string> }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: (init?.body as string) ?? null, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    return await routes(url, init);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const body = (v: unknown, headers: Record<string, string> = {}) => new Response(typeof v === "string" ? v : JSON.stringify(v), { status: 200, headers });

const CASES: { provider: string; board: string; url: string; fix: unknown; want: { job_id: string; title: string; url: string; location: string; posted: string | null; company: string; text?: string } }[] = [
  { provider: "workable", board: "acme", url: "https://apply.workable.com/api/v1/widget/accounts/acme?details=true", fix: FIX.workable,
    want: { job_id: "workable:acme:AB12CD34EF", title: "Backend Engineer", url: "https://apply.workable.com/j/AB12CD34EF", location: "Athens, Greece", posted: "2026-10-12", company: "Acme" } },
  { provider: "recruitee", board: "acme", url: "https://acme.recruitee.com/api/offers/", fix: FIX.recruitee,
    want: { job_id: "recruitee:acme:901", title: "Account Manager", url: "https://acme.recruitee.com/o/account-manager", location: "Amsterdam, Netherlands", posted: "2026-10-10", company: "Acme BV", text: "Grow accounts & renew." } },
  { provider: "bamboohr", board: "acme", url: "https://acme.bamboohr.com/careers/list", fix: FIX.bamboohr,
    want: { job_id: "bamboohr:acme:42", title: "Payroll Specialist", url: "https://acme.bamboohr.com/careers/42", location: "Lindon, Utah, United States", posted: null, company: "Acme" } },
  { provider: "teamtailor", board: "acme", url: "https://acme.teamtailor.com/jobs.rss", fix: FIX.teamtailor,
    want: { job_id: "teamtailor:acme:3141592", title: "Data Engineer & Analyst", url: "https://acme.teamtailor.com/jobs/3141592-data-engineer", location: "Stockholm, Sweden (Hybrid)", posted: "2026-10-13", company: "Acme", text: "Build pipelines & dashboards." } },
  { provider: "breezy", board: "acme", url: "https://acme.breezy.hr/json", fix: FIX.breezy,
    want: { job_id: "breezy:acme:abc123def456", title: "Support Lead", url: "https://acme.breezy.hr/p/abc123def456-support-lead", location: "Austin, TX", posted: "2026-10-11", company: "Acme Inc" } },
  { provider: "personio", board: "acme", url: "https://acme.jobs.personio.de/xml", fix: FIX.personio,
    want: { job_id: "personio:acme:1234567", title: "Senior Backend Engineer (m/w/d)", url: "https://acme.jobs.personio.de/job/1234567", location: "Berlin; Munich", posted: "2026-10-09", company: "Acme GmbH", text: "Run our Go services." } },
];

Deno.test("WO-044/I1 each GET reader: the ATS's own id, the link, the place, the date, the company, the text", async () => {
  for (const c of CASES) {
    const { f, calls } = fakeFetch(() => body(c.fix));
    const out = await boardFetchFeed(f, { userAgent: "Trainee job alerts (contact: ops@example.test)" })({ company: "Acme", provider: c.provider, board: c.board }) as any[];
    assert(Array.isArray(out) && out.length === 1, `${c.provider}: one posting, got ${JSON.stringify(out)}`);
    const p = out[0];
    eq(calls.map((x) => [x.method, x.url]), [["GET", c.url]], `${c.provider}: one GET to its feed`);
    eq(calls[0].headers["user-agent"], "Trainee job alerts (contact: ops@example.test)");
    eq([p.job_id, p.title, p.url, p.location], [c.want.job_id, c.want.title, c.want.url, c.want.location], c.provider);
    eq(p.posted_at ? String(p.posted_at).slice(0, 10) : null, c.want.posted, `${c.provider}: posted`);
    eq(p.company, c.want.company, `${c.provider}: company`);
    if (c.want.text) assert(p.description.includes(c.want.text) && !/<p>/.test(p.description), `${c.provider}: text decoded: ${p.description}`);
    assert(p.role_family && p.seniority_band !== undefined, `${c.provider}: the product's normalizer ran`);
  }
});

Deno.test("WO-044/I2 Workday: its read-only search, paged 20 at a time to the board's total; past 50 pages a partial read", async () => {
  const job = (i: number) => ({ title: `Associate ${i}`, externalPath: `/job/Austin-TX/Associate_R${i}`, locationsText: "Austin, TX", postedOn: i % 2 ? "Posted Today" : "Posted 30+ Days Ago" });
  const { f, calls } = fakeFetch((_u, init) => {
    const q = JSON.parse(String(init?.body));
    const all = 45;
    // Workday answers the total on the first page only.
    return body({ total: q.offset === 0 ? all : 0, jobPostings: Array.from({ length: Math.max(0, Math.min(q.limit, all - q.offset)) }, (_, i) => job(q.offset + i)) });
  });
  const out = await boardFetchFeed(f)({ company: "Acme", provider: "workday", board: "acme.wd5/External" }) as any[];
  eq(out.length, 45);
  eq(calls.map((c) => [c.method, c.url, JSON.parse(c.body!).offset]), [0, 20, 40].map((o) => ["POST", "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/jobs", o]));
  for (const c of calls) eq(Object.keys(JSON.parse(c.body!)).sort(), ["appliedFacets", "limit", "offset", "searchText"], "the body is a search: nothing in it writes");
  eq([out[1].job_id, out[1].url], ["workday:acme.wd5/external:Associate_R1", "https://acme.wd5.myworkdayjobs.com/External/job/Austin-TX/Associate_R1"]);
  assert(!calls.some((c) => c.headers["if-none-match"] || c.headers["if-modified-since"]), "no conditional request on a paged search");
  const now = Date.UTC(2026, 9, 20, 15);
  eq([workdayPostedAt("Posted Today", now), workdayPostedAt("Posted 3 Days Ago", now), workdayPostedAt("Posted 30+ Days Ago", now), workdayPostedAt("", now)],
    ["2026-10-20T00:00:00.000Z", "2026-10-17T00:00:00.000Z", "2026-09-20T00:00:00.000Z", null]);
  // A board past 50 pages (1,000 postings): read the cap, say it is partial (closes nothing).
  const big = fakeFetch((_u, init) => { const q = JSON.parse(String(init?.body)); return body({ total: q.offset === 0 ? 5000 : 0, jobPostings: Array.from({ length: 20 }, (_, i) => job(q.offset + i)) }); });
  const r = await boardFetchFeed(big.f, { timeoutMs: 60000 })({ company: "Big", provider: "workday", board: "big.wd1/Careers" }) as any;
  eq([r.complete, r.postings.length, big.calls.length], [false, 1000, 50]);
  eq(workdayParts("nvidia.wd5/NVIDIAExternalCareerSite"), { tenant: "nvidia", wd: "wd5", site: "NVIDIAExternalCareerSite", host: "nvidia.wd5.myworkdayjobs.com" });
  eq(workdayParts("not a token"), null);
});

Deno.test("WO-044/I3 a body that is not the board's shape fails the board: nothing is closed", async () => {
  const db = memoryPostingsDb();
  const b: Board = { company: "Acme", provider: "teamtailor", board: "acme" };
  let html = false;
  const feed = boardFetchFeed(fakeFetch(() => body(html ? "<!doctype html><html>moved</html>" : FIX.teamtailor)).f);
  const now = Date.UTC(2026, 9, 20, 12);
  await ingestBoards({ boards: [b], fetchFeed: feed, db, now, useCursor: false });
  eq((await db.open()).length, 1);
  html = true;
  const st = await ingestBoards({ boards: [b], fetchFeed: feed, db, now: now + 3600000, useCursor: false });
  eq([st.boards_failed, st.closed, (await db.open()).length], [1, 0, 1], "an HTML page where the feed was is a failed read, not an empty board");
  assert(/not a teamtailor board/.test(st.failures[0].error), st.failures[0].error);
});

Deno.test("WO-044/I4 the one-request GET feeds take a conditional request; a 304 rewrites and closes nothing", async () => {
  let status = 200;
  const { f, calls } = fakeFetch(() => status === 304 ? new Response(null, { status: 304 }) : body(FIX.recruitee, { etag: '"r1"' }));
  const read = boardFetchFeed(f);
  const first = await read({ company: "Acme", provider: "recruitee", board: "acme" }) as any;
  eq([first.etag, first.postings.length], ['"r1"', 1]);
  status = 304;
  const second = await read({ company: "Acme", provider: "recruitee", board: "acme", etag: '"r1"' }) as any;
  eq(calls[1].headers["if-none-match"], '"r1"');
  eq([second.not_modified, second.complete, second.postings.length], [true, false, 0]);
});

Deno.test("WO-044/I5 the directory, the shipped list and the table all take every provider ingest reads", async () => {
  eq([...INGEST_PROVIDERS].sort(), ["ashby", "bamboohr", "breezy", "greenhouse", "lever", "personio", "recruitee", "smartrecruiters", "teamtailor", "workable", "workday"]);
  eq(MORE_PROVIDERS.every((p) => FEEDS[p]), true);
  const dir = { boards: [
    { provider: "workday", board_token: "acme.wd5/External", status: "live", company: "acme" },
    { provider: "teamtailor", board_token: "beta", status: "live", company: "Beta" },
    { provider: "workday", board_token: "cvshealth", status: "discovered_unsupported", company: "CVS Health" },
    { provider: "someats", board_token: "x", status: "live", company: "X" },
  ] };
  eq(directoryBoards(dir).map((b) => `${b.provider}:${b.board}`), ["workday:acme.wd5/External", "teamtailor:beta"], "live boards on providers ingest reads, nothing else");
  const sql = await Deno.readTextFile(new URL("../../supabase/migrations/20261022090000_career_more_providers.sql", import.meta.url));
  for (const p of INGEST_PROVIDERS) {
    assert(new RegExp(`job_id ~ '\\^\\([^']*\\b${p}\\b`).test(sql), `career_postings.job_id takes ${p}`);
    assert((sql.match(new RegExp(`'${p}'`, "g")) ?? []).length >= 2, `career_postings.provider and career_board_state.provider take ${p}`);
  }
  const live = await Deno.readTextFile(new URL("../../scripts/launch/trainee-go-live.sh", import.meta.url));
  assert(live.includes("20261022090000_career_more_providers.sql"), "go-live applies the migration");
});

Deno.test("WO-044/I6 the XML reader: blocks, fields, CDATA kept whole, entities decoded", () => {
  const x = `<a><item><t>One &amp; two</t><d><![CDATA[<b>x & y</b>]]></d></item><item><t>&#8364;5</t></item></a>`;
  eq(xmlBlocks(x, "item").map((b) => xmlField(b, "t")), ["One & two", "€5"]);
  eq(xmlField(xmlBlocks(x, "item")[0], "d"), "<b>x & y</b>");
  eq(xmlField("<x/>", "t"), null);
});
