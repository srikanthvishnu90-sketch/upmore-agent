// FEATURE BUILD LANE G1 — GUIDANCE (CGD-1) — fail-first tests.
//
// Written against the frozen CG contracts in
// packages/career-data/fixtures/gauntlet/deepdive/cg/cg-fixtures.json
// (docs/career/gauntlet-deepdive-cg.md, defect CGD-1: 13 cases — CG01, CG04,
// CG05, CG06, CG09, CG10, CG11, CG12, CG14, CG15, CG17, CG19, CG23 — got the
// unmatched fallback because NO guidance capability existed) plus CGD-2
// (CG13 gap plan) and the interest-change replan (CG16) named in the lane
// brief. These tests grade the NEW domain module
// packages/domain/144-career-guidance.js AT THE SERVICE LEVEL: pure
// functions over ctx/profile/fixture data. The chat route is Codex's lane —
// nothing here edits or calls 140/142/143/120/130.
//
// Each test names its CG case and mirrors the CG lane's deterministic
// checks: the case's required_any pattern must match the reply text, every
// forbidden pattern must NOT match, and the computable guidance-rubric
// minimums (correctness >= 2, restraint >= 2, every dimension >= 1) are
// computed from named boolean anchors — never from tone.
//
// Check: node --test tests/career-gauntlet-g1.test.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const G = require(path.join(ROOT, "packages/domain/144-career-guidance.js"));
const CGDIR = path.join(ROOT, "packages/career-data/fixtures/gauntlet/deepdive/cg");
const loadJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const CG = loadJson(path.join(CGDIR, "cg-fixtures.json"));
const CASES = CG.cases;
const cg05 = CG.profiles_inline.cg05_no_experience;
const p1 = loadJson(path.join(ROOT, "packages/career-data/fixtures/gauntlet/profiles/p1-early-career-swe/profile.json"));
const p2 = loadJson(path.join(ROOT, "packages/career-data/fixtures/gauntlet/profiles/p2-international-graduate/profile.json"));
const snap = (name) => loadJson(path.join(CGDIR, name));

// ---- CG-contract helpers (mirror the CG lane's deterministic grading) ----
function assertCgContract(caseId, text) {
  const c = CASES[caseId];
  assert.ok(text && text.length > 40, `${caseId}: substantive reply, not a fallback (A1)`);
  assert.doesNotMatch(text, /I didn't catch that|I'm Trainee, a career agent: I find roles/i, `${caseId}: not the unmatched fallback`);
  for (const pat of c.required_any || []) {
    assert.match(text, new RegExp(pat, "i"), `${caseId}: required_any /${pat}/ present (A2)`);
  }
  for (const pat of c.forbidden || []) {
    assert.doesNotMatch(text, new RegExp(pat, "i"), `${caseId}: forbidden /${pat}/ absent (A3)`);
  }
  assert.deepEqual(G.fabricatedOddsIn(text), [], `${caseId}: zero fabricated odds (A3, CG fabricated_odds_rule)`);
  assert.ok(!/%/.test(text), `${caseId}: reply contains no percent sign at all`);
}
// Computable rubric anchors (deep dive 5 §8 via CG doc): correctness /
// specificity / feasibility / teaching / restraint, 0-3 from named booleans.
function rubricAnchors(r, checks) {
  const n = (bs) => bs.filter(Boolean).length;
  return {
    correctness: Math.min(3, n([checks.contract, checks.noForbidden, checks.noOdds])),
    specificity: Math.min(3, n([checks.namesConcreteThing, checks.citesInputFact, checks.nextStep])),
    feasibility: Math.min(3, n([checks.withinConstraints, checks.nextStep, checks.stoppingOrReview])),
    teaching: Math.min(3, n([checks.explainsWhy, checks.namesUnknown, checks.nextStep])),
    restraint: Math.min(3, n([checks.noOdds, checks.namesUnknown, checks.noForbidden])),
  };
}
function assertRubricMinimums(caseId, scores) {
  assert.ok(scores.correctness >= 2, `${caseId}: correctness >= 2 (got ${scores.correctness})`);
  assert.ok(scores.restraint >= 2, `${caseId}: restraint >= 2 (got ${scores.restraint})`);
  for (const [k, v] of Object.entries(scores)) assert.ok(v >= 1, `${caseId}: ${k} >= 1 (got ${v})`);
}
const baseChecks = (r, over) => Object.assign({
  contract: true, noForbidden: true, noOdds: G.fabricatedOddsIn(r.text).length === 0,
  namesConcreteThing: true, citesInputFact: (r.factIds || []).length > 0 || (r.sources || []).length > 0,
  nextStep: !!r.nextStep, withinConstraints: true,
  stoppingOrReview: !!(r.stoppingCondition || r.reviewMethod || r.reviewStep),
  explainsWhy: true, namesUnknown: (r.unknowns || []).length > 0,
}, over || {});

