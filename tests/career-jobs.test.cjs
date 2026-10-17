// DISC-003..008 (Doc 2 section 2): ATS feed normalization, dedupe, new-posting detection, ghost
// flags, fit scoring, shortlist feedback. Fixtures are RECORDED-SHAPE (the field layouts the public
// Greenhouse/Lever/Ashby/SmartRecruiters endpoints return; Lever's shape was read off the live
// leverdemo feed 2026-10-12) — the postings themselves are MOCK. Real-feed proof lives in
// scripts/career/proof-jobs.mjs + docs/career/evidence/jobs-feeds.json, not here.
// Check: node --test tests/career-jobs.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));

const NOW = Date.parse("2026-10-12T12:00:00Z");

// ---- recorded-shape fixtures (MOCK postings) ----
const GH = { name: "Stripe", jobs: [
  { id: 555001, title: "Software Engineer, New Grad", location: { name: "San Francisco, CA" }, absolute_url: "https://boards.greenhouse.io/stripe/jobs/555001", first_published: "2026-10-09T00:00:00Z", updated_at: "2026-10-10T00:00:00Z", requisition_id: "REQ-100", departments: [{ name: "Engineering" }], content: "&lt;p&gt;Join our team building payments in Python and React. Salary range $120,000 - $150,000.&lt;/p&gt;" },
  { id: 555002, title: "Senior Software Engineer", location: { name: "New York, NY" }, absolute_url: "https://boards.greenhouse.io/stripe/jobs/555002", updated_at: "2026-07-15T00:00:00Z", requisition_id: "REQ-101", departments: [{ name: "Engineering" }], content: "&lt;p&gt;Requires US citizenship. 7+ years of experience required. PhD required.&lt;/p&gt;" },
]};
const LEVER = [
  // MI-051/LA-0016 (2026-10-15): a cross-post carries the employer's
  // SAME JD text (the old fixture text was a meta-description, "Same
  // cross-posted role on Lever", which no real syndication carries).
  // Dedupe identity now requires same-text (121 sameJdText), so the
  // fixture stages the syndication it claims to test.
  { id: "lev-1", text: "Software Engineer, New Grad", categories: { location: "San Francisco, California", team: "Engineering", commitment: "Full-time" }, hostedUrl: "https://jobs.lever.co/stripe/lev-1", createdAt: Date.parse("2026-10-09T00:00:00Z"), descriptionPlain: "Join our team building payments in Python and React. Salary range $120,000 - $150,000." },
  { id: "lev-2", text: "Investment Banking Analyst", categories: { location: "Chicago, IL", team: "Finance" }, hostedUrl: "https://jobs.lever.co/leverdemo/lev-2", createdAt: Date.parse("2026-10-11T00:00:00Z"), descriptionPlain: "Financial modeling, DCF and comps for a finance team." },
];
const ASHBY = { name: "Ramp", jobs: [
  { id: "ash-1", title: "Software Engineering Intern", location: "New York, NY", departmentName: "Engineering", jobUrl: "https://jobs.ashbyhq.com/ramp/ash-1", publishedAt: "2026-10-11T00:00:00Z", descriptionPlain: "Internship for students graduating 2028. Python and React. Compensation range $40/hr." },
]};
const SR = { content: [
  { id: "sr-1", name: "Quantitative Trader", company: { name: "Jane Street" }, location: { city: "New York", region: "NY", country: "US" }, ref: "JS-9", releasedDate: "2026-10-08T00:00:00Z", department: { label: "Trading" }, jobAd: { sections: { description: { text: "Trading team. Probability and Python." }, qualifications: { text: "No sponsorship available. Must work without sponsorship." } } } },
]};

