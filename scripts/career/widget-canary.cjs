/* Widget canary — BUG-237 prevention P1, the Greenhouse leg of
 * MI-109 (form-schema drift sentinel). The defect it exists to catch:
 * the sandbox fixture passed while the production Greenhouse UI had
 * changed shape (Drive Pass 2, 2026-10-15: 228 widget/file fills
 * failed live; the fixture reproduced an old UI). The fixture and
 * this canary are ONE mechanism: the fixture (tests/fixtures/
 * portal-fixture-server.cjs, /gh-current) reproduces the UI shape
 * captured from a live board, and this canary verifies — loudly —
 * that both the fixture drive AND the live boards still carry that
 * shape.
 *
 * Legs:
 *   1. fixture drive: a doorstep-posture run over /gh-current through
 *      modules 149+150 with the synthetic TEST profile must reach
 *      "prepared" with zero fill failures. (Same assertions as the
 *      D14 guard in tests/career-portal-submit-integrity.test.cjs.)
 *   2. live shape probe (READ-ONLY — no fills, no typing, nothing
 *      transmitted): one live board per family; asserts the DOM
 *      invariants the drive depends on, scoped to the fields the
 *      drive actually fills (widget comboboxes + the resume input):
 *        - at least one input.select__input exists;
 *        - a select__input's readback root (an ancestor carrying
 *          select__control) exists — the BUG-237 root invariant;
 *        - the resume channel exists in a drivable shape: a file
 *          input at rest OR an attach/upload control that can mount
 *          one.
 *      Any failed invariant is DRIFT: exit 1 with the family named.
 *
 * Intended schedule (MI-109, Crew A cron domain): daily. A red canary
 * means the family's driveability verdict (see
 * ~/workspace/your_files/real-apply/submissions/driveability-verdicts.md)
 * is suspended until a human re-captures the shape and updates the
 * fixture — the fixture is re-captured from the live board, never
 * edited from memory.
 *
 * Usage: node scripts/career/widget-canary.cjs [--out <json>]
 * Exit: 0 = all legs green; 1 = drift or drive failure (loud). */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..", "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

const LIVE_TARGETS = [
  { family: "greenhouse", url: "https://boards.greenhouse.io/liontree/jobs/5250586007" },
];

const out = { at: new Date().toISOString(), legs: [], drift: [] };
const fail = (leg, msg) => { out.drift.push({ leg, msg }); };

async function fixtureLeg() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-canary-"));
  const resumePath = path.join(tmpDir, "alex-testcase-resume.txt");
  fs.writeFileSync(resumePath, "TEST RESUME - synthetic fixture, not a real person\n");
  const sha = crypto.createHash("sha256").update(fs.readFileSync(resumePath)).digest("hex");
  const profile = {
    name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", phone: "+1 000 555 0100",
    location: "Chicago, IL", country: "United States",
    resume: { filename: "alex-testcase-resume.txt", sha256: sha },
    answers: {
      work_authorization: { value: "Yes", confirmed: true }, sponsorship: { value: "No", confirmed: true },
      education_level: { value: "Bachelor's Degree", confirmed: true, factId: "F-001" },
    },
    education: { school: "DePaul University - Driehaus College of Business", degree: "Bachelor's Degree", discipline: "Computer Science and Finance", start_date: "2025", end_date: "2029", graduation_year: "2029", gpa: "3.9" },
  };
  const proc = spawn(process.execPath, [path.join(root, "tests/fixtures/portal-fixture-server.cjs")], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    const base = await new Promise((resolve, reject) => {
      let buf = "";
      const t = setTimeout(() => reject(new Error("fixture server port timeout")), 15000);
      proc.stdout.on("data", (d) => { buf += d; const m = buf.match(/FIXTURE_PORT (\d+)/); if (m) { clearTimeout(t); resolve(`http://localhost:${m[1]}`); } });
    });
    const url = `${base}/gh-current`;
    const board = BrowserBoard.createBrowserBoard({ url, userId: "canary-test", resumePath, evidenceDir: tmpDir });
    try {
      const session = Portal.createPortalSession({ userId: "canary-test", board });
      const r = Portal.runApply(session, {
        posting: { id: "JOB-CANARY", canonicalKey: "localhost:canary:gh-current", company: "TEST Systems", role: "Software Engineering Intern", url, status: "open", atsFamily: null },
        profile, log: { records: [] }, attestations: { certify_true: { value: true, explicit: true } },
      });
      const ok = r.resultStatus === "prepared" && (board.fillFailures || []).length === 0;
      out.legs.push({ leg: "fixture-drive", family: "greenhouse-fixture", ok, resultStatus: r.resultStatus, fillFailures: board.fillFailures });
      if (!ok) fail("fixture-drive", `fixture drive not clean: ${r.resultStatus}, failures=${JSON.stringify(board.fillFailures)}`);
    } finally { board.close(); }
  } catch (e) {
    out.legs.push({ leg: "fixture-drive", ok: false, error: String(e.message || e) });
    fail("fixture-drive", String(e.message || e));
  } finally { proc.kill(); }
}

