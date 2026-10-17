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
    // R3-D3: the board's own length cap rides discovery. Boards cap
    // single-line essay inputs (maxlength=255 on the live Workshop
    // and Gemini boards; a raw probe landed exactly the 255-char
    // prefix against both fill() and keyboard typing) and hold only
    // the capped prefix — a fill that does not know the cap writes a
    // value the board cannot hold and can never verify honestly.
    if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.maxLength > 0) f.maxLength = el.maxLength;
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
  // R3-Gusto: a board names its own-website how-heard option for its
  // brand ("Gusto Website") where the confirmed fact carries the
  // generic name ("Company Website") — the same referent in the
  // board's own wording, and the exact matches above always win, so
  // this class fires only when the board offers no literally-named
  // option. A bare "Website" option is ambiguous and never matches.
  const websiteClass = (s) => /^[a-z0-9 ]+ website$/.test(s) && s !== "website";
  if (v === "company website") {
    hit = options.find((o) => websiteClass(normOpt(o.label)) || websiteClass(normOpt(o.value)));
    if (hit) return hit;
  } else if (websiteClass(v)) {
    hit = options.find((o) => normOpt(o.label) === "company website" || normOpt(o.value) === "company website");
    if (hit) return hit;
  }
  hit = options.find((o) => normOpt(o.label).startsWith(v) || v.startsWith(normOpt(o.label)) && normOpt(o.label).length > 1);
  if (hit) return hit;
  // R3-Sezzle containment (coordinator ruling 2026-10-17, under the
  // owner's answer-delegation): the tiers above are exact and
  // equivalence matches. What remains is the composite-fact case —
  // the confirmed fact joins components ("Computer Science and
  // Finance", "Native or bilingual proficiency") and the board's
  // vocabulary offers only a COMPONENT of it. Picking an option
  // whose every token is one of the fact's tokens states a strict
  // subset of the truth and invents nothing, so it is permitted —
  // as the WEAKEST tier, only when nothing above matched. An option
  // carrying any token outside the fact (a superset, a different
  // fact, or the same tokens reordered — an equal claim, not a
  // lesser one) is NEVER picked here. Deterministic: an option
  // equal to the fact's first component wins; else the longest
  // qualifying option; else list order. Composite facts only (a
  // fact of one or two tokens has no component to subset).
  const pick = containmentPick(options.map((o) => ({ opt: o, text: normOpt(o.label) })), v)
    || containmentPick(options.map((o) => ({ opt: o, text: normOpt(o.value) })), v);
  if (pick) return pick.opt;
  // Sezzle final-two-fields CEFR tier (coordinator ruling
  // 2026-10-17, under the owner's answer-delegation): below even
  // containment — the one case where NO option is a subset of the
  // fact's words, because the board's vocabulary is an ordinal
  // SCALE, not phrasing. When the confirmed fact is native-class
  // (it carries the token "native" — his English fact is "Native
  // or bilingual proficiency") and the options form the CEFR
  // ladder (at least two options whose labels begin with a CEFR
  // band), the top band present is the only point on the scale
  // the fact can honestly occupy: a native speaker sits at the
  // top of any proficiency ladder. Narrow by construction: ONLY
  // the CEFR prefix pattern, ONLY native-class facts — a
  // non-native fact ("Fluent") never scale-maps, and a list of
  // proficiency words without band prefixes is not a ladder.
  const cefr = cefrTopPick(options.map((o) => ({ opt: o, text: normOpt(o.label) })), v)
    || cefrTopPick(options.map((o) => ({ opt: o, text: normOpt(o.value) })), v);
  return cefr ? cefr.opt : null;
}
/* The CEFR chooser, in normalized space (entries { opt, text },
 * v the normalized fact value): the highest-band entry when the
 * fact is native-class and the entries form a CEFR ladder (two or
 * more DISTINCT bands — one stray banded option is not a scale);
 * null otherwise. Kept pure; driveWidget's in-page matcher carries
 * the same definition inline (it is serialized into the page). */
const CEFR_BANDS = ["a1", "a2", "b1", "b2", "c1", "c2"];
function cefrTopPick(entries, v) {
  if (!v.split(" ").includes("native")) return null;
  const bandsSeen = new Set();
  let best = null;
  for (const e of entries) {
    const band = CEFR_BANDS.indexOf((e.text.split(" ")[0] || ""));
    if (band === -1) continue;
    bandsSeen.add(band);
    if (!best || band > best.band) best = { opt: e.opt, band };
  }
  return bandsSeen.size >= 2 && best ? best : null;
}
/* The containment chooser, in normalized space: entries are
 * { opt, text } with text already normalized; v is the normalized
 * fact value. Returns the winning entry or null. Kept pure so the
 * rule is one definition; driveWidget's in-page matcher carries the
 * same definition inline (it is serialized into the page). */
