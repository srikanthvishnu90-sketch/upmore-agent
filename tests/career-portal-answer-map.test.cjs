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
function loadBank() {
  const p = path.join(process.env.HOME || "", "workspace/your_files/real-apply/fact-bank.json");
  try { return { bank: JSON.parse(fs.readFileSync(p, "utf8")), real: true }; } catch (e) { /* fall through */ }
  return { bank: MINI_BANK, real: false };
}
const MINI_BANK = {
  basics: { name: "Alex Testcase", location: "Chicago, IL", country: "United States" },
  defaults: { gpa: "3.9" },
  facts: [
    { id: "F-001", kind: "education", status: "confirmed", title: "Pursuing Bachelors in Computer Science and Finance, DePaul University", org: "DePaul University - Driehaus College of Business", start: "2025", end: "2029" },
    { id: "F-002", kind: "experience", status: "confirmed", name: "Founder, Sporv AI", start: "2025", end: "present" },
    { id: "F-004", kind: "experience", status: "confirmed", name: "Founder, Agencyvault", start: "2023", end: "2025" },
    { id: "F-020", kind: "eligibility", status: "confirmed", name: "Work authorization (US)", value: "Yes" },
    { id: "F-021", kind: "eligibility", status: "confirmed", name: "Sponsorship requirement", value: "No" },
    { id: "F-022", kind: "profile", status: "confirmed", name: "Country", value: "United States" },
    { id: "F-023", kind: "profile", status: "confirmed", name: "Date of birth", value: "2007-05-11" },
    { id: "F-024", kind: "profile", status: "confirmed", name: "Hometown", value: "Hawthorn Woods, Illinois" },
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
  assert.equal(d.profileFields.date_of_birth, "2007-05-11");
  assert.equal(d.profileFields.country, "United States");
  assert.ok(d.profileFields.preferred_name && d.profileFields.preferred_name.length > 0, "preferred name derives from the bank's name");
  assert.ok(d.profileFields.education && /DePaul/.test(d.profileFields.education.school), "the education block derives from the education fact");
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
    name: "Vishnu Srikanth", email: "v@example.test", phone: "+1 000 555 0100", location: "Chicago, IL",
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
