// CA-03 submit-path defect guards — submissions-lane defects D1/D2/D3/D4
// (+ stretch D6/D7/D9 at the classify layer), written fail-first against
// the 2026-10-14 lane report (63 real applications driven, 0 transmitted):
//   D1 redirect escapes the §6.3 host gate (150 follows off-allowlist hops)
//   D2 doorstep declared over an empty form (149 "prepared", resume-hash only)
//   D3 submit leg could never transmit under 149's approval gate (no arming wire)
//   D4 no education/country profile keys in 149/150 (answers existed in F-001)
// Pure/unit tier: no browser is opened here. The browser-tier proofs for
// the same defects live in tests/career-portal-browser.test.cjs.
// Check: node --test tests/career-portal-submit-path.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

const POSTING = {
  id: "JOB-GH-W4", canonicalKey: "greenhouse:testsystems:w4",
  company: "TEST Systems", role: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testsystems/jobs/w4", status: "open", atsFamily: "greenhouse",
};
const EDU_PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test",
  phone: "+1 000 555 0100", location: "Chicago, IL", country: "United States",
  education: {
    school: "TEST University", degree: "Bachelor's", discipline: "Computer Science",
    start_date: "2024", end_date: "2028", gpa: "3.7", graduation_year: "2028",
  },
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {},
};

// A minimal board-seam stub (149's contract), labeled by kind. It records
// every call so a test can prove ZERO further actions after a stop.
function stubBoard({ kind = "sandbox", fields = [], openResult = { ok: true, captcha: null }, reviewResult = { ok: true, captcha: null } } = {}) {
  const calls = { open: 0, form: 0, fill: 0, atReview: 0, submit: 0 };
  const answers = {};
  const board = {
    kind, sandbox: kind === "sandbox", browserDriver: kind === "browser",
    atsFamily: "greenhouse", host: "boards.greenhouse.io", calls,
    open() { calls.open += 1; return openResult; },
    form() { calls.form += 1; return { fields: fields.map((f) => Object.assign({}, f)), captchaAt: null }; },
    fill(id, v) { calls.fill += 1; answers[id] = v; return v; },
    answers() { return Object.assign({}, answers); },
    atReview() { calls.atReview += 1; return reviewResult; },
    submit() { calls.submit += 1; return { outcome: "accepted", confirmationId: "STUB-1" }; },
    submissionState() { return { submitted: false, confirmationId: null }; },
  };
  return board;
}
const runWith = (board, over = {}) => {
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  const r = Portal.runApply(session, Object.assign({ posting: POSTING, profile: EDU_PROFILE, log: { records: [] } }, over));
  return { r, session };
};

// ---------- D1: a redirect off the allowlist is a typed stop in 149 ----------
test("D1 (BUG-060): 149 stops typed HOST_REDIRECT_REFUSED when the driver reports an off-allowlist final URL — zero form actions after it", () => {
  const board = stubBoard({ kind: "browser", openResult: { ok: false, captcha: null, code: "HOST_REDIRECT_REFUSED", finalUrl: "https://employer.example.com/apply", host: "employer.example.com", reason: "redirect left the allowlist" } });
  const { r, session } = runWith(board);
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "HOST_REDIRECT_REFUSED");
  assert.equal(r.finalUrl, "https://employer.example.com/apply");
  assert.equal(board.calls.form, 0, "the form was never even read after the redirect stop");
  assert.equal(board.calls.fill, 0, "nothing was filled on the off-list page");
  assert.equal(board.calls.submit, 0);
  assert.equal(session.doorstep, null, "no doorstep is recorded for a refused page");
});

test("D1 (BUG-060): 150's final-URL gate allows only the ATS families + localhost and refuses everything else", () => {
  assert.equal(typeof BrowserBoard.finalUrlGate, "function", "150 exports the redirect gate");
  for (const u of ["https://boards.greenhouse.io/acme/jobs/1", "https://job-boards.greenhouse.io/acme", "https://jobs.lever.co/acme/1", "https://jobs.ashbyhq.com/acme/1", "https://jobs.smartrecruiters.com/acme/1", "http://localhost:8123/gh-form"]) {
    assert.equal(BrowserBoard.finalUrlGate(u).allowed, true, u);
  }
  for (const u of ["https://www.hudsonrivertrading.com/careers/job/?gh_jid=1", "https://employer.example.com/apply", "https://greenhouse.io.evil.example/apply", "https://www.coinbase.com/careers/positions/1"]) {
    const g = BrowserBoard.finalUrlGate(u);
    assert.equal(g.allowed, false, u);
    assert.equal(g.code, "HOST_REDIRECT_REFUSED", u);
  }
});

