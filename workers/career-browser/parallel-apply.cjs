"use strict";
// Deterministic browser apply worker (no model calls, no network beyond the page it is given): takes prepared
// application payloads and fills + submits Greenhouse-style and Lever-style forms in a bounded pool of headless
// Chromium contexts, with retries.
//
// Rules it enforces in code (CLAUDE.md, D-007):
//  - exact payload: `approval.payloadHash` must equal the hash of {url, ats, facts, answers, resume.sha256}; any change
//    after approval refuses the run.
//  - one resume: the file at resume.path must hash to resume.sha256 and resume.preparedWithSha256 (the file the
//    application was prepared with); it is the only file ever uploaded.
//  - no invented facts: a field is filled only from payload.facts / payload.answers. A required field with no value stops
//    the run as needs_user naming the field. An optional field with no value is left blank.
//  - no bot-check work: a captcha/"verify you are human" page stops the run as needs_user/bot_check. Never solved.
//  - at most once: a failure BEFORE the submit click is retried (fresh context); once submit is clicked the run is never
//    retried: a missing confirmation is unknown_outcome.
//  - local only by default: only loopback hosts are driven. Real employer hosts need `allowHosts` from the caller
//    (the owner-run approve-first path), and this module never discovers or logs in anywhere.
const fs = require("node:fs");
const crypto = require("node:crypto");

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const canonical = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
function payloadHash(p) {
  return sha256(canonical({ url: p.url, ats: p.ats, facts: p.facts, answers: p.answers || {}, resume: p.resume && p.resume.sha256 }));
}

// Which confirmed fact fills which control, by its label (deterministic; the order matters: first match wins).
const FACT_RULES = [
  [/^first name\b/i, "first_name"], [/^last name\b/i, "last_name"], [/^(full )?name\b/i, "full_name"],
  [/^email\b/i, "email"], [/^phone\b/i, "phone"], [/^(current )?(company|employer)\b/i, "current_company"],
  [/^linkedin\b/i, "linkedin_url"],
];
const BOT_RE = /verify you are human|g-recaptcha|h-captcha|cf-turnstile|are you a robot/i;
const CONFIRM_RE = /thank you for applying|application (has been )?submitted|we['’]ve received your application/i;

function valueFor(label, facts, answers) {
  const clean = label.replace(/\s*\*\s*$/, "").trim();
  if (answers && Object.prototype.hasOwnProperty.call(answers, clean)) return answers[clean];
  if (/^first name/i.test(clean) && facts.first_name) return facts.first_name;
  if (/^last name/i.test(clean) && facts.last_name) return facts.last_name;
  for (const [re, key] of FACT_RULES) {
    if (!re.test(clean)) continue;
    if (key === "full_name") return facts.full_name || (facts.first_name && facts.last_name ? `${facts.first_name} ${facts.last_name}` : undefined);
    return facts[key];
  }
  return undefined;
}

class NeedsUser extends Error { constructor(reason, field) { super(`${reason}${field ? `: ${field}` : ""}`); this.reason = reason; this.field = field; } }

function checkPayload(p, { allowHosts = [] } = {}) {
  if (!p || !p.url || !p.facts || !p.resume) throw new NeedsUser("invalid_payload");
  const host = new URL(p.url).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host) && !allowHosts.includes(host)) throw new NeedsUser("host_not_allowed", host);
  if (!p.approval || p.approval.payloadHash !== payloadHash(p)) throw new NeedsUser("not_approved", "payload changed after approval or never approved");
  const bytes = fs.readFileSync(p.resume.path);
  const h = sha256(bytes);
  if (h !== p.resume.sha256 || h !== p.resume.preparedWithSha256) throw new NeedsUser("resume_mismatch", "the resume is not the one this application was prepared with");
}

