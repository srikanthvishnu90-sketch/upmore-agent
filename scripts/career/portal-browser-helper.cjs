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
async function getBoard(boardId) {
  if (!boards.has(boardId)) {
    const b = await getBrowser();
    const context = await b.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    boards.set(boardId, { context, page, url: null });
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
      required: !!el.required || el.getAttribute("aria-required") === "true" || /(\*|✱)\s*$/.test(label) || /required/i.test(el.getAttribute("aria-label") || ""),
    };
    if (type === "radio" || type === "checkbox") f.groupLabel = clean(groupLabelFor(el));
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
  // "commit" + a soft domcontentloaded wait: heavy ATS pages hang for a
  // long time on third-party subresources, and the form is usable long
  // before every tracker finishes (a hard domcontentloaded wait timed
  // out at 45s on a live Greenhouse page that had in fact loaded). One
  // navigation retry on a timeout — a human would refresh too; nothing
  // has been filled or sent at this point, so a retry is stateless-safe.
  try {
    await page.goto(cmd.url, { waitUntil: "commit", timeout: 60000 });
  } catch (e) {
    navSteps.push("goto-retry:" + String(e.message || e).slice(0, 80));
    await page.waitForTimeout(3000);
    await page.goto(cmd.url, { waitUntil: "commit", timeout: 60000 });
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
  return { ok: true, captcha, finalUrl: board.url, fieldCount: board.fieldCount || 0, captchaTech: tech, navSteps };
}

async function cmdDiscover(board) {
  const raw = await board.page.evaluate(fnDiscoverFields);
  board.fieldCount = raw.length;
  return { fields: raw };
}

const normOpt = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
function matchOption(options, value) {
  const v = normOpt(value);
  if (!v) return null;
  let hit = options.find((o) => normOpt(o.label) === v || normOpt(o.value) === v);
  if (hit) return hit;
  const head = v.split(/\s*[—–(]\s*/)[0].trim(); // "yes — authorized..." -> "yes"
  hit = options.find((o) => normOpt(o.label) === head || normOpt(o.value) === head);
  if (hit) return hit;
  hit = options.find((o) => normOpt(o.label).startsWith(v) || v.startsWith(normOpt(o.label)) && normOpt(o.label).length > 1);
  return hit || null;
}

async function cmdFill(board, cmd) {
  const page = board.page;
  const b = cmd.binding;
  const value = cmd.value;
  if (b.inputType === "name_pair") {
    const parts = String(value).trim().split(/\s+/);
    const first = parts[0] || "";
    const last = parts.slice(1).join(" ");
    await page.fill(b.selectors[0], first, { timeout: 20000 });
    if (b.selectors[1]) await page.fill(b.selectors[1], last, { timeout: 20000 });
    return { filled: true };
  }
  if (b.inputType === "file") {
    await page.setInputFiles(b.selector, cmd.filePath, { timeout: 20000 });
    return { filled: true };
  }
  if (b.inputType === "select") {
    const hit = matchOption(b.options || [], value);
    if (!hit) return { filled: false, reason: "option_not_found", wanted: String(value) };
    await page.selectOption(b.selector, { value: hit.value }, { timeout: 20000 });
    return { filled: true, chosenLabel: hit.label };
  }
  if (b.inputType === "radio_group" || b.inputType === "checkbox_group") {
    const wanted = Array.isArray(value) ? value : [value];
    let any = false;
    for (const w of wanted) {
      const hit = (b.options || []).find((o) => normOpt(o.label) === normOpt(w)) || matchOption(b.options || [], w);
      if (hit) { await page.check(hit.selector, { timeout: 20000 }).catch(async () => { await page.click(hit.selector, { timeout: 20000 }); }); any = true; }
    }
    return any ? { filled: true } : { filled: false, reason: "option_not_found", wanted: wanted.join(", ") };
  }
  if (b.inputType === "checkbox") {
    if (value === true || value === "true") await page.check(b.selector, { timeout: 20000 });
    else await page.uncheck(b.selector, { timeout: 20000 }).catch(() => {});
    return { filled: true };
  }
  // text-like
  await page.fill(b.selector, String(value), { timeout: 20000 });
  return { filled: true };
}

async function cmdReview(board) {
  const page = board.page;
  for (let step = 0; step < 8; step++) {
    const captcha = await page.evaluate(fnDetectChallenge);
    if (captcha) return { captcha: "challenge" };
    const state = await page.evaluate(fnReviewState);
    if (state.hasSubmit) return { ok: true, captcha: null };
    if (!state.hasNext) return { ok: true, captcha: null };
    await page.click('[data-upmore-next="1"]', { timeout: 20000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(700);
  }
  const captcha = await page.evaluate(fnDetectChallenge);
  return captcha ? { captcha: "challenge" } : { ok: true, captcha: null };
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
  await page.click('[data-upmore-submit="1"]', { timeout: 20000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const captcha = await page.evaluate(fnDetectChallenge);
  const text = await page.evaluate(() => ((document.body && document.body.innerText) || "").replace(/\s+/g, " ").slice(0, 6000)).catch(() => "");
  let screenshot = null;
  if (cmd.screenshotPath) {
    try { await page.screenshot({ path: cmd.screenshotPath, fullPage: true }); screenshot = cmd.screenshotPath; } catch (e) { /* capture failure is reported as a null ref, never invented */ }
  }
  return { clicked: true, captcha: captcha || null, finalUrl: page.url(), text, screenshot };
}

async function execute(boardId, cmd) {
  if (cmd.type === "shutdown") { setTimeout(() => process.exit(0), 50); return { ok: true }; }
  const board = await getBoard(boardId);
  switch (cmd.type) {
    case "open": return await cmdOpen(board, cmd);
    case "discover": return await cmdDiscover(board);
    case "fill": return await cmdFill(board, cmd);
    case "readback": return { answers: await board.page.evaluate(fnReadback, cmd.bindings) };
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