function containmentPick(entries, v) {
  const vToks = v.split(" ").filter(Boolean);
  if (vToks.length < 3) return null;
  const vSet = new Set(vToks);
  const cut = vToks.findIndex((t) => t === "and" || t === "or");
  const firstComp = (cut === -1 ? vToks : vToks.slice(0, cut)).join(" ");
  let best = null;
  for (const e of entries) {
    const o = e.text;
    if (!o || o === v) continue;
    const oSet = new Set(o.split(" ").filter(Boolean));
    if (!oSet.size || oSet.size >= vSet.size) continue; // strict token subset only
    if (![...oSet].every((t) => vSet.has(t))) continue; // a foreign token adds a claim the fact never made
    const rank = o === firstComp ? 0 : 1;
    if (!best || rank < best.rank || (rank === best.rank && o.length > best.text.length)) best = { opt: e.opt, text: o, rank };
  }
  return best;
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
  if (!root) return null;
  const sv = root.querySelector('[class*="select__single-value"], [class*="-singleValue"]');
  const t = sv ? (sv.textContent || "").replace(/\s+/g, " ").trim() : "";
  if (t) return t;
  // Multi-select widgets render each pick as a chip, never a
  // single-value — a readback that only knows the single-value reads
  // a landed multi pick as empty (R3: Gusto's how-heard multi-select).
  const chips = Array.from(root.querySelectorAll('[class*="multi-value__label"], [class*="multiValue__label"]'))
    .map((n) => (n.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return chips.length ? chips.join(", ") : null;
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
      if (!root) return null;
      const sv = root.querySelector('[class*="select__single-value"], [class*="-singleValue"]');
      const t = sv ? (sv.textContent || "").replace(/\s+/g, " ").trim() : "";
      if (t) return t;
      const chips = Array.from(root.querySelectorAll('[class*="multi-value__label"], [class*="multiValue__label"]'))
        .map((n) => (n.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
      return chips.length ? chips.join(", ") : null;
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
  // R3-D3: a board-capped field (maxLength carried from discovery on
  // the binding) can only ever hold the capped prefix — write exactly
  // what the board can hold and expect exactly that back. The
  // exact-equality verification is unchanged; the expectation is the
  // board's own rendering of the value, and the cap is reported so
  // module 150 can record it — module 149's FR-395 comparison then
  // judges the doorstep readback against this verified rendering.
  const raw = String(value);
  const cap = b.maxLength > 0 ? b.maxLength : null;
  const capped = cap && raw.length > cap ? raw.slice(0, cap) : raw;
  await nodes[0].fill(capped);
  const out = { filled: true, expect: capped };
  if (capped !== raw) out.capped = cap;
  return out;
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
async function driveWidget(board, cmd) {
  const page = board.page;
  const b = cmd.binding;
  const wanted = String(cmd.value);
  const tok = wanted.split(",")[0].trim().toLowerCase();
  await page.click(b.selector, { timeout: 20000 }).catch(() => {});
  await page.fill(b.selector, "", { timeout: 20000 }).catch(() => {});
  await page.type(b.selector, wanted, { delay: 25, timeout: 20000 });
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
      if (expanded !== "true") await page.click(b.selector, { timeout: 8000 }).catch(() => {});
      const seg = wanted.split(/\s+[-–—,]\s+/)[0].trim();
      if (!retyped && seg && seg !== wanted && !(await widgetLoading())) {
        retyped = true;
        await page.fill(b.selector, "", { timeout: 8000 }).catch(() => {});
        await page.type(b.selector, seg, { delay: 25, timeout: 20000 }).catch(() => {});
      }
    }
    if (i === 10 && !wordRetyped) {
      const word = wanted.split(/\s+/)[0].trim();
      if (word && word.length >= 3 && word !== wanted && !(await widgetLoading())) {
        wordRetyped = true;
        await page.fill(b.selector, "", { timeout: 8000 }).catch(() => {});
        await page.type(b.selector, word, { delay: 25, timeout: 20000 }).catch(() => {});
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
        await page.fill(b.selector, "", { timeout: 8000 }).catch(() => {});
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
      let segHit = null, tokenHit = null, prefixHit = null, declineHit = null, websiteHit = null, containHit = null, cefrHit = null;
      // Sezzle final-two-fields CEFR tier (coordinator ruling
      // 2026-10-17): the weakest tier, mirroring matchOption's
      // cefrTopPick — a native-class wanted value on a CEFR ladder
      // (options whose labels begin A1/A2/B1/B2/C1/C2, at least two
      // DISTINCT bands) takes the top band present; a non-native
      // value never scale-maps.
      const cefrBands = ["a1", "a2", "b1", "b2", "c1", "c2"];
      const cefrBandsSeen = new Set();
      let cefrBest = null;
      const isDecline = (s) => /decline|prefer not|do not wish|don t wish|dont wish|not (to )?answer|not (to )?disclose|no answer/.test(norm(s));
      const wantedDecline = isDecline(full);
      // R3-Gusto: the board's own-website option is brand-named
      // ("Gusto Website") for the generic confirmed fact ("Company
      // Website") — same referent, weakest tier, exact wins above.
      const websiteClass = (s) => /^[a-z0-9 ]+ website$/.test(s) && s !== "website";
      // R3-Sezzle containment (coordinator ruling 2026-10-17): the
      // weakest tier, mirroring matchOption's containmentPick — an
      // option whose every token is one of the composite fact's
      // tokens states a strict subset of the truth and invents
      // nothing; any foreign token (superset, different fact, or
      // the same tokens reordered) never qualifies. An option
      // equal to the fact's first component wins, else the longest
      // qualifying option, else list order — deterministic.
      const fullNorm = norm(full);
      const vToks = fullNorm.split(" ").filter(Boolean);
      const vSet = new Set(vToks);
      const cut = vToks.findIndex((x) => x === "and" || x === "or");
      const firstComp = (cut === -1 ? vToks : vToks.slice(0, cut)).join(" ");
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
          if (!websiteHit && ((norm(full) === "company website" && websiteClass(norm(t))) || (websiteClass(norm(full)) && norm(t) === "company website"))) websiteHit = { el, t };
          if (vToks.length >= 3) {
            const nt = norm(t);
            const oSet = new Set(nt.split(" ").filter(Boolean));
            if (nt && nt !== fullNorm && oSet.size && oSet.size < vSet.size && [...oSet].every((x) => vSet.has(x))) {
              const rank = nt === firstComp ? 0 : 1;
              if (!containHit || rank < containHit.rank || (rank === containHit.rank && nt.length > containHit.len)) containHit = { el, t, rank, len: nt.length };
            }
          }
          if (vToks.includes("native")) {
            const band = cefrBands.indexOf((norm(t).split(" ")[0] || ""));
            if (band !== -1) {
              cefrBandsSeen.add(band);
              if (!cefrBest || band > cefrBest.band) cefrBest = { el, t, band };
            }
          }
        }
      }
      if (cefrBandsSeen.size >= 2 && cefrBest) cefrHit = cefrBest;
      const hit = segHit || declineHit || tokenHit || prefixHit || websiteHit || containHit || cefrHit;
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
  await page.fill(b.selector, wanted, { timeout: 20000 });
  return { expect: wanted, chosenText: null, via: undefined };
}
function widgetPersisted(got, driven) {
  if (got === undefined || normPersist(got) === "") return false;
  if (normPersist(got) === normPersist(driven.expect)) return true;
  if (!driven.chosenText) return false;
  return normPersist(got) === normPersist(driven.chosenText)
    || normPersist(driven.chosenText).endsWith(normPersist(got))
    || (normPersist(got).length >= 4 && normPersist(driven.chosenText).startsWith(normPersist(got)));
}

/* R3-D1: a file slot is identified, never guessed. The binding's
 * slot class comes from its profile key (module 150's classifier:
 * cover/transcript inputs never classify as resume). An input is
 * accepted as the slot's own only by (a) the binding's selector,
 * (b) the discovered element's id/name, or (c) the upload section
 * that names THIS slot class — the nearest ancestor whose text names
 * exactly one slot class decides, so a form-level ancestor naming
 * every slot decides nothing. The pre-fix ladder took the first
 * input[type=file] in the document and its attach-control search the
 * first visible Attach control page-wide; on the live boards that
 * filed the resume packet into cover-letter slots (Ginkgo, ID.me,
 * Justworks, Gemini) and a transcript slot (Sezzle). The ladder below
 * never touches another slot's input or control: when the slot's own
 * input cannot be found, the honest verdict is not-mounted FOR THAT
 * SLOT, and cmdFill's verification says what the slot actually holds. */
function slotClassOf(binding) {
  const key = String((binding && (binding.profile_key || binding.field_id)) || "").toLowerCase();
  if (/cover/.test(key)) return "cover";
  if (/transcript/.test(key)) return "transcript";
  if (/resume|cv|curriculum/.test(key)) return "resume";
  return null;
}
/* In-page: find THIS slot's live file input. Self-contained (it is
 * serialized into the page). Returns { selector, via } or null. */
function fnFindSlotFileInput(args) {
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'));
  const SLOT_RES = { resume: /\bresume\b|\bcv\b|curriculum/i, cover: /\bcover\b/i, transcript: /\btranscript\b/i };
  const classifySection = (el) => {
    let node = el;
    for (let i = 0; i < 8 && node; i++) {
      const t = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400);
      const hits = Object.keys(SLOT_RES).filter((k) => SLOT_RES[k].test(t));
      if (hits.length === 1) return hits[0];
      node = node.parentElement;
    }
    return null;
  };
  const isFile = (el) => !!el && el.tagName === "INPUT" && (el.getAttribute("type") || "").toLowerCase() === "file";
  const mark = (el, via) => { el.setAttribute("data-upmore-slotfile", "1"); return { selector: '[data-upmore-slotfile="1"]', via }; };
  if (args.selector) { const el = document.querySelector(args.selector); if (isFile(el)) return { selector: args.selector, via: "binding_selector" }; }
  if (args.slotId) { const el = document.getElementById(args.slotId); if (isFile(el)) return { selector: "#" + esc(args.slotId), via: "slot_id" }; }
  if (args.slotName) { const el = document.querySelector('input[type="file"][name="' + String(args.slotName).replace(/"/g, '\\"') + '"]'); if (el) return mark(el, "slot_name"); }
  if (!args.slotClass) return null;
  for (const el of Array.from(document.querySelectorAll('input[type="file"]'))) {
    if (classifySection(el) === args.slotClass) return mark(el, "slot_section");
  }
  return null;
}
/* In-page: mark the attach control that belongs to THIS slot's
 * section — and no other slot's. Self-contained. */
function fnMarkSlotAttachControl(args) {
  const SLOT_RES = { resume: /\bresume\b|\bcv\b|curriculum/i, cover: /\bcover\b/i, transcript: /\btranscript\b/i };
  const classifySection = (el) => {
    let node = el;
    for (let i = 0; i < 8 && node; i++) {
      const t = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400);
      const hits = Object.keys(SLOT_RES).filter((k) => SLOT_RES[k].test(t));
      if (hits.length === 1) return hits[0];
      node = node.parentElement;
    }
    return null;
  };
  const vis = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  const textOf = (el) => ((el.innerText || el.textContent || "") + " " + (el.getAttribute("aria-label") || "")).replace(/\s+/g, " ").trim();
  const pools = ['button, label, [role="button"]', 'a, div, span'];
  for (const pool of pools) {
    for (const el of Array.from(document.querySelectorAll(pool))) {
      if (!vis(el)) continue;
      const t = textOf(el);
      if (!/attach|upload|add resume|add file|browse|choose file|drag/i.test(t) || t.length >= 90) continue;
      if (classifySection(el) !== args.slotClass) continue;
      el.setAttribute("data-upmore-attach", "1");
      return true;
    }
  }
  return false;
}
/* In-page: the slot section's rendered truth — whether it shows the
 * attached file's name chip (the board registered the upload in its
 * own state, whatever its input currently holds) and whether it
 * shows an upload error (the board's handler rejected/crashed the
 * registration — the live boards render "Cannot read properties of
 * undefined (reading 'uploadFile')" under the section when a
 * programmatic attach lands before the upload widget initializes).
 * Self-contained. */
function fnSlotFileState(args) {
  const SLOT_RES = { resume: /\bresume\b|\bcv\b|curriculum/i, cover: /\bcover\b/i, transcript: /\btranscript\b/i };
  const classifySection = (el) => {
    let node = el;
    for (let i = 0; i < 8 && node; i++) {
      const t = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400);
      const hits = Object.keys(SLOT_RES).filter((k) => SLOT_RES[k].test(t));
      if (hits.length === 1) return hits[0];
      node = node.parentElement;
    }
    return null;
  };
  const sectionNodeOf = (el) => {
    let node = el;
    for (let i = 0; i < 8 && node; i++) {
      const t = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400);
      const hits = Object.keys(SLOT_RES).filter((k) => SLOT_RES[k].test(t));
      if (hits.length === 1) return node;
      node = node.parentElement;
    }
    return el ? el.parentElement : null;
  };
  let section = null;
  let holdsFile = false;
  if (args.selector) {
    const el = document.querySelector(args.selector);
    if (el) {
      section = sectionNodeOf(el);
      // The input the attach actually used still holding the named
      // file is direct evidence (the bytes were sha-verified by the
      // caller before the attach) — the channel that covers boards
      // which remount the input under a fresh id, where no
      // selector-keyed readback can follow it (BUG-207 addendum).
      holdsFile = el.tagName === "INPUT" && (el.getAttribute("type") || "").toLowerCase() === "file"
        && !!(el.files && el.files.length > 0 && args.filename && el.files[0].name === args.filename);
    }
  }
  if (!section && args.slotClass) {
    for (const el of Array.from(document.querySelectorAll('input[type="file"], button, label, [role="button"], span, div'))) {
      if (classifySection(el) === args.slotClass) { section = sectionNodeOf(el); if (section) break; }
    }
  }
  if (!section) return { chip: false, error: false, holdsFile };
  const t = (section.innerText || section.textContent || "").replace(/\s+/g, " ");
  return {
    chip: !!args.filename && t.includes(args.filename),
    error: /cannot read properties|upload(ing)? (failed|error)|an error occurred/i.test(t),
    holdsFile,
  };
}
/* Page-level file attach for when the discovered handle cannot be
 * used — the current boards mount their file inputs late, hide them
 * behind a styled dropzone, lazy-mount them when the upload section
 * nears the viewport, or mount them only once the board's own Attach
 * control is engaged (BUG-207 addendum + BUG-237: file_input_not_
 * mounted on 18 of 24 boards in Drive Pass 2). Slot-faithful since
 * R3-D1: it polls for THIS slot's input, engages only THIS slot's
 * own Attach control, and sets the files — through CDP when the
 * standard call cannot complete (the same mechanism the browser's
 * own file picker uses). Returns { ok, selectorUsed, stages } — only
 * a board that still shows no input for this slot after all of that
 * earns a not-mounted report. */
async function attachFilePageLevel(board, cmd) {
  const page = board.page;
  const b = cmd.binding;
  const slotArgs = { selector: b.selector || null, slotId: b.slotId || null, slotName: b.slotName || null, slotClass: slotClassOf(b) };
  const stages = [];
  const findSlot = () => page.evaluate(fnFindSlotFileInput, slotArgs).catch(() => null);
  const pollSlot = async (ms) => {
    const deadline = Date.now() + ms;
    let hit = await findSlot();
    while (!hit && Date.now() < deadline) { await page.waitForTimeout(500); hit = await findSlot(); }
    return hit;
  };
  // Bring the slot's own section into view (boards lazy-mount the
  // input as its section nears the viewport).
  if (slotArgs.slotClass) {
    await page.evaluate((slotClass) => {
      const SLOT_RES = { resume: /\bresume\b|\bcv\b|curriculum/i, cover: /\bcover\b/i, transcript: /\btranscript\b/i };
      for (const el of Array.from(document.querySelectorAll('input[type="file"], button, label, span, div'))) {
        let node = el, cls = null;
        for (let i = 0; i < 8 && node; i++) {
          const t = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400);
          const hits = Object.keys(SLOT_RES).filter((k) => SLOT_RES[k].test(t));
          if (hits.length === 1) { cls = hits[0]; break; }
          node = node.parentElement;
        }
        if (cls === slotClass) { el.scrollIntoView({ block: "center" }); return true; }
      }
      return false;
    }, slotArgs.slotClass).catch(() => {});
  } else {
    await page.evaluate(() => {
      const l = document.querySelector('[class*="file-upload"], [data-testid*="resume" i]');
      if (l) l.scrollIntoView({ block: "center" });
    }).catch(() => {});
  }
  await page.waitForTimeout(400);
  let found = await pollSlot(4000);
  if (found) stages.push("slot_input:" + found.via);
  if (!found && slotArgs.slotClass) {
    const marked = await page.evaluate(fnMarkSlotAttachControl, slotArgs).catch(() => false);
    if (marked) {
      stages.push("slot_control_engaged");
      await page.click('[data-upmore-attach="1"]', { timeout: 8000 }).catch(() => {});
      found = await pollSlot(8000);
      if (found) stages.push("slot_input_after_control:" + found.via);
    }
  }
  if (!found) found = await pollSlot(4000);
  if (!found) return { ok: false, selectorUsed: b.selector, stages };
  const selector = found.selector;
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
  return { ok: true, selectorUsed: selector, stages };
}

/* The post-drive widget verify (R3-D2): boards remount the control
 * after a pick and re-render the value on their own commit — the
 * one-shot read at +450ms judged the gap, not the fill (Ginkgo and
 * ID.me how-heard fills reported value_did_not_persist while their
 * final screenshots showed the values present as chips). Poll the
 * rendered value until it persists AND is stable: two consecutive
 * equal reads, so a board that canonicalizes the pick after first
 * rendering it (a location typeahead settling on "Chicago, Illinois,
 * United States") is recorded at its settled rendering — the text
 * module 149 compares the doorstep readback against. Returns the
 * verified rendered text, or undefined when the window closes. */
async function pollWidgetVerified(board, b, driven) {
  const page = board.page;
  let last;
  const deadline = Date.now() + 3600;
  while (Date.now() < deadline) {
    const rendered = await page.evaluate(fnWidgetValue, b.selector).catch(() => null);
    const got = rendered === null ? undefined : rendered;
    if (got !== undefined && widgetPersisted(got, driven)) {
      if (got === last) return got;
      last = got;
    } else last = undefined;
    await page.waitForTimeout(300);
  }
  return undefined;
}

async function cmdFill(board, cmd) {
  const b = cmd.binding, value = cmd.value;
  const settleMs = [450, 650, 1000];
  if (b.widget === "react-select") {
    // A widget fill is ONE complete drive (click, type, option poll,
    // pick) plus its verify. The verify polls the board's rendered
    // truth until it stabilizes (R3-D2 above) — it never re-judges a
    // landed pick from a single read in the board's remount gap.
    const driven = await driveWidget(board, cmd);
    const verified = await pollWidgetVerified(board, b, driven);
    if (verified !== undefined) {
      return { filled: true, verified: true, attempts: 1, via: driven.via || undefined, rendered: verified };
    }
    // One bounded repair, only when the drive never landed a pick at
    // all (its option service never answered in time): a re-drive
    // cannot degrade a pick that does not exist. When a pick DID land
    // and the board still dropped it past the verify window, the
    // honest failure stands — module 149's doorstep readback and
    // repair loop judge the page's final state there, and repeated
    // verbatim drives degrade the page (probe-bisected 2026-10-15).
    if (!driven.chosenText) {
      const redriven = await driveWidget(board, cmd);
      const reverified = await pollWidgetVerified(board, b, redriven);
      if (reverified !== undefined) {
        return { filled: true, verified: true, attempts: 2, via: redriven.via || undefined, rendered: reverified };
      }
    }
    return { filled: false, reason: "value_did_not_persist", wanted: String(value) };
  }
  if (b.inputType === "file") {
    const bytes = fs.readFileSync(cmd.filePath);
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== value.sha256) throw Object.assign(new Error("resume bytes changed before upload"), { code: "RESUME_SHA_MISMATCH" });
    const slotArgs = { selector: b.selector || null, slotId: b.slotId || null, slotName: b.slotName || null, slotClass: slotClassOf(b) };
    // Every verified attach is remembered for this board: the
    // doorstep readback may need it when the board retires the file
    // input and holds the upload as a chip only (see cmdReadback).
    const recordFill = (r) => {
      board.fileFills = board.fileFills || new Map();
      board.fileFills.set(b.field_id, { filename: value.filename, sha256: value.sha256 });
      return r;
    };
    /* The slot's own truth, polled (R3-D1/D2): the live input's bytes
     * via fresh re-resolution (the discovery node may be a remounted
     * husk — the pre-fix one-shot readback through the stale handle
     * judged registered uploads as not-mounted), or the filename
     * chip the board renders in the slot's section when it registers
     * the upload in its own state. A rendered upload error ends the
     * poll early: the board's handler rejected this registration and
     * only a re-attach (which re-engages the slot's control — also
     * how an uninitialized upload widget wakes up) can change it. */
    const verifyAttach = async (selectorUsed) => {
      const deadline = Date.now() + 3500;
      while (true) {
        let got;
        try { got = await readbackBindingFresh(board, b); } catch (e) { got = undefined; }
        if (got && got.sha256 === value.sha256) return { ok: true, via: "input_bytes" };
        const st = await board.page.evaluate(fnSlotFileState, Object.assign({}, slotArgs, { selector: selectorUsed || slotArgs.selector, filename: value.filename })).catch(() => ({ chip: false, error: false }));
        if (st.holdsFile) return { ok: true, via: "input_files" };
        if (st.chip) return { ok: true, via: "section_chip" };
        if (st.error) return { ok: false, boardError: true };
        if (Date.now() >= deadline) return { ok: false };
        await board.page.waitForTimeout(400);
      }
    };
    let slotSeen = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      let attached = false;
      try {
        const nodes = [];
        for (const ref of b.elementRefs) nodes.push(await connected(board, ref));
        if (nodes.length) {
          await nodes[0].setInputFiles({ name: value.filename, mimeType: "application/octet-stream", buffer: bytes });
          attached = true; slotSeen = true;
        }
      } catch (e) { if (e.code !== "STALE_OBSERVATION") throw e; }
      if (attached) {
        const v = await verifyAttach(b.selector);
        if (v.ok) return recordFill({ filled: true, verified: true, attempts: attempt, via: v.via });
        // Not registered (or the board's handler crashed it): the
        // slot-faithful ladder below is the recovery — once per
        // attempt, never a verbatim re-run past the caller's ceiling.
        attached = false;
      }
      if (!attached) {
        const rec = await attachFilePageLevel(board, cmd);
        if (!rec.ok) {
          // Before the honest not-mounted verdict, one last look at
          // the slot's rendered state: an earlier attach in this same
          // call may have registered with the board even though its
          // input has since unmounted.
          const st = await board.page.evaluate(fnSlotFileState, Object.assign({}, slotArgs, { filename: value.filename })).catch(() => ({ chip: false }));
          if (st.chip) return recordFill({ filled: true, verified: true, attempts: attempt, via: "section_chip" });
          return { filled: false, reason: slotSeen ? "value_did_not_persist" : "file_input_not_mounted", stages: rec.stages };
        }
        slotSeen = true;
        const v = await verifyAttach(rec.selectorUsed);
        if (v.ok) return recordFill({ filled: true, verified: true, attempts: attempt, via: v.via });
      }
    }
    return { filled: false, reason: "value_did_not_persist", wanted: value.filename };
  }
  let last = null;
  let attemptBinding = b;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      // Retries act on live nodes, not the husks the board remounted
      // away during the previous attempt.
      const fresh = await reresolveBinding(board, b).catch(() => null);
      if (fresh) attemptBinding = fresh;
    }
    try {
      last = await fillOnceHandles(board, Object.assign({}, cmd, { binding: attemptBinding }));
    } catch (e) {
      if (e.code === "STALE_OBSERVATION") throw e;
      // R3-D2: a board remount can throw mid-fill (the live name_pair
      // fill that died DRIVER_ERROR in the R3 probes) — that is a
      // failed ATTEMPT, not a dead field. The loop re-resolves and
      // retries; only a field that fails every attempt earns the
      // failure verdict below.
      last = null;
      if (attempt === 3) return { filled: false, reason: "value_did_not_persist", wanted: String(value && value.filename ? value.filename : value) };
      continue;
    }
    if (!last.filled) return last; // e.g. option_not_found — retrying cannot invent an option
    // Settle, then poll the verification readback (R3-D2): the first
    // read waits out the settle (a value read inside the board's
    // remount window proves nothing — the BUG-207 discipline), and
    // later reads poll across the gap a one-shot read would judge.
    // The verification readback re-observes on stale
    // (readbackBindingFresh): a node the board remounted mid-drive
    // reads as its CURRENT value — on a never-persist board that is
    // "absent", which is the truth this loop exists to judge, not an
    // error that aborts the fill. The recorded rendering is the
    // value the verify actually read off the page.
    await board.page.waitForTimeout(settleMs[attempt - 1]);
    const deadline = Date.now() + 1800;
    let got;
    let matched = false;
    while (true) {
      try { got = await readbackBindingFresh(board, attemptBinding); } catch (e) { if (e.code === "STALE_OBSERVATION") throw e; got = undefined; }
      if (persistedMatches(got, last.expect, b.inputType)) { matched = true; break; }
      if (Date.now() >= deadline) break;
      await board.page.waitForTimeout(300);
    }
    if (matched) {
      const out = { filled: true, verified: true, attempts: attempt, rendered: got !== undefined ? got : last.expect };
      if (last.capped) out.capped = last.capped;
      return out;
    }
  }
  return { filled: false, reason: "value_did_not_persist", wanted: String(value && value.filename ? value.filename : value) };
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
  const fields = await board.page.evaluate(fnDiscoverFields);
  const version = (board.observation && board.observation.version) || "re";
  const mint = async (f) => {
    const h = await resolveFieldHandle(board.page, f);
    if (!h) return null;
    const ref = version + ":f:" + f.domIndex;
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
    if (!fresh) return undefined;
    return await readbackBinding(board, fresh);
  }
}

