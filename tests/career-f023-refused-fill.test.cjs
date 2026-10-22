"use strict";

// MUSE-F-023 (silent-loss half) — a fill the BOARD refuses is an ask, never a fill.
//
// Root cause (docs: commit b67e1ae14, ROOT-CAUSE-F023-2026-10-22.md): module 149's
// prepareRound called board.fill(...) and recorded `filled[field_id]` unconditionally
// at every fill site, discarding the board's verdict. A required fixed-option field
// ("What is your major? Please choose the closest response") whose confirmed fact is
// free text matching none of the options was refused by the board (option_not_found),
// yet carried as answered: no ask surfaced, and the gap reached the doorstep (or was
// hidden entirely).
//
// The rule these guards pin (D-007, never invent an answer): a refused fill is never
// recorded in `filled`, never mapped to a guessed option, and becomes a named ask
// { field_id, reason: "fill_refused", refusal: <board's reason> } for the person. A
// control whose option does match the confirmed fact still fills.
//
// Check: node --test tests/career-f023-refused-fill.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const POSTING = {
  id: "JOB-F023", canonicalKey: "greenhouse:testco:f023-intern", company: "TEST Co",
  role: "Software Engineering Intern", url: "https://boards.greenhouse.io/testco/jobs/023",
  status: "open", atsFamily: "greenhouse",
};
const MAJOR_LABEL = "What is your major? Please choose the closest response, and the one closer to the top of the list if you are double majoring.";
// A fixed-option "closest response" control (TEST vocabulary — not a claimed copy of any board's list).
const MAJOR_FIELD = {
  field_id: "what_is_your_major_please_choose_the_closest_res", label: MAJOR_LABEL,
  kind: "standard", profile_key: "education_discipline", required: true, inputType: "select",
  options: [
    { value: "", label: "Please select one..." },
    { value: "cs", label: "Computer Science" },
    { value: "econ", label: "Economics" },
    { value: "math", label: "Mathematics" },
  ],
};
const profileWith = (discipline) => ({
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", phone: "+1 000 555 0100",
  location: "Chicago, IL", resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  education: { school: "TEST University", degree: "BS", discipline },
  answers: {
    work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    cover_note: { value: "TEST SAMPLE cover note.", confirmed: true, draft: true },
  },
});
function run(discipline) {
  const board = Portal.createSandboxBoard({ extraFields: [MAJOR_FIELD] });
  const session = Portal.createPortalSession({ userId: "user-f023", board });
  const res = Portal.runApply(session, {
    posting: POSTING, profile: profileWith(discipline), log: { records: [] }, userId: "user-f023",
    attestations: { certify_true: { value: true, explicit: true } },
  });
  return { board, session, res };
}

test("F-023: a refused select fill (free-text fact, no matching option) is a named ask — never recorded as filled", () => {
  const { board, session, res } = run("Computer Science and Economics");
  const id = MAJOR_FIELD.field_id;
  assert.equal(res.resultStatus, "awaiting_user", "a required refused field gates the run on the person");
  const ask = (res.asks || []).find((a) => a.field_id === id);
  assert.ok(ask, "the refused field surfaces as an ask with its field id");
  assert.equal(ask.reason, "fill_refused");
  assert.equal(ask.refusal, "option_not_found", "the ask names the board's refusal");
  assert.equal((res.asks || []).filter((a) => a.field_id === id).length, 1, "asked once");
  // nothing invented: no option was chosen, nothing landed, no fill step claims it
  assert.equal(board.answers()[id], undefined, "no guessed option landed on the board");
  assert.ok(!(res.stepLog || []).some((s) => s.action === "fill" && s.field_id === id), "no fill step is logged for a refused fill");
  const refused = (res.stepLog || []).find((s) => s.action === "fill_refused" && s.field_id === id);
  assert.ok(refused, "the refusal is recorded in the step log");
  assert.equal(refused.refusal, "option_not_found");
  assert.equal(res.doorstep, undefined, "no doorstep is presented");
  assert.equal(session.doorstep, null);
  assert.equal(session.preparationPayload[id], undefined, "the refused field is not in the preparation payload");
});

test("F-023: an optional refused field is recorded and not filled, but does not block the doorstep", () => {
  const board = Portal.createSandboxBoard({ extraFields: [Object.assign({}, MAJOR_FIELD, { required: false })] });
  const session = Portal.createPortalSession({ userId: "user-f023", board });
  const res = Portal.runApply(session, {
    posting: POSTING, profile: profileWith("Computer Science and Economics"), log: { records: [] }, userId: "user-f023",
    attestations: { certify_true: { value: true, explicit: true } },
  });
  assert.equal(res.resultStatus, "prepared");
  assert.ok(!(MAJOR_FIELD.field_id in res.doorstep.payload), "the refused field is not in the doorstep payload");
  assert.ok((res.stepLog || []).some((s) => s.action === "fill_refused" && s.field_id === MAJOR_FIELD.field_id));
});

test("F-023 control: when an option matches the confirmed fact, the field fills and reaches the doorstep payload", () => {
  const { board, res } = run("Computer Science");
  const id = MAJOR_FIELD.field_id;
  assert.equal(res.resultStatus, "prepared");
  assert.ok(!(res.asks || []).some((a) => a.field_id === id));
  assert.equal(board.answers()[id], "Computer Science");
  assert.equal(res.doorstep.payload[id], "Computer Science");
  assert.ok((res.stepLog || []).some((s) => s.action === "fill" && s.field_id === id && s.source === "profile"));
});

test("F-023: a worker-bridge refusal (fill returns null) is honored the same way", () => {
  const inner = Portal.createSandboxBoard({ extraFields: [MAJOR_FIELD] });
  // The worker bridge returns the remote result verbatim; the board service maps a refusal (undefined) to null.
  const bridge = Object.assign({}, inner, {
    fill(id, v) { const r = inner.fill(id, v); return r === undefined ? null : r; },
    answers: () => inner.answers(), form: () => inner.form(), open: () => inner.open(), atReview: () => inner.atReview(),
  });
  delete bridge.fillFailures; // the bridge exposes no failure list
  const session = Portal.createPortalSession({ userId: "user-f023", board: bridge });
  const res = Portal.runApply(session, {
    posting: POSTING, profile: profileWith("Computer Science and Economics"), log: { records: [] }, userId: "user-f023",
    attestations: { certify_true: { value: true, explicit: true } },
  });
  assert.equal(res.resultStatus, "awaiting_user");
  const ask = (res.asks || []).find((a) => a.field_id === MAJOR_FIELD.field_id);
  assert.ok(ask);
  assert.equal(ask.reason, "fill_refused");
  assert.equal(ask.refusal, "fill_returned_no_value");
});
