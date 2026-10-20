// MI-103 browser replay guards — the Thiel Fellowship fixtures driven
// through the REAL module-150 driver + module-149 pipeline:
//   B1: the IN-ACCOUNT application form (the shape the owner sees after
//       HE signs in) reaches a verified doorstep — fields read at drive
//       time, fills verified by readback, written-answer fields left
//       untouched, zero submits;
//   B2: the LOGIN WALL fixture (email + password sign-in page) stops
//       ACCOUNT_WALL_OWNER_HANDOFF before any form read or fill — the
//       driver never types a credential, never clicks sign-in/create
//       account, never submits.
// Localhost fixtures only — no real portal is opened by this suite,
// ever, no account is created, and no real submission is possible here.
// Check: node --test tests/career-thiel-browser.test.cjs
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-thiel-test-"));
const PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", phone: "+1 000 555 0100",
  location: "Chicago, IL", country: "United States",
  date_of_birth: "2007-01-15", hometown: "Testtown, IL (TEST)",
  linkedin: "https://www.linkedin.com/in/alex-testcase",
  website: "https://alex-testcase.example.test/project",
  answers: {
    project_or_company_name: { value: "Testcase Labs (TEST)", confirmed: true },
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

test("MI-103 B1: the in-account Thiel fixture drives to a verified doorstep over the real driver — readback payload, written-answer fields untouched, zero submits", { skip: SKIP, timeout: 180000 }, () => {
  const url = `${base}/thiel-form`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", evidenceDir: tmpDir });
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  try {
    const posting = { id: "THIEL-LOCAL-001", canonicalKey: "thiel:thielfellowship:fellowship",
      company: "Thiel Fellowship", role: "Thiel Fellowship", url, status: "open", atsFamily: null };
    const r = Portal.runApply(session, { posting, profile: PROFILE, log: newLog(), now: "2026-10-16T12:00:00Z",
      attestations: { certify_true: { explicit: true, value: true } } });
    assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
    assert.equal(r.doorstep.atFinalReview, true);
    const p = r.doorstep.payload;
    assert.equal(p.full_name, "Alex Testcase (TEST)");
    assert.equal(p.email, "alex.testcase@example.test");
    assert.equal(p.date_of_birth, "2007-01-15");
    assert.equal(p.hometown, "Testtown, IL (TEST)");
    assert.equal(p.location, "Chicago, IL");
    assert.equal(p.project_or_company_name, "Testcase Labs (TEST)");
    assert.equal(p.project_url, "https://alex-testcase.example.test/project");
    assert.equal(p.linkedin, "https://www.linkedin.com/in/alex-testcase");
    assert.equal(p.previous_projects, undefined, "no previous-project text was manufactured");
    assert.equal(p.project_description, undefined, "no project text was manufactured");
    assert.equal(board.calls.submit, 0, "doorstep only — the fixture submit control was never clicked");
    assert.equal(board.fillFailures.length, 0, "every fill verified by readback");
  } finally { board.close(); }
});

test("MI-103 B2: the Thiel login-wall fixture stops ACCOUNT_WALL_OWNER_HANDOFF over the real driver — zero fills, zero submits, no credential attempt", { skip: SKIP, timeout: 180000 }, () => {
  const url = `${base}/thiel-login`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", evidenceDir: tmpDir });
  const session = Portal.createPortalSession({ userId: "user-alex-test", board });
  try {
    const posting = { id: "THIEL-LOCAL-WALL", canonicalKey: "thiel:thielfellowship:fellowship",
      company: "Thiel Fellowship", role: "Thiel Fellowship", url, status: "open", atsFamily: null };
    const r = Portal.runApply(session, { posting, profile: PROFILE, log: newLog(), now: "2026-10-16T12:00:00Z",
      attestations: { certify_true: { explicit: true, value: true } } });
    assert.equal(r.resultStatus, "blocked", JSON.stringify(r.stepLog || []));
    assert.equal(r.code, "ACCOUNT_WALL_OWNER_HANDOFF");
    assert.equal(r.handoffUrl, url);
    assert.equal(board.calls.fill, 0, "nothing was filled on a login wall — no credential was ever typed");
    assert.equal(board.calls.submit, 0);
  } finally { board.close(); }
});