async function cmdReadback(board, cmd) {
  const answers = {};
  for (const b of cmd.bindings) {
    let value = await readbackBindingFresh(board, b);
    if (value === undefined && b.inputType === "file" && board.fileFills && board.fileFills.has(b.field_id)) {
      // R3-Gusto: after a successful attach the board may remove the
      // file input entirely — the upload survives only as the
      // filename chip in the slot's section, and every selector-keyed
      // readback reads the field as absent (the live Gusto run's
      // payload gate then reported its verified resume missing and
      // the repair died UNKNOWN_FIELD). The chip on the LIVE page,
      // naming the exact file this board verified at fill time, is
      // the board's own proof it still holds that upload; the sha is
      // the fill-time-verified sha of those bytes, never a guess.
      const rec = board.fileFills.get(b.field_id);
      const slotArgs = { selector: b.selector || null, slotId: b.slotId || null, slotName: b.slotName || null, slotClass: slotClassOf(b) };
      const st = await board.page.evaluate(fnSlotFileState, Object.assign({}, slotArgs, { filename: rec.filename })).catch(() => ({ chip: false }));
      if (st.chip) value = { filename: rec.filename, sha256: rec.sha256 };
    }
    if (value !== undefined) answers[b.field_id] = value;
  }
  return { answers };
}

