// ALERT G1 (bug law: BUG-090): the standing watch loop. Module 121 detects new postings
// (poll/diffNew/scoreFit) but nothing ever called it unattended — the product detected only
// when asked. 151-career-alert-watch.js is that caller at harness/host tier: load prior
// snapshot -> 121.poll (real code path, fixture feeds via its opts.fetch seam) -> G6 gate
// (seniority_band in {intern, new_grad} AND watched family AND scoreFit not hard-excluded)
// -> typed alert record to the injected sink -> snapshot persisted by 121.poll.
// Removals are counted, never alerted. One board failing degrades that board only (G7:
// per-board hard deadline at the watch level).
// Check: node --test tests/career-alert-watch.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));
const W = require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js"));

const T0 = Date.parse("2026-10-14T12:00:00.000Z");
const MIN = 60000;

// ---- profile in the 121 scoreFit shape (profileFromPersona output shape), MOCK ----
const PROFILE = {
  skills: [
    { name: "Python", proven: true, fact_id: "F-010" },
    { name: "React", proven: true, fact_id: "F-011" },
    { name: "Rust", proven: false, fact_id: "F-099" },
  ],
  degree: "B.S. Computer Science + Finance, class of 2029",
  level: "student",
  experience_years: 1,
  experience_text: "built Python data pipelines and a React dashboard for finance analysts",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2029, clearance: null, locations: ["New York", "Chicago"] },
  preferences: { role_families: ["Finance", "SWE"], locations: ["New York", "Chicago"], starred_companies: [] },
};

// ---- fixture boards (recorded Greenhouse/Lever shapes, MOCK postings) ----
const ghJob = (id, title, postedMs, extra) => Object.assign({
  id, title,
  location: { name: "New York, NY" },
  absolute_url: `https://boards.greenhouse.io/watchco/jobs/${id}`,
  first_published: new Date(postedMs).toISOString(),
  requisition_id: `REQ-${id}`,
  departments: [{ name: "Finance" }],
  content: "&lt;p&gt;Work in Python and React with the finance team. Salary range $30/hr.&lt;/p&gt;",
}, extra || {});
const leverJob = (id, title, postedMs) => ({
  id, text: title,
  categories: { location: "New York, NY", team: "Engineering" },
  hostedUrl: `https://jobs.lever.co/otherco/${id}`,
  createdAt: postedMs,
  descriptionPlain: "Python and React role for students. Salary range $30/hr.",
});

function makeWorld() {
  const state = {
    gh: { name: "WatchCo", jobs: [] },
    lever: [],
    leverThrows: false,
    leverHangs: false,
    leverBodyHangs: false,
  };
  const fetchImpl = async (url) => {
    if (url.includes("greenhouse")) return { status: 200, json: async () => state.gh };
    if (url.includes("lever")) {
      if (state.leverThrows) throw new Error("lever boom");
      if (state.leverHangs) return new Promise(() => {}); // drip-feed: never resolves (G7)
      if (state.leverBodyHangs) return { status: 200, json: () => new Promise(() => {}) };
      return { status: 200, json: async () => state.lever };
    }
    throw new Error("unexpected url " + url);
  };
  const kv = new Map();
  const store = { get: (k) => (kv.has(k) ? kv.get(k) : null), set: (k, v) => kv.set(k, v) };
  const alerts = [];
  const sink = async (rec) => { alerts.push(rec); };
  const feeds = [J.feeds.greenhouse("watchco"), J.feeds.lever("otherco")];
  const cycle = (now, extra) => W.runWatchCycle(Object.assign(
    { feeds, fetch: fetchImpl, profile: PROFILE, store, sink, now }, extra || {}));
  return { state, store, alerts, cycle };
}

