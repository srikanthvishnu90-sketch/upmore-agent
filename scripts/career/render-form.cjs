// WO-009b-2 helper (architect, CI only): open each source's public application page in sandboxed Chromium, the way a
// person's browser would, and keep the rendered DOM. Many ATS pages build the form with JavaScript, so the raw HTML
// that capture-form.cjs saves can hold no form at all; this records what is really on the page. Read-only by
// construction: every request that is not a GET, a HEAD or a GraphQL query is aborted, nothing is clicked or typed,
// no cookie is kept.
//   UPMORE_PLAYWRIGHT_PATH=... [UPMORE_CHROMIUM_PATH=...] node scripts/career/render-form.cjs <sources.json> <out-dir>
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
// Public ATS pages only: https, no credentials, one of the four supported hosts (lookalike hosts refused).
function publicURL(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password ||
    !["greenhouse.io", "lever.co", "ashbyhq.com", "smartrecruiters.com"].some((h) => u.hostname === h || u.hostname.endsWith("." + h))) throw new Error("PUBLIC_ATS_URL_REQUIRED");
  return u.href;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What a rendered page holds: forms, file inputs (the resume control), every control (fields), and the questions a
// person would be asked (questions): radio and checkbox options grouped under one question, the question's own words
// taken from the nearest label-like element that holds no control (Lever and Ashby put them on a container, not a
// <label for>), select options kept, and required from the attribute, aria-required or a * / ✱ / "required" marker.
function pageSummary() {
  const doc = globalThis.document;
  const text = (e) => (e ? (e.innerText || e.textContent || "") : "").replace(/\s+/g, " ").trim().slice(0, 300);
  const LABELISH = 'label, legend, [class*="label" i], [class*="question" i], [class*="heading" i], [class*="title" i]';
  const holdsControl = (e) => !!e.querySelector("input,select,textarea");
  const ownLabel = (e) => {
    const byFor = e.id && doc.querySelector(`label[for="${CSS.escape(e.id)}"]`);
    const by = e.getAttribute("aria-labelledby");
    return text(byFor) || e.getAttribute("aria-label") || (by && text(doc.getElementById(by))) || "";
  };
  // The question a control belongs to: the nearest label-like element with no control inside, within 6 ancestors.
  const questionOf = (e) => {
    for (let a = e.parentElement, i = 0; a && i < 6; a = a.parentElement, i++) {
      const hit = Array.from(a.querySelectorAll(LABELISH)).find((l) => !holdsControl(l) && text(l) && !l.contains(e));
      if (hit) return { el: hit, box: a };
    }
    return null;
  };
  const isRequired = (e, q) => e.required || e.getAttribute("aria-required") === "true" ||
    /[*✱]\s*$|\(required\)/i.test(q ? text(q.el) : "") || !!(q && q.el.querySelector('[class*="required" i]')) || /required/i.test(q ? q.el.className || "" : "");
  const controls = Array.from(doc.querySelectorAll("input,select,textarea")).filter((e) => !["hidden", "submit", "button", "image", "reset"].includes((e.type || "").toLowerCase()));
  const fields = controls.map((e) => ({ name: e.name || e.id || "", label: ownLabel(e) || (e.closest("label") && text(e.closest("label"))) || e.placeholder || "",
    type: (e.type || e.tagName).toLowerCase(), required: e.required || e.getAttribute("aria-required") === "true" || /[*✱]\s*$/.test(ownLabel(e)) }));
  const questions = [], byName = new Map();
  for (const e of controls) {
    const type = (e.type || e.tagName).toLowerCase(), name = e.name || e.id || "";
    const q = questionOf(e), optionLabel = text(e.closest("label")) || ownLabel(e);
    if ((type === "radio" || type === "checkbox") && name && byName.has(name)) {
      const g = byName.get(name);
      g.options.push({ label: optionLabel, value: e.value || optionLabel });
      g.required = g.required || isRequired(e, q);
      continue;
    }
    const grouped = type === "radio" || (type === "checkbox" && name && controls.filter((c) => c.name === name).length > 1);
    const label = grouped ? (q ? text(q.el) : "") : (ownLabel(e) || (q ? text(q.el) : "") || e.placeholder || "");
    const f = { name, label: label.replace(/\s*[*✱]\s*$/, ""), type: type === "select-one" ? "select" : type, required: isRequired(e, grouped ? q : (ownLabel(e) ? { el: doc.createElement("span") } : q)) || e.required,
      options: e.tagName === "SELECT" ? Array.from(e.options).filter((o) => o.value !== "").map((o) => ({ label: text(o), value: o.value })) : grouped ? [{ label: optionLabel, value: e.value || optionLabel }] : [] };
    if (grouped && name) byName.set(name, f);
    questions.push(f);
  }
  return { forms: doc.querySelectorAll("form").length, resume_inputs: fields.filter((f) => f.type === "file").length, fields, questions,
    captcha: !!doc.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],[class*="g-recaptcha"],iframe[src*="turnstile"]') };
}

// GET and HEAD, plus one exception: a GraphQL POST whose operations are all queries (Ashby builds its application form
// from a GraphQL query). A mutation, a form post, a beacon or anything unparseable is aborted.
function readOnly(req) {
  const method = req.method();
  if (method === "GET" || method === "HEAD") return true;
  if (method !== "POST" || !/\/graphql\b|non-user-graphql/.test(new URL(req.url()).pathname)) return false;
  try {
    const body = JSON.parse(req.postData() || "");
    const ops = Array.isArray(body) ? body : [body];
    return ops.length > 0 && ops.every((op) => typeof op.query === "string" && /^\s*(query\b|\{)/.test(op.query.replace(/^\s*#.*$/gm, "")) && !/\bmutation\b|\bsubscription\b/.test(op.query));
  } catch {
    return false;
  }
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
      await page.route("**/*", (route) => (readOnly(route.request()) ? route.continue() : (blocked++, route.abort("blockedbyclient"))));
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
      // An application is a resume input plus at least one required field; Ashby renders one without a <form> element.
      r.status = r.resume_inputs > 0 && (r.fields || []).some((f) => f.required) ? "application" : r.http_status === 403 ? "blocked_403" : "no_application";
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
module.exports = { renderAll, pageSummary, readOnly, publicURL };
