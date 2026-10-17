// MI-107 (harness gap G2): board polling efficiency. Before this item, every
// watch cycle re-downloaded and re-parsed every board's full body: 121's
// fetchFeed sent no conditional headers and 151 kept no validators, so an
// unchanged board cost exactly what a changed board cost. The fix: an opt-in
// per-feed fetch cache (opts.fetchCache, owned + persisted by 151 in the
// injected store) carrying ETag / Last-Modified validators AND the last
// normalized postings + a body hash —
//   * server honors If-None-Match  -> 304, zero body bytes, zero parses,
//     cached postings flow into the diff (never an empty board);
//   * server ignores conditionals   -> full body, but the body hash matches,
//     so JSON parse + normalize are skipped and the cached postings flow;
//   * body actually changed         -> full parse, new postings detected.
// Graded on END STATES only: requests issued, body bytes served, JSON.parse
// executions, snapshot contents, alerts emitted. FAIL-FIRST: on the base tree
// (release/career-v224 @ 3c11e83) tests 1-2 are RED — no conditional header is
// ever sent, cycle 2 re-serves and re-parses every byte.
// Check: node --test tests/career-polling-efficiency.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));
const W = require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js"));

const T0 = Date.parse("2026-10-16T12:00:00.000Z");
const H = 3600000;

const PROFILE = {
  skills: [
    { name: "Python", proven: true, fact_id: "F-010" },
    { name: "React", proven: true, fact_id: "F-011" },
  ],
  degree: "B.S. Computer Science + Finance, class of 2029",
  level: "student",
  experience_years: 1,
  experience_text: "built Python data pipelines and a React dashboard for finance analysts",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2029, clearance: null, locations: ["New York", "Chicago"] },
  preferences: { role_families: ["Finance", "SWE"], locations: ["New York", "Chicago"], starred_companies: [] },
};

const ghJob = (id, title, postedMs) => ({
  id, title,
  location: { name: "New York, NY" },
  absolute_url: `https://boards.greenhouse.io/x/jobs/${id}`,
  first_published: new Date(postedMs).toISOString(),
  requisition_id: `REQ-${id}`,
  departments: [{ name: "Finance" }],
  content: "&lt;p&gt;Work in Python and React with the finance team. Salary range $30/hr.&lt;/p&gt;",
});

// A fixture board server with honest HTTP semantics. Records every request
// (with the headers it actually received), every body byte it served, and
// every body read. json() performs a real JSON.parse of the served text, so
// the JSON.parse counter honestly measures "times a board body got parsed"
// in both worlds: the legacy path (which parses inside json()) and the
// MI-107 path (which parses the text() body itself, or not at all).
function makeBoardServer() {
  const boards = {
    // Honors conditionals: serves an ETag and answers 304 to a matching
    // If-None-Match. Content + etag change together when the test mutates it.
    etagco: { etag: '"a1"', jobs: [ghJob(101, "Finance Intern", T0 - H), ghJob(102, "Finance Intern, Trading", T0 - H)] },
    // Serves NO validators: conditional GETs can never help; only the
    // body-hash skip can save the parse.
    hashco: { etag: null, jobs: [ghJob(201, "Finance Intern", T0 - H)] },
    // No validators either; its body CHANGES in cycle 3.
    changeco: { etag: null, jobs: [ghJob(301, "Finance Intern", T0 - H)] },
  };
  const stats = { requests: [], bytes: 0, bodyReads: 0 };
  const hdrs = (obj) => ({ get: (n) => (Object.prototype.hasOwnProperty.call(obj, String(n).toLowerCase()) ? obj[String(n).toLowerCase()] : null) });
  const fetchImpl = async (url, init) => {
    const token = /boards\/([^/]+)\/jobs/.exec(url)[1];
    const b = boards[token];
    const headers = (init && init.headers) || {};
    stats.requests.push({ token, headers });
    if (b.etag && headers["if-none-match"] === b.etag) {
      return { status: 304, ok: false, headers: hdrs({}),
        text: async () => { stats.bodyReads += 1; return ""; },
        json: async () => { stats.bodyReads += 1; throw new Error("304 responses carry no body"); } };
    }
    const bodyObj = { name: token, jobs: b.jobs };
    const bodyText = JSON.stringify(bodyObj);
    return { status: 200, ok: true, headers: hdrs(b.etag ? { etag: b.etag } : {}),
      text: async () => { stats.bodyReads += 1; stats.bytes += bodyText.length; return bodyText; },
      json: async () => { stats.bodyReads += 1; stats.bytes += bodyText.length; return JSON.parse(bodyText); } };
  };
  return { boards, stats, fetchImpl };
}