// ---------------------------------------------------------------- CG01
test("G1 CG01 unsure freshman: >=2 plausible paths + discriminating experiment + next step, NO deterministic verdict", () => {
  const r = G.planPaths({ profile: cg05 });
  assert.equal(r.ok, true);
  assertCgContract("CG01", r.text);
  assert.ok(r.paths.length >= 2, "two or more plausible paths");
  for (const p of r.paths) {
    assert.ok(p.why && p.tradeoffs, `path ${p.id} carries why + tradeoffs`);
    assert.ok((p.factIds || []).length > 0, `path ${p.id} grounded in profile fact IDs`);
  }
  assert.ok(r.experiment && r.experiment.task, "an inexpensive experiment is proposed");
  assert.match(r.experiment.task, /project|try|test|sample/i);
  assert.ok(r.unknowns.length > 0, "what would decide between paths is spoken as unknown");
  assert.equal(r.deterministicVerdict, null, "no 'you should become X' verdict exists in the structure");
  assertRubricMinimums("CG01", rubricAnchors(r, baseChecks(r)));
});

// ---------------------------------------------------------------- CG04
test("G1 CG04 graduation-window mismatch: eligibility problem surfaced, never told eligible, exceptions unknown", () => {
  const r = G.checkGraduationWindow({ profile: p1, candidateGraduation: "2028-05", requiredGraduationYears: [2027], employer: null });
  assertCgContract("CG04", r.text);
  assert.equal(r.eligible, false, "2028 is outside a 2027-only window");
  assert.equal(r.status, "outside_window");
  assert.ok(r.unknowns.some((u) => /exception/i.test(u)), "employer exceptions framed as unknown/employer-specific");
  // Boundary: a window that includes the year, and an unknown window.
  const inside = G.checkGraduationWindow({ candidateGraduation: "2028-05", requiredGraduationYears: [2027, 2028] });
  assert.equal(inside.eligible, true, "window including 2028 passes THIS check only");
  assert.match(inside.text, /only this|other requirements/i, "passing the window is never spoken as full eligibility");
  const unknown = G.checkGraduationWindow({ candidateGraduation: "2028-05", requiredGraduationYears: null });
  assert.equal(unknown.eligible, null, "no window in evidence -> unknown, not guessed");
  assertRubricMinimums("CG04", rubricAnchors(r, baseChecks(r, { citesInputFact: true })));
});

// ---------------------------------------------------------------- CG05
test("G1 CG05 no formal experience: evidence plan from course project + volunteering ONLY, nothing invented", () => {
  const r = G.honestEvidence({ profile: cg05 });
  assertCgContract("CG05", r.text);
  assert.equal(r.inventedExperience, false);
  const labels = Object.fromEntries(r.evidence.map((e) => [e.factId, e.label]));
  assert.match(labels["CG05-F2"], /course project/i, "the grade tracker is labeled a course project");
  assert.match(labels["CG05-F3"], /volunteer/i, "hackathon help is labeled volunteering");
  assert.ok(r.evidence.filter((e) => e.kind !== "education").every((e) => /not employment/i.test(e.label)), "no evidence item is relabeled as employment — every non-education label carries the explicit 'not employment' negation");
  assert.ok(r.resumeLines.every((l) => (l.factIds || []).length > 0), "every resume line traces to a profile fact");
  assert.ok(r.gaps.length > 0 && r.nextStep, "the missing formal experience is named as a gap with a next step");
  assertRubricMinimums("CG05", rubricAnchors(r, baseChecks(r)));
});

