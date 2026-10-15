// ASSIGNMENT LAYER (Mega Task 2, assigning half): module 152-career-assign.js.
// 151 watches boards and emits typed alert records; nothing assigned a detected
// posting to a USER's stated interest, queued it as a reminder, or proved the
// queue. 152 is that half: per-user watch profiles keyed to the hired-research
// taxonomy (849 occupations + market splits), a matcher over 151 alert records /
// 121 new postings, and a persisted reminder queue with a drain contract.
// Fail-first guards for the defect classes this layer must never have:
//   ASG-1 keyword-only matching fires on senior titles (M&A Lead != IB Analyst)
//   ASG-2 company-less posting silently dropped (TN-1a ruling at this layer)
//   ASG-3 same seat on two boards (or re-presented) queues duplicate reminders
//   ASG-4 opt-out (global or per-company) leaks reminders
//   ASG-5 location filter ignored once the role matches
//   ASG-6 queue drain loses or double-delivers records
//   ASG-7 fit lines sourced from UNPROVEN profile skills (fact-citation law)
//   ASG-8 scoreFit hard exclusion overridden by a perfect title match
// Check: node --test tests/career-assign.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const A = require(path.join(__dirname, "..", "packages/domain/152-career-assign.js"));
const W = require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js"));

const NOW = Date.parse("2026-10-14T21:00:00.000Z");

// ---- 121-shape scoring profile (MOCK), student persona facts ----
const PROFILE121 = {
  skills: [
    { name: "Python", proven: true, fact_id: "F-010" },
    { name: "Excel", proven: true, fact_id: "F-012" },
    { name: "Rust", proven: false, fact_id: "F-099" },
  ],
  degree: "B.S. Computer Science + Finance, class of 2028",
  level: "student",
  experience_years: 0,
  experience_text: "summer analyst prep, financial modeling coursework, Python",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2028, clearance: null, locations: ["Chicago", "New York"] },
  preferences: { role_families: ["Finance", "SWE"], locations: ["Chicago", "New York", "Remote"], starred_companies: [] },
};

function ibWatch(userId) {
  return A.createWatchProfile(userId || "user-1", {
    scoring_profile: PROFILE121,
    interests: [{
      interest_id: "int-ib",
      role: A.roleSpecFor({ soc: "13-2051", split: "Investment Banking Analyst" }),
      filters: { locations: ["Chicago"], remote_ok: true, bands: ["intern"], firms_include: [], firms_exclude: [] },
    }],
  });
}

// ---- 121-shape postings (MOCK fixtures) ----
const posting = (over) => Object.assign({
  job_id: "greenhouse:testbank:1", company: "Test Bank", title: "Investment Banking Summer Analyst",
  role_family: "Finance", seniority_band: "intern", location: "Chicago, IL", remote: "onsite",
  url: "https://boards.greenhouse.io/testbank/jobs/1", posted_at: "2026-10-14T18:00:00.000Z",
  jd_text: "Investment banking summer analyst program in Chicago. Financial modeling in Excel.",
  source: "greenhouse", req_id: "1",
}, over || {});

test("watch profile: persists per-user, round-trips, users isolated", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch("user-1");
  const v = A.validateWatchProfile(wp);
  assert.equal(v.ok, true, v.errors.join("; "));
  await A.saveWatchProfile(store, wp);
  const back = await A.loadWatchProfile(store, "user-1");
  assert.equal(back.user_id, "user-1");
  assert.equal(back.interests.length, 1);
  assert.equal(back.interests[0].role.soc, "13-2051");
  assert.equal(await A.loadWatchProfile(store, "user-2"), null);
});

test("watch profile: validation rejects shapeless interests and bad SOC", () => {
  const bad = A.createWatchProfile("u", { interests: [{ interest_id: "x", role: { soc: "bogus", title: "", terms: [] }, filters: {} }] });
  const v = A.validateWatchProfile(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /soc/i.test(e)));
  assert.ok(v.errors.some((e) => /term|title/i.test(e)));
});

test("roleSpecFor: split carries curated terms + blockers; base occupation derives terms", () => {
  const ib = A.roleSpecFor({ soc: "13-2051", split: "Investment Banking Analyst" });
  assert.ok(ib.terms.some((t) => t.includes("investment banking")));
  assert.ok(ib.blockers.includes("senior"));
  const boiler = A.roleSpecFor({ soc: "47-2011", title: "Boilermakers" });
  assert.equal(boiler.soc, "47-2011");
  assert.ok(boiler.terms.some((t) => t.includes("boilermaker")));
});

