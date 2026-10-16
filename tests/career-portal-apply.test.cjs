// CA-03 sandbox apply — Spec 2 §6.1 pipeline + §6.3 browser rules as code,
// graded against the §11(F) sandbox-apply suite (captcha hand-off,
// timeout -> needs_human, name-mismatch block) plus the doorstep rule:
// drive to the final review screen, snapshot the exact would-submit
// payload, and STOP — a submit fires only on an explicit owner approval,
// exactly once, against a faithful SANDBOX board (local receipt sink,
// labeled TEST). No real portal is opened by this suite, ever.
// FAIL-FIRST: written against no module — every test red until
// packages/domain/149-career-portal-apply.js exists and behaves.
// Check: node --test tests/career-portal-apply.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const USER = "user-alex-test";
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
const newLog = () => ({ records: [] });
function sandboxSession(opts = {}) {
  const board = Portal.createSandboxBoard(opts.board || {});
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const baseRun = (over = {}) => Object.assign({ posting: POSTING, profile: PROFILE, log: newLog() }, over);

// ---------- §6.3 target rules: employer-hosted, tested ATS only ----------
test("§6.3: LinkedIn / Indeed apply targets are refused before any board is touched", () => {
  for (const url of ["https://www.linkedin.com/jobs/view/123", "https://www.indeed.com/viewjob?jk=abc"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, false, url);
    assert.equal(c.code, "AGGREGATOR_APPLY_FORBIDDEN", url);
  }
  const { board, session } = sandboxSession();
  const r = Portal.runApply(session, baseRun({ posting: Object.assign({}, POSTING, { url: "https://www.linkedin.com/jobs/view/123" }) }));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "AGGREGATOR_APPLY_FORBIDDEN");
  assert.equal(board.calls.open, 0, "no page was opened");
});

test("§6.3: untested / unknown ATS hosts are refused — only tested families + registered sandbox boards", () => {
  const c = Portal.classifyTarget("https://careers.some-random-ats.example/apply/1");
  assert.equal(c.allowed, false);
  assert.equal(c.code, "UNTESTED_ATS_HOST");
  assert.equal(Portal.classifyTarget("https://boards.greenhouse.io/acme/jobs/1").allowed, true);
  assert.equal(Portal.classifyTarget("https://jobs.lever.co/acme/1").allowed, true);
  assert.equal(Portal.classifyTarget("https://jobs.ashbyhq.com/acme/1").allowed, true);
});

// ---------- §6.3 session isolation ----------
test("§6.3: a session is bound to one user — another user's run is refused, answers never leak across sessions", () => {
  const a = sandboxSession();
  const b = sandboxSession();
  const r = Portal.runApply(a.session, baseRun({ userId: "user-mallory" }));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "SESSION_USER_MISMATCH");
  Portal.runApply(a.session, baseRun());
  assert.equal(Object.keys(b.board.answers()).length, 0, "session B's board saw none of A's fills");
  assert.notEqual(a.board, b.board);
});

// ---------- §6.1 form analysis + autofill discipline ----------
test("§6.1 step 3/4: fields are categorized; only confirmed facts are filled; unconfirmed + unknown become asks", () => {
  const { board, session } = sandboxSession();
  const profile = JSON.parse(JSON.stringify(PROFILE));
  profile.answers.sponsorship = { value: "No", confirmed: false }; // stored but UNCONFIRMED
  const r = Portal.runApply(session, baseRun({ profile }));
  assert.equal(r.resultStatus, "awaiting_user");
  const askKeys = r.asks.map((a) => a.field_id).sort();
  assert.ok(askKeys.includes("sponsorship"), "unconfirmed screening answer is an ask, never filled");
  assert.equal(board.answers().sponsorship, undefined);
  assert.equal(board.answers().full_name, "Alex Testcase (TEST)");
  const cats = Object.fromEntries(r.formAnalysis.map((f) => [f.field_id, f.category]));
  assert.equal(cats.certify_true, "attestation");
  assert.equal(cats.gender, "eeo");
  assert.equal(cats.work_authorization, "screening");
});