test("D1 (BUG-060): a redirect refusal at the REVIEW step also stops 149 typed, before any submit", () => {
  const board = stubBoard({ kind: "browser",
    fields: [{ field_id: "email", label: "Email", kind: "standard", profile_key: "email", required: true }],
    reviewResult: { ok: false, captcha: null, code: "HOST_REDIRECT_REFUSED", finalUrl: "https://employer.example.com/review", host: "employer.example.com" } });
  const { r } = runWith(board, { approval: { approvedByUser: true, approvalRef: "owner-batch-001" } });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "HOST_REDIRECT_REFUSED");
  assert.equal(board.calls.submit, 0);
});

// ---------- D2: an empty form is a stop, never a doorstep ----------
test("D2 (BUG-061): zero discovered fields -> blocked EMPTY_FORM, no doorstep, no prepared payload", () => {
  const board = stubBoard({ fields: [] });
  const { r, session } = runWith(board, { attestations: {}, approval: { approvedByUser: true, approvalRef: "owner-batch-001" } });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "EMPTY_FORM");
  assert.equal(r.doorstep, undefined, "the result carries no doorstep");
  assert.equal(session.doorstep, null, "the session holds no doorstep payload");
  assert.equal(board.calls.submit, 0);
});

test("D2 (BUG-061): a form whose fills all fail (payload would be resume-hash only) is also EMPTY_FORM, never prepared", () => {
  const board = stubBoard({ fields: [{ field_id: "resume", label: "Resume", kind: "standard", profile_key: "resume", required: true }] });
  board.fill = () => undefined; // every fill degrades/fails, nothing lands
  board.answers = () => ({});    // readback: the board holds nothing at all
  const { r, session } = runWith(board);
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "EMPTY_FORM");
  assert.equal(session.doorstep, null);
});

// ---------- D4: education + country profile keys (149 contract) ----------
const EDU_FIELDS = [
  { field_id: "school", label: "School", kind: "standard", profile_key: "education_school", required: true },
  { field_id: "degree", label: "Degree", kind: "standard", profile_key: "education_degree", required: false },
  { field_id: "discipline", label: "Discipline", kind: "standard", profile_key: "education_discipline", required: false },
  { field_id: "edu_start", label: "Education start", kind: "standard", profile_key: "education_start_date", required: false },
  { field_id: "edu_end", label: "Education end", kind: "standard", profile_key: "education_end_date", required: false },
  { field_id: "gpa", label: "GPA", kind: "standard", profile_key: "education_gpa", required: false },
  { field_id: "grad_year", label: "Graduation year", kind: "standard", profile_key: "education_graduation_year", required: false },
  { field_id: "country", label: "Country", kind: "standard", profile_key: "country", required: true },
];
test("D4 (BUG-062): education + country answers flow from the profile (F-001 shape) into the payload", () => {
  const board = stubBoard({ fields: EDU_FIELDS });
  const { r } = runWith(board);
  assert.equal(r.resultStatus, "prepared");
  assert.equal(board.answers().school, "TEST University");
  assert.equal(board.answers().degree, "Bachelor's");
  assert.equal(board.answers().discipline, "Computer Science");
  assert.equal(board.answers().edu_start, "2024");
  assert.equal(board.answers().edu_end, "2028");
  assert.equal(board.answers().gpa, "3.7");
  assert.equal(board.answers().grad_year, "2028");
  assert.equal(board.answers().country, "United States");
  assert.equal(r.doorstep.payload.school, "TEST University");
  assert.equal(r.doorstep.payload.country, "United States");
});

test("D4 (BUG-062): a missing education/country fact is an ask — never invented, never filled", () => {
  const board = stubBoard({ fields: EDU_FIELDS });
  const profile = JSON.parse(JSON.stringify(EDU_PROFILE));
  delete profile.education; delete profile.country;
  const { r } = runWith(board, { profile });
  assert.equal(r.resultStatus, "awaiting_user", "required school + country are outstanding asks");
  assert.ok(r.asks.some((a) => a.field_id === "school" && a.reason === "no_confirmed_fact"));
  assert.ok(r.asks.some((a) => a.field_id === "country" && a.reason === "no_confirmed_fact"));
  assert.equal(board.answers().school, undefined);
  assert.equal(board.answers().country, undefined);
});

