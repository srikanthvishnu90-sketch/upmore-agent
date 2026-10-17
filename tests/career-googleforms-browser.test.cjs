// MI-101 browser replay guard — the Google Forms-shaped fixture form
// (Z Fellows shape, staged from census 2026-10-15 §13) driven through
// the REAL module-150 driver + module-149 pipeline to a verified
// doorstep (fields read at drive time, fills verified by readback,
// zero submits). The short-answer/essay textareas are owner-writing
// only: the drive leaves them untouched. Localhost fixture only — no
// real portal is opened by this suite, ever, and no real submission
// is possible here.
// Check: node --test tests/career-googleforms-browser.test.cjs
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-googleforms-test-"));
const PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", phone: "+1 000 555 0100",
  location: "Chicago, IL", website: "https://alex-testcase.example.test", date_of_birth: "2000-01-01",
  answers: {
    company_or_project: { value: "TEST Project (TEST)", confirmed: true },
    is_technical: { value: "Yes", confirmed: true },
    previously_applied: { value: "No", confirmed: true },
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

test("MI-101 B1: the Google Forms fixture drives to a verified doorstep over the real driver — readback payload, essays untouched, zero submits", { skip: SKIP, timeout: 180000 }, () => {
  const url = `${base}/google-forms-form`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", evidenceDir: tmpDir });
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  try {
    const posting = { id: "ZF-LOCAL-001", canonicalKey: "googleforms:zfellows:2026-cohorts",
      company: "Z Fellows", role: "Z Fellows — 2026 cohorts", url, status: "open", atsFamily: null };
    const r = Portal.runApply(session, { posting, profile: PROFILE, log: newLog(), now: "2026-10-16T12:00:00Z" });
    assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
    assert.equal(r.doorstep.atFinalReview, true);
    const p = r.doorstep.payload;
    assert.equal(p.full_name, "Alex Testcase (TEST)");
    assert.equal(p.email, "alex.testcase@example.test");
    assert.equal(p.date_of_birth, "2000-01-01");
    assert.equal(p.location, "Chicago, IL");
    assert.equal(p.website, "https://alex-testcase.example.test");
    assert.equal(p.company_or_project, "TEST Project (TEST)");
    assert.equal(p.is_technical, "Yes");
    assert.equal(p.previously_applied, "No");
    assert.ok(!Object.values(p).some((v) => typeof v === "string" && /OWNER DRAFT|GENERATED/i.test(v)), "no short-answer text was manufactured");
    assert.equal(board.calls.submit, 0, "doorstep only — the fixture submit control was never clicked");
    assert.equal(board.fillFailures.length, 0, "every fill verified by readback");
  } finally { board.close(); }
});