// One attempt in its own fresh context. Returns a result; throws NeedsUser for a stop, Error for a retryable failure.
async function attempt(browser, p, opts, timing) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(opts.stepTimeoutMs || 15000);
  try {
    const t0 = Date.now();
    const resp = await page.goto(p.url, { waitUntil: "domcontentloaded" });
    if (!resp || resp.status() >= 400) throw new Error(`page_load_${resp ? resp.status() : "none"}`);
    if (BOT_RE.test(await page.content()) && !(await page.$("form"))) throw new NeedsUser("bot_check", p.url);
    // An employer that wants the person to sign in first: never signed into, never given a password (the person does that).
    if (await page.$('input[type="password"]')) throw new NeedsUser("login_required", p.url);
    timing.load = Date.now() - t0;
    const t1 = Date.now();
    const controls = await page.$$eval("form input, form select, form textarea", (els) => els.filter((e) => !["hidden", "submit"].includes(e.type)).map((e) => {
      const lab = (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)) || e.closest("label");
      return { id: e.id, name: e.name, type: e.type, tag: e.tagName.toLowerCase(), required: e.required, label: lab ? lab.textContent.replace(/\s+/g, " ").trim() : e.name };
    }));
    if (!controls.length || !(await page.$('form button[type="submit"]'))) throw new NeedsUser("no_application_form_found", p.url);
    const filled = [];
    for (const c of controls) {
      const sel = `[name="${c.name.replace(/"/g, '\\"')}"]`;
      if (c.type === "file") {
        await page.setInputFiles(sel, p.resume.path); filled.push({ field: c.label, source: "resume" }); continue;
      }
      const v = valueFor(c.label, p.facts, p.answers);
      if (v === undefined || v === null || v === "") {
        if (c.required) throw new NeedsUser("missing_required_answer", c.label);
        continue;
      }
      if (c.tag === "select") await page.selectOption(sel, { label: String(v) });
      else await page.fill(sel, String(v));
      filled.push({ field: c.label, source: p.answers && Object.prototype.hasOwnProperty.call(p.answers, c.label.replace(/\s*\*\s*$/, "").trim()) ? "answer" : "fact" });
    }
    timing.fill = Date.now() - t1;
    if (opts.shotBefore) await page.screenshot({ path: opts.shotBefore, fullPage: true });
    // The caller records "submitting" (and re-checks its lease and kill switch) BEFORE the click; a refusal stops here, unsent.
    if (opts.onPhase) await opts.onPhase("submitting");
    // Past this line nothing is retried: the employer may have received it.
    const t2 = Date.now();
    timing.submitClicked = true;
    try {
      await Promise.all([page.waitForLoadState("domcontentloaded"), page.click('button[type="submit"]')]);
      await page.waitForSelector("#confirmation, h1", { timeout: opts.stepTimeoutMs || 15000 });
    } catch (e) {
      return { status: "unknown_outcome", reason: `after submit: ${e.message.split("\n")[0]}`, filled };
    }
    timing.submit = Date.now() - t2;
    const text = (await page.textContent("body")) || "";
    if (opts.shotAfter) await page.screenshot({ path: opts.shotAfter, fullPage: true });
    if (!CONFIRM_RE.test(text)) return { status: "unknown_outcome", reason: "no confirmation text on the page after submit", filled };
    const code = /\b(?:GH|LV)-[A-Z0-9-]+/.exec(text);
    return { status: "submitted_page_confirmed", confirmation: code ? code[0] : null, filled };
  } finally {
    await ctx.close();
  }
}

async function applyOne(browser, p, opts = {}) {
  const started = Date.now();
  const timing = {};
  const out = { id: p.id, ats: p.ats, url: p.url, attempts: 0 };
  try {
    checkPayload(p, opts);
  } catch (e) {
    if (e instanceof NeedsUser) return { ...out, status: "not_submitted", reason: e.reason, field: e.field, ms: Date.now() - started };
    throw e;
  }
  const max = 1 + (opts.retries ?? 2);
  for (let n = 1; n <= max; n++) {
    out.attempts = n;
    const t = {};
    try {
      const r = await attempt(browser, p, { ...opts, shotBefore: opts.shotDir && `${opts.shotDir}/${p.id}-1-filled.png`, shotAfter: opts.shotDir && `${opts.shotDir}/${p.id}-2-confirmation.png` }, t);
      return { ...out, ...r, timing: t, ms: Date.now() - started };
    } catch (e) {
      if (e instanceof NeedsUser) return { ...out, status: e.reason === "bot_check" || e.reason === "login_required" ? "needs_user" : "not_submitted", reason: e.reason, field: e.field, ms: Date.now() - started };
      if (t.submitClicked) return { ...out, status: "unknown_outcome", reason: e.message, ms: Date.now() - started };
      out.lastError = e.message.split("\n")[0];
      if (out.lastError === "page_load_429") break; // the portal said slow down: not asked again by this run
      if (n < max) await new Promise((r) => setTimeout(r, (opts.backoffMs ?? 200) * n));
    }
  }
  return { ...out, status: "not_submitted", reason: "retries_exhausted", error: out.lastError, ms: Date.now() - started };
}

// A pool of `concurrency` applications at once, results in input order.
async function runPool(browser, payloads, opts = {}) {
  const concurrency = Math.max(1, opts.concurrency || 5);
  const results = new Array(payloads.length);
  let next = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, payloads.length) }, async () => {
    while (next < payloads.length) {
      const i = next++;
      results[i] = await applyOne(browser, payloads[i], opts);
    }
  }));
  return { results, wallMs: Date.now() - started, concurrency };
}

module.exports = { applyOne, runPool, payloadHash, checkPayload, sha256, NeedsUser };
