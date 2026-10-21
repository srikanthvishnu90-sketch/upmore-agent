// POOL LINK LIVENESS (MUSE-F-003 — surface build, 2026-10-20):
// a link the product serves is never a CONFIRMED-dead link. The
// 2026-10-20 audit sampled 60 links from the served snapshot:
// 31 live, 3 dead (404/410), 26 unconfirmable — and no code path
// checked any link before serving it. This suite pins the loader
// discipline:
//   * at POOL LOAD, on the served window only, each distinct URL is
//     probed once (stubbed here — no live network in the suite);
//   * DEAD only on a definitive 404 or 410: those postings are
//     EXCLUDED from the served pool and counted in deadExcluded;
//   * everything else — 200, 3xx, 403, timeouts, network errors,
//     a missing URL — is UNCONFIRMED and serves exactly as before,
//     in the original order, with every other field untouched;
//   * with no probe injected, the loader behaves exactly as base
//     (composition roots opt in by binding createFetchProbe);
//   * createFetchProbe itself: HEAD first, a ranged GET only when
//     HEAD cannot answer, a short timeout, null on any failure.
// Fail-first: on base career_pool.js every fixture posting is served
// (dead included) and deadExcluded does not exist — the first test
// is red there.
// Check: node --test tests/career-pool-liveness.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const { CareerPool } = require(path.join(root, "supabase/functions/_shared/career_pool.js"));
const CareerJobs = require(path.join(root, "packages/domain/121-career-jobs.js"));
const JOBS = { roleFamily: CareerJobs.roleFamily, seniorityBand: CareerJobs.seniorityBand, stripHtml: CareerJobs.stripHtml };

function kbRow(key, url, over = {}) {
  return Object.assign({
    posting_key: key, source: "greenhouse", board: "acme",
    company: "Acme", title: "Software Engineering Intern",
    location: "Chicago, IL", url,
    posted_at: "2026-10-12T00:00:00Z", fetched_on: "2026-10-14",
    text_excerpt: "Software engineering intern. Build product, write tests, ship with a mentor.",
  }, over);
}

const URLS = {
  gone: "https://boards.example.test/acme/jobs/gone-410",
  missing: "https://boards.example.test/acme/jobs/missing-404",
  live: "https://boards.example.test/acme/jobs/live-200",
  slow: "https://boards.example.test/acme/jobs/timeout",
};
function fixtureRows() {
  return [
    kbRow("gh:gone", URLS.gone),
    kbRow("gh:missing", URLS.missing),
    kbRow("gh:live", URLS.live),
    kbRow("gh:slow", URLS.slow),
  ];
}
// The recorded-shape probe: 410 and 404 are definitive, 200 lives,
// and the timeout URL's probe fails the way a real timeout does —
// a rejection the loader must read as UNCONFIRMED, never dead.
function stubProbe(calls) {
  return async (url) => {
    if (calls) calls.push(url);
    if (url === URLS.gone) return 410;
    if (url === URLS.missing) return 404;
    if (url === URLS.live) return 200;
    throw new Error("probe timed out (fixture)");
  };
}
const loaderWith = (rows, extra = {}) => CareerPool.createKbPoolLoader({
  jobs: JOBS, readRows: async () => rows, ...extra,
});

test("liveness: only the 404/410 postings are excluded — deadExcluded counts them, the rest serve in order", async () => {
  const calls = [];
  const pool = await loaderWith(fixtureRows(), { probeUrl: stubProbe(calls) }).loadPool();
  assert.equal(pool.error, null);
  assert.equal(pool.deadExcluded, 2, "exactly the 404 and the 410 are counted as excluded");
  assert.deepEqual(pool.postings.map((p) => p.url), [URLS.live, URLS.slow],
    "the 200 and the unconfirmable (timeout) postings serve, in the window's original order");
  assert.equal(pool.fetchedOn, "2026-10-14", "fetchedOn still reports the read window");
  assert.equal(calls.length, 4, "each distinct window URL was probed exactly once this load");
});

test("liveness: 403, 3xx, null-status and URL-less postings are UNCONFIRMED and serve", async () => {
  const rows = [
    kbRow("gh:walled", "https://boards.example.test/acme/jobs/walled-403"),
    kbRow("gh:moved", "https://boards.example.test/acme/jobs/moved-301"),
    kbRow("gh:opaque", "https://boards.example.test/acme/jobs/opaque"),
    kbRow("gh:nourl", ""),
  ];
  const probed = [];
  const probeUrl = async (url) => {
    probed.push(url);
    if (url.endsWith("walled-403")) return 403;
    if (url.endsWith("moved-301")) return 301;
    return null; // the probe could not confirm anything
  };
  const pool = await loaderWith(rows, { probeUrl }).loadPool();
  assert.equal(pool.deadExcluded, 0);
  assert.equal(pool.postings.length, 4, "nothing unconfirmed is ever excluded");
  assert.ok(!probed.includes(""), "a posting with no URL is never probed — it serves as today");
});

