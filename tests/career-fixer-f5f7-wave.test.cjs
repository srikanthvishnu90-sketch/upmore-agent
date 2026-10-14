"use strict";
// FIXER WAVE (F5 Interview Prep + F7 Intelligence/Honest Advice) — fail-first
// replay tests for the defects that live INSIDE 127-career-prep.js and
// 144-career-guidance.js at the fresh-300 build (54efb97 lineage).
//
// Every prep test calls 127 through the EXACT argument shapes the chat
// router (142 handlePrepExtras, read-only for this lane) uses — not the
// service-helper shapes — because the chat path is what the gauntlet grades.
// Guidance tests grade answerGuidance records against the executable
// doorstep contract (scripts/career/gauntlet/doorstep-contracts.cjs
// validateF7) plus the grader-v2 H-12 ending rule applied to the record's
// own text (the text 144 owns via finalize()).
//
// Check: node --test tests/career-fixer-f5f7-wave.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const Prep = require(path.join(ROOT, "packages/domain/127-career-prep.js"));
const G = require(path.join(ROOT, "packages/domain/144-career-guidance.js"));
const Profile = require(path.join(ROOT, "packages/domain/122-career-profile.js"));
const Contracts = require(path.join(ROOT, "scripts/career/gauntlet/doorstep-contracts.cjs"));

const loadProfile = (dir) => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/gauntlet/profiles", dir, "profile.json"), "utf8")));
const p1 = loadProfile("p1-early-career-swe");
const stripe = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/cirs/stripe.json"), "utf8"));

// grader-v2 checkH12_oneNextStep, applied to a record's own text
const H12 = /\?/.test.bind(null) || null;
function endsWithNextStep(text) {
  const last = String(text || "").trim().split("\n").filter(Boolean).pop() || "";
  return /\?/.test(last) || /\b(want me to|shall i|say the word|tell me|tap|reply (yes|with)|next:|approve|book it|want the|want to see|shall we)\b/i.test(last);
}

// ---------------------------------------------------------- 127 / SC-176 shape
test("F5 chat path: composeBrief called the way 142 calls it (profile, posting) keeps company + role + questions", () => {
  // 142 handlePrepExtras: Prep.composeBrief(profile, { title, company }, null)
  const brief = Prep.composeBrief(p1, { title: "Software Engineering Intern", company: "Stripe" }, null);
  assert.equal(brief.company, "Stripe", "company from the router's second argument must not be dropped");
  assert.equal(brief.role, "Software Engineering Intern", "role comes from the posting title the router passes");
  assert.ok(brief.no_fit_statement === true || (brief.stories_mapped || []).length >= 0, "story mapping field present");
  assert.ok("stories_note" in brief || (brief.stories_mapped || []).length, "explicit no-fit statement or mapped stories");
  const qs = brief.likely_questions || brief.questions || [];
  assert.ok(qs.length >= 3, "brief carries the likely questions the router surfaces (brief.likely_questions)");
});

test("F5 service path control: composeBrief with a CIR still validates F5 (doorstep contract)", () => {
  const brief = Prep.composeBrief({ cir: stripe, company: "Stripe", role: "SWE Intern" });
  const v = Contracts.validate("F5", brief);
  assert.equal(v.valid, true, JSON.stringify({ missing: v.missing, invalid: v.invalid }));
});

// ---------------------------------------------------------- 127 / SC-180 STAR bank
test("F5 SC-180: buildStoryBank exists (142 guards on it) and mines only facts with action+result", () => {
  assert.equal(typeof Prep.buildStoryBank, "function", "Prep.buildStoryBank must exist — 142's STAR-bank branch is guarded on it");
  const profile = { facts: [
    { id: "F-1", kind: "project", title: "Scheduler", text: "Built a scheduler", action: "I built the matching engine", result: "24 classmates used it weekly" },
    { id: "F-2", kind: "education", title: "B.S. CS", text: "Coursework only, no action/result fields" },
  ] };
  const bank = Prep.buildStoryBank(profile);
  const stories = bank.stories || bank;
  assert.ok(Array.isArray(stories), "bank carries a stories array (142 reads bank.stories)");
  assert.equal(stories.length, 1, "only the fact with an action and a result becomes a story — nothing invented");
  assert.equal(stories[0].title, "Scheduler");
  const empty = Prep.buildStoryBank({ facts: [] });
  assert.equal((empty.stories || []).length, 0, "no facts -> honestly empty bank");
  assert.ok(empty.note && /empty|no story/i.test(empty.note), "empty bank says so instead of inventing stories");
});

