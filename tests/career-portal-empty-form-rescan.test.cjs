// MUSE-F-025 — EMPTY_FORM open race: bounded re-scan guard (permanent).
// The defect: 149 read the form exactly once; on a slow first paint the
// board's SPA form has not mounted yet, the single read returns zero
// fields, and the BUG-061 zero-fields stop (D2) fired EMPTY_FORM on a
// healthy posting (live: batch-7ac6d3b30fa5, both Palantir postings,
// bracketed by drives returning 27/34 fields minutes apart).
// The fix: a zero-field read is re-scanned, bounded (5 total reads AND
// 10,000 ms wall-clock, whichever binds first); a form still empty when
// the bound is exhausted stops EMPTY_FORM exactly as before.
// Root cause: docs/apply/ROOT-CAUSE-F025-2026-10-22.md
// FAIL-FIRST: on the base tree the race + boundary + negative-control-count
// tests are RED (single read, immediate EMPTY_FORM); the fast-path and
// kill-switch invariants hold on both trees by design.
// Check: node --test tests/career-portal-empty-form-rescan.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const POSTING = {
  id: "JOB-LEV-F025", canonicalKey: "lever:testsystems:f025",
  company: "TEST Systems", role: "Software Engineering Intern",
  url: "https://jobs.lever.co/testsystems/f025", status: "open", atsFamily: "lever",
};
const PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test",
  phone: "+1 000 555 0100", location: "Chicago, IL", country: "United States",
  education: {
    school: "TEST University", degree: "Bachelor's", discipline: "Computer Science",
    start_date: "2024", end_date: "2028", gpa: "3.7", graduation_year: "2028",
  },
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {},
};
// The fields the form exposes once it has mounted: both covered by
// confirmed profile facts, so a mounted read proceeds to the doorstep.
const MOUNTED_FIELDS = [
  { field_id: "email", label: "Email", kind: "standard", profile_key: "email", required: true },
  { field_id: "resume", label: "Resume", kind: "standard", profile_key: "resume", required: true },
];

// Board-seam stub whose form() plays a script of successive reads
// (the last entry repeats — buildPayload re-reads the mounted form).
function scriptedBoard(formScript) {
  const calls = { open: 0, form: 0, fill: 0, atReview: 0, submit: 0 };
  const answers = {};
  let read = 0;
  const board = {
    kind: "browser", sandbox: false, browserDriver: true,
    atsFamily: "lever", host: "jobs.lever.co", calls,
    open() { calls.open += 1; return { ok: true, captcha: null }; },
    form() {
      calls.form += 1;
      const fields = formScript[Math.min(read, formScript.length - 1)];
      read += 1;
      return { fields: fields.map((f) => Object.assign({}, f)), captchaAt: null };
    },
    fill(id, v) { calls.fill += 1; answers[id] = v; return v; },
    answers() { return Object.assign({}, answers); },
    atReview() { calls.atReview += 1; return { ok: true, captcha: null }; },
    submit() { calls.submit += 1; return { outcome: "accepted", confirmationId: "STUB-1" }; },
    submissionState() { return { submitted: false, confirmationId: null }; },
  };
  return board;
}
const runWith = (board, over = {}) => {
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  const r = Portal.runApply(session, Object.assign({ posting: POSTING, profile: PROFILE, log: { records: [] } }, over));
  return { r, session };
};
const stepsNamed = (r, action) => (r.stepLog || []).filter((s) => s.action === action);

// ---------- the race: fields mount after the first reads ----------
test("F-025: form mounting on the 3rd read proceeds — no EMPTY_FORM, recovery recorded", () => {
  const board = scriptedBoard([[], [], MOUNTED_FIELDS]);
  const { r, session } = runWith(board);
  assert.notEqual(r.code, "EMPTY_FORM", "a late-mounting form must not stop EMPTY_FORM");
  assert.equal(r.resultStatus, "prepared");
  assert.ok(r.doorstep, "the run reached the doorstep");
  assert.equal(session.doorstep && session.doorstep.atFinalReview, true);
  const rescans = stepsNamed(r, "empty_form_rescan");
  assert.equal(rescans.length, 2, "two bounded re-reads were step-logged");
  const recovered = stepsNamed(r, "empty_form_rescan_recovered");
  assert.equal(recovered.length, 1, "the recovery is recorded once");
  assert.equal(recovered[0].reads, 3);
  assert.equal(recovered[0].fieldCount, MOUNTED_FIELDS.length);
  assert.equal(board.calls.submit, 0);
});

// ---------- negative control: a genuinely empty form still stops ----------
test("F-025 negative control: form empty on every read still stops EMPTY_FORM, after exactly the bounded reads", () => {
  const board = scriptedBoard([[]]);
  const { r, session } = runWith(board);
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "EMPTY_FORM", "the BUG-061 verdict survives the re-scan");
  assert.equal(board.calls.form, 5, "exactly the bounded number of reads, never an unbounded wait");
  assert.equal(r.doorstep, undefined, "no doorstep over an empty form");
  assert.equal(session.doorstep, null);
  assert.ok(r.rescan, "the stop carries the rescan record");
  assert.equal(r.rescan.reads, 5);
  assert.equal(r.rescan.maxReads, 5);
  assert.equal(r.rescan.budgetMs, 10000);
  assert.equal(r.rescan.outcome, "exhausted");
  assert.equal(stepsNamed(r, "empty_form_rescan").length, 4, "each re-read was step-logged");
  assert.equal(stepsNamed(r, "empty_form_rescan_recovered").length, 0);
  assert.equal(board.calls.submit, 0);
});

// ---------- boundary: fields arriving on the LAST bounded read proceed ----------
test("F-025 boundary: fields first appearing on the 5th (last bounded) read still proceed", () => {
  const board = scriptedBoard([[], [], [], [], MOUNTED_FIELDS]);
  const { r } = runWith(board);
  assert.notEqual(r.code, "EMPTY_FORM");
  assert.equal(r.resultStatus, "prepared");
  const recovered = stepsNamed(r, "empty_form_rescan_recovered");
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].reads, 5);
});

// ---------- fast path: a mounted first read is untouched ----------
test("F-025 fast path: fields on the first read — no rescan steps, run unchanged", () => {
  const board = scriptedBoard([MOUNTED_FIELDS]);
  const { r } = runWith(board);
  assert.equal(r.resultStatus, "prepared");
  assert.equal(stepsNamed(r, "empty_form_rescan").length, 0);
  assert.equal(stepsNamed(r, "empty_form_rescan_recovered").length, 0);
});

// ---------- kill switch: single read, exactly the old behaviour ----------
test("F-025 kill switch: emptyFormRescan=false restores the single read and the immediate EMPTY_FORM", () => {
  const board = scriptedBoard([[]]);
  const { r } = runWith(board, { emptyFormRescan: false });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "EMPTY_FORM");
  assert.equal(board.calls.form, 1, "one read only — the pre-fix behaviour");
  assert.ok(r.rescan, "the disabled state is still recorded");
  assert.equal(r.rescan.outcome, "disabled");
  assert.equal(r.rescan.reads, 1);
});