test("liveness: a duplicated dead URL is probed once per load and every posting carrying it is excluded", async () => {
  const rows = [kbRow("gh:dup-a", URLS.missing), kbRow("gh:dup-b", URLS.missing), kbRow("gh:live2", URLS.live)];
  const calls = [];
  const pool = await loaderWith(rows, { probeUrl: stubProbe(calls) }).loadPool();
  assert.deepEqual(pool.postings.map((p) => p.url), [URLS.live]);
  assert.equal(pool.deadExcluded, 2, "deadExcluded counts excluded postings, not probed URLs");
  assert.equal(calls.filter((u) => u === URLS.missing).length, 1, "the per-load cache probes a distinct URL once");
});

test("liveness: probing is concurrency-capped across the window", async () => {
  const rows = [];
  for (let i = 0; i < 24; i += 1) rows.push(kbRow(`gh:cap-${i}`, `https://boards.example.test/acme/jobs/cap-${i}`));
  let inFlight = 0; let maxInFlight = 0;
  const probeUrl = async () => {
    inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return 200;
  };
  const pool = await loaderWith(rows, { probeUrl }).loadPool();
  assert.equal(pool.postings.length, 24);
  assert.ok(maxInFlight > 1 && maxInFlight <= 8, `probes ran in parallel but capped (saw ${maxInFlight})`);
});

test("liveness: with no probe injected the loader serves exactly as base, and a failed KB read reports deadExcluded 0", async () => {
  const pool = await loaderWith(fixtureRows()).loadPool();
  assert.equal(pool.postings.length, 4, "no probe bound -> no exclusion (composition roots opt in)");
  assert.equal(pool.deadExcluded, 0);
  const failed = await CareerPool.createKbPoolLoader({
    jobs: JOBS, probeUrl: stubProbe(),
    readRows: async () => { throw new Error("kb down"); },
  }).loadPool();
  assert.deepEqual(failed.postings, []);
  assert.equal(failed.error, "KB_POOL_READ_FAILED");
  assert.equal(failed.deadExcluded, 0);
});

test("fetch probe: HEAD answers first — a definitive HEAD status needs no GET", async () => {
  const calls = [];
  const probe = CareerPool.createFetchProbe({
    fetchImpl: async (url, init) => { calls.push(init.method); return { status: 404 }; },
  });
  assert.equal(await probe("https://boards.example.test/x"), 404);
  assert.deepEqual(calls, ["HEAD"], "no ranged GET when HEAD is definitive");
});

test("fetch probe: HEAD transport failure falls back to a ranged GET; its 410 is the verdict", async () => {
  const calls = [];
  const probe = CareerPool.createFetchProbe({
    fetchImpl: async (url, init) => {
      calls.push(init);
      if (init.method === "HEAD") throw new Error("HEAD refused (fixture)");
      return { status: 410 };
    },
  });
  assert.equal(await probe("https://boards.example.test/x"), 410);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, "GET");
  assert.equal(calls[1].headers.Range, "bytes=0-0", "the fallback GET is ranged, never a full-body fetch");
});

test("fetch probe: a server that refuses HEAD (405) falls back to the ranged GET", async () => {
  const probe = CareerPool.createFetchProbe({
    fetchImpl: async (url, init) => ({ status: init.method === "HEAD" ? 405 : 200 }),
  });
  assert.equal(await probe("https://boards.example.test/x"), 200);
});

test("fetch probe: total failure and a hanging fetch both resolve null (UNCONFIRMED), never a throw, never a hang", async () => {
  const dead = CareerPool.createFetchProbe({ fetchImpl: async () => { throw new Error("network down (fixture)"); } });
  assert.equal(await dead("https://boards.example.test/x"), null);
  const hanging = CareerPool.createFetchProbe({
    timeoutMs: 25,
    fetchImpl: () => new Promise(() => {}),
  });
  const started = Date.now();
  assert.equal(await hanging("https://boards.example.test/x"), null);
  assert.ok(Date.now() - started < 2000, "the probe is time-boxed");
});
