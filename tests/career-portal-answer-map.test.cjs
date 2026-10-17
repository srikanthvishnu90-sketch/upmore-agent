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
  // the "completed" nuance: no completed-credential fact exists, so no key
  assert.equal(d.answers.education_level_completed, undefined, "an in-progress degree never answers a completed-education question");
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
