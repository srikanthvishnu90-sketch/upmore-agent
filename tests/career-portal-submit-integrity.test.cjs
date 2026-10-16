// Submit-path integrity guards — the 2026-10-15 owner submit run defects
// (submissions-lane D11/D12/D13; repo BUG-207/208/209; forbidden rules
// FR-364/365/366). Written fail-first against the live evidence:
//   D11 (BUG-207): driver fills reported successful did not persist to
//     readback on the live Greenhouse board (Arc kept 3/17 values;
//     Labelbox 8/8 in one session, 2/8 in the next) — board remount
//     cycles replace filled DOM nodes. Enforcement: fill-then-readback
//     PER FIELD inside the driver, retry on remount; a fill is only
//     "successful" when the value verifiably persists.
//   D12 (BUG-208): the confirmation extractor minted confirmationId
//     "security" from the posting's own prose and module 149 recorded
//     SUBMITTED when nothing was transmitted. Enforcement:
//     labeled-confirmation-context-only extraction + a still-open-form
//     veto; posting prose, headers and unrelated IDs never mint one.
//   D13 (BUG-209): 149's submit gate fired on any non-empty readback —
//     phone+resume surviving made hollow forms "non-empty" and it
//     clicked. Enforcement: the gate requires a readback value for
//     EVERY required field, else a typed INCOMPLETE_PAYLOAD stop —
//     never a doorstep, never a click.
// Unit tier mirrors tests/career-portal-submit-path.test.cjs (stub
// boards); browser tier drives the remounting-form fixtures in
// tests/fixtures/portal-fixture-server.cjs.
// Check: node --test tests/career-portal-submit-integrity.test.cjs
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

const POSTING = {
  id: "JOB-GH-SI", canonicalKey: "greenhouse:testsystems:si",
  company: "TEST Systems", role: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testsystems/jobs/si", status: "open", atsFamily: "greenhouse",
};
const PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test",
  phone: "+1 000 555 0100", location: "Chicago, IL", country: "United States",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {},
};
const FIELDS = [
  { field_id: "full_name", label: "Full name", kind: "standard", profile_key: "name", required: true },
  { field_id: "email", label: "Email", kind: "standard", profile_key: "email", required: true },
  { field_id: "phone", label: "Phone", kind: "standard", profile_key: "phone", required: false },
  { field_id: "resume", label: "Resume", kind: "standard", profile_key: "resume", required: true },
];

// A stub board whose fill() ACCEPTS every value (reports success) but
// whose readback "loses" the fields named in lostFields — the exact
// D11/D13 live shape: fills fine, readback hollow, gate must not click.
function lossyBoard(lostFields) {
  const calls = { open: 0, form: 0, fill: 0, atReview: 0, submit: 0 };
  const held = {};
  const board = {
    kind: "browser", sandbox: false, browserDriver: true,
    atsFamily: "greenhouse", host: "boards.greenhouse.io", calls,
    open() { calls.open += 1; return { ok: true, captcha: null }; },
    form() { calls.form += 1; return { fields: FIELDS.map((f) => Object.assign({}, f)), captchaAt: null }; },
    fill(id, v) { calls.fill += 1; held[id] = v; return v; },
    answers() { const out = {}; for (const [k, v] of Object.entries(held)) if (!lostFields.includes(k)) out[k] = v; return out; },
    atReview() { calls.atReview += 1; return { ok: true, captcha: null }; },
    armForSubmit() { return { armed: true }; },
    submit() { calls.submit += 1; return { outcome: "accepted", confirmationId: "STUB-9" }; },
    submissionState() { return { submitted: false, confirmationId: null }; },
  };
  return board;
}
const runWith = (board, over = {}) => {
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  const r = Portal.runApply(session, Object.assign({ posting: POSTING, profile: PROFILE, log: { records: [] } }, over));
  return { r, session };
};

// ---------- D13 (BUG-209): the gate requires EVERY required field ----------
test("D13 (BUG-209): a required field lost between fill and readback stops the run INCOMPLETE_PAYLOAD — no doorstep, no click, even fully approved", () => {
  const board = lossyBoard(["email"]); // phone + resume survive: payload is non-empty — the exact live trap
  const { r, session } = runWith(board, { approval: { approvedByUser: true, approvalRef: "owner-batch-001" } });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "INCOMPLETE_PAYLOAD");
  assert.ok((r.missing || []).some((m) => (m.field_id || m) === "email"), "the stop names the missing required field");
  assert.equal(session.doorstep, null, "no doorstep is recorded over a hollow payload");
  assert.equal(board.calls.submit, 0, "the submit control was never clicked");
});