// Run fn() with a JSON.parse counter installed; returns { out, parses }.
async function counted(fn) {
  const orig = JSON.parse;
  let parses = 0;
  JSON.parse = (...a) => { parses += 1; return orig(...a); };
  try { const out = await fn(); return { out, parses }; }
  finally { JSON.parse = orig; }
}

test("MI-107 measurement: unchanged boards cost a 304 or a hash compare; changed boards parse fully", async () => {
  const srv = makeBoardServer();
  const store = W.createMemoryStore();
  const alerts = [];
  const sink = async (r) => { alerts.push(r); };
  const feeds = [J.feeds.greenhouse("etagco"), J.feeds.greenhouse("hashco"), J.feeds.greenhouse("changeco")];
  const cycle = (now) => W.runWatchCycle({ feeds, fetch: srv.fetchImpl, profile: PROFILE, store, sink, now });
  const bodyBytes = (token) => JSON.stringify({ name: token, jobs: srv.boards[token].jobs }).length;
  const table = [];
  const snap = () => { const i = srv.stats.requests.length, b = srv.stats.bytes; return () => ({ requests: srv.stats.requests.length - i, bytes: srv.stats.bytes - b }); };

  // --- cycle 1: cold cache — everything downloads and parses; seed cycle.
  let d = snap();
  let r1 = await counted(() => cycle(T0));
  let m = d();
  table.push(["cycle 1 (cold)", m.requests, m.bytes, r1.parses]);
  assert.equal(m.requests, 3);
  assert.equal(m.bytes, bodyBytes("etagco") + bodyBytes("hashco") + bodyBytes("changeco"));
  assert.equal(r1.parses, 3, "cold cycle parses each board body exactly once");
  assert.equal(r1.out.seeded, true);
  assert.equal(r1.out.alerts_emitted, 0);
  assert.deepEqual(r1.out.fetch_efficiency, { requests: 3, bytes_transferred: m.bytes, full_parses: 3, not_modified_304: 0, hash_skips: 0, cache_persisted: true });
  const idsAfterSeed = (await store.get("career:jobs:snapshot")).job_ids.slice().sort();

  // --- cycle 2: NOTHING changed. etagco must cost a 304 (zero bytes, the
  // conditional header actually sent); hashco + changeco re-serve their
  // bodies but the hash skip must spare every parse. End states: no new,
  // no alerts, NO removals (a 304 is not an empty board), same snapshot.
  d = snap();
  const r2 = await counted(() => cycle(T0 + H));
  m = d();
  table.push(["cycle 2 (unchanged)", m.requests, m.bytes, r2.parses]);
  const etagReq = srv.stats.requests.filter((q) => q.token === "etagco").pop();
  assert.equal(etagReq.headers["if-none-match"], '"a1"', "the watcher sends the stored ETag as If-None-Match");
  assert.equal(m.requests, 3, "conditional GETs are still requests — one per board");
  assert.equal(m.bytes, bodyBytes("hashco") + bodyBytes("changeco"), "the 304 board serves zero body bytes");
  assert.equal(r2.parses, 0, "no body is parsed when nothing changed");
  assert.equal(r2.out.new_seen, 0);
  assert.equal(r2.out.alerts_emitted, 0);
  assert.equal(r2.out.removed, 0, "a 304 board must never register as mass removals");
  assert.deepEqual((await store.get("career:jobs:snapshot")).job_ids.slice().sort(), idsAfterSeed);
  assert.deepEqual(r2.out.fetch_efficiency, { requests: 3, bytes_transferred: m.bytes, full_parses: 0, not_modified_304: 1, hash_skips: 2, cache_persisted: true });

  // --- cycle 3: changeco adds a posting. Only changeco parses; the new
  // posting is detected and alerts; the other two boards stay cached.
  srv.boards.changeco.jobs.push(ghJob(302, "Investment Banking Intern", T0 + 2 * H - 30 * 60000));
  d = snap();
  const r3 = await counted(() => cycle(T0 + 2 * H));
  m = d();
  table.push(["cycle 3 (one board changed)", m.requests, m.bytes, r3.parses]);
  assert.equal(r3.parses, 1, "only the changed board's body is parsed");
  assert.equal(r3.out.new_seen, 1);
  assert.equal(r3.out.alerts_emitted, 1);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, "Investment Banking Intern");
  assert.equal(r3.out.fetch_efficiency.full_parses, 1);
  assert.equal(r3.out.fetch_efficiency.not_modified_304, 1);
  assert.equal(r3.out.fetch_efficiency.hash_skips, 1);

  // --- cycle 4: etagco changes body AND etag. The watcher offers the stale
  // etag, the honest server answers 200, the new posting flows. A validator
  // must never serve stale content.
  srv.boards.etagco.etag = '"a2"';
  srv.boards.etagco.jobs.push(ghJob(103, "Software Engineering Intern", T0 + 3 * H - 30 * 60000));
  d = snap();
  const r4 = await counted(() => cycle(T0 + 3 * H));
  m = d();
  table.push(["cycle 4 (etag board changed)", m.requests, m.bytes, r4.parses]);
  const etagReq4 = srv.stats.requests.filter((q) => q.token === "etagco").pop();
  assert.equal(etagReq4.headers["if-none-match"], '"a1"', "the stale etag is what gets offered");
  assert.equal(r4.parses, 1, "only etagco's changed body is parsed");
  assert.equal(r4.out.alerts_emitted, 1);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[1].title, "Software Engineering Intern");

  console.log("MI-107 fixture measurement [cycle, requests, body bytes, JSON parses]:", JSON.stringify(table));
});

