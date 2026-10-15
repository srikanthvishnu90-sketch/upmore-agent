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
const net = require("node:net");

const dir = process.argv[2];
if (!dir) { console.error("usage: portal-browser-helper.cjs <sessionDir>"); process.exit(2); }

function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  tries.push(path.join(__dirname, "..", "..", "..", "sporve-agent-clone", "node_modules", "playwright"));
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  return null;
}
const pw = resolvePlaywright();
if (!pw) { fs.writeFileSync(path.join(dir, "fatal.json"), JSON.stringify({ code: "PLAYWRIGHT_UNRESOLVABLE", message: "playwright not resolvable in helper (set UPMORE_PLAYWRIGHT_PATH)" })); process.exit(3); }

const boards = new Map(); // boardId -> { context, page, url }
let browser = null;
let relayServer = null;
let lastActivity = Date.now();

/* Sandbox egress (the ci-browse pattern): when the environment provides
 * *_PROXY variables, the VM reaches the internet only through an HTTP
 * CONNECT proxy that drops CONNECTs coming directly from Chromium's
 * network process. So Chromium is pointed at a loopback CONNECT relay run
 * by this process (forwarded unauthenticated), loopback bypasses the
 * relay, and contexts accept the sandbox MITM CA via ignoreHTTPSErrors.
 * With no proxy variables (a normal dev machine / CI) the launch is a
 * plain direct launch. */
