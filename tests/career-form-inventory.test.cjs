"use strict";
/* 171 PRE-DRIVE FORM INVENTORY — guard suite (Lane G, 2026-10-21).
   Fixtures: synthetic form snapshots in module 150's raw discover shape
   and in 149/150 defs shape (the raw fixture mirrors a Greenhouse
   application form's field anatomy); fact fixtures in module 122/149's
   bank shape. The suite pins: (1) inventory records carry label /
   control / required / options / question kind, and unknown stays
   unknown; (2) coverage follows module 149's own rules; (3) D-007:
   a quarantined fact NEVER counts as coverage (stub reader, stamped);
   (4) the batch-card line is computed from verdicts. */
const test = require("node:test");
const assert = require("node:assert/strict");
const Inv = require("../packages/domain/171-career-form-inventory.js");

// ---- raw snapshot: Greenhouse-shaped form (synthetic labels, real anatomy) ----
const RAW_GH = {
  fields: [
    { selector: "#first_name", tag: "input", inputType: "text", label: "First Name*", name: "job_application[first_name]", id: "first_name", required: true },
    { selector: "#last_name", tag: "input", inputType: "text", label: "Last Name*", name: "job_application[last_name]", id: "last_name", required: true },
    { selector: "#email", tag: "input", inputType: "email", label: "Email*", name: "job_application[email]", id: "email", required: true },
    { selector: "#phone", tag: "input", inputType: "tel", label: "Phone", name: "job_application[phone]", id: "phone", required: false },
    { selector: "#resume", tag: "input", inputType: "file", label: "Resume/CV*", name: "job_application[resume]", id: "resume", required: true },
    { selector: "#linkedin", tag: "input", inputType: "text", label: "LinkedIn Profile", name: "job_application[answers][0]", id: "q0", required: false },
    { selector: "#school", tag: "input", inputType: "text", label: "School*", name: "job_application[school]", id: "school", required: true },
    { selector: "#auth_yes", tag: "input", inputType: "radio", label: "Yes", name: "auth", id: "auth_yes", value: "yes", required: true, groupLabel: "Are you legally authorized to work in the United States?*" },
    { selector: "#auth_no", tag: "input", inputType: "radio", label: "No", name: "auth", id: "auth_no", value: "no", required: true, groupLabel: "Are you legally authorized to work in the United States?*" },
    { selector: "#cover", tag: "textarea", inputType: "textarea", label: "Cover Letter", name: "job_application[cover_letter]", id: "cover", required: false },
    { selector: "#mystery", tag: "input", inputType: "text", label: "What is your favorite dinosaur?*", name: "job_application[answers][9]", id: "q9", required: true },
  ],
};

// ---- defs snapshot: what the worker board service's form() returns ----
const DEFS_GH = {
  fields: [
    { field_id: "full_name", label: "Full name", kind: "standard", profile_key: "name", required: true },
    { field_id: "email", label: "Email", kind: "standard", profile_key: "email", required: true },
    { field_id: "resume", label: "Resume/CV", kind: "standard", profile_key: "resume", required: true },
    { field_id: "edu_school", label: "School", kind: "standard", profile_key: "education_school", required: true },
    { field_id: "work_auth", label: "Authorized to work?", kind: "screening", question_key: "work_authorization", required: true },
    { field_id: "yoe", label: "Years of experience", kind: "screening", question_key: "years_of_experience", required: false },
    { field_id: "gender", label: "Gender", kind: "eeo", question_key: "gender", required: false },
    { field_id: "certify", label: "I certify the above is true and complete", kind: "attestation", question_key: "attestation", required: true },
    { field_id: "dino", label: "Favorite dinosaur?", kind: "unknown", required: true },
    { field_id: "essay1", label: "Why this company?", kind: "free_text", question_key: "why_this_company", required: true },
  ],
};

// ---- fact bank: 122/149 shape ----
function bankWith(overrides) {
  const bank = {
    basics: { name: "Alex Testcase", email: "gauntlet-test@upmore.test", phone: "+1 555 0100", location: "Chicago, IL", linkedin: "linkedin.com/in/alextest" },
    resume: { filename: "resume.pdf", sha256: "abc123" },
    facts: [
      { id: "F-020", kind: "eligibility", name: "Work authorization", value: "Yes", status: "confirmed" },
      { id: "F-021", kind: "eligibility", name: "Sponsorship", value: "No", status: "confirmed" },
      { id: "F-001", kind: "education", title: "Pursuing Bachelors in Computer Science", org: "DePaul University", start: "2025", end: "2029", status: "confirmed" },
      { id: "F-002", kind: "experience", title: "Intern", org: "Example Co", start: "2025", status: "confirmed" },
    ],
    defaults: { gpa: "3.9" },
  };
  return Object.assign(bank, overrides || {});
}

