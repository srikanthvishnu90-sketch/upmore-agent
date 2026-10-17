// Answer-map derivation guards — BUG-238 / FR-396 (contract:
// docs/career/contracts/bug-238-answer-map-derivation.md).
//
// The defect: the pipeline's answer map was hand-maintained and lagged
// the fact bank — it carried only work_authorization + sponsorship, so
// drives stopped on questions the bank already answered (the Claude
// Corps staging stop on "Are you 18 or older?" with the DOB fact on
// file, 2026-10-15). The map is now DERIVED from the bank in module
// 149 (deriveAnswers), and this suite is the permanent enforcement:
//   1. every fact KIND the bank carries is consumed by a derivation or
//      exempted with a reason — a new kind FAILS this suite until it is
//      wired (the forcing function; proven below on a synthetic kind);
//   2. every derived answer traces to a fact ID and a declared
//      fact-kind source (ANSWER_KEY_SOURCES) — a hand-added key with no
//      source fails;
//   3. only status:"confirmed" facts yield answers;
//   4. module 150 classifies the new question phrasings to the derived
//      keys, and the "highest COMPLETED education" phrasing routes to
//      a key the bank cannot answer (it stays an honest ask);
//   5. end to end: a board field the bank answers is FILLED; the same
//      field stops the drive when its fact is removed; an unmapped
//      required field always stops the drive.
// Check: node --test tests/career-portal-answer-map.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

const NOW = "2026-10-15T12:00:00Z";

// The real bank when present (it lives outside the repo by the privacy
// rule); a same-shaped mini bank keeps the suite portable elsewhere.
// v224 combine privacy fix: the mini bank's values are SYNTHETIC
// (same shapes and fact IDs, invented values) — as first landed it
// mirrored the owner's real fact bank verbatim, including the
// sensitive F-023/F-024 values, which the privacy rule keeps out of
// this public repo. Assertions that depend on bank values read them
// from the loaded bank instead of hardcoding either world's values.
function loadBank() {
  const p = path.join(process.env.HOME || "", "workspace/your_files/real-apply/fact-bank.json");
  try { return { bank: JSON.parse(fs.readFileSync(p, "utf8")), real: true }; } catch (e) { /* fall through */ }
  return { bank: MINI_BANK, real: false };
}
const MINI_BANK = {
  basics: { name: "Alex Testcase", location: "Chicago, IL", country: "United States" },
  defaults: { gpa: "3.9" },
  facts: [
    { id: "F-001", kind: "education", status: "confirmed", title: "Pursuing Bachelors in Computer Science, State University", org: "State University - College of Arts and Sciences", start: "2025", end: "2029" },
    { id: "F-002", kind: "experience", status: "confirmed", name: "Founder, Testcorp AI", start: "2025", end: "present" },
    { id: "F-004", kind: "experience", status: "confirmed", name: "Founder, Testvault", start: "2023", end: "2025" },
    { id: "F-020", kind: "eligibility", status: "confirmed", name: "Work authorization (US)", value: "Yes" },
    { id: "F-021", kind: "eligibility", status: "confirmed", name: "Sponsorship requirement", value: "No" },
    { id: "F-022", kind: "profile", status: "confirmed", name: "Country", value: "United States" },
    { id: "F-023", kind: "profile", status: "confirmed", name: "Date of birth", value: "2000-01-15" },
    { id: "F-024", kind: "profile", status: "confirmed", name: "Hometown", value: "Chicago, Illinois" },
    { id: "F-030", kind: "skill", status: "confirmed", name: "React", value: "React" },
  ],
};
const { bank: BANK, real: REAL_BANK } = loadBank();

test("coverage: every fact kind in the bank is consumed or exempted with a reason — zero uncovered", () => {
  const cov = Portal.answerMapCoverage(BANK);
  assert.deepEqual(cov.uncovered, [], `uncovered kinds force wiring, not silent stops (bank: ${REAL_BANK ? "real" : "mini"})`);
  for (const ex of cov.exempt) assert.ok(ex.reason && ex.reason.length > 10, `exemption for ${ex.kind} carries a reason`);
});

test("forcing function: a confirmed fact kind nobody consumes FAILS coverage (the bank growing forces the wiring)", () => {
  const grown = JSON.parse(JSON.stringify(BANK));
  grown.facts.push({ id: "F-900", kind: "military_service", status: "confirmed", name: "Military service", value: "None" });
  const cov = Portal.answerMapCoverage(grown);
  assert.deepEqual(cov.uncovered, ["military_service"], "the novel kind is named uncovered — the suite fails until a derivation or a reasoned exemption lands");
});

test("derivation: every bank-answered kind resolves, each answer traced to its fact ID", () => {
  const d = Portal.deriveAnswers(BANK, NOW);
  assert.equal(d.answers.work_authorization.value, "Yes"); assert.equal(d.answers.work_authorization.factId, "F-020");
  assert.equal(d.answers.sponsorship.value, "No"); assert.equal(d.answers.sponsorship.factId, "F-021");
  assert.equal(d.answers.located_in_us.value, "Yes"); assert.equal(d.answers.located_in_us.factId, "F-022");
  assert.equal(d.answers.age_18_plus.value, "Yes"); assert.equal(d.answers.age_18_plus.factId, "F-023");
  assert.equal(d.answers.education_level.value, "Bachelor's Degree"); assert.equal(d.answers.education_level.factId, "F-001");
  assert.equal(d.answers.experience_3mo_plus.value, "Yes"); assert.equal(d.answers.experience_3mo_plus.factId, "F-004");
  assert.ok(d.answers.years_of_experience.value >= 3, "the experience span (2023 -> 2026) yields at least 3 completed years");
  assert.equal(d.profileFields.state_of_residence, "Illinois");
  assert.equal(d.profileFields.time_zone, "America/Chicago");
  assert.equal(d.profileFields.date_of_birth, BANK.facts.find((f) => f.id === "F-023").value, "the DOB profile field carries the bank's own F-023 value, whichever bank loaded");
  assert.equal(d.profileFields.country, "United States");
  assert.ok(d.profileFields.preferred_name && d.profileFields.preferred_name.length > 0, "preferred name derives from the bank's name");
  assert.equal(d.profileFields.education && d.profileFields.education.school, BANK.facts.find((f) => f.id === "F-001").org, "the education block derives from the bank's education fact, whichever bank loaded");
  // the "completed" nuance (R3, 2026-10-17): an in-progress degree NEVER
  // answers a completed-education question — only an explicitly completed
  // credential fact does. The bank-aware form: when the loaded bank carries
  // that fact (owner-delegated F-030), the key resolves to ITS value; when
  // it does not (mini bank), the key stays absent. The synthetic pin below
  // proves the in-progress-only case can never resolve.
  const completedFact = BANK.facts.find((f) => f.kind === "profile" && /completed education/i.test(f.name || ""));
  if (completedFact) {
    assert.equal(d.answers.education_level_completed.value, completedFact.value, "a completed-credential fact answers the completed-education key with its own value");
    assert.equal(d.answers.education_level_completed.factId, completedFact.id);
  } else {
    assert.equal(d.answers.education_level_completed, undefined, "an in-progress degree never answers a completed-education question");
  }
});