async function getBrowser() {
  if (browser) return browser;
  const launchOpts = { headless: true, args: ["--no-sandbox"] };
  const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxyServer) {
    let upstreamHost = null, upstreamPort = 3128;
    try { const u = new URL(proxyServer); upstreamHost = u.hostname; upstreamPort = Number(u.port) || 3128; } catch (e) { upstreamHost = null; }
    if (upstreamHost) {
      relayServer = net.createServer((client) => {
        let buf = Buffer.alloc(0); let up = null; let sent = false;
        client.on("data", (c) => {
          if (!sent) {
            buf = Buffer.concat([buf, c]);
            if (buf.includes("\r\n\r\n")) {
              sent = true; const head = buf;
              up = net.connect(upstreamPort, upstreamHost, () => up.write(head));
              up.on("data", (d) => client.write(d));
              up.on("error", () => client.destroy());
              up.on("close", () => client.end());
            }
          } else if (up) up.write(c);
        });
        client.on("error", () => { if (up) up.destroy(); });
      });
      await new Promise((r) => relayServer.listen(0, "127.0.0.1", r));
      launchOpts.proxy = { server: "http://127.0.0.1:" + relayServer.address().port, bypass: "localhost,127.0.0.1,::1" };
    }
  }
  browser = await pw.chromium.launch(launchOpts);
  return browser;
}
// §6.3 hop gate (BUG-060 / D1): the allowlist holds on EVERY main-frame
// navigation, not just the URL module 150 was asked to open. Boards
// redirect off their own host (Greenhouse -> the employer's site); the
// redirect target must never even load. Only main-frame navigation
// requests are gated — subresources (scripts, trackers, CDNs) pass
// untouched, and the one armed submit's own landing navigation is
// suspended by cmdSubmitCapture (the employer's answer is evidence).
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
    const context = await b.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const entry = { context, page, url: null, blockedNav: null, submitInProgress: false };
    boards.set(boardId, entry);
    // Redirect hops never pass through page.route (a 302 target is part
    // of the initial request chain in Chromium/Playwright), but they DO
    // surface as request events — record any off-allowlist main-frame
    // navigation attempt so cmdOpen/cmdReview can stop on it, and
    // module 150's post-load final-URL gate makes the typed refusal.
    page.on("request", (req) => {
      try {
        if (!entry.submitInProgress && req.isNavigationRequest() && req.frame() === page.mainFrame() && !navAllowed(req.url())) {
          entry.blockedNav = entry.blockedNav || req.url();
        }
      } catch (e) { /* frame may be gone; the final-URL gate still decides */ }
    });
    await page.route("**/*", async (route) => {
      try {
        const req = route.request();
        if (!entry.submitInProgress && req.isNavigationRequest() && req.frame() === page.mainFrame() && !navAllowed(req.url())) {
          entry.blockedNav = req.url();
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      } catch (e) { try { await route.continue(); } catch (_) { /* already handled */ } }
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
function fnDiscoverFields() {
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
    if (el.disabled) return;
    const visible = type === "file" ? true : (el.offsetParent !== null || el.getClientRects().length > 0);
    if (!visible) return;
    const label = labelFor(el);
    const f = {
      domIndex: idx, selector: selectorFor(el, idx), tag: el.tagName.toLowerCase(),
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
function fnReviewState() {
  const btns = Array.from(document.querySelectorAll("button, input[type=submit], a[role=button]"));
  const text = (b) => (b.innerText || b.value || "").replace(/\s+/g, " ").trim();
  const vis = (b) => b.offsetParent !== null || b.getClientRects().length > 0;
  const submit = btns.find((b) => vis(b) && /submit/i.test(text(b)));
  const next = btns.find((b) => vis(b) && /^(next|continue|review application|save and continue)$/i.test(text(b)));
  if (next) next.setAttribute("data-upmore-next", "1");
  return { hasSubmit: !!submit, hasNext: !!next };
}
function fnMarkSubmit() {
  const btns = Array.from(document.querySelectorAll("button, input[type=submit], a[role=button]"));
  const text = (b) => (b.innerText || b.value || "").replace(/\s+/g, " ").trim();
  const vis = (b) => b.offsetParent !== null || b.getClientRects().length > 0;
  const submit = btns.find((b) => vis(b) && /submit/i.test(text(b)));
  if (!submit) return false;
  submit.setAttribute("data-upmore-submit", "1");
  return true;
}
function fnReadback(bindings) {
  const out = {};
  for (const b of bindings) {
    try {
      if (b.inputType === "name_pair") {
        const vals = b.selectors.map((s) => { const el = document.querySelector(s); return el ? el.value || "" : ""; });
        const joined = vals.filter(Boolean).join(" ");
        if (joined) out[b.field_id] = joined;
        continue;
      }
      if (b.inputType === "radio_group" || b.inputType === "checkbox_group") {
        const picked = [];
        for (const opt of b.options || []) {
          const el = document.querySelector(opt.selector);
          if (el && el.checked) picked.push(opt.label);
        }
        if (picked.length) out[b.field_id] = b.inputType === "radio_group" ? picked[0] : picked;
        continue;
      }
      const el = document.querySelector(b.selector);
      if (!el) continue;
      if (b.inputType === "checkbox") { if (el.checked) out[b.field_id] = true; continue; }
      // react-select (BUG-207, live Greenhouse shape): the visible input
      // is only a SEARCH BOX — text typed into it is not a value. The
      // field's value is the component's chosen single-value; without a
      // selection the field is EMPTY however much search text sits in
      // the box. Reading the box's text as the value was how a hollow
      // location passed readback on the live board.
      if (el.tagName === "INPUT" && /select__input/.test(el.className || "")) {
        const root = el.closest('[class*="select__container"], [class*="-container"]') || el.parentElement;
        const sv = root && root.querySelector('[class*="select__single-value"], [class*="-singleValue"]');
        const t = sv ? (sv.textContent || "").replace(/\s+/g, " ").trim() : "";
        if (t) out[b.field_id] = t;
        continue;
      }
      if (el.tagName === "SELECT") {
        const o = el.options[el.selectedIndex];
        const v = o ? (o.textContent || "").replace(/\s+/g, " ").trim() : "";
        if (v && !/^select/i.test(v)) out[b.field_id] = v;
        continue;
      }
      if (b.inputType === "file") continue; // file values are tracked driver-side (no path/sha in DOM)
      const v = el.value;
      if (v !== undefined && v !== "") out[b.field_id] = v;
    } catch (e) { /* field vanished mid-read; omit it — absence is the honest answer */ }
  }
  return out;
}

// ---------- command implementations ----------
async function cmdOpen(board, cmd) {
  const page = board.page;
  const navSteps = [];
  board.blockedNav = null;
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
    if (fields.length < 2) {
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
  const raw = await board.page.evaluate(fnDiscoverFields);
  board.fieldCount = raw.length;
  return { fields: raw };
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

/* One fill attempt — the pre-D11 behavior. Returns { filled } plus, on
 * success, `expect`: the value a readback must show for the fill to count
 * as persisted (compared by cmdFill below). */
async function fillOnce(board, cmd) {
  const page = board.page;
  const b = cmd.binding;
  const value = cmd.value;
  if (b.inputType === "name_pair") {
    const parts = String(value).trim().split(/\s+/);
    const first = parts[0] || "";
    const last = parts.slice(1).join(" ");
    await page.fill(b.selectors[0], first, { timeout: 20000 });
    if (b.selectors[1]) await page.fill(b.selectors[1], last, { timeout: 20000 });
    return { filled: true, expect: [first, last].filter(Boolean).join(" ") };
  }
  if (b.inputType === "file") {
    // The current boards mount their file inputs late and keep them
    // visually hidden behind a styled dropzone (BUG-207 addendum, live
    // 2026-10-15: #resume present in the DOM from load, yet the plain
    // setInputFiles call waited out its full timeout on run after run
    // and the throw killed otherwise-complete runs). Wait for the
    // input to be ATTACHED first; if the standard call still cannot
    // complete, set the files through the DevTools protocol directly —
    // the same mechanism the browser's own file picker uses, which
    // dispatches the same change event the board's uploader listens
    // for. Only a truly absent input fails the fill.
    let selector = b.selector;
    let attached = await page.waitForSelector(selector, { state: "attached", timeout: 1500 }).then(() => true).catch(() => false);
    if (!attached) {
      // The board may have REMOUNTED the input under a fresh id after
      // discovery (the remount disease, file edition): re-discover the
      // form's file input live and use its current selector.
      const fresh = await page.evaluate(() => {
        const inp = document.querySelector('input[type="file"]');
        if (!inp) return null;
        if (inp.id) return "#" + inp.id;
        const all = Array.from(document.querySelectorAll('input[type="file"]'));
        return `input[type="file"]:nth-of-type(${all.indexOf(inp) + 1})`;
      }).catch(() => null);
      if (fresh && fresh !== selector) {
        attached = await page.waitForSelector(fresh, { state: "attached", timeout: 5000 }).then(() => true).catch(() => false);
        if (attached) selector = fresh;
      }
    }
    // Still nothing: the input may genuinely mount late — one long
    // wait on the discovery selector before the fill reports it absent.
    if (!attached) attached = await page.waitForSelector(b.selector, { state: "attached", timeout: 30000 }).then(() => true).catch(() => false);
    if (!attached) return { filled: false, reason: "file_input_not_mounted" };
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
    return { filled: true, expect: "__file__", via: selector !== b.selector ? "file_rediscovered" : undefined, selectorUsed: selector };
  }
  if (b.inputType === "select") {
    const hit = matchOption(b.options || [], value);
    if (!hit) return { filled: false, reason: "option_not_found", wanted: String(value) };
    await page.selectOption(b.selector, { value: hit.value }, { timeout: 20000 });
    return { filled: true, chosenLabel: hit.label, expect: hit.label };
  }
  if (b.inputType === "radio_group" || b.inputType === "checkbox_group") {
    const wanted = Array.isArray(value) ? value : [value];
    const hits = [];
    for (const w of wanted) {
      const hit = (b.options || []).find((o) => normOpt(o.label) === normOpt(w)) || matchOption(b.options || [], w);
      if (hit) { await page.check(hit.selector, { timeout: 20000 }).catch(async () => { await page.click(hit.selector, { timeout: 20000 }); }); hits.push(hit.label); }
    }
    return hits.length ? { filled: true, expect: b.inputType === "radio_group" ? hits[0] : hits } : { filled: false, reason: "option_not_found", wanted: wanted.join(", ") };
  }
  if (b.inputType === "checkbox") {
    if (value === true || value === "true") await page.check(b.selector, { timeout: 20000 });
    else await page.uncheck(b.selector, { timeout: 20000 }).catch(() => {});
    return { filled: true, expect: value === true || value === "true" ? true : "__absent__" };
  }
  // text-like. A react-select async widget (BUG-207, live Greenhouse
  // shape — Country and Location (City) are both rendered this way):
  // the visible input is a search box, typed text is NOT a value, and
  // an unpicked search text is cleared by the widget — a plain fill
  // "verified" against the box's text and the field was empty at the
  // doorstep, every time. The fill therefore drives the widget the way
  // the field demands: type the value, wait for the option list (the
  // board's option service can take seconds), and pick — with a real
  // mouse click, the event the component selects on — the option that
  // names the same value (an exact normalized match wins; otherwise
  // the value's own first token must appear in the option; an unrelated
  // option is never clicked). The readback expectation is the
  // component's chosen single-value text. When the board offers no
  // option list at all, the plain fill stands and verification decides.
  if (b.widget === "react-select" || b.profile_key === "location") {
    const wanted = String(value);
    const tok = wanted.split(",")[0].trim().toLowerCase();
    await page.click(b.selector, { timeout: 20000 }).catch(() => {});
    await page.fill(b.selector, "", { timeout: 20000 }).catch(() => {});
    await page.type(b.selector, wanted, { delay: 25, timeout: 20000 });
    let chosen = null;
    for (let i = 0; i < 12 && !chosen; i++) {
      await page.waitForTimeout(500);
      chosen = await page.evaluate(({ tok, full }) => {
        const vis = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
        const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
        document.querySelectorAll("[data-upmore-opt]").forEach((e) => e.removeAttribute("data-upmore-opt"));
        const pools = [".select__option", '[role="option"]', '[role="listbox"] *', ".pac-item", '[class*="suggestion"] *', '[class*="autocomplete"] *'];
        let tokenHit = null;
        for (const sel of pools) {
          for (const el of Array.from(document.querySelectorAll(sel))) {
            if (!vis(el)) continue;
            const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
            if (!t || t.length >= 90) continue;
            if (norm(t) === norm(full)) { el.setAttribute("data-upmore-opt", "1"); return t; }
            if (!tokenHit && t.toLowerCase().includes(tok)) tokenHit = { el, t };
          }
        }
        if (tokenHit) { tokenHit.el.setAttribute("data-upmore-opt", "1"); return tokenHit.t; }
        return null;
      }, { tok, full: wanted }).catch(() => null);
      if (chosen) {
        const clicked = await page.click('[data-upmore-opt="1"]', { timeout: 5000 }).then(() => true).catch(() => false);
        if (!clicked) { chosen = null; break; }
        await page.waitForTimeout(300);
      }
    }
    if (chosen) return { filled: true, expect: chosen, via: "widget_option_pick" };
    // No option list arrived: close the widget's open menu before the
    // plain fill stands, so the page is not left mid-interaction for
    // the fills that follow (an open react-select menu overlaying the
    // form degraded later fills on the live boards).
    await page.keyboard.press("Escape").catch(() => {});
    await page.fill(b.selector, wanted, { timeout: 20000 });
    return { filled: true, expect: wanted };
  }
  await page.fill(b.selector, String(value), { timeout: 20000 });
  return { filled: true, expect: String(value) };
}

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
async function verifyPersisted(board, cmd, expect, usedSelector) {
  const page = board.page;
  const b = cmd.binding;
  if (b.inputType === "file") {
    return await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return !!(el && el.files && el.files.length > 0);
    }, usedSelector || b.selector).catch(() => false);
  }
  const out = await page.evaluate(fnReadback, [b]).catch(() => ({}));
  return persistedMatches(out[b.field_id], expect, b.inputType);
}

/* D11 (BUG-207 / FR-364): a fill is not done when page.fill returns — the
 * live Greenhouse board's remount cycle replaces filled DOM nodes and
 * the value vanishes while the driver reports success (2026-10-15: Arc
 * kept 3/17 values, Labelbox 2/8 on the armed run). So every fill is
 * FILL-THEN-READBACK per field: fill, let the board settle, read the
 * field back, and re-fill the fresh node on a mismatch (bounded
 * attempts, growing settle). A field whose value will not persist is
 * reported { filled: false, reason: "value_did_not_persist" } — module
 * 150 records it as a fill failure and module 149's required-field gate
 * (BUG-209) stops the run instead of clicking a hollow form. */
async function cmdFill(board, cmd) {
  const settleMs = [450, 650, 1000];
  // A react-select widget fill is ONE complete drive (click, type,
  // option poll, pick). Re-driving it verbatim when the board's option
  // service never answered does not change the answer — and on the
  // live boards the repeated drives degrade the page until later
  // fields' inputs leave the DOM entirely (probe-bisected 2026-10-15:
  // name→resume fills fine, country-drive×3→resume finds its input
  // gone). Widget fills therefore get a single drive; the readback
  // verdict stands as reported.
  const maxAttempts = cmd.binding && cmd.binding.widget === "react-select" ? 1 : 3;
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await fillOnce(board, cmd);
    if (!last.filled) return last; // e.g. option_not_found — retrying cannot invent an option
    await board.page.waitForTimeout(settleMs[attempt - 1]);
    if (await verifyPersisted(board, cmd, last.expect, last.selectorUsed)) {
      return { filled: true, verified: true, attempts: attempt, via: last.via || undefined };
    }
  }
  return { filled: false, reason: "value_did_not_persist", wanted: String(cmd.value && cmd.value.filename ? cmd.value.filename : cmd.value) };
}

async function cmdReview(board) {
  const page = board.page;
  board.blockedNav = null;
  for (let step = 0; step < 8; step++) {
    const captcha = await page.evaluate(fnDetectChallenge);
    if (captcha) return { captcha: "challenge", finalUrl: page.url() };
    const state = await page.evaluate(fnReviewState);
    if (state.hasSubmit) return { ok: true, captcha: null, finalUrl: page.url() };
    if (!state.hasNext) return { ok: true, captcha: null, finalUrl: page.url() };
    try {
      await page.click('[data-upmore-next="1"]', { timeout: 20000 });
    } catch (e) {
      if (board.blockedNav) return { ok: true, captcha: null, finalUrl: board.blockedNav, blockedNavigation: board.blockedNav };
      throw e;
    }
    await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(700);
    if (board.blockedNav) return { ok: true, captcha: null, finalUrl: board.blockedNav, blockedNavigation: board.blockedNav };
  }
  const captcha = await page.evaluate(fnDetectChallenge);
  return captcha ? { captcha: "challenge", finalUrl: page.url() } : { ok: true, captcha: null, finalUrl: page.url() };
}

/* D12 evidence (BUG-208 / FR-366): is the application form itself still
 * open on this page — validation errors showing, or a live submit
 * control next to still-empty required fields? A page in that state is
 * an UNSUBMITTED form by construction, whatever prose it carries;
 * module 150's confirmation extractor vetoes every ID and success phrase
 * from such a page. */
function fnFormStillOpen() {
  const vis = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  const txt = ((document.body && document.body.innerText) || "");
  if (/\bis required\b|this field is required|please (enter|provide|complete) (a|an|your|the)/i.test(txt)) return true;
  const submit = Array.from(document.querySelectorAll("button, input[type=submit], a[role=button]"))
    .find((b) => vis(b) && /submit/i.test(b.innerText || b.value || ""));
  if (!submit) return false;
  return Array.from(document.querySelectorAll("input, select, textarea")).some((el) => {
    if (!vis(el)) return false;
    const type = (el.getAttribute("type") || el.tagName).toLowerCase();
    if (type === "hidden" || type === "submit" || type === "button") return false;
    const required = !!el.required || el.getAttribute("aria-required") === "true";
    if (!required) return false;
    if (type === "file") return !(el.files && el.files.length > 0);
    if (type === "checkbox" || type === "radio") return !el.checked;
    return !String(el.value || "").trim();
  });
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
  const marked = await page.evaluate(fnMarkSubmit);
  if (!marked) return { clicked: false, reason: "no_submit_control" };
  // The click is ALREADY authorized (armed board, 149's gate): the
  // employer's confirmation may legitimately land on another host, and
  // capturing that answer is evidence, not driving — so the navigation
  // gate is suspended for this one landing, then restored.
  board.submitInProgress = true;
  try { await page.click('[data-upmore-submit="1"]', { timeout: 20000 }); }
  finally { /* landing waits below still belong to the submit capture */ }
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  board.submitInProgress = false;
  const captcha = await page.evaluate(fnDetectChallenge);
  const text = await page.evaluate(() => ((document.body && document.body.innerText) || "").replace(/\s+/g, " ").slice(0, 6000)).catch(() => "");
  const formStillOpen = await page.evaluate(fnFormStillOpen).catch(() => false);
  let screenshot = null;
  if (cmd.screenshotPath) {
    try { await page.screenshot({ path: cmd.screenshotPath, fullPage: true }); screenshot = cmd.screenshotPath; } catch (e) { /* capture failure is reported as a null ref, never invented */ }
  }
  return { clicked: true, captcha: captcha || null, finalUrl: page.url(), text, screenshot, formStillOpen };
}

async function execute(boardId, cmd) {
  if (cmd.type === "shutdown") { setTimeout(() => process.exit(0), 50); return { ok: true }; }
  const board = await getBoard(boardId);
  switch (cmd.type) {
    case "open": return await cmdOpen(board, cmd);
    case "discover": return await cmdDiscover(board);
    case "fill": return await cmdFill(board, cmd);
    case "readback": return { answers: await board.page.evaluate(fnReadback, cmd.bindings) };
    case "file_present": return await board.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { present: "gone" }; // the widget replaced its own input — presence is unknowable from here, not a proven loss
      return { present: el.files && el.files.length > 0 ? "attached" : "empty" };
    }, cmd.selector);
    case "review": return await cmdReview(board);
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
      fs.writeFileSync(path.join(dir, respName + ".tmp"), JSON.stringify({ ok: false, error: { code: e.code || "DRIVER_ERROR", message: String(e.message || e) } }));
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
