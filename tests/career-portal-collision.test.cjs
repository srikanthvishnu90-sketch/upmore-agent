// MI-108 / G3 — the pre-submit collision check: the never-twice rule
// (§8.3) previously saw only module 149's own submissions ledger, so an
// application the user filed BY HAND was invisible to it — the product
// could apply to the same canonical job, and the employer's duplicate
// handling would merge or flag the pair. The host now passes what it
// knows (tracker rows from module 126, user statements) as
// manualApplications, and 149 stops ALREADY_APPLIED_BY_USER naming the
// source of the knowledge — at the doorstep surface AND at click time.
// FAIL-FIRST: every collision test red until 149 checks.
// Check: node --test tests/career-portal-collision.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const USER = "user-alex-test";
const NOW = "2026-10-16T12:00:00Z";
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
const logOf = (records) => ({ records });
function sandboxSession(boardOver = {}) {
  const board = Portal.createSandboxBoard(boardOver);
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const drive = (session, over = {}) => Portal.runApply(session, Object.assign({
  posting: POSTING, profile: PROFILE, log: logOf([]), now: NOW,
  attestations: ATT, approval: { approvedByUser: true, approvalRef: "owner-batch-collision" },
}, over));

const manualRow = (over = {}) => Object.assign({
  company: "TEST Systems", title: "Software Engineering Intern",
  stage: "applied", source: "user-reported", at: "2026-10-10T09:00:00Z",
}, over);

test("MI-108: a tracker row (user-reported) for the same canonical job stops the run — ALREADY_APPLIED_BY_USER naming the source, zero board submits", () => {
  const { board, session } = sandboxSession();
  const r = drive(session, { manualApplications: [manualRow({ canonicalKey: POSTING.canonicalKey })] });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "ALREADY_APPLIED_BY_USER");
  assert.match(r.source || "", /tracker/i, "the stop names where the knowledge came from");
  assert.equal(r.company, "TEST Systems");
  assert.equal(board.calls.submit, 0, "the duplicate never reaches the board");
});

test("MI-108: a user statement matches on company + title without a canonical key — source named as the user's statement", () => {
  const { board, session } = sandboxSession();
  const r = drive(session, {
    manualApplications: [manualRow({ source: "user-statement", canonicalKey: undefined, title: "Software Engineering Intern (Summer)" })],
  });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "ALREADY_APPLIED_BY_USER");
  assert.match(r.source || "", /statement/i);
  assert.equal(board.calls.submit, 0);
});

test("MI-108: a hand-filed application to a DIFFERENT role at the same company does not stop the run", () => {
  const { board, session } = sandboxSession();
  const r = drive(session, { manualApplications: [manualRow({ title: "Product Management Intern", canonicalKey: "greenhouse:testsystems:product-management-intern" })] });
  assert.equal(r.resultStatus, "completed");
  assert.equal(board.calls.submit, 1);
});

test("MI-108: a tracker row that is only saved/interested (no application exists) does not stop the run", () => {
  const { board, session } = sandboxSession();
  const r = drive(session, { manualApplications: [manualRow({ stage: "saved" }), manualRow({ stage: "interested", title: "Software Engineering Intern" })] });
  assert.equal(r.resultStatus, "completed");
  assert.equal(board.calls.submit, 1);
});

test("MI-108: a product-origin record passed in the manual list is not a collision — that is the caps' domain, not this check's", () => {
  const { board, session } = sandboxSession();
  const r = drive(session, { manualApplications: [manualRow({ source: "product", canonicalKey: POSTING.canonicalKey })] });
  assert.equal(r.resultStatus, "completed");
  assert.equal(board.calls.submit, 1);
});

test("MI-108: no manualApplications supplied — the check is silent and the drive is unaffected", () => {
  const { board, session } = sandboxSession();
  const r = drive(session, {});
  assert.equal(r.resultStatus, "completed");
  assert.equal(board.calls.submit, 1);
});

test("MI-108: submitDoorstep re-checks at click time — a manual application learned after the doorstep refuses before arming", () => {
  const { board, session } = sandboxSession();
  const log = logOf([]);
  const prepared = Portal.runApply(session, {
    posting: POSTING, profile: PROFILE, log, now: NOW, attestations: ATT,
  });
  assert.equal(prepared.resultStatus, "prepared");
  const r = Portal.submitDoorstep(session, {
    approvedByUser: true, approvalRef: "owner-batch-collision",
    payloadSha256: prepared.doorstep.payloadSha256,
  }, { log, now: NOW, posting: POSTING, manualApplications: [manualRow({ canonicalKey: POSTING.canonicalKey })] });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "ALREADY_APPLIED_BY_USER");
  assert.equal(board.calls.submit, 0, "no click happened once the hand-filed application was known");
});
