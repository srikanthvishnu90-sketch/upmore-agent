// CA-03 real-board browser seam — Spec 2 §6.3 rules proven against the
// Playwright driver (packages/domain/150-career-portal-browser.js) on LOCAL
// fixture pages shaped like real hosted forms. No real portal is opened by
// this suite; live-board doorstep proofs are recorded as ledger evidence
// (docs/career/evidence/portal-doorstep/), not unit tests.
// FAIL-FIRST: written against no module 150 — every test red until the
// driver exists and behaves. Companion suite: tests/career-portal-apply.test.cjs
// (the 149 pipeline over the sandbox board).
// Check: node --test tests/career-portal-browser.test.cjs
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

// ---------- playwright resolution (skip-with-reason if genuinely absent) ----------
function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  // BUG-QA-2026-10-21-04: the helper's third try — the Sporv-clone
  // sibling fallback (scripts/career/portal-browser-helper.cjs). Without
  // it this gate was stricter than the driver it gates and the whole
  // suite silently SKIPPED on machines where the driver resolves fine.
  tries.push(path.join(__dirname, "..", "..", "sporve-agent-clone", "node_modules", "playwright"));
  for (const t of tries) { try { require.resolve(t); return t; } catch (e) { /* next */ } }
  return null;
}
const PW = resolvePlaywright();
const SKIP = PW ? false : "playwright is not resolvable in this environment (set UPMORE_PLAYWRIGHT_PATH)";

// ---------- TEST resume artifact (deterministic bytes, sha-bound) ----------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-portal-browser-test-"));
const RESUME_PATH = path.join(tmpDir, "alex-testcase-resume.txt");
fs.writeFileSync(RESUME_PATH, "TEST RESUME - synthetic fixture, not a real person\n\nAlex Testcase (TEST)\nChicago, IL (TEST) | alex.testcase@example.test\n\nB.S. Computer Science, TEST University, GPA 3.7, graduating May 2028\nSoftware Engineering Intern, TEST Systems Inc\n");
const RESUME_SHA = crypto.createHash("sha256").update(fs.readFileSync(RESUME_PATH)).digest("hex");

const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  country: "United States",
  education: {
    school: "TEST University", degree: "Bachelor's", discipline: "Computer Science",
    start_date: "2024", end_date: "2028", gpa: "3.7", graduation_year: "2028",
  },
  current_company: "TEST Systems Inc",
  resume: { filename: "alex-testcase-resume.txt", sha256: RESUME_SHA },
  answers: {
    work_authorization: { value: "Yes", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
  },
};
const newLog = () => ({ records: [] });

// ---------- local fixture pages (Greenhouse-shaped + captcha shapes) ----------
// The pages live in tests/fixtures/portal-fixture-server.cjs and are served
// by a SEPARATE process: module 150's sync bridge blocks this process's
// event loop (Atomics.wait) while a command is in flight, so an in-process
// fixture server could never answer Chromium and every navigation timed
// out at 45s (BUG-045).
let fixtureProc, base;
before(async () => {
  fixtureProc = spawn(process.execPath, [path.join(__dirname, "fixtures", "portal-fixture-server.cjs")], { stdio: ["ignore", "pipe", "inherit"] });
  base = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("fixture server did not report a port in 15s")), 15000);
    fixtureProc.stdout.on("data", (d) => {
      buf += d;
      const m = buf.match(/FIXTURE_PORT (\d+)/);
      if (m) { clearTimeout(timer); resolve(`http://localhost:${m[1]}`); }
    });
    fixtureProc.on("exit", () => { clearTimeout(timer); reject(new Error("fixture server exited early")); });
  });
});
after(() => { if (fixtureProc) fixtureProc.kill(); if (BrowserBoard.shutdownAll) BrowserBoard.shutdownAll(); });

function browserSession(url, over = {}) {
  const board = BrowserBoard.createBrowserBoard(Object.assign({
    url, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir,
  }, over));
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  return { board, session };
}
const postingFor = (url, key) => ({
  id: "JOB-LOCAL-001", canonicalKey: key || "localhost:test:intern",
  company: "TEST Systems", role: "Software Engineering Intern",
  url, status: "open", atsFamily: null,
});

