// LINK LIVENESS (Muse surface lane, 2026-10-20; MUSE-F-003):
// serve-time verification of job links. Before this module, NO code
// checked a posting link before it reached a user — the 2026-10-20
// audit of the live shelf measured 31/60 links resolving to a live
// posting, 3 confirmed dead (404/410), 26 uncheckable by raw fetch.
// This suite pins the verdict contract on RECORDED cases (a stub
// fetch replays the audit's observed shapes; nothing here touches
// the network):
//   * 404 / 410 -> CONFIRMED-DEAD, the only verdict that drops a
//     posting from what can be served;
//   * a redirect from a posting URL to a search/listing page ->
//     CONFIRMED-DEAD; a redirect to another posting page is not;
//   * 200 with a decisive posting signal (JobPosting JSON-LD,
//     apply/description copy) -> LIVE;
//   * 200 JS shell, other statuses (403/500), timeouts and network
//     errors -> UNCHECKABLE, and UNCHECKABLE still serves;
//   * verdicts cache per URL inside the TTL and re-check after it;
//   * the pool loader's servable reads drop the dead, count and
//     log the drops, and fail open (serve unchecked) if the
//     verifier itself fails.
// Check: node --test tests/career-link-liveness.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const { LinkLiveness } = require(path.join(root, "supabase/functions/_shared/link_liveness.js"));
const { CareerPool } = require(path.join(root, "supabase/functions/_shared/career_pool.js"));

const { LIVE, DEAD, UNCHECKABLE } = LinkLiveness.VERDICTS;

// A stub fetch replaying recorded responses per URL. Supports the
// one shape fetchHead consumes: { status, url, text() } plus an
// abort-honoring hang for the timeout case.
function stubFetch(responses) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push(url);
    const r = responses[url];
    if (!r) throw new Error(`no recorded response for ${url}`);
    if (r.hang) {
      return new Promise((_, reject) => {
        if (opts && opts.signal) opts.signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }
    if (r.throw) throw new Error(r.throw);
    return {
      status: r.status,
      url: r.finalUrl || url,
      text: async () => r.body || "",
    };
  };
  fn.calls = calls;
  return fn;
}

const RECORDED = {
  // the audit's three confirmed-dead shapes
  "https://www.themuse.com/jobs/acme/radiology-technologist-3c39df": { status: 404, body: "<html>job not found</html>" },
  "https://www.arbeitnow.com/jobs/companies/legartis/legal-ai-counsel-147252": { status: 410, body: "<html>gone</html>" },
  // a posting URL that redirects to site search
  "https://boards.example.com/jobs/88412": { status: 200, finalUrl: "https://boards.example.com/search?q=engineer", body: "<html>search results</html>" },
  // audit RESOLVES-LIVE shapes: JSON-LD and apply copy
  "https://job-boards.greenhouse.io/planetscale/jobs/4395260009": { status: 200, body: '<html><script type="application/ld+json">{"@type":"JobPosting","title":"Engineer"}</script></html>' },
  "https://www.themuse.com/jobs/walmart/retail-customer-service-associate-7c91bd": { status: 200, body: "<html><h1>Retail Customer Service Associate</h1><button>Apply now</button><p>Responsibilities include…</p></html>" },
  // a canonical redirect to ANOTHER posting page (audit: databricks
  // greenhouse) — not a death; no decisive signal in the head
  "https://databricks.com/company/careers/open-positions/job?gh_jid=8755666002": { status: 200, finalUrl: "https://www.databricks.com/company/careers/field-engineering---other/manager-field-engineering---polish-speaker-8755666002?gh_jid=8755666002", body: "<html><div id=\"root\"></div></html>" },
  // a JSON posting record (NYC open-data shape) is the posting itself
  "https://data.cityofnewyork.us/resource/kpav-sd4t.json?job_id=789321": { status: 200, body: '[{"job_id":"789321","business_title":"Data Analyst","job_description":"…"}]' },
  // JS shell, bot wall, server error, network failure, hang
  "https://jobs.ashbyhq.com/sierra/f3308520-6d7d-45ac-b96d-3f5a5012e6c9": { status: 200, body: '<html><div id="root"></div><script src="/assets/app.js"></script></html>' },
  "https://jobs.example.com/positions/51": { status: 403, body: "<html>verify you are human</html>" },
  "https://jobs.example.com/positions/52": { status: 500, body: "<html>error</html>" },
  "https://www.arbeitnow.ch/jobs/991": { throw: "SSL: UNEXPECTED_EOF_WHILE_READING" },
  "https://slow.example.com/jobs/7": { hang: true },
};

function makeLiveness(extra = {}) {
  return LinkLiveness.createLinkLiveness({ fetchFn: stubFetch(RECORDED), timeoutMs: 40, ...extra });
}

test("recorded 404 and 410 are CONFIRMED-DEAD", async () => {
  const lv = makeLiveness();
  const a = await lv.check("https://www.themuse.com/jobs/acme/radiology-technologist-3c39df");
  const b = await lv.check("https://www.arbeitnow.com/jobs/companies/legartis/legal-ai-counsel-147252");
  assert.equal(a.verdict, DEAD); assert.equal(a.reason, "http-404");
  assert.equal(b.verdict, DEAD); assert.equal(b.reason, "http-410");
});

test("a redirect from a posting to a search page is CONFIRMED-DEAD; a redirect to another posting is not", async () => {
  const lv = makeLiveness();
  const dead = await lv.check("https://boards.example.com/jobs/88412");
  assert.equal(dead.verdict, DEAD); assert.equal(dead.reason, "redirect-to-listing");
  const moved = await lv.check("https://databricks.com/company/careers/open-positions/job?gh_jid=8755666002");
  assert.equal(moved.verdict, UNCHECKABLE);
});