test("§6.1 step 4 hard lines: attestation is never auto-answered without an explicit per-run confirmation; EEO defaults to decline", () => {
  const { board, session } = sandboxSession();
  const r = Portal.runApply(session, baseRun());
  assert.equal(board.answers().certify_true, undefined, "no attestation was entered");
  assert.ok(r.asks.some((a) => a.field_id === "certify_true" && a.reason === "attestation_requires_explicit_confirmation"));
  assert.equal(board.answers().gender, "Decline to self-identify", "EEO default applied and labeled");
  const eeoFill = r.stepLog.find((s) => s.field_id === "gender");
  assert.equal(eeoFill.source, "eeo_default_decline");
  // with an explicit attestation confirmation it IS entered, sourced as such
  const s2 = sandboxSession();
  const r2 = Portal.runApply(s2.session, baseRun({
    attestations: { certify_true: { value: true, explicit: true } },
  }));
  assert.equal(s2.board.answers().certify_true, true);
  assert.equal(r2.stepLog.find((s) => s.field_id === "certify_true").source, "user_explicit_attestation");
});

// ---------- doorstep: stop at final review with the exact payload ----------
test("doorstep: a clean run stops at final review — payload snapshot is exact and hash-bound, zero submits without approval", () => {
  const { board, session } = sandboxSession();
  const r = Portal.runApply(session, baseRun({
    attestations: { certify_true: { value: true, explicit: true } },
  }));
  assert.equal(r.resultStatus, "prepared");
  assert.equal(r.doorstep.atFinalReview, true);
  assert.equal(board.calls.submit, 0, "submit was never called");
  const snap = r.doorstep.payload;
  assert.equal(snap.full_name, "Alex Testcase (TEST)");
  assert.equal(snap.resume_sha256, PROFILE.resume.sha256);
  const expectSha = crypto.createHash("sha256").update(JSON.stringify(snap)).digest("hex");
  assert.equal(r.doorstep.payloadSha256, expectSha, "snapshot hash recomputes from the snapshot itself");
});

// ---------- §11(F): captcha hand-off ----------
test("§11(F) captcha: a challenge stops the run and hands the user the link — never solved, never submitted past", () => {
  const { board, session } = sandboxSession({ board: { captchaAt: "review" } });
  const r = Portal.runApply(session, baseRun({
    attestations: { certify_true: { value: true, explicit: true } },
    approval: { approvedByUser: true },
  }));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, POSTING.url, "the user gets the link to finish the last step themselves");
  assert.equal(board.calls.submit, 0);
  assert.ok(r.stepLog.some((s) => s.action === "captcha_stop"), "the stop is on the step log");
});

// ---------- §11(F): name-mismatch block ----------
test("§11(F) name mismatch: the name on the board account differs from the profile — blocked before any submit", () => {
  const { board, session } = sandboxSession({ board: { accountName: "Jordan Different (TEST)" } });
  const r = Portal.runApply(session, baseRun({
    attestations: { certify_true: { value: true, explicit: true } },
    approval: { approvedByUser: true },
  }));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "NAME_MISMATCH");
  assert.equal(board.calls.submit, 0);
});

// ---------- submit leg: exactly once, only on explicit approval ----------
test("submit leg: with explicit approval the doorstep submits exactly once and captures the confirmation", () => {
  const { board, session } = sandboxSession();
  const r = Portal.runApply(session, baseRun({
    attestations: { certify_true: { value: true, explicit: true } },
    approval: { approvedByUser: true },
  }));
  assert.equal(r.resultStatus, "completed");
  assert.equal(board.calls.submit, 1);
  assert.ok(r.submission.confirmationId, "confirmation id captured as proof");
  assert.equal(r.submission.receiptBoard, "sandbox");
  const again = Portal.submitDoorstep(session, { approvedByUser: true });
  assert.equal(again.resultStatus, "blocked");
  assert.equal(again.code, "ALREADY_SUBMITTED");
  assert.equal(board.calls.submit, 1, "still exactly one submit");
});