// ================= inventory: raw shape =================
test("raw snapshot -> inventory records carry control, options, kinds", () => {
  const inv = Inv.inventoryFromSnapshot(RAW_GH);
  assert.equal(inv.source_shape, "raw");
  const byLabel = Object.fromEntries(inv.fields.map((f) => [f.label, f]));
  // first+last collapse into one full_name standard field (150's rule)
  const name = inv.fields.find((f) => f.field_id === "full_name");
  assert.ok(name, "full_name virtual field exists");
  assert.equal(name.question_kind, "identity");
  assert.equal(name.control, "text");
  assert.equal(byLabel["Email"].control, "email");
  assert.equal(byLabel["Email"].question_kind, "identity");
  assert.equal(byLabel["Resume/CV"].control, "file");
  assert.equal(byLabel["Resume/CV"].question_kind, "identity");
  assert.equal(byLabel["School"].question_kind, "education");
  // radio group collapses to one record with option texts
  const auth = inv.fields.find((f) => /authorized to work/.test(f.label));
  assert.ok(auth, "radio group present as one record");
  assert.equal(auth.control, "radio");
  assert.deepEqual(auth.options, ["Yes", "No"]);
  assert.equal(auth.question_kind, "identity");
  assert.equal(auth.required, true);
  assert.equal(byLabel["Cover Letter"].control, "textarea");
  assert.equal(byLabel["Cover Letter"].question_kind, "essay");
  // the dinosaur question is NOT force-classified
  assert.equal(byLabel["What is your favorite dinosaur?"].question_kind, "unknown");
  assert.equal(byLabel["What is your favorite dinosaur?"].source_kind, "unknown");
});

test("defs snapshot -> wire honesty: control unknown, options null, kinds projected", () => {
  const inv = Inv.inventoryFromSnapshot(DEFS_GH);
  assert.equal(inv.source_shape, "defs");
  for (const f of inv.fields) {
    assert.equal(f.control, "unknown");
    assert.equal(f.control_source, "defs_snapshot".length ? f.control_source : ""); // any source stamp present
    assert.equal(f.options, null);
  }
  const kinds = Object.fromEntries(inv.fields.map((f) => [f.field_id, f.question_kind]));
  assert.equal(kinds.full_name, "identity");
  assert.equal(kinds.edu_school, "education");
  assert.equal(kinds.work_auth, "identity");
  assert.equal(kinds.yoe, "experience");
  assert.equal(kinds.gender, "eeo");
  assert.equal(kinds.essay1, "essay");
  assert.equal(kinds.certify, "unknown"); // attestation has no bucket — never forced
  assert.equal(kinds.dino, "unknown");
  assert.equal(inv.required_count, 8);
});

test("empty / malformed snapshots are empty inventories, never throws", () => {
  assert.equal(Inv.inventoryFromSnapshot(null).field_count, 0);
  assert.equal(Inv.inventoryFromSnapshot({}).field_count, 0);
  assert.equal(Inv.inventoryFromSnapshot({ fields: "nope" }).field_count, 0);
});

// ================= coverage: 149's rules =================
test("coverage: full bank covers standard+screening; attestation/essay/unknown stop named", () => {
  const inv = Inv.inventoryFromSnapshot(DEFS_GH);
  const v = Inv.coverageFor(inv, { bank: bankWith() });
  assert.equal(v.reader_mode, "module-167");
  const stopIds = v.stops.map((s) => s.field_id).sort();
  assert.deepEqual(stopIds, ["certify", "dino", "essay1"]);
  const reasons = Object.fromEntries(v.stops.map((s) => [s.field_id, s.reason]));
  assert.equal(reasons.certify, "attestation_requires_explicit_confirmation");
  assert.equal(reasons.dino, "unknown_field_category");
  assert.equal(reasons.essay1, "needs_user_draft_confirmation");
  assert.equal(v.covered, false);
  // eeo covered by the decline default, named as such
  const gender = v.covered_fields.find((f) => f.field_id === "gender");
  assert.equal(gender.covered_by, "eeo_default_decline");
  // optional uncovered is listed separately, never a stop
  assert.equal(v.optional_uncovered.length, 0); // yoe is covered by the experience fact
});

test("coverage: attestation + confirmed draft + known answers -> fully covered", () => {
  const inv = Inv.inventoryFromSnapshot({
    fields: DEFS_GH.fields.filter((f) => f.field_id !== "dino"),
  });
  const bank = bankWith();
  bank.answers = { why_this_company: { value: "Because…", confirmed: true, draft: true } };
  const v = Inv.coverageFor(inv, { bank, attestations: { certify: { explicit: true, value: true } } });
  assert.equal(v.covered, true);
  assert.equal(v.stops.length, 0);
});

test("coverage: unconfirmed screening answer stops as answer_unconfirmed", () => {
  const inv = Inv.inventoryFromSnapshot({ fields: [DEFS_GH.fields.find((f) => f.field_id === "work_auth")] });
  const profile = { name: "A", answers: { work_authorization: { value: "Yes", confirmed: false } } };
  const v = Inv.coverageFor(inv, { profile });
  assert.equal(v.covered, false);
  assert.equal(v.stops[0].reason, "answer_unconfirmed");
});