test("200 with a decisive posting signal is LIVE", async () => {
  const lv = makeLiveness();
  const a = await lv.check("https://job-boards.greenhouse.io/planetscale/jobs/4395260009");
  const b = await lv.check("https://www.themuse.com/jobs/walmart/retail-customer-service-associate-7c91bd");
  const c = await lv.check("https://data.cityofnewyork.us/resource/kpav-sd4t.json?job_id=789321");
  assert.equal(a.verdict, LIVE);
  assert.equal(b.verdict, LIVE);
  assert.equal(c.verdict, LIVE);
});

test("JS shells, bot walls, server errors, network failures and timeouts are UNCHECKABLE — never dead", async () => {
  const lv = makeLiveness();
  for (const url of [
    "https://jobs.ashbyhq.com/sierra/f3308520-6d7d-45ac-b96d-3f5a5012e6c9",
    "https://jobs.example.com/positions/51",
    "https://jobs.example.com/positions/52",
    "https://www.arbeitnow.ch/jobs/991",
    "https://slow.example.com/jobs/7",
  ]) {
    const r = await lv.check(url);
    assert.equal(r.verdict, UNCHECKABLE, `${url} -> ${r.verdict} (${r.reason})`);
  }
});

test("verifyServing drops only the confirmed-dead, counts and logs the drops, and stamps kept postings", async () => {
  const logs = [];
  const lv = makeLiveness({ log: (e) => logs.push(e) });
  const postings = Object.keys(RECORDED).map((url, i) => ({ id: `p${i}`, title: "Role", url }));
  const out = await lv.verifyServing(postings);
  assert.equal(out.droppedCount, 3);
  assert.deepEqual(out.dropped.map((p) => p.url).sort(), [
    "https://boards.example.com/jobs/88412",
    "https://www.arbeitnow.com/jobs/companies/legartis/legal-ai-counsel-147252",
    "https://www.themuse.com/jobs/acme/radiology-technologist-3c39df",
  ]);
  assert.equal(out.postings.length, postings.length - 3);
  assert.equal(logs.filter((e) => e.type === "link_liveness_drop").length, 3);
  const gh = out.postings.find((p) => p.url.includes("greenhouse"));
  assert.equal(gh.link_verdict, LIVE);
  const ashby = out.postings.find((p) => p.url.includes("ashbyhq"));
  assert.equal(ashby.link_verdict, UNCHECKABLE);
  assert.equal(lv.stats().droppedTotal, 3);
});

test("verdicts are cached per URL within the TTL and re-checked after it", async () => {
  let t = 1_000_000;
  const fetchFn = stubFetch(RECORDED);
  const lv = LinkLiveness.createLinkLiveness({ fetchFn, now: () => t, ttlMs: 60_000 });
  const url = "https://job-boards.greenhouse.io/planetscale/jobs/4395260009";
  const first = await lv.check(url);
  const second = await lv.check(url);
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(fetchFn.calls.filter((u) => u === url).length, 1);
  t += 60_001;
  const third = await lv.check(url);
  assert.equal(third.fromCache, false);
  assert.equal(fetchFn.calls.filter((u) => u === url).length, 2);
});

test("a posting without a URL is UNCHECKABLE and kept — never dropped, never fetched", async () => {
  const lv = makeLiveness();
  const out = await lv.verifyServing([{ id: "x", title: "No link role", url: "" }]);
  assert.equal(out.droppedCount, 0);
  assert.equal(out.postings.length, 1);
});

test("pool servable reads drop the dead through the injected verifier; plain reads are unchanged", async () => {
  const rows = [
    { posting_key: "k-dead", source: "themuse", company: "Acme", title: "Radiology Technologist", location: "Memphis", url: "https://www.themuse.com/jobs/acme/radiology-technologist-3c39df", posted_at: "2026-10-14T00:00:00Z", fetched_on: "2026-10-14", text_excerpt: "x" },
    { posting_key: "k-live", source: "greenhouse", company: "Planetscale", title: "Engineer", location: "Remote", url: "https://job-boards.greenhouse.io/planetscale/jobs/4395260009", posted_at: "2026-10-14T00:00:00Z", fetched_on: "2026-10-14", text_excerpt: "y" },
  ];
  const readRows = async () => rows;
  const plain = CareerPool.createKbPoolLoader({ readRows });
  const plainOut = await plain.loadPool();
  assert.equal(plainOut.postings.length, 2);
  assert.equal(plainOut.droppedCount, undefined); // plain reads carry no liveness surface

  const loader = CareerPool.createKbPoolLoader({ readRows, liveness: makeLiveness() });
  const served = await loader.loadServablePool();
  assert.equal(served.error, null);
  assert.equal(served.droppedCount, 1);
  assert.equal(served.postings.length, 1);
  assert.equal(served.postings[0].url, "https://job-boards.greenhouse.io/planetscale/jobs/4395260009");
  assert.equal(served.postings[0].link_verdict, LIVE);
});

test("a failing verifier fails open: the servable read serves the plain pool", async () => {
  const rows = [
    { posting_key: "k1", source: "greenhouse", company: "Acme", title: "Engineer", location: "Remote", url: "https://job-boards.greenhouse.io/planetscale/jobs/4395260009", posted_at: "2026-10-14T00:00:00Z", fetched_on: "2026-10-14", text_excerpt: "y" },
  ];
  const loader = CareerPool.createKbPoolLoader({
    readRows: async () => rows,
    liveness: { verifyServing: async () => { throw new Error("verifier down"); } },
  });
  const served = await loader.loadServablePool();
  assert.equal(served.postings.length, 1);
  assert.equal(served.droppedCount, 0);
});
