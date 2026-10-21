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

// The real bank is opt-in (it lives outside the repo by the privacy
// rule); a same-shaped mini bank is the default portable input.
// v224 combine privacy fix: the mini bank's values are SYNTHETIC
// (same shapes and fact IDs, invented values) — as first landed it
// mirrored the owner's real fact bank verbatim, including the
// sensitive F-023/F-024 values, which the privacy rule keeps out of
// this public repo. Assertions that depend on bank values read them
// from the loaded bank instead of hardcoding either world's values.
function loadBank() {
  const p = process.env.UPMORE_FACT_BANK;
  try { if (p) return { bank: JSON.parse(fs.readFileSync(p, "utf8")), real: true }; } catch (e) { /* fall through */ }
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

// ---------- MUSE-F-007: saved answers (application_answer / application_text) ----------
// The person's saved answers to application questions had no consumer, so
// drives stopped on questions they already answered. They are read ONLY
// through the WO-102 answer contract (extension/src/apply_core.ts, loaded
// as its bundle, never copied): trustedManifest keeps a saved answer only
// when it is confirmed, the person's own, positively stated, names its
// confirmation event, is not quarantined (D-007: F-027..F-079 and the
// answer-all delegation) and borrows no reserved id. A kept answer fills
// ONLY the question it was given to (exact wording); an attestation or a
// personal question takes only the person's own answer (authorizes:true).
// Synthetic TEST persona.
require(path.join(root, "extension/lib/trainee-core.js"));
const Contract = globalThis.TraineeCore;
const OWNER = "u-test";
const saved = (id, kind, question, value, extra) => Object.assign({ id, kind, status: "confirmed", question, value, user_id: OWNER,
  provenance: "owner stated in chat 2026-10-21 (TEST)", confirmation_event_id: `evt-TEST-${id}` }, extra || {});
const Q = {
  relocate: "Are you willing to relocate for this role?", workAuth: "Are you legally authorized to work in the United States?",
  military: "Have you ever served in the military?", license: "Do you have a valid driver's license?", hybrid: "Are you open to hybrid work?",
  june: "Can you start in June?", essay: "Why do you want to work at TEST Corps?", consent: "Do you consent to a background check?",
  retention: "Do you agree to our data retention terms?", sponsor: "Will you now or in the future require visa sponsorship?",
  nearRelocate: "Are you willing to relocate?", otherEssay: "What is a project you are proud of?",
};
const SAVED_BANK = { basics: { name: "Sam Synthetic" }, facts: [
  saved("F-101", "application_answer", Q.relocate, "Yes"),
  saved("F-102", "application_answer", Q.workAuth, "Yes"),
  saved("F-050", "application_answer", Q.military, "No"), // D-007 quarantined id
  saved("F-103", "application_answer", Q.license, "Yes", { provenance: "owner-delegated 2026-10-17 (answer-all directive)" }),
  saved("F-104", "application_answer", Q.hybrid, "Yes", { provenance: undefined }),
  saved("F-105", "application_answer", Q.june, "Yes", { confirmation_event_id: undefined }),
  saved("F-106", "application_text", Q.essay, "TEST essay, in the person's own words.", { company: "TEST Corps" }),
  saved("F-107", "application_answer", Q.consent, "Yes"), // an attestation, without the person's own answer to it
  saved("F-108", "application_answer", Q.retention, "Yes", { authorizes: true }),
] };
const savedOf = (b) => Portal.deriveAnswers(b, NOW, { contract: Contract, owner: OWNER }).savedAnswers;
function drive(bank, company) {
  const raw = Object.values(Q).map((label, i) => ({ label, name: `q${i}`, id: `q${i}`, inputType: label === Q.essay || label === Q.otherEssay ? "textarea" : "text", tag: "input", cls: "", selector: `#q${i}`, required: true }));
  const { defs } = BrowserBoard.classifyFields(raw);
  const board = stubBoard(defs);
  const profile = { name: "Sam Synthetic (TEST)", email: "sam@example.test", resume: { filename: "resume.pdf", sha256: "c".repeat(64) }, answers: {}, savedAnswers: savedOf(bank) };
  const r = Portal.runApply(Portal.createPortalSession({ userId: OWNER, board }), { posting: Object.assign({}, POSTING, { company }), profile, log: { records: [] } });
  const idOf = (label) => defs.find((d) => d.label === label).field_id;
  return { r, board, held: (q) => board.held[idOf(q)], asked: (q) => (r.asks || []).some((a) => a.field_id === idOf(q)), row: (q) => r.stepLog.find((s) => s.action === "fill" && s.field_id === idOf(q)) };
}

test("MUSE-F-007 coverage: the saved-answer kinds are consumed, not uncovered", () => {
  assert.deepEqual(Portal.answerMapCoverage(SAVED_BANK).uncovered, []);
});

test("MUSE-F-007 contract: only what trustedManifest keeps is a saved answer; no contract or another quarantine version, none", () => {
  assert.deepEqual((savedOf(SAVED_BANK) || []).map((s) => s.factId).sort(), ["F-101", "F-102", "F-106", "F-108"], "quarantined, unprovenanced, no-event and unauthorized-attestation answers are left out");
  for (const s of savedOf(SAVED_BANK)) {
    assert.equal(s.confirmation_event_id, `evt-TEST-${s.factId}`);
    assert.equal(s.quarantine_version, Contract.QUARANTINE_VERSION);
    assert.match(s.manifest_hash, /^[0-9a-f]{64}$/);
  }
  assert.deepEqual(Portal.deriveAnswers(SAVED_BANK, NOW).savedAnswers, [], "without the contract nothing is read");
  assert.deepEqual(Portal.deriveAnswers(SAVED_BANK, NOW, { contract: Object.assign({}, Contract, { QUARANTINE_VERSION: "d007-v2" }), owner: OWNER }).savedAnswers, [], "a contract of another version fills nothing until reviewed");
  assert.deepEqual(Portal.deriveAnswers(SAVED_BANK, NOW, { contract: Contract, owner: "u-other" }).savedAnswers, [], "another person's facts are never theirs");
});

test("MUSE-F-007 end to end: a trusted saved answer fills its exact question with a ledger row; everything else is asked", () => {
  const { r, board, held, asked, row } = drive(SAVED_BANK, "TEST Corps");
  assert.equal(held(Q.relocate), "Yes");
  const lr = row(Q.relocate) || {};
  assert.deepEqual([lr.source, lr.fact_refs, lr.confirmation_event_id, lr.derivation, lr.quarantine_version],
    ["saved_answer", ["F-101"], "evt-TEST-F-101", "saved-answer-exact-question", Contract.QUARANTINE_VERSION]);
  assert.equal(held(Q.essay), "TEST essay, in the person's own words.", "application_text fills its own question");
  assert.equal(held(Q.retention), "Yes", "an attestation with the person's own answer to it fills");
  for (const q of [Q.military, Q.license, Q.hybrid, Q.june, Q.consent, Q.sponsor, Q.nearRelocate, Q.otherEssay]) {
    assert.equal(held(q), undefined, `never filled: ${q}`);
    assert.ok(asked(q), `asked: ${q}`);
  }
  assert.equal(r.resultStatus, "awaiting_user");
  assert.equal(board.calls.submit, 0);
});

test("MUSE-F-007: application_text for one company never fills the same question at another", () => {
  const { held, asked } = drive(SAVED_BANK, "Other TEST Co");
  assert.equal(held(Q.essay), undefined);
  assert.ok(asked(Q.essay));
  assert.equal(held(Q.relocate), "Yes", "a saved answer that is not company-scoped still fills its question");
});
