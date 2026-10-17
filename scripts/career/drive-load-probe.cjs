/* Drive load probe — READ-ONLY end-to-end verification of the durable
 * drive environment (branch finish/apply-readiness).
 *
 * Loads ONE live page per ATS family through the full tooling stack:
 * drive-env-launch's relay (credentials re-added upstream) +
 * drive-chromium.sh (egress CA SPKI-pinned, proxy-server injected).
 * It runs ONLY under scripts/career/drive-env-launch.cjs — it refuses
 * to start without that env, so a green run is evidence about the
 * composed environment, not about a hand-tuned shell.
 *
 * READ-ONLY means: goto, wait for settle, read status/final URL/
 * title. No typing, no clicking, no form interaction, nothing
 * transmitted beyond the page load itself. The browser context is
 * created WITHOUT ignoreHTTPSErrors on purpose: if the wrapper's
 * SPKI pin were wrong, the load fails with a certificate error and
 * this probe goes red — the pin doing the work IS the evidence.
 *
 * Usage (from repo root):
 *   UPMORE_CHROMIUM_SANDBOX=off node scripts/career/drive-env-launch.cjs -- \
 *     node scripts/career/drive-load-probe.cjs [--out <json>] [--family <f>]…
 * Exit: 0 = every targeted family loaded; 1 = any load failed.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

if (!process.env.UPMORE_DRIVE_RELAY_PORT || !process.env.UPMORE_CHROMIUM_PATH) {
  console.error("drive-load-probe: run me under scripts/career/drive-env-launch.cjs (UPMORE_DRIVE_RELAY_PORT / UPMORE_CHROMIUM_PATH unset)");
  process.exit(2);
}
function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  tries.push(path.join(__dirname, "..", "..", "..", "sporve-agent-clone", "node_modules", "playwright"));
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  return null;
}
const pw = resolvePlaywright();
if (!pw) { console.error("drive-load-probe: playwright unresolvable"); process.exit(3); }

const TARGETS = [
  { family: "greenhouse", url: "https://job-boards.greenhouse.io/liontree/jobs/5153692007" },
  { family: "lever", url: "https://jobs.lever.co/spotify/223f9722-3579-4ff2-b123-e4cc7b0c1a64/apply" },
  { family: "ashby", url: "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245/application" },
  { family: "smartrecruiters", url: "https://jobs.smartrecruiters.com/ServiceNow/744000156132859" },
];

(async () => {
  const args = process.argv.slice(2);
  const famFilter = [];
  for (let i = 0; i < args.length; i++) if (args[i] === "--family") famFilter.push(args[++i]);
  const targets = TARGETS.filter((t) => !famFilter.length || famFilter.includes(t.family));
  const outIdx = args.indexOf("--out");
  const out = { at: new Date().toISOString(), tool: "drive-load-probe", loads: [] };
  const launchOpts = { headless: true, executablePath: process.env.UPMORE_CHROMIUM_PATH };
  if (process.env.UPMORE_CHROMIUM_SANDBOX === "off") launchOpts.args = ["--no-sandbox"];
  const browser = await pw.chromium.launch(launchOpts);
  try {
    for (const t of targets) {
      const rec = { family: t.family, url: t.url };
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
      try {
        const page = await ctx.newPage();
        const resp = await page.goto(t.url, { waitUntil: "commit", timeout: 60000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1500);
        rec.httpStatus = resp ? resp.status() : null;
        rec.finalUrl = page.url();
        rec.title = (await page.title().catch(() => "")) || "";
        rec.ok = !!resp && resp.status() < 400;
        if (!rec.ok) rec.error = "HTTP " + rec.httpStatus;
      } catch (e) {
        rec.ok = false;
        rec.error = String(e.message || e).split("\n")[0].slice(0, 240);
      } finally { await ctx.close().catch(() => {}); }
      out.loads.push(rec);
      console.log(`${rec.ok ? "OK  " : "FAIL"} ${rec.family} status=${rec.httpStatus ?? "-"} final=${rec.finalUrl || "-"}${rec.error ? " err=" + rec.error : ""}`);
    }
  } finally { await browser.close().catch(() => {}); }
  out.verdict = out.loads.every((l) => l.ok) ? "ALL LOADED" : "LOAD FAILURES";
  if (outIdx > -1 && args[outIdx + 1]) fs.writeFileSync(args[outIdx + 1], JSON.stringify(out, null, 1));
  console.log("verdict:", out.verdict);
  process.exit(out.verdict === "ALL LOADED" ? 0 : 1);
})().catch((e) => { console.error("drive-load-probe fatal:", e); process.exit(1); });