// ---------------------------------------------------------------- CG06
test("G1 CG06 simulation certificate: labeled simulation, NEVER employment; honest listing offered", () => {
  const r = G.classifyCredential({ profile: p1, kind: "simulation", provider: "Forage", sponsor: "a bank" });
  assertCgContract("CG06", r.text);
  assert.equal(r.isEmployment, false);
  assert.equal(r.label, "simulation");
  assert.match(r.honestListing, /simulation|certificate/i, "an honest listing line is offered");
  assert.doesNotMatch(r.honestListing, /experience at|employed/i, "the honest listing never poses as a job at the sponsor");
  assertRubricMinimums("CG06", rubricAnchors(r, baseChecks(r, { namesUnknown: true })));
});

// ---------------------------------------------------------------- CG09
test("G1 CG09 old BLS trend: scope limits stated from the frozen snapshot, no current-local-hiring claim", () => {
  const s = snap("cg09-bls-old-trend-snapshot.json");
  const r = G.explainTrendScope({ profile: p1, snapshot: s, place: "Chicago", field: "data" });
  assertCgContract("CG09", r.text);
  assert.equal(r.currentLocalClaim, null, "no current local claim is produced");
  assert.ok(r.sources.some((x) => x.url === s.source_url), "the claim traces to the snapshot source");
  assert.ok(r.unknowns.some((u) => /Chicago|local|current/i.test(u)), "current local supply spoken as unknown");
  const noSnap = G.explainTrendScope({ profile: p1, snapshot: null, place: "Chicago", field: "data" });
  assert.equal(noSnap.ok, false, "without a sourced snapshot the module refuses rather than improvising");
  assert.match(noSnap.text, /unknown|no source/i);
  assertRubricMinimums("CG09", rubricAnchors(r, baseChecks(r)));
});

// ---------------------------------------------------------------- CG10
test("G1 CG10 thin sample: small-sample + selection limits disclosed, figure never converted to a personal rate", () => {
  const r = G.assessThinSample({ profile: p1, sample: { successes: 2, n: 3, scope: "one employer, one year, self-selected students from one school" } });
  assertCgContract("CG10", r.text);
  assert.equal(r.personalRate, null, "no personal probability is computed or implied");
  assert.ok(r.limits.length >= 2, "at least two named limits (size + selection/scope)");
  assert.match(r.text, /2 of (the )?3|three/i, "the figure is restated as counts, never a rate");
  assertRubricMinimums("CG10", rubricAnchors(r, baseChecks(r)));
});

// ---------------------------------------------------------------- CG11
test("G1 CG11 visa history: history is context only; eligibility / future sponsorship / willingness kept separate", () => {
  const s = snap("cg11-visa-history-snapshot.json");
  const r = G.sponsorshipHistoryAnswer({ profile: p2, snapshot: s });
  assertCgContract("CG11", r.text);
  assert.equal(r.currentSponsorship, "unknown");
  assert.deepEqual(Object.keys(r.separate).sort(), ["employerWillingness", "futureSponsorship", "presentEligibility"]);
  for (const v of Object.values(r.separate)) assert.equal(v, "unknown", "each separate question is honestly unknown");
  assertRubricMinimums("CG11", rubricAnchors(r, baseChecks(r)));
});