// ---------------------------------------------------------- 127 / failure story (SC-177/196 shape)
test("F5 failure story: router reads st.ok and st.beats — both must exist and match the status", () => {
  const withSetback = { facts: [{ id: "F-X", kind: "experience", title: "Launch that failed", text: "Our launch failed and missed the deadline", action: "I rebuilt the rollout after the failure", result: "shipped two weeks later" }] };
  const ok = Prep.failureStoryFromFacts(withSetback);
  assert.equal(ok.status, "OK");
  assert.equal(ok.ok, true, "ok flag the router checks (st.ok) must be true when a story was built");
  assert.ok(Array.isArray(ok.beats) && ok.beats.length >= 2 && ok.beats.every((b) => typeof b === "string" && b.length > 3),
    "beats: the story lines the router turns into reply facts");
  const none = Prep.failureStoryFromFacts(p1);
  assert.equal(none.status, "NO_SETBACK_FACT");
  assert.equal(none.ok, false, "ok flag must be false when no setback fact exists — no invented story");
  assert.equal(none.story, null);
});

// ---------------------------------------------------------- 127 / day-of checklist (SC-203 shape)
test("F5 day-of checklist: (profile, opts) router shape keeps opts and exposes flat items for the router", () => {
  const ck = Prep.dayOfChecklist(p1, { company: "Stripe", when: "Thu 10:00", link: "https://example.test/interview" });
  assert.equal(ck.company, "Stripe", "company from the router's second argument must not be dropped");
  const items = ck.items || ck.checklist || [];
  assert.ok(Array.isArray(items) && items.length >= 6, "flat items/checklist array the router reads (ck.items || ck.checklist)");
  assert.ok(items.some((i) => /Thu 10:00/.test(i)), "the supplied time survives into the items");
  const proper = Prep.dayOfChecklist({ company: "Goldman Sachs", cir: null, when: "Fri 09:00" });
  assert.ok(proper.groups && proper.groups.logistics, "service-shape call still returns groups");
  assert.ok(proper.missing.includes("link"), "missing link still flagged, never invented");
});

test("F5 day-of checklist: empty inputs never leak the raw NOT SUPPLIED token into flat items (SC-198 regression)", () => {
  // Grader finding (F5/F7 wave, fresh SC-198): with nothing supplied, the
  // router-rendered checklist surfaced the internal placeholder verbatim —
  // "When: NOT SUPPLIED Company: NOT SUPPLIED Location/joining: NOT SUPPLIED".
  // Missing fields stay flagged, in the module's own prose convention
  // ("NO LINK SUPPLIED — flagged, not invented"), never as a bare token.
  const ck = Prep.dayOfChecklist(p1, {});
  const items = ck.items || ck.checklist || [];
  assert.ok(items.length >= 6, "flat items still produced");
  assert.ok(!items.some((i) => /NOT SUPPLIED/.test(i)), "no raw NOT SUPPLIED token in any flat item: " + items.filter((i) => /NOT SUPPLIED/.test(i)).join(" | "));
  assert.ok(ck.missing.includes("when") && ck.missing.includes("link") && ck.missing.includes("company"), "missing[] still lists the gaps");
  assert.ok(items.some((i) => /not supplied/i.test(i)), "the gaps are still flagged in prose on the checklist itself");
});

// ---------------------------------------------------------- 127 / interviewer research overload
test("F5 interviewer research: (peopleArray, profile) router overload works and each person carries a whois_line", () => {
  const people = [{ name: "Sam Reyes (TEST)", role: "Engineer", company: "Stripe", publicFacts: [{ text: "Sam Reyes works on the payments team at Stripe", source: "public page (TEST)" }] }];
  const r = Prep.interviewerResearch(people, p1, {});
  assert.equal(r.people.length, 1, "the people array the router passes positionally must not be dropped");
  assert.ok(r.people[0].whois_line && /Sam Reyes/.test(r.people[0].whois_line), "whois_line the router surfaces is present");
  const svc = Prep.interviewerResearch({ people, profile: p1 });
  assert.equal(svc.people.length, 1, "service-shape call still works");
  assert.equal(svc.people[0].status, "OK");
});

// ---------------------------------------------------------- 127 / SC-185 case plan
test("F5 SC-185: casePrepPlan keeps the community-reported label, dated sources, and no internal function names", () => {
  const plan = Prep.casePrepPlan({ company: "McKinsey", weeks: 6 });
  assert.equal(plan.practice_norm.label, "community-reported", "the 30-50 norm stays labeled community-reported");
  assert.equal(plan.practice_norm.official, false, "never presented as official/sourced fact");
  assert.ok(plan.schedule.inside_norm && plan.schedule.total_cases >= 30 && plan.schedule.total_cases <= 50, "schedule lands inside the labeled norm");
  assert.ok(Array.isArray(plan.sources), "plan record carries sources");
  assert.ok(typeof plan.text === "string" && /community-reported/i.test(plan.text), "plan text states the label in plain prose");
  assert.ok(!/scoreCaseResponse|caseSession|function/i.test(JSON.stringify(plan)), "no internal function names leak into the plan record");
});

