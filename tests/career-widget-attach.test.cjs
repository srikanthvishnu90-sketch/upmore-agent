// Widget/attach mechanics — fail-first suite for the helper fix in
// docs/career/widget-attach-root-cause-2026-10-21.md.
// The three production defects, as fixture tests:
//   1. READBACK SCAN TAX: connected() ran a full page discovery per
//      ref check — a ~30-binding readback ran 100-225 scans and died
//      at module 150's 30 s cap on live Lever pages (DRIVER_TIMEOUT,
//      reproduced quiet with no fills). The fixture page counts the
//      scans itself; one readback may use a small constant number.
//   2. ATTACH IDENTITY: after the board's post-upload remount, the
//      recovery ladder re-attached by "first file input in the
//      document" — the cover-letter field — and no verification ever
//      digested the resume input. The fixture remounts its upload
//      section (vanish ~2.5 s, return with cover first + the resume
//      input under a new id); the resume must end up attached to the
//      RESUME input, provable by digest in answers(), and the cover
//      field must hold nothing.
//   3. WIDGET PATIENCE BUDGET: a never-actionable widget stacked
//      20 s action timeouts (76.5 s for one live EEO field). One drive
//      now fails inside one bounded budget and later fields still fill.
//   4. REGRESSION GUARD: a decline-class widget pick that only the
//      cleared-search rung can reach still lands (the decline lane's
//      semantics are not this fix's to break).
// Check: node --test tests/career-widget-attach.test.cjs
// (Playwright resolution mirrors the helper's: env -> bare -> the
// sporve sibling; sandbox posture comes from the environment —
// UPMORE_CHROMIUM_SANDBOX=off on hosts that cannot run it, per QA.)
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  tries.push(path.join(root, "..", "sporve-agent-clone", "node_modules", "playwright"));
  for (const t of tries) { try { require.resolve(t); return t; } catch (e) { /* next */ } }
  return null;
}
const SKIP = resolvePlaywright() ? false : "playwright is not resolvable in this environment (set UPMORE_PLAYWRIGHT_PATH)";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-widget-attach-test-"));
const RESUME_PATH = path.join(tmpDir, "alex-testcase-resume.txt");
fs.writeFileSync(RESUME_PATH, "TEST RESUME - synthetic fixture, not a real person\n\nAlex Testcase (TEST)\n");
const RESUME_SHA = crypto.createHash("sha256").update(fs.readFileSync(RESUME_PATH)).digest("hex");
const RESUME_VALUE = { filename: "alex-testcase-resume.txt", sha256: RESUME_SHA };