test("D4 (BUG-062): 150 classifies education + country DOM fields to the new profile keys", () => {
  const raw = (label, name, id, type = "text") => ({ domIndex: 1, selector: "#x", tag: "input", inputType: type, name, id, label, required: false });
  const cases = [
    [raw("School", "school", "school"), "education_school"],
    [raw("University", "university", "university"), "education_school"],
    [raw("Degree", "degree", "degree"), "education_degree"],
    [raw("Field of Study", "field_of_study", "fos"), "education_discipline"],
    [raw("Major", "major", "major"), "education_discipline"],
    [raw("GPA", "gpa", "gpa"), "education_gpa"],
    [raw("Graduation Year", "graduation_year", "gy"), "education_graduation_year"],
    [raw("Country", "country", "country"), "country"],
  ];
  for (const [f, key] of cases) {
    const { defs } = BrowserBoard.classifyFields([f]);
    assert.equal(defs[0].kind, "standard", f.label);
    assert.equal(defs[0].profile_key, key, f.label);
  }
});

// ---------- D3: the arming wire (149 side of the contract) ----------
test("D3 (BUG-063): submitDoorstep arms the board ONLY from an approval carrying an approvalRef, and records the ref on the submission", () => {
  const board = stubBoard({ kind: "browser", fields: [{ field_id: "email", label: "Email", kind: "standard", profile_key: "email", required: true }] });
  const armCalls = [];
  let armed = false;
  board.armForSubmit = (ctx) => { armCalls.push(ctx); if (ctx && ctx.approvedByUser === true && typeof ctx.approvalRef === "string" && ctx.approvalRef) { armed = true; return { armed: true }; } return { armed: false }; };
  const realSubmit = board.submit.bind(board);
  board.submit = () => { if (!armed) { const e = new Error("not armed"); e.code = "REAL_SUBMIT_DISABLED"; throw e; } return realSubmit(); };
  const { r, session } = runWith(board);
  assert.equal(r.resultStatus, "prepared");
  // no approvalRef: the gate must not transmit
  assert.throws(() => Portal.submitDoorstep(session, { approvedByUser: true }, { log: { records: [] } }), (e) => e.code === "REAL_SUBMIT_DISABLED");
  assert.equal(board.calls.submit, 0, "the board's submit never fired without a ref");
  assert.ok(armCalls.length >= 1 && armCalls[armCalls.length - 1].approvalRef == null, "149 offered the (ref-less) approval to the arming wire honestly");
  // with the owner's batch approval ref: armed, fires once, ref recorded
  const done = Portal.submitDoorstep(session, { approvedByUser: true, approvalRef: "owner-batch-001-2026-10-13" }, { log: { records: [] }, now: "2026-10-14T00:00:00Z" });
  assert.equal(done.resultStatus, "completed");
  assert.equal(done.submission.confirmationId, "STUB-1");
  assert.equal(done.submission.approvalRef, "owner-batch-001-2026-10-13", "the submission record names the approval it fired under");
  assert.equal(armCalls[armCalls.length - 1].approvalRef, "owner-batch-001-2026-10-13");
  assert.equal(board.calls.submit, 1, "exactly one submit");
});

// ---------- D6: duplicate field definitions dedupe by semantic key ----------
test("D6 (BUG-064): duplicate DOM fields (same label + semantic key) collapse to ONE def — asks are not doubled", () => {
  const sel = (id) => ({ domIndex: id, selector: "#g" + id, tag: "select", inputType: "select", name: "gender", id: "g" + id, label: "Gender", required: false, options: [{ value: "", label: "Select..." }, { value: "x", label: "Decline to self-identify" }] });
  const { defs } = BrowserBoard.classifyFields([sel(1), sel(2), sel(3)]);
  assert.equal(defs.length, 1, "the same question emitted 3x is one field");
  assert.equal(defs[0].kind, "eeo");
});

// ---------- D7: no value misbinding by name alone; preferred_name is its own key ----------
test("D7 (BUG-065): a value is never bound from the DOM name alone when the label says something else; preferred_name is not the legal name", () => {
  const raw = (label, name, id, type = "text") => ({ domIndex: 1, selector: "#x", tag: "input", inputType: type, name, id, label, required: false });
  const office = BrowserBoard.classifyFields([raw("Office preference", "office_location", "ol")]).defs[0];
  assert.notEqual(office.profile_key, "location", "an office-preference field must not receive the profile location just because its name says location");
  const worked = BrowserBoard.classifyFields([raw("Have you worked at TEST Systems before?", "location_history", "lh", "checkbox")]).defs[0];
  assert.notEqual(worked.profile_key, "location", "a prior-employment question must not receive the profile location");
  const pref = BrowserBoard.classifyFields([raw("Preferred Name", "preferred_name", "pn")]).defs[0];
  assert.equal(pref.profile_key, "preferred_name", "preferred name is its own profile key");
  assert.notEqual(pref.profile_key, "name", "the legal name is never bound into a preferred-name field");
});