test("D13 (BUG-209): a required field that reads back whitespace-only is missing — INCOMPLETE_PAYLOAD", () => {
  const board = lossyBoard([]);
  const realAnswers = board.answers.bind(board);
  board.answers = () => Object.assign(realAnswers(), { email: "   " });
  const { r } = runWith(board, { approval: { approvedByUser: true, approvalRef: "owner-batch-001" } });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "INCOMPLETE_PAYLOAD");
  assert.equal(board.calls.submit, 0);
});

test("D11 doorstep repair (BUG-207): a value lost AFTER its verified fill (delayed board reset — the live Labelbox shape) is re-filled from the doorstep readback and the run completes", () => {
  // The board holds every fill — except that the FIRST readback after
  // the fills reports email lost (a reset that landed after email's own
  // verification). A re-fill restores it; later readbacks are truthful.
  const calls = { submit: 0 };
  const held = {};
  let firstReadbackDone = false;
  let emailRefilled = false;
  const board = {
    kind: "browser", sandbox: false, browserDriver: true,
    atsFamily: "greenhouse", host: "boards.greenhouse.io", calls: { open: 0, form: 0, fill: 0, atReview: 0, submit: 0 },
    open() { return { ok: true, captcha: null }; },
    form() { return { fields: FIELDS.map((f) => Object.assign({}, f)), captchaAt: null }; },
    fill(id, v) { this.calls.fill += 1; held[id] = v; if (id === "email" && firstReadbackDone) emailRefilled = true; return v; },
    answers() {
      const out = Object.assign({}, held);
      if (!firstReadbackDone) { firstReadbackDone = true; delete out.email; }
      else if (!emailRefilled) { delete out.email; }
      return out;
    },
    atReview() { return { ok: true, captcha: null }; },
    armForSubmit() { return { armed: true }; },
    submit() { this.calls.submit += 1; return { outcome: "accepted", confirmationId: "STUB-9" }; },
    submissionState() { return { submitted: false, confirmationId: null }; },
  };
  const { r } = runWith(board, { approval: { approvedByUser: true, approvalRef: "owner-batch-001" } });
  assert.equal(r.resultStatus, "completed", "the doorstep repair recovered the late-lost value instead of stopping");
  assert.equal(board.calls.submit, 1);
  assert.ok((r.stepLog || []).some((s) => s.action === "doorstep_repair"), "the repair is on the step log, not silent");
});

test("D13 control (BUG-209): a complete readback still reaches the doorstep and submits exactly once under approval", () => {
  const board = lossyBoard([]);
  const { r } = runWith(board, { approval: { approvedByUser: true, approvalRef: "owner-batch-001" } });
  assert.equal(r.resultStatus, "completed");
  assert.equal(r.submission.status, "submitted");
  assert.equal(board.calls.submit, 1);
});

test("D13 (BUG-209): submitDoorstep itself re-verifies the doorstep payload — a payload missing a required field is refused at the gate, never armed, never clicked", () => {
  const board = lossyBoard([]);
  const { r, session } = runWith(board);
  assert.equal(r.resultStatus, "prepared");
  delete session.doorstep.payload.email; // the payload hollowed after preparation
  // MI-116 caller contract: an external submit approval binds the exact
  // payload it approves — here the (hollowed) payload itself, so the
  // completeness gate below is the refusal under test, not the binding.
  const hollowedHash = require("node:crypto").createHash("sha256").update(JSON.stringify(session.doorstep.payload)).digest("hex");
  const out = Portal.submitDoorstep(session, { approvedByUser: true, approvalRef: "owner-batch-001", payloadSha256: hollowedHash }, { log: { records: [] } });
  assert.equal(out.resultStatus, "blocked");
  assert.equal(out.code, "INCOMPLETE_PAYLOAD");
  assert.equal(board.calls.submit, 0);
});