// ---------- §11(F) + §8.3: timeout -> needs_human, no blind retry ----------
test("§11(F) timeout: a submit timeout reads unknown_outcome + needs_human; retry is refused until reconcile reads the board", () => {
  const { board, session } = sandboxSession({ board: { submitOutcome: "timeout_receipt" } });
  const r = Portal.runApply(session, baseRun({
    attestations: { certify_true: { value: true, explicit: true } },
    approval: { approvedByUser: true },
  }));
  assert.equal(r.resultStatus, "unknown_outcome");
  assert.equal(r.submission.needsHuman, true);
  const blind = Portal.submitDoorstep(session, { approvedByUser: true });
  assert.equal(blind.resultStatus, "blocked");
  assert.equal(blind.code, "RECONCILE_REQUIRED");
  assert.equal(board.calls.submit, 1, "no blind second submit");
  const rec = Portal.reconcile(session);
  assert.equal(rec.resultStatus, "completed", "the receipt WAS on the board — reconciled truth, not a guess");
  assert.ok(rec.submission.confirmationId);
});

test("§8.3 timeout with no receipt: reconcile says not submitted; only then may a fresh approval retry", () => {
  const { board, session } = sandboxSession({ board: { submitOutcome: "timeout_noreceipt" } });
  Portal.runApply(session, baseRun({
    attestations: { certify_true: { value: true, explicit: true } },
    approval: { approvedByUser: true },
  }));
  const rec = Portal.reconcile(session);
  assert.equal(rec.resultStatus, "unknown_outcome");
  assert.equal(rec.submission.onBoard, false);
  board.setSubmitOutcome("accepted");
  // the fresh approval binds the doorstep payload it retries (MI-116 caller
  // contract) — the retry submits the SAME answers that timed out, proven by hash
  const retry = Portal.submitDoorstep(session, { approvedByUser: true, payloadSha256: session.doorstep.payloadSha256 });
  assert.equal(retry.resultStatus, "completed");
  assert.equal(board.calls.submit, 2, "one timed-out attempt + one reconciled retry");
});

// ---------- §6.1 step 1 + §8.3: eligibility + duplicate ----------
test("§6.1 step 1: a closed posting stops at eligibility; a second application to the same job is a duplicate block", () => {
  const { session } = sandboxSession();
  const closed = Portal.runApply(session, baseRun({ posting: Object.assign({}, POSTING, { status: "closed" }) }));
  assert.equal(closed.resultStatus, "blocked");
  assert.equal(closed.code, "JOB_CLOSED");
  const log = newLog();
  const s2 = sandboxSession();
  Portal.runApply(s2.session, baseRun({ log,
    attestations: { certify_true: { value: true, explicit: true } },
    approval: { approvedByUser: true } }));
  const s3 = sandboxSession();
  const dup = Portal.runApply(s3.session, baseRun({ log,
    attestations: { certify_true: { value: true, explicit: true } },
    approval: { approvedByUser: true } }));
  assert.equal(dup.resultStatus, "blocked");
  assert.equal(dup.code, "DUPLICATE_APPLICATION");
  assert.equal(s3.board.calls.submit, 0);
});

// ---------- §6.4 quality gate ----------
test("§6.4 quality gate: a cover note naming the wrong company blocks the run before the doorstep", () => {
  const { board, session } = sandboxSession();
  const profile = JSON.parse(JSON.stringify(PROFILE));
  profile.answers.cover_note = { value: "I am excited to apply to Globex Corporation for this role.", confirmed: true, draft: true };
  const r = Portal.runApply(session, baseRun({ profile,
    attestations: { certify_true: { value: true, explicit: true } },
    approval: { approvedByUser: true } }));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "QUALITY_GATE");
  assert.equal(board.calls.submit, 0);
});

// ---------- caps are the owner's DECIDED numbers, enforced (MI-110; was report-only) ----------
test("§6.4 caps: the run reports cap state as decided + enforced (MI-110 supersedes the report-only pin)", () => {
  const { session } = sandboxSession();
  const r = Portal.runApply(session, baseRun());
  assert.ok(r.capReport, "cap state is surfaced");
  assert.equal(r.capReport.decisionPending, false);
  assert.equal(r.capReport.enforced, true);
  assert.equal(typeof r.capReport.submittedToday, "number");
});