test("declared-source law: every emitted answer key is declared in ANSWER_KEY_SOURCES with a fact-kind source", () => {
  const d = Portal.deriveAnswers(BANK, NOW);
  for (const key of Object.keys(d.answers)) {
    assert.ok(Portal.ANSWER_KEY_SOURCES[key], `answer key ${key} has a declared source — a hand-added key fails here`);
    assert.ok(Portal.ANSWER_KEY_SOURCES[key].length > 0);
    assert.ok(d.traces[key] && d.traces[key].factId, `answer key ${key} carries its fact trace`);
  }
});

test("confirmed-only: an unconfirmed fact yields no answer (the DOB flipped unconfirmed -> the 18+ answer vanishes)", () => {
  const b2 = JSON.parse(JSON.stringify(BANK));
  const dob = b2.facts.find((f) => f.id === "F-023"); dob.status = "unconfirmed";
  const d = Portal.deriveAnswers(b2, NOW);
  assert.equal(d.answers.age_18_plus, undefined);
  assert.equal(d.profileFields.date_of_birth, undefined);
  assert.equal(d.answers.work_authorization.value, "Yes", "unrelated derivations are untouched");
});

test("classification: module 150 routes the new phrasings to the derived keys", () => {
  const cls = (label, inputType = "text", extra = {}) => {
    const { defs } = BrowserBoard.classifyFields([Object.assign({ label, name: "", id: "", inputType, tag: "input", cls: "", selector: "#x", required: true }, extra)]);
    return defs[0];
  };
  assert.equal(cls("Are you 18 or older?").question_key, "age_18_plus");
  assert.equal(cls("Are you at least 18 years of age?").question_key, "age_18_plus");
  assert.equal(cls("Are you currently located in the United States?").question_key, "located_in_us");
  assert.equal(cls("Do you have 3+ months of internship experience?").question_key, "experience_3mo_plus");
  assert.equal(cls("How many years of experience do you have?", "text").question_key, "years_of_experience");
  assert.equal(cls("What is your highest level of education?").question_key, "education_level");
  assert.equal(cls("What is the highest level of completed education?").question_key, "education_level_completed", "the completed phrasing routes to the key the bank cannot answer");
  assert.equal(cls("What is the highest level of education you have completed?").question_key, "education_level_completed", "the live claudecorps wording (completed after education) routes the same way");
  assert.equal(cls("In which state do you currently reside?").profile_key, "state_of_residence");
  assert.equal(cls("State of residence").profile_key, "state_of_residence");
  assert.equal(cls("What time zone are you in?").profile_key, "time_zone");
  assert.equal(cls("Date of birth").profile_key, "date_of_birth");
  assert.equal(cls("Degree", "text", { cls: "select__input" }).question_key, "education_level", "a widget Degree field (the boards' built-in) takes the derived level, never the degree name");
  assert.equal(cls("Degree *", "text", { cls: "select__input" }).question_key, "education_level", "the boards print the required marker in the label — the anchored rule still fires");
  assert.equal(cls("Degree", "text").profile_key, "education_degree", "a text Degree field keeps the degree name");
  const essay = cls("Describe your experience leading a team", "textarea");
  assert.notEqual(essay.question_key, "years_of_experience", "a free-text experience essay is never auto-answered with a number");
  assert.notEqual(essay.question_key, "experience_3mo_plus");
});

// ---------- end to end over a stub board (the Claude Corps shape) ----------
function stubBoard(defs) {
  const held = {};
  const calls = { submit: 0 };
  return {
    kind: "browser", sandbox: false, browserDriver: true, atsFamily: "greenhouse", host: "boards.greenhouse.io", calls,
    open() { return { ok: true, captcha: null }; },
    form() { return { fields: defs.map((d) => Object.assign({}, d)), captchaAt: null }; },
    fill(id, v) { held[id] = v; return v; },
    answers() { return Object.assign({}, held); },
    atReview() { return { ok: true, captcha: null }; },
    armForSubmit() { return { armed: true }; },
    submit() { calls.submit += 1; return { outcome: "accepted", confirmationId: "STUB-1" }; },
    submissionState() { return { submitted: false, confirmationId: null }; },
    held,
  };
}
function profileFromBank(b) {
  const d = Portal.deriveAnswers(b, NOW);
  return Object.assign({
    name: "Alex Testcase (TEST)", email: "v@example.test", phone: "+1 000 555 0100", location: "Chicago, IL",
    resume: { filename: "resume.pdf", sha256: "b".repeat(64) },
    answers: d.answers,
  }, d.profileFields);
}
const POSTING = { id: "JOB-CC", canonicalKey: "greenhouse:anthropic:claude-corps-test", company: "TEST Corps", role: "Fellow", url: "https://boards.greenhouse.io/test/jobs/1", status: "open", atsFamily: "greenhouse" };