// ---------- D12 (BUG-208): labeled confirmation contexts only ----------
test("D12 (BUG-208): extractConfirmation is exported and mints NOTHING from posting prose, headers, or unrelated IDs", () => {
  assert.equal(typeof BrowserBoard.extractConfirmation, "function", "150 exports the confirmation extractor");
  const ex = BrowserBoard.extractConfirmation;
  const postingProse = [
    "Cyber Security Intern — Job ID: 5442881008 — Requisition ID: R-2026-118",
    "Our application security team reviews every submission for tracking quality.",
    "This role works on application security tooling and reference architectures.",
    "The application process includes a tracking exercise. Reference our values page.",
    "Confirmation of receipt is not guaranteed for every application submission.",
  ].join("\n");
  const r = ex(postingProse);
  assert.equal(r.confirmationId, null, "no token from prose ever becomes a confirmation ID");
  assert.equal(r.successText, false);
});

test("D12 (BUG-208): the exact Labelbox mint — the word after 'application' — is refused; a bare unlabeled number is refused; a digit-less token is refused", () => {
  const ex = BrowserBoard.extractConfirmation;
  assert.equal(ex("application security").confirmationId, null);
  assert.equal(ex("your application 88412093 was noted").confirmationId, null, "no label word + separator, no ID");
  assert.equal(ex("Application ID: RECEIVED").confirmationId, null, "a prose word is not an ID even behind a label");
});

test("D12 (BUG-208): genuinely labeled confirmations still extract — the fix refuses prose, not evidence", () => {
  const ex = BrowserBoard.extractConfirmation;
  assert.equal(ex("Thank you for applying. Application ID: TEST-APP-12345").confirmationId, "TEST-APP-12345");
  assert.equal(ex("Confirmation # ZX-2026-0042").confirmationId, "ZX-2026-0042");
  assert.equal(ex("Reference number: 88412093").confirmationId, "88412093");
  const s = ex("Your application has been received.");
  assert.equal(s.confirmationId, null);
  assert.equal(s.successText, true, "unambiguous employer success wording still counts on its own axis");
});

test("D12 (BUG-208): a still-open form vetoes EVERYTHING — labeled IDs and success wording on a page still showing the unsubmitted form mint nothing", () => {
  const ex = BrowserBoard.extractConfirmation;
  const page = "Application ID: TEST-APP-12345 — Thank you for applying — your application has been received.";
  const r = ex(page, { formStillOpen: true });
  assert.equal(r.confirmationId, null);
  assert.equal(r.successText, false);
});

// ---------- browser tier: D11 remount replay + D13/D12 end to end ----------
function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  tries.push(path.join(root, "..", "sporve-agent-clone", "node_modules", "playwright"));
  for (const t of tries) { try { require.resolve(t); return t; } catch (e) { /* next */ } }
  return null;
}
const PW = resolvePlaywright();
const SKIP = PW ? false : "playwright is not resolvable in this environment (set UPMORE_PLAYWRIGHT_PATH)";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-portal-integrity-test-"));
const RESUME_PATH = path.join(tmpDir, "alex-testcase-resume.txt");
fs.writeFileSync(RESUME_PATH, "TEST RESUME - synthetic fixture, not a real person\n\nAlex Testcase (TEST)\n");
const RESUME_SHA = crypto.createHash("sha256").update(fs.readFileSync(RESUME_PATH)).digest("hex");
const BROWSER_PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test",
  phone: "+1 000 555 0100", location: "Chicago, IL", country: "United States",
  resume: { filename: "alex-testcase-resume.txt", sha256: RESUME_SHA },
  answers: {
    work_authorization: { value: "Yes", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
  },
};
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
  id: "JOB-LOCAL-SI", canonicalKey: key || "localhost:test:integrity",
  company: "TEST Systems", role: "Software Engineering Intern",
  url, status: "open", atsFamily: null,
});