test("coverage: missing resume fact stops the resume field (no_confirmed_fact)", () => {
  const inv = Inv.inventoryFromSnapshot({ fields: [DEFS_GH.fields.find((f) => f.field_id === "resume")] });
  const bank = bankWith(); delete bank.resume;
  const v = Inv.coverageFor(inv, { bank });
  assert.equal(v.covered, false);
  assert.equal(v.stops[0].reason, "no_confirmed_fact");
});

// ================= D-007: quarantine never counts =================
test("D-007: a QUARANTINED eligibility fact does not cover work_authorization", () => {
  const inv = Inv.inventoryFromSnapshot({ fields: [DEFS_GH.fields.find((f) => f.field_id === "work_auth")] });
  const bank = bankWith();
  bank.facts = bank.facts.map((f) => (f.id === "F-020" ? Object.assign({}, f, { status: "quarantined" }) : f));
  const v = Inv.coverageFor(inv, { bank });
  assert.equal(v.covered, false);
  assert.equal(v.stops[0].reason, "no_confirmed_fact");
  assert.equal(v.excluded_quarantined_facts, 1);
  assert.equal(v.reader_mode, "module-167");
});

test("D-007: quarantined flag on a confirmed fact also excludes it", () => {
  const inv = Inv.inventoryFromSnapshot({ fields: [DEFS_GH.fields.find((f) => f.field_id === "work_auth")] });
  const bank = bankWith();
  bank.facts = bank.facts.map((f) => (f.id === "F-020" ? Object.assign({}, f, { quarantined: true }) : f));
  const v = Inv.coverageFor(inv, { bank });
  assert.equal(v.covered, false);
  assert.equal(v.excluded_quarantined_facts, 1);
});

test("D-007: profile answers flagged quarantined are withheld by the reader", () => {
  const inv = Inv.inventoryFromSnapshot({ fields: [DEFS_GH.fields.find((f) => f.field_id === "work_auth")] });
  const profile = { answers: { work_authorization: { value: "Yes", confirmed: true, quarantined: true } } };
  const v = Inv.coverageFor(inv, { profile });
  assert.equal(v.covered, false);
  assert.deepEqual(v.withheld_profile_keys, ["answers.work_authorization"]);
});

test("D-007: an injected 167-shaped reader is used and stamped", () => {
  const inv = Inv.inventoryFromSnapshot({ fields: [DEFS_GH.fields.find((f) => f.field_id === "work_auth")] });
  const fake167 = {
    mode: "module-167",
    trustedBank: (bank) => ({ bank, excluded_quarantined: 0, excluded_unconfirmed: 0 }),
    trustedProfile: (profile) => ({ profile, withheld_keys: [] }),
  };
  const v = Inv.coverageFor(inv, { bank: bankWith() }, { factReader: fake167 });
  assert.equal(v.reader_mode, "module-167");
  assert.equal(v.covered, true);
});

// ================= card line =================
test("card line: computed counts + named stops", () => {
  const invA = Inv.inventoryFromSnapshot({ fields: [DEFS_GH.fields.find((f) => f.field_id === "email")] });
  const invB = Inv.inventoryFromSnapshot(DEFS_GH);
  const line = Inv.batchCoverageLine([
    { company: "Acme", title: "Data Intern", verdict: Inv.coverageFor(invA, { bank: bankWith() }) },
    { company: "Globex", title: "Finance Intern", verdict: Inv.coverageFor(invB, { bank: bankWith() }) },
  ]);
  assert.match(line, /^Coverage: 1 of 2 fully covered/);
  assert.match(line, /Globex — Finance Intern stops on:/);
  assert.match(line, /Favorite dinosaur\?/);
});

test("coverage: a form with zero required questions is covered but VACUOUS, and the card says so", () => {
  const inv = Inv.inventoryFromSnapshot({ fields: [
    { field_id: "search", label: "Search", kind: "unknown", required: false },
    { field_id: "dept", label: "Department", kind: "unknown", required: false },
  ] });
  const v = Inv.coverageFor(inv, { bank: bankWith() });
  assert.equal(v.covered, true);
  assert.equal(v.vacuous, true);
  const line = Inv.batchCoverageLine([{ company: "Natera", title: "PM", verdict: v }]);
  assert.match(line, /vacuous/);
});

test("card line: all covered reads clean", () => {
  const invA = Inv.inventoryFromSnapshot({ fields: [DEFS_GH.fields.find((f) => f.field_id === "email")] });
  const line = Inv.batchCoverageLine([{ company: "Acme", title: "Data Intern", verdict: Inv.coverageFor(invA, { bank: bankWith() }) }]);
  assert.match(line, /^Coverage: 1 of 1 fully covered/);
});