let fixtureProc, base;
before(async () => {
  fixtureProc = spawn(process.execPath, [path.join(__dirname, "fixtures", "widget-attach-fixture-server.cjs")], { stdio: ["ignore", "pipe", "inherit"] });
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getCount() {
  return new Promise((resolve, reject) => {
    http.get(base + "/__count", (res) => {
      let b = "";
      res.on("data", (d) => { b += d; });
      res.on("end", () => { try { resolve(JSON.parse(b).count); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}
const boardFor = (url) => BrowserBoard.createBrowserBoard({ url, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });

test("readback: one answers() costs a small constant number of full page scans, whatever the group sizes", { skip: SKIP, timeout: 180000 }, async () => {
  const board = boardFor(base + "/scan-form");
  assert.equal(board.open().ok, true);
  const form = board.form();
  assert.ok(form.fields.length >= 6, "fixture form discovered");
  const byId = Object.fromEntries(form.fields.map((d) => [d.field_id, d]));
  assert.ok(byId.resume, "resume def present");
  board.fill("name", "Alex Testcase");
  board.fill("email", "alex.testcase@example.test");
  const groupId = form.fields.find((d) => /language/.test(d.field_id)).field_id;
  board.fill(groupId, ["Skill 3", "Skill 7", "Skill 42"]);
  const authId = form.fields.find((d) => /authorized|auth/.test(d.field_id)).field_id;
  board.fill(authId, "Yes");
  const gradId = form.fields.find((d) => /grad/.test(d.field_id)).field_id;
  board.fill(gradId, "2029");
  board.fill("resume", RESUME_VALUE);
  await sleep(1000);
  const beforeCount = await getCount();
  const t0 = Date.now();
  const ans = board.answers();
  const ms = Date.now() - t0;
  await sleep(1000);
  const scansDuringReadback = (await getCount()) - beforeCount;
  // Correctness first: the values are the page's truth.
  assert.deepEqual([...(ans[groupId] || [])].sort(), ["Skill 3", "Skill 42", "Skill 7"], "checkbox group reads back the picked options");
  assert.equal(ans[authId], "Yes");
  assert.equal(ans[gradId], "2029");
  assert.equal(ans.resume && ans.resume.sha256, RESUME_SHA, "resume digest reads back");
  // The defect: per-ref full scans (100+ on this shape pre-fix).
  assert.ok(scansDuringReadback <= 4, `one readback used ${scansDuringReadback} full page scans (pre-fix: 100+)`);
  assert.ok(ms < 20000, `readback took ${ms}ms`);
  board.close();
});

test("attach: a post-upload remount cannot move the resume onto the cover field, and the digest proves the resume input", { skip: SKIP, timeout: 180000 }, async () => {
  const board = boardFor(base + "/remount-form");
  assert.equal(board.open().ok, true);
  const form = board.form();
  assert.ok(form.fields.some((d) => d.field_id === "resume"), "resume def present");
  const r = board.fill("resume", RESUME_VALUE);
  assert.ok(r && r.sha256 === RESUME_SHA, "the resume fill verifies (post-remount recovery included)");
  const ans = board.answers();
  assert.equal(ans.resume && ans.resume.sha256, RESUME_SHA, "answers() digests the file on the RESUME input");
  assert.equal(ans.cover_letter, undefined, "the cover-letter field holds nothing — the resume never landed on it");
  board.close();
});

test("widget: a never-actionable widget fails inside one bounded budget and the drive continues", { skip: SKIP, timeout: 180000 }, async () => {
  const board = boardFor(base + "/widget-stuck");
  assert.equal(board.open().ok, true);
  board.form();
  const t0 = Date.now();
  const r = board.fill("country_widget", "United States");
  const ms = Date.now() - t0;
  assert.equal(r, undefined, "the dead widget is a recorded fill failure, never a filled value");
  assert.ok(board.fillFailures.some((f) => f.field_id === "country_widget"), "failure recorded for the widget field");
  assert.ok(ms < 55000, `one dead-widget drive took ${ms}ms (pre-fix stack: ~60s of action timeouts, 76.5s live with the stale re-drive)`);
  assert.equal(board.fill("city", "Chicago"), "Chicago", "a later ordinary field still fills");
  board.close();
});

test("attach: a board that replaces the input with the uploaded filename chip still verifies, and answers() reports the file", { skip: SKIP, timeout: 180000 }, async () => {
  const board = boardFor(base + "/chip-form");
  assert.equal(board.open().ok, true);
  board.form();
  const r = board.fill("resume", RESUME_VALUE);
  assert.ok(r && r.sha256 === RESUME_SHA, "the resume fill verifies against the board's uploaded-state rendering");
  const ans = board.answers();
  assert.equal(ans.resume && ans.resume.sha256, RESUME_SHA, "answers() reports the attached file (session record + the board's chip)");
  assert.equal(ans.resume.filename, "alex-testcase-resume.txt");
  assert.equal(ans.cover_letter, undefined, "the untouched cover field stays absent");
  board.close();
});

test("widget regression guard: the decline-class pick still lands via the cleared-search rung", { skip: SKIP, timeout: 180000 }, async () => {
  const board = boardFor(base + "/widget-select");
  assert.equal(board.open().ok, true);
  const form = board.form();
  const def = form.fields.find((d) => /veteran/.test(d.field_id));
  assert.ok(def, "EEO widget def present");
  const r = board.fill(def.field_id, "Decline to self-identify");
  assert.equal(r, "Decline to self-identify", "the widget fill verifies");
  const ans = board.answers();
  assert.equal(ans[def.field_id], "I don't wish to answer", "the board's own wording of the decline reads back");
  board.close();
});