const PROFILE = { // MOCK profile in the APPE-001-derived shape (see profileFromPersona)
  skills: [{ name: "Python", proven: true }, { name: "React", proven: true }, { name: "Kubernetes / EKS", proven: true }, { name: "Rust", proven: false }],
  degree: "B.S. Computer Science, class of 2028", level: "student", experience_years: 1,
  experience_text: "built a dashboard in Python and React with PostgreSQL for analysts; Kubernetes log pipeline",
  constraints: { work_authorization: "needs sponsorship (F-1 OPT)", needs_sponsorship: true, graduation_year: 2028, clearance: null, locations: ["San Francisco", "New York", "Chicago"] },
  preferences: { role_families: ["SWE", "Finance"], locations: ["San Francisco", "New York", "Chicago"], starred_companies: ["Stripe"] },
};
const CITIZEN = Object.assign({}, PROFILE, { constraints: Object.assign({}, PROFILE.constraints, { work_authorization: "US citizen", needs_sponsorship: false }) });

test("DISC-003 greenhouse normalization: stable id, family, band, jd text unescaped", () => {
  const [p] = J.normalizeGreenhouse(GH, "stripe");
  assert.equal(p.job_id, "greenhouse:stripe:REQ-100");
  assert.equal(p.company, "Stripe"); assert.equal(p.role_family, "SWE"); assert.equal(p.seniority_band, "new_grad");
  assert.match(p.jd_text, /Python and React/); assert.equal(p.source, "greenhouse"); assert.ok(p.posted_at);
});
test("DISC-003 lever normalization (recorded shape: text/categories/hostedUrl/createdAt ms)", () => {
  const ps = J.normalizeLever(LEVER, "stripe");
  assert.equal(ps[0].title, "Software Engineer, New Grad"); assert.equal(ps[0].posted_at, "2026-10-09T00:00:00.000Z");
  const fin = J.normalizeLever(LEVER, "leverdemo")[1];
  assert.equal(fin.role_family, "Finance");
});
test("DISC-003 ashby + smartrecruiters normalization", () => {
  const [a] = J.normalizeAshby(ASHBY, "ramp");
  assert.equal(a.seniority_band, "intern"); assert.equal(a.company, "Ramp"); assert.equal(a.department, "Engineering");
  const [sr] = J.normalizeSmartRecruiters(SR, "JaneStreet");
  assert.equal(sr.company, "Jane Street"); assert.equal(sr.role_family, "Finance"); assert.match(sr.location, /New York/); assert.match(sr.jd_text, /No sponsorship/);
});
test("DISC-003 feed URLs are the exact Appendix B.2 endpoints", () => {
  assert.equal(J.feeds.greenhouse("stripe").url, "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true");
  assert.equal(J.feeds.lever("acme").url, "https://api.lever.co/v0/postings/acme?mode=json");
  assert.equal(J.feeds.ashby("ramp").url, "https://api.ashbyhq.com/posting-api/job-board/ramp");
  assert.equal(J.feeds.smartrecruiters("Acme").url, "https://api.smartrecruiters.com/v1/companies/Acme/postings");
});
test("DISC-003 fetchFeed never throws on HTTP error; the failure is recorded", async () => {
  const r = await J.fetchFeed(J.feeds.greenhouse("nope"), { fetch: async () => ({ status: 404, json: async () => ({}) }) });
  assert.equal(r.status, 404); assert.deepEqual(r.postings, []); assert.match(r.error, /404/);
});
test("DISC-003 dedupe: same role cross-posted on two boards collapses, both URLs kept (regression: req ids are source-scoped)", () => {
  // BUG-226/FR-384 (2026-10-15): the Lever side is staged the way
  // production fetches it — the board descriptor states the company
  // ("Stripe"); a Lever payload never names one, and the board token
  // alone is an address, not a company (TN-1a feed path).
  const all = [...J.normalizeGreenhouse(GH, "stripe"), ...J.normalizeLever(LEVER.slice(0, 1), "stripe", "Stripe")];
  const dd = J.dedupe(all);
  const role = dd.filter((p) => /New Grad/.test(p.title));
  assert.equal(role.length, 1, JSON.stringify(dd.map((p) => p.job_id)));
  assert.equal(role[0].source_urls.length, 2); assert.deepEqual(role[0].sources.sort(), ["greenhouse", "lever"]);
});
test("DISC-003 dedupe: two distinct reqs on the SAME board stay separate", () => {
  const two = J.normalizeGreenhouse({ name: "Stripe", jobs: [GH.jobs[0], Object.assign({}, GH.jobs[0], { id: 555777, requisition_id: "REQ-777", absolute_url: "https://boards.greenhouse.io/stripe/jobs/555777" })] }, "stripe");
  assert.equal(J.dedupe(two).length, 2);
});
test("DISC-004 diff: only genuinely new postings fire; unchanged second poll is empty", async () => {
  const kv = new Map(); const store = { get: (k) => kv.get(k) || null, set: (k, v) => kv.set(k, v) };
  const fetchGH = async () => ({ status: 200, json: async () => GH });
  const p1 = await J.poll([J.feeds.greenhouse("stripe")], { fetch: fetchGH, store, now: NOW });
  assert.equal(p1.new_postings.length, 2);
  const p2 = await J.poll([J.feeds.greenhouse("stripe")], { fetch: fetchGH, store, now: NOW + 900000 });
  assert.deepEqual(p2.new_postings, []);
  const GH2 = { name: "Stripe", jobs: [...GH.jobs, Object.assign({}, GH.jobs[0], { id: 555999, requisition_id: "REQ-999", absolute_url: "https://x/555999", title: "Data Engineer" })] };
  const p3 = await J.poll([J.feeds.greenhouse("stripe")], { fetch: async () => ({ status: 200, json: async () => GH2 }), store, now: NOW + 1800000 });
  assert.deepEqual(p3.new_postings.map((p) => p.title), ["Data Engineer"]);
});
test("DISC-008 ghost flags: 94-day reposted role says lower odds in plain language", () => {
  const old = Object.assign({}, J.normalizeGreenhouse(GH, "stripe")[0], { posted_at: new Date(NOW - 94 * 86400000).toISOString(), jd_text: "A role with nothing else.", department: "" });
  const q = J.qualityFlags(old, { now: NOW, repost_count: 2 });
  assert.equal(q.age_days, 94); assert.equal(q.lower_odds, true);
  assert.match(q.summary, /open 94 days, reposted 2 times/); assert.match(q.summary, /— lower odds$/);
  assert.ok(q.flags.some((f) => f.code === "missing_salary"));
});
test("DISC-008 fresh, complete posting has no flags", () => {
  const [p] = J.normalizeGreenhouse(GH, "stripe");
  const q = J.qualityFlags(p, { now: NOW, repost_count: 0 });
  assert.deepEqual(q.flags, []); assert.equal(q.lower_odds, false);
});
test("DISC-005 hard filter: sponsorship case from Doc 2 section 2 — excluded, never scored", () => {
  const [sr] = J.normalizeSmartRecruiters(SR, "JaneStreet");
  const r = J.scoreFit(sr, PROFILE);
  assert.equal(r.excluded, true); assert.equal(r.score, null);
  assert.ok(r.reasons.some((x) => /no sponsorship/.test(x)), JSON.stringify(r.reasons));
});
test("DISC-005 hard filters: citizenship, seniority, degree, clearance, location each exclude with a reason", () => {
  const [, senior] = J.normalizeGreenhouse(GH, "stripe");
  const r = J.scoreFit(senior, CITIZEN); // citizen passes citizenship, still fails seniority/degree/years
  assert.equal(r.excluded, true);
  assert.ok(r.reasons.some((x) => /seniority/.test(x)), JSON.stringify(r.reasons));
  const far = Object.assign({}, J.normalizeAshby(ASHBY, "ramp")[0], { location: "Denver, CO", remote: "onsite" });
  const rl = J.scoreFit(far, CITIZEN);
  assert.equal(rl.excluded, true); assert.ok(rl.reasons.some((x) => /location/.test(x)));
  const cleared = Object.assign({}, far, { location: "New York, NY", jd_text: "Requires TS/SCI security clearance." });
  const rc = J.scoreFit(cleared, CITIZEN);
  assert.equal(rc.excluded, true); assert.ok(rc.reasons.some((x) => /clearance/.test(x)));
});
test("DISC-005 fit score: reasons + gaps always present, bucket from neutral bar; starred company lifts score", () => {
  const [p] = J.normalizeGreenhouse(GH, "stripe");
  const r = J.scoreFit(p, CITIZEN);
  assert.equal(r.excluded, false); assert.ok(r.score >= 50, `score ${r.score}`);
  assert.ok(r.reasons.length >= 2); assert.ok(["Reach", "Match", "Safety"].includes(r.bucket));
  assert.ok(r.matched_skills.includes("Python"));
  const noStar = J.scoreFit(p, Object.assign({}, CITIZEN, { preferences: Object.assign({}, CITIZEN.preferences, { starred_companies: [] }) }));
  assert.ok(r.score > noStar.score);
  const reach = J.scoreFit(p, CITIZEN, { bar: 95 });
  assert.equal(reach.bucket, "Reach"); assert.equal(reach.bar, 95);
});
test("DISC-005 graduation window: intern posting targeting another class year excludes", () => {
  const [a] = J.normalizeAshby(ASHBY, "ramp"); // graduating 2028
  assert.equal(J.scoreFit(a, CITIZEN).excluded, false);
  const wrong = Object.assign({}, CITIZEN, { constraints: Object.assign({}, CITIZEN.constraints, { graduation_year: 2026 }) });
  const r = J.scoreFit(a, wrong);
  assert.equal(r.excluded, true); assert.ok(r.reasons.some((x) => /graduation/.test(x)), JSON.stringify(r.reasons));
});
test("APPE-001 persona fixture adapts: skills w/ evidence, starred companies, citizenship, grad year", () => {
  const persona = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/fixtures/test-persona.json"), "utf8"));
  const prof = J.profileFromPersona(persona);
  assert.equal(prof.persona_id, "TEST-PERSONA-001");
  assert.equal(prof.constraints.needs_sponsorship, false); assert.equal(prof.constraints.graduation_year, 2028);
  assert.ok(prof.preferences.starred_companies.includes("Stripe"));
  const rust = prof.skills.find((x) => x.name === "Rust"); assert.equal(rust.proven, false);
  const [p] = J.normalizeAshby(ASHBY, "ramp"); // NYC intern role, graduating 2028: inside the persona's stated prefs
  const r = J.scoreFit(p, prof);
  assert.equal(r.excluded, false, JSON.stringify(r.reasons)); assert.ok(r.reasons.length, JSON.stringify(r));
});
test("DISC-006 shortlist: top-N, excluded dropped, yes/no feedback memory nudges later scores", async () => {
  const postings = [...J.normalizeGreenhouse(GH, "stripe"), ...J.normalizeAshby(ASHBY, "ramp")];
  const scored = postings.map((p) => Object.assign(J.scoreFit(p, CITIZEN), { posting: p }));
  const base = await J.buildShortlist(scored, { limit: 5 });
  assert.ok(base.length >= 1); assert.ok(base.every((x) => x.score != null));
  const store = [];
  await J.recordFeedback(store, { decision: "no", company: "Stripe", role_family: "SWE", at: "2026-10-12T00:00:00Z" });
  const after = await J.buildShortlist(scored, { limit: 5, feedbackStore: store });
  const stripeBase = base.find((x) => x.posting.company === "Stripe");
  const stripeAfter = after.find((x) => x.posting.company === "Stripe");
  if (stripeBase && stripeAfter) assert.ok(stripeAfter.adjusted_score < stripeBase.adjusted_score, `${stripeAfter.adjusted_score} !< ${stripeBase.adjusted_score}`);
  assert.ok(after.some((x) => x.feedback_nudge !== 0 || x.reasons.some((r) => /passed on/.test(r))), JSON.stringify(after.map((x) => x.feedback_nudge)));
});
test("replay: location alias — persona says NYC, posting says New York, NY (bug found by the persona test)", () => {
  const [a] = J.normalizeAshby(ASHBY, "ramp");
  const prof = Object.assign({}, CITIZEN, { constraints: Object.assign({}, CITIZEN.constraints, { locations: ["NYC", "Chicago"] }), preferences: Object.assign({}, CITIZEN.preferences, { locations: ["NYC", "Chicago"] }) });
  assert.equal(J.scoreFit(a, prof).excluded, false, JSON.stringify(J.scoreFit(a, prof).reasons));
});
test("replay: stripHtml handles Greenhouse-escaped content and entities", () => {
  assert.equal(J.stripHtml("&lt;p&gt;A &amp; B&lt;/p&gt;"), "A & B");
});
test("board registry schema: every entry has provider, board, status, checkedAt, note", () => {
  assert.ok(Array.isArray(J.BOARD_REGISTRY)); assert.ok(J.BOARD_REGISTRY.length >= 17);
  for (const b of J.BOARD_REGISTRY) {
    assert.ok(b.company, JSON.stringify(b)); assert.ok(b.provider, JSON.stringify(b));
    assert.ok(b.board, JSON.stringify(b)); assert.ok(["live", "dead"].includes(b.status), JSON.stringify(b));
    assert.equal(b.checkedAt, "2026-10-13"); assert.ok(b.note && b.note.length > 10, JSON.stringify(b));
    if (b.status === "live") assert.match(b.url, /^https:\/\//);
    if (b.status === "dead") assert.equal(b.url, null);
  }
});
test("board registry: Ramp is Ashby live (was Lever, which 404s); no Lever Ramp entry remains", () => {
  const ramp = J.BOARD_REGISTRY.filter((b) => b.board === "ramp");
  assert.equal(ramp.length, 1);
  assert.equal(ramp[0].provider, "ashby"); assert.equal(ramp[0].status, "live");
  assert.equal(ramp[0].url, "https://api.ashbyhq.com/posting-api/job-board/ramp");
  assert.equal(J.feeds.ashby("ramp").url, ramp[0].url);
  assert.ok(!J.BOARD_REGISTRY.some((b) => b.provider === "lever" && b.board === "ramp"));
});
test("board registry: Goldman Sachs and Netflix are honestly dead — custom/no-public-api, no invented endpoint", () => {
  for (const name of ["Goldman Sachs", "Netflix"]) {
    const e = J.BOARD_REGISTRY.find((b) => b.company === name);
    assert.ok(e, name); assert.equal(e.status, "dead"); assert.equal(e.provider, "custom/no-public-api");
    assert.match(e.note, /404/);
  }
  const dead = J.deadBoards();
  assert.deepEqual(dead.map((b) => b.company).sort(), ["Goldman Sachs", "Netflix", "Square", "Visa"]);
  assert.ok(dead.every((b) => b.reason && b.reason.length > 10));
});
test("board registry: boardFeeds() returns live boards only, as fetchable feed descriptors", () => {
  const feeds = J.boardFeeds();
  assert.equal(feeds.length, J.BOARD_REGISTRY.filter((b) => b.status === "live").length);
  assert.ok(feeds.every((f) => f.status === "live" && /^https:\/\//.test(f.url)));
  assert.ok(!feeds.some((f) => /goldmansachs|netflix/i.test(f.company_token)));
});
test("dead boards are never fetched: fetchFeed skips without calling fetch, poll reports deadBoards", async () => {
  const dead = J.BOARD_REGISTRY.find((b) => b.company === "Netflix");
  let called = false;
  const r = await J.fetchFeed(dead, { fetch: async () => { called = true; throw new Error("must not be called"); } });
  assert.equal(called, false); assert.equal(r.skipped, true); assert.deepEqual(r.postings, []); assert.match(r.error, /marked dead/);
  const kv = new Map(); const store = { get: (k) => kv.get(k) || null, set: (k, v) => kv.set(k, v) };
  const p = await J.poll([J.feeds.greenhouse("stripe"), dead], { fetch: async () => ({ status: 200, json: async () => GH }), store, now: NOW });
  assert.equal(p.postings.length, 2);
  assert.equal(p.deadBoards.length, 1); assert.equal(p.deadBoards[0].company, "Netflix");
});

test("replay: snapshot repost counting — a role that vanishes and returns counts as reposted", () => {
  const [p] = J.normalizeGreenhouse(GH, "stripe");
  const s1 = J.makeSnapshot([p], NOW, null);
  const s2 = J.makeSnapshot([], NOW + 86400000, s1.history);
  const s3 = J.makeSnapshot([p], NOW + 2 * 86400000, s2.history);
  assert.equal(s3.history[p.job_id].repost_count, 1);
});
