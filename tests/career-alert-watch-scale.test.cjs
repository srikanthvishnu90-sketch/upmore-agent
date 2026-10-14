// ALERT SCALE WAVE (bug law: BUG-091..097): the watch grows from 19 hardcoded boards
// to a product-data board directory, an adaptive cadence, and any-occupation alerting.
// Each test names the defect it guards:
//   BUG-091 subset/cadence polling must never corrupt the seen-set (per-board snapshots)
//   BUG-092 a repost under a new req id must not double-alert the same seat
//   BUG-093 a board recovering from an outage must not dump its back-catalog as "new"
//   BUG-094 backdated board timestamps must be flagged, never read as fresh latency
//   BUG-095 the alert gate must serve ANY occupation, not only student intern/new-grad
//   BUG-096 the watch list comes from a verified product-data directory, not a hardcoded 13/19
//   BUG-097 (121, gap G5) profileFromPersona must not bake fact annotations into skill names
// Check: node --test tests/career-alert-watch-scale.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));
const W = require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js"));

const T0 = Date.parse("2026-10-14T12:00:00.000Z");
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

// ---------- profiles (MOCK, 121 scoreFit shape) ----------
const STUDENT = {
  skills: [{ name: "Python", proven: true, fact_id: "F-010" }, { name: "React", proven: true, fact_id: "F-011" }],
  degree: "B.S. Computer Science + Finance, class of 2029", level: "student", experience_years: 1,
  experience_text: "built Python data pipelines and a React dashboard for finance analysts",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2029, clearance: null, locations: ["New York", "Chicago"] },
  preferences: { role_families: ["Finance", "SWE"], locations: ["New York", "Chicago"], starred_companies: [] },
};
const TRADES = {
  skills: [{ name: "Conduit Bending", proven: true, fact_id: "F-201" }],
  degree: "", level: "mid", experience_years: 6,
  experience_text: "commercial electrical build-outs, conduit, panels, lighting",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: null, clearance: null, locations: ["New York"] },
  preferences: { locations: ["New York"], starred_companies: [], alert_bands: ["mid", "senior"],
    watched_occupations: [{ occupation: "Electricians", terms: ["electrician"] }] },
};

// ---------- fixture boards ----------
const ghJob = (id, title, postedMs, extra) => Object.assign({
  id, title, location: { name: "New York, NY" },
  absolute_url: `https://boards.greenhouse.io/x/jobs/${id}`,
  first_published: new Date(postedMs).toISOString(), requisition_id: `REQ-${id}`,
  departments: [{ name: "Finance" }],
  content: "&lt;p&gt;Work in Python and React with the finance team. Salary range $30/hr.&lt;/p&gt;",
}, extra || {});
const leverJob = (id, title, postedMs, extra) => Object.assign({
  id, text: title, categories: { location: "New York, NY", team: "Engineering" },
  hostedUrl: `https://jobs.lever.co/x/${id}`, createdAt: postedMs,
  descriptionPlain: "Python and React role. Salary range $30/hr.",
}, extra || {});

function world() {
  const boards = {
    acme: { kind: "gh", name: "Acme Corp", jobs: [] },
    acmelever: { kind: "lever", name: "Acme Corp", jobs: [] },
    blind: { kind: "gh", name: "Blind Co", jobs: [], down: false },
  };
  const fetchImpl = async (url) => {
    const b = Object.values(boards).find((x) => url.includes(x.urlmark));
    if (!b) return { status: 404, json: async () => ({}) };
    if (b.down) throw new Error("board unreachable");
    if (b.kind === "gh") return { status: 200, json: async () => ({ name: b.name, jobs: b.jobs }) };
    return { status: 200, json: async () => b.jobs };
  };
  boards.acme.urlmark = "boards/acme/jobs"; boards.acmelever.urlmark = "postings/acmelever"; boards.blind.urlmark = "boards/blindco/jobs";
  const feeds = [
    { source: "greenhouse", company_token: "acme", url: "https://boards-api.greenhouse.io/v1/boards/acme/jobs", company: "Acme Corp" },
    { source: "lever", company_token: "acmelever", url: "https://api.lever.co/v0/postings/acmelever?mode=json", company: "Acme Corp" },
    { source: "greenhouse", company_token: "blindco", url: "https://boards-api.greenhouse.io/v1/boards/blindco/jobs", company: "Blind Co" },
  ];
  return { boards, feeds, fetchImpl };
}
const feedSubset = (feeds, tokens) => feeds.filter((f) => tokens.includes(f.company_token));

