// BUG-207 / FR-364 guard: the posting's own text must flow 151 alert -> 152 reminder.
// PD-1 (overnight lane-a, build 219541c): 151 composeAlert carried no jd_text and 152
// normalizeCandidate rebuilt alert candidates with jd_text:"", so 152's extractDeadline
// saw nothing (deadline null on 840/840 reminders; all 62 GT-deadline reminders lost
// theirs) and facts-shaped profiles (skills held as kind:"skill" facts, the canonical
// 122 shape 121's own builders produce) yielded zero fit lines because composeAlert
// only read profile.skills. This suite drives the REAL 151 cycle -> 152 cycle path:
//   (a) a JD-stated deadline reaches the drained reminder verbatim + in speakLine;
//   (b) no JD deadline -> reminder deadline stays null (never invented);
//   (c) a company-less (TN-1a) posting still reminds, company null / not stated;
//   (d) a proven skill held as a FACT (evidence + fact_id) sources a cited fit line;
//   (e) the same skill unproven (flag) or unevidenced (empty evidence) sources none.
// Check: node --test tests/career-alert-text-flow.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));
const W = require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js"));
const A = require(path.join(__dirname, "..", "packages/domain/152-career-assign.js"));

const T0 = Date.parse("2026-10-14T12:00:00.000Z");
const DEADLINE_JD = "Join our platform team building payment services in Python. You will ship features, write tests, and work with product. Apply by November 2, 2026.";
const PLAIN_JD = "Join our platform team building payment services in Python. You will ship features, write tests, and work with product. We review applications on a rolling basis.";

// ---- profiles ----------------------------------------------------------------
const SKILLS_PROFILE = { // 132-judge shape: skills pre-derived, fact IDs attached
  skills: [{ name: "Python", proven: true, fact_id: "TF-111" }],
  degree: "B.S. Computer Science, class of 2029",
  level: "student",
  experience_years: 1,
  experience_text: "built Python payment services",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2029, clearance: null, locations: ["Chicago"] },
  preferences: { role_families: ["SWE"], locations: ["Chicago"], starred_companies: [] },
};
const FACTS_PROFILE = { // canonical facts shape: NO .skills array at all — skills
  // live only as kind:"skill" facts (what 121 profileFromPersona consumes/builds)
  facts: [
    { kind: "skill", name: "Python", text: "Skill: Python", fact_id: "TF-900", evidence: ["resume: Skills line lists Python"], unproven: false },
    { kind: "education", text: "B.S. Computer Science, class of 2029" },
  ],
  degree: "B.S. Computer Science, class of 2029",
  level: "student",
  experience_years: 1,
  experience_text: "built Python payment services",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2029, clearance: null, locations: ["Chicago"] },
  preferences: { role_families: ["SWE"], locations: ["Chicago"], starred_companies: [] },
};

function watchProfile(userId, scoringProfile) {
  return A.createWatchProfile(userId, {
    interests: [{
      interest_id: "int-1",
      role: A.roleSpecFor({ split: "Software Engineering Intern / New-Grad" }),
      filters: { locations: ["Chicago"], remote_ok: true, bands: [], firms_include: [], firms_exclude: [] },
    }],
    scoring_profile: scoringProfile,
  });
}

// ---- the real path: 151 seed + after cycles over a one-board Greenhouse feed --
const ghJob = (id, jd) => ({
  id, title: "Software Engineer Intern",
  location: { name: "Chicago, IL" },
  absolute_url: `https://boards.greenhouse.io/acme/jobs/${id}`,
  first_published: new Date(T0 - 3600000).toISOString(),
  requisition_id: `REQ-${id}`,
  departments: [{ name: "Engineering" }],
  content: jd,
});

async function driveAlertPath(profile151, jobsAfter) {
  const board = { name: "Acme Corp", jobs: [] };
  const fetchImpl = async () => ({ status: 200, ok: true, json: async () => board });
  const store = W.createMemoryStore();
  const sink = [];
  const feeds = [J.feeds.greenhouse("acme")];
  await W.runWatchCycle({ feeds, fetch: fetchImpl, profile: profile151, store, sink: (r) => sink.push(r), now: T0 });
  board.jobs = jobsAfter;
  const after = await W.runWatchCycle({ feeds, fetch: fetchImpl, profile: profile151, store, sink: (r) => sink.push(r), now: T0 + 60000 });
  return after.alerts || [];
}

async function assignAndDrain(alerts, wp, presentIds) {
  const store = W.createMemoryStore();
  const res = await A.runAssignCycle({ alerts, watchProfile: wp, store, now: T0 + 60000, presentJobIds: presentIds || new Set(alerts.map((a) => a.job_id)) });
  const drained = await A.createReminderQueue(store, wp.user_id).drain();
  return { res, drained };
}