test("D7 (BUG-065): without a preferred_name fact the field stays EMPTY (ask, not a filled legal name)", () => {
  const board = stubBoard({ fields: [{ field_id: "preferred_name", label: "Preferred Name", kind: "standard", profile_key: "preferred_name", required: false }] });
  const { r } = runWith(board);
  assert.equal(board.answers().preferred_name, undefined, "nothing was filled");
  assert.ok(r.asks.some((a) => a.field_id === "preferred_name" && a.reason === "no_confirmed_fact"));
});

test("D7 live-found exceptions (Arc doorstep run, 2026-10-14): a resume file labeled 'Attach' still binds the sha-bound resume, a cover-letter file never does, and EEO matches its machine name", () => {
  const raw = (label, name, id, type = "text") => ({ domIndex: 1, selector: "#x", tag: "input", inputType: type, name, id, label, required: false });
  const resume = BrowserBoard.classifyFields([raw("Attach", "resume", "resume", "file")]).defs[0];
  assert.equal(resume.profile_key, "resume", "Greenhouse labels its resume upload 'Attach' — the name carries it");
  const cover = BrowserBoard.classifyFields([raw("Attach", "cover_letter", "cover_letter", "file")]).defs[0];
  assert.notEqual(cover.profile_key, "resume", "a cover-letter upload is never filled with the resume file");
  const hisp = BrowserBoard.classifyFields([raw("Are you Hispanic/Latino?", "hispanic_ethnicity", "he")]).defs[0];
  assert.equal(hisp.kind, "eeo", "the EEO decline default must reach the Hispanic/Latino question");
});

test("D4/D7 live refinements (Aquatic run, 2026-10-14): Greenhouse's start_year_<n>/end_year_<n> education fields bind the education dates; a location-preference question does not bind the location value", () => {
  const raw = (label, name, id, type = "text") => ({ domIndex: 1, selector: "#x", tag: "input", inputType: type, name, id, label, required: false });
  assert.equal(BrowserBoard.classifyFields([raw("Start date year", "start_year_0", "sy")]).defs[0].profile_key, "education_start_date");
  assert.equal(BrowserBoard.classifyFields([raw("End date year", "end_year_0", "ey")]).defs[0].profile_key, "education_end_date");
  // Greenhouse education-block shape: the year selects are labeled only
  // "Start date year"/"End date year" and bind by sibling context.
  const block = BrowserBoard.classifyFields([raw("School", "school", "sc"), raw("Start date year", "sy", "sy"), raw("End date year", "ey", "ey")]).defs;
  assert.equal(block[1].profile_key, "education_start_date", "year selects bind inside an education block");
  assert.equal(block[2].profile_key, "education_end_date");
  const noCtx = BrowserBoard.classifyFields([raw("Start date year", "sy", "sy")]).defs[0];
  assert.notEqual(noCtx.profile_key, "education_start_date", "without education context the bare year label stays unbound");
  const pref = BrowserBoard.classifyFields([raw("Location Preference", "location_preference", "lp")]).defs[0];
  assert.notEqual(pref.profile_key, "location", "preference questions are asks, not the current location");
  const current = BrowserBoard.classifyFields([raw("Current Location", "current_location", "cl")]).defs[0];
  assert.equal(current.profile_key, "location", "the current-location field still binds");
});

// ---------- D9: Lever custom-card labels — the human label reaches the field def ----------
test("D9 (BUG-066): a custom-card field with no <label> carries its human card label, not the machine field name", () => {
  const raw = { domIndex: 1, selector: "#c0", tag: "input", inputType: "text", name: "cards_9f2_field0", id: "", label: "", groupLabel: "Are you willing to relocate?", required: true };
  const { defs } = BrowserBoard.classifyFields([raw]);
  assert.equal(defs[0].label, "Are you willing to relocate?", "the ask record can quote the human question");
  assert.notEqual(defs[0].field_id, "cards_9f2_field0", "the field_id is not the raw machine name");
});
