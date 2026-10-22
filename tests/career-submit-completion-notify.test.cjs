// Submission-completion notification (owner commission 2026-10-21, item #4):
// when an application submission COMPLETES with the employer's own
// confirmation, the applicant is notified — exactly once, carrying the
// employer's confirmation. Before this build NOTHING in the submission
// path emitted any completion notification (the Gusto flow approved
// 2026-10-19 completed with no notification mechanism at all).
// Invariants under test:
//   (1) an employer-confirmed submission emits exactly ONE completion
//       notification carrying employer name, role, and the confirmation
//       reference/text the employer returned;
//   (2) an unknown outcome or a captcha handoff emits NO completion
//       notification — unknown is never worded as submitted;
//   (3) replaying the same completion (reconcile re-read, resolver
//       re-run, direct re-emit) emits no duplicate — dedupe rides the
//       submissions ledger the submit path already writes;
//   (4) a "submitted" claim with NO employer confirmation attached
//       (no confirmation ID, no confirmation text) never notifies —
//       the BUG-208 lesson: an ID-less claim is not proof;
//   (5) an unwired or throwing delivery sink never breaks the submit
//       itself and never marks the notification as sent.
// Disposable setup only: the module-149 sandbox board (a local test
// sink, labeled SANDBOX/TEST) + stub boards + an in-memory sink.
// No live board, no real send, CAREER_AGENT_SUBMIT untouched.
// Check: node --test tests/career-submit-completion-notify.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const USER = "user-alex-test";
const POSTING = {
  id: "JOB-GH-W4", canonicalKey: "greenhouse:testsystems:w4",
  company: "TEST Systems", role: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testsystems/jobs/w4", status: "open", atsFamily: "greenhouse",
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
const ATTEST = { certify_true: { value: true, explicit: true } };
const newLog = () => ({ records: [] });
const sink = () => { const got = []; return { got, deliver: (n) => { got.push(n); return n; } }; };
function sandboxSession(opts = {}) {
  const board = Portal.createSandboxBoard(opts.board || {});
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const approvedRun = (over = {}) => Object.assign({
  posting: POSTING, profile: PROFILE, log: newLog(),
  attestations: ATTEST, approval: { approvedByUser: true, approvalRef: "owner-batch-001" },
}, over);
const markers = (log) => log.records.filter((r) => r.kind === "submission_completion_notification");

// ---------- (1) confirmed submission -> exactly one notification ----------
test("notify (1): an employer-confirmed submission emits exactly one completion notification carrying the employer's confirmation", () => {
  const { board, session } = sandboxSession();
  const s = sink();
  const log = newLog();
  const r = Portal.runApply(session, approvedRun({ log, notifyDeliver: s.deliver, now: "2026-10-21T23:40:00Z" }));
  assert.equal(r.resultStatus, "completed");
  assert.equal(board.calls.submit, 1);
  assert.equal(s.got.length, 1, "exactly one completion notification is delivered to the sink");
  const n = s.got[0];
  assert.equal(n.kind, "submission_completed");
  assert.equal(n.userId, USER);
  assert.equal(n.canonicalKey, POSTING.canonicalKey);
  assert.equal(n.company, "TEST Systems", "employer name carried");
  assert.equal(n.role, "Software Engineering Intern", "role carried");
  assert.equal(n.confirmationId, r.submission.confirmationId, "the employer's own confirmation ID is carried verbatim");
  assert.equal(n.confirmationId, "SBX-0001");
  assert.match(n.message, /TEST Systems/);
  assert.match(n.message, /SBX-0001/, "the message quotes the employer's confirmation reference");
  assert.equal(markers(log).length, 1, "the delivery is marked once in the submissions ledger (the dedupe record)");
});

// ---------- (2a) unknown outcome -> NO completion notification ----------
test("notify (2): a submit timeout (unknown outcome) emits NO completion notification — unknown is never worded as submitted", () => {
  const { session } = sandboxSession({ board: { submitOutcome: "timeout_noreceipt" } });
  const s = sink();
  const log = newLog();
  const r = Portal.runApply(session, approvedRun({ log, notifyDeliver: s.deliver }));
  assert.equal(r.resultStatus, "unknown_outcome");
  assert.equal(s.got.length, 0, "no completion notification for an unknown outcome");
  assert.equal(markers(log).length, 0);
  const rec = Portal.reconcile(session, { log, notifyDeliver: s.deliver });
  assert.equal(rec.submission.onBoard, false, "the board holds no submission — nothing landed");
  assert.equal(s.got.length, 0, "reconcile confirming absence still emits nothing");
});

// ---------- (2b) captcha handoff -> NO completion notification ----------
test("notify (2): a captcha handoff emits NO completion notification", () => {
  const { board, session } = sandboxSession({ board: { captchaAt: "review" } });
  const s = sink();
  const log = newLog();
  const r = Portal.runApply(session, approvedRun({ log, notifyDeliver: s.deliver }));
  assert.notEqual(r.resultStatus, "completed");
  assert.equal(board.calls.submit, 0, "the captcha stopped the run before any submit");
  assert.equal(s.got.length, 0, "no completion notification on a captcha handoff");
  assert.equal(markers(log).length, 0);
});

// ---------- (3) replay / second completion path -> no duplicate ----------
test("notify (3): reconcile confirming a timed-out submit notifies once; replays across every completion path emit no duplicate", () => {
  const { session } = sandboxSession({ board: { submitOutcome: "timeout_receipt" } });
  const s = sink();
  const log = newLog();
  const r = Portal.runApply(session, approvedRun({ log, notifyDeliver: s.deliver }));
  assert.equal(r.resultStatus, "unknown_outcome", "the click timed out — outcome unknown at click time");
  assert.equal(s.got.length, 0, "nothing notified while the outcome was unknown");
  const rec = Portal.reconcile(session, { log, notifyDeliver: s.deliver, posting: POSTING, now: "2026-10-22T00:05:00Z" });
  assert.equal(rec.resultStatus, "completed", "the receipt WAS on the board");
  assert.equal(s.got.length, 1, "the reconcile-confirmed completion notifies exactly once");
  assert.equal(s.got[0].confirmationId, "SBX-0001");
  // replay: reconcile re-reads the same board state
  const rec2 = Portal.reconcile(session, { log, notifyDeliver: s.deliver, posting: POSTING });
  assert.equal(rec2.resultStatus, "completed");
  assert.equal(s.got.length, 1, "a reconcile replay emits no duplicate");
  // replay: the unknown-outcome resolver confirms the same application
  const recs = [{ appId: "app-1", canonicalKey: POSTING.canonicalKey, userId: USER, company: "TEST Systems",
    status: "unknown_outcome", timestamp: "2026-10-20T00:00:00Z" }];
  const rep = Portal.resolveUnknownOutcomes({ records: recs, now: "2026-10-22T00:10:00Z",
    readers: () => ({ state: "submitted", confirmationId: "SBX-0001" }), notifyDeliver: s.deliver, notifyLedger: log });
  assert.equal(rep.resolved.length, 1, "the resolver still resolves the record");
  assert.equal(s.got.length, 1, "the resolver path emits no duplicate for an already-notified application");
  // replay: direct re-emit of the same completion event
  const again = Portal.emitCompletionNotification({ deliver: s.deliver, ledger: log }, {
    status: "submitted", userId: USER, canonicalKey: POSTING.canonicalKey, company: "TEST Systems",
    role: "Software Engineering Intern", confirmationId: "SBX-0001" });
  assert.equal(again.notified, false);
  assert.equal(again.reason, "already_notified");
  assert.equal(s.got.length, 1, "still exactly one notification in total");
  assert.equal(markers(log).length, 1);
});

// ---------- resolver-first confirmation also notifies (once) ----------
test("notify (3b): an unknown record the resolver confirms with the employer's confirmation ID notifies exactly once, carrying it", () => {
  const s = sink();
  const log = newLog();
  const recs = [{ appId: "app-9", canonicalKey: "lever:acme:fdse", userId: USER, company: "Acme Corp",
    title: "Forward Deployed Software Engineer Intern", status: "unknown_outcome", timestamp: "2026-10-19T00:00:00Z" }];
  const input = { records: recs, now: "2026-10-22T01:00:00Z", notifyDeliver: s.deliver, notifyLedger: log,
    readers: () => ({ state: "submitted", confirmationId: "EXT-99", confirmationText: "Application received — Acme Corp" }) };
  const rep = Portal.resolveUnknownOutcomes(input);
  assert.equal(rep.resolved.length, 1);
  assert.equal(recs[0].status, "submitted");
  assert.equal(s.got.length, 1, "the resolver-confirmed completion notifies");
  assert.equal(s.got[0].confirmationId, "EXT-99");
  assert.equal(s.got[0].confirmationText, "Application received — Acme Corp", "the employer's confirmation text is carried verbatim");
  assert.equal(s.got[0].company, "Acme Corp");
  const rep2 = Portal.resolveUnknownOutcomes(input);
  assert.equal(rep2.resolved.length, 0, "an already-resolved record is not re-resolved");
  assert.equal(s.got.length, 1, "and never re-notified");
});

// ---------- (4) submitted claim with NO employer confirmation -> no notify ----------
test("notify (4): a board 'accepted' with no confirmation ID and no confirmation text never notifies (BUG-208: an ID-less claim is not proof)", () => {
  const calls = { submit: 0 };
  const filled = {};
  const board = {
    kind: "sandbox", sandbox: true, atsFamily: "greenhouse", host: "sandbox.greenhouse-like.test", calls,
    accountName: "Alex Testcase (TEST)",
    open() { return { ok: true, captcha: null }; },
    form() { return { fields: Portal.SANDBOX_FIELDS.map((f) => Object.assign({}, f)), captchaAt: null }; },
    fill(id, v) { filled[id] = v; return v; },
    answers() { return Object.assign({}, filled); },
    atReview() { return { ok: true, captcha: null }; },
    submit() { calls.submit += 1; return { outcome: "accepted" }; }, // accepted, but NO confirmation of any kind
    submissionState() { return { submitted: false, confirmationId: null }; },
  };
  const session = Portal.createPortalSession({ userId: USER, board });
  const s = sink();
  const log = newLog();
  const r = Portal.runApply(session, approvedRun({ log, notifyDeliver: s.deliver }));
  assert.equal(r.resultStatus, "completed", "149's existing accept behavior is unchanged");
  assert.equal(s.got.length, 0, "no employer confirmation attached -> no completion notification");
  assert.equal(markers(log).length, 0);
  const direct = Portal.emitCompletionNotification({ deliver: s.deliver, ledger: log },
    { status: "submitted", userId: USER, canonicalKey: POSTING.canonicalKey, company: "TEST Systems" });
  assert.equal(direct.notified, false);
  assert.equal(direct.reason, "no_employer_confirmation");
  const unknownEvt = Portal.emitCompletionNotification({ deliver: s.deliver, ledger: log },
    { status: "unknown_outcome", userId: USER, canonicalKey: POSTING.canonicalKey, confirmationId: "SBX-0001" });
  assert.equal(unknownEvt.notified, false);
  assert.equal(unknownEvt.reason, "not_confirmed_submitted", "even WITH a stray ID, a non-submitted status never notifies as completed");
  assert.equal(s.got.length, 0);
});

// ---------- (5) unwired / throwing sink never breaks the submit ----------
test("notify (5): no sink wired -> the submit completes exactly as before; a throwing sink never fails the submit and never marks delivery", () => {
  const a = sandboxSession();
  const r1 = Portal.runApply(a.session, approvedRun({}));
  assert.equal(r1.resultStatus, "completed", "unwired callers see zero behavior change");
  const b = sandboxSession({ board: { submitOutcome: "timeout_receipt" } });
  const log = newLog();
  const r2 = Portal.runApply(b.session, approvedRun({ log, notifyDeliver: () => { throw new Error("sink down"); } }));
  assert.equal(r2.resultStatus, "unknown_outcome");
  const rec = Portal.reconcile(b.session, { log, notifyDeliver: () => { throw new Error("sink down"); }, posting: POSTING });
  assert.equal(rec.resultStatus, "completed", "the completion itself is unaffected by a dead sink");
  assert.equal(markers(log).length, 0, "a failed delivery is never marked as notified");
  const s = sink();
  const rec2 = Portal.reconcile(b.session, { log, notifyDeliver: s.deliver, posting: POSTING });
  assert.equal(rec2.resultStatus, "completed");
  assert.equal(s.got.length, 1, "a later completion path with a healthy sink still delivers — exactly once in total");
});
