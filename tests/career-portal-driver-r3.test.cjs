// Portal-driver R3 guards — the three defects the 2026-10-17 R3
// re-drive proved on live boards (submissions/redrive-r3-2026-10-17):
//   R3-D1 (attach ladder misfiles the packet): on Gemini a single
//     resume fill left the packet PDF chipped in BOTH the Resume/CV
//     and the Cover Letter slots (final screenshot), and the fill
//     reported file_input_not_mounted. The helper's attach ladder was
//     slot-blind: its rediscovery took the FIRST input[type=file] in
//     the document and its attach-control search the first visible
//     Attach control page-wide — on boards where another slot's input
//     comes first (Sezzle's transcript slot; Ginkgo/ID.me/Justworks
//     cover-letter slots) the packet landed in the wrong slot.
//     Enforcement: the ladder is slot-faithful — it attaches only to
//     the binding's own slot (selector, id/name, or the upload section
//     that names the slot class), engages only that section's own
//     control, and verifies against that slot's own state.
//   R3-D2 (verify reads the gap): single-drive react-select fills
//     reported value_did_not_persist (Ginkgo/ID.me how-heard, Yes/No
//     selects) while the final screenshots showed the values present
//     as chips — the board remounts the control after the pick and
//     re-renders the value on its own commit, and the one-shot
//     +450ms verify read the gap. The file verify had the mirror
//     defect: fills reported file_input_not_mounted while the board
//     held the resume chip (Workshop + Gemini probes, 2026-10-17).
//     Enforcement: verifies poll the board's rendered truth until it
//     is stable (widget single-value; the file slot's live input
//     bytes or its rendered filename chip), and the recorded
//     rendering is the value the verify actually read.
//   R3-D3 (ANSWER_OBSERVATION_MISMATCH on capped essays): Gemini and
//     Workshop stopped deterministically (3 drives each) — their
//     why-essay fields are single-line inputs the board caps at 255
//     chars (live probe: maxlength=255; fill and typing both land
//     exactly the 255-char prefix). The driver wrote the full draft,
//     demanded exact-equality readback, failed the fill, and the
//     doorstep compared the board's capped value against the full
//     confirmed draft. Enforcement: discovery carries the board's
//     cap (maxLength) on the binding; the fill writes the capped
//     rendering and verifies against IT, so module 149's FR-395
//     comparison (observed vs the driver's verified rendering) is
//     exact. The seam itself is NOT weakened — the two unit pins
//     below prove a divergent observed value still stops the run,
//     including when the observed value is a capped prefix the
//     driver never verified as its rendering.
// Ledger: PENDING-ALLOCATION rows on branch fix/portal-driver-r3
// (BUG/FR numbers requested from the Crew A registry per MI-093).
// Check: node --test tests/career-portal-driver-r3.test.cjs
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
  id: "JOB-GH-R3", canonicalKey: "greenhouse:testsystems:r3",
  company: "TEST Systems", role: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testsystems/jobs/r3", status: "open", atsFamily: "greenhouse",
};
const ESSAY = (() => {
  const sentence = "I am applying because this team builds careful, useful products, and my coursework in computer science and finance maps directly onto the work this role describes. ";
  let s = "";
  while (s.length < 449) s += sentence;
  return s.slice(0, 449).trimEnd().padEnd(449, "x");
})();
const FIELDS = [
  { field_id: "full_name", label: "Full name", kind: "standard", profile_key: "name", required: true },
  { field_id: "email", label: "Email", kind: "standard", profile_key: "email", required: true },
  { field_id: "resume", label: "Resume", kind: "standard", profile_key: "resume", required: true },
  { field_id: "why_us", label: "Why do you want to join us?", kind: "free_text", question_key: "why_do_you_want_to_join_us", required: true },
];
const PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test",
  phone: "+1 000 555 0100", location: "Chicago, IL", country: "United States",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: { why_do_you_want_to_join_us: { value: ESSAY, confirmed: true, draft: true } },
};

// A stub board that fills exactly as told and reads back what the
// test says the board holds — for the seam-integrity pins.
function stubBoard(observed, renderedValues) {
  const held = {};
  return {
    kind: "browser", sandbox: false, browserDriver: true,
    atsFamily: "greenhouse", host: "boards.greenhouse.io",
    renderedValues: renderedValues || {},
    calls: { submit: 0 },
    open() { return { ok: true, captcha: null }; },
    form() { return { fields: FIELDS.map((f) => Object.assign({}, f)), captchaAt: null }; },
    fill(id, v) { held[id] = v; return v; },
    answers() { return Object.assign({}, held, observed); },
    atReview() { return { ok: true, captcha: null }; },
    armForSubmit() { return { armed: true }; },
    submit() { this.calls.submit += 1; return { outcome: "accepted", confirmationId: "STUB-9" }; },
    submissionState() { return { submitted: false, confirmationId: null }; },
  };
}
const runWith = (board) => Portal.runApply(
  Portal.createPortalSession({ userId: "user-alex-test", board }),
  { posting: POSTING, profile: PROFILE, log: { records: [] } }
);