// ---------- §6.3 host allowlist at the driver itself (defense in depth) ----------
test("§6.3: the driver itself refuses non-allowlisted hosts before any page opens", { skip: SKIP, timeout: 60000 }, () => {
  for (const url of ["https://www.linkedin.com/jobs/view/123", "https://careers.some-random-ats.example/apply/1", "https://evil.example.com/form"]) {
    const board = BrowserBoard.createBrowserBoard({ url, userId: "u1", resumePath: RESUME_PATH });
    assert.throws(() => board.open(), (e) => e.code === "DRIVER_HOST_REFUSED", url);
    assert.equal(board.calls.open, 0, "no navigation happened");
  }
});

// ---------- §6.3 captcha at open: stop + handoff, nothing filled past it ----------
test("§6.3 captcha at open: run stops with CAPTCHA_HANDOFF, zero submits, stop on the step log", { skip: SKIP, timeout: 120000 }, async () => {
  const url = `${base}/captcha-open`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, { posting: postingFor(url), profile: PROFILE, log: newLog() });
    assert.equal(r.resultStatus, "blocked");
    assert.equal(r.code, "CAPTCHA_HANDOFF");
    assert.equal(r.handoffUrl, url, "the user gets the link to finish the last step themselves");
    assert.equal(board.calls.submit, 0);
    assert.ok(r.stepLog.some((s) => s.action === "captcha_stop"));
    // captcha-pack M4: the handoff carries a screenshot_ref to a real PNG of
    // the stopped page — module 120's ticket cannot mint without one.
    assert.ok(typeof r.screenshot_ref === "string" && r.screenshot_ref.endsWith(".png"), "handoff carries screenshot_ref");
    const shot = fs.readFileSync(r.screenshot_ref);
    assert.ok(shot.length > 100 && shot[0] === 0x89 && shot[1] === 0x50 && shot[2] === 0x4e && shot[3] === 0x47, "screenshot_ref points at a real PNG");
  } finally { board.close(); }
});

// ---------- §6.3 captcha at review: fills happen, submit never does ----------
test("§6.3 captcha at review: the run fills, reaches review, stops — CAPTCHA_HANDOFF with zero submits", { skip: SKIP, timeout: 120000 }, async () => {
  const url = `${base}/captcha-review`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, { posting: postingFor(url), profile: PROFILE, log: newLog() });
    assert.equal(r.resultStatus, "blocked");
    assert.equal(r.code, "CAPTCHA_HANDOFF");
    assert.equal(r.handoffUrl, url);
    assert.equal(board.calls.submit, 0, "the submit button behind the challenge was never clicked");
    assert.ok(r.stepLog.some((s) => s.action === "captcha_stop" && s.at === "review"));
    assert.ok(typeof r.screenshot_ref === "string" && r.screenshot_ref.endsWith(".png"), "review-stop handoff carries screenshot_ref");
    const shot = fs.readFileSync(r.screenshot_ref);
    assert.ok(shot.length > 100 && shot[0] === 0x89 && shot[1] === 0x50 && shot[2] === 0x4e && shot[3] === 0x47, "screenshot_ref points at a real PNG");
  } finally { board.close(); }
});

// ---------- §6.3 session isolation at the browser level ----------
test("§6.3 isolation: two browser boards are two contexts — A's fills and storage never appear in B", { skip: SKIP, timeout: 120000 }, async () => {
  const url = `${base}/gh-form`;
  const a = browserSession(url);
  const b = browserSession(url);
  try {
    const ra = Portal.runApply(a.session, { posting: postingFor(url), profile: PROFILE, log: newLog() });
    assert.equal(a.board.answers().full_name, "Alex Testcase (TEST)", "A's page really holds the fill");
    const openedB = b.board.open();
    assert.equal(openedB.ok, true);
    b.board.form();
    const bAnswers = b.board.answers();
    assert.ok(!bAnswers.full_name && !bAnswers.email, "B's fresh context shows none of A's values");
    assert.notEqual(a.board.contextId, b.board.contextId);
    void ra;
  } finally { a.board.close(); b.board.close(); }
});

