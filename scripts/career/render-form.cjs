// WO-009b-2 helper (architect, CI only): open each source's public application page in sandboxed Chromium, the way a
// person's browser would, and keep the rendered DOM. Many ATS pages build the form with JavaScript, so the raw HTML
// that capture-form.cjs saves can hold no form at all; this records what is really on the page. Read-only by
// construction: every request that is not a GET or HEAD is aborted, nothing is clicked or typed, no cookie is kept.
//   UPMORE_PLAYWRIGHT_PATH=... [UPMORE_CHROMIUM_PATH=...] node scripts/career/render-form.cjs <sources.json> <out-dir>
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { publicURL } = require("./capture-form.cjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What a rendered page holds: forms, file inputs (the resume control), and required fields with their labels.
function pageSummary() {
  const doc = globalThis.document;
  const labelOf = (e) => {
    const byFor = e.id && doc.querySelector(`label[for="${CSS.escape(e.id)}"]`);
    return ((byFor && byFor.innerText) || e.getAttribute("aria-label") || (e.closest("label") && e.closest("label").innerText) || e.placeholder || "").replace(/\s+/g, " ").trim().slice(0, 200);
  };
  const controls = Array.from(doc.querySelectorAll("input,select,textarea")).filter((e) => !["hidden", "submit", "button", "image", "reset"].includes((e.type || "").toLowerCase()));
  const fields = controls.map((e) => ({ name: e.name || e.id || "", label: labelOf(e), type: (e.type || e.tagName).toLowerCase(),
    required: e.required || e.getAttribute("aria-required") === "true" || /[*✱]\s*$/.test(labelOf(e)) }));
  return { forms: doc.querySelectorAll("form").length, resume_inputs: fields.filter((f) => f.type === "file").length, fields,
    captcha: !!doc.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],[class*="g-recaptcha"],iframe[src*="turnstile"]') };
}

async function renderAll(sources, outDir) {
  const pw = require(process.env.UPMORE_PLAYWRIGHT_PATH || "playwright");
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await pw.chromium.launch({ headless: true, ...(process.env.UPMORE_CHROMIUM_PATH ? { executablePath: process.env.UPMORE_CHROMIUM_PATH } : {}) });
  const results = [];
  try {
    for (const s of sources) {
      const url = publicURL(s.url);
      const context = await browser.newContext();
      const page = await context.newPage();
      let blocked = 0;
      await page.route("**/*", (route) => (["GET", "HEAD"].includes(route.request().method()) ? route.continue() : (blocked++, route.abort("blockedbyclient"))));
      const r = { id: s.id, family: s.family, source_url: url, rendered_at: new Date().toISOString() };
      try {
        const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        r.http_status = res ? res.status() : null;
        await page.waitForSelector('input[type="file"], form', { timeout: 15000 }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        Object.assign(r, await page.evaluate(pageSummary));
        r.final_url = page.url();
        const html = await page.content();
        r.sha256 = crypto.createHash("sha256").update(html).digest("hex");
        fs.writeFileSync(path.join(outDir, s.id + ".rendered.html"), html);
      } catch (e) {
        r.error = String(e && e.message || e).slice(0, 200);
      }
      r.non_get_blocked = blocked;
      r.status = r.forms > 0 && r.resume_inputs > 0 && (r.fields || []).some((f) => f.required) ? "captured" : "not_a_form";
      fs.writeFileSync(path.join(outDir, s.id + ".rendered.json"), JSON.stringify(r, null, 2) + "\n");
      console.log("RENDERED " + JSON.stringify({ id: r.id, family: r.family, status: r.status, http: r.http_status, forms: r.forms, resume_inputs: r.resume_inputs,
        required: (r.fields || []).filter((f) => f.required).length, captcha: r.captcha, error: r.error || null }));
      results.push(r);
      await context.close();
      await sleep(2000);
    }
  } finally {
    await browser.close();
  }
  return results;
}

if (require.main === module) {
  const [sourcesFile, outDir] = process.argv.slice(2);
  renderAll(JSON.parse(fs.readFileSync(sourcesFile, "utf8")), outDir).then((rs) => {
    const tally = {};
    for (const r of rs) tally[`${r.family}:${r.status}`] = (tally[`${r.family}:${r.status}`] || 0) + 1;
    console.log("RENDER_TALLY " + JSON.stringify(tally));
  }).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { renderAll, pageSummary };
