// NO LIMITS (owner, 2026-10-27, D-MS-2 / D-MS-3) — module 149 never refuses a
// submission for volume. The old Spec 2 §6.4 caps (15/day, 5/vendor/day,
// 1/company/30 days; MI-110 / BUG-233) are removed: the 16th, 50th or 100th
// same-day submission, a 6th on one ATS, and a second role at one company all
// submit. The only refusal left is an exact duplicate: the same canonical job
// for the same person (DUPLICATE_APPLICATION at prepare, ALREADY_SUBMITTED at
// click). FAIL-FIRST: on the base (SPEC_CAPS enforced) the volume tests are
// red with CAP_REACHED; each duplicate test stays green on both.
// Check: node --test tests/career-portal-caps.test.cjs
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
const submitted = (over = {}) => Object.assign({
  userId: USER, canonicalKey: `greenhouse:otherco-${Math.random().toString(36).slice(2, 9)}:role`,
  status: "submitted", timestamp: "2026-10-15T08:00:00Z", vendor: "greenhouse", company: "Other Co",
}, over);
const logOf = (records) => ({ records });
function sandboxSession(boardOver = {}) {
  const board = Portal.createSandboxBoard(boardOver);
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const drive = (session, over = {}) => Portal.runApply(session, Object.assign({
  posting: POSTING, profile: PROFILE, log: logOf([]), now: NOW,
  attestations: ATT, approval: { approvedByUser: true, approvalRef: "owner-batch-caps" },
}, over));

test("no limits: capReport reports counts and says nothing is enforced", () => {
  const { session } = sandboxSession();
  const r = Portal.runApply(session, { posting: POSTING, profile: PROFILE, log: logOf([submitted()]), now: NOW });
  assert.equal(r.capReport.decisionPending, false);
  assert.equal(r.capReport.enforced, false);
  assert.equal(r.capReport.limits, null);
  assert.equal(r.capReport.counts.perDay, 1);
  assert.equal(r.capReport.counts.perVendorPerDay, 1);
  assert.equal("remaining" in r.capReport, false, "no remaining-room figure: there is no cap to count down to");
  assert.equal(Portal.SPEC_CAPS, undefined, "the cap table is gone from the module's surface");
  assert.equal(Portal.capCheck, undefined);
});

for (const n of [15, 50, 200]) {
  test(`no limits: ${n} same-day submissions on the same ATS do not stop the next one — it submits once`, () => {
    const records = Array.from({ length: n }, () => submitted());
    const { board, session } = sandboxSession();
    const r = drive(session, { log: logOf(records) });
    assert.equal(r.resultStatus, "completed", JSON.stringify({ code: r.code, reason: r.reason }));
    assert.notEqual(r.code, "CAP_REACHED");
    assert.equal(board.calls.submit, 1);
  });
}

test("no one-per-company rule: a different role at the same company 1 day ago does not stop a new drive", () => {
  const recent = [submitted({ company: "TEST Systems", canonicalKey: "greenhouse:testsystems:other-role", timestamp: "2026-10-14T12:00:00Z" })];
  const { board, session } = sandboxSession();
  const r = drive(session, { log: logOf(recent) });
  assert.equal(r.resultStatus, "completed");
  assert.equal(board.calls.submit, 1);
});

test("exact duplicate still refused: the same canonical job already submitted stops at prepare, zero submits", () => {
  const prior = [submitted({ canonicalKey: POSTING.canonicalKey, company: POSTING.company })];
  const { board, session } = sandboxSession();
  const r = drive(session, { log: logOf(prior) });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "DUPLICATE_APPLICATION");
  assert.equal(board.calls.submit, 0);
});

test("no limits at click time: a ledger that grows past the old cap after the doorstep still submits once", () => {
  const { board, session } = sandboxSession();
  const log = logOf([]);
  const prepared = Portal.runApply(session, {
    posting: POSTING, profile: PROFILE, log, now: NOW, attestations: ATT,
  });
  assert.equal(prepared.resultStatus, "prepared");
  for (let i = 0; i < 60; i += 1) log.records.push(submitted());
  const r = Portal.submitDoorstep(session, {
    approvedByUser: true, approvalRef: "owner-batch-caps",
    payloadSha256: prepared.doorstep.payloadSha256,
  }, { log, now: NOW, posting: POSTING });
  assert.equal(r.resultStatus, "completed", JSON.stringify({ code: r.code, reason: r.reason }));
  assert.equal(board.calls.submit, 1);
  const again = Portal.submitDoorstep(session, {
    approvedByUser: true, approvalRef: "owner-batch-caps",
    payloadSha256: prepared.doorstep.payloadSha256,
  }, { log, now: NOW, posting: POSTING });
  assert.equal(again.resultStatus, "blocked", "a second click on the same doorstep never submits twice");
  assert.equal(board.calls.submit, 1);
});