// ================= BUG-096: directory-driven feeds =================
test("BUG-096 feedsFromDirectory: live entries only, Greenhouse detection URL carries no full text (G4)", () => {
  assert.equal(typeof W.feedsFromDirectory, "function", "151 must build feeds from a board directory");
  const feeds = W.feedsFromDirectory([
    { company: "Acme Corp", provider: "greenhouse", board_token: "acme", status: "live", last_verified: "2026-10-14" },
    { company: "Gone Co", provider: "greenhouse", board_token: "goneco", status: "dead", last_verified: "2026-10-14" },
    { company: "Lev Co", provider: "lever", board_token: "levco", status: "live", last_verified: "2026-10-14" },
    { company: "Ash Co", provider: "ashby", board_token: "ashco", status: "live", last_verified: "2026-10-14" },
  ]);
  assert.equal(feeds.length, 3);
  const gh = feeds.find((f) => f.source === "greenhouse");
  assert.equal(gh.url, "https://boards-api.greenhouse.io/v1/boards/acme/jobs", "list mode: no ?content=true on the detection pass");
  assert.equal(gh.company, "Acme Corp");
  assert.ok(feeds.find((f) => f.source === "lever" && f.url.includes("api.lever.co/v0/postings/levco")));
  assert.ok(feeds.find((f) => f.source === "ashby" && f.url.includes("api.ashbyhq.com/posting-api/job-board/ashco")));
  const withContent = W.feedsFromDirectory([{ company: "Acme Corp", provider: "greenhouse", board_token: "acme", status: "live" }], { content: true });
  assert.ok(withContent[0].url.includes("content=true"), "content mode stays available when a caller asks for full text");
});

// ================= adaptive cadence math =================
test("cadence: planCadence tiers by observed posting velocity, starred cap, error backoff", () => {
  assert.equal(typeof W.planCadence, "function");
  assert.equal(W.planCadence({ cycles_observed: 0 }).interval_minutes, 60, "unobserved board starts standard");
  assert.equal(W.planCadence({ cycles_observed: 1, ewma_new_per_day: 0 }).interval_minutes, 60, "one quiet cycle is unknown velocity, not zero velocity");
  assert.equal(W.planCadence({ cycles_observed: 5, ewma_new_per_day: 3 }).interval_minutes, 5, "hot board: >=2 new/day");
  assert.equal(W.planCadence({ cycles_observed: 5, ewma_new_per_day: 0.5 }).interval_minutes, 15, "active board");
  assert.equal(W.planCadence({ cycles_observed: 5, ewma_new_per_day: 0.05 }).interval_minutes, 60, "standard board");
  assert.equal(W.planCadence({ cycles_observed: 5, ewma_new_per_day: 0 }).interval_minutes, 240, "quiet board");
  assert.equal(W.planCadence({ cycles_observed: 5, ewma_new_per_day: 0, starred: true }).interval_minutes, 15, "starred never slower than 15");
  assert.equal(W.planCadence({ cycles_observed: 5, ewma_new_per_day: 0.05, consecutive_errors: 1 }).interval_minutes, 120, "one error doubles");
  assert.equal(W.planCadence({ cycles_observed: 5, ewma_new_per_day: 3, consecutive_errors: 2 }).interval_minutes, 240, "two errors park the board at the cap");
});

// ================= BUG-094: posted_at quality =================
test("BUG-094 composeAlert flags backdated and missing board timestamps", () => {
  const posting = { job_id: "j1", company: "Acme", title: "Finance Intern", url: "u", location: "New York, NY", role_family: "Finance", seniority_band: "intern", source: "greenhouse" };
  const fresh = W.composeAlert(Object.assign({}, posting, { posted_at: new Date(T0 - HOUR).toISOString() }), null, STUDENT, T0);
  assert.equal(fresh.posted_at_quality, "fresh");
  assert.equal(fresh.latency_seconds, 3600);
  const back = W.composeAlert(Object.assign({}, posting, { posted_at: new Date(T0 - 10 * DAY).toISOString() }), null, STUDENT, T0);
  assert.equal(back.posted_at_quality, "backdated", "a 10-day-old first_published at first sight is a board-clock artifact, not a 10-day detection latency");
  const missing = W.composeAlert(Object.assign({}, posting, { posted_at: null }), null, STUDENT, T0);
  assert.equal(missing.posted_at_quality, "missing");
  assert.equal(missing.latency_seconds, null);
});

