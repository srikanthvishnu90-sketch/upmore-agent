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
const { pollUntil, waitForDom, ladderForced } = require("./wait-primitives.cjs");
// Event-driven waits (chunk 60%, 2026-10-22 — docs/apply/EVENT-DRIVEN-FILLS-2026-10-22.md):
// each converted wait proceeds on its observable instead of sleeping a
// fixed budget, bounded by the same budget the sleep used. The kill
// switch is named config data: env UPMORE_EVENT_WAITS — unset/"all" =
// event-driven everywhere, "off" = every converted wait runs its old
// ladder form, a comma list forces only the named waits back.
const EVENT_WAIT_LADDER = (name) => ladderForced(process.env.UPMORE_EVENT_WAITS, name);
const noteWait = (waits, name, outcome, ms) => { if (Array.isArray(waits)) waits.push({ name, outcome, ms: Math.round(ms) }); };

const dir = process.argv[2];
if (!dir) { console.error("usage: portal-browser-helper.cjs <sessionDir>"); process.exit(2); }

function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  // Restored at the v224 combine: the release line dropped this
  // fallback, which stranded every browser-tier test whose own
  // resolution uses it (the repo's test files and widget-canary all
  // resolve env → "playwright" → this sibling path). The sandboxed
  // launch below stands; this is resolution only.
  tries.push(path.join(__dirname, "..", "..", "..", "sporve-agent-clone", "node_modules", "playwright"));
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
// Sandbox posture (v224 combine): sandboxed is the default and the
// production posture. Some grading hosts cannot run ANY sandboxed
// Chromium for ANY user (this VM: AppArmor-restricted unprivileged
// user namespaces behind a read-only sysctl, and root is refused by
// Chromium outright) — for those hosts an operator may set
// UPMORE_CHROMIUM_SANDBOX=off, an explicit opt-out that is recorded
// in ready.json below, never silently.
// Unset means sandboxed, always; the opt-out never engages silently.
const SANDBOX_OFF = process.env.UPMORE_CHROMIUM_SANDBOX === "off";
async function getBrowser() {
  if (browser) return browser;
  const launchOpts = { headless: true,
    ...(process.env.UPMORE_CHROMIUM_PATH ? { executablePath: process.env.UPMORE_CHROMIUM_PATH } : {}) };
  if (SANDBOX_OFF) { launchOpts.args = ["--no-sandbox"]; }
  else { launchOpts.chromiumSandbox = true; }
  browser = await pw.chromium.launch(launchOpts);
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
async function getBoard(boardId) {
  if (!boards.has(boardId)) {
    const b = await getBrowser();
    const context = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage();
    const entry = { context, page, url: null, blockedNav: null, submitInProgress: false, scope: null, mutationSent: false };
    boards.set(boardId, entry);
    // Redirect hops never pass through page.route (a 302 target is part
    // of the initial request chain in Chromium/Playwright), but they DO
    // surface as request events — record any off-allowlist main-frame
    // navigation attempt so cmdOpen/cmdReview can stop on it, and
    // module 150's post-load final-URL gate makes the typed refusal.
    page.on("request", (req) => {
      try {
        if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !navAllowed(req.url())) {
          entry.blockedNav = entry.blockedNav || req.url();
        }
      } catch (e) { /* frame may be gone; the final-URL gate still decides */ }
    });
    await context.route("**/*", async (route) => {
      try {
        const req = route.request();
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
/* Open-render observable (W7/W8): the form's fields have rendered, or
 * a challenge stands in their place. Self-contained for waitForFunction. */
function fnFormPresent() {
  if (document.querySelectorAll("input, select, textarea").length > 0) return true;
  const vis = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  const sels = [".g-recaptcha", ".h-captcha", "iframe[src*='recaptcha']", "iframe[src*='hcaptcha']", "#challenge-form"];
  return sels.some((s) => vis(document.querySelector(s)));
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
    if (el.name) {
      const base = el.tagName.toLowerCase() + '[name="' + el.name.replace(/"/g, '\\"') + '"]';
      // Depth-E (live Neighbor/Lever defect, 2026-10-16): radio and
      // checkbox inputs SHARE one name across the whole group by
      // design, so the bare name selector matches every option in the
      // group and strict handle resolution throws — the drive died in
      // discovery before a single field was classified. The value is
      // what distinguishes group members; qualify with it. A member
      // with no value keeps the index fallback.
      const t = (el.getAttribute("type") || "").toLowerCase();
      if ((t === "radio" || t === "checkbox") && el.getAttribute("value")) {
        return base + '[value="' + el.getAttribute("value").replace(/"/g, '\\"') + '"]';
      }
      return base;
    }
    return "upmore-idx-" + idx; // resolved by index fallback below
  }
  const els = Array.from(document.querySelectorAll("input, select, textarea"));
  const out = [];
  els.forEach((el, idx) => {
    const type = (el.getAttribute("type") || el.tagName).toLowerCase();
    if (type === "hidden" || type === "submit" || type === "button" || type === "image") return;
    // BUG-237 (ported at the v224 combine; live liontree census,
    // 2026-10-15): react-select keeps a hidden validation dummy (class
    // *-requiredInput, type text, CSS-invisible but with layout rects)
    // next to every widget. It is plumbing, never a fillable field —
    // discovered as one, it mints a phantom def for the widget's
    // question (the Degree widget gained a second, standard
    // education_degree def that the drive then tried to fill by name,
    // into an invisible input).
    if (typeof el.className === "string" && /requiredInput/.test(el.className)) return;
    const visible = type === "file" ? true : (el.offsetParent !== null || el.getClientRects().length > 0);
    if (!visible && !includeHidden) return;
    const label = labelFor(el);
    const f = {
      domIndex: idx, selector: selectorFor(el, idx), tag: el.tagName.toLowerCase(),
      disabled: !!el.disabled, readOnly: !!el.readOnly,
      valid: !el.validity || el.validity.valid, validationMessage: clean(el.validationMessage || ""),
      inputType: type, name: el.getAttribute("name") || "", id: el.id || "", label,
      cls: typeof el.className === "string" ? el.className.slice(0, 120) : "",
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
  // W7: the 1200 ms settle waited for the form to render; wait ON the
  // render (fields present, or a challenge) at the same cap instead.
  if (EVENT_WAIT_LADDER("open_render")) { await page.waitForTimeout(1200); navSteps.push("open-wait:ladder"); }
  else {
    const r = await waitForDom(page, fnFormPresent, null, { timeoutMs: 1200 }).catch(() => ({ timedOut: true, waitedMs: 1200 }));
    navSteps.push("open-wait:" + (r.timedOut ? "timeout" : "event") + ":" + Math.round(r.waitedMs));
  }
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
          // W8: same conversion as W7 at the post-click cap.
          if (EVENT_WAIT_LADDER("open_render")) await page.waitForTimeout(800);
          else await waitForDom(page, fnFormPresent, null, { timeoutMs: 800 }).catch(() => {});
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

/* Handle capture for one discovered field. A selector that resolves
 * to more than one element (any same-name shape discovery did not
 * qualify) must degrade to the field's document index — never throw
 * and kill the whole drive in discovery (Depth-E, live Lever defect,
 * 2026-10-16: strict-mode violation on a radio group's shared name). */
async function resolveFieldHandle(page, f) {
  try {
    return f.selector.startsWith("upmore-idx-")
      ? await page.locator("input,select,textarea").nth(f.domIndex).elementHandle()
      : await page.locator(f.selector).elementHandle();
  } catch (e) {
    try { return await page.locator("input,select,textarea").nth(f.domIndex).elementHandle(); }
    catch (e2) { return null; }
  }
}

async function cmdDiscover(board) {
  const fields = await board.page.evaluate(fnDiscoverFields);
  const version = crypto.randomUUID();
  const handles = board.handles || new Map(); // retained only for rechecking prior steps before commit
  for (const f of fields) {
    f.ref = version + ":f:" + f.domIndex;
    const h = await resolveFieldHandle(board.page, f);
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
/* One meaning table per command (widget/attach fix, 2026-10-21 —
 * docs/career/widget-attach-root-cause-2026-10-21.md): connected()
 * used to run a FULL fnDiscoverFields scan on every ref check, so a
 * readback over ~30 bindings (one check per option of a 60-option
 * group) ran 100-225 scans and died at the caller's 30 s cap on live
 * Lever pages. The meaning comparison only needs the field table as
 * of THIS command: scan once, cache on the board, clear per command
 * in execute(). Node liveness stays per-ref and live (the
 * isConnected check below); only the meaning table is shared. */
async function meaningFields(board) {
  if (!board._snapshotFields) board._snapshotFields = await board.page.evaluate(fnDiscoverFields, true);
  return board._snapshotFields;
}
async function connected(board, ref) {
  const h = board.handles && board.handles.get(ref);
  if (!h || !await h.evaluate((el) => el.isConnected)) throw Object.assign(new Error("the observed DOM node changed; re-observe"), { code: "STALE_OBSERVATION" });
  const previous = board.refMetadata && board.refMetadata.get(ref);
  if (previous) {
    const fields = await meaningFields(board);
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
const isDeclineText = (s) => /decline|prefer not|do not wish|don t wish|dont wish|not (to )?answer|not (to )?disclose|no answer/.test(normOpt(s));
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

/* ---- v224 combine: R-1 (BUG-237/FR-395) fill semantics, ported onto
 * the release line's ref/observation protocol ----
 * A fill is not done when the fill call returns: the live boards'
 * remount cycles replace filled DOM nodes and the value vanishes while
 * the driver reports success (BUG-207, 2026-10-15: Arc kept 3/17
 * values, Labelbox 2/8 on the armed run). So every fill here is
 * FILL-THEN-READBACK per field — fill, let the board settle, read the
 * value back the way the BOARD renders it, and re-fill on a mismatch
 * (bounded attempts, growing settle). A field whose value will not
 * persist returns { filled: false, reason: "value_did_not_persist" }.
 * A STALE_OBSERVATION from the ref layer still propagates untouched:
 * module 150 re-discovers and re-fills with fresh refs, which is the
 * release protocol's own recovery for a replaced node. */
const normPersist = (x) => String(x == null ? "" : x).replace(/\s+/g, " ").trim();
function persistedMatches(got, expect, inputType) {
  if (expect === "__absent__") return got === undefined;
  if (inputType === "checkbox_group") {
    if (!Array.isArray(got)) return false;
    const g = got.map(normPersist).sort(), e = (expect || []).map(normPersist).sort();
    return g.length === e.length && g.every((v, i) => v === e[i]);
  }
  if (expect === true) return got === true;
  return got !== undefined && normPersist(got) === normPersist(expect);
}
/* The value a react-select widget carries, read the way the board
 * renders it: the chosen single-value under the select CONTROL. The
 * search box's text is not a value, and the current UI's first
 * "-container" ancestor (.select__input-container) does NOT hold the
 * single-value — climbing there read every landed pick as empty
 * (BUG-237). Returns the rendered text or null. */
function fnWidgetValue(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const root = el.closest('[class*="select__control"]') || el.closest('[class*="select__container"], [class*="-container"]') || el.parentElement;
  const sv = root && root.querySelector('[class*="select__single-value"], [class*="-singleValue"]');
  const t = sv ? (sv.textContent || "").replace(/\s+/g, " ").trim() : "";
  return t || null;
}
/* Read ONE binding's current value as the board renders it (undefined
 * when the field carries no value). For a react-select widget that is
 * the single-value under the control — never the search text. */
async function readbackBinding(board, b) {
  const nodes = [];
  for (const ref of b.elementRefs || []) nodes.push(await connected(board, ref));
  if (!nodes.length) return undefined;
  let value;
  if (b.widget === "react-select") {
    value = await nodes[0].evaluate((el) => {
      const root = el.closest('[class*="select__control"]') || el.closest('[class*="select__container"], [class*="-container"]') || el.parentElement;
      const sv = root && root.querySelector('[class*="select__single-value"], [class*="-singleValue"]');
      const t = sv ? (sv.textContent || "").replace(/\s+/g, " ").trim() : "";
      return t || null;
    });
  }
  else if (b.inputType === "name_pair") value = (await nodes[0].inputValue()) + " " + (await nodes[1].inputValue());
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
  if (value === null || value === undefined || value === "" || /^select/i.test(String(value))) return undefined;
  return value;
}

/* One handle-based fill attempt (the release protocol's fills).
 * Returns { filled } plus, on success, `expect`: the value a readback
 * must show for the fill to count as persisted. */
async function fillOnceHandles(board, cmd) {
  const b = cmd.binding, value = cmd.value;
  const nodes = [];
  for (const ref of b.elementRefs) nodes.push(await connected(board, ref));
  if (b.inputType === "name_pair") {
    const parts = String(value).trim().split(/\s+/);
    await nodes[0].fill(parts[0] || ""); await nodes[1].fill(parts.slice(1).join(" "));
    return { filled: true, expect: [parts[0] || "", parts.slice(1).join(" ")].filter(Boolean).join(" ") };
  }
  if (b.inputType === "select") {
    const hit = matchOption(b.options || [], value);
    if (!hit) return { filled: false, reason: "option_not_found", wanted: String(value) };
    await nodes[0].selectOption({ value: hit.value });
    return { filled: true, expect: hit.label };
  }
  if (["radio_group", "checkbox_group"].includes(b.inputType)) {
    const hits = [];
    for (const desired of (Array.isArray(value) ? value : [value])) {
      const hit = matchOption(b.options || [], desired);
      if (!hit) return { filled: false, reason: "option_not_found", wanted: String(desired) };
      await (await connected(board, hit.ref)).check();
      hits.push(hit.label);
    }
    return { filled: true, expect: b.inputType === "radio_group" ? hits[0] : hits };
  }
  if (b.inputType === "checkbox") {
    if (value === true || value === "true") await nodes[0].check(); else await nodes[0].uncheck();
    return { filled: true, expect: value === true || value === "true" ? true : "__absent__" };
  }
  await nodes[0].fill(String(value));
  return { filled: true, expect: String(value) };
}

/* The react-select widget drive (BUG-207/BUG-237, ported): the visible
 * input is a search box — typed text is NOT a value. Type the value,
 * wait for the option list (the board's option service can take
 * seconds), and pick the option that names the same value with a real
 * click (or, when React re-creates the option nodes between marking
 * and clicking, an in-page pointer dispatch on a fresh node). The
 * ladder inside ONE drive — full value → first segment → first word →
 * cleared search — never retypes into a widget that is still loading
 * (a retype restarts its search), and a pick that already landed is
 * detected before any further typing so it is never overwritten. */
/* This original form is PRESERVED VERBATIM as driveWidgetLadder: it is
 * the kill-switch fallback for the widget_option wait (UPMORE_EVENT_WAITS
 * naming widget_option, or "off"), so a revert needs no code change. */
async function driveWidgetLadder(board, cmd) {
  const page = board.page;
  const b = cmd.binding;
  const wanted = String(cmd.value);
  const tok = wanted.split(",")[0].trim().toLowerCase();
  // One drive, one bounded patience budget (widget/attach fix,
  // 2026-10-21): the action timeouts used to be 20 s apiece, stacked
  // on top of the ~17 s option ladder — a never-actionable widget
  // burned ~77 s for ONE field on the live Greenhouse drive. The
  // engagement actions get 8/5/5 s, the in-ladder retries 3-5 s: a
  // live widget answers in milliseconds, a dead one fails inside
  // one bounded drive and the fill loop moves on.
  await page.click(b.selector, { timeout: 8000 }).catch(() => {});
  await page.fill(b.selector, "", { timeout: 5000 }).catch(() => {});
  await page.type(b.selector, wanted, { delay: 25, timeout: 5000 }).catch(() => {});
  let chosen = null;
  let retyped = false;
  let wordRetyped = false;
  let clearedSearch = false;
  const widgetLoading = () => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const control = el.closest('[class*="select__control"]');
    const scope = (control && control.parentElement) || document;
    return !!scope.querySelector('[class*="loading-indicator"], [class*="loadingIndicator"]');
  }, b.selector).catch(() => false);
  for (let i = 0; i < 34 && !chosen; i++) {
    await page.waitForTimeout(500);
    if (i > 0) {
      const existing = await page.evaluate(fnWidgetValue, b.selector).catch(() => null);
      if (existing) {
        const nGot = normPersist(existing), nWant = normPersist(wanted);
        if (nGot === nWant || (nGot.length >= 4 && nWant.startsWith(nGot)) || nWant.endsWith(nGot)) {
          return { expect: existing, chosenText: wanted, via: "widget_option_pick" };
        }
      }
    }
    if (i === 5) {
      const expanded = await page.evaluate((sel) => { const el = document.querySelector(sel); return el ? el.getAttribute("aria-expanded") : null; }, b.selector).catch(() => null);
      if (expanded !== "true") await page.click(b.selector, { timeout: 3000 }).catch(() => {});
      const seg = wanted.split(/\s+[-–—,]\s+/)[0].trim();
      if (!retyped && seg && seg !== wanted && !(await widgetLoading())) {
        retyped = true;
        await page.fill(b.selector, "", { timeout: 3000 }).catch(() => {});
        await page.type(b.selector, seg, { delay: 25, timeout: 5000 }).catch(() => {});
      }
    }
    if (i === 10 && !wordRetyped) {
      const word = wanted.split(/\s+/)[0].trim();
      if (word && word.length >= 3 && word !== wanted && !(await widgetLoading())) {
        wordRetyped = true;
        await page.fill(b.selector, "", { timeout: 3000 }).catch(() => {});
        await page.type(b.selector, word, { delay: 25, timeout: 5000 }).catch(() => {});
      }
    }
    // When NO option shares a token with the wanted value, every
    // filtered list is empty (the board's veteran decline "I don't
    // wish to answer" shares no token with "Decline to self-identify"
    // and filters itself out of its own menu). Clearing the search
    // renders the FULL list, and the matcher judges that instead.
    if (i === 16 && !clearedSearch) {
      clearedSearch = true;
      if (!(await widgetLoading())) {
        await page.fill(b.selector, "", { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(400);
      }
    }
    chosen = await page.evaluate(({ tok, full }) => {
      const vis = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
      const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
      document.querySelectorAll("[data-upmore-opt]").forEach((e) => e.removeAttribute("data-upmore-opt"));
      const pools = [".select__option", '[role="option"]', '[role="listbox"] *', ".pac-item", '[class*="suggestion"] *', '[class*="autocomplete"] *'];
      // Match strength, strongest first: exact normalized; then the
      // wanted value's own first segment; then decline-class (only
      // when the WANTED value is itself decline-class — D8/BUG-067);
      // then first-token containment; then an option that is a
      // normalized PREFIX of the wanted value. Weaker hits are used
      // only when nothing stronger exists anywhere in the list.
      const seg = full.split(/\s+[-–—,]\s+/)[0].trim();
      let segHit = null, tokenHit = null, prefixHit = null, declineHit = null;
      const isDecline = (s) => /decline|prefer not|do not wish|don t wish|dont wish|not (to )?answer|not (to )?disclose|no answer/.test(norm(s));
      const wantedDecline = isDecline(full);
      for (const sel of pools) {
        for (const el of Array.from(document.querySelectorAll(sel))) {
          if (!vis(el)) continue;
          const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
          if (!t || t.length >= 90) continue;
          if (norm(t) === norm(full)) { el.setAttribute("data-upmore-opt", "1"); return t; }
          if (!segHit && seg && norm(t) === norm(seg)) segHit = { el, t };
          if (!declineHit && wantedDecline && isDecline(t)) declineHit = { el, t };
          if (!tokenHit && t.toLowerCase().includes(tok)) tokenHit = { el, t };
          if (!prefixHit && norm(t).length >= 4 && norm(full).startsWith(norm(t))) prefixHit = { el, t };
        }
      }
      const hit = segHit || declineHit || tokenHit || prefixHit;
      if (hit) { hit.el.setAttribute("data-upmore-opt", "1"); return hit.t; }
      return null;
    }, { tok, full: wanted }).catch(() => null);
    if (chosen) {
      const clicked = await page.click('[data-upmore-opt="1"]', { timeout: 5000 }).then(() => true).catch(() => false);
      if (!clicked) {
        // React re-creates the option nodes between the marking
        // evaluate and the click — the marked node is gone. Fall back
        // to a pick executed in ONE evaluate turn: find the option
        // fresh and dispatch the pointer sequence on it directly
        // (react-select selects on mousedown).
        await page.evaluate((t) => {
          const vis = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
          const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
          const pools = [".select__option", '[role="option"]', '[role="listbox"] *'];
          for (const sel of pools) {
            for (const el of Array.from(document.querySelectorAll(sel))) {
              if (!vis(el)) continue;
              const txt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
              if (txt === t || norm(txt) === norm(t)) {
                for (const type of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
                return true;
              }
            }
          }
          return false;
        }, chosen).catch(() => false);
      }
      await page.waitForTimeout(300);
      // The readback expectation is the widget's OWN rendering of the
      // pick (the country widget renders only "+1" for the option
      // whose menu text is "United States +1"). The single-value
      // settles a beat after the pick, so poll briefly before judging.
      let svText = null;
      for (let svTry = 0; svTry < 4 && !svText; svTry++) {
        svText = await page.evaluate(fnWidgetValue, b.selector).catch(() => null);
        if (!svText) await page.waitForTimeout(300);
      }
      if (!svText) { chosen = null; continue; } // the pick did not land — keep polling inside this one drive
      return { expect: svText || chosen, chosenText: chosen, via: "widget_option_pick" };
    }
  }
  // No option list arrived: close the widget's open menu before the
  // plain fill stands as page state (an open menu overlaying the form
  // degraded later fills on the live boards). The verification in
  // cmdFill judges it — search text alone never counts as a value.
  await page.keyboard.press("Escape").catch(() => {});
  await page.fill(b.selector, wanted, { timeout: 5000 }).catch(() => {});
  return { expect: wanted, chosenText: null, via: undefined };
}
/* The widget option scan, extracted VERBATIM from the ladder's inline
 * evaluate (same pools, same match classes in the same strength order,
 * same data-upmore-opt marking) so the event-driven drive can run it
 * inside waitForFunction. One addition: `emptyMenu` reports that the
 * board has rendered a definitive "no options" answer for the current
 * search with no option element present — the signal that the current
 * search text can never match (the decline option token-filters itself
 * out of its own menu this way). Self-contained: serialized into the
 * page by Playwright, so it may reference nothing outside itself. */
function fnScanWidgetOptions(arg) {
  const tok = arg.tok, full = arg.full;
  const vis = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  document.querySelectorAll("[data-upmore-opt]").forEach((e) => e.removeAttribute("data-upmore-opt"));
  const pools = [".select__option", '[role="option"]', '[role="listbox"] *', ".pac-item", '[class*="suggestion"] *', '[class*="autocomplete"] *'];
  // Match strength, strongest first: exact normalized; then the
  // wanted value's own first segment; then decline-class (only
  // when the WANTED value is itself decline-class — D8/BUG-067);
  // then first-token containment; then an option that is a
  // normalized PREFIX of the wanted value. Weaker hits are used
  // only when nothing stronger exists anywhere in the list.
  const seg = full.split(/\s*[-–—,]\s*/)[0].trim();
  let segHit = null, tokenHit = null, prefixHit = null, declineHit = null, sawOption = false;
  const isDecline = (s) => /decline|prefer not|do not wish|don t wish|dont wish|not (to )?answer|not (to )?disclose|no answer/.test(norm(s));
  const wantedDecline = isDecline(full);
  for (const sel of pools) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      if (!vis(el)) continue;
      const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (!t || t.length >= 90) continue;
      sawOption = true;
      if (norm(t) === norm(full)) { el.setAttribute("data-upmore-opt", "1"); return { matched: t, emptyMenu: false }; }
      if (!segHit && seg && norm(t) === norm(seg)) segHit = { el, t };
      if (!declineHit && wantedDecline && isDecline(t)) declineHit = { el, t };
      if (!tokenHit && t.toLowerCase().includes(tok)) tokenHit = { el, t };
      if (!prefixHit && norm(t).length >= 4 && norm(full).startsWith(norm(t))) prefixHit = { el, t };
    }
  }
  const hit = segHit || declineHit || tokenHit || prefixHit;
  if (hit) { hit.el.setAttribute("data-upmore-opt", "1"); return { matched: hit.t, emptyMenu: false }; }
  let emptyMenu = false;
  if (!sawOption) {
    const notices = Array.from(document.querySelectorAll('[class*="menu-notice"], [class*="no-options"]'));
    emptyMenu = notices.some((el) => vis(el) && /no options|no results|nothing found/i.test(el.textContent || ""));
    if (!emptyMenu) {
      const menus = Array.from(document.querySelectorAll('[class*="select__menu"], [role="listbox"]'));
      emptyMenu = menus.some((el) => vis(el) && /^no options/i.test((el.innerText || el.textContent || "").replace(/\s+/g, " ").trim()));
    }
  }
  return { matched: null, emptyMenu };
}
/* The wait state for one widget stage, composed from the scan and the
 * widget-value reader (both self-contained; composed by source because
 * waitForFunction serializes its predicate into the page). Resolves
 * with { matched } when the scan finds a pick, { landed } when the
 * widget already renders a pick satisfying the ladder's own shortcut
 * rule (stages after the first only — the ladder checks it from its
 * second tick), or { emptyMenu } when the board has answered the
 * current search with nothing. False while none of those holds. */
const fnWidgetWaitState = new Function("arg",
  "const scan = " + fnScanWidgetOptions.toString() + ";\n" +
  "const wv = " + fnWidgetValue.toString() + ";\n" +
  "const normP = (x) => String(x == null ? '' : x).replace(/\\s+/g, ' ').trim();\n" +
  "const s = scan(arg);\n" +
  "if (s && s.matched) return { matched: s.matched };\n" +
  "if (arg.allowLanded) { const existing = wv(arg.selector); if (existing) { const g = normP(existing), w = normP(arg.full); if (g === w || (g.length >= 4 && w.startsWith(g)) || w.endsWith(g)) return { landed: existing }; } }\n" +
  "if (s && s.emptyMenu) return { emptyMenu: true };\n" +
  "return false;");
/* The widget's single-value as a wait predicate: the rendered text, or
 * false while the pick has not landed as a value. */
const fnWidgetValueOrFalse = new Function("sel",
  "const wv = " + fnWidgetValue.toString() + ";\n" +
  "const v = wv(sel);\n" +
  "return v ? v : false;");

/* The event-driven widget drive: the ladder's actions, stage order,
 * pick semantics and tail — but each stage WAITS ON the board (the
 * scan inside waitForFunction, mutation polling) instead of ticking
 * at 500 ms. Stage budgets are the ladder's own tick schedule
 * (retype segment at ~2.5 s, word at ~5 s, clear search at ~8 s, the
 * 34-tick cap ≈ 17 s). A stage also advances early on the menu's
 * definitive "no options" answer: the board has answered this search,
 * and waiting out the slot cannot change the answer — the advance
 * changes WHEN a stage starts, never what a stage does or what may
 * be picked. Every wait's outcome lands in `waits`. */
async function driveWidget(board, cmd) {
  const page = board.page;
  const b = cmd.binding;
  const wanted = String(cmd.value);
  const tok = wanted.split(",")[0].trim().toLowerCase();
  const waits = [];
  // One drive, one bounded patience budget — the same engagement
  // actions and timeouts as the ladder (widget/attach fix, 2026-10-21).
  await page.click(b.selector, { timeout: 8000 }).catch(() => {});
  await page.fill(b.selector, "", { timeout: 5000 }).catch(() => {});
  await page.type(b.selector, wanted, { delay: 25, timeout: 5000 }).catch(() => {});
  let retyped = false;
  let wordRetyped = false;
  let clearedSearch = false;
  const widgetLoading = () => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const control = el.closest('[class*="select__control"]');
    const scope = (control && control.parentElement) || document;
    return !!scope.querySelector('[class*="loading-indicator"], [class*="loadingIndicator"]');
  }, b.selector).catch(() => false);
  const stageBudgets = [2500, 2500, 3000, 9000];
  let chosen = null;
  let landedExisting = null;
  for (let stage = 0; stage < stageBudgets.length && !chosen && !landedExisting; stage++) {
    if (stage === 1) {
      const expanded = await page.evaluate((sel) => { const el = document.querySelector(sel); return el ? el.getAttribute("aria-expanded") : null; }, b.selector).catch(() => null);
      if (expanded !== "true") await page.click(b.selector, { timeout: 3000 }).catch(() => {});
      const seg = wanted.split(/\s+[-–—,]\s+/)[0].trim();
      if (!retyped && seg && seg !== wanted && !(await widgetLoading())) {
        retyped = true;
        await page.fill(b.selector, "", { timeout: 3000 }).catch(() => {});
        await page.type(b.selector, seg, { delay: 25, timeout: 5000 }).catch(() => {});
      }
    }
    if (stage === 2 && !wordRetyped) {
      const word = wanted.split(/\s+/)[0].trim();
      if (word && word.length >= 3 && word !== wanted && !(await widgetLoading())) {
        wordRetyped = true;
        await page.fill(b.selector, "", { timeout: 3000 }).catch(() => {});
        await page.type(b.selector, word, { delay: 25, timeout: 5000 }).catch(() => {});
      }
    }
    if (stage === 3 && !clearedSearch) {
      clearedSearch = true;
      if (!(await widgetLoading())) {
        await page.fill(b.selector, "", { timeout: 3000 }).catch(() => {});
        // No 400 ms sleep here (the ladder's W11): the stage wait
        // below observes the re-rendered full list directly.
      }
    }
    const r = await waitForDom(page, fnWidgetWaitState, { tok, full: wanted, selector: b.selector, allowLanded: stage > 0 }, { timeoutMs: stageBudgets[stage] });
    noteWait(waits, "widget_option", r.timedOut ? "timeout" : "event", r.waitedMs);
    if (r.value && r.value.matched) chosen = r.value.matched;
    else if (r.value && r.value.landed) landedExisting = r.value.landed;
    // emptyMenu or timeout: advance — the next stage's actions run at
    // the top of the loop, under the same conditions as the ladder's.
  }
  if (landedExisting) return { expect: landedExisting, chosenText: wanted, via: "widget_option_pick", waits };
  let landed = null;
  for (let pickTry = 0; pickTry < 2 && chosen && !landed; pickTry++) {
    if (pickTry > 0) {
      // The ladder keeps polling after a pick that did not land; one
      // re-scan under a fresh budget is that behavior's event form.
      const r = await waitForDom(page, fnWidgetWaitState, { tok, full: wanted, selector: b.selector, allowLanded: true }, { timeoutMs: 2500 });
      noteWait(waits, "widget_option", r.timedOut ? "timeout" : "event", r.waitedMs);
      if (r.value && r.value.landed) { landed = { expect: r.value.landed, chosenText: wanted, via: "widget_option_pick" }; break; }
      if (!(r.value && r.value.matched)) break;
      chosen = r.value.matched;
    }
    const clicked = await page.click('[data-upmore-opt="1"]', { timeout: 5000 }).then(() => true).catch(() => false);
    if (!clicked) {
      // React re-creates the option nodes between the marking
      // evaluate and the click — the marked node is gone. Fall back
      // to a pick executed in ONE evaluate turn: find the option
      // fresh and dispatch the pointer sequence on it directly
      // (react-select selects on mousedown).
      await page.evaluate((t) => {
        const vis = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
        const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
        const pools = [".select__option", '[role="option"]', '[role="listbox"] *'];
        for (const sel of pools) {
          for (const el of Array.from(document.querySelectorAll(sel))) {
            if (!vis(el)) continue;
            const txt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
            if (txt === t || norm(txt) === norm(t)) {
              for (const type of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
              return true;
            }
          }
        }
        return false;
      }, chosen).catch(() => false);
    }
    // The readback expectation is the widget's OWN rendering of the
    // pick. Wait on the single-value itself (the ladder slept 300 ms
    // and polled it up to 4 x 300 ms) at the same ~1.5 s cap.
    const sv = await waitForDom(page, fnWidgetValueOrFalse, b.selector, { timeoutMs: 1500 });
    noteWait(waits, "widget_value", sv.timedOut ? "timeout" : "event", sv.waitedMs);
    if (sv.value) landed = { expect: sv.value || chosen, chosenText: chosen, via: "widget_option_pick" };
  }
  if (landed) return { expect: landed.expect, chosenText: landed.chosenText, via: landed.via, waits };
  // No option list arrived: close the widget's open menu before the
  // plain fill stands as page state (an open menu overlaying the form
  // degraded later fills on the live boards). The verification in
  // cmdFill judges it — search text alone never counts as a value.
  await page.keyboard.press("Escape").catch(() => {});
  await page.fill(b.selector, wanted, { timeout: 5000 }).catch(() => {});
  return { expect: wanted, chosenText: null, via: undefined, waits };
}
function widgetPersisted(got, driven) {
  if (got === undefined || normPersist(got) === "") return false;
  if (normPersist(got) === normPersist(driven.expect)) return true;
  if (!driven.chosenText) return false;
  return normPersist(got) === normPersist(driven.chosenText)
    || normPersist(driven.chosenText).endsWith(normPersist(got))
    || (normPersist(got).length >= 4 && normPersist(driven.chosenText).startsWith(normPersist(got)));
}

/* The file field's identity (widget/attach fix, 2026-10-21): which
 * slot a file binding is — its observed id, its name, and its class
 * (cover vs resume). Recovery and verification resolve the LIVE
 * input through this identity, never by document position: the old
 * rediscovery returned the FIRST input[type=file] on the page, which
 * on a remounted Greenhouse section is the cover-letter field — the
 * resume was attached there (or nowhere) while verification probed
 * a selector the remount had retired. */
function fileIdentityOf(board, b) {
  let meta = null;
  for (const ref of (b && b.elementRefs) || []) {
    const m = board.refMetadata && board.refMetadata.get(ref);
    if (m) { meta = m; break; }
  }
  let id = meta && meta.id ? String(meta.id) : "";
  let name = meta && meta.name ? String(meta.name) : "";
  if (!id) { const m = /^#([\w-]+)$/.exec((b && b.selector) || ""); if (m) id = m[1]; }
  if (!name) { const m = /\[name="([^"]+)"\]/.exec((b && b.selector) || ""); if (m) name = m[1]; }
  const hay = `${id} ${name} ${meta ? meta.label || "" : ""}`;
  const cover = /cover/i.test(hay);
  const resumeCls = /resume|cv\b/i.test(hay);
  return { id, name, cover, cls: cover ? "cover" : resumeCls ? "resume" : null,
    label: meta ? meta.label || "" : "",
    domIndex: meta && typeof meta.domIndex === "number" ? meta.domIndex : null };
}
/* In-page: locate the live file input FOR THIS IDENTITY and report
 * its selector + held-file count. Exact id wins, then exact name,
 * then the same domIndex the field was observed at (a remount that
 * preserves the form's field order — Greenhouse's does), then —
 * only when the identity's class has exactly ONE candidate — that
 * candidate. The cover/resume class is judged on id + name + the
 * input's LABEL text (this board's inputs carry neither id nor
 * name; the label is the only class evidence on the element) and is
 * a hard exclusion at every tier: a resume never resolves to the
 * cover input, nor the reverse. An id-less winner is marked on the
 * element itself, never positional. */
function fnFileInputState(identity) {
  const els = Array.from(document.querySelectorAll('input[type="file"]'));
  const coverOf = (el) => {
    let lab = "";
    if (el.id) { const l = document.querySelector('label[for="' + String(el.id).replace(/"/g, '\\"') + '"]'); if (l) lab = l.textContent || ""; }
    if (!lab) { const w = el.closest("label"); if (w) lab = w.textContent || ""; }
    if (!lab) lab = el.getAttribute("aria-label") || "";
    return /cover/i.test(`${el.id || ""} ${el.getAttribute("name") || ""} ${lab}`);
  };
  let best = null, bestScore = -1;
  for (const el of els) {
    if (coverOf(el) && !identity.cover) continue;
    if (identity.cover && !coverOf(el)) continue;
    let score = -1;
    if (identity.id && el.id === identity.id) score = 100;
    else if (identity.name && el.getAttribute("name") === identity.name) score = 80;
    else if (identity.domIndex != null && document.querySelectorAll("input, select, textarea")[identity.domIndex] === el) score = 60;
    if (score > bestScore) { bestScore = score; best = el; }
  }
  if (!best) {
    const pool = els.filter((el) => coverOf(el) === !!identity.cover);
    if (pool.length === 1) best = pool[0];
  }
  if (!best) return null;
  let selector = null;
  if (best.id) selector = "#" + best.id;
  else { best.setAttribute("data-upmore-file", "1"); selector = '[data-upmore-file="1"]'; }
  return { selector, files: best.files ? best.files.length : 0, id: best.id || "", name: best.getAttribute("name") || "" };
}
/* In-page: the board's own uploaded-state rendering for THIS file
 * identity. After a successful attach, boards like Greenhouse
 * replace the whole input with the attached file's NAME (the chip):
 * no input exists to digest or to hunt for, and the group settles
 * into that state within seconds (measured on the live board). The
 * caller only ever trusts this together with the session attach
 * record — a chip a restored draft painted for a file this session
 * never uploaded must not be spoken for. Group match: the aria
 * label anchor (upload-label-<id>), a label[for=<id>] inside the
 * group, or the group's label text carrying the identity's class. */
function fnUploadedChip(identity) {
  const groups = Array.from(document.querySelectorAll('[class*="file-upload"]'));
  const clsRe = identity && identity.cls === "cover" ? /cover/i : identity && identity.cls === "resume" ? /resume|cv/i : null;
  for (const g of groups) {
    let match = false;
    if (identity.id && (g.querySelector('[id="upload-label-' + identity.id + '"]') || g.querySelector('label[for="' + identity.id + '"]'))) match = true;
    if (!match && clsRe) {
      const lab = g.querySelector('.upload-label, .label, label');
      if (lab && clsRe.test(lab.textContent || "")) match = true;
    }
    if (!match) continue;
    const text = (g.innerText || g.textContent || "").replace(/\s+/g, " ").trim();
    const m = text.match(/[\w.()\-]+(?: [\w.()\-]+)*\.(?:pdf|docx?|txt|rtf)\b/i);
    if (m) return { filename: m[0].trim() };
  }
  return null;
}
/* Re-discover the form's live file input FOR THIS IDENTITY and
 * return a selector for it. (No-identity callers keep the legacy
 * first-input behavior; the attach path always passes identity.) */
async function rediscoverFileSelector(page, identity) {
  if (!identity) {
    return await page.evaluate(() => {
      const inp = document.querySelector('input[type="file"]');
      if (!inp) return null;
      if (inp.id) return "#" + inp.id;
      inp.setAttribute("data-upmore-file", "1");
      return '[data-upmore-file="1"]';
    }).catch(() => null);
  }
  const st = await page.evaluate(fnFileInputState, identity).catch(() => null);
  return st ? st.selector : null;
}
/* Page-level file attach for when the discovered handle cannot be
 * used — the current boards mount their file inputs late, hide them
 * behind a styled dropzone, lazy-mount them when the upload section
 * nears the viewport, or mount them only once the board's own Attach
 * control is engaged (BUG-207 addendum + BUG-237: file_input_not_
 * mounted on 18 of 24 boards in Drive Pass 2). Engages the board's
 * own controls, re-discovers the live input, and sets the files —
 * through CDP when the standard call cannot complete (the same
 * mechanism the browser's own file picker uses). Returns
 * { ok, selectorUsed } — only a board that still shows no input after
 * all of that earns a not-mounted report. */
/* File-mount presence as a wait predicate: the identity's live input
 * state (fnFileInputState composed by source — it is self-contained),
 * or false while no input resolves for the identity. */
const fnFileInputPresent = new Function("identity",
  "const st = " + fnFileInputState.toString() + ";\n" +
  "const r = st(identity);\n" +
  "return r ? r : false;");
/* The mount ladder's pacing step (W6): the ladder slept 600 ms between
 * re-discovery passes; the event form waits on the input's presence at
 * the same 600 ms cadence cap — a mount is acted on the moment it
 * renders instead of at the next tick. */
async function paceFileMount(page, identity, ms) {
  if (EVENT_WAIT_LADDER("file_mount")) { await page.waitForTimeout(ms); return; }
  await waitForDom(page, fnFileInputPresent, identity, { timeoutMs: ms }).catch(() => {});
}

async function attachFilePageLevel(board, cmd) {
  const page = board.page;
  const b = cmd.binding;
  const identity = fileIdentityOf(board, b);
  let selector = b.selector;
  await page.evaluate(() => {
    const l = document.querySelector('[class*="file-upload"], label[for="resume"], [data-testid*="resume" i]');
    if (l) l.scrollIntoView({ block: "center" });
  }).catch(() => {});
  await paceFileMount(page, identity, 400);
  let attached = await page.waitForSelector(selector, { state: "attached", timeout: 1500 }).then(() => true).catch(() => false);
  if (!attached) {
    const fresh = await rediscoverFileSelector(page, identity);
    if (fresh && fresh !== selector) {
      attached = await page.waitForSelector(fresh, { state: "attached", timeout: 5000 }).then(() => true).catch(() => false);
      if (attached) selector = fresh;
    }
  }
  // Poll the identity rediscovery while the board remounts
  // (widget/attach fix, 2026-10-21): the upload section can be
  // ABSENT for seconds mid-parse (Greenhouse's post-upload
  // processing state), and the single shot above races that window —
  // the ladder then fell through to its 12 s tail wait on a selector
  // the remount had retired, and reported not-mounted for an input
  // that was back inside the call's own budget. The attach-control
  // hunt below remains the next stage for boards that mount the
  // input only on engagement.
  for (let t = 0; t < 10 && !attached; t++) {
    await paceFileMount(page, identity, 600);
    const again = await rediscoverFileSelector(page, identity);
    if (again) {
      attached = await page.waitForSelector(again, { state: "attached", timeout: 1500 }).then(() => true).catch(() => false);
      if (attached) selector = again;
    }
    // The board may settle into its uploaded state mid-poll (the
    // filename chip): the input is intentionally absent then, and
    // the recovery has in fact already happened — the attach from
    // the caller's earlier attempt is what the board is displaying.
    if (!attached) {
      const rec0 = board.attachedFiles && board.attachedFiles[b.field_id];
      if (rec0) {
        const chip = await page.evaluate(fnUploadedChip, identity).catch(() => null);
        if (chip && chip.filename === rec0.filename) return { ok: true, selectorUsed: selector, chip: true };
      }
    }
  }
  if (!attached) {
    const marked = await page.evaluate(() => {
      const vis = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
      const textOf = (el) => ((el.innerText || el.textContent || "") + " " + (el.getAttribute("aria-label") || "")).replace(/\s+/g, " ").trim();
      const pools = ['button, label, [role="button"]', 'a, div, span'];
      for (const pool of pools) {
        const cand = Array.from(document.querySelectorAll(pool))
          .find((el) => vis(el) && /attach|upload|add resume|add file|browse|choose file|drag/i.test(textOf(el)) && textOf(el).length < 90);
        if (cand) { cand.setAttribute("data-upmore-attach", "1"); return true; }
      }
      return false;
    }).catch(() => false);
    if (marked) {
      await page.click('[data-upmore-attach="1"]', { timeout: 8000 }).catch(() => {});
      for (let t = 0; t < 10 && !attached; t++) {
        await paceFileMount(page, identity, 600);
        const fresh2 = await rediscoverFileSelector(page, identity);
        if (fresh2) {
          attached = await page.waitForSelector(fresh2, { state: "attached", timeout: 1500 }).then(() => true).catch(() => false);
          if (attached) selector = fresh2;
        }
      }
    }
  }
  // Tail wait for a slow mount: the attach-control poll above already
  // waited ~21s; 12s here keeps the whole ladder inside the caller's
  // 60s ceiling (the ladder runs once per call — see cmdFill).
  if (!attached) attached = await page.waitForSelector(b.selector, { state: "attached", timeout: 12000 }).then(() => true).catch(() => false);
  if (!attached) {
    const rec0 = board.attachedFiles && board.attachedFiles[b.field_id];
    if (rec0) {
      const chip = await page.evaluate(fnUploadedChip, identity).catch(() => null);
      if (chip && chip.filename === rec0.filename) return { ok: true, selectorUsed: selector, chip: true };
    }
    return { ok: false, selectorUsed: selector };
  }
  try {
    await page.setInputFiles(selector, cmd.filePath, { timeout: 20000 });
  } catch (e) {
    const cdp = await page.context().newCDPSession(page);
    try {
      const doc = await cdp.send("DOM.getDocument", { depth: 1 });
      const node = await cdp.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector });
      if (!node || !node.nodeId) throw new Error("file input vanished before CDP attach");
      await cdp.send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [cmd.filePath] });
    } finally { await cdp.detach().catch(() => {}); }
  }
  return { ok: true, selectorUsed: selector };
}

async function cmdFill(board, cmd) {
  const b = cmd.binding, value = cmd.value;
  const settleMs = [450, 650, 1000];
  const waits = [];
  if (b.widget === "react-select") {
    // A widget fill is ONE complete drive (click, type, option poll,
    // pick). Re-driving it verbatim when the board's option service
    // never answered does not change the answer — and repeated drives
    // degrade the page until later fields' inputs leave the DOM
    // (probe-bisected 2026-10-15). Single drive; the readback verdict
    // stands as reported.
    const driven = EVENT_WAIT_LADDER("widget_option") ? await driveWidgetLadder(board, cmd) : await driveWidget(board, cmd);
    if (driven && Array.isArray(driven.waits)) waits.push(...driven.waits);
    // W2: the settle before this verification read is now a wait ON
    // the single-value (deadline = the same settle budget); the
    // verdict (widgetPersisted) is unchanged.
    let rendered;
    if (EVENT_WAIT_LADDER("widget_value")) {
      await board.page.waitForTimeout(settleMs[0]);
      rendered = await board.page.evaluate(fnWidgetValue, b.selector).catch(() => null);
      noteWait(waits, "widget_value", "ladder", settleMs[0]);
    } else {
      const r = await pollUntil(async () => {
        const v = await board.page.evaluate(fnWidgetValue, b.selector).catch(() => null);
        return v ? v : null;
      }, { deadlineMs: settleMs[0], intervalMs: 40 });
      noteWait(waits, "widget_value", r.timedOut ? "timeout" : "event", r.waitedMs);
      rendered = r.value;
    }
    if (widgetPersisted(rendered === null || rendered === undefined ? undefined : rendered, driven)) {
      return { filled: true, verified: true, attempts: 1, via: driven.via || undefined, rendered: driven.expect, waits };
    }
    return { filled: false, reason: "value_did_not_persist", wanted: String(value), waits };
  }
  if (b.inputType === "file") {
    const bytes = fs.readFileSync(cmd.filePath);
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== value.sha256) throw Object.assign(new Error("resume bytes changed before upload"), { code: "RESUME_SHA_MISMATCH" });
    for (let attempt = 1; attempt <= 3; attempt++) {
      let attached = false;
      let selectorUsed = b.selector;
      try {
        const nodes = [];
        for (const ref of b.elementRefs) nodes.push(await connected(board, ref));
        if (nodes.length) {
          await nodes[0].setInputFiles({ name: value.filename, mimeType: "application/octet-stream", buffer: bytes });
          attached = true;
          board.attachedFiles = board.attachedFiles || {};
          board.attachedFiles[b.field_id] = { filename: value.filename, sha256: value.sha256 };
        }
      } catch (e) { if (e.code !== "STALE_OBSERVATION") throw e; }
      if (!attached) {
        // The board may already show THIS session's file as its
        // uploaded state (the chip): the input is intentionally
        // absent then, and laddering for it manufactures a
        // not-mounted failure (widget/attach fix, 2026-10-21).
        const rec0 = board.attachedFiles && board.attachedFiles[b.field_id];
        if (rec0 && rec0.sha256 === value.sha256) {
          const chip = await board.page.evaluate(fnUploadedChip, fileIdentityOf(board, b)).catch(() => null);
          if (chip && chip.filename === value.filename) attached = true;
        }
      }
      if (!attached) {
        const rec = await attachFilePageLevel(board, cmd);
        attached = rec.ok; selectorUsed = rec.selectorUsed;
        if (attached && !rec.chip) {
          board.attachedFiles = board.attachedFiles || {};
          board.attachedFiles[b.field_id] = { filename: value.filename, sha256: value.sha256 };
        }
        // The ladder IS the recovery budget (scroll into view,
        // re-discovery, attach-control engagement, mount poll, long
        // wait). Re-running it verbatim inside the same call cannot
        // change the answer and stacks past the caller's 60s ceiling —
        // which would surface as a driver timeout instead of the
        // truthful not-mounted verdict (BUG-207's "the run does not
        // die" guard). Its negative verdict returns at once.
        if (!attached) return { filled: false, reason: "file_input_not_mounted" };
      }
      // Verified = the live input still holds the file. When the
      // discovered node is still the board's input, the handle
      // readback (name + sha256 of the attached bytes) decides. When
      // the board replaced the node (so the handle readback cannot
      // speak), the file's presence under the selector the recovery
      // actually used is the evidence — the bytes themselves were
      // sha-verified above before any upload.
      // Verification speaks for the LIVE input (widget/attach fix,
      // 2026-10-21): the digest readback goes through the re-observe
      // path, so a post-upload remount is answered by the input that
      // actually holds the file — the plain readback reads the
      // retired node and reports absence. The presence fallback
      // probes by file IDENTITY, not by the ladder's last selector
      // (which the remount may have retired or the old identity-blind
      // rediscovery may have pointed at the cover field).
      // W5: this verification round used to run ONCE after a fixed
      // settle sleep; it now runs until it verifies or the same
      // settle budget passes — the round itself is unchanged, so the
      // verdict is unchanged; only its timing is event-driven.
      const verifyFileOnce = async () => {
        let got;
        try { got = await readbackBindingFresh(board, b); } catch (e) { got = undefined; }
        if (got && got.sha256 === value.sha256) return { via: undefined };
        if (got === undefined) {
          const st = await board.page.evaluate(fnFileInputState, fileIdentityOf(board, b)).catch(() => null);
          if (st && st.files > 0) return { via: "file_rediscovered" };
          // Uploaded-state truth: the board replaced the input with
          // the attached file's name. This session's attach record +
          // the board displaying exactly that filename is the
          // verification — the input's absence is the board's success
          // state here, not a failed attach.
          const rec0 = board.attachedFiles && board.attachedFiles[b.field_id];
          if (rec0 && rec0.sha256 === value.sha256) {
            const chip = await board.page.evaluate(fnUploadedChip, fileIdentityOf(board, b)).catch(() => null);
            if (chip && chip.filename === value.filename) return { via: "file_uploaded_state" };
          }
        }
        return null;
      };
      let verified = null;
      if (EVENT_WAIT_LADDER("file_verify")) {
        await board.page.waitForTimeout(settleMs[attempt - 1]);
        verified = await verifyFileOnce();
        noteWait(waits, "file_verify", "ladder", settleMs[attempt - 1]);
      } else {
        const r = await pollUntil(verifyFileOnce, { deadlineMs: settleMs[attempt - 1], intervalMs: 50 });
        noteWait(waits, "file_verify", r.timedOut ? "timeout" : "event", r.waitedMs);
        verified = r.value;
      }
      if (verified) return { filled: true, verified: true, attempts: attempt, via: verified.via, waits };
    }
    return { filled: false, reason: "value_did_not_persist", wanted: value.filename, waits };
  }
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await fillOnceHandles(board, cmd);
    if (!last.filled) return last; // e.g. option_not_found — retrying cannot invent an option
    // The verification readback re-observes on stale (readbackBindingFresh):
    // a node the board remounted mid-drive reads as its CURRENT value —
    // on a never-persist board that is "absent", which is the truth this
    // loop exists to judge, not an error that aborts the fill.
    // W1: the readback used to run ONCE after a fixed settle sleep; it
    // now polls until the value persists or the same settle budget
    // passes. A STALE_OBSERVATION still propagates immediately (it is
    // a verdict, not a retry) in both forms.
    const readbackOnce = async () => {
      let got;
      try { got = await readbackBindingFresh(board, b); } catch (e) { if (e.code === "STALE_OBSERVATION") throw e; got = undefined; }
      return persistedMatches(got, last.expect, b.inputType);
    };
    if (EVENT_WAIT_LADDER("persist_verify")) {
      await board.page.waitForTimeout(settleMs[attempt - 1]);
      noteWait(waits, "persist_verify", "ladder", settleMs[attempt - 1]);
      if (await readbackOnce()) {
        return { filled: true, verified: true, attempts: attempt, rendered: last.expect, waits };
      }
    } else {
      const r = await pollUntil(async () => ((await readbackOnce()) ? true : null), { deadlineMs: settleMs[attempt - 1], intervalMs: 40 });
      noteWait(waits, "persist_verify", r.timedOut ? "timeout" : "event", r.waitedMs);
      if (r.value) {
        return { filled: true, verified: true, attempts: attempt, rendered: last.expect, waits };
      }
    }
  }
  return { filled: false, reason: "value_did_not_persist", wanted: String(value && value.filename ? value.filename : value), waits };
}
// Re-observe ONE binding in place (v224 combine): a board that
// remounts a node between the drive and the readback (the Greenhouse
// delayed-reset / fresh-id shapes) leaves the observed refs pointing
// at detached husks, and connected() rightly calls that stale. The
// protocol's answer to stale is "re-observe" — here that means a
// fresh discovery, the field found again by its selector, and new
// handles minted under the current observation version (the same
// scheme cmdDiscover uses). Returns a cloned binding with live refs,
// or null when the field is gone from the page (which reads back as
// absent — the truth).
async function reresolveBinding(board, b) {
  board.handles = board.handles || new Map();
  board.refMetadata = board.refMetadata || new Map();
  // A re-resolution happens because the page changed under the
  // observed refs — the per-command meaning snapshot may predate
  // that change, so drop it: the next connected() in this command
  // takes one fresh scan instead of judging against the stale table.
  board._snapshotFields = null;
  const fields = await board.page.evaluate(fnDiscoverFields);
  const version = (board.observation && board.observation.version) || "re";
  // Mint under a per-call namespace (widget/attach fix, 2026-10-21):
  // refs are keyed version+domIndex, and a remount REORDERS the DOM —
  // a re-minted ref could land on the exact key another binding's
  // live ref already owns, silently swapping that binding's handle
  // and metadata for this field's (measured: a remounted upload
  // section made the resume read answer for the cover field and
  // vice versa; both then read absent). Fresh refs must never
  // clobber refs other bindings still hold.
  board._reresolveSeq = (board._reresolveSeq || 0) + 1;
  const mintNs = version + ":re" + board._reresolveSeq;
  const mint = async (f) => {
    const h = await resolveFieldHandle(board.page, f);
    if (!h) return null;
    const ref = mintNs + ":f:" + f.domIndex;
    board.handles.set(ref, h);
    board.refMetadata.set(ref, f);
    return ref;
  };
  const selectors = b.selectors || (b.selector ? [b.selector] : (b.options || []).map((x) => x.selector));
  const elementRefs = [];
  for (const sel of selectors) {
    const f = fields.find((x) => x.selector === sel);
    if (!f) continue;
    const ref = await mint(f);
    if (ref) elementRefs.push(ref);
  }
  // File bindings (widget/attach fix, 2026-10-21): a board that
  // remounts its upload section can hand the live input a NEW id, so
  // the exact-selector match above finds nothing and the readback
  // reports the resume absent even when it is attached. Fall back to
  // the field's identity — an exact id or exact name match among the
  // fresh file fields; failing that, the identity's class (cover vs
  // resume) when exactly one fresh field carries it. Anything weaker
  // stays absent: file-truth is a digest of the RIGHT input or it is
  // not spoken at all.
  if (!elementRefs.length && b.inputType === "file") {
    const identity = fileIdentityOf(board, b);
    const fileFields = fields.filter((x) => x.inputType === "file" && x.tag === "input");
    let cands = fileFields.filter((x) => (identity.id && x.id === identity.id) || (identity.name && x.name === identity.name) || (identity.domIndex != null && x.domIndex === identity.domIndex));
    if (cands.length !== 1 && identity.cls) {
      const pool = fileFields.filter((x) => {
        const hay = `${x.id || ""} ${x.name || ""} ${x.label || ""}`;
        const cls = /cover/i.test(hay) ? "cover" : /resume|cv\b/i.test(hay) ? "resume" : null;
        return cls === identity.cls;
      });
      if (pool.length === 1) cands = pool;
    }
    if (cands.length === 1) {
      const ref = await mint(cands[0]);
      if (ref) elementRefs.push(ref);
    }
  }
  if (!elementRefs.length) return null;
  const clone = Object.assign({}, b, { elementRefs });
  if (b.options) {
    clone.options = [];
    for (const opt of b.options) {
      const f = fields.find((x) => x.selector === opt.selector);
      const ref = f ? await mint(f) : null;
      clone.options.push(Object.assign({}, opt, { ref: ref || opt.ref }));
    }
  }
  return clone;
}

// readbackBinding with the protocol's re-observe recovery: one stale
// verdict triggers one re-resolution and one retry; a field that is
// gone reads back absent; a second stale verdict propagates.
async function readbackBindingFresh(board, b) {
  try { return await readbackBinding(board, b); }
  catch (e) {
    if (!e || e.code !== "STALE_OBSERVATION") throw e;
    const fresh = await reresolveBinding(board, b);
    const v = fresh ? await readbackBinding(board, fresh) : undefined;
    if (v === undefined && b.inputType === "file" && b.field_id) {
      // Uploaded-state truth (widget/attach fix, 2026-10-21): the
      // input is gone because the board replaced it with the
      // attached file's name. Report this session's attach (the
      // filename, and the sha of the bytes this session uploaded
      // under it) when the board's own group still displays that
      // filename — and nothing when it does not, or when this
      // session never attached a file to this field.
      const rec = board.attachedFiles && board.attachedFiles[b.field_id];
      if (rec) {
        const chip = await board.page.evaluate(fnUploadedChip, fileIdentityOf(board, b)).catch(() => null);
        if (chip && chip.filename === rec.filename) return { filename: rec.filename, sha256: rec.sha256 };
      }
    }
    return v;
  }
}

async function cmdReadback(board, cmd) {
  const answers = {};
  for (const b of cmd.bindings) {
    const value = await readbackBindingFresh(board, b);
    if (value !== undefined) answers[b.field_id] = value;
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
  const board = await getBoard(boardId);
  board._snapshotFields = null; // meaning table is per-command (see meaningFields)
  if (["fill", "readback", "verify_payload", "review", "submit_and_capture"].includes(cmd.type)) assertObservation(cmd, board.observation, board.scope, board.page.url());
  switch (cmd.type) {
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
fs.writeFileSync(path.join(dir, "ready.json"), JSON.stringify({ pid: process.pid, at: Date.now(), chromiumSandbox: !SANDBOX_OFF }));
setInterval(() => {
  pump().catch(() => {});
  if (Date.now() - lastActivity > 15 * 60 * 1000) process.exit(0);
}, 25);
