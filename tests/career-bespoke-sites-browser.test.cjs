// MI-104 browser replay guards — the two bespoke program-site fixture
// forms (8VC Fellowship shape + Kleiner Perkins Fellows shape) driven
// through the REAL module-150 driver + module-149 pipeline to verified
// doorsteps (fields read at drive time, fills verified by readback,
// zero submits). Free-text/essay fields are owner asks: both drives
// leave them untouched. Localhost fixtures only — no real portal is
// opened by this suite, ever, and no real submission is possible here.
// Check: node --test tests/career-bespoke-sites-browser.test.cjs
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
  tries.push(path.join(root, "..", "sporve-agent-clone", "node_modules", "playwright"));
  for (const t of tries) { try { require.resolve(t); return t; } catch (e) { /* next */ } }
  return null;
}
const PW = resolvePlaywright();
const SKIP = PW ? false : "playwright is not resolvable in this environment (set UPMORE_PLAYWRIGHT_PATH)";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-bespoke-test-"));
const RESUME_PATH = path.join(tmpDir, "alex-testcase-resume.txt");
fs.writeFileSync(RESUME_PATH, "TEST RESUME - synthetic fixture, not a real person\n\nAlex Testcase (TEST)\n");
const RESUME_SHA = crypto.createHash("sha256").update(fs.readFileSync(RESUME_PATH)).digest("hex");
const PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", phone: "+1 000 555 0100",
  location: "Chicago, IL", country: "United States",
  linkedin: "https://www.linkedin.com/in/alex-testcase",
  website: "https://alex-testcase.example.test",
  education: { school: "Test University (TEST)", degree: "Bachelors in Computer Science (TEST)", discipline: "Computer Science", graduation_year: "2029" },
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
    fixtureProc.stdout.on("data", (d) => { buf += d; const m = buf.match(/FIXTURE_PORT (\d+)/); if (m) { clearTimeout(timer); resolve(`http://localhost:${m[1]}`); } });
    fixtureProc.on("exit", () => { clearTimeout(timer); reject(new Error("fixture server exited early")); });
  });
});
after(() => { if (fixtureProc) fixtureProc.kill(); if (BrowserBoard.shutdownAll) BrowserBoard.shutdownAll(); });

test("MI-104 B1: the 8VC fixture drives to a verified doorstep over the real driver — readback payload, essay fields untouched, zero submits", { skip: SKIP, timeout: 180000 }, () => {
  const url = `${base}/eightvc-form`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  try {
    const posting = { id: "8VC-LOCAL-001", canonicalKey: "eightvc:8vc:fellowship-2027",
      company: "8VC", role: "8VC Fellowship — Engineering", url, status: "open", atsFamily: null };
    const r = Portal.runApply(session, { posting, profile: PROFILE, log: newLog(), now: "2026-10-16T12:00:00Z",
      attestations: { certify_true: { explicit: true, value: true } } });
    assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
    assert.equal(r.doorstep.atFinalReview, true);
    const p = r.doorstep.payload;
    assert.equal(p.full_name, "Alex Testcase (TEST)");
    assert.equal(p.email, "alex.testcase@example.test");
    assert.equal(p.country, "United States");
    assert.equal(p.school, "Test University (TEST)");
    assert.equal(p.graduation_year, "2029");
    assert.equal(p.resume.sha256, RESUME_SHA);
    assert.equal(p.project_description, undefined, "no project text was manufactured");
    assert.equal(p.why_8vc_fellowship, undefined, "no essay text was manufactured");
    assert.equal(board.calls.submit, 0, "doorstep only — the fixture submit control was never clicked");
    assert.equal(board.fillFailures.length, 0, "every fill verified by readback");
  } finally { board.close(); }
});

test("MI-104 B2: the Kleiner Perkins fixture drives to a verified doorstep over the real driver — readback payload, essay fields untouched, zero submits", { skip: SKIP, timeout: 180000 }, () => {
  const url = `${base}/kleinerperkins-form`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  try {
    const posting = { id: "KP-LOCAL-001", canonicalKey: "kleinerperkins:fellows:engineering-2027",
      company: "Kleiner Perkins", role: "Kleiner Perkins Fellows — Engineering", url, status: "open", atsFamily: null };
    const r = Portal.runApply(session, { posting, profile: PROFILE, log: newLog(), now: "2026-10-16T12:00:00Z",
      attestations: { certify_true: { explicit: true, value: true } } });
    assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
    assert.equal(r.doorstep.atFinalReview, true);
    const p = r.doorstep.payload;
    assert.equal(p.full_name, "Alex Testcase (TEST)");
    assert.equal(p.email, "alex.testcase@example.test");
    assert.equal(p.country, "United States");
    assert.equal(p.school, "Test University (TEST)");
    assert.equal(p.degree, "Bachelors in Computer Science (TEST)");
    assert.equal(p.discipline, "Computer Science");
    assert.equal(p.graduation_year, "2029");
    assert.equal(p.resume.sha256, RESUME_SHA);
    assert.equal(p.project_you_launched_from_scratch, undefined, "no project text was manufactured");
    assert.equal(p.campus_leadership_and_roles, undefined, "no leadership text was manufactured");
    assert.equal(board.calls.submit, 0, "doorstep only — the fixture submit control was never clicked");
    assert.equal(board.fillFailures.length, 0, "every fill verified by readback");
  } finally { board.close(); }
});