// ================= BUG-095: any-occupation gate =================
test("BUG-095 gatePosting: profile bands + watched occupations open the gate beyond student roles", () => {
  const elec = { job_id: "e1", company: "BuildCo", title: "Journeyman Electrician", url: "u", location: "New York, NY", role_family: "Other", seniority_band: "mid", source: "greenhouse", jd_text: "Commercial build-outs: conduit, panels, lighting.", posted_at: new Date(T0).toISOString() };
  const fit = J.scoreFit(elec, TRADES);
  assert.equal(fit.excluded, false, "fixture sanity: the trades profile is not hard-excluded");
  const g1 = W.gatePosting(elec, TRADES, fit, []);
  assert.equal(g1.pass, true, `a watched occupation at a watched band must pass (got: ${g1.reasons.join("; ")})`);
  const g2 = W.gatePosting(elec, STUDENT, J.scoreFit(elec, STUDENT), ["Finance", "SWE"]);
  assert.equal(g2.pass, false, "the default student profile still rejects a mid-band trades role");
  const fin = { job_id: "f1", company: "Acme", title: "Finance Intern", url: "u", location: "New York, NY", role_family: "Finance", seniority_band: "intern", source: "greenhouse", jd_text: "Python models.", posted_at: new Date(T0).toISOString() };
  const g3 = W.gatePosting(fin, TRADES, J.scoreFit(fin, TRADES), []);
  assert.equal(g3.pass, false, "an occupation watcher is not alerted for unwatched families/bands");
});

// ================= BUG-091: per-board snapshot isolation =================
test("BUG-091 adaptive cycle: polling one board never re-alerts another board's unchanged postings", async () => {
  const { boards, feeds, fetchImpl } = world();
  const store = W.createMemoryStore();
  const delivered = [];
  const sink = async (r) => { delivered.push(r); };
  const base = { feeds, fetch: fetchImpl, profile: STUDENT, store, sink };
  boards.acme.jobs = [ghJob(1, "Finance Intern", T0 - DAY)];
  boards.acmelever.jobs = [leverJob(11, "Data Intern", T0 - DAY)];
  const c1 = await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 }));
  assert.equal(c1.alerts_delivered, 0, "seed cycle alerts on nothing");
  boards.acme.jobs.push(ghJob(2, "Finance Intern", T0 + 4 * MIN));
  const c2 = await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 + 5 * MIN, dueBoardIds: ["greenhouse:acme"] }));
  assert.equal(c2.alerts_delivered, 1, "the genuinely new posting on the polled board alerts");
  const c3 = await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 + 10 * MIN, dueBoardIds: ["lever:acmelever"] }));
  assert.equal(c3.alerts_delivered, 0, "the untouched board's old postings must NOT re-fire after subset cycles");
  assert.equal(delivered.length, 1);
  const snapKeys = [...store._kv.keys()].filter((k) => k.includes("snapshot"));
  assert.ok(snapKeys.length >= 2, `each board keeps its own snapshot key (got ${snapKeys.join(", ")})`);
});

// ================= BUG-092: repost suppression =================
test("BUG-092 repost under a new req id is suppressed; a simultaneous second req still alerts", async () => {
  const { boards, feeds, fetchImpl } = world();
  const store = W.createMemoryStore();
  const delivered = [];
  const sink = async (r) => { delivered.push(r); };
  const only = feedSubset(feeds, ["acme"]);
  const base = { feeds: only, fetch: fetchImpl, profile: STUDENT, store, sink, dueBoardIds: ["greenhouse:acme"] };
  await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 })); // seed (empty board)
  boards.acme.jobs = [ghJob(1, "Finance Intern", T0 + MIN)];
  const c2 = await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 + 2 * MIN }));
  assert.equal(c2.alerts_delivered, 1, "first sighting alerts");
  boards.acme.jobs = [ghJob(2, "Finance Intern", T0 + 3 * MIN)]; // req 1 closed, same seat reposted as req 2
  const c3 = await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 + 4 * MIN }));
  assert.equal(c3.alerts_delivered, 0, "the repost of the same seat must not alert twice");
  assert.equal(c3.suppressed.reposts.length, 1);
  boards.acme.jobs = [ghJob(2, "Finance Intern", T0 + 3 * MIN), ghJob(3, "Finance Intern", T0 + 5 * MIN)];
  const c4 = await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 + 6 * MIN }));
  assert.equal(c4.alerts_delivered, 1, "a second simultaneous req for the same title is a distinct opening and alerts");
  assert.equal(delivered.length, 2);
});