test("D11 (BUG-207): on a form that remounts every field after its first fill, verified per-field fill persists — the doorstep payload is complete", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-remount`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url), profile: BROWSER_PROFILE, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared", "the run reaches the doorstep over the remounting form");
    assert.equal(r.doorstep.payload.full_name, "Alex Testcase (TEST)");
    assert.equal(r.doorstep.payload.email, "alex.testcase@example.test");
    assert.equal(r.doorstep.payload.work_authorization, "Yes");
    assert.equal(r.doorstep.payload.sponsorship, "No");
    assert.equal(r.doorstep.payload.resume.sha256, RESUME_SHA, "the uploaded resume survived the remount cycle too");
    assert.deepEqual(board.fillFailures, [], "no fill was left unverified or failed");
    assert.equal(board.calls.submit, 0);
  } finally { board.close(); }
});

test("D11 delayed-reset end-to-end (BUG-207): a board-wide reset after the resume upload wipes the early fields — the doorstep repair restores them and the payload is complete", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-remount-late`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url, "localhost:test:remount-late"), profile: BROWSER_PROFILE, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared", "the repair recovered the wiped fields — the run reaches the doorstep");
    assert.equal(r.doorstep.payload.full_name, "Alex Testcase (TEST)");
    assert.equal(r.doorstep.payload.email, "alex.testcase@example.test");
    assert.equal(r.doorstep.payload.work_authorization, "Yes");
    assert.equal(r.doorstep.payload.resume.sha256, RESUME_SHA);
    assert.ok((r.stepLog || []).some((s) => s.action === "doorstep_repair"), "the repair is on the step log");
    assert.equal(board.calls.submit, 0);
  } finally { board.close(); }
});

test("D11 typeahead (BUG-207): a location widget that clears unpicked free text is filled by picking its own suggestion — the canonical place text persists to the doorstep", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-typeahead`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url, "localhost:test:typeahead"), profile: BROWSER_PROFILE, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared");
    assert.equal(r.doorstep.payload.candidate_location, "Chicago, IL, United States", "the widget's canonical text for the profile's city is what persists — free text would have been cleared");
    assert.equal(r.doorstep.payload.country, "United States", "the Country widget (same react-select shape) is picked the same way — the drive keys off the widget, not the field's meaning");
    assert.equal(board.calls.submit, 0);
  } finally { board.close(); }
});

test("D11 addendum (BUG-207): a resume input that vanishes after discovery ends the run at the gate — the fill reports it, the run does not die", { skip: SKIP, timeout: 240000 }, async () => {
  // Live shape (2026-10-15, four consecutive queue runs): the boards'
  // file inputs mount/unmount with widget state; the fill's raw
  // setInputFiles timeout THREW and the whole run died as driver_error
  // after every other field had filled. The fill must report the
  // missing input as a fill failure, and module 149's completeness
  // gate must stop the run honestly — INCOMPLETE_PAYLOAD, no click.
  const url = `${base}/gh-file-vanish`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url), profile: BROWSER_PROFILE, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
      approvalRef: "integrity-test-approval",
    });
    assert.equal(r.resultStatus, "blocked");
    assert.equal(r.code, "INCOMPLETE_PAYLOAD");
    assert.ok((r.missing || []).some((m) => m.field_id === "resume"), "the vanished resume is named as the missing required field");
    assert.ok(board.fillFailures.some((f) => f.field_id === "resume" && f.reason === "file_input_not_mounted"), "the fill failure names the mechanism");
    assert.equal(board.calls.submit, 0, "no click was fired");
  } finally { board.close(); }
});

test("D11 addendum (BUG-207): a resume input remounted under a fresh id after discovery is re-discovered at fill time and the upload lands", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-file-remount`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url), profile: BROWSER_PROFILE, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared", "the run completes over the remounted file input");
    assert.equal(r.doorstep.payload.resume.sha256, RESUME_SHA, "the resume attached through the re-discovered input");
    assert.deepEqual(board.fillFailures, [], "no fill failed");
    assert.equal(board.calls.submit, 0);
  } finally { board.close(); }
});

