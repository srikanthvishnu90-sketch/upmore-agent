// State-of-residence binding guards — form-inventory finding,
// 2026-10-21 (F-007-class: a form stopping although a confirmed fact
// covers the field).
//
// THE DEFECT (measured on cea914fe): on Affirm's live Greenhouse form,
// the question "Which U.S. State or Canadian Province do you reside
// in?" classified to kind "unknown" — module 150's state rule was a
// phrase list whose alternatives assume "which/what state" sits
// ADJACENT ("which state do you…", "in which state…", "state of
// residence"). The live label interposes "U.S." after "Which" and an
// "or Canadian Province" clause before the verb, so every alternative
// missed — although module 149 derives profileFields.state_of_residence
// from a confirmed hometown/location fact, the field stopped the drive
// as an ask. The binding is now STRUCTURAL (subject + residence frame,
// disqualifiers first) and fail-closed:
//
//   BIND    — the applicant's state/province OF RESIDENCE in its common
//             real shapes (noun frame "state of residence", second-
//             person verb frame "which … state … do you reside/live",
//             U.S./province clauses interposed anywhere).
//   NO BIND — state of INCORPORATION / formation (an entity's fact),
//             state of BIRTH / where you were born / grew up (a
//             different fact), job-side location (your office, the
//             position), a bare ambiguous "State", and — via the
//             observed option universe — a select whose options are
//             EXCLUSIVELY Canadian provinces: a US-state value cannot
//             fit it, so the field stays an honest ask instead of a
//             forced fill. The drive's own option match + readback
//             discipline is untouched and still guards every fill.
//
// The coverage join below mirrors module 171's coverageFor standard-
// field leg (branch muse/2026-10-21-form-inventory; 171 is not vendored
// on this base): inventory records come from module 150's
// classifyFields — the same RAW-snapshot path 171 consumes — and a
// standard field is covered iff module 149's OWN profileValue (the
// exact function 171 resolves) returns a value for the bound key.
// Check: node --test tests/career-portal-state-binding.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

const NOW = "2026-10-21T12:00:00Z";

// Synthetic bank (same shapes as the answer-map suite's mini bank;
// invented values only — the privacy rule keeps real facts out of git).
const BANK = {
  basics: { name: "Alex Testcase", location: "Chicago, IL", country: "United States" },
  defaults: { gpa: "3.9" },
  facts: [
    { id: "F-001", kind: "education", status: "confirmed", title: "Pursuing Bachelors in Computer Science, State University", org: "State University - College of Arts and Sciences", start: "2025", end: "2029" },
    { id: "F-020", kind: "eligibility", status: "confirmed", name: "Work authorization (US)", value: "Yes" },
    { id: "F-021", kind: "eligibility", status: "confirmed", name: "Sponsorship requirement", value: "No" },
    { id: "F-022", kind: "profile", status: "confirmed", name: "Country", value: "United States" },
    { id: "F-024", kind: "profile", status: "confirmed", name: "Hometown", value: "Chicago, Illinois" },
  ],
};

function cls(label, extra = {}) {
  const f = Object.assign({ label, name: "question_99887766", id: "question_99887766", inputType: "text", tag: "input", cls: "", selector: "#q", required: true }, extra);
  const { defs, bindings } = BrowserBoard.classifyFields([f]);
  return { def: defs[0], binding: bindings[defs[0] && defs[0].field_id] };
}
function clsSelect(label, optionLabels) {
  return cls(label, { inputType: "select", tag: "select", options: optionLabels.map((l) => ({ value: l, label: l })) });
}
const MIXED_OPTIONS = ["Select a state or province", "Illinois", "New York", "Ontario", "Quebec"];
const US_OPTIONS = ["Select a state", "Illinois", "New York", "Texas"];
const PROVINCE_OPTIONS = ["Select a province", "Alberta", "British Columbia", "Ontario", "Quebec"];

function bindKey(label, extra) {
  const { def } = extra && extra.select ? clsSelect(label, extra.select) : cls(label, extra || {});
  return def ? (def.profile_key || def.question_key || null) : null;
}