// ---------- doorstep over the real driver: attestation discipline + payload ----------
test("doorstep: attestation is never auto-answered through the browser driver; with explicit confirmation the run reaches final review and stops", { skip: SKIP, timeout: 180000 }, async () => {
  const url = `${base}/gh-form`;
  // without an explicit attestation: the required certify field is an ASK, nothing submitted
  const s1 = browserSession(url);
  try {
    const r1 = Portal.runApply(s1.session, { posting: postingFor(url), profile: PROFILE, log: newLog() });
    assert.equal(r1.resultStatus, "awaiting_user");
    assert.ok(r1.asks.some((x) => x.field_id === "certify_true" && x.reason === "attestation_requires_explicit_confirmation"));
    assert.equal(s1.board.answers().certify_true, undefined, "the checkbox was never ticked by the driver");
    assert.equal(s1.board.calls.submit, 0);
  } finally { s1.board.close(); }
  // with the user's explicit attestation: doorstep reached, payload exact + hash-bound, still zero submits
  const s2 = browserSession(url);
  try {
    const r2 = Portal.runApply(s2.session, {
      posting: postingFor(url), profile: PROFILE, log: newLog(),
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r2.resultStatus, "prepared");
    assert.equal(r2.doorstep.atFinalReview, true);
    assert.equal(r2.doorstep.payload.full_name, "Alex Testcase (TEST)", "first/last DOM fields recombine into the one logical name");
    assert.equal(r2.doorstep.payload.email, "alex.testcase@example.test");
    assert.equal(r2.doorstep.payload.work_authorization, "Yes");
    assert.equal(r2.doorstep.payload.sponsorship, "No");
    assert.equal(r2.doorstep.payload.resume.sha256, RESUME_SHA, "the uploaded file is the sha-bound resume from the profile");
    const expectSha = crypto.createHash("sha256").update(JSON.stringify(r2.doorstep.payload)).digest("hex");
    assert.equal(r2.doorstep.payloadSha256, expectSha);
    assert.equal(s2.board.calls.submit, 0, "submit was never called");
    // and the driver's own submit leg is unplugged in this build, behind 149's gate
    assert.throws(() => s2.board.submit(), (e) => e.code === "REAL_SUBMIT_DISABLED");
  } finally { s2.board.close(); }
});

// ---------- the resume sha is verified before any upload ----------
test("integrity: a resume file whose bytes do not match the profile sha is refused, never uploaded", { skip: SKIP, timeout: 120000 }, async () => {
  const url = `${base}/gh-form`;
  const badPath = path.join(tmpDir, "other-resume.txt");
  fs.writeFileSync(badPath, "someone else's document (TEST)");
  const { board, session } = browserSession(url, { resumePath: badPath });
  try {
    assert.throws(
      () => Portal.runApply(session, { posting: postingFor(url), profile: PROFILE, log: newLog() }),
      (e) => e.code === "RESUME_SHA_MISMATCH",
      "the fill refuses a file that is not the profile's resume"
    );
    assert.equal(board.calls.submit, 0);
  } finally { board.close(); }
});

// ---------- confirmation capture (owner-approved submit lane, 2026-10-13) ----------
// The armed submit is exercised ONLY against these localhost fixtures.
// A submission counts as success only when the employer's confirmation is
// CAPTURED (page text + ID + screenshot); anything else is unknown-outcome.
test("confirmation capture: an armed submit that lands on a confirmation page returns ID + text + screenshot", { skip: SKIP, timeout: 180000 }, async () => {
  const url = `${base}/gh-confirm`;
  const { board, session } = browserSession(url, { submitArmed: true });
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url), profile: PROFILE, log: newLog(),
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared");
    const done = Portal.submitDoorstep(session, { approvedByUser: true, payloadSha256: r.doorstep.payloadSha256 }); // approval binds the shown payload (MI-116)
    assert.equal(done.resultStatus, "completed");
    assert.equal(done.submission.status, "submitted");
    assert.equal(done.submission.confirmationId, "TEST-APP-12345", "the employer's own application ID, read off the landing page");
    assert.ok(/received/i.test(done.submission.confirmationText || ""), "the landing page text is captured as evidence");
    assert.ok(typeof done.submission.screenshotRef === "string" && done.submission.screenshotRef.endsWith(".png"), "a screenshot of the confirmation page is captured");
    const shot = fs.readFileSync(done.submission.screenshotRef);
    assert.ok(shot.length > 100 && shot[0] === 0x89 && shot[1] === 0x50 && shot[2] === 0x4e && shot[3] === 0x47, "screenshotRef points at a real PNG");
    assert.equal(board.calls.submit, 1, "the submit fired exactly once");
    const again = Portal.submitDoorstep(session, { approvedByUser: true });
    assert.equal(again.code, "ALREADY_SUBMITTED", "a second submit is refused by 149");
    assert.equal(board.calls.submit, 1, "still exactly one click");
  } finally { board.close(); }
});