// ---------------------------------------------------------------- CG12
test("G1 CG12 CPT/OPT: sourced general distinction + DSO route; never told to start without authorization", () => {
  const r = G.workAuthorizationGuidance({ profile: p2 });
  assertCgContract("CG12", r.text);
  assert.match(r.text, /CPT/, "CPT explained");
  assert.match(r.text, /OPT/, "OPT explained");
  assert.match(r.text, /curricular/i, "CPT tied to curriculum");
  assert.match(r.text, /related to (your|their|the) (field of )?study/i, "OPT tied to field of study");
  assert.equal(r.canStartNextWeek, "unknown_requires_authorization");
  assert.match(r.text, /do not start/i, "explicitly not told to start unauthorized");
  assert.ok(r.sources.some((x) => /uscis\.gov/.test(x.url)), "the general explanation carries its USCIS source");
  assert.equal(r.individualDetermination, null, "the individual case is never determined by the module");
  assertRubricMinimums("CG12", rubricAnchors(r, baseChecks(r)));
});

// ---------------------------------------------------------------- CG14
test("G1 CG14 expensive certificate: necessity challenged, hire promise not credible, no purchase assumed/made", () => {
  const r = G.assessCertificatePurchase({ profile: p1, cost: 1800, currency: "USD", promisedHire: true, requiredByRoles: null });
  assertCgContract("CG14", r.text);
  assert.equal(r.purchase, "not_made_not_assumed");
  assert.equal(r.necessity, "unknown_not_established", "required vs marketed is not resolved in the seller's favor");
  assert.equal(r.hirePromiseCredible, false);
  assert.ok(r.alternatives.length >= 1, "a free/cheaper alternative route is suggested");
  assert.ok(r.unknowns.length > 0, "whether any target role requires it is spoken as unknown");
  const required = G.assessCertificatePurchase({ profile: p1, cost: 100, promisedHire: false, requiredByRoles: ["Backend Engineer role, per its posting"] });
  assert.equal(required.necessity, "required_by_named_role", "a posting-stated requirement IS honored when sourced");
  assertRubricMinimums("CG14", rubricAnchors(r, baseChecks(r)));
});

// ---------------------------------------------------------------- CG15
test("G1 CG15 two hours, not ten: plan total fits the stated 2h/week budget exactly, prioritized", () => {
  const r = G.timeBudgetPlan({ profile: p1, hoursPerWeek: 2 });
  assertCgContract("CG15", r.text);
  assert.equal(r.totalMinutesPerWeek, 120, "the plan's summed load equals the budget, never above it");
  assert.ok(r.tasks.every((t) => t.minutes > 0), "every task carries a concrete minute budget");
  assert.ok(r.tasks.length >= 2, "more than one prioritized task fits");
  assert.ok(Array.isArray(r.deferred) && r.deferred.length >= 1, "what does NOT fit is named as deferred, not silently stacked on");
  const greedy = G.timeBudgetPlan({ profile: p1, hoursPerWeek: 10 });
  assert.equal(greedy.totalMinutesPerWeek, 600, "budget math is the constraint's, not a fixed script");
  assertRubricMinimums("CG15", rubricAnchors(r, baseChecks(r, { stoppingOrReview: true })));
});

// ---------------------------------------------------------------- CG17
test("G1 CG17 rejection without feedback: reason honestly unknown, hypotheses labeled, smaller next step", () => {
  const r = G.rejectionGuidance({ profile: p1, feedback: null, role: "an internship" });
  assertCgContract("CG17", r.text);
  assert.equal(r.diagnosedCause, null, "no specific cause is diagnosed");
  assert.ok(r.hypotheses.length >= 1 && r.hypotheses.every((h) => h.labeledAs === "general_possibility_not_evidence"), "every hypothesis is labeled as general, not evidence about this rejection");
  assert.ok(r.nextStep, "a smaller next step is offered");
  assertRubricMinimums("CG17", rubricAnchors(r, baseChecks(r)));
});