test("G1 seed cycle: first run establishes the baseline and alerts on nothing", async () => {
  const w = makeWorld();
  w.state.gh.jobs.push(ghJob(1, "Finance Intern", T0 - 7 * 24 * 3600 * 1000));
  const r = await w.cycle(T0);
  assert.equal(r.seeded, true);
  assert.equal(r.alerts_emitted, 0);
  assert.equal(w.alerts.length, 0);
  assert.equal(r.new_seen, 1); // diffNew saw it; seeding suppresses the alert, honestly named
  assert.equal(r.errors.length, 0);
});

test("G1+G2: a genuinely new posting emits exactly one typed alert with correct latency math", async () => {
  const w = makeWorld();
  w.state.gh.jobs.push(ghJob(1, "Finance Intern", T0 - 3600000));
  await w.cycle(T0); // seed
  const postedAt = T0 + 10 * MIN;
  w.state.gh.jobs.push(ghJob(2, "Finance Intern, FP&A", postedAt));
  const detectedAt = T0 + 15 * MIN;
  const r = await w.cycle(detectedAt);
  assert.equal(r.seeded, false);
  assert.equal(r.new_seen, 1);
  assert.equal(r.alerts_emitted, 1);
  assert.equal(w.alerts.length, 1);
  const a = w.alerts[0];
  assert.equal(a.type, "career_job_alert");
  assert.equal(a.company, "WatchCo");
  assert.equal(a.title, "Finance Intern, FP&A");
  assert.equal(a.url, "https://boards.greenhouse.io/watchco/jobs/2");
  assert.equal(a.posted_at, new Date(postedAt).toISOString());
  assert.equal(a.detected_at, new Date(detectedAt).toISOString());
  assert.equal(a.latency_seconds, 300); // detected_at - posted_at, exactly
  assert.equal(a.seniority_band, "intern");
  assert.equal(a.role_family, "Finance");
  // fit lines are sourced from the profile's PROVEN facts only, with fact IDs cited
  assert.ok(a.fit_lines.some((l) => /Python/.test(l) && /F-010/.test(l)), JSON.stringify(a.fit_lines));
  assert.ok(!a.fit_lines.some((l) => /Rust/.test(l)), "unproven skill must never source a fit line");
  assert.ok(a.matched_fact_ids.includes("F-010"));
});

test("G6 gate: senior and manager postings produce NO alert even when new", async () => {
  const w = makeWorld();
  w.state.gh.jobs.push(ghJob(1, "Finance Intern", T0 - 3600000));
  await w.cycle(T0);
  w.state.gh.jobs.push(ghJob(2, "Senior Software Engineer", T0 + MIN));
  w.state.gh.jobs.push(ghJob(3, "Engineering Manager", T0 + MIN));
  w.state.gh.jobs.push(ghJob(4, "Director, Product Communications", T0 + MIN));
  const r = await w.cycle(T0 + 15 * MIN);
  assert.equal(r.new_seen, 3);
  assert.equal(r.alerts_emitted, 0);
  assert.equal(w.alerts.length, 0);
  assert.equal(r.gated_out, 3);
});

test("G6 gate: a new intern posting outside the watched families produces NO alert", async () => {
  const w = makeWorld();
  w.state.gh.jobs.push(ghJob(1, "Finance Intern", T0 - 3600000));
  await w.cycle(T0);
  w.state.gh.jobs.push(ghJob(2, "Marketing Intern", T0 + MIN));
  const r = await w.cycle(T0 + 15 * MIN);
  assert.equal(r.new_seen, 1);
  assert.equal(r.alerts_emitted, 0);
  assert.equal(w.alerts.length, 0);
});

test("G6 gate: a hard-excluded intern posting (scoreFit) produces NO alert", async () => {
  const w = makeWorld();
  w.state.gh.jobs.push(ghJob(1, "Finance Intern", T0 - 3600000));
  await w.cycle(T0);
  // citizens-only + clearance: the US-citizen profile still fails the clearance hard filter
  w.state.gh.jobs.push(ghJob(2, "Finance Intern", T0 + MIN, {
    content: "&lt;p&gt;Python role. Requires a TS/SCI security clearance.&lt;/p&gt;",
  }));
  const r = await w.cycle(T0 + 15 * MIN);
  assert.equal(r.alerts_emitted, 0);
  assert.equal(w.alerts.length, 0);
});

