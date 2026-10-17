// Depth Lane E (2026-10-16) — Lever radio-group discovery crash.
// LIVE DEFECT (Neighbor, Lever, re-drive R2): both radios of a Lever
// card group share one machine name and carry no ids. The helper's
// discovery built a bare name selector for the group; it matches BOTH
// inputs, Playwright's strict elementHandle() threw, and the drive
// died as DRIVER_ERROR before any field was classified — the form was
// never even read. FAIL-FIRST: every test here is red until discovery
// gives same-name inputs unique selectors (name + value) and handle
// capture can never crash a drive.
// Check: node --test tests/career-portal-lever-radio.test.cjs
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

function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  for (const t of tries) { try { require.resolve(t); return t; } catch (e) { /* next */ } }
  return null;
}
const PW = resolvePlaywright();
const SKIP = PW ? false : "playwright is not resolvable in this environment (set UPMORE_PLAYWRIGHT_PATH)";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-lever-radio-test-"));
const RESUME_PATH = path.join(tmpDir, "alex-testcase-resume.txt");
fs.writeFileSync(RESUME_PATH, "TEST RESUME - synthetic fixture, not a real person\n");
const RESUME_SHA = crypto.createHash("sha256").update(fs.readFileSync(RESUME_PATH)).digest("hex");
const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  country: "United States",
  resume: { filename: "alex-testcase-resume.txt", sha256: RESUME_SHA },
  answers: {
    work_authorization: { value: "Yes", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
  },
};
const newLog = () => ({ records: [] });

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
after(() => { if (fixtureProc) fixtureProc.kill(); });

function browserSession(url) {
  const board = BrowserBoard.createBrowserBoard({ url, userId: "test-user", accountName: PROFILE.name, resumePath: RESUME_PATH, evidenceDir: tmpDir });
  const session = Portal.createPortalSession({ userId: "test-user", board });
  return { board, session };
}
const postingFor = (url) => ({ url, company: "TEST Neighborly", title: "Software Engineering Intern", status: "open", canonicalKey: "test-lever-radio" });

test("Lever radio group: discovery survives a same-name radio group (no DRIVER_ERROR)", { skip: SKIP, timeout: 180000 }, () => {
  const url = `${base}/lever-radio`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, { posting: postingFor(url), profile: PROFILE, log: newLog() });
    assert.notEqual(r.resultStatus, "driver_error", "the drive must classify the form, not die in discovery");
    const group = (r.formAnalysis || []).find((f) => /authorized to work/i.test(f.label || f.group_label || ""));
    assert.ok(group, "the radio card is classified with its human question");
  } finally { board.close(); }
});

test("Lever radio group: the confirmed answer is filled and read back (doorstep carries Yes)", { skip: SKIP, timeout: 180000 }, () => {
  const url = `${base}/lever-radio`;
  const { board, session } = browserSession(url);
  try {
    const r = Portal.runApply(session, {
      posting: postingFor(url), profile: PROFILE, log: newLog(),
      attestations: { certify_true: { value: true, explicit: true } },
    });
    assert.equal(r.resultStatus, "prepared", "every required field is covered, so the run reaches the doorstep");
    const values = Object.values(r.doorstep.payload || {});
    assert.ok(values.some((v) => v === "Yes"), `the work-authorization radio reads back Yes; payload: ${JSON.stringify(r.doorstep.payload)}`);
    assert.deepEqual(board.fillFailures, [], "no fill failure recorded anywhere on the form");
  } finally { board.close(); }
});
