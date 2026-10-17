// MI-099 browser replay guard — the Tally-shaped fixture form driven
// through the REAL module-150 driver + module-149 pipeline to a verified
// doorstep (fields read at drive time, fills verified by readback, zero
// submits). Localhost fixture only — no real portal is opened by this
// suite, ever, and no real submission is possible here.
// Check: node --test tests/career-tally-browser.test.cjs
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-tally-test-"));
const RESUME_PATH = path.join(tmpDir, "alex-testcase-resume.txt");
fs.writeFileSync(RESUME_PATH, "TEST RESUME - synthetic fixture, not a real person\n\nAlex Testcase (TEST)\n");
const PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", phone: "+1 000 555 0100",
  location: "Chicago, IL", country: "United States", linkedin: "https://www.linkedin.com/in/alex-testcase",
  website: "https://alextestcase.example.test/portfolio", test_scores: "SAT 1560",
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

test("MI-099 B1: the Tally fixture drives to a verified doorstep over the real driver — readback payload, zero submits", { skip: SKIP, timeout: 180000 }, () => {
  const url = `${base}/tally-form`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  try {
    const posting = { id: "FELLOW-LOCAL-099", canonicalKey: "tally:a16z-academy:academy-fellowship-founding-class",
      company: "a16z Academy", role: "Academy Fellowship (Founding Class)", url, status: "open", atsFamily: null };
    const r = Portal.runApply(session, { posting, profile: PROFILE, log: newLog(), now: "2026-10-16T12:00:00Z",
      attestations: { certify_true: { explicit: true, value: true } } });
    assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
    assert.equal(r.doorstep.atFinalReview, true);
    const p = r.doorstep.payload;
    assert.equal(p.full_name, "Alex Testcase (TEST)");
    assert.equal(p.email, "alex.testcase@example.test");
    assert.equal(p.country, "United States");
    assert.equal(p.portfolio, "https://alextestcase.example.test/portfolio");
    assert.equal(p.test_scores, "SAT 1560");
    assert.equal(p.essay, undefined, "no essay text was invented");
    assert.equal(p.transcript, undefined, "no transcript was invented");
    assert.equal(board.calls.submit, 0, "doorstep only — the fixture submit control was never clicked");
    assert.equal(board.fillFailures.length, 0, "every fill verified by readback");
  } finally { board.close(); }
});
