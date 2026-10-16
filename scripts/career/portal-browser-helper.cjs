/* Portal browser helper — the Playwright side of the CA-03 browser seam.
   A long-running child process owned by packages/domain/150-career-portal-browser.js.
   It is a DUMB DOM EXECUTOR: it holds one Chromium, one isolated browser
   context per board, and executes file-delivered commands (open / discover /
   fill / readback / review / screenshot / close) against the live page.
   All policy (host allowlist, field classification, confirmed-facts-only,
   attestation discipline) lives in module 150 + module 149 — never here.
   This process clicks a submit button ONLY for the "submit_and_capture"
   command, which module 150 issues solely for an explicitly armed board
   (owner-approved submit lane), exactly once — and even then it never
   clicks through a captcha: a challenge at submit returns
   { captcha: "challenge", clicked: false }.
   Protocol: watch <dir> for cmd-<boardId>-<seq>.json, write
   resp-<boardId>-<seq>.json. Exits on a cmd-sys-*.json {type:"shutdown"}
   or after 15 idle minutes. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { validateAction, assertObservation } = require("../../workers/career-browser/protocol.cjs");
const { publicGet } = require('../../workers/career-browser/research-network.cjs');
const { publicResearchURL } = require('../../supabase/functions/_shared/career_research_policy.js');

const dir = process.argv[2];
if (!dir) { console.error("usage: portal-browser-helper.cjs <sessionDir>"); process.exit(2); }

function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  return null;
}
const pw = resolvePlaywright();
if (!pw) { fs.writeFileSync(path.join(dir, "fatal.json"), JSON.stringify({ code: "PLAYWRIGHT_UNRESOLVABLE", message: "playwright not resolvable in helper (set UPMORE_PLAYWRIGHT_PATH)" })); process.exit(3); }

const boards = new Map(); // boardId -> { context, page, url }
let browser = null;
let lastActivity = Date.now();

// Upmore-owned Chromium only. Failure to start with its sandbox enabled is
// a runtime blocker, never a reason to disable isolation or add a proxy.
async function getBrowser() {
  if (browser) return browser;
  browser = await pw.chromium.launch({ headless: true, chromiumSandbox: true,
    ...(process.env.UPMORE_CHROMIUM_PATH ? { executablePath: process.env.UPMORE_CHROMIUM_PATH } : {}) });
  return browser;
}
// §6.3 hop gate (BUG-060 / D1): the allowlist holds on EVERY main-frame
// navigation, not just the URL module 150 was asked to open. Boards
// redirect off their own host (Greenhouse -> the employer's site); the
// redirect target must never even load. Only main-frame navigation
// requests are gated — subresources (scripts, trackers, CDNs) pass
// untouched, and the one armed submit's own landing navigation is
// checked during submission too; controlled tasks reject every redirect.
const NAV_SUFFIXES = ["greenhouse.io", "lever.co", "ashbyhq.com", "smartrecruiters.com"];
function navAllowed(url) {
  let u;
  try { u = new URL(String(url)); } catch (e) { return false; }
  if (!/^https?:$/.test(u.protocol)) return true; // about:, data:, blob: — not network hops
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  return NAV_SUFFIXES.some((d) => host === d || host.endsWith("." + d));
}
async function getBoard(boardId, research = false) {
  if (!boards.has(boardId)) {
    const b = await getBrowser();
    const context = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", ...(research ? { javaScriptEnabled: false, acceptDownloads: false } : {}) });
    const page = await context.newPage();
    const entry = { context, page, research, requests: [], url: null, blockedNav: null, submitInProgress: false, scope: null, mutationSent: false };
    boards.set(boardId, entry);
    // Redirect hops never pass through page.route (a 302 target is part
    // of the initial request chain in Chromium/Playwright), but they DO
    // surface as request events — record any off-allowlist main-frame
    // navigation attempt so cmdOpen/cmdReview can stop on it, and
    // module 150's post-load final-URL gate makes the typed refusal.
    page.on("request", (req) => {
      try {
        if (!entry.research && req.isNavigationRequest() && req.frame() === page.mainFrame() && !navAllowed(req.url())) {
          entry.blockedNav = entry.blockedNav || req.url();
        }
      } catch (e) { /* frame may be gone; the final-URL gate still decides */ }
    });
    await context.route("**/*", async (route) => {
      try {
        const req = route.request();
        if (entry.research) {
          if (!req.isNavigationRequest() || req.frame() !== page.mainFrame()) { await route.abort('blockedbyclient'); return; }
          const event = { url: req.url(), method: req.method(), at: new Date().toISOString(), status: 'refused' }; entry.requests.push(event);
          try {
            if (entry.requests.length > 12 || req.method() !== 'GET' || !req.isNavigationRequest() || req.frame() !== page.mainFrame() || req.url() !== entry.scope.url) throw Object.assign(new Error('research request refused'), { code: 'RESEARCH_REQUEST_REFUSED' });
            const response = await publicGet(req.url(), { origin: entry.scope.origin });
            entry.sourceSha256 = crypto.createHash('sha256').update(response.body).digest('hex');
            event.status = 'read'; event.httpStatus = response.status; event.sourceSha256 = entry.sourceSha256;
            await route.fulfill({ status: response.status, headers: response.headers, body: response.body });
          } catch (e) { event.code = e.code || 'RESEARCH_NETWORK_FAILED'; entry.blockedNav = event.code; await route.abort('blockedbyclient'); }
          return;
        }
        if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !navAllowed(req.url())) {
          entry.blockedNav = req.url();
          await route.abort("blockedbyclient");
          return;
        }
        if (entry.scope) {
          if (req.frame() !== page.mainFrame()) { await route.abort("blockedbyclient"); return; }
          const u = new URL(req.url());
          if (u.origin !== entry.scope.origin) { await route.abort("blockedbyclient"); return; }
          if (!["GET", "HEAD"].includes(req.method())) {
            if (!entry.submitInProgress || entry.mutationSent || req.method() !== "POST" || req.url() !== entry.scope.submitUrl) {
              await route.abort("blockedbyclient"); return;
            }
            entry.mutationSent = true;
            const response = await route.fetch({ maxRedirects: 0, headers: { ...req.headers(), "x-upmore-task": entry.scope.taskId,
              "x-upmore-user": entry.scope.userId, "x-upmore-review": entry.scope.payloadSha256,
              "x-upmore-resume": entry.scope.resumeSha256 } });
            if (response.status() >= 300 && response.status() < 400) {
              entry.blockedNav = new URL(response.headers().location || "/", req.url()).href;
              await route.fulfill({ status: 403, body: "Controlled portal redirect refused" }); return;
            }
            await route.fulfill({ response });
            return;
          }
          // Following an HTTP redirect can escape request interception.
          // Controlled local portals must answer directly; stop every redirect
          // before a second request, including an authorized POST's landing.
          const response = await route.fetch({ maxRedirects: 0 });
          if (response.status() >= 300 && response.status() < 400) {
            entry.blockedNav = new URL(response.headers().location || "/", req.url()).href;
            await route.fulfill({ status: 403, body: "Controlled portal redirect refused" }); return;
          }
          await route.fulfill({ response }); return;
        }
        await route.continue();
      } catch (e) { try { await route.abort("blockedbyclient"); } catch (_) { /* already handled */ } }
    });
  }
  return boards.get(boardId);
}