test("match: IB intern posting in Chicago produces a reminder with fact-cited fit lines", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch();
  const res = await A.runAssignCycle({ postings: [posting()], watchProfile: wp, store, now: NOW });
  assert.equal(res.reminders.length, 1);
  const r = res.reminders[0];
  assert.equal(r.type, "career_job_reminder");
  assert.equal(r.company, "Test Bank");
  assert.equal(r.company_stated, true);
  assert.equal(r.url, "https://boards.greenhouse.io/testbank/jobs/1");
  assert.ok(r.fit.lines.some((l) => /Excel/.test(l) && /F-012/.test(l)), r.fit.lines.join(" | "));
  const q = A.createReminderQueue(store, "user-1");
  assert.equal(await q.size(), 1);
});

test("ASG-1: senior M&A title with role words does NOT match the IB analyst interest", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch();
  const senior = posting({ job_id: "greenhouse:stripe:9", company: "Stripe", title: "Strategy & M&A Lead", seniority_band: "senior", location: "Remote", remote: "remote", jd_text: "Lead mergers and acquisitions strategy." });
  const res = await A.runAssignCycle({ postings: [senior], watchProfile: wp, store, now: NOW });
  assert.equal(res.reminders.length, 0);
  const rej = res.rejected.find((x) => x.job_id === senior.job_id);
  assert.ok(rej && rej.reasons.some((r) => /band|senior|blocker/i.test(r)), JSON.stringify(rej));
});

test("ASG-2: company-less posting still matches and reminds, company honestly not-stated", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch();
  const anon = posting({ job_id: "lever:unknown:7", company: "", source: "lever" });
  const res = await A.runAssignCycle({ postings: [anon], watchProfile: wp, store, now: NOW });
  assert.equal(res.reminders.length, 1);
  const r = res.reminders[0];
  assert.equal(r.company, null);
  assert.equal(r.company_stated, false);
  assert.ok(/not stated/i.test(A.speakLine(r)), A.speakLine(r));
});

test("ASG-3: same seat on two boards queues ONE reminder; re-presentation suppressed", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch();
  const gh = posting();
  const lv = posting({ job_id: "lever:testbank:44", source: "lever", url: "https://jobs.lever.co/testbank/44" });
  const res1 = await A.runAssignCycle({ postings: [gh, lv], watchProfile: wp, store, now: NOW });
  assert.equal(res1.reminders.length, 1);
  assert.ok(res1.suppressed.some((x) => /duplicate|seat/i.test(x.reason)));
  const res2 = await A.runAssignCycle({ postings: [gh], watchProfile: wp, store, now: NOW + 3600e3 });
  assert.equal(res2.reminders.length, 0);
  assert.ok(res2.suppressed.some((x) => /seat|repost|already/i.test(x.reason)));
});

test("ASG-4: global opt-out and company opt-out suppress everything, with reasons", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch();
  wp.opt_out = { global: true, companies: [] };
  const res = await A.runAssignCycle({ postings: [posting()], watchProfile: wp, store, now: NOW });
  assert.equal(res.reminders.length, 0);
  assert.ok(res.suppressed.some((x) => /opt.out/i.test(x.reason)));
  const wp2 = ibWatch();
  wp2.opt_out = { global: false, companies: ["Test Bank"] };
  const res2 = await A.runAssignCycle({ postings: [posting()], watchProfile: wp2, store, now: NOW });
  assert.equal(res2.reminders.length, 0);
  assert.ok(res2.suppressed.some((x) => /opt.out/i.test(x.reason)));
});

test("ASG-5: out-of-area posting rejected on location; remote posting accepted", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch();
  const sf = posting({ job_id: "greenhouse:testbank:2", location: "San Francisco, CA", jd_text: "Investment banking summer analyst, San Francisco office. Excel." });
  const res = await A.runAssignCycle({ postings: [sf], watchProfile: wp, store, now: NOW });
  assert.equal(res.reminders.length, 0);
  assert.ok(res.rejected.some((x) => x.reasons.some((r) => /location/i.test(r))));
  const remote = posting({ job_id: "greenhouse:testbank:3", location: "Remote - US", remote: "remote" });
  const res2 = await A.runAssignCycle({ postings: [remote], watchProfile: wp, store, now: NOW });
  assert.equal(res2.reminders.length, 1);
});

test("ASG-6: queue drains FIFO, exactly once; duplicates never double-queue", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch();
  const q = A.createReminderQueue(store, "user-1");
  const mk = (id) => ({ type: "career_job_reminder", reminder_id: id, job_id: id, queued_at: new Date(NOW).toISOString() });
  await q.enqueue(mk("r1")); await q.enqueue(mk("r2")); await q.enqueue(mk("r3"));
  assert.equal(await q.enqueue(mk("r2")), false); // duplicate id refused
  assert.equal(await q.size(), 3);
  const d1 = await q.drain(2);
  assert.deepEqual(d1.map((x) => x.reminder_id), ["r1", "r2"]);
  const d2 = await q.drain(10);
  assert.deepEqual(d2.map((x) => x.reminder_id), ["r3"]);
  assert.deepEqual(await q.drain(10), []);
  assert.equal(await q.size(), 0);
});