test("confirmation capture: an ambiguous landing page is unknown_outcome — never success — and reconcile keeps it unknown", { skip: SKIP, timeout: 180000 }, async () => {
  const url = `${base}/gh-ambiguous`;
  const { board, session } = browserSession(url, { submitArmed: true });
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url), profile: PROFILE, log: newLog(),
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared");
    const done = Portal.submitDoorstep(session, { approvedByUser: true, payloadSha256: r.doorstep.payloadSha256 }); // approval binds the shown payload (MI-116)
    assert.equal(done.resultStatus, "unknown_outcome", "no ID and no success wording on the landing page — the outcome is NOT spoken as submitted");
    assert.equal(done.submission.status, "unknown_outcome");
    assert.ok(done.submission.screenshotRef, "the ambiguous landing is still captured for the human");
    const rec = Portal.reconcile(session);
    assert.equal(rec.resultStatus, "unknown_outcome", "an unverifiable board state must not be read as 'not submitted'");
    assert.equal(rec.submission.needsHuman, true);
    assert.equal(session.needsReconcile, true, "the reconcile lock stays on — no retry is cleared against an unreadable board");
  } finally { board.close(); }
});

test("D1 redirect gate: a board page that redirects OFF the allowlist stops the run typed HOST_REDIRECT_REFUSED — nothing filled, nothing submitted", { skip: SKIP, timeout: 180000 }, async () => {
  const url = `${base}/redirect-offlist`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, { posting: postingFor(url), profile: PROFILE, log: newLog(),
      attestations: { certify_true: { value: true, explicit: true } },
      approval: { approvedByUser: true, approvalRef: "owner-batch-001-2026-10-13" } });
    assert.equal(r.resultStatus, "blocked");
    assert.equal(r.code, "HOST_REDIRECT_REFUSED");
    assert.equal(board.calls.fill, 0, "zero fills happened on (or after) the off-list hop");
    assert.equal(board.calls.submit, 0);
    assert.equal(session.doorstep, null, "no doorstep over a refused page");
  } finally { board.close(); }
});