// ---------- R3-D3 seam pins: the observation check is NOT weakened ----------

test("R3-D3 pin: an observed value that diverges from the confirmed draft still stops ANSWER_OBSERVATION_MISMATCH", () => {
  const r = runWith(stubBoard({ why_us: "An entirely different answer the board made up." }));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(r.field_id, "why_us", "the stop names the diverging field");
});

test("R3-D3 pin: a capped observed prefix is drift when the driver never verified a capped rendering — the seam never truncates on its own", () => {
  // The board holds the 255-char prefix, but the driver's recorded
  // rendering is the FULL draft (it verified nothing capped). If the
  // seam silently truncated the expectation this would pass; it must
  // not — capping is honored only through the driver's own verified
  // rendering (the browser-tier guard below).
  const r = runWith(stubBoard({ why_us: ESSAY.slice(0, 255) }, { why_us: ESSAY }));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(r.field_id, "why_us");
});

// ---------- browser tier ----------

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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-portal-r3-test-"));
const RESUME_PATH = path.join(tmpDir, "r3-guard-resume.txt");
fs.writeFileSync(RESUME_PATH, "TEST RESUME - synthetic fixture, not a real person\n\nAlex Testcase (TEST)\n");
const RESUME_SHA = crypto.createHash("sha256").update(fs.readFileSync(RESUME_PATH)).digest("hex");
const BROWSER_PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test",
  phone: "+1 000 555 0100", location: "Chicago, IL", country: "United States",
  resume: { filename: "r3-guard-resume.txt", sha256: RESUME_SHA },
  answers: {
    work_authorization: { value: "Yes", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    why_do_you_want_to_join_us: { value: ESSAY, confirmed: true, draft: true },
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

const attachLog = async () => (await (await fetch(`${base}/__attach-log`)).json());
const waitAttachLog = async () => {
  for (let i = 0; i < 20; i++) {
    const log = await attachLog();
    if (log.length) return log;
    await new Promise((r) => setTimeout(r, 250));
  }
  return attachLog();
};

test("R3-D1: the attach ladder files the packet ONLY in the resume slot — never the transcript or cover-letter slot that precedes it in the DOM", { skip: SKIP, timeout: 240000 }, async () => {
  await fetch(`${base}/__attach-reset`);
  const url = `${base}/gh-multifile`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
  try {
    board.open();
    const { fields } = board.form();
    const nameDef = fields.find((f) => f.profile_key === "name") || fields.find((f) => /name/.test(f.field_id));
    const resumeDef = fields.find((f) => f.profile_key === "resume");
    assert.ok(nameDef && resumeDef, "the fixture exposes a name field and the resume slot");
    board.fill(nameDef.field_id, "Alex Testcase (TEST)"); // first input event: the board unmounts the resume input
    const ret = board.fill(resumeDef.field_id, { filename: "r3-guard-resume.txt", sha256: RESUME_SHA });
    assert.deepEqual(ret, { filename: "r3-guard-resume.txt", sha256: RESUME_SHA }, "the resume fill reports success");
    assert.deepEqual(board.fillFailures.filter((f) => f.field_id === resumeDef.field_id), [], "no resume fill failure is recorded");
    const answers = board.answers();
    assert.ok(answers[resumeDef.field_id], "the resume reads back at the doorstep readback");
    assert.equal(answers[resumeDef.field_id].sha256, RESUME_SHA, "the readback bytes are the packet's bytes");
    const log = await waitAttachLog();
    assert.deepEqual(log.map((e) => e.slot), ["resume"], "the packet was attached exactly once, to the resume slot only");
    assert.deepEqual(log.map((e) => e.name), ["r3-guard-resume.txt"]);
  } finally { board.close(); }
});

test("R3-D3: a board-capped essay fill verifies against the capped rendering and the run reaches the doorstep — no ANSWER_OBSERVATION_MISMATCH", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-capped-essay`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  try {
    const r = Portal.runApply(session, {
      posting: { id: "JOB-LOCAL-R3", canonicalKey: "localhost:test:r3-capped", company: "TEST Systems", role: "Software Engineering Intern", url, status: "open", atsFamily: null },
      profile: BROWSER_PROFILE, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared", "the run reaches the doorstep over the capped-essay board");
    assert.equal(r.doorstep.payload.why_us, ESSAY.slice(0, 255), "the payload carries exactly what the board holds: the capped prefix");
    assert.deepEqual(board.fillFailures, [], "no fill was left unverified or failed");
    const fillRec = (board.driverLog || []).find((x) => x.action === "fill" && x.field_id === "why_us");
    assert.ok(fillRec, "the essay fill is on the driver log");
    assert.equal(fillRec.capped, 255, "the fill records that the board's cap bounded the rendering");
    assert.equal(board.calls.submit, 0, "the submit control was never clicked");
  } finally { board.close(); }
});

test("R3-D2: a widget pick the board remounts away and re-renders late still verifies — the recorded rendering is the page's own value", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-widget-late-render`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
  try {
    board.open();
    const { fields } = board.form();
    const def = fields.find((f) => f.question_key === "how_heard");
    assert.ok(def, "the fixture exposes the how-heard widget");
    const ret = board.fill(def.field_id, "Company Website");
    assert.equal(ret, "Company Website", "the fill reports success");
    assert.deepEqual(board.fillFailures, [], "no value_did_not_persist is recorded for a pick the board holds");
    assert.equal(board.renderedValues[def.field_id], "Company Website", "the recorded rendering is the value the verify read off the page");
    assert.equal(board.answers()[def.field_id], "Company Website", "the doorstep readback agrees");
  } finally { board.close(); }
});

test("R3-D2/Gusto: the brand-named own-website option takes the Company Website fact, and the EEO multi-select decline persists as a chip — the run reaches the doorstep", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-gusto-shapes`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  const profile = Object.assign({}, BROWSER_PROFILE, {
    answers: Object.assign({}, BROWSER_PROFILE.answers, { how_heard: { value: "Company Website", confirmed: true } }),
  });
  try {
    const r = Portal.runApply(session, {
      posting: { id: "JOB-LOCAL-R3G", canonicalKey: "localhost:test:r3-gusto", company: "TEST Systems", role: "Finance Intern", url, status: "open", atsFamily: null },
      profile, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared", "the run reaches the doorstep over the Gusto shapes");
    const howDef = Object.keys(r.doorstep.payload).find((k) => Array.isArray(r.doorstep.payload[k]));
    assert.ok(howDef, "the how-heard payload is present");
    assert.deepEqual(r.doorstep.payload[howDef], ["Acme Website"], "the board's own-website option carries the Company Website fact");
    const eeoDef = Object.keys(r.doorstep.payload).find((k) => r.doorstep.payload[k] === "Decline to self-identify");
    assert.ok(eeoDef, "the EEO multi-select decline persisted into the payload");
    assert.deepEqual(board.fillFailures, [], "no fill was left unverified or failed");
    assert.equal(board.calls.submit, 0, "the submit control was never clicked");
  } finally { board.close(); }
});

test("R3-D2/Gusto pin: a bare 'Website' option and a brand blog never match the Company Website fact — the fill fails honestly", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-gusto-shapes-neg`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
  try {
    board.open();
    const { fields } = board.form();
    const def = fields.find((f) => f.question_key === "how_heard");
    assert.ok(def, "the fixture exposes the how-heard group");
    const ret = board.fill(def.field_id, "Company Website");
    assert.equal(ret, undefined, "no option was invented for the fact");
    assert.ok(board.fillFailures.some((f) => f.field_id === def.field_id && f.reason === "option_not_found"), "the failure is the honest option_not_found");
  } finally { board.close(); }
});