// ================= BUG-093: recovery burst =================
test("BUG-093 a board recovering from an outage absorbs its pre-outage catalog, alerts only blind-window postings", async () => {
  const { boards, feeds, fetchImpl } = world();
  const store = W.createMemoryStore();
  const delivered = [];
  const sink = async (r) => { delivered.push(r); };
  const only = feedSubset(feeds, ["blindco"]);
  const base = { feeds: only, fetch: fetchImpl, profile: STUDENT, store, sink, dueBoardIds: ["greenhouse:blindco"] };
  boards.blind.down = true;
  const c1 = await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 }));
  assert.equal(c1.boards_polled, 1);
  boards.blind.down = false;
  boards.blind.jobs = [
    ghJob(1, "Finance Intern", T0 - 20 * DAY),   // existed long before we ever saw this board
    ghJob(2, "Finance Intern", T0 + 10 * MIN),   // published while the board was blind to us
  ];
  // board-names in the fixture are keyed by url token; align company names for the gate
  boards.blind.jobs.forEach((j) => { j.absolute_url = `https://boards.greenhouse.io/blindco/jobs/${j.id}`; });
  const c2 = await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 + 30 * MIN }));
  assert.equal(c2.alerts_delivered, 1, `only the blind-window posting alerts (got ${c2.alerts_delivered}; suppressed=${JSON.stringify(c2.suppressed)})`);
  assert.equal(c2.suppressed.recovered_absorbed.length, 1, "the pre-outage posting is absorbed into the baseline silently");
  assert.equal(delivered[0].title, "Finance Intern");
  assert.ok(Date.parse(delivered[0].posted_at) >= T0, "the delivered alert is the one posted during the blind window");
});

// ================= cross-board duplicate =================
test("cross-board duplicate: the same seat on two boards in one cycle alerts once", async () => {
  const { boards, feeds, fetchImpl } = world();
  const store = W.createMemoryStore();
  const delivered = [];
  const sink = async (r) => { delivered.push(r); };
  const base = { feeds, fetch: fetchImpl, profile: STUDENT, store, sink };
  await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 })); // seed, both boards empty of this role
  boards.acme.jobs = [ghJob(1, "Finance Intern", T0 + MIN)];
  boards.acmelever.jobs = [leverJob(9, "Finance Intern", T0 + MIN)];
  const c2 = await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 + 2 * MIN, dueBoardIds: ["greenhouse:acme", "lever:acmelever"] }));
  assert.equal(c2.alerts_delivered, 1, "same company + title + city on two boards is one seat");
  assert.equal(c2.suppressed.cross_board_duplicates.length, 1);
});

// ================= BUG-097 (121 / G5): annotated skill names =================
test("BUG-097 profileFromPersona: fact annotations never become part of a skill name", () => {
  const persona = { facts: [
    { kind: "skill", text: "SQL (listed in the resume's Skills line; no resume body bullet names SQL)", unproven: true, evidence: [], fact_id: "F-013" },
    { kind: "skill", text: "Python (used in two internships)", unproven: false, evidence: ["x"], fact_id: "F-010" },
  ] };
  const p1 = J.profileFromPersona(persona);
  assert.equal(p1.skills[0].name, "SQL");
  assert.ok((p1.skills[0].name_note || "").includes("Skills line"), "the annotation is preserved as a note, not deleted");
  assert.equal(p1.skills[1].name, "Python");
  const p2 = J.profileFromPersona(Object.assign({}, persona, { constraints: {}, preferences: {} }));
  assert.equal(p2.skills[0].name, "SQL", "the canonical-schema path strips the annotation too");
});

// ================= BUG-105: the G7 deadline must bound the BODY read =================
test("BUG-105: a body that never finishes cannot stall the cycle past the deadline", async () => {
  const feed = { source: "greenhouse", company: "Drip Co", company_token: "dripco", label: "greenhouse: dripco", url: "https://fixture.invalid/dripco/jobs", jobs_url: "https://fixture.invalid/dripco" };
  // Headers land instantly; json() never resolves (a drip-feeding body).
  const dripFetch = async () => ({ status: 200, ok: true, headers: { get: () => null }, json: () => new Promise(() => {}), text: () => new Promise(() => {}) });
  const store = W.createMemoryStore();
  const started = Date.now();
  const res = await Promise.race([
    W.runWatchCycle({ feeds: [feed], fetch: dripFetch, profile: STUDENT, store, sink: async () => {}, now: T0, boardDeadlineMs: 200 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("cycle stalled past 3000ms — BUG-105 is back")), 3000)),
  ]);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 3000, `cycle completed within the watchdog bound (${elapsed}ms)`);
  assert.equal(res.errors.length, 1, "the drip-feeding board lands in errors[], not silently waited on");
  assert.match(res.errors[0].error, /deadline/, "the failure is the G7 deadline, named as such");
  assert.equal(res.alerts_emitted, 0);
});