test("D13 end-to-end (BUG-209): on a form whose fills can NEVER persist, an approved run stops INCOMPLETE_PAYLOAD and the submit control is never clicked", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-remount-forever`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url, "localhost:test:integrity-forever"), profile: BROWSER_PROFILE, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
      approval: { approvedByUser: true, approvalRef: "owner-batch-001" },
    });
    assert.equal(r.resultStatus, "blocked");
    assert.equal(r.code, "INCOMPLETE_PAYLOAD");
    assert.equal(session.doorstep, null);
    assert.equal(board.calls.submit, 0, "zero clicks over a payload that could not persist");
  } finally { board.close(); }
});

test("D12 end-to-end (BUG-208): an armed submit landing on the still-open form (the Labelbox shape) is unknown_outcome — the prose token 'security' mints no SUBMITTED", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-false-confirm`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url, "localhost:test:false-confirm"), profile: BROWSER_PROFILE, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared");
    // MI-116 caller contract: the external approval carries the hash of
    // the exact doorstep payload prepared above (session.doorstep.payloadSha256).
    const done = Portal.submitDoorstep(session, { approvedByUser: true, approvalRef: "owner-batch-001", payloadSha256: session.doorstep.payloadSha256 }, { log: { records: [] } });
    assert.equal(done.resultStatus, "unknown_outcome", "the still-open form can never be spoken as submitted");
    assert.notEqual(done.submission && done.submission.status, "submitted");
    assert.ok(!done.submission.confirmationId, "no confirmation ID was minted from the still-open form");
    assert.equal(board.calls.submit, 1, "the one armed click fired — the verdict, not the click, was the defect");
  } finally { board.close(); }
});

// ---------- D14 (BUG-237 / FR-395): the CURRENT Greenhouse UI ----------
// Fixture /gh-current reproduces the UI captured live on 2026-10-15
// (see tests/fixtures/portal-fixture-server.cjs): react-select v5
// widgets with NO .select__container ancestor, the single-value inside
// the value container, and a country widget whose single-value renders
// only the dial code. The pre-fix helper climbs to the wrong container
// for its readback and reports every widget fill value_did_not_persist
// while the picks land — the exact Drive Pass 2 signature (228 failed
// widget/file fills; sandbox suite green throughout).
const CURRENT_PROFILE = Object.assign({}, BROWSER_PROFILE, {
  answers: Object.assign({}, BROWSER_PROFILE.answers, {
    education_level: { value: "Bachelor's Degree", confirmed: true, factId: "F-001" }, // module 149 deriveAnswers output shape (BUG-238)
  }),
  education: {
    school: "DePaul University - Driehaus College of Business", // the board's option is the PREFIX "DePaul University"
    degree: "Bachelor's Degree", discipline: "Computer Science and Finance",
    start_date: "2025", end_date: "2029", graduation_year: "2029", gpa: "3.9",
  },
});

test("D14 (BUG-237): on the current Greenhouse UI shape, widget fills persist at readback and the run reaches the doorstep", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-current`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url, "localhost:test:gh-current"), profile: CURRENT_PROFILE, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared", "the run reaches the doorstep over the current-UI widgets");
    assert.deepEqual(board.fillFailures, [], "no widget fill was reported failed — readback sees the picks");
    assert.equal(r.doorstep.payload.country, "+1", "the country widget's own single-value rendering (the dial code) is the persisted value of record");
    assert.equal(r.doorstep.payload.school_0, "DePaul University", "the school was picked from the board's options (prefix of the profile's long-form school)");
    assert.equal(r.doorstep.payload.degree_0, "Bachelor's Degree");
    assert.equal(r.doorstep.payload.question_13006485007, "No", "the sponsorship widget answered from the confirmed fact");
    assert.equal(r.doorstep.payload.start_year_0, "2025");
    assert.equal(r.doorstep.payload.end_year_0, "2029");
    assert.equal(r.doorstep.payload.resume.sha256, RESUME_SHA, "the resume attached through the visually-hidden input");
    assert.ok((r.asks || []).some((a) => /month/i.test(a.field_id || "")), "the month widgets stay honest asks (the bank carries no months) — asked, not invented");
    assert.equal(board.calls.submit, 0);
  } finally { board.close(); }
});

test("D14 (BUG-237): a resume input that unmounts before its fill and returns only via the Attach control is recovered — the upload lands", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-current-late-file`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url, "localhost:test:gh-current-late-file"), profile: CURRENT_PROFILE, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared", "the attach-control recovery restored the file input and the run completed");
    assert.equal(r.doorstep.payload.resume.sha256, RESUME_SHA);
    assert.deepEqual(board.fillFailures, [], "no fill failed — the late mount was recovered, not reported");
    assert.equal(board.calls.submit, 0);
  } finally { board.close(); }
});