test("R3-D2/Gusto: a board that retires the resume input after the attach (chip-only) still reads the upload back at the doorstep — the run reaches the doorstep", { skip: SKIP, timeout: 240000 }, async () => {
  const url = `${base}/gh-file-chip`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  try {
    const r = Portal.runApply(session, {
      posting: { id: "JOB-LOCAL-R3C", canonicalKey: "localhost:test:r3-file-chip", company: "TEST Systems", role: "Finance Intern", url, status: "open", atsFamily: null },
      profile: BROWSER_PROFILE, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared", "the run reaches the doorstep over the chip-only board");
    assert.equal(r.doorstep.payload.resume.sha256, RESUME_SHA, "the doorstep payload carries the verified upload, proven by the live chip");
    assert.deepEqual(board.fillFailures, [], "no fill was left unverified or failed");
    assert.equal(board.calls.submit, 0, "the submit control was never clicked");
  } finally { board.close(); }
});

test("R3-D2/Gusto: a board that remounts its submit control as the form fills still reaches its doorstep — the review judges the live page", { skip: SKIP, timeout: 600000 }, async () => {
  const url = `${base}/gh-review-remount`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  try {
    const r = Portal.runApply(session, {
      posting: { id: "JOB-LOCAL-R3R", canonicalKey: "localhost:test:r3-review-remount", company: "TEST Systems", role: "Finance Intern", url, status: "open", atsFamily: null },
      profile: BROWSER_PROFILE, log: { records: [] },
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared", "the run reaches the doorstep over the remounting board (no FORM_STEP_LIMIT loop)");
    assert.deepEqual(board.fillFailures, [], "no fill was left unverified or failed");
    assert.equal(board.calls.submit, 0, "the submit control was never clicked");
  } finally { board.close(); }
});