test("D3 arming wire: runApply with an owner approvalRef arms the board and submits exactly once, confirmation captured; without a ref it refuses", { skip: SKIP, timeout: 180000 }, async () => {
  const url = `${base}/gh-confirm`;
  // armed end to end: board created UNARMED; the ref in the run's approval arms it
  const s1 = browserSession(url); // submitArmed NOT set
  try {
    assert.equal(s1.board.submitArmed, false, "the board starts unarmed");
    const r = Portal.runApply(s1.session, {
      posting: postingFor(url, "localhost:test:d3-armed"), profile: PROFILE, log: newLog(),
      attestations: { certify_true: { value: true, explicit: true } },
      approval: { approvedByUser: true, approvalRef: "owner-batch-001-2026-10-13" },
    });
    assert.equal(r.resultStatus, "completed", "armed + approved run transmits on the sandbox board");
    assert.equal(s1.board.calls.submit, 1, "submit fired exactly once");
    assert.equal(r.submission.status, "submitted");
    assert.equal(r.submission.confirmationId, "TEST-APP-12345", "employer confirmation captured into the result");
    assert.ok(/received/i.test(r.submission.confirmationText || ""));
    assert.ok(typeof r.submission.screenshotRef === "string" && r.submission.screenshotRef.endsWith(".png"));
    assert.equal(r.submission.approvalRef, "owner-batch-001-2026-10-13", "the submission names the owner's batch approval it fired under");
    assert.equal(s1.board.submitArmed, true, "the board is armed by the wire, not by construction");
  } finally { s1.board.close(); }
  // unarmed control: approval WITHOUT a ref never transmits
  const s2 = browserSession(url);
  try {
    const r2 = Portal.runApply(s2.session, {
      posting: postingFor(url, "localhost:test:d3-unarmed"), profile: PROFILE, log: newLog(),
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r2.resultStatus, "prepared");
    assert.throws(() => Portal.submitDoorstep(s2.session, { approvedByUser: true, payloadSha256: r2.doorstep.payloadSha256 }), (e) => e.code === "REAL_SUBMIT_DISABLED");
    assert.equal(s2.board.calls.submit, 0, "no click ever fired without the ref");
  } finally { s2.board.close(); }
});

test("D4 through the driver: education + country fields on a real form fill from the profile and land in the payload", { skip: SKIP, timeout: 180000 }, async () => {
  const url = `${base}/gh-form`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url), profile: PROFILE, log: newLog(),
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared");
    assert.equal(r.doorstep.payload.school, "TEST University");
    assert.equal(r.doorstep.payload.degree, "Bachelor's");
    assert.equal(r.doorstep.payload.field_of_study, "Computer Science");
    assert.equal(r.doorstep.payload.gpa, "3.7");
    assert.equal(r.doorstep.payload.graduation_year, "2028");
    assert.equal(r.doorstep.payload.country, "United States");
  } finally { board.close(); }
});

test("D8 EEO decline default: the decline is selected even when the board words it 'Prefer not to answer'", { skip: SKIP, timeout: 180000 }, async () => {
  const url = `${base}/gh-eeo-variant`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url), profile: PROFILE, log: newLog(),
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared");
    assert.equal(r.doorstep.payload.gender, "Prefer not to answer", "the board's own decline-worded option was chosen");
    assert.deepEqual(board.fillFailures.filter((f) => f.field_id === "gender"), [], "no fill failure recorded for the EEO field");
  } finally { board.close(); }
});

test("D9 Lever custom card: the ask record quotes the human card question, not the machine field name", { skip: SKIP, timeout: 180000 }, async () => {
  const url = `${base}/lever-card`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, { posting: postingFor(url), profile: PROFILE, log: newLog() });
    assert.equal(r.resultStatus, "awaiting_user", "the required card question is an ask");
    const cardAsk = (r.formAnalysis || []).find((f) => /relocate/i.test(f.label || ""));
    assert.ok(cardAsk, "form analysis carries the human card label");
    assert.equal(cardAsk.label, "Are you willing to relocate to New York?");
    assert.ok(r.asks.some((a) => a.field_id === cardAsk.field_id), "the ask is recorded under the human-labeled field");
  } finally { board.close(); }
});

test("submit stays unplugged unless armed: 149 approval alone does not enable a browser-board submit", { skip: SKIP, timeout: 180000 }, async () => {
  const url = `${base}/gh-confirm`;
  const { board, session } = browserSession(url); // NOT armed
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url), profile: PROFILE, log: newLog(),
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared");
    assert.throws(() => Portal.submitDoorstep(session, { approvedByUser: true, payloadSha256: r.doorstep.payloadSha256 }), (e) => e.code === "REAL_SUBMIT_DISABLED");
    assert.equal(board.calls.submit, 0, "no click ever fired");
  } finally { board.close(); }
});
