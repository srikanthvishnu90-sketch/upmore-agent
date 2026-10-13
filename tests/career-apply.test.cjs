/* TEST fixtures only — synthetic TEST persona + fictional TEST companies. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Profile = require("../packages/domain/122-career-profile.js");
const Apply = require("../packages/domain/132-career-apply.js");

const fixtureDir = path.join(__dirname, "..", "packages", "career-data", "fixtures");
const persona = () => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(fixtureDir, "test-persona.json"), "utf8")));
const intl = () => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(fixtureDir, "persona-international-swe.json"), "utf8")));

test("APPE-005 sponsorship: saved answer quoted verbatim, never entered before confirmation", () => {
  const r = Apply.confirmSensitive(intl(), "Will you now or in the future require sponsorship?");
  assert.equal(r.kind, "sponsorship");
  assert.equal(r.savedAnswer, "Yes — F-1 OPT then H-1B.");
  assert.equal(r.entered, false);
  assert.match(r.prompt, /Yes — F-1 OPT then H-1B\./);
  const yes = Apply.confirmSensitive(intl(), "Will you require sponsorship?", { confirmed: true });
  assert.equal(yes.entered, true);
  assert.equal(yes.answer, "Yes — F-1 OPT then H-1B.");
  // canonical persona: no sponsorship needed
  assert.equal(Apply.savedSponsorshipAnswer(persona()), "No — I do not require sponsorship.");
  // no saved answer -> ask, never guess
  const bare = Profile.createProfile({});
  assert.equal(Apply.confirmSensitive(bare, "Will you require sponsorship?").savedAnswer, null);
});

test("APPE-005 salary: no number is ever invented; only a user-approved number enters", () => {
  const r = Apply.confirmSensitive(persona(), "What is your salary expectation?");
  assert.equal(r.kind, "salary");
  assert.equal(r.entered, false);
  assert.equal(r.proposedDefault, "Negotiable / open to the posted range");
  const ranged = Apply.salaryQuestion(persona(), "salary?", { marketRange: { range: "$60/hour (TEST range)", source: "TEST posting" } });
  assert.match(ranged.prompt, /TEST posting/);
  const approved = Apply.salaryQuestion(persona(), "salary?", { userApprovedNumber: 90000 });
  assert.equal(approved.entered, true);
  assert.equal(approved.answer, "90000");
});

test("knockout honesty: 5 years of Java required, profile evidences 0 — stopped; override only when explicit", () => {
  const k = Apply.checkKnockout(persona(), { skill: "Java", requiredYears: 5 });
  assert.equal(k.blocked, true);
  assert.equal(k.years, 0);
  assert.match(k.reason, /5 years of Java/);
  const over = Apply.checkKnockout(persona(), { skill: "Java", requiredYears: 5 }, { userSaysApplyAnyway: true });
  assert.equal(over.blocked, false);
  assert.equal(over.override, true);
  // an evidenced skill with a real span is not knocked out at 1 year
  const py = Apply.checkKnockout(persona(), { skill: "Python", requiredYears: 1 });
  assert.equal(py.blocked, false);
});

test("daily cap: 15/day hard cap, overflow queues, cap cannot be talked up", () => {
  const log = Apply.createLog();
  const c = Apply.enforceDailyCap(log, 20, "2026-10-12");
  assert.equal(c.cap, 15);
  assert.equal(c.allowed, 15);
  assert.equal(c.queuedForTomorrow, 5);
  assert.equal(Apply.attemptRaiseCap().refused, true);
  Apply.buildAuditRecord(log, { company: "Ramp (TEST)", role: "SWE Intern (TEST)", timestamp: "2026-10-12T10:00:00Z" });
  assert.equal(Apply.enforceDailyCap(log, 20, "2026-10-12").allowed, 14);
});

test("duplicate protection + current-employer guard", () => {
  const log = Apply.createLog();
  Apply.buildAuditRecord(log, { jobId: "gh:datadog:1", company: "Datadog", role: "Software Engineer Intern", timestamp: "2026-10-05T10:00:00Z" });
  const dup = Apply.checkDuplicate(log, { company: "Datadog", title: "Software Engineer Intern", job_id: "gh:datadog:1" });
  assert.equal(dup.duplicate, true);
  assert.match(dup.reason, /2026-10-05/);
  assert.equal(Apply.checkDuplicate(log, { company: "Datadog", title: "Other Role", job_id: "x" }).duplicate, false);
  const emp = Apply.checkCurrentEmployer(persona(), "TEST Systems Inc");
  assert.equal(emp.blocked, true);
  assert.match(emp.exceptionPath, /intentional/);
  assert.equal(Apply.checkCurrentEmployer(persona(), "Stripe").blocked, false);
});

test("audit record: every §5.5 field round-trips; referred apps tracked separately", () => {
  const log = Apply.createLog();
  const rec = Apply.buildAuditRecord(log, {
    jobId: "ashby:ramp:9", company: "Ramp", role: "Software Engineer Intern", url: "https://example.test/ramp (TEST)",
    timestamp: "2026-10-12T11:00:00Z", resumeVersionId: "resume-v1", coverLetterId: "cl-1",
    answers: [{ question: "Will you require sponsorship?", answer: "No — I do not require sponsorship.", source: "profile constraints", confirmationState: "user-confirmed-in-session" }],
    confirmationProof: "TEST screenshot ref", referral: { attached: true, who: "Sam Rivera (TEST)" },
  });
  const got = Apply.getAuditRecord(log, { company: "Ramp" });
  assert.equal(got.applicationId, rec.applicationId);
  assert.equal(got.answers[0].source, "profile constraints");
  assert.equal(got.trackedAs, "referred");
  assert.equal(got.referral.who, "Sam Rivera (TEST)");
});

test("referral stacking: warm path proposes hold-48h / apply-now-with-referral; cold offers mini-campaign", () => {
  const warm = Apply.checkReferral("Palantir", [{ full_name: "Sam Rivera (TEST)", current_firm: "Palantir", relationship_to_user: "alumni (TEST)" }]);
  assert.equal(warm.warmPathFound, true);
  assert.match(warm.proposals[0], /48 hours/);
  assert.match(warm.proposals[1], /referral in parallel/);
  const cold = Apply.checkReferral("Palantir", []);
  assert.equal(cold.warmPathFound, false);
  assert.match(cold.proposals[1], /mini-campaign/);
});

test("batch card: one card, all items, nothing recorded before the yes", () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ company: `Co ${i} (TEST)`, role: "SWE Intern (TEST)", fit: 70 + i, resumeVersion: "resume-v1" }));
  const card = Apply.batchCard(items);
  assert.equal(card.type, "batch_approval");
  assert.equal(card.items.length, 8);
  assert.match(card.note, /Nothing submits before your yes/);
});

test("triage: expired / duplicate / clearance / apply decisions carry reasons", () => {
  const Jobs = require("../packages/domain/121-career-jobs.js");
  const scoring = Jobs.profileFromPersona(JSON.parse(fs.readFileSync(path.join(fixtureDir, "test-persona.json"), "utf8")));
  const log = Apply.createLog();
  Apply.buildAuditRecord(log, { jobId: "dup-1", company: "Datadog", role: "SWE Intern", timestamp: "2026-10-05T00:00:00Z" });
  const mk = (over) => Object.assign({ job_id: "j1", company: "Stripe", title: "Software Engineer Intern", role_family: "SWE", seniority_band: "intern", location: "New York, NY", remote: "onsite", url: "https://example.test (TEST)", posted_at: "2026-10-10", jd_text: "Python React internship in New York", source: "greenhouse", sources: ["greenhouse"], source_urls: [], department: "Eng", req_id: null }, over);
  const rows = Apply.triageBatch([
    mk({ job_id: "exp-1", company: "OldCo (TEST)" }),
    mk({ job_id: "dup-1", company: "Datadog", title: "SWE Intern" }),
    mk({ job_id: "clr-1", company: "DefenseCo (TEST)", jd_text: "Requires TS/SCI security clearance. Python." }),
    mk({ job_id: "ok-1" }),
  ], { profile: persona(), scoringProfile: scoring, log, expiredJobIds: ["exp-1"] });
  assert.equal(rows[0].decision, "skip"); assert.match(rows[0].reasons[0], /expired/);
  assert.equal(rows[1].decision, "skip"); assert.match(rows[1].reasons[0], /already applied/);
  assert.equal(rows[2].decision, "ask"); assert.ok(rows[2].reasons.some((r) => /clearance/i.test(r)));
  assert.equal(rows[3].decision, "apply");
});

test("assessment invite: scheduled + prepped, never taken by the agent", () => {
  const h = Apply.handleAssessmentInvite({ company: "Stripe (TEST)", assessment: "HackerRank (TEST)", deadline: "2026-10-20" }, {});
  assert.equal(h.takenByAgent, false);
  assert.equal(h.scheduled.scheduled, true);
  assert.ok(h.prep.length >= 2);
});

test("inbox reconciliation: a manual application in the inbox becomes duplicate protection", () => {
  const log = Apply.createLog();
  const emails = [{ from: "no-reply@datadoghq.com (TEST)", subject: "Your application to Datadog was received (TEST)", date: "2026-10-05", company: "Datadog", role: "Software Engineer Intern (TEST)" }, { from: "news@example.test", subject: "Weekly jobs newsletter (TEST)", date: "2026-10-06" }];
  const r = Apply.reconcileInbox(log, emails);
  assert.equal(r.confirmations.length, 1);
  assert.equal(r.added.length, 1);
  assert.equal(Apply.checkDuplicate(log, { company: "Datadog", title: "Software Engineer Intern (TEST)", job_id: "other-id" }).duplicate, true);
  // reconciling twice adds nothing twice
  assert.equal(Apply.reconcileInbox(log, emails).added.length, 0);
});

test("cooldown: exact lift date computed; inactive after it", () => {
  const c = Apply.checkCooldown({ company: "Datadog", lastApplied: "2026-09-20", cooldownDays: 90 }, "2026-10-12");
  assert.equal(c.active, true);
  assert.equal(c.liftsOn, "2026-12-19");
  assert.equal(Apply.checkCooldown({ company: "Datadog", lastApplied: "2026-09-20", cooldownDays: 90 }, "2026-12-20").active, false);
});

test("autopilot rule: no activation without explicit approval; caps and summary enforced", () => {
  assert.equal(Apply.createRule({ minFit: 80 }, {}).refused, true);
  const made = Apply.createRule({ minFit: 80, companies: ["Stripe"], maxPerDay: 99, excludeBuckets: ["Reach"] }, { approvedByUser: true });
  assert.equal(made.ok, true);
  assert.equal(made.rule.maxPerDay, 15); // rule cap can only lower the hard cap
  const log = Apply.createLog();
  const sum = Apply.nightlySummary(log, "2026-10-12");
  assert.equal(sum.submitted, 0);
});

test("windows sweep: open only inside the window and only for the persona's class year", () => {
  const reg = [{ company: "Bank A (TEST)", program: "Sophomore Summer Analyst (TEST)", classYears: [2028], opensOn: "2026-09-01", closesOn: "2026-11-15" }, { company: "Bank B (TEST)", program: "Junior Summer Analyst (TEST)", classYears: [2027], opensOn: "2026-09-01", closesOn: "2026-11-15" }];
  const rows = Apply.checkWindows(reg, 2028, "2026-10-12");
  assert.equal(rows[0].open, true);
  assert.equal(rows[1].open, false);
  assert.match(rows[1].note, /not a class-of-2028/);
});

test("BUG-005 replay: profileFromPersona maps canonical preferences.roles to role_families", () => {
  const Jobs = require("../packages/domain/121-career-jobs.js");
  const sp = Jobs.profileFromPersona(personaRawFn());
  assert.ok(sp.preferences.role_families.includes("SWE"));
  assert.ok(sp.preferences.role_families.includes("Finance"));
  function personaRawFn() { return JSON.parse(fs.readFileSync(path.join(fixtureDir, "test-persona.json"), "utf8")); }
});