test("binding matrix — residence shapes BIND state_of_residence (the key module 149 derives)", () => {
  const bind = [
    // the live defect: the exact Affirm label, both control shapes
    ["Which U.S. State or Canadian Province do you reside in?", {}],
    ["Which U.S. State or Canadian Province do you reside in?", { select: MIXED_OPTIONS }],
    ["Which U.S. State or Canadian Province do you reside in? *", {}], // the boards print the required marker in the label
    // close real-world variants
    ["State of residence", {}],
    ["What state do you reside in?", {}],
    ["Please select your state of residence", { select: US_OPTIONS }],
    ["State/Province of residence", {}],
    ["In which state do you currently reside?", {}],
    ["Which state do you live in?", {}],
    ["Province of residence", {}],
    ["What is your current state of residence?", {}],
    ["In which U.S. state do you reside?", {}], // "U.S." interposed in the in-which frame too
    ["Which state or province do you currently reside in?", {}], // province clause without "Canadian"
    ["State of residency", {}],
    ["Which province do you reside in?", {}], // text shape: no observed option universe — suppression is options-only; the drive's readback guards the fill
  ];
  for (const [label, extra] of bind) {
    const { def } = extra.select ? clsSelect(label, extra.select) : cls(label, extra);
    assert.equal(def.kind, "standard", `"${label}" classifies standard`);
    assert.equal(def.profile_key, "state_of_residence", `"${label}" binds state_of_residence`);
  }
  // the select-shaped Affirm field carries its observed options into the binding
  const { binding } = clsSelect("Which U.S. State or Canadian Province do you reside in?", MIXED_OPTIONS);
  assert.equal(binding.inputType, "select");
  assert.equal(binding.profile_key, "state_of_residence");
  assert.deepEqual((binding.options || []).map((o) => o.label), MIXED_OPTIONS);
});

test("binding matrix — negative controls NEVER bind state_of_residence (fail-closed)", () => {
  const noBind = [
    ["State of incorporation", {}], // an entity's fact, not the applicant's residence
    ["State of incorporation", { select: US_OPTIONS }], // state options do not rescue an entity frame
    ["In which state were you born?", {}], // birthplace is a different fact
    ["What is your state of birth?", {}],
    ["In which state did you grow up?", {}],
    ["In what state will you be working?", {}], // work location is not residence
    ["What state is your office located in?", {}], // job-side location, not the applicant's
    ["State", { select: US_OPTIONS }], // a bare "State" is ambiguous — an honest ask, never a guess
  ];
  for (const [label, extra] of noBind) {
    const { def } = extra.select ? clsSelect(label, extra.select) : cls(label, extra);
    assert.notEqual(def.profile_key, "state_of_residence", `"${label}" must not bind state_of_residence (got kind=${def.kind})`);
    assert.notEqual(def.question_key, "state_of_residence", `"${label}" must not route to state_of_residence`);
  }
  // "State your full name" binds the NAME — the word "state" as a verb is not a subject
  const { def } = cls("State your full name");
  assert.equal(def.profile_key, "name");
});

test("options universe: a province-ONLY select does not bind (a US-state value cannot fit); a mixed universe binds", () => {
  const only = clsSelect("Which province do you reside in?", PROVINCE_OPTIONS);
  assert.notEqual(only.def.profile_key, "state_of_residence", "exclusively-province options: no forced bind");
  const mixed = clsSelect("Which province do you reside in?", ["Alberta", "Illinois", "Ontario"]);
  assert.equal(mixed.def.profile_key, "state_of_residence", "one fittable state in the universe: the binding fires");
  const usOnly = clsSelect("Which U.S. State or Canadian Province do you reside in?", US_OPTIONS);
  assert.equal(usOnly.def.profile_key, "state_of_residence", "a US-only universe binds (the value class fits)");
});

// ---------- the 171-shaped coverage join ----------
function profileFromBank(b) {
  const d = Portal.deriveAnswers(b, NOW);
  return Object.assign({
    name: "Alex Testcase (TEST)", email: "v@example.test", phone: "+1 000 555 0100", location: "Chicago, IL",
    resume: { filename: "resume.pdf", sha256: "b".repeat(64) },
    answers: d.answers,
  }, d.profileFields);
}
// Module 171's fieldCoverage standard leg, verbatim in shape: covered
// iff 149's profileValue returns a value for the bound key; an unknown
// field is never covered (unknown_field_category), a bound field with
// no fact is no_confirmed_fact.
function coverageJoin(defs, profile) {
  const coveredFields = [], stops = [];
  for (const def of defs) {
    if (def.kind === "standard") {
      const raw = Portal.profileValue(profile, def.profile_key);
      if (raw === undefined || raw === null || raw === "") stops.push({ field_id: def.field_id, label: def.label, reason: "no_confirmed_fact" });
      else coveredFields.push({ field_id: def.field_id, label: def.label, covered_by: "profile", key: def.profile_key });
    } else {
      stops.push({ field_id: def.field_id, label: def.label, reason: "unknown_field_category" });
    }
  }
  return { covered: stops.length === 0, coveredFields, stops };
}
const AFFIRM_FIELD = { select: MIXED_OPTIONS };
function affirmForm() {
  return [
    { label: "Full name", name: "name", id: "name", inputType: "text", tag: "input", cls: "", selector: "#name", required: true },
    { label: "Email", name: "email", id: "email", inputType: "email", tag: "input", cls: "", selector: "#email", required: true },
    { label: "Which U.S. State or Canadian Province do you reside in?", name: "question_99887766", id: "question_99887766", inputType: "select", tag: "select", cls: "", selector: "#q_state", required: true, options: MIXED_OPTIONS.map((l) => ({ value: l, label: l })) },
  ];
}

