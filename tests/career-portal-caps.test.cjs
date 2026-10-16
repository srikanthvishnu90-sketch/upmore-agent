// MI-110 / BUG-233 — the decided application caps (Spec 2 §6.4: 15/day,
// 5/vendor/day, 1/company/30 days; owner-decided, 15/day locked 2026-10-12)
// are ENFORCED by module 149 itself, not merely reported. Before this guard,
// capReport returned decisionPending:true and no code path refused a
// submission over a cap — only lane discipline did.
// FAIL-FIRST: every enforcement test red until 149 enforces.
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

test("MI-110: capReport tells the truth — the caps are decided and enforced, not decision-pending", () => {
  const { session } = sandboxSession();
  const r = Portal.runApply(session, { posting: POSTING, profile: PROFILE, log: logOf([]), now: NOW });
  assert.equal(r.capReport.decisionPending, false);
  assert.equal(r.capReport.enforced, true);
  assert.equal(r.capReport.specDefaults.perDay, 15);
  assert.equal(r.capReport.counts.perVendorPerDay, 0);
});

test("MI-110: the 16th same-day submission is refused by 149 itself — CAP_REACHED naming cap and count, zero board submits", () => {
  const records = Array.from({ length: 15 }, () => submitted());
  const { board, session } = sandboxSession();
  const r = drive(session, { log: logOf(records) });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAP_REACHED");
  assert.equal(r.cap, "perDay");
  assert.equal(r.count, 15);
  assert.equal(r.limit, 15);
  assert.equal(board.calls.submit, 0, "the gate refused before any click");
});

test("MI-110: under the cap the same drive submits — the cap is a gate, not a wall", () => {
  // 14 submissions today, spread across vendors + companies so ONLY the
  // per-day count is near its limit (14 of 15) — no other cap is close.
  const vendors = ["greenhouse", "lever", "ashby", "smartrecruiters"];
  const records = Array.from({ length: 14 }, (_, i) => submitted({ vendor: vendors[i % 4], company: `Other Co ${i}` }));
  const { board, session } = sandboxSession();
  const r = drive(session, { log: logOf(records) });
  assert.equal(r.resultStatus, "completed");
  assert.equal(board.calls.submit, 1);
});

test("MI-110: vendor cap — 5 greenhouse submissions today stop a 6th greenhouse drive; a lever drive the same day proceeds", () => {
  const records = Array.from({ length: 5 }, () => submitted());
  const gh = sandboxSession();
  const rGh = drive(gh.session, { log: logOf(records) });
  assert.equal(rGh.code, "CAP_REACHED");
  assert.equal(rGh.cap, "perVendorPerDay");
  assert.equal(rGh.count, 5);
  assert.equal(rGh.limit, 5);
  assert.equal(gh.board.calls.submit, 0);

  const leverBoard = Portal.createSandboxBoard({});
  leverBoard.atsFamily = "lever";
  const leverSession = Portal.createPortalSession({ userId: USER, board: leverBoard });
  const leverPosting = Object.assign({}, POSTING, {
    canonicalKey: "lever:testsystems:software-engineering-intern",
    url: "https://jobs.lever.co/testsystems/001", atsFamily: "lever",
  });
  const rLv = Portal.runApply(leverSession, {
    posting: leverPosting, profile: PROFILE, log: logOf(records), now: NOW,
    attestations: ATT, approval: { approvedByUser: true, approvalRef: "owner-batch-caps" },
  });
  assert.equal(rLv.resultStatus, "completed", "a different vendor is not stopped by the greenhouse count");
  assert.equal(leverBoard.calls.submit, 1);
});

test("MI-110: company cap — a submission to the same company 10 days ago stops a new drive; 31 days ago does not", () => {
  const recent = [submitted({ company: "TEST Systems", canonicalKey: "greenhouse:testsystems:other-role", timestamp: "2026-10-05T12:00:00Z" })];
  const a = sandboxSession();
  const rA = drive(a.session, { log: logOf(recent) });
  assert.equal(rA.code, "CAP_REACHED");
  assert.equal(rA.cap, "perCompanyPer30Days");
  assert.equal(rA.count, 1);
  assert.equal(a.board.calls.submit, 0);

  const old = [submitted({ company: "TEST Systems", canonicalKey: "greenhouse:testsystems:other-role", timestamp: "2026-09-14T12:00:00Z" })];
  const b = sandboxSession();
  const rB = drive(b.session, { log: logOf(old) });
  assert.equal(rB.resultStatus, "completed", "outside the 30-day window the drive proceeds");
  assert.equal(b.board.calls.submit, 1);
});

test("MI-110: day boundary — 15 submissions yesterday do not stop a drive today", () => {
  const records = Array.from({ length: 15 }, () => submitted({ timestamp: "2026-10-14T23:30:00Z" }));
  const { board, session } = sandboxSession();
  const r = drive(session, { log: logOf(records) });
  assert.equal(r.resultStatus, "completed");
  assert.equal(board.calls.submit, 1);
});

test("MI-110: submitDoorstep re-checks at click time — a ledger filled to the cap after the doorstep refuses before arming", () => {
  const { board, session } = sandboxSession();
  const log = logOf([]);
  const prepared = Portal.runApply(session, {
    posting: POSTING, profile: PROFILE, log, now: NOW, attestations: ATT,
  });
  assert.equal(prepared.resultStatus, "prepared");
  for (let i = 0; i < 15; i += 1) log.records.push(submitted());
  const r = Portal.submitDoorstep(session, {
    approvedByUser: true, approvalRef: "owner-batch-caps",
    payloadSha256: prepared.doorstep.payloadSha256,
  }, { log, now: NOW, posting: POSTING });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAP_REACHED");
  assert.equal(board.calls.submit, 0, "no click happened after the cap filled");
});