test("no duplicates: a second cycle over the same board state emits nothing new", async () => {
  const w = makeWorld();
  w.state.gh.jobs.push(ghJob(1, "Finance Intern", T0 - 3600000));
  await w.cycle(T0);
  w.state.gh.jobs.push(ghJob(2, "Software Engineering Intern", T0 + MIN));
  const r1 = await w.cycle(T0 + 15 * MIN);
  assert.equal(r1.alerts_emitted, 1);
  const r2 = await w.cycle(T0 + 30 * MIN);
  assert.equal(r2.new_seen, 0);
  assert.equal(r2.alerts_emitted, 0);
  assert.equal(w.alerts.length, 1); // still exactly one, total
});

test("removals are counted silently: a posting that disappears never alerts", async () => {
  const w = makeWorld();
  w.state.gh.jobs.push(ghJob(1, "Finance Intern", T0 - 3600000), ghJob(2, "Finance Intern, Risk", T0 - 7200000));
  w.state.lever.push(leverJob("l1", "Software Engineering Intern", T0 - 3600000));
  await w.cycle(T0);
  w.state.gh.jobs.splice(1, 1); // job 2 removed from the board
  const r = await w.cycle(T0 + 15 * MIN);
  assert.equal(r.removed, 1);
  assert.equal(r.alerts_emitted, 0);
  assert.equal(w.alerts.length, 0);
});

test("per-board degradation: one board throwing names that board in errors[], the rest still process", async () => {
  const w = makeWorld();
  w.state.gh.jobs.push(ghJob(1, "Finance Intern", T0 - 3600000));
  await w.cycle(T0);
  w.state.leverThrows = true;
  w.state.gh.jobs.push(ghJob(2, "Finance Intern, Treasury", T0 + MIN));
  const r = await w.cycle(T0 + 15 * MIN);
  assert.equal(r.alerts_emitted, 1); // greenhouse board still processed end to end
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].board, "otherco");
  assert.match(r.errors[0].error, /lever boom/);
  assert.equal(r.status, "degraded");
});

test("G7 deadline: a board whose fetch never resolves is cut off at the watch-level deadline", async () => {
  const w = makeWorld();
  w.state.gh.jobs.push(ghJob(1, "Finance Intern", T0 - 3600000));
  await w.cycle(T0);
  w.state.leverHangs = true;
  const started = Date.now();
  const r = await w.cycle(T0 + 15 * MIN, { boardDeadlineMs: 60 });
  assert.ok(Date.now() - started < 10000, "cycle must not hang on a drip-feeding board");
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].board, "otherco");
  assert.match(r.errors[0].error, /deadline/i);
});

test("cycle result is typed and complete", async () => {
  const w = makeWorld();
  w.state.gh.jobs.push(ghJob(1, "Finance Intern", T0 - 3600000));
  const r = await w.cycle(T0);
  for (const k of ["polled", "new_seen", "alerts_emitted", "removed", "errors"])
    assert.ok(k in r, `cycle result missing ${k}`);
  assert.ok(Array.isArray(r.errors));
  assert.equal(typeof r.polled, "number");
});

// Same actual watch API, but headers arrive and its body never settles.
test("G7 body deadline keeps an awaited Node22 cycle live until its bounded failure", async () => {
  const w = makeWorld();
  await w.cycle(T0);
  w.state.leverBodyHangs = true;
  const started = Date.now();
  const r = await w.cycle(T0 + 15 * MIN, { boardDeadlineMs: 60 });
  assert.ok(Date.now() - started < 10000, "the body read must not hang");
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].board, "otherco");
  assert.match(r.errors[0].error, /deadline/i);
});