test("(a) deadline flows 151 -> 152: reminder carries the posting's own phrase, speakLine quotes it", async () => {
  const alerts = await driveAlertPath(SKILLS_PROFILE, [ghJob(1, DEADLINE_JD)]);
  assert.equal(alerts.length, 1);
  assert.ok(typeof alerts[0].jd_text === "string" && alerts[0].jd_text.includes("Apply by November 2, 2026"),
    `alert must carry the posting's own text forward; jd_text=${JSON.stringify(alerts[0].jd_text)}`);
  const { drained } = await assignAndDrain(alerts, watchProfile("u-a", SKILLS_PROFILE));
  assert.equal(drained.length, 1);
  assert.ok(drained[0].deadline, "reminder deadline must not be null when the posting states one");
  assert.equal(drained[0].deadline.text, "Apply by November 2, 2026");
  assert.ok(A.speakLine(drained[0]).includes("Apply by November 2, 2026"), A.speakLine(drained[0]));
});

test("(b) no deadline in the posting -> reminder deadline null (never invented)", async () => {
  const alerts = await driveAlertPath(SKILLS_PROFILE, [ghJob(2, PLAIN_JD)]);
  assert.equal(alerts.length, 1);
  const { drained } = await assignAndDrain(alerts, watchProfile("u-b", SKILLS_PROFILE));
  assert.equal(drained.length, 1);
  assert.equal(drained[0].deadline, null);
});

test("(c) TN-1a: company-less posting still reminds — company null, company_stated false", async () => {
  const store = W.createMemoryStore();
  const posting = {
    job_id: "greenhouse:not-stated:TN1", company: "", title: "Software Engineer Intern",
    location: "Chicago, IL", remote: "onsite", url: "https://example.test/apply/tn1",
    source: "greenhouse", posted_at: new Date(T0 - 3600000).toISOString(),
    seniority_band: "intern", role_family: "SWE", jd_text: PLAIN_JD,
  };
  const res = await A.runAssignCycle({ postings: [posting], watchProfile: watchProfile("u-c", SKILLS_PROFILE), store, now: T0, presentJobIds: new Set([posting.job_id]) });
  assert.equal(res.reminders.length, 1);
  assert.equal(res.reminders[0].company, null);
  assert.equal(res.reminders[0].company_stated, false);
});

test("(d) facts-shaped profile: proven skill fact sources a fit line citing its fact_id", async () => {
  const alerts = await driveAlertPath(FACTS_PROFILE, [ghJob(3, PLAIN_JD)]);
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].fit_lines.some((l) => /Python/.test(l) && /TF-900/.test(l)),
    `alert fit_lines must cite the proven fact; got ${JSON.stringify(alerts[0].fit_lines)}`);
  assert.ok(alerts[0].matched_fact_ids.includes("TF-900"));
  const { drained } = await assignAndDrain(alerts, watchProfile("u-d", FACTS_PROFILE));
  assert.equal(drained.length, 1);
  assert.ok(drained[0].fit.lines.some((l) => /Python/.test(l) && /TF-900/.test(l)),
    `reminder fit lines must cite the proven fact; got ${JSON.stringify(drained[0].fit.lines)}`);
  assert.ok(drained[0].fit.matched_fact_ids.includes("TF-900"));
});

test("(e1) facts-shaped profile: unproven-flagged skill sources NO fit line", async () => {
  const prof = JSON.parse(JSON.stringify(FACTS_PROFILE));
  prof.facts[0].unproven = true;
  const alerts = await driveAlertPath(prof, [ghJob(4, PLAIN_JD)]);
  assert.equal(alerts.length, 1);
  assert.ok(!alerts[0].fit_lines.some((l) => /Python/.test(l)), JSON.stringify(alerts[0].fit_lines));
  const { drained } = await assignAndDrain(alerts, watchProfile("u-e1", prof));
  assert.equal(drained.length, 1);
  assert.ok(!drained[0].fit.lines.some((l) => /Python/.test(l)), JSON.stringify(drained[0].fit.lines));
  assert.ok(!drained[0].fit.matched_fact_ids.includes("TF-900"));
});

test("(e2) facts-shaped profile: skill fact with EMPTY evidence sources NO fit line", async () => {
  const prof = JSON.parse(JSON.stringify(FACTS_PROFILE));
  prof.facts[0].evidence = [];
  const alerts = await driveAlertPath(prof, [ghJob(5, PLAIN_JD)]);
  assert.equal(alerts.length, 1);
  // 121 scoreFit's facts fallback may still count the skill (proven = !unproven there);
  // the fit LINE is a claim of proven fact, so composeAlert's facts-aware derivation
  // (mirroring 121's own profileFromPersona builders: proven requires evidence) must refuse.
  assert.ok(!alerts[0].fit_lines.some((l) => /Python/.test(l)), JSON.stringify(alerts[0].fit_lines));
  const { drained } = await assignAndDrain(alerts, watchProfile("u-e2", prof));
  assert.equal(drained.length, 1);
  assert.ok(!drained[0].fit.lines.some((l) => /Python/.test(l)), JSON.stringify(drained[0].fit.lines));
});