test("end to end: the 18+ field is FILLED from the DOB fact; an unmapped required field still stops the drive", () => {
  const { defs } = BrowserBoard.classifyFields([
    { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
    { label: "Email", name: "email", id: "email", inputType: "email", tag: "input", cls: "", selector: "#email", required: true },
    { label: "Are you 18 or older?", name: "q_age", id: "q_age", inputType: "text", tag: "input", cls: "select__input", selector: "#q_age", required: true },
    { label: "What is your favorite color?", name: "q_color", id: "q_color", inputType: "text", tag: "input", cls: "", selector: "#q_color", required: true },
  ]);
  const board = stubBoard(defs);
  const session = Portal.createPortalSession({ userId: "u-test", board });
  const r = Portal.runApply(session, { posting: POSTING, profile: profileFromBank(BANK), log: { records: [] } });
  assert.equal(r.resultStatus, "awaiting_user", "the unmapped required field stops the drive — never guessed");
  const ageDef = defs.find((d) => d.question_key === "age_18_plus");
  assert.ok(ageDef, "the 18+ field classified to the derived key");
  assert.equal(board.held[ageDef.field_id], "Yes", "the 18+ field was filled from F-023 before the stop");
  const colorDef = defs.find((d) => /favorite color/i.test(d.label || ""));
  assert.ok(colorDef, "the unmapped field classified as its own def");
  assert.ok((r.asks || []).some((a) => a.field_id === colorDef.field_id), "the stop names the unmapped field");
  assert.equal(board.calls.submit, 0);
});

test("end to end: remove the DOB fact and the SAME 18+ field stops the drive (nothing fills it)", () => {
  const b2 = JSON.parse(JSON.stringify(BANK));
  b2.facts = b2.facts.filter((f) => f.id !== "F-023");
  const { defs } = BrowserBoard.classifyFields([
    { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
    { label: "Email", name: "email", id: "email", inputType: "email", tag: "input", cls: "", selector: "#email", required: true },
    { label: "Are you 18 or older?", name: "q_age", id: "q_age", inputType: "text", tag: "input", cls: "select__input", selector: "#q_age", required: true },
  ]);
  const board = stubBoard(defs);
  const session = Portal.createPortalSession({ userId: "u-test", board });
  const r = Portal.runApply(session, { posting: POSTING, profile: profileFromBank(b2), log: { records: [] } });
  assert.equal(r.resultStatus, "awaiting_user");
  const ageDef = defs.find((d) => d.question_key === "age_18_plus");
  assert.equal(board.held[ageDef.field_id], undefined, "no fact, no fill — the field is asked, not answered");
  assert.equal(board.calls.submit, 0);
});

// ---------- R2 binding audit (2026-10-17): the questions Lane E's re-drive
// stopped on although a confirmed source already answered them ----------
// Audit of submissions/redrive-r2-2026-10-16 (25 applications, 20 parked).
// Each guard below replays one verbatim employer label from that run.
// Fail-first: every classification/derivation/resolution assertion in
// this section is RED on the pre-fix tree (the bindings did not exist);
// the federal-question guard and the Current Company classification are
// pins (green before and after) that keep the widenings honest.
const SYNTH_BANK = {
  basics: { name: "Sam Synthetic", location: "Springfield, IL", country: "United States" },
  defaults: { gpa: "3.5" },
  facts: [
    { id: "F-001", kind: "education", status: "confirmed", title: "Pursuing Bachelors in Computer Science, Synthetic University", org: "Synthetic University", start: "2025", end: "2029", text: "Pursuing Bachelors in Computer Science at Synthetic University, 2025 - 2029." },
    { id: "F-002", kind: "experience", status: "confirmed", org: "Acme Corp", role: "Founder", title: "Founder, Acme Corp", start: "2025", end: "present", text: "Founder, Acme Corp, 2025 - present." },
    { id: "F-003", kind: "experience", status: "confirmed", org: "Beta LLC", role: "Intern", title: "Intern, Beta LLC", start: "2024", end: "2025", text: "Intern, Beta LLC, 2024 - 2025." },
    { id: "F-007", kind: "certification", status: "confirmed", org: "Synthetic Prep", title: "Synthetic Modeling Program", text: "Synthetic Modeling Program." },
    { id: "F-020", kind: "eligibility", status: "confirmed", name: "Work authorization (US)", value: "Yes" },
    { id: "F-021", kind: "eligibility", status: "confirmed", name: "Sponsorship requirement", value: "No" },
  ],
};
const clsR2 = (label, inputType = "text", extra = {}) => {
  const { defs } = BrowserBoard.classifyFields([Object.assign({ label, name: "", id: "", inputType, tag: "input", cls: "", selector: "#x", required: true }, extra)]);
  return defs[0];
};

test("R2 classification: Chime's eligibility phrasing routes to work_authorization (Lane E's flagged miss)", () => {
  assert.equal(clsR2("Are you currently eligible to work legally in the United States of America?").question_key, "work_authorization");
});

test("R2 classification: Sezzle's slash-qualified experience phrasing routes to experience_3mo_plus", () => {
  assert.equal(clsR2("Do you have 3+ months of internship / work experience?").question_key, "experience_3mo_plus");
});

test("R2 classification: Affirm's state-or-province phrasing routes to state_of_residence", () => {
  assert.equal(clsR2("Which U.S. State or Canadian Province do you reside in?").profile_key, "state_of_residence");
});

test("R2 classification: prior-employment phrasings (six employers, verbatim) route to prior_employment", () => {
  const labels = [
    "Have you been employed by Gemini in the past?",
    "Have you ever worked for Figma before, as an employee or a contractor/consultant?",
    "Have you previously been employed at Affirm for any length of time?",
    "Have you previously worked at or consulted for GitLab?",
    "Have you previously worked for Everpure (formerly Pure Storage)?",
    "Have you ever been employed by or performed services for Ginkgo Bioworks Inc., a current subsidiary of Ginkgo Bioworks or a company acquired by Ginkgo Bioworks?",
  ];
  for (const l of labels) assert.equal(clsR2(l).question_key, "prior_employment", l);
});

test("R2 classification: the federal-employment question is NEVER prior_employment (it asks about government work, not the posting firm)", () => {
  const fed = clsR2("Including your current position, have you ever been employed by the U.S. Federal Government, a contractor (including subsidiaries, parents, and affiliates) that performed work for the U.S. Federal Government, served in the Military, and/or were a Political Appointee?");
  assert.notEqual(fed.question_key, "prior_employment");
});

test("R2 classification: Point72's prior-application phrasing routes to prior_application", () => {
  assert.equal(clsR2("Have you previously applied to work at Point72?").question_key, "prior_application");
});

test("R2 classification: Virtu's full-time-readiness phrasing routes to full_time_readiness", () => {
  assert.equal(clsR2("Will you be ready for full-time employment in 2028?").question_key, "full_time_readiness");
});

test("R2 classification: GCM's outside-activities phrasing routes to outside_activities", () => {
  assert.equal(clsR2("Are you currently or do you expect to be engaged in any other outside business activities or employment once employed by GCM Grosvenor?").question_key, "outside_activities");
});

test("R2 classification: restrictive-agreement phrasings route to restrictive_agreements — and never to a fillable company key", () => {
  const gitlab = clsR2("Are you subject to any employment agreements and/or post-employment restrictions with your current employer or a past employer?");
  assert.equal(gitlab.question_key, "restrictive_agreements");
  assert.equal(gitlab.profile_key, undefined, "the words 'current employer' inside a restrictions question must not bind the current-company value");
  assert.equal(clsR2("Are you currently subject to any agreement with a former employer/third party (such as a non-solicitation or non-compete agreement) that may potentially limit your ability to perform the duties of the position you are applying for?").question_key, "restrictive_agreements");
  assert.equal(clsR2("To your knowledge are you currently subject to any non-compete or non-solicitation restrictions?").question_key, "restrictive_agreements");
});

test("R2 classification: certifications and legal-name fields get their profile keys", () => {
  assert.equal(clsR2("Certifications").profile_key, "certifications");
  assert.equal(clsR2("Legal Name (if different than above)").profile_key, "name");
  assert.equal(clsR2("Current Company").profile_key, "current_company", "pin: this classification already existed — the derivation below is the fix");
});

test("R2 derivation: current_company, employers, certifications and outside_activities derive from confirmed facts only", () => {
  const d = Portal.deriveAnswers(SYNTH_BANK, NOW);
  assert.equal(d.profileFields.current_company, "Acme Corp", "the current (end: present) experience fact's org");
  assert.deepEqual(d.profileFields.employers, ["Acme Corp", "Beta LLC"], "the bank's complete employer set, in bank order");
  assert.equal(d.profileFields.certifications, "Synthetic Modeling Program");
  assert.equal(d.answers.outside_activities.value, "Yes", "a current venture is an outside business activity, stated by the fact itself");
  assert.equal(d.answers.outside_activities.factId, "F-002");
  const past = JSON.parse(JSON.stringify(SYNTH_BANK));
  past.facts.find((f) => f.id === "F-002").end = "2026";
  const d2 = Portal.deriveAnswers(past, NOW);
  assert.equal(d2.profileFields.current_company, undefined, "no current role on file -> no current-company value, the field stays an ask");
  assert.equal(d2.answers.outside_activities, undefined, "the Yes direction only: no current activity on file derives NOTHING (never a guessed No)");
});

test("R2 end to end: the Chime eligibility field is FILLED from F-020 (the exact R2 stop)", () => {
  const { defs } = BrowserBoard.classifyFields([
    { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
    { label: "Email", name: "email", id: "email", inputType: "email", tag: "input", cls: "", selector: "#email", required: true },
    { label: "Are you currently eligible to work legally in the United States of America?", name: "q_elig", id: "q_elig", inputType: "text", tag: "input", cls: "select__input", selector: "#q_elig", required: true },
  ]);
  const board = stubBoard(defs);
  const session = Portal.createPortalSession({ userId: "u-test", board });
  const r = Portal.runApply(session, { posting: POSTING, profile: profileFromBank(BANK), log: { records: [] } });
  const def = defs.find((d) => d.question_key === "work_authorization");
  assert.ok(def, "the field classified to work_authorization");
  assert.equal(board.held[def.field_id], Portal.deriveAnswers(BANK, NOW).answers.work_authorization.value, "filled with the bank's own F-020 value");
  assert.ok(!(r.asks || []).some((a) => a.field_id === def.field_id), "no ask remains for the eligibility field");
  assert.equal(board.calls.submit, 0);
});

test("R2 end to end: prior employment resolves No for a non-employer posting and stays an ask at (or near) a real employer", () => {
  const gammaPosting = Object.assign({}, POSTING, { company: "Gamma Industries", canonicalKey: "greenhouse:gamma:1" });
  const mk = (posting, label) => {
    const { defs } = BrowserBoard.classifyFields([
      { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
      { label, name: "q_prev", id: "q_prev", inputType: "text", tag: "input", cls: "select__input", selector: "#q_prev", required: true },
    ]);
    const board = stubBoard(defs);
    const session = Portal.createPortalSession({ userId: "u-test", board });
    const r = Portal.runApply(session, { posting, profile: profileFromBank(SYNTH_BANK), log: { records: [] } });
    return { defs, board, r };
  };
  const hit = mk(gammaPosting, "Have you been employed by Gamma Industries in the past?");
  const hitDef = hit.defs.find((d) => d.question_key === "prior_employment");
  assert.ok(hitDef, "classified prior_employment");
  assert.equal(hit.board.held[hitDef.field_id], "No", "Gamma is absent from the bank's complete employer set -> No, traced to the experience facts");
  const own = mk(Object.assign({}, POSTING, { company: "Acme Corp", canonicalKey: "greenhouse:acme:1" }), "Have you been employed by Acme Corp in the past?");
  const ownDef = own.defs.find((d) => d.question_key === "prior_employment");
  assert.equal(own.board.held[ownDef.field_id], undefined, "at a real employer the product does NOT derive — the truthful answer there is the user's to state");
  assert.ok((own.r.asks || []).some((a) => a.field_id === ownDef.field_id), "the field stays an ask at a real employer");
  const near = mk(Object.assign({}, POSTING, { company: "Acme Corp Holdings", canonicalKey: "greenhouse:acmeh:1" }), "Have you been employed by Acme Corp Holdings in the past?");
  const nearDef = near.defs.find((d) => d.question_key === "prior_employment");
  assert.equal(near.board.held[nearDef.field_id], undefined, "a near-name of a real employer never derives a No (name-variant safety)");
});

test("R2 end to end: prior application resolves No only on the attested application record (ledger + armed manual set)", () => {
  const gammaPosting = Object.assign({}, POSTING, { company: "Gamma Industries", canonicalKey: "greenhouse:gamma:2" });
  const mk = (input) => {
    const { defs } = BrowserBoard.classifyFields([
      { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
      { label: "Have you previously applied to work at Gamma Industries?", name: "q_applied", id: "q_applied", inputType: "text", tag: "input", cls: "select__input", selector: "#q_applied", required: true },
    ]);
    const board = stubBoard(defs);
    const session = Portal.createPortalSession({ userId: "u-test", board });
    const r = Portal.runApply(session, Object.assign({ posting: gammaPosting, profile: profileFromBank(SYNTH_BANK), log: { records: [] } }, input));
    return { defs, board, r };
  };
  const clean = mk({ manualApplications: [] });
  const cleanDef = clean.defs.find((d) => d.question_key === "prior_application");
  assert.ok(cleanDef, "classified prior_application");
  assert.equal(clean.board.held[cleanDef.field_id], "No", "empty attested record -> No");
  const manual = mk({ manualApplications: [{ company: "Gamma Industries", stage: "applied", source: "user statement" }] });
  assert.equal(manual.board.held[cleanDef.field_id], undefined, "a hand-filed application on the manual set defeats the derivation");
  const blind = mk({});
  assert.equal(blind.board.held[cleanDef.field_id], undefined, "no manual set attested by the host -> no derivation (an unexamined record proves nothing)");
  const ledger = mk({ manualApplications: [], log: { records: [{ userId: "u-test", company: "Gamma Industries", canonicalKey: "greenhouse:gamma:other", status: "submitted", timestamp: "2026-09-01T00:00:00Z" }] } });
  assert.equal(ledger.board.held[cleanDef.field_id], undefined, "a submitted application in the product's own ledger defeats the derivation");
});

test("R2 end to end: full-time readiness resolves against the graduation year on the education fact", () => {
  const mk = (label) => {
    const { defs } = BrowserBoard.classifyFields([
      { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
      { label, name: "q_ft", id: "q_ft", inputType: "text", tag: "input", cls: "select__input", selector: "#q_ft", required: true },
    ]);
    const board = stubBoard(defs);
    const session = Portal.createPortalSession({ userId: "u-test", board });
    Portal.runApply(session, { posting: POSTING, profile: profileFromBank(SYNTH_BANK), log: { records: [] } });
    return { defs, board };
  };
  const before = mk("Will you be ready for full-time employment in 2028?");
  const beforeDef = before.defs.find((d) => d.question_key === "full_time_readiness");
  assert.ok(beforeDef, "classified full_time_readiness");
  assert.equal(before.board.held[beforeDef.field_id], "No", "graduation year 2029 is after 2028 -> not ready in 2028");
  const after = mk("Will you be ready for full-time employment in 2030?");
  const afterDef = after.defs.find((d) => d.question_key === "full_time_readiness");
  assert.equal(after.board.held[afterDef.field_id], "Yes", "graduation year 2029 is not after 2030 -> ready by then");
});

test("R2 end to end: the GitLab restrictions field is never filled with the current company (the misclassification trap)", () => {
  const { defs } = BrowserBoard.classifyFields([
    { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
    { label: "Are you subject to any employment agreements and/or post-employment restrictions with your current employer or a past employer?", name: "q_restr", id: "q_restr", inputType: "text", tag: "input", cls: "", selector: "#q_restr", required: true },
  ]);
  const board = stubBoard(defs);
  const session = Portal.createPortalSession({ userId: "u-test", board });
  const r = Portal.runApply(session, { posting: POSTING, profile: profileFromBank(SYNTH_BANK), log: { records: [] } });
  const def = defs.find((d) => /restrictions/.test(d.label || ""));
  assert.ok(def, "the restrictions field classified");
  assert.equal(board.held[def.field_id], undefined, "no value is ever filled into a restrictions question by the company derivation");
  assert.ok((r.asks || []).some((a) => a.field_id === def.field_id), "the restrictions question stays an honest ask");
  assert.equal(board.calls.submit, 0);
});

// ---------- R3 delegated-answers audit (2026-10-17): the 47-fact owner ask
// sheet, answered by the owner-delegated answer-all directive ----------
// The owner delegated the answers ("answer all of these questions urself",
// 2026-10-17); each became a confirmed fact-bank entry (F-027..F-079,
// provenance "owner-delegated 2026-10-17") and this section is the permanent
// enforcement that every one of them is actually CONSUMED by the answer map:
// classification (module 150 routes the verbatim R2 employer labels to the
// keys), derivation (module 149 emits the answers from the facts alone), and
// end-to-end fills (a fact removed -> the field is an ask again, never a
// guess). Fail-first: every assertion in this section is RED on the
// pre-R3 tree (no classifier rules, no derivations, no attestation fallback).
const R3_BANK = {
  basics: { name: "Sam Synthetic", location: "Chicago, IL", country: "United States" },
  defaults: { gpa: "3.5" },
  facts: [
    { id: "F-001", kind: "education", status: "confirmed", title: "Pursuing Bachelors in Computer Science, Synthetic University", org: "Synthetic University", start: "2025", end: "2029", text: "Pursuing Bachelors in Computer Science at Synthetic University, 2025 - 2029." },
    { id: "F-002", kind: "experience", status: "confirmed", org: "Acme Corp", role: "Founder", title: "Founder, Acme Corp", start: "2025", end: "present", text: "Founder, Acme Corp, 2025 - present." },
    { id: "F-027", kind: "profile", status: "confirmed", name: "Citizenship status", value: "U.S. Citizen" },
    { id: "F-028", kind: "profile", status: "confirmed", name: "Education start month", value: "September" },
    { id: "F-029", kind: "profile", status: "confirmed", name: "Education end month", value: "May" },
    { id: "F-030", kind: "profile", status: "confirmed", name: "Highest level of completed education", value: "High School Diploma" },
    { id: "F-031", kind: "profile", status: "confirmed", name: "How heard (standard answer)", value: "Company Website" },
    { id: "F-032", kind: "profile", status: "confirmed", name: "Current ZIP code", value: "60600" },
    { id: "F-033", kind: "application_answer", status: "confirmed", question_key: "restrictive_agreements", value: "No" },
    { id: "F-034", kind: "application_answer", status: "confirmed", question_key: "acknowledgment_receipt", value: true },
    { id: "F-035", kind: "application_answer", status: "confirmed", question_key: "military_service", value: "No" },
    { id: "F-036", kind: "application_answer", status: "confirmed", question_key: "languages_fluent_other", value: "None" },
    { id: "F-037", kind: "application_answer", status: "confirmed", question_key: "first_generation_professional", value: "No" },
    { id: "F-038", kind: "application_answer", status: "confirmed", question_key: "gender_identity", value: "Male" },
    { id: "F-039", kind: "application_answer", status: "confirmed", question_key: "relatives_at_posting_firm", value: "No" },
    { id: "F-040", kind: "application_answer", status: "confirmed", question_key: "federal_employment_history", value: "No" },
    { id: "F-041", kind: "application_answer", status: "confirmed", question_key: "federal_relatives", value: "No" },
    { id: "F-042", kind: "application_answer", status: "confirmed", question_key: "sql_python_strength", value: "Yes" },
    { id: "F-043", kind: "application_answer", status: "confirmed", question_key: "english_proficiency", value: "Native or bilingual proficiency" },
    { id: "F-044", kind: "application_answer", status: "confirmed", question_key: "outstanding_offers", value: "No" },
    { id: "F-045", kind: "application_answer", status: "confirmed", question_key: "winternship_interest", value: "No" },
    { id: "F-046", kind: "application_answer", status: "confirmed", question_key: "office_location_preference", value: "Chicago" },
    { id: "F-047", kind: "application_answer", status: "confirmed", question_key: "relocate_bay_area", value: "Yes" },
    { id: "F-048", kind: "application_answer", status: "confirmed", question_key: "relocate_new_york", value: "Yes" },
    { id: "F-049", kind: "application_answer", status: "confirmed", question_key: "onsite_sf_ny", value: "Yes" },
    { id: "F-050", kind: "application_answer", status: "confirmed", question_key: "austin_onsite", value: "Yes" },
    { id: "F-051", kind: "application_answer", status: "confirmed", question_key: "twelve_week_availability", value: "Yes" },
    { id: "F-052", kind: "application_answer", status: "confirmed", question_key: "available_terms", value: "Summer" },
    { id: "F-053", kind: "application_answer", status: "confirmed", question_key: "full_time_start_timing", value: "June 2029" },
    { id: "F-054", kind: "application_answer", status: "confirmed", question_key: "swe_area_interest", value: "Infrastructure" },
    { id: "F-055", kind: "application_answer", status: "confirmed", question_key: "areas_of_interest", value: ["Finance", "Technology", "Data"] },
    { id: "F-056", kind: "application_answer", status: "confirmed", question_key: "flexwork_acceptance", value: "Yes" },
    { id: "F-057", kind: "application_answer", status: "confirmed", question_key: "documentation_ability", value: "Yes" },
    { id: "F-058", kind: "application_answer", status: "confirmed", question_key: "cohort_availability", value: "Yes" },
    { id: "F-059", kind: "application_answer", status: "confirmed", question_key: "fixed_dates_acknowledgment", value: "Yes" },
    { id: "F-060", kind: "application_answer", status: "confirmed", question_key: "omaha_requirement", value: "Yes" },
    { id: "F-061", kind: "application_answer", status: "confirmed", question_key: "comp_expectations", value: "$25 per hour" },
    { id: "F-062", kind: "application_answer", status: "confirmed", question_key: "comp_monthly_expectation", value: "4000" },
    { id: "F-063", kind: "application_answer", status: "confirmed", question_key: "grosvenor_relationships", value: "No" },
    { id: "F-064", kind: "application_answer", status: "confirmed", question_key: "figma_area_first_choice", value: "Product Engineering" },
    { id: "F-065", kind: "application_answer", status: "confirmed", question_key: "figma_area_second_choice", value: "Machine Learning" },
    { id: "F-067", kind: "application_text", status: "confirmed", company: "gemini", draft: true, question_key: "essay_slug", value: "draft text" },
  ],
};
const clsR3 = clsR2;

test("R3 coverage: the delegated fact kinds are consumed (application_answer) or exempted with a reason (application_text)", () => {
  const cov = Portal.answerMapCoverage(R3_BANK);
  assert.deepEqual(cov.uncovered, [], "no delegated kind is left uncovered");
  assert.ok(cov.consumed.includes("application_answer"), "application_answer is consumed by derivation");
  const ex = cov.exempt.find((e) => e.kind === "application_text");
  assert.ok(ex && ex.reason.length > 10, "application_text is exempted WITH its reason (host-supplied company-scoped drafts)");
});

test("R3 forcing function: an application_answer fact whose key is NOT declared emits nothing and is named by the guard", () => {
  const grown = JSON.parse(JSON.stringify(R3_BANK));
  grown.facts.push({ id: "F-901", kind: "application_answer", status: "confirmed", question_key: "undeclared_key_xyz", value: "Yes" });
  const d = Portal.deriveAnswers(grown, NOW);
  assert.equal(d.answers.undeclared_key_xyz, undefined, "an undeclared key never reaches the answer map (declared-source law)");
});

test("R3 derivation: citizenship trio derives from the single citizenship fact — and only from an affirmative one", () => {
  const d = Portal.deriveAnswers(R3_BANK, NOW);
  assert.equal(d.answers.citizenship_status.value, "U.S. Citizen"); assert.equal(d.answers.citizenship_status.factId, "F-027");
  assert.equal(d.answers.student_visa_holder.value, "No", "a U.S. citizen is not an F-1/CPT/OPT student-visa holder");
  assert.equal(d.answers.us_person_status.value, "Yes", "a U.S. citizen is a U.S. Person under the deemed-export rule");
  assert.equal(d.answers.deemed_export_affects_employment.value, "No");
  const other = JSON.parse(JSON.stringify(R3_BANK));
  other.facts.find((f) => f.id === "F-027").value = "Canadian citizen";
  const d2 = Portal.deriveAnswers(other, NOW);
  assert.equal(d2.answers.citizenship_status.value, "Canadian citizen", "the status text itself always derives verbatim");
  assert.equal(d2.answers.student_visa_holder, undefined, "a non-U.S.-citizen status derives NO visa-holder answer — the field stays an ask");
  assert.equal(d2.answers.us_person_status, undefined);
  assert.equal(d2.answers.deemed_export_affects_employment, undefined);
});

test("R3 derivation: months, completed education, how-heard, ZIP and every application_answer key resolve from their facts", () => {
  const d = Portal.deriveAnswers(R3_BANK, NOW);
  assert.equal(d.profileFields.education.start_month, "September");
  assert.equal(d.profileFields.education.end_month, "May");
  assert.equal(d.answers.education_level_completed.value, "High School Diploma"); assert.equal(d.answers.education_level_completed.factId, "F-030");
  assert.equal(d.answers.how_heard.value, "Company Website"); assert.equal(d.answers.how_heard.factId, "F-031");
  assert.equal(d.profileFields.zip_code, "60600");
  for (const f of R3_BANK.facts.filter((x) => x.kind === "application_answer")) {
    assert.ok(d.answers[f.question_key], `delegated key ${f.question_key} derives`);
    assert.deepEqual(d.answers[f.question_key].value, f.value, `${f.question_key} carries its fact's value verbatim`);
    assert.equal(d.answers[f.question_key].factId, f.id, `${f.question_key} traces to ${f.id}`);
    assert.equal(d.answers[f.question_key].confirmed, true);
  }
  const un = JSON.parse(JSON.stringify(R3_BANK));
  un.facts.find((f) => f.id === "F-033").status = "unconfirmed";
  assert.equal(Portal.deriveAnswers(un, NOW).answers.restrictive_agreements, undefined, "an unconfirmed delegated fact yields no answer (confirmed-only law)");
});

test("R3 pin: an in-progress-only bank can NEVER answer the completed-education key (the BUG-238 law survives R3)", () => {
  const b = JSON.parse(JSON.stringify(R3_BANK));
  b.facts = b.facts.filter((f) => f.id !== "F-030");
  assert.equal(Portal.deriveAnswers(b, NOW).answers.education_level_completed, undefined);
});

test("R3 classification: how-heard phrasings (verbatim R2 labels) route to how_heard", () => {
  for (const l of ["How did you hear about this job?", "How did you connect with us?", "How did you first learn about Affirm as an employer?", "How did you learn about this opportunity?", "How did you hear about this internship?", "How did you hear about this opportunity?", "How did you first hear about Affirm?"]) {
    assert.equal(clsR3(l).question_key, "how_heard", l);
  }
});

test("R3 classification: the citizenship trio's verbatim labels route to their keys", () => {
  assert.equal(clsR3("Are you a student in F-1 status who plans to work pursuant to curricular practical training (CPT), or optional practical training (OPT)?").question_key, "student_visa_holder");
  assert.equal(clsR3("What is your current visa status?").question_key, "citizenship_status");
  assert.equal(clsR3("Does the deemed export rule affect your employment by Everpure?").question_key, "deemed_export_affects_employment");
  assert.equal(clsR3("State whether you are a US Citizen, US National, lawful permanent resident asylee or refugee (i.e. a US Person under the Deemed Export Rule of EAR 734.13 and ITAR 120.15)?").question_key, "us_person_status");
});

test("R3 classification: education months and ZIP get standard profile keys", () => {
  assert.equal(clsR3("Start date month").profile_key, "education_start_month");
  assert.equal(clsR3("End date month").profile_key, "education_end_month");
  assert.equal(clsR3("Zip Code / Postal Code (Non-U.S. based candidates, please enter \"00000\")").profile_key, "zip_code");
});

test("R3 classification: the delegated screening labels (verbatim R2) route to their keys", () => {
  const cases = [
    ["Have you served in the military?", "military_service"],
    ["In which language(s) are you fluent (written) other than English?", "languages_fluent_other"],
    ["In which language(s) are you fluent (spoken) other than English?", "languages_fluent_other"],
    ["I identify as a first-generation professional (please select one):", "first_generation_professional"],
    ["I identify as:", "gender_identity"],
    ["Do you have any relatives that are currently employed by GCM Grosvenor?", "relatives_at_posting_firm"],
    ["Do you have strong experience with SQL and Python?", "sql_python_strength"],
    ["What is your English level?", "english_proficiency"],
    ["Do you have any outstanding offers or deadlines?", "outstanding_offers"],
    ["Are you interested in our Women's Winternship program?", "winternship_interest"],
    ["Are you currently based in or willing to relocate to the Bay Area for this position?", "relocate_bay_area"],
    ["Are you willing to relocate to New York for the duration of this internship?", "relocate_new_york"],
    ["Are you open to working 4 days onsite in our San Francisco, CA or New York, NY office?", "onsite_sf_ny"],
    ["Are you able to work in our Austin office 3–5 days a week?", "austin_onsite"],
    ["Are you available for a 12-week full-time (40 hours per week) internship during your select term(s)?", "twelve_week_availability"],
    ["Which term(s) are you available to intern?", "available_terms"],
    ["A successful internship may lead to consideration for a full-time opportunity. If you were to receive a full-time offer, when would you be available to start?", "full_time_start_timing"],
    ["Area of interest in Software Engineering", "swe_area_interest"],
    ["Please select up to three areas of interest.", "areas_of_interest"],
    ["If requested, would you be able to provide documentation reflecting the education and employment history listed on your resume?", "documentation_ability"],
    ["This internship is from May 17, 2027 to August 6, 2027 (12 weeks). Are you available for the full duration of this cohort?", "cohort_availability"],
    ["To help make sure everyone has the same experience, we are not able to adjust the internship start or end dates. Are you able to acknowledge and agree to this requirement?", "fixed_dates_acknowledgment"],
    ["For this role, candidates must be in Omaha, NE for Summer 2026. Are you able to meet this requirement? (Please note- housing is not provided)", "omaha_requirement"],
    ["What are your salary expectations for this role?", "comp_expectations"],
    ["What is your monthly salary expectation in USD?", "comp_monthly_expectation"],
    ["Are you involved in any active or potential relationships with Grosvenor?", "grosvenor_relationships"],
    ["Which type of engineering work are you most excited to do at Figma? Select your first choice.", "figma_area_first_choice"],
    ["Which type of engineering work are you most excited to do at Figma? Select your second choice.", "figma_area_second_choice"],
  ];
  for (const [label, key] of cases) assert.equal(clsR3(label).question_key, key, label);
  const flex = clsR3("Justworks believes in a \"flexwork\" model where teammates have at least two days a week when they are expected to work in a global office. The exact schedule is at individual teams' discretion. Does this requirement work for you?");
  assert.equal(flex.question_key, "flexwork_acceptance");
  const office = clsR3("What is your office location preference?");
  assert.equal(office.question_key, "office_location_preference");
  assert.equal(office.profile_key, undefined, "an office PREFERENCE is never the current-location value (D7)");
});

test("R3 classification: Ginkgo's federal pair routes to the federal keys — never prior_employment, never relatives_at_posting_firm", () => {
  const fed = clsR3("Including your current position, have you ever been employed by the U.S. Federal Government, a contractor (including subsidiaries, parents, and affiliates) that performed work for the U.S. Federal Government, served in the Military, and/or were a Political Appointee?");
  assert.equal(fed.question_key, "federal_employment_history");
  const rel = clsR3("Do you have any relatives that are currently employed by the Federal Government, a contractor (including subsidiaries, parents, and affiliates) that performs work for the U.S. Department of Health and Human Services (or any of its sub-agencies, including CDC, for example) or the U.S. Department of Defense?");
  assert.equal(rel.question_key, "federal_relatives");
});

test("R3 classification: acknowledgment checkboxes canonicalize to acknowledgment_receipt; certify checkboxes to certify_true", () => {
  for (const l of ["Applicant Privacy Statement", "Privacy", "Privacy Acknowledgement", "Acknowledge/Confirm", "Acknowledge, confirm, and agree to the following statements."]) {
    const d = clsR3(l, "checkbox");
    assert.equal(d.kind, "attestation", l);
    assert.equal(d.question_key, "acknowledgment_receipt", l);
  }
  const cert = clsR3("I certify that the information I have provided is true and complete", "checkbox");
  assert.equal(cert.kind, "attestation");
  assert.equal(cert.question_key, "certify_true", "the certify class keeps its own canonical key (D10), distinct from receipt acknowledgments");
});

test("R3 classification: why-essays are free_text even on plain text inputs (their drafts key by label slug)", () => {
  assert.equal(clsR3("Why do you want to intern at Workshop?", "text").kind, "free_text");
  assert.equal(clsR3("Why do you want to intern at Workshop?", "text").question_key, "why_do_you_want_to_intern_at_workshop");
  assert.equal(clsR3("Which of our core values (Humble, Hungry, Connected) best resonates with you and why?", "textarea").kind, "free_text");
  const gcm = clsR3("Please provide detailed information concerning your compensation expectations, including base salary, bonus and other compensation components:", "textarea");
  assert.equal(gcm.kind, "free_text", "GCM's DETAILED comp text stays a draft, never the short comp_expectations value");
  assert.equal(gcm.question_key, "please_provide_detailed_information_conc");
});

test("R3 end to end: how-heard fills from the delegated fact; without the fact the same field stops the drive", () => {
  const mk = (b) => {
    const { defs } = BrowserBoard.classifyFields([
      { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
      { label: "How did you hear about this job?", name: "q_src", id: "q_src", inputType: "text", tag: "input", cls: "select__input", selector: "#q_src", required: true },
    ]);
    const board = stubBoard(defs);
    const session = Portal.createPortalSession({ userId: "u-test", board });
    const r = Portal.runApply(session, { posting: POSTING, profile: profileFromBank(b), log: { records: [] } });
    return { defs, board, r };
  };
  const d = Portal.deriveAnswers(R3_BANK, NOW);
  const withFact = mk(R3_BANK);
  const def = withFact.defs.find((x) => x.question_key === "how_heard");
  assert.ok(def, "classified how_heard");
  assert.equal(withFact.board.held[def.field_id], d.answers.how_heard.value, "filled with the bank's delegated how-heard value");
  const without = mk({ basics: R3_BANK.basics, facts: R3_BANK.facts.filter((f) => f.id !== "F-031") });
  assert.equal(without.board.held[def.field_id], undefined, "no fact, no fill");
  assert.ok((without.r.asks || []).some((a) => a.field_id === def.field_id), "the field is an ask again");
});

test("R3 end to end: an acknowledgment attestation fills from the class-approval fact; the certify class fills from a key-addressed explicit attestation", () => {
  const { defs } = BrowserBoard.classifyFields([
    { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
    { label: "Acknowledge/Confirm", name: "q_ack", id: "q_ack", inputType: "checkbox", tag: "input", cls: "", selector: "#q_ack", required: true },
    { label: "I certify that the information I have provided is true and complete", name: "q_cert", id: "q_cert", inputType: "checkbox", tag: "input", cls: "", selector: "#q_cert", required: true },
  ]);
  const board = stubBoard(defs);
  const session = Portal.createPortalSession({ userId: "u-test", board });
  const r = Portal.runApply(session, { posting: POSTING, profile: profileFromBank(R3_BANK), log: { records: [] },
    attestations: { certify_true: { value: true, explicit: true } } });
  const ackDef = defs.find((x) => x.question_key === "acknowledgment_receipt");
  const certDef = defs.find((x) => x.question_key === "certify_true");
  assert.ok(ackDef && certDef, "both attestation classes classified to their canonical keys");
  assert.equal(board.held[ackDef.field_id], true, "the receipt acknowledgment filled from the F-034 class approval (a confirmed answer under its key)");
  assert.equal(board.held[certDef.field_id], true, "the certify checkbox filled from the explicit attestation addressed by its canonical key");
  assert.ok(!(r.asks || []).some((a) => a.field_id === ackDef.field_id || a.field_id === certDef.field_id), "neither attestation remains an ask");
  // and without the class-approval fact, the acknowledgment is an ask again:
  const b2 = { basics: R3_BANK.basics, facts: R3_BANK.facts.filter((f) => f.id !== "F-034") };
  const board2 = stubBoard(defs);
  const session2 = Portal.createPortalSession({ userId: "u-test", board: board2 });
  const r2 = Portal.runApply(session2, { posting: POSTING, profile: profileFromBank(b2), log: { records: [] },
    attestations: { certify_true: { value: true, explicit: true } } });
  assert.equal(board2.held[ackDef.field_id], undefined, "no class approval on file -> no acknowledgment fill");
  assert.ok((r2.asks || []).some((a) => a.field_id === ackDef.field_id), "the acknowledgment stays an honest ask");
});

test("R3 end to end: restrictive_agreements fills No from the delegated confirmation — and only from it", () => {
  const { defs } = BrowserBoard.classifyFields([
    { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
    { label: "Are you currently subject to any agreement with a former employer/third party (such as a non-solicitation or non-compete agreement) that may potentially limit your ability to perform the duties of the position you are applying for?", name: "q_restr", id: "q_restr", inputType: "text", tag: "input", cls: "select__input", selector: "#q_restr", required: true },
  ]);
  const board = stubBoard(defs);
  const session = Portal.createPortalSession({ userId: "u-test", board });
  Portal.runApply(session, { posting: POSTING, profile: profileFromBank(R3_BANK), log: { records: [] } });
  const def = defs.find((x) => x.question_key === "restrictive_agreements");
  assert.ok(def, "classified restrictive_agreements");
  assert.equal(board.held[def.field_id], "No", "the owner's delegated confirmation (F-033) fills the restrictions question — the R2 no-derivation stance held only until the owner answered");
});

test("R3 end to end: education month fields fill from the month facts (the LionTree/Affirm R2 stop)", () => {
  const { defs } = BrowserBoard.classifyFields([
    { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
    { label: "Start date month", name: "start_month_0", id: "start_month_0", inputType: "text", tag: "input", cls: "select__input", selector: "#sm", required: true },
    { label: "End date month", name: "end_month_0", id: "end_month_0", inputType: "text", tag: "input", cls: "select__input", selector: "#em", required: true },
  ]);
  const board = stubBoard(defs);
  const session = Portal.createPortalSession({ userId: "u-test", board });
  Portal.runApply(session, { posting: POSTING, profile: profileFromBank(R3_BANK), log: { records: [] } });
  const sm = defs.find((x) => x.profile_key === "education_start_month");
  const em = defs.find((x) => x.profile_key === "education_end_month");
  assert.ok(sm && em, "month fields classified to their standard keys");
  assert.equal(board.held[sm.field_id], "September");
  assert.equal(board.held[em.field_id], "May");
});

// ---------- R3 follow-on (2026-10-17, live-drive evidence) ----------
// Four defects the R3 drives exposed, each pinned with its verbatim
// live label: (1) Gusto's prior-employment phrasing ("...currently
// working at... in any capacity") was stolen by the location rule via
// the bare "city" substring inside "capa-city"; (2) Ginkgo's
// reside/commutable question took the city value into a Yes/No select;
// (3) Sezzle's Latin-America authorization question took the U.S.
// answer (F-020 is U.S.-scoped — a statement his record does not make
// for other regions); (4) Gemini's essay label matched no free-text
// pattern although its draft was banked under the exact slug.

test("R3 follow-on classification: the substring-collision labels route to their true keys", () => {
  assert.equal(clsR3("Have you ever, or are you currently working at Gusto or Symmetry in any capacity (ie: employee or contingent worker)?").question_key, "prior_employment");
  assert.equal(clsR3("Do you reside in the location for this job posting or within commutable distance?").question_key, "reside_near_posting");
  assert.equal(clsR3("What city are you currently residing in?").profile_key, "location", "a genuine city question still takes the location value");
  assert.equal(clsR3("Which U.S. State or Canadian Province do you reside in?").profile_key, "state_of_residence", "Affirm's state-of-residence question is NOT the reside-near-posting key");
  assert.equal(clsR3("Are you authorized to work lawfully in Latin America?").question_key, "work_authorization_other_region");
  assert.equal(clsR3("Are you authorized to work in the United States?").question_key, "work_authorization", "the U.S.-named question keeps the F-020 path");
  assert.equal(clsR3("Are you legally authorized to work in the country where the job is open?").question_key, "work_authorization", "a region-free authorization question keeps the F-020 path");
  const gem = clsR3("Please share 3-5 sentences explaining your interest in the Blockchain/Web3 industry.", "textarea");
  assert.equal(gem.kind, "free_text");
  assert.equal(gem.question_key, "please_share_3_5_sentences_explaining_yo", "the essay's slug is the key its banked draft (F-067) carries");
});

test("R3 follow-on derivation: a company-scoped application_answer fact never emits generically", () => {
  const b = JSON.parse(JSON.stringify(R3_BANK));
  b.facts.push({ id: "F-080", kind: "application_answer", status: "confirmed", company: "ginkgo", question_key: "reside_near_posting", value: "No" });
  const d = Portal.deriveAnswers(b, NOW);
  assert.equal(d.answers.reside_near_posting, undefined, "posting-relative answers are host-merged per company, never generic (a generic No would be wrong for a same-city posting)");
  assert.ok(Portal.ANSWER_KEY_SOURCES.reside_near_posting, "the key is declared, so a host-merged answer is lawful");
});

test("R3 follow-on classification: ID.me's verbatim compound labels route to their keys", () => {
  const onsite = clsR3("This role requires working onsite 5 days per week at one of our hub offices (Mountain View, CA or McLean, VA). Do you currently live within commuting distance of one of these locations, or are you willing to relocate?");
  assert.equal(onsite.question_key, "reside_near_posting", "the reside/commuting/relocate compound is the posting-relative key, not the city value and not the SF/NY onsite key");
  const grad = clsR3("Is your expected graduation date in 2028 or later?");
  assert.equal(grad.question_key, "graduation_year_or_later", "the graduation-eligibility question is not the end-date year value");
});

test("R3 follow-on end to end: graduation_year_or_later resolves against the education fact's year (mirror of readiness)", () => {
  const mk = (label) => {
    const { defs } = BrowserBoard.classifyFields([
      { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
      { label, name: "q_gy", id: "q_gy", inputType: "text", tag: "input", cls: "select__input", selector: "#q_gy", required: true },
    ]);
    const board = stubBoard(defs);
    const session = Portal.createPortalSession({ userId: "u-test", board });
    Portal.runApply(session, { posting: POSTING, profile: profileFromBank(SYNTH_BANK), log: { records: [] } });
    return { defs, board };
  };
  const yes = mk("Is your expected graduation date in 2028 or later?");
  const yesDef = yes.defs.find((d) => d.question_key === "graduation_year_or_later");
  assert.ok(yesDef, "classified graduation_year_or_later");
  assert.equal(yes.board.held[yesDef.field_id], "Yes", "graduation year 2029 is in 2028 or later");
  const no = mk("Is your expected graduation date in 2030 or later?");
  const noDef = no.defs.find((d) => d.question_key === "graduation_year_or_later");
  assert.equal(no.board.held[noDef.field_id], "No", "graduation year 2029 is not in 2030 or later");
});

test("R3 follow-on classification: acknowledgment widgets canonicalize on SELECT and RADIO shapes too (Sigma/Point72 live shapes)", () => {
  for (const t of ["select", "radio"]) {
    const a = clsR3("Acknowledge, confirm, and agree to the following statements.", t);
    assert.equal(a.kind, "attestation", t); assert.equal(a.question_key, "acknowledgment_receipt", t);
    const p = clsR3("Privacy", t);
    assert.equal(p.kind, "attestation", t); assert.equal(p.question_key, "acknowledgment_receipt", t);
  }
  const cert = clsR3("I certify that the information I have provided is true and complete", "select");
  assert.equal(cert.question_key, "certify_true", "the certify class canonicalizes on a select shape too");
});
