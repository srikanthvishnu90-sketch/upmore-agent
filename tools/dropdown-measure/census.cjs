"use strict";
/* census.cjs — DROPDOWN-MEASURE lane (2026-10-21). Read-only DOM census
   of ONE public application form: for every field, its widget type
   (native-select / react-select / radio / checkbox / file / text),
   label, and (for native selects) its option list. This is the
   ground truth the drive records join against — the production board
   protocol's form() defs carry field_id + label but NOT widget type.
   Uses the same egress path as the board service (chromium wrapper).
   Usage: node census.cjs <url> <outJson> */
const fs = require("node:fs");
const path = require("node:path");

function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  tries.push(path.join(__dirname, "..", "..", "..", "..", "sporve-agent-clone", "node_modules", "playwright"));
  tries.push("/home/hatch/workspace/sporve-agent-clone/node_modules/playwright");
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  return null;
}

const CENSUS_FN = () => {
  const vis = (el) => !!(el.offsetParent !== null || el.getClientRects().length > 0);
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  function labelFor(el) {
    if (el.labels && el.labels.length) { const t = clean(el.labels[0].textContent); if (t) return t; }
    const aria = el.getAttribute("aria-label"); if (aria) return clean(aria);
    const lb = el.getAttribute("aria-labelledby");
    if (lb) { const n = document.getElementById(lb); if (n) return clean(n.textContent); }
    let p = el.parentElement;
    for (let i = 0; i < 4 && p; i++) {
      const lab = p.querySelector(":scope > label, :scope > legend");
      if (lab) { const t = clean(lab.textContent); if (t) return t; }
      p = p.parentElement;
    }
    const fs = el.closest("fieldset");
    if (fs) { const leg = fs.querySelector("legend"); if (leg) return clean(leg.textContent); }
    return "";
  }
  const out = [];
  const els = Array.from(document.querySelectorAll("input, select, textarea"));
  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || (tag === "select" ? "select" : tag === "textarea" ? "textarea" : "text")).toLowerCase();
    const cls = typeof el.className === "string" ? el.className : "";
    let widget = "text";
    if (tag === "select") widget = "native-select";
    else if (/select__input/.test(cls) || (el.closest && el.closest('[class*="select__control"]'))) widget = "react-select";
    else if (type === "radio") widget = "radio";
    else if (type === "checkbox") widget = "checkbox";
    else if (type === "file") widget = "file";
    else if (type === "hidden") widget = "hidden";
    const rec = {
      tag, type, widget,
      id: el.id || null, name: el.getAttribute("name") || null,
      cls: cls.slice(0, 80), visible: vis(el),
      label: labelFor(el),
    };
    if (tag === "select") {
      rec.options = Array.from(el.options || []).slice(0, 60).map((o) => ({ value: o.value, label: clean(o.textContent) }));
    }
    out.push(rec);
  }
  return out;
};

(async () => {
  const url = process.argv[2], outPath = process.argv[3];
  if (!url || !outPath) { console.error("usage: census.cjs <url> <outJson>"); process.exit(1); }
  const pw = resolvePlaywright();
  if (!pw) { console.error("PLAYWRIGHT_UNRESOLVABLE"); process.exit(3); }
  const executablePath = process.env.UPMORE_CHROMIUM_PATH || "/home/hatch/worker-config/chromium-egress-wrapper.sh";
  const browser = await pw.chromium.launch({ headless: true, executablePath, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  let navError = null;
  try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }); } catch (e) { navError = String(e.message || e).slice(0, 160); }
  await page.waitForTimeout(2500);
  let fields = await page.evaluate(CENSUS_FN).catch(() => []);
  const usable = fields.filter((f) => f.visible && f.widget !== "hidden").length;
  if (usable < 4) {
    // The form may sit behind an Apply control — click the first one.
    const clicked = await page.evaluate(() => {
      const cands = Array.from(document.querySelectorAll("a, button")).filter((e) => /apply/i.test(e.textContent || "") && (e.offsetParent !== null || e.getClientRects().length > 0));
      if (cands.length) { cands[0].click(); return true; }
      return false;
    }).catch(() => false);
    if (clicked) { await page.waitForTimeout(3000); fields = await page.evaluate(CENSUS_FN).catch(() => []); }
  }
  const result = { url, finalUrl: page.url(), when: new Date().toISOString(), navError, fields };
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  const tally = {};
  for (const f of fields) tally[f.widget] = (tally[f.widget] || 0) + 1;
  console.log(JSON.stringify({ finalUrl: result.finalUrl, fieldCount: fields.length, tally }));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error("CENSUS_FAILED", e && e.message); process.exit(1); });
