// MI-116 / BUG-234 — approval binds to the EXACT payload (Spec 2 §10:
// changing a payload after approval invalidates the approval). Before this
// guard, 149 armed on approvalRef + canonical key and re-verified only
// that required fields still held SOME value (FR-365) — a changed answer
// value passed every check and transmitted unapproved answers.
// FAIL-FIRST: every mismatch test red until submitDoorstep verifies the
// approval's payload hash against the board's live payload before arming.
// Check: node --test tests/career-portal-payload-binding.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const USER = "user-alex-test";
const NOW = "2026-10-15T12:00:00Z";
const POSTING = {
  id: "JOB-GH-001",
  canonicalKey: "greenhouse:testsystems:software-engineering-intern",
  company: "TEST Systems",
  role: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testsystems/jobs/001",
  status: "open",
  atsFamily: "greenhouse",
};
const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    cover_note: { value: "I am excited to apply to TEST Systems for the intern role.", confirmed: true, draft: true },
  },
};
const ATT = { certify_true: { value: true, explicit: true } };
const newLog = () => ({ records: [] });

function preparedDoorstep(profile = PROFILE) {
  const board = Portal.createSandboxBoard({});
  const armCalls = [];
  board.armForSubmit = (ctx) => { armCalls.push(ctx); return { armed: true }; };
  const session = Portal.createPortalSession({ userId: USER, board });
  const prepared = Portal.runApply(session, {
    posting: POSTING, profile, log: newLog(), now: NOW, attestations: ATT,
  });
  assert.equal(prepared.resultStatus, "prepared");
  return { board, session, prepared, armCalls };
}
const boundApproval = (prepared, over = {}) => Object.assign({
  approvedByUser: true, approvalRef: "owner-batch-binding",
  payloadSha256: prepared.doorstep.payloadSha256,
}, over);

test("MI-116 control: an approval bound to the shown payload, board untouched, submits exactly once", () => {
  const { board, session, prepared } = preparedDoorstep();
  const r = Portal.submitDoorstep(session, boundApproval(prepared), { log: newLog(), now: NOW, posting: POSTING });
  assert.equal(r.resultStatus, "completed");
  assert.equal(board.calls.submit, 1);
  assert.equal(r.submission.payloadSha256, prepared.doorstep.payloadSha256, "the submission record carries the payload hash it fired under");
});

test("MI-116: one answer VALUE changed after approval — APPROVAL_PAYLOAD_MISMATCH, zero clicks, board never armed", () => {
  const { board, session, prepared, armCalls } = preparedDoorstep();
  board.fill("phone", "+1 999 555 0000");
  const r = Portal.submitDoorstep(session, boundApproval(prepared), { log: newLog(), now: NOW, posting: POSTING });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "APPROVAL_PAYLOAD_MISMATCH");
  assert.ok(r.changedFields.includes("phone"), "the stop names the changed field");
  assert.equal(board.calls.submit, 0);
  assert.equal(armCalls.length, 0, "a mismatched payload never arms the board");
});

test("MI-116: a form field GAINS an answer after approval (was unanswered at the doorstep) — mismatch, zero clicks", () => {
  const noPhone = JSON.parse(JSON.stringify(PROFILE));
  delete noPhone.phone;
  const { board, session, prepared, armCalls } = preparedDoorstep(noPhone);
  assert.equal(prepared.doorstep.payload.phone, undefined, "the approved payload carries no phone");
  board.fill("phone", "+1 000 555 0100");
  const r = Portal.submitDoorstep(session, boundApproval(prepared), { log: newLog(), now: NOW, posting: POSTING });
  assert.equal(r.code, "APPROVAL_PAYLOAD_MISMATCH");
  assert.ok(r.addedFields.includes("phone"));
  assert.equal(board.calls.submit, 0);
  assert.equal(armCalls.length, 0);
});

test("MI-116: an approved field's answer is REMOVED after approval — mismatch, zero clicks", () => {
  const { board, session, prepared } = preparedDoorstep();
  board.fill("phone", undefined);
  const r = Portal.submitDoorstep(session, boundApproval(prepared), { log: newLog(), now: NOW, posting: POSTING });
  assert.equal(r.code, "APPROVAL_PAYLOAD_MISMATCH");
  assert.ok(r.removedFields.includes("phone"));
  assert.equal(board.calls.submit, 0);
});

test("MI-116: an approval carrying a FOREIGN payload hash (a different doorstep's) — mismatch, zero clicks", () => {
  const { board, session, prepared } = preparedDoorstep();
  const r = Portal.submitDoorstep(session, boundApproval(prepared, { payloadSha256: "0".repeat(64) }), { log: newLog(), now: NOW, posting: POSTING });
  assert.equal(r.code, "APPROVAL_PAYLOAD_MISMATCH");
  assert.equal(board.calls.submit, 0);
});

test("MI-116: a hashless approval against an existing doorstep no longer fires — the stop names the missing binding", () => {
  const { board, session, prepared } = preparedDoorstep();
  const r = Portal.submitDoorstep(session, { approvedByUser: true, approvalRef: "owner-batch-binding" }, { log: newLog(), now: NOW, posting: POSTING });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "APPROVAL_PAYLOAD_MISMATCH");
  assert.match(r.reason, /does not bind|no payload hash/i);
  assert.equal(board.calls.submit, 0);
  assert.ok(prepared.doorstep.payloadSha256, "the doorstep itself always carries the hash a caller must bind");
});

test("MI-116: the same-run flow still submits — runApply binds the exercised approval to the payload it just built", () => {
  const board = Portal.createSandboxBoard({});
  const session = Portal.createPortalSession({ userId: USER, board });
  const r = Portal.runApply(session, {
    posting: POSTING, profile: PROFILE, log: newLog(), now: NOW, attestations: ATT,
    approval: { approvedByUser: true, approvalRef: "owner-batch-binding" },
  });
  assert.equal(r.resultStatus, "completed");
  assert.equal(board.calls.submit, 1);
  assert.equal(r.submission.payloadSha256, r.doorstep.payloadSha256,
    "the exercised approval fired under the hash of the payload built in its run (the binding)");
});