// ---------- in-page helpers (self-contained; serialized by Playwright) ----------
function fnDetectChallenge() {
  const vis = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  const sels = [".g-recaptcha", ".h-captcha", "iframe[src*='recaptcha']", "iframe[src*='hcaptcha']", "#challenge-form"];
  for (const s of sels) { const el = document.querySelector(s); if (el && vis(el)) return "challenge"; }
  const txt = ((document.body && document.body.innerText) || "").slice(0, 4000);
  if (/verify you are human|are you a robot|unusual traffic|press and hold|checking your browser/i.test(txt)) return "challenge";
  return null;
}
function fnCaptchaTech() {
  const srcs = Array.from(document.querySelectorAll("script[src], iframe[src]")).map((e) => e.src || "");
  const tech = [];
  if (srcs.some((s) => /recaptcha/.test(s))) tech.push("recaptcha");
  if (srcs.some((s) => /hcaptcha/.test(s))) tech.push("hcaptcha");
  if (srcs.some((s) => /turnstile|challenges\.cloudflare/.test(s))) tech.push("cloudflare-turnstile");
  if (document.querySelector(".g-recaptcha")) tech.push("recaptcha-widget");
  if (document.querySelector(".h-captcha")) tech.push("hcaptcha-widget");
  return tech;
}
function fnDiscoverFields(includeHidden) {
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'));
  const clean = (t) => (t || "").replace(/\s+/g, " ").trim().slice(0, 300);
  function labelFor(el) {
    let t = "";
    if (el.id) { const l = document.querySelector('label[for="' + esc(el.id) + '"]'); if (l) t = l.innerText || l.textContent || ""; }
    if (!t) { const wrap = el.closest("label"); if (wrap) t = wrap.innerText || wrap.textContent || ""; }
    if (!t) {
      let node = el;
      for (let i = 0; i < 4 && node; i++) {
        node = node.parentElement; if (!node) break;
        const labs = Array.from(node.querySelectorAll(":scope > label, :scope > .field-label, :scope > .label"));
        const lab = labs.find((x) => !x.contains(el));
        if (lab) { t = lab.innerText || lab.textContent || ""; break; }
      }
    }
    if (!t) t = el.getAttribute("aria-label") || el.getAttribute("placeholder") || "";
    return clean(t);
  }
  function groupLabelFor(el) {
    const fs = el.closest("fieldset");
    if (fs) { const lg = fs.querySelector("legend"); if (lg) return lg.innerText || lg.textContent || ""; }
    let node = el;
    for (let i = 0; i < 5 && node; i++) {
      node = node.parentElement; if (!node) break;
      const heads = Array.from(node.querySelectorAll(":scope > label, :scope > .application-label, :scope > .question, :scope > h4, :scope > .field-label"));
      const head = heads.find((x) => !x.contains(el) && (x.innerText || x.textContent || "").trim().length > 0);
      if (head) return head.innerText || head.textContent || "";
    }
    return "";
  }
  function selectorFor(el, idx) {
    if (el.id) return "#" + esc(el.id);
    if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name.replace(/"/g, '\\"') + '"]';
    return "upmore-idx-" + idx; // resolved by index fallback below
  }
  const els = Array.from(document.querySelectorAll("input, select, textarea"));
  const out = [];
  els.forEach((el, idx) => {
    const type = (el.getAttribute("type") || el.tagName).toLowerCase();
    if (type === "hidden" || type === "submit" || type === "button" || type === "image") return;
    const visible = type === "file" ? true : (el.offsetParent !== null || el.getClientRects().length > 0);
    if (!visible && !includeHidden) return;
    const label = labelFor(el);
    const f = {
      domIndex: idx, selector: selectorFor(el, idx), tag: el.tagName.toLowerCase(),
      disabled: !!el.disabled, readOnly: !!el.readOnly,
      valid: !el.validity || el.validity.valid, validationMessage: clean(el.validationMessage || ""),
      inputType: type, name: el.getAttribute("name") || "", id: el.id || "", label,
      required: !!el.required || el.getAttribute("aria-required") === "true" || /(\*|✱)\s*$/.test(label) || /required/i.test(el.getAttribute("aria-label") || ""),
    };
    // D9 (BUG-066): the card/group heading is carried for EVERY field,
    // not just radio/checkbox groups — a Lever custom card's text input
    // has no <label>, and its heading is the only human label there is.
    const gl = clean(groupLabelFor(el));
    if (gl) f.groupLabel = gl;
    if (el.tagName === "SELECT") {
      f.options = Array.from(el.options).map((o) => ({ value: o.value, label: clean(o.textContent) }));
    }
    out.push(f);
  });
  return out;
}
function fnFindApplyControl() {
  const els = Array.from(document.querySelectorAll("a, button"));
  for (const el of els) {
    if (el.offsetParent === null && el.getClientRects().length === 0) continue;
    const t = (el.innerText || el.textContent || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
    const href = el.getAttribute("href") || "";
    if (/^apply( for this job| now)?$/i.test(t) || /^i'?m interested$/i.test(t) || /\/(apply|application)(\/|$|\?)/.test(href) && /apply/i.test(t)) {
      return { text: t, href };
    }
  }
  return null;
}
// ---------- command implementations ----------
async function cmdOpen(board, cmd) {
  const page = board.page;
  const navSteps = [];
  board.blockedNav = null;
  board.scope = cmd.scope || null;
  // "commit" + a soft domcontentloaded wait: heavy ATS pages hang for a
  // long time on third-party subresources, and the form is usable long
  // before every tracker finishes (a hard domcontentloaded wait timed
  // out at 45s on a live Greenhouse page that had in fact loaded). One
  // navigation retry on a timeout — a human would refresh too; nothing
  // has been filled or sent at this point, so a retry is stateless-safe.
  // A gate-blocked navigation (BUG-060) is NOT retried: it is the stop.
  try {
    await page.goto(cmd.url, { waitUntil: "commit", timeout: 60000 });
  } catch (e) {
    await page.waitForTimeout(300); // let the request listener record a redirect hop that raced the failure
    if (board.blockedNav) {
      navSteps.push("goto-blocked:" + board.blockedNav);
      return { ok: true, captcha: null, finalUrl: board.blockedNav, blockedNavigation: board.blockedNav, fieldCount: 0, captchaTech: [], navSteps };
    }
    navSteps.push("goto-retry:" + String(e.message || e).slice(0, 80));
    await page.waitForTimeout(3000);
    await page.goto(cmd.url, { waitUntil: "commit", timeout: 60000 });
  }
  if (board.blockedNav) {
    navSteps.push("goto-blocked:" + board.blockedNav);
    return { ok: true, captcha: null, finalUrl: board.blockedNav, blockedNavigation: board.blockedNav, fieldCount: 0, captchaTech: [], navSteps };
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  board.url = page.url();
  navSteps.push("goto:" + board.url);
  let captcha = await page.evaluate(fnDetectChallenge);
  if (!captcha) {
    let fields = await page.evaluate(fnDiscoverFields);
    if (fields.length < 2 && !board.scope) {
      const apply = await page.evaluate(fnFindApplyControl);
      if (apply) {
        try {
          await Promise.all([
            page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {}),
            page.evaluate((a) => {
              const els = Array.from(document.querySelectorAll("a, button"));
              const el = els.find((x) => (x.innerText || "").replace(/\s+/g, " ").trim() === a.text) || els.find((x) => (x.getAttribute("href") || "") === a.href);
              if (el) el.click();
            }, apply),
          ]);
          await page.waitForTimeout(800);
          board.url = page.url();
          navSteps.push("apply-click:" + board.url);
          captcha = await page.evaluate(fnDetectChallenge);
          fields = await page.evaluate(fnDiscoverFields);
        } catch (e) { /* stay on the posting page; discovery result stands */ }
      }
    }
    board.fieldCount = fields.length;
  }
  const tech = await page.evaluate(fnCaptchaTech).catch(() => []);
  if (board.blockedNav) {
    navSteps.push("apply-click-blocked:" + board.blockedNav);
    return { ok: true, captcha: null, finalUrl: board.blockedNav, blockedNavigation: board.blockedNav, fieldCount: 0, captchaTech: tech, navSteps };
  }
  return { ok: true, captcha, finalUrl: board.url, fieldCount: board.fieldCount || 0, captchaTech: tech, navSteps };
}

async function cmdDiscover(board) {
  const fields = await board.page.evaluate(fnDiscoverFields);
  const version = crypto.randomUUID();
  const handles = board.handles || new Map(); // retained only for rechecking prior steps before commit
  for (const f of fields) {
    f.ref = version + ":f:" + f.domIndex;
    const h = f.selector.startsWith("upmore-idx-")
      ? await board.page.locator("input,select,textarea").nth(f.domIndex).elementHandle()
      : await board.page.locator(f.selector).elementHandle();
    if (h) handles.set(f.ref, h);
  }
  const controls = [];
  const buttons = await board.page.locator("button,input[type=submit],a[role=button]").elementHandles();
  for (let i = 0; i < buttons.length; i++) {
    const value = await buttons[i].evaluate((el) => ({ label: (el.innerText || el.value || "").trim().slice(0, 200),
      disabled: !!el.disabled || el.getAttribute("aria-disabled") === "true", visible: !!el.getClientRects().length }));
    if (!value.visible) continue;
    const ref = version + ":b:" + i;
    controls.push({ ref, ...value, kind: /^next$|^continue$|^review application$|^save and continue$/i.test(value.label) ? "next" : /submit/i.test(value.label) ? "submit" : "other" });
    handles.set(ref, buttons[i]);
  }
  const text = await board.page.evaluate(() => {
    const visible = (el) => !!el.getClientRects().length;
    const lines = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible).map((el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300)).filter(Boolean).slice(0, 12);
    return { instructions: lines("h1,h2,p,legend,.instructions"), errors: lines('[role=alert],.error,.validation-error,[aria-invalid=true]') };
  });
  board.refMetadata = board.refMetadata || new Map();
  for (const field of fields) board.refMetadata.set(field.ref, field);
  board.observation = { version, frame: "main", origin: new URL(board.page.url()).origin, untrusted: true,
    fields, controls, ...text };
  board.handles = handles;
  board.fieldCount = fields.length;
  return { fields, observation: board.observation };
}
async function connected(board, ref) {
  const h = board.handles && board.handles.get(ref);
  if (!h || !await h.evaluate((el) => el.isConnected)) throw Object.assign(new Error("the observed DOM node changed; re-observe"), { code: "STALE_OBSERVATION" });
  const previous = board.refMetadata && board.refMetadata.get(ref);
  if (previous) {
    const fields = await board.page.evaluate(fnDiscoverFields, true);
    const current = fields.find((f) => f.selector === previous.selector);
    if (!current || ["label", "name", "inputType", "groupLabel"].some((key) => current[key] !== previous[key])) {
      throw Object.assign(new Error("the field meaning changed; re-observe"), { code: "STALE_OBSERVATION" });
    }
  }
  return h;
}

const normOpt = (s) => String(s || "").toLowerCase().replace(/[’‘]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
// D8 (BUG-067): the EEO decline default is ONE semantic choice worded a
// dozen ways across boards ("Decline to self-identify", "Decline",
// "Prefer not to answer", "I don't wish to answer", "Do not wish to
// disclose"...). Exact text matching made the §6.1 default unreliable;
// decline-class equivalence is matched explicitly, nothing else is.
const isDeclineText = (s) => /decline|prefer not|do not wish|dont wish|not (to )?answer|not (to )?disclose|no answer/.test(normOpt(s));
function matchOption(options, value) {
  const v = normOpt(value);
  if (!v) return null;
  let hit = options.find((o) => normOpt(o.label) === v || normOpt(o.value) === v);
  if (hit) return hit;
  const head = v.split(/\s*[—–(]\s*/)[0].trim(); // "yes — authorized..." -> "yes"
  hit = options.find((o) => normOpt(o.label) === head || normOpt(o.value) === head);
  if (hit) return hit;
  if (isDeclineText(v)) {
    hit = options.find((o) => isDeclineText(o.label) || isDeclineText(o.value));
    if (hit) return hit;
  }
  hit = options.find((o) => normOpt(o.label).startsWith(v) || v.startsWith(normOpt(o.label)) && normOpt(o.label).length > 1);
  return hit || null;
}

async function cmdFill(board, cmd) {
  const b = cmd.binding, value = cmd.value;
  const refs = b.elementRefs;
  const nodes = [];
  for (const ref of refs) nodes.push(await connected(board, ref));
  if (b.inputType === "name_pair") {
    const parts = String(value).trim().split(/\s+/);
    await nodes[0].fill(parts[0] || ""); await nodes[1].fill(parts.slice(1).join(" "));
  } else if (b.inputType === "file") {
    const bytes = fs.readFileSync(cmd.filePath);
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== value.sha256) throw Object.assign(new Error("resume bytes changed before upload"), { code: "RESUME_SHA_MISMATCH" });
    await nodes[0].setInputFiles({ name: value.filename, mimeType: "application/octet-stream", buffer: bytes });
  } else if (b.inputType === "select") {
    const hit = matchOption(b.options || [], value);
    if (!hit) return { filled: false, reason: "option_not_found" };
    await nodes[0].selectOption({ value: hit.value });
  } else if (["radio_group", "checkbox_group"].includes(b.inputType)) {
    for (const desired of (Array.isArray(value) ? value : [value])) {
      const hit = matchOption(b.options || [], desired);
      if (!hit) return { filled: false, reason: "option_not_found" };
      await (await connected(board, hit.ref)).check();
    }
  } else if (b.inputType === "checkbox") {
    if (value === true || value === "true") await nodes[0].check(); else await nodes[0].uncheck();
  } else await nodes[0].fill(String(value));
  return { filled: true };
}
async function cmdReadback(board, cmd) {
  const answers = {};
  for (const b of cmd.bindings) {
    const nodes = [];
    for (const ref of b.elementRefs || []) nodes.push(await connected(board, ref));
    if (!nodes.length) continue;
    let value;
    if (b.inputType === "name_pair") value = (await nodes[0].inputValue()) + " " + (await nodes[1].inputValue());
    else if (b.inputType === "file") value = await nodes[0].evaluate(async (el) => {
      const f = el.files && el.files[0]; if (!f) return null;
      const digest = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
      return { filename: f.name, sha256: Array.from(new Uint8Array(digest)).map((n) => n.toString(16).padStart(2, "0")).join("") };
    });
    else if (b.inputType === "select") value = await nodes[0].evaluate((el) => el.options[el.selectedIndex]?.textContent.trim() || "");
    else if (b.inputType === "checkbox") value = await nodes[0].isChecked();
    else if (["radio_group", "checkbox_group"].includes(b.inputType)) {
      const chosen = [];
      for (const opt of b.options || []) if (await (await connected(board, opt.ref)).isChecked()) chosen.push(opt.label);
      value = b.inputType === "radio_group" ? chosen[0] : chosen;
    } else value = await nodes[0].inputValue();
    if (value !== null && value !== undefined && value !== "" && !/^select/i.test(String(value))) answers[b.field_id] = value;
  }
  return { answers };
}

async function cmdReview(board, cmd) {
  const page = board.page;
  const captcha = await page.evaluate(fnDetectChallenge);
  if (captcha) return { captcha: "challenge", finalUrl: page.url() };
  const fields = await page.evaluate(fnDiscoverFields);
  if (fields.some((f) => !(cmd.knownSelectors || []).includes(f.selector))) return { needsFields: true, finalUrl: page.url() };
  const invalid = fields.filter((f) => !f.disabled && f.required && !f.valid);
  if (invalid.length) return { code: "FORM_VALIDATION_FAILED", finalUrl: page.url() };
  for (const control of board.observation.controls) {
    const handle = await connected(board, control.ref);
    if (control.disabled === await handle.isEnabled()) return { needsFields: true, finalUrl: page.url() };
  }
  const next = board.observation.controls.find((c) => c.kind === "next" && !c.disabled);
  if (next) {
    await (await connected(board, next.ref)).click({ timeout: 20000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
    return { advanced: true, finalUrl: board.blockedNav || page.url(), blockedNavigation: board.blockedNav };
  }
  const submit = board.observation.controls.find((c) => c.kind === "submit" && !c.disabled);
  return { atFinalReview: !!submit, finalUrl: page.url() };
}

/* The one submit click in this process — reachable only from an armed
 * module-150 board. Clicks the marked submit control exactly once, lets
 * the destination settle, then captures the employer's answer: landing
 * URL, page text, and a screenshot. A challenge before or after the click
 * is reported, never fought. */
async function cmdSubmitCapture(board, cmd) {
  const page = board.page;
  const captchaBefore = await page.evaluate(fnDetectChallenge);
  if (captchaBefore) return { captcha: "challenge", clicked: false };
  const submit = board.observation.controls.find((c) => c.kind === "submit" && !c.disabled);
  if (!submit) return { clicked: false, reason: "no_submit_control" };
  const handle = await connected(board, submit.ref);
  if (!await handle.isEnabled()) return { clicked: false, reason: "submit_disabled" };
  // Approval never suspends destination checks. Scoped tasks permit one
  // POST to their exact controlled destination, with the task identity.
  board.mutationSent = false;
  board.submitInProgress = true;
  try { await handle.click({ timeout: 20000 }); }
  finally { /* landing waits below still belong to the submit capture */ }
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  board.submitInProgress = false;
  if (board.blockedNav) return { clicked: true, finalUrl: board.blockedNav, text: "", blockedNavigation: board.blockedNav };
  const captcha = await page.evaluate(fnDetectChallenge);
  const text = await page.evaluate(() => ((document.body && document.body.innerText) || "").replace(/\s+/g, " ").slice(0, 6000)).catch(() => "");
  let screenshot = null;
  if (cmd.screenshotPath) {
    try { await page.screenshot({ path: cmd.screenshotPath, fullPage: true }); screenshot = cmd.screenshotPath; } catch (e) { /* capture failure is reported as a null ref, never invented */ }
  }
  return { clicked: true, captcha: captcha || null, finalUrl: page.url(), text, screenshot };
}

async function execute(boardId, cmd) {
  validateAction(cmd);
  if (cmd.type === "shutdown") { setTimeout(() => process.exit(0), 50); return { ok: true }; }
  if (cmd.type === 'close') {
    const existing = boards.get(boardId);
    if (existing) { await existing.context.close().catch(() => {}); boards.delete(boardId); }
    return { ok: true };
  }
  const board = await getBoard(boardId, cmd.type === 'read_public_page');
  if (board.research && !['read_public_page','close'].includes(cmd.type)) throw Object.assign(new Error('research exposes no mutation command'), { code: 'RESEARCH_ACTION_REFUSED' });
  if (["fill", "readback", "verify_payload", "review", "submit_and_capture"].includes(cmd.type)) assertObservation(cmd, board.observation, board.scope, board.page.url());
  switch (cmd.type) {
    case 'read_public_page': {
      if (!board.research || board.url) throw Object.assign(new Error('one explicit URL per research board'), { code: 'RESEARCH_ACTION_REFUSED' });
      publicResearchURL(cmd.url); board.url = cmd.url; board.scope = { ...cmd.scope, url: cmd.url };
      try { await board.page.goto(cmd.url, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
      catch (e) { throw Object.assign(new Error('public source could not be read'), { code: board.blockedNav || 'RESEARCH_NAVIGATION_BLOCKED' }); }
      if (board.blockedNav || board.page.url() !== cmd.url) throw Object.assign(new Error('public source navigation changed'), { code: board.blockedNav || 'RESEARCH_REDIRECT_REFUSED' });
      const dom = await board.page.evaluate(() => {
        const visible = el => !!(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        const gate = document.querySelector('input[type=password],iframe[src*="captcha"],.g-recaptcha,[data-sitekey],[aria-modal=true]');
        const text = (document.body?.innerText || '').slice(0, 24000);
        return { title: document.title.slice(0,300), text, dynamic: /enable javascript|javascript is required/i.test(text), gate: !!gate || /verify (?:you are|you're) human|access denied|sign in to continue|subscribe to (?:continue|read)/i.test(text),
          headings: Array.from(document.querySelectorAll('h1,h2,h3')).filter(visible).slice(0,40).map(e=>e.innerText.slice(0,250)),
          links: Array.from(document.querySelectorAll('a[href]')).filter(visible).slice(0,100).map(e=>({text:e.innerText.slice(0,200),url:e.href})) };
      });
      const links=dom.links.filter(link=>{try{return new URL(publicResearchURL(link.url)).origin===board.scope.origin;}catch(_){return false;}});
      const screenshot = await board.page.screenshot({ type: 'png', fullPage: false });
      if (screenshot.length > 500000) throw Object.assign(new Error('research screenshot exceeded bounded evidence budget'), { code: 'RESEARCH_EVIDENCE_TOO_LARGE' });
      return { version: 'public_research_capture/v1', provenance: 'owned_chromium_dom', taskId: cmd.scope.taskId, intentId: cmd.scope.intentId, sessionId: boardId,
        url: board.page.url(), capturedAt: new Date().toISOString(), untrusted: true, sourceSha256: board.sourceSha256,
        blocked: dom.gate ? 'PUBLIC_GATE_REQUIRES_HANDOFF' : dom.dynamic ? 'PUBLIC_SOURCE_REQUIRES_JAVASCRIPT' : null, title: dom.title, text: dom.text, headings: dom.headings, links,
        navigation: board.requests, screenshot: { mimeType: 'image/png', bytes: screenshot.length, sha256: crypto.createHash('sha256').update(screenshot).digest('hex'), base64: screenshot.toString('base64') } };
    }
    case "open": return await cmdOpen(board, cmd);
    case "discover": return await cmdDiscover(board);
    case "fill": return await cmdFill(board, cmd);
    case "readback": return await cmdReadback(board, cmd);
    case "verify_payload": {
      const { answers } = await cmdReadback(board, cmd);
      if (answers.resume) answers.resume_sha256 = answers.resume.sha256;
      return { matches: Object.entries(cmd.payload).every(([key, value]) => JSON.stringify(answers[key]) === JSON.stringify(value)) };
    }
    case "review": return await cmdReview(board, cmd);
    case "submit_and_capture": return await cmdSubmitCapture(board, cmd);
    case "screenshot": await board.page.screenshot({ path: cmd.path, fullPage: true }); return { path: cmd.path };
    case "close": await board.context.close().catch(() => {}); boards.delete(boardId); return { ok: true };
    default: throw Object.assign(new Error("unknown command " + cmd.type), { code: "BAD_COMMAND" });
  }
}

// ---------- file-command loop ----------
const seen = new Set();
async function pump() {
  let files;
  try { files = fs.readdirSync(dir).filter((f) => f.startsWith("cmd-") && f.endsWith(".json")); } catch (e) { return; }
  files.sort();
  for (const f of files) {
    if (seen.has(f)) continue;
    seen.add(f);
    lastActivity = Date.now();
    const full = path.join(dir, f);
    let cmd;
    try { cmd = JSON.parse(fs.readFileSync(full, "utf8")); } catch (e) { continue; }
    const respName = "resp-" + f.slice(4);
    try {
      const data = await execute(cmd.boardId || "sys", cmd);
      fs.writeFileSync(path.join(dir, respName + ".tmp"), JSON.stringify({ ok: true, data }));
    } catch (e) {
      fs.writeFileSync(path.join(dir, respName + ".tmp"), JSON.stringify({ ok: false, error: { code: /SUID sandbox|sandbox.*abort|No usable sandbox/i.test(String(e.message)) ? "BROWSER_SANDBOX_UNAVAILABLE" : e.code || "DRIVER_ERROR", message: String(e.message || e) } }));
    }
    try { fs.renameSync(path.join(dir, respName + ".tmp"), path.join(dir, respName)); } catch (e) {}
    try { fs.unlinkSync(full); } catch (e) {}
  }
}
fs.writeFileSync(path.join(dir, "ready.json"), JSON.stringify({ pid: process.pid, at: Date.now() }));
setInterval(() => {
  pump().catch(() => {});
  if (Date.now() - lastActivity > 15 * 60 * 1000) process.exit(0);
}, 25);