test("MI-107 121 fetchFeed: cache threads conditionals; a 304 returns the cached postings untouched", async () => {
  const cache = new Map();
  const bodyObj = { name: "etagco", jobs: [ghJob(101, "Finance Intern", T0 - H)] };
  const bodyText = JSON.stringify(bodyObj);
  const seen = [];
  // Plain-object headers here (no .get): the header reader must cope.
  const fetchImpl = async (url, init) => {
    seen.push((init && init.headers) || {});
    if (seen.length > 1 && seen[seen.length - 1]["if-none-match"] === '"e1"')
      return { status: 304, ok: false, headers: {}, json: async () => { throw new Error("no body"); }, text: async () => "" };
    return { status: 200, ok: true, headers: { ETag: '"e1"', "Last-Modified": "Wed, 15 Oct 2026 12:00:00 GMT" },
      text: async () => bodyText, json: async () => bodyObj };
  };
  const feed = J.feeds.greenhouse("etagco");
  const first = await J.fetchFeed(feed, { fetch: fetchImpl, fetchCache: cache });
  assert.equal(first.status, 200);
  assert.equal(first.postings.length, 1);
  assert.equal(first.fetch_cache, "miss");
  const entry = cache.get(feed.url);
  assert.ok(entry, "the fetch cache is populated after a 200");
  assert.equal(entry.etag, '"e1"');
  assert.equal(entry.last_modified, "Wed, 15 Oct 2026 12:00:00 GMT");
  assert.ok(entry.body_hash, "the body hash is stored");

  const second = await J.fetchFeed(feed, { fetch: fetchImpl, fetchCache: cache });
  assert.equal(seen[1]["if-none-match"], '"e1"');
  assert.equal(seen[1]["if-modified-since"], "Wed, 15 Oct 2026 12:00:00 GMT");
  assert.equal(second.status, 304);
  assert.equal(second.not_modified, true);
  assert.equal(second.fetch_cache, "hit-304");
  assert.equal(second.bytes, 0);
  assert.deepEqual(second.postings, first.postings, "the cached postings flow into the diff verbatim");
});

test("MI-107 safety: a bare 304 with no cache entry is an error result, never an empty board", async () => {
  const cache = new Map();
  const fetchImpl = async () => ({ status: 304, ok: false, headers: {}, json: async () => ({}), text: async () => "" });
  const r = await J.fetchFeed(J.feeds.greenhouse("etagco"), { fetch: fetchImpl, fetchCache: cache });
  assert.equal(r.status, 304);
  assert.ok(r.error, "an uncached 304 surfaces as an error");
  assert.deepEqual(r.postings, []);
  assert.notEqual(r.not_modified, true);
});

test("MI-107 no-regression: without opts.fetchCache the fetcher keeps its exact legacy shape", async () => {
  let argCount = -1;
  const bodyObj = { name: "etagco", jobs: [ghJob(101, "Finance Intern", T0 - H)] };
  const fetchImpl = async function () { argCount = arguments.length; return { status: 200, ok: true, headers: { etag: '"e1"' }, json: async () => bodyObj }; };
  const r = await J.fetchFeed(J.feeds.greenhouse("etagco"), { fetch: fetchImpl });
  assert.equal(argCount, 1, "the injected fetch is still called with the URL only");
  assert.equal(r.status, 200);
  assert.equal(r.postings.length, 1);
  assert.equal("fetch_cache" in r, false, "no new fields leak into the legacy result shape");
  assert.equal("bytes" in r, false);
});