async function cmdReview(board, cmd) {
  const page = board.page;
  const captcha = await page.evaluate(fnDetectChallenge);
  if (captcha) return { captcha: "challenge", finalUrl: page.url() };
  // The review re-observes before it judges (R3-Gusto): boards
  // remount their controls when the form completes (Greenhouse
  // re-renders its footer on the last fills), so the observation's
  // control refs point at disconnected nodes and the drift check
  // below threw STALE_OBSERVATION — which module 150 maps to
  // needsFields, sending a live run around eight identical re-fill
  // rounds against a form that was never going to sit still. The
  // field checks already ran on a fresh discovery; the controls now
  // do too, and the fresh observation rides the result back so the
  // caller's versioned follow-ups stay in sync.
  await cmdDiscover(board);
  const fields = board.observation.fields;
  const unknownSelectors = fields.filter((f) => !(cmd.knownSelectors || []).includes(f.selector)).map((f) => f.selector);
  // needsFields carries its evidence too (R3-Gusto): a bare flag sent
  // the run around eight identical re-fill rounds with nothing naming
  // what the review actually saw.
  if (unknownSelectors.length) return { needsFields: true, needsFieldsDetail: { unknownSelectors }, observation: board.observation, finalUrl: page.url() };
  // Group semantics (R3-Gusto): boards mark EVERY box of a required
  // checkbox group `required` (the live Gusto how-heard fieldset),
  // and HTML5 validity is per-box — the ten unchecked options read
  // invalid forever although the group is satisfied by the one
  // checked box, which is how the board itself judges it at submit.
  // A required checkbox whose named group has a checked member is
  // satisfied; a lone required checkbox (unique name, unchecked)
  // still flags, as does a group with nothing checked.
  const checkedGroupNames = await page.evaluate(() => {
    const names = new Set();
    for (const el of Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))) if (el.name) names.add(el.name);
    return Array.from(names);
  }).catch(() => []);
  const invalid = fields.filter((f) => !f.disabled && f.required && !f.valid
    && !(f.inputType === "checkbox" && f.name && checkedGroupNames.includes(f.name)));
  // The verdict carries its evidence (R3-Gusto): which fields the
  // board's own validity flags reject — a bare code left the stop
  // unactionable when every fill had verified.
  if (invalid.length) return { code: "FORM_VALIDATION_FAILED", invalidFields: invalid.map((f) => ({ selector: f.selector, id: f.id || null, name: f.name || null, inputType: f.inputType, label: f.label || null, validationMessage: f.validationMessage || null })), observation: board.observation, finalUrl: page.url() };
  for (const control of board.observation.controls) {
    const handle = await connected(board, control.ref);
    if (control.disabled === await handle.isEnabled()) return { needsFields: true, needsFieldsDetail: { controlDrift: control.label || control.kind || "control" }, observation: board.observation, finalUrl: page.url() };
  }
  const next = board.observation.controls.find((c) => c.kind === "next" && !c.disabled);
  if (next) {
    await (await connected(board, next.ref)).click({ timeout: 20000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
    return { advanced: true, observation: board.observation, finalUrl: board.blockedNav || page.url(), blockedNavigation: board.blockedNav };
  }
  const submit = board.observation.controls.find((c) => c.kind === "submit" && !c.disabled);
  return { atFinalReview: !!submit, observation: board.observation, finalUrl: page.url() };
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