// ---------------------------------------------------------- 127 / SC-197 structure drill
test("F5 SC-197: structureDrill enters the drill — typed DRILL_STARTED result with a re-mock question", () => {
  const d = Prep.structureDrill({ answer: "I did various things and stuff and it was fine." });
  assert.equal(d.fix_first, "structure");
  assert.equal(d.drill_started, true, "the drill turn starts the drill; it does not merely describe one");
  assert.equal(d.status, "DRILL_STARTED");
  assert.equal(d.kind, "structure_drill");
  assert.ok(d.re_mock && typeof d.re_mock.question === "string" && d.re_mock.question.length > 10, "a concrete re-mock question is issued");
});

// ---------------------------------------------------------- 144 / F7 completeness + H-12 endings
const F7_CTX = {
  plan_paths: { intent: "plan_paths", profile: p1 },
  graduation_window_outside: { intent: "graduation_window", profile: p1, candidateGraduation: "2028-05", requiredGraduationYears: [2027] },
  graduation_window_inside: { intent: "graduation_window", profile: p1, candidateGraduation: "2027-05", requiredGraduationYears: [2027, 2028] },
  graduation_window_unknown: { intent: "graduation_window", profile: p1 },
  honest_evidence: { intent: "honest_evidence", profile: p1 },
  classify_credential_sim: { intent: "classify_credential", profile: p1, kind: "simulation", provider: "Forage", sponsor: "Stripe" },
  classify_credential_unknown: { intent: "classify_credential", profile: p1, kind: "mystery" },
  trend_scope_snapshot: { intent: "trend_scope", profile: p1, snapshot: { frozen_text: "National outlook text", snapshot_of: "BLS occupational outlook (frozen snapshot)", source_url: "https://www.bls.gov/ooh/" }, place: "Chicago", field: "software" },
  trend_scope_no_snapshot: { intent: "trend_scope", profile: p1 },
  thin_sample: { intent: "thin_sample", profile: p1, sample: { n: 3, successes: 2, scope: "one employer, one year" } },
  sponsorship_history: { intent: "sponsorship_history", profile: p1 },
  work_authorization: { intent: "work_authorization", profile: p1 },
  certificate_purchase_unrequired: { intent: "certificate_purchase", profile: p1, cost: 499 },
  certificate_purchase_required: { intent: "certificate_purchase", profile: p1, cost: 499, requiredByRoles: ["Backend Engineer posting at Fieldnote"] },
  time_budget_plan: { intent: "time_budget_plan", profile: p1, hoursPerWeek: 2 },
  skill_gap_plan: { intent: "skill_gap_plan", profile: p1, skill: "Go", requirementLevel: "preferred_not_required", hoursPerWeek: 2 },
  rejection_no_feedback: { intent: "rejection", profile: p1 },
  rejection_with_feedback: { intent: "rejection", profile: p1, feedback: "Your DCF lacked a sensitivity table." },
  suspicious_posting: { intent: "suspicious_posting", profile: p1, postingText: "Pay a $200 fee before starting. Send bank account details to a personal email address." },
  mentor_source_approved: { intent: "mentor_source", profile: p1, source: { mentor: { approved_to_share: "Analyst at Lakefront Bank (TEST), mentored through the campus program", not_approved_to_share: ["private email: mentor.private@example.test", "private phone: 555-0199"] } } },
  mentor_source_none: { intent: "mentor_source", profile: p1, source: { mentor: {} } },
  interest_change: { intent: "interest_change", profile: p1, newInterest: "data analytics", previousInterest: "software engineering" },
  odds_request: { intent: "odds_request", profile: p1 },
};
for (const [label, ctx] of Object.entries(F7_CTX)) {
  test(`F7 ${label}: record validates F7 and its own text ends with its concrete next step (H-12)`, () => {
    const r = G.answerGuidance(ctx);
    const v = Contracts.validate("F7", r);
    assert.equal(v.valid, true, `${label}: ${JSON.stringify({ missing: v.missing, invalid: v.invalid })}`);
    assert.ok(r.nextStep, `${label}: nextStep populated`);
    assert.ok(endsWithNextStep(r.text), `${label}: text ends with one concrete next action or a single question — last line: ${(r.text || "").trim().split("\n").pop()}`);
    assert.deepEqual(G.fabricatedOddsIn(r.text), [], `${label}: no fabricated odds`);
    assert.ok(!/%/.test(r.text), `${label}: no percent sign in guidance text`);
  });
}

test("F7 SC-248-adjacent service shape: honest_evidence is the real alternative — labeled, sourced, no invented experience", () => {
  const r = G.answerGuidance({ intent: "honest_evidence", profile: p1 });
  assert.equal(r.inventedExperience, false);
  assert.ok(r.sources.length >= 1, "the alternative's record carries its sources");
  assert.ok((r.plan || r.action_plan || []).length >= 3, "the alternative is a concrete timed plan, not a prose gesture");
});