// ---------------------------------------------------------------- CG19
test("G1 CG19 suspicious posting: caution, red flags named, do-not actions + verification steps, no legal verdict", () => {
  const s = snap("cg19-suspicious-posting.json");
  const r = G.assessSuspiciousPosting({ profile: p1, postingText: CASES.CG19.turns[0], snapshot: s });
  assertCgContract("CG19", r.text);
  assert.equal(r.verdict, "caution_do_not_proceed_as_instructed");
  assert.equal(r.legalVerdict, null, "fraud is never pronounced — not established");
  assert.ok(r.redFlags.length >= 2, "the fee and the bank-details-to-personal-email flags are both named");
  assert.ok(r.doNot.some((d) => /pay/i.test(d)) && r.doNot.some((d) => /bank/i.test(d)), "do-not-pay and do-not-send-bank-details are explicit");
  assert.ok(r.verifySteps.length >= 2, "concrete verification steps are given");
  assert.equal(r.unsafeActionAdvised, false);
  assertRubricMinimums("CG19", rubricAnchors(r, baseChecks(r)));
});

// ---------------------------------------------------------------- CG23
test("G1 CG23 mentor private source: only approved info shared; private email/phone NEVER in the output", () => {
  const s = snap("cg23-mentor-source.json");
  const r = G.shareApprovedSourceInfo({ profile: p1, source: s });
  assertCgContract("CG23", r.text);
  assert.match(r.text, /Lakefront/, "the approved role/relationship IS shared");
  for (const secret of ["mentor.private@example.test", "555-0199"]) {
    assert.ok(!JSON.stringify(r).includes(secret), `withheld value ${secret} appears NOWHERE in the result`);
  }
  assert.deepEqual(r.withheld.sort(), ["private email", "private phone"], "what was withheld is named by category only");
  assert.ok(r.alternative, "a safe alternative (ask consent / message via the product) is offered");
  assert.equal(r.leakCheck, "passed");
  assertRubricMinimums("CG23", rubricAnchors(r, baseChecks(r)));
});

// ------------------------------------------------- CGD-2 / CG13 + CG16 bonus
test("G1 CG13 (CGD-2) skills gap: Go named as preferred-not-required, artifact plan with budget + review + stopping condition, skill never claimed", () => {
  const r = G.skillGapPlan({ profile: p1, skill: "Go", requirementLevel: "preferred_not_required", role: "Backend Engineer role at Fieldnote", hoursPerWeek: 2 });
  assertCgContract("CG13", r.text);
  assert.equal(r.alreadyHasSkill, false, "Go is never claimed as a current skill (P1 proves Python/SQL only)");
  assert.equal(r.requirementLevel, "preferred_not_required");
  assert.ok(r.artifact && /README|tests/i.test(r.artifact), "the plan builds a concrete artifact with README/tests");
  assert.ok(r.totalMinutesPerWeek <= 120, "the plan fits the stated time budget");
  assert.ok(r.reviewMethod && r.stoppingCondition, "review method + stopping condition present (deep dive 4 §5)");
  assertRubricMinimums("CG13", rubricAnchors(r, baseChecks(r)));
});

test("G1 CG16 interest change: plan replans around data/analytics, old SWE-only plan retired, transferable evidence cited", () => {
  const r = G.replanForInterestChange({ profile: p1, previousInterest: "software engineering", newInterest: "data analytics" });
  assertCgContract("CG16", r.text);
  assert.equal(r.activeInterest, "data analytics");
  assert.equal(r.retiredInterest, "software engineering");
  assert.ok(r.paths.length >= 1 && r.paths.every((p) => /data|analytics/i.test(p.title + p.id)), "every active path centers the new interest");
  assert.ok((r.transferableFactIds || []).length > 0, "transferable profile evidence (Python/SQL work) is cited by fact ID");
  assertRubricMinimums("CG16", rubricAnchors(r, baseChecks(r)));
});

// ------------------------------------------- constraints + odds hard rules
test("G1 constraints: filterOpportunities enforces remote-only (CG03 class) and paid-only (CG02 class) at the service level", () => {
  const opps = [
    { id: "A", title: "Remote Intern", mode: "remote", pay: "$30/hr stated" },
    { id: "B", title: "Hybrid Intern", mode: "hybrid", pay: "$30/hr stated" },
    { id: "C", title: "Remote Unpaid", mode: "remote", pay: null },
    { id: "D", title: "On-site Intern", mode: "on-site", pay: "$25/hr stated" },
  ];
  const remote = G.filterOpportunities(opps, { remoteOnly: true });
  assert.deepEqual(remote.kept.map((o) => o.id), ["A", "C"], "remote-only keeps only remote roles");
  assert.ok(remote.excluded.find((e) => e.id === "B" && /remote/i.test(e.reason)), "exclusions carry reasons");
  const paid = G.filterOpportunities(opps, { needsIncome: true });
  assert.deepEqual(paid.kept.map((o) => o.id), ["A", "B", "D"], "income constraint drops the pay-unknown role, never recommends it as affordable");
});