test("ASG-7: unproven skill never sources a fit line; proven skill cites its fact", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch();
  const rustOnly = posting({ job_id: "greenhouse:testbank:5", jd_text: "Investment banking summer analyst in Chicago. Rust systems work." });
  const res = await A.runAssignCycle({ postings: [rustOnly], watchProfile: wp, store, now: NOW });
  assert.equal(res.reminders.length, 1);
  assert.ok(!res.reminders[0].fit.lines.some((l) => /Rust/.test(l)), res.reminders[0].fit.lines.join("|"));
});

test("ASG-8: scoreFit hard exclusion beats a perfect title match", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch();
  // 121 hardFilters: a posting demanding 5+ years excludes a 0-year student profile.
  const hard = posting({ job_id: "greenhouse:testbank:6", jd_text: "Investment banking summer analyst in Chicago. Requires minimum 5 years of investment banking experience. Excel." });
  const res = await A.runAssignCycle({ postings: [hard], watchProfile: wp, store, now: NOW });
  assert.equal(res.reminders.length, 0);
  assert.ok(res.rejected.some((x) => x.reasons.some((r) => /excluded|hard/i.test(r))), JSON.stringify(res.rejected));
});

test("ASG-9: board city abbreviations (NYC / CHI) match the spelled-out interest city", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch(); // Chicago interest
  const chi = posting({ job_id: "greenhouse:testbank:11", location: "SF, SEA, CHI, NYC", jd_text: "Investment banking summer analyst. Excel." });
  const res = await A.runAssignCycle({ postings: [chi], watchProfile: wp, store, now: NOW });
  assert.equal(res.reminders.length, 1);
  const sfOnly = posting({ job_id: "greenhouse:testbank:12", location: "SF", jd_text: "Investment banking summer analyst. Excel." });
  const res2 = await A.runAssignCycle({ postings: [sfOnly], watchProfile: wp, store, now: NOW });
  assert.equal(res2.reminders.length, 0);
});

test("deadline: quoted verbatim from the posting's own words; absent means null", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch();
  const withDl = posting({ job_id: "greenhouse:testbank:7", jd_text: "Investment banking summer analyst, Chicago. Applications close November 1, 2026. Excel modeling." });
  const res = await A.runAssignCycle({ postings: [withDl], watchProfile: wp, store, now: NOW });
  assert.equal(res.reminders.length, 1);
  assert.ok(res.reminders[0].deadline && /November 1, 2026/.test(res.reminders[0].deadline.text), JSON.stringify(res.reminders[0].deadline));
  const res2 = await A.runAssignCycle({ postings: [posting({ job_id: "greenhouse:testbank:8" })], watchProfile: wp, store, now: NOW });
  assert.equal(res2.reminders[0].deadline, null);
});

test("negative: an occupation with no postings in the feed reminds zero times and says why", async () => {
  const store = W.createMemoryStore();
  const wp = A.createWatchProfile("user-9", {
    scoring_profile: PROFILE121,
    interests: [{ interest_id: "int-boiler", role: A.roleSpecFor({ soc: "47-2011", title: "Boilermakers" }), filters: { locations: ["Chicago"], remote_ok: true, bands: ["intern", "new_grad", "mid"], firms_include: [], firms_exclude: [] } }],
  });
  const res = await A.runAssignCycle({ postings: [posting(), posting({ job_id: "x:2", title: "Software Engineer, Intern" })], watchProfile: wp, store, now: NOW });
  assert.equal(res.reminders.length, 0);
  const s = res.no_match_summary.find((x) => x.interest_id === "int-boiler");
  assert.ok(s && s.considered === 2 && Object.keys(s.reasons).length >= 1, JSON.stringify(s));
});

test("151 alert-record input: reminder inherits fact-cited fit lines without recompute", async () => {
  const store = W.createMemoryStore();
  const wp = ibWatch();
  const alert = {
    type: "career_job_alert", job_id: "greenhouse:testbank:1", company: "Test Bank",
    title: "Investment Banking Summer Analyst", url: "https://boards.greenhouse.io/testbank/jobs/1",
    location: "Chicago, IL", role_family: "Finance", seniority_band: "intern", source: "greenhouse",
    posted_at: "2026-10-14T18:00:00.000Z", posted_at_quality: "fresh", detected_at: new Date(NOW).toISOString(),
    latency_seconds: 10800, fit_lines: ["proven skill Excel (fact F-012) matches this posting"], matched_fact_ids: ["F-012"],
    fit: { score: 61, bucket: "Match", reasons: [], gaps: [], matched_skills: ["Excel"] },
  };
  const res = await A.runAssignCycle({ alerts: [alert], watchProfile: wp, store, now: NOW });
  assert.equal(res.reminders.length, 1);
  assert.deepEqual(res.reminders[0].fit.matched_fact_ids, ["F-012"]);
  assert.equal(res.reminders[0].fit.score, 61);
});
