/* Dry drive — board-family driver verification with ZERO transmission
 * (branch finish/apply-readiness).
 *
 * For each ATS family, runs the product's OWN apply pipeline
 * (module 149 over module 150 over scripts/career/portal-browser-
 * helper.cjs) against ONE live posting, using the synthetic TEST
 * persona (the same "Alex Testcase" profile the widget canary
 * uses). The board is created WITHOUT submitArmed and submitDoorstep
 * is never called: module 150's submit leg throws
 * REAL_SUBMIT_DISABLED on an unarmed board, and this runner asserts
 * board.calls.submit === 0 after every run. The pipeline fills from
 * the TEST profile's confirmed facts only, verifies every fill by
 * read-back (module 150's own D11 machinery), and stops at the
 * doorstep (resultStatus "prepared"), at an awaiting_user stop
 * (questions the TEST profile does not cover — expected; they are
 * recorded, never answered by invention), or at a named typed stop
 * (captcha / redirect / empty form). The browser context is then
 * closed and the filled form is discarded with it — nothing is
 * transmitted, ever, in a dry drive.
 *
 * Runs ONLY under scripts/career/drive-env-launch.cjs, so a green
 * run exercises the durable drive environment end to end:
 * relay → wrapper → helper → live board.
 *
 * Usage:
 *   UPMORE_CHROMIUM_SANDBOX=off node scripts/career/drive-env-launch.cjs -- \
 *     node scripts/career/dry-drive.cjs [--out <json>] [--family <f>]…
 * Exit: 0 = every targeted family reached a doorstep-or-named-stop
 * with zero submit attempts and zero unexplained driver errors;
 * 1 otherwise.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

if (!process.env.UPMORE_DRIVE_RELAY_PORT || !process.env.UPMORE_CHROMIUM_PATH) {
  console.error("dry-drive: run me under scripts/career/drive-env-launch.cjs (drive env unset)");
  process.exit(2);
}
const root = path.resolve(__dirname, "..", "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

const TARGETS = [
  { family: "greenhouse", company: "LionTree", role: "Capital Markets - Research Associate",
    url: "https://job-boards.greenhouse.io/liontree/jobs/5153692007" },
  { family: "lever", company: "Spotify", role: "Art Director - Mexico",
    url: "https://jobs.lever.co/spotify/223f9722-3579-4ff2-b123-e4cc7b0c1a64/apply" },
  { family: "ashby", company: "Ramp", role: "Security Engineer, Cloud",
    url: "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245/application" },
  { family: "smartrecruiters", company: "ServiceNow", role: "Senior Staff Platform Engineer - Kubernetes - Federal",
    url: "https://jobs.smartrecruiters.com/ServiceNow/744000156132859" },
];

function testProfile(resumePath) {
  const sha = crypto.createHash("sha256").update(fs.readFileSync(resumePath)).digest("hex");
  return {
    name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", phone: "+1 000 555 0100",
    location: "Chicago, IL", country: "United States",
    resume: { filename: path.basename(resumePath), sha256: sha },
    answers: {
      work_authorization: { value: "Yes", confirmed: true }, sponsorship: { value: "No", confirmed: true },
      education_level: { value: "Bachelor's Degree", confirmed: true, factId: "F-001" },
    },
    education: { school: "DePaul University - Driehaus College of Business", degree: "Bachelor's Degree", discipline: "Computer Science and Finance", start_date: "2025", end_date: "2029", graduation_year: "2029", gpa: "3.9" },
  };
}

(async () => {
  const args = process.argv.slice(2);
  const famFilter = [];
  for (let i = 0; i < args.length; i++) if (args[i] === "--family") famFilter.push(args[++i]);
  const targets = TARGETS.filter((t) => !famFilter.length || famFilter.includes(t.family));
  const outIdx = args.indexOf("--out");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-dry-drive-"));
  const resumePath = path.join(tmpDir, "alex-testcase-resume.txt");
  fs.writeFileSync(resumePath, "TEST RESUME - synthetic fixture, not a real person\nDry-drive verification only. Discarded with the browser context.\n");
  const profile = testProfile(resumePath);
  const out = { at: new Date().toISOString(), tool: "dry-drive", persona: "Alex Testcase (TEST)", drives: [] };
  let allOk = true;

  for (const t of targets) {
    const rec = { family: t.family, company: t.company, role: t.role, url: t.url };
    const evidenceDir = path.join(tmpDir, "evidence-" + t.family);
    const board = BrowserBoard.createBrowserBoard({ url: t.url, userId: "dry-drive-test", resumePath, evidenceDir });
    try {
      if (board.submitArmed) throw new Error("board created ARMED — refusing to drive");
      const session = Portal.createPortalSession({ userId: "dry-drive-test", board });
      const r = Portal.runApply(session, {
        posting: { id: "DRY-" + t.family.toUpperCase(), canonicalKey: `drydrive:${t.family}:${t.company.toLowerCase()}`, company: t.company, role: t.role, url: t.url, status: "open", atsFamily: t.family },
        profile, log: { records: [] }, attestations: { certify_true: { value: true, explicit: true } },
      });
      const fa = r.formAnalysis || [];
      let discovered = fa.length;
      if (!discovered) {
        const obs = board.lastObservation || {};
        const logDiscover = (board.driverLog || []).find((e) => e.action === "discover");
        discovered = (obs.fields && obs.fields.length) || (obs.defs && obs.defs.length) || (logDiscover ? logDiscover.fieldCount : 0) || 0;
      }
      rec.resultStatus = r.resultStatus;
      rec.stopCode = r.code || null;
      rec.stopReason = r.reason ? String(r.reason).slice(0, 300) : null;
      rec.screenshotRef = r.screenshot_ref || null;
      rec.driverLog = (board.driverLog || []).slice(-40);
      rec.captcha = r.captcha || (board.captchaTech && board.captchaTech.length ? board.captchaTech : null);
      rec.fieldsDiscovered = discovered;
      rec.fieldsRequired = fa.filter((f) => f.required).length;
      rec.filledAndReadBack = Object.keys(board.renderedValues || {}).length;
      rec.fillFailures = board.fillFailures || [];
      rec.doorstepPayloadFields = r.doorstep && r.doorstep.payload ? Object.keys(r.doorstep.payload).length : 0;
      rec.asks = (r.asks || []).map((a) => { const f = fa.find((x) => x.field_id === a.field_id); return { field: f ? f.label : a.field_id, reason: a.reason || null }; });
      rec.finalUrl = board.finalUrl || null;
      rec.submitAttempts = board.calls ? board.calls.submit : null;
      rec.submitArmedAtEnd = board.submitArmed;
      // The dry-drive invariants: never armed, never a submit call,
      // and the run must end at a doorstep or a NAMED stop.
      rec.invariants = {
        neverArmed: board.submitArmed === false,
        zeroSubmitCalls: rec.submitAttempts === 0,
        namedEndState: ["prepared", "awaiting_user", "blocked"].includes(r.resultStatus),
      };
      rec.ok = rec.invariants.neverArmed && rec.invariants.zeroSubmitCalls && rec.invariants.namedEndState && (rec.fieldsDiscovered > 0 || rec.filledAndReadBack > 0);
    } catch (e) {
      rec.ok = false;
      rec.error = String(e.message || e).slice(0, 300);
      rec.errorCode = e.code || null;
      try { rec.submitAttempts = board.calls ? board.calls.submit : null; } catch (_) { /* board gone */ }
    } finally { try { board.close(); } catch (e) { /* already closed */ } }
    if (!rec.ok) allOk = false;
    out.drives.push(rec);
    console.log(`${rec.ok ? "OK  " : "FAIL"} ${rec.family} status=${rec.resultStatus || "-"} stop=${rec.stopCode || "-"} fields=${rec.fieldsDiscovered ?? "-"} readback=${rec.filledAndReadBack ?? "-"} fillFailures=${(rec.fillFailures || []).length} asks=${(rec.asks || []).length} submits=${rec.submitAttempts ?? "-"}${rec.error ? " err=" + rec.error : ""}`);
  }
  if (BrowserBoard.shutdownAll) BrowserBoard.shutdownAll();
  out.verdict = allOk ? "DRY DRIVES COMPLETE" : "DRY DRIVE FAILURES";
  if (outIdx > -1 && args[outIdx + 1]) fs.writeFileSync(args[outIdx + 1], JSON.stringify(out, null, 1));
  console.log("verdict:", out.verdict, "| evidence dir:", tmpDir);
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error("dry-drive fatal:", e); process.exit(1); });