test("derivation side intact: the bank's residence fact derives state_of_residence = Illinois", () => {
  const d = Portal.deriveAnswers(BANK, NOW);
  assert.equal(d.profileFields.state_of_residence, "Illinois");
  assert.equal(d.traces.state_of_residence.factId, "F-024");
});

test("171-shaped join: the Affirm form + a profile carrying the state fact => the field is COVERED", () => {
  const { defs } = BrowserBoard.classifyFields(affirmForm());
  const stateDef = defs.find((d) => /Canadian Province/.test(d.label || ""));
  assert.equal(stateDef.profile_key, "state_of_residence", "the join's premise: the field binds the derived key");
  const v = coverageJoin(defs, profileFromBank(BANK));
  assert.equal(v.covered, true, `no stops (got ${JSON.stringify(v.stops)})`);
  assert.ok(v.coveredFields.some((f) => f.field_id === stateDef.field_id && f.key === "state_of_residence"));
});

test("171-shaped join: remove the residence fact and the SAME field stops as no_confirmed_fact", () => {
  const b2 = JSON.parse(JSON.stringify(BANK));
  b2.facts = b2.facts.filter((f) => f.id !== "F-024");
  b2.basics.location = "";
  const profile = profileFromBank(b2);
  assert.equal(profile.state_of_residence, undefined, "premise: no state derives without the fact");
  const { defs } = BrowserBoard.classifyFields(affirmForm());
  const stateDef = defs.find((d) => /Canadian Province/.test(d.label || ""));
  const v = coverageJoin(defs, profile);
  assert.equal(v.covered, false);
  assert.ok(v.stops.some((s) => s.field_id === stateDef.field_id && s.reason === "no_confirmed_fact"), "the stop names the field and the missing fact — never a guess");
});

test("171-shaped join: the province-only form is NOT covered even WITH the state fact on file (no forced bind)", () => {
  const fields = affirmForm();
  fields[2] = Object.assign({}, fields[2], { label: "Which province do you reside in?", options: PROVINCE_OPTIONS.map((l) => ({ value: l, label: l })) });
  const { defs } = BrowserBoard.classifyFields(fields);
  const provDef = defs.find((d) => /province do you reside/.test(d.label || ""));
  assert.equal(provDef.profile_key, undefined, "the join's premise: the province-only field binds no profile key");
  const v = coverageJoin(defs, profileFromBank(BANK));
  assert.equal(v.covered, false);
  assert.ok(v.stops.some((s) => s.field_id === provDef.field_id && s.reason === "unknown_field_category"), "it stops as an ask — the US state is never forced into a province-only field");
});

// ---------- end to end over a stub board (the answer-map suite's shape) ----------
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
const POSTING = { id: "JOB-AFFIRM", canonicalKey: "greenhouse:affirm:state-binding-test", company: "TEST Affirm-shaped", role: "Analyst", url: "https://boards.greenhouse.io/test/jobs/2", status: "open", atsFamily: "greenhouse" };

test("end to end: the Affirm state field is FILLED with the derived state; nothing submits", () => {
  const { defs } = BrowserBoard.classifyFields(affirmForm());
  const board = stubBoard(defs);
  const session = Portal.createPortalSession({ userId: "u-test", board });
  const r = Portal.runApply(session, { posting: POSTING, profile: profileFromBank(BANK), log: { records: [] } });
  const stateDef = defs.find((d) => /Canadian Province/.test(d.label || ""));
  assert.equal(board.held[stateDef.field_id], "Illinois", "the confirmed residence fact fills the field that used to stop the drive");
  assert.ok(!(r.asks || []).some((a) => a.field_id === stateDef.field_id), "no ask is raised for the covered field");
  assert.equal(board.calls.submit, 0);
});

test("end to end: the province-only field is ASKED, never filled with the US state", () => {
  const fields = affirmForm();
  fields[2] = Object.assign({}, fields[2], { label: "Which province do you reside in?", options: PROVINCE_OPTIONS.map((l) => ({ value: l, label: l })) });
  const { defs } = BrowserBoard.classifyFields(fields);
  const board = stubBoard(defs);
  const session = Portal.createPortalSession({ userId: "u-test", board });
  const r = Portal.runApply(session, { posting: POSTING, profile: profileFromBank(BANK), log: { records: [] } });
  const provDef = defs.find((d) => /province do you reside/.test(d.label || ""));
  assert.equal(board.held[provDef.field_id], undefined, "no fill: the value cannot fit the observed options");
  assert.ok((r.asks || []).some((a) => a.field_id === provDef.field_id), "the drive stops and names the field");
  assert.equal(board.calls.submit, 0);
});