async function launchProbeBrowser() {
  const pwPath = process.env.UPMORE_PLAYWRIGHT_PATH || path.join(process.env.HOME || "", "workspace/sporve-agent-clone/node_modules/playwright");
  const pw = require(pwPath);
  const opts = { headless: true, args: ["--no-sandbox"] };
  let relay = null;
  const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxyServer) {
    const u = new URL(proxyServer);
    relay = net.createServer((c) => {
      let buf = Buffer.alloc(0), up = null, sent = false;
      c.on("data", (ch) => {
        if (!sent) { buf = Buffer.concat([buf, ch]); if (buf.includes("\r\n\r\n")) { sent = true; const h = buf; up = net.connect(Number(u.port) || 3128, u.hostname, () => up.write(h)); up.on("data", (d) => c.write(d)); up.on("error", () => c.destroy()); up.on("close", () => c.end()); } }
        else if (up) up.write(ch);
      });
      c.on("error", () => { if (up) up.destroy(); });
    });
    await new Promise((r) => relay.listen(0, "127.0.0.1", r));
    opts.proxy = { server: "http://127.0.0.1:" + relay.address().port, bypass: "localhost,127.0.0.1,::1" };
  }
  const browser = await pw.chromium.launch(opts);
  return { browser, relay };
}

async function liveLeg(target) {
  const { browser, relay } = await launchProbeBrowser();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto(target.url, { waitUntil: "commit", timeout: 60000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1800);
    const shape = await page.evaluate(() => {
      const widget = document.querySelector("input.select__input");
      const rootOk = !!widget && !!widget.closest('[class*="select__control"]');
      const fileAtRest = !!document.querySelector('input[type="file"]');
      const attachControl = Array.from(document.querySelectorAll('button, label, [role="button"]'))
        .some((el) => /attach|upload|add resume|add file/i.test((el.innerText || el.textContent || "").replace(/\s+/g, " ").trim()));
      return { widgetCount: document.querySelectorAll("input.select__input").length, rootOk, fileAtRest, attachControl, finalUrl: location.href };
    });
    const ok = shape.widgetCount >= 1 && shape.rootOk && (shape.fileAtRest || shape.attachControl);
    out.legs.push({ leg: "live-shape", family: target.family, url: target.url, ok, shape });
    if (!ok) fail("live-shape:" + target.family, `shape invariants failed: ${JSON.stringify(shape)}`);
    await ctx.close().catch(() => {});
  } catch (e) {
    out.legs.push({ leg: "live-shape", family: target.family, url: target.url, ok: false, error: String(e.message || e).slice(0, 200) });
    fail("live-shape:" + target.family, String(e.message || e).slice(0, 200));
  } finally {
    await browser.close().catch(() => {});
    if (relay) relay.close();
  }
}

(async () => {
  await fixtureLeg();
  for (const t of LIVE_TARGETS) await liveLeg(t);
  if (BrowserBoard.shutdownAll) BrowserBoard.shutdownAll();
  out.verdict = out.drift.length === 0 ? "GREEN" : "DRIFT";
  const outIdx = process.argv.indexOf("--out");
  if (outIdx > 0 && process.argv[outIdx + 1]) fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  process.exit(out.drift.length === 0 ? 0 : 1);
})().catch((e) => { console.error("canary fatal", e); process.exit(1); });