test("G1 HARD RULE: the module cannot emit a success percentage — detector, guard, and an explicit odds request", () => {
  assert.deepEqual(G.fabricatedOddsIn("Your chance is 70% and a job is guaranteed."), G.fabricatedOddsIn("Your chance is 70% and a job is guaranteed."), "detector is deterministic");
  assert.ok(G.fabricatedOddsIn("you have a 70% chance").length > 0, "detector catches a stated percentage chance");
  assert.ok(G.fabricatedOddsIn("this guarantees you an offer").length > 0, "detector catches a guarantee");
  assert.throws(() => G.guardReply("You will definitely get hired."), /fabricated_odds/, "guardReply refuses odds text");
  const asked = G.answerGuidance({ intent: "odds_request", text: "What are my odds of getting in, as a percentage?", profile: p1 });
  assert.equal(asked.ok, true);
  assert.deepEqual(G.fabricatedOddsIn(asked.text), [], "even when asked directly, no odds are emitted");
  assert.ok(!/%/.test(asked.text), "no percent sign in the refusal");
  assert.match(asked.text, /cannot|no sourced|not something I can/i, "the refusal says why and stays honest");
  // Every public function's output across the whole suite of intents passes the guard.
  const all = G.answerGuidance({ intent: "plan_paths", profile: cg05 });
  assert.deepEqual(G.fabricatedOddsIn(all.text), []);
});

test("G1 CG20 (CGD-3, bonus): an instruction injected in posting text is flagged and never obeyed", () => {
  const s = snap("cg20-malicious-posting.json");
  const blob = JSON.stringify(s);
  const r = G.detectInjectedInstruction({ text: blob });
  assert.equal(r.injected, true, "the passport-disclosure instruction aimed at the reader/agent is detected");
  assert.equal(r.action, "ignored_as_authority", "external content is data, never authority");
  assert.match(r.warning, /do not|never|ignore/i);
  assert.deepEqual(G.fabricatedOddsIn(r.warning), []);
  const clean = G.detectInjectedInstruction({ text: "Software Engineering Intern. Requirements: Python, SQL. Apply by the deadline on this page." });
  assert.equal(clean.injected, false, "an ordinary posting is not flagged");
});

test("G1 dispatch: answerGuidance routes every CGD-1 intent and returns the router-ready shape", () => {
  const intents = ["plan_paths", "graduation_window", "honest_evidence", "classify_credential", "trend_scope", "thin_sample", "sponsorship_history", "work_authorization", "certificate_purchase", "time_budget_plan", "skill_gap_plan", "rejection", "suspicious_posting", "mentor_source", "interest_change", "odds_request"];
  assert.deepEqual([...G.GUIDANCE_INTENTS].sort(), [...intents].sort(), "the exported intent list is exactly the documented set");
  for (const intent of intents) assert.equal(typeof G.INTENT_TO_FUNCTION[intent], "string", `${intent} maps to a named function for the route note`);
  const r = G.answerGuidance({ intent: "time_budget_plan", profile: p1, hoursPerWeek: 2 });
  assert.equal(r.kind, "time_budget_plan");
  assert.ok(r.text && r.nextStep !== undefined && Array.isArray(r.unknowns), "router-ready shape: text + nextStep + unknowns");
  const bad = G.answerGuidance({ intent: "nope", profile: p1 });
  assert.equal(bad.ok, false, "unknown intent fails closed");
  assert.equal(bad.code, "unknown_intent");
});
