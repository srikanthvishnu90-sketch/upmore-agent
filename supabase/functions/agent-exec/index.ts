// Upmore agent-exec edge function.
// The real-world execution agent.
//
// Actions (POST /functions/v1/agent-exec, Supabase JWT required):
//   { approval_id }                                   -> run the merchant playbook
//   { action: "submit_otp", run_id, otp_code }         -> resume an awaiting_otp run
//   { action: "browser_selftest" }                    -> health check: real Browserbase
//                                                      session, hardcoded safe target
//                                                      (https://example.com) only
//
// Flow: verify approval (owned by caller, status approved) -> load vaulted
// merchant credential -> run merchant playbook (HTTP cookie-jar, or a real
// browser driven over CDP via Browserbase) -> record evidence -> done/failed.
//
// OTP handoff: when a browser playbook reaches a one-time-code step it pauses
// as awaiting_otp. The Browserbase session is created with keepAlive so it
// survives the pause; the app collects the code from the user and calls
// submit_otp, which reconnects to the SAME session and continues the playbook.
//
// Safety: only acts on approvals the user explicitly approved. Every run is
// written to exec_runs with evidence. Never moves money. OTP codes and API
// keys are never written to evidence, logs, or responses.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm";
import {
  playbookRegistry, merchantDirectory, GENERIC_FALLBACK,
  normalizeMerchant, resolveMerchant,
  type MerchantPlaybook, type Resolution,
 } from "./merchant-catalog.ts";
// Shared execution-trust logic (2026-09-28): the SAME module the fixtures
// exercise. Guards live there once — index.ts calls them, never re-implements.
import {
  decideExecuteGate,
  decideOtpSubmit,
  otpIsExpired,
  OTP_TTL_MS,
  pushShot,
  runDeclarative,
  categorizeExecFailure,
  shouldSkipRetryExec,
  execLessonTitle,
  REPEAT_FAILURE_REVERIFY_THRESHOLD,
  type BrowserOutcome,
  type ExecLessonRow,
} from "./execution-guards.ts";

const ALLOWED_ORIGINS = new Set([
  "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app",
  "http://localhost:3000",
  "http://localhost:8000",
  "http://localhost:8080",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:8080",
]);
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// JSON-stringify for safe embedding inside page-context JS expressions.
const jsq = (v: unknown) => JSON.stringify(v);

type ExecContext = {
  username: string;
  password: string;
  approval: Record<string, unknown>;
  admin: ReturnType<typeof createClient>;
};

type ExecResult = {
  ok: boolean;
  evidence: Record<string, unknown>;
  error?: string;
};

// ---- cookie jar for HTTP playbooks ----
class Jar {
  private cookies = new Map<string, string>();
  ingest(setCookies: string[] | null, domain: string) {
    if (!setCookies) return;
    for (const sc of setCookies) {
      const pair = sc.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function fetchWithJar(jar: Jar, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const ch = jar.header();
  if (ch) headers.set("Cookie", ch);
  // Manual redirect: automatic following hides intermediate Set-Cookie
  // headers from the jar. Callers that expect redirects must loop.
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36");
  }
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  const sc = res.headers.getSetCookie?.() ?? [];
  try {
    const u = new URL(url);
    jar.ingest(sc.length ? sc : null, u.hostname);
  } catch { /* ignore */ }
  return res;
}

// GET following redirects (up to 5), keeping the jar.
async function fetchFollow(jar: Jar, url: string): Promise<{ res: Response; text: string }> {
  let res = await fetchWithJar(jar, url);
  for (let i = 0; i < 5; i++) {
    const loc = res.headers.get("location");
    if (!loc || (res.status !== 301 && res.status !== 302 && res.status !== 303 && res.status !== 307 && res.status !== 308)) break;
    res = await fetchWithJar(jar, new URL(loc, url).toString());
  }
  return { res, text: await res.text() };
}

// ================= Browserbase driver =================
const BB_API = "https://api.browserbase.com/v1";

function bbApiKey(): string {
  const k = Deno.env.get("BROWSERBASE_API_KEY");
  if (!k) throw new Error("BROWSERBASE_API_KEY is not configured");
  return k;
}
function bbProjectId(): string {
  const p = Deno.env.get("BROWSERBASE_PROJECT_ID");
  if (!p) throw new Error("BROWSERBASE_PROJECT_ID is not configured");
  return p;
}

async function bbCreateSession(keepAlive: boolean): Promise<{ id: string; connectUrl: string }> {
  const res = await fetch(`${BB_API}/sessions`, {
    method: "POST",
    headers: { "x-bb-api-key": bbApiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: bbProjectId(), keepAlive }),
  });
  if (!res.ok) throw new Error(`Browserbase create session failed (HTTP ${res.status})`);
  const j = await res.json();
  if (!j.id || !j.connectUrl) throw new Error("Browserbase returned no session id/connectUrl");
  return { id: j.id as string, connectUrl: j.connectUrl as string };
}

async function bbRefreshSession(id: string): Promise<{ connectUrl: string; status: string }> {
  const res = await fetch(`${BB_API}/sessions/${id}`, {
    headers: { "x-bb-api-key": bbApiKey() },
  });
  if (!res.ok) throw new Error(`Browserbase session ${id} not reachable (HTTP ${res.status})`);
  const j = await res.json();
  if (!j.connectUrl) throw new Error("Browserbase session has no connectUrl");
  return { connectUrl: j.connectUrl as string, status: j.status as string };
}

async function bbStopSession(id: string): Promise<void> {
  try {
    await fetch(`${BB_API}/sessions/${id}`, {
      method: "DELETE",
      headers: { "x-bb-api-key": bbApiKey() },
    });
  } catch { /* best effort */ }
}

// ---- minimal CDP client over Deno's native WebSocket ----
class Cdp {
  private ws: WebSocket;
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private waiters: Array<{ method: string; sessionId?: string; done: () => void }> = [];
  private constructor(ws: WebSocket) { this.ws = ws; }

  static connect(url: string, timeoutMs = 25000): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      const cdp = new Cdp(ws);
      const t = setTimeout(() => {
        if (!settled) { settled = true; try { ws.close(); } catch { /* ignore */ } reject(new Error("CDP connect timeout")); }
      }, timeoutMs);
      ws.onopen = () => { if (!settled) { settled = true; clearTimeout(t); resolve(cdp); } };
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(t); reject(new Error("CDP websocket error")); } };
      ws.onmessage = (ev) => cdp.onMessage(String(ev.data));
      ws.onclose = () => {
        for (const [, p] of cdp.pending) p.reject(new Error("CDP socket closed"));
        cdp.pending.clear();
      };
    });
  }

  private onMessage(data: string) {
    let msg: any;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.id != null && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error("CDP error: " + JSON.stringify(msg.error).slice(0, 200)));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method) {
      const hit = this.waiters.filter((w) => w.method === msg.method && (w.sessionId == null || w.sessionId === msg.sessionId));
      this.waiters = this.waiters.filter((w) => !hit.includes(w));
      hit.forEach((w) => w.done());
    }
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    const id = ++this.nextId;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.ws.send(JSON.stringify(payload)); }
      catch (e) { this.pending.delete(id); reject(e); }
    });
  }

  waitForEvent(method: string, sessionId: string | undefined, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const done = () => { clearTimeout(t); resolve(true); };
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.done !== done);
        resolve(false);
      }, timeoutMs);
      this.waiters.push({ method, sessionId, done });
    });
  }

  close() { try { this.ws.close(); } catch { /* ignore */ } }

  async eval(sessionId: string, expression: string): Promise<any> {
    const r = await this.send("Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (r?.exceptionDetails) throw new Error("page eval failed");
    return r?.result?.value;
  }
}

// ---- a controllable page inside a Browserbase session ----
class BbPage {
  private constructor(private cdp: Cdp, readonly sessionId: string) {}

  static async open(cdp: Cdp): Promise<BbPage> {
    const { targetInfos } = await cdp.send("Target.getTargets");
    const infos: any[] = targetInfos || [];
    let target = infos.find((t) =>
      t.type === "page" && t.targetId && t.url &&
      !t.url.startsWith("chrome") && !t.url.startsWith("devtools"));
    if (!target) {
      const created = await cdp.send("Target.createTarget", { url: "about:blank" });
      target = { targetId: created.targetId };
    }
    const { sessionId } = await cdp.send("Target.attachToTarget",
      { targetId: target.targetId, flatten: true });
    const page = new BbPage(cdp, sessionId);
    await cdp.send("Page.enable", {}, sessionId);
    return page;
  }

  async goto(url: string, timeoutMs = 40000): Promise<void> {
    await this.cdp.send("Page.navigate", { url }, this.sessionId);
    // Wait for load; continue anyway on timeout (SPA navigations).
    await this.cdp.waitForEvent("Page.loadEventFired", this.sessionId, timeoutMs);
  }

  eval(expression: string): Promise<any> { return this.cdp.eval(this.sessionId, expression); }
  url(): Promise<string> { return this.eval("location.href"); }
  title(): Promise<string> { return this.eval("document.title"); }

  async waitFor(checkJs: string, timeoutMs = 20000, pollMs = 700): Promise<boolean> {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try { if (await this.eval(checkJs)) return true; } catch { /* mid-navigation */ }
      await sleep(pollMs);
    }
    return false;
  }

  async clickFirst(selectors: string[]): Promise<string | null> {
    for (const sel of selectors) {
      const r = await this.eval(`(() => {
        const el = document.querySelector(${jsq(sel)});
        if (!el || el.offsetParent === null) return null;
        el.scrollIntoView({ block: "center" });
        el.click();
        return "clicked";
      })()`).catch(() => null);
      if (r === "clicked") return sel;
    }
    return null;
  }

  // Click the first visible button/link whose text matches (case-insensitive).
  async clickText(pattern: string): Promise<string | null> {
    const r = await this.eval(`(() => {
      const re = new RegExp(${jsq(pattern)}, "i");
      const els = [...document.querySelectorAll("button, a, [role=button], input[type=submit]")];
      for (const el of els) {
        const t = ((el.innerText || el.value) || "").trim();
        if (t && re.test(t) && el.offsetParent !== null) {
          el.scrollIntoView({ block: "center" });
          el.click();
          return t.slice(0, 80);
        }
      }
      return null;
    })()`).catch(() => null);
    return r;
  }

  // Click inside an open dialog first (avoids dismiss "Cancel" buttons).
  async clickDialogButton(pattern: string): Promise<string | null> {
    const r = await this.eval(`(() => {
      const re = new RegExp(${jsq(pattern)}, "i");
      const scope = document.querySelector('[role="dialog"], [data-state="open"]') || document;
      const els = [...scope.querySelectorAll("button")];
      for (const el of els) {
        const t = (el.innerText || "").trim();
        if (t && re.test(t) && el.offsetParent !== null) {
          el.scrollIntoView({ block: "center" });
          el.click();
          return t.slice(0, 80);
        }
      }
      return null;
    })()`).catch(() => null);
    return r;
  }

  // Type into the first visible matching input (React-compatible events).
  async typeInto(selectors: string[], text: string): Promise<string | null> {
    for (const sel of selectors) {
      const r = await this.eval(`(() => {
        const el = document.querySelector(${jsq(sel)});
        if (!el || el.offsetParent === null) return null;
        el.focus();
        const tag = (el.tagName || "").toUpperCase();
        const proto = tag === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        if (desc && desc.set) desc.set.call(el, ${jsq(text)});
        else el.value = ${jsq(text)};
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return "typed";
      })()`).catch(() => null);
      if (r === "typed") return sel;
    }
    return null;
  }

  // Fill a one-time code: single input, else split-box OTP inputs.
  // The code travels only to the page; callers must never store it.
  async fillOtp(otp: string): Promise<string> {
    const single = await this.typeInto(
      ['input[autocomplete="one-time-code"]', 'input[name*="code" i]',
       'input[name*="otp" i]', 'input[inputmode="numeric"]', 'input[maxlength="6"]'],
      otp);
    if (single) {
      const sub = await this.clickFirst(['button[type="submit"]', 'input[type="submit"]']);
      if (!sub) {
        await this.eval(`(() => {
          const a = document.activeElement;
          if (a) a.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
        })()`).catch(() => null);
      }
      return "single:" + single;
    }
    const n = await this.eval(`(() => {
      const code = ${jsq(otp)};
      const boxes = [...document.querySelectorAll("input")].filter((el) => {
        if (el.offsetParent === null) return false;
        const ml = el.getAttribute("maxlength");
        return ml === "1" || (el.inputMode === "numeric" && (el.value || "").length <= 1);
      });
      if (boxes.length < 4) return 0;
      boxes.slice(0, code.length).forEach((b, i) => {
        b.focus();
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
        if (desc && desc.set) desc.set.call(b, code[i] || "");
        else b.value = code[i] || "";
        b.dispatchEvent(new Event("input", { bubbles: true }));
      });
      return boxes.length;
    })()`).catch(() => 0);
    return n ? "boxes:" + n : "";
  }

  async screenshot(label: string): Promise<{ label: string; data: string } | null> {
    try {
      const r = await this.cdp.send("Page.captureScreenshot",
        { format: "jpeg", quality: 40 }, this.sessionId);
      return r?.data ? { label, data: r.data as string } : null;
    } catch { return null; }
  }
}

// ================= merchant playbooks =================

// HTTP playbooks (cookie-jar based). Currently none — every supported
// merchant needs a real browser. The machinery above (Jar, fetchWithJar,
// fetchFollow) stays for future HTTP-capable merchants.
const playbooks: Record<string, (ctx: ExecContext) => Promise<ExecResult>> = {};

// ---- browser playbooks ----
// (BrowserOutcome is imported from ./execution-guards.ts — the shared trust module.)

type BrowserPlaybookDef = {
  // Run until the OTP pause (or terminal). Must never store secrets in ev.
  start: (ctx: ExecContext, page: BbPage, ev: Record<string, unknown>) => Promise<BrowserOutcome>;
  // Continue after the user supplies the code. `otp` must never be stored.
  resume: (ctx: ExecContext, page: BbPage, otp: string, ev: Record<string, unknown>, resume: Record<string, unknown>) => Promise<BrowserOutcome>;
};

// Devin (Cognition AI) browser playbook.
// Verified 2026-09-26: login is email-first + passwordless email OTP
// (Auth0 SPA underneath); cancel is a React dialog on private APIs.
// Stages: email -> OTP prompt (pause, awaiting_otp) -> on resume: enter
// code -> billing -> cancel dialog -> confirm -> capture confirmation.
const EMAIL_SELECTORS = [
  'input[type="email"]', 'input[name="email"]',
  'input[autocomplete="email"]', 'input[placeholder*="mail" i]',
];

async function devinStart(
  ctx: ExecContext, page: BbPage, ev: Record<string, unknown>,
): Promise<BrowserOutcome> {
  ev.login_url = "https://app.devin.ai/auth/login?redirect=/&reauth=true";
  await page.goto(ev.login_url as string);
  ev.after_goto_url = await page.url().catch(() => null);
  ev.title = await page.title().catch(() => null);
  pushShot(ev, await page.screenshot("login"));

  // Email-first: enter the email, then continue.
  const emailSel = await page.typeInto(EMAIL_SELECTORS, ctx.username);
  ev.email_field = emailSel;
  if (!emailSel) {
    return { ok: false, error: "Devin login page showed no email field — layout changed. Nothing was changed." };
  }
  const contSel = await page.clickFirst(['button[type="submit"]', 'input[type="submit"]']);
  const contText = contSel ? contSel : await page.clickText("^(continue|sign in|log in)$");
  ev.continue_clicked = contSel || contText;
  if (!ev.continue_clicked) {
    return { ok: false, error: "Entered the email but found no continue button. Nothing was changed." };
  }

  // Wait for the OTP prompt (code field or "check your email" copy).
  const otpCheck = `(() => {
    const t = (document.body.innerText || "").toLowerCase();
    return /check your email|enter (the )?code|verification code|one-time/.test(t) ||
      !!document.querySelector('input[autocomplete="one-time-code"], input[name*="code" i], input[name*="otp" i]');
  })()`;
  let otpSeen = await page.waitFor(otpCheck, 15000);
  ev.otp_prompt = otpSeen;
  ev.after_continue_url = await page.url().catch(() => null);
  if (!otpSeen) {
    // Fallback: press Enter in the email field (some React forms need it).
    await page.eval(`(() => {
      const el = document.querySelector('input[type="email"]');
      if (el) { el.focus(); el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true })); }
    })()`).catch(() => null);
    otpSeen = await page.waitFor(otpCheck, 15000);
    ev.otp_prompt_retry = otpSeen;
    ev.after_continue_url = await page.url().catch(() => null);
  }
  pushShot(ev, await page.screenshot("otp-prompt"));
  if (!otpSeen) {
    // Capture what the page actually says (rate-limit? validation error?).
    ev.post_continue_text = ((await page.eval(
      "(document.body.innerText || '').slice(0,1200)").catch(() => "")) as string);
    return { ok: false, error: "Entered the email but no verification-code prompt appeared. Nothing was changed." };
  }
  return {
    awaitingOtp: true,
    otpHint: "Devin emailed you a sign-in code — enter it here to continue.",
    resume: { stage: "otp" },
  };
}

async function devinResume(
  ctx: ExecContext, page: BbPage, otp: string,
  ev: Record<string, unknown>, _resume: Record<string, unknown>,
): Promise<BrowserOutcome> {
  void ctx; void _resume;
  // Enter the code (single input or split boxes).
  const how = await page.fillOtp(otp);
  ev.otp_entry = how || null;
  if (!how) {
    return { ok: false, error: "The code field disappeared — the session may have expired. Nothing was changed." };
  }
  await sleep(2000);
  pushShot(ev, await page.screenshot("otp-entered"));

  // Wait until we leave the auth area (logged in).
  const loggedIn = await page.waitFor(
    `!location.pathname.startsWith("/auth") && !/sign ?in|log ?in/i.test(document.title || "")`,
    45000);
  ev.logged_in = loggedIn;
  ev.post_login_url = await page.url().catch(() => null);
  if (!loggedIn) {
    return { ok: false, error: "The code was rejected or expired — nothing was changed." };
  }
  pushShot(ev, await page.screenshot("logged-in"));

  // Find billing: wait for the app to settle, scan for a billing link, else try known paths.
  await sleep(3000);
  let billingUrl: string | null = null;
  const foundLink = await page.eval(`(() => {
    const els = [...document.querySelectorAll("a[href]")];
    const m = els.find((a) =>
      /billing|subscription/i.test(a.getAttribute("href") || "") ||
      /billing|subscription/i.test(a.innerText || ""));
    return m ? m.getAttribute("href") : null;
  })()`).catch(() => null);
  if (foundLink) {
    try {
      billingUrl = foundLink.startsWith("http")
        ? foundLink
        : new URL(foundLink, await page.url()).toString();
      await page.goto(billingUrl, 25000);
    } catch { billingUrl = null; }
  }
  if (!billingUrl) {
    // Cognition's own emails point at /settings/plans — try it first.
    for (const p of ["/settings/plans", "/settings/billing", "/settings/subscription",
                     "/settings", "/account", "/settings/account"]) {
      const u = "https://app.devin.ai" + p;
      await page.goto(u, 25000);
      await sleep(2500);
      const t = ((await page.eval("document.body.innerText || \"\"").catch(() => "")) as string);
      if (/cancel (your |the )?(subscription|plan)|billing/i.test(t)) { billingUrl = u; break; }
      ev["billing_try_" + p.replace(/\//g, "_")] = t.slice(0, 300);
    }
  }
  ev.billing_url = billingUrl;
  pushShot(ev, await page.screenshot("billing"));
  if (!billingUrl) {
    return { ok: false, error: "Signed in, but couldn't find the billing page — nothing was changed." };
  }

  // Click "cancel subscription/plan" (word-boundary match avoids dismiss buttons).
  const clicked = await page.clickText("cancel (your |the )?(subscription|plan)");
  ev.cancel_clicked = clicked;
  if (!clicked) {
    return { ok: false, error: "Found billing but no cancel-subscription control — nothing was changed." };
  }
  // Observe what the click did: dialog, navigation, or nothing. Poll 20s.
  const preCancelUrl = await page.url().catch(() => null);
  let dialogSeen = false;
  let urlChanged = false;
  const ct0 = Date.now();
  while (Date.now() - ct0 < 20000) {
    const txt = ((await page.eval("document.body.innerText || \"\"").catch(() => "")) as string);
    if (/are you sure|confirm|cancellation|before you go|lose access|keep (your|the) (subscription|plan)/i.test(txt)) {
      dialogSeen = true; break;
    }
    const u = await page.url().catch(() => null);
    if (u && u !== preCancelUrl) { urlChanged = true; break; }
    const modal = await page.eval(
      `!!document.querySelector('[role="dialog"],[role="alertdialog"],[data-state="open"]')`
    ).catch(() => false);
    if (modal) { dialogSeen = true; break; }
    await sleep(1000);
  }
  ev.confirm_dialog = dialogSeen;
  ev.post_cancel_url = await page.url().catch(() => null);
  pushShot(ev, await page.screenshot("confirm-dialog"));
  if (!dialogSeen && !urlChanged) {
    ev.post_cancel_text = ((await page.eval(
      "(document.body.innerText || '').slice(0,1500)").catch(() => "")) as string);
    return { ok: false, error: "Clicked cancel but the page didn't respond — nothing was changed." };
  }

  // Confirm: click the final destructive button. Prefer dialog-scoped buttons;
  // fall back to a page-wide pick that excludes dismiss/keep buttons.
  const confirmed = await page.clickDialogButton(
    "confirm|yes,?\\s*cancel|cancel (my |the )?subscription|end (my |the )?(subscription|plan)"
  ) || await page.eval(`(() => {
    const els = [...document.querySelectorAll("button, [role=button], input[type=submit]")];
    const bad = /keep|back|not now|never mind|dismiss|close/i;
    const good = /^(confirm|yes[,.]?\\s*(cancel|do it)|cancel (my |the )?(subscription|plan)|end (my |the )?(subscription|plan))$/i;
    for (const el of els) {
      const t = ((el.innerText || el.value) || "").trim();
      if (!t || el.offsetParent === null) continue;
      if (good.test(t) && !bad.test(t)) {
        el.scrollIntoView({ block: "center" }); el.click();
        return t.slice(0, 80);
      }
    }
    return null;
  })()`).catch(() => null);
  ev.confirm_clicked = confirmed;
  if (!confirmed) {
    return { ok: false, error: "The cancel dialog appeared but the confirm button couldn't be clicked — nothing was changed." };
  }
  await sleep(4000);
  const pageText = ((await page.eval("document.body.innerText || \"\"").catch(() => "")) as string);
  const m = pageText.match(/cancell?ed|cancellation confirmed|subscription (will |has )?(end|cancel)|no longer be billed|access until/i);
  if (m) {
    const i = pageText.indexOf(m[0]);
    ev.confirmation_text = pageText.slice(Math.max(0, i - 120), i + 200);
  }
  pushShot(ev, await page.screenshot("confirmation"));
  if (!m) {
    return { ok: false, error: "Clicked cancel but no confirmation text appeared — check the Devin dashboard before retrying." };
  }
  ev.note = "Devin subscription cancellation confirmed in the browser.";
  return { ok: true };
}

// ---- Cluely (2026-09-29): Stripe Customer Portal magic-link flow ----
// Cluely's official cancellation article links its Stripe Customer Portal
// directly (no Cluely web login, no desktop app needed). Entering the
// subscription email makes Stripe email a one-time sign-in link; opening it
// lands in the portal where the subscription can be cancelled.
// Two phases: start (email -> await link) / resume (link -> cancel).
const CLUELY_PORTAL_LOGIN = "https://billing.stripe.com/p/login/8x2eVddxPgET2ZhazV2Ry00";

async function cluelyStart(
  ctx: ExecContext, page: BbPage, ev: Record<string, unknown>,
): Promise<BrowserOutcome> {
  ev.login_url = CLUELY_PORTAL_LOGIN;
  await page.goto(ev.login_url as string, 45000);
  ev.after_goto_url = await page.url().catch(() => null);
  ev.title = await page.title().catch(() => null);
  // Stripe portal is a React app — wait for it to render.
  await sleep(5000);
  // Wait for any email-like input to appear (up to 20s).
  const inputAppeared = await page.waitFor(`(() => {
    return !!document.querySelector('input[type="email"], input[name="email"], input[autocomplete="email"], input[placeholder*="mail" i]');
  })()`, 20000);
  ev.input_appeared = inputAppeared;
  pushShot(ev, await page.screenshot("portal-login"));

  const emailSel = await page.typeInto(EMAIL_SELECTORS, ctx.username);
  ev.email_field = emailSel;
  if (!emailSel) {
    ev.page_text_sample = ((await page.eval(
      "(document.body.innerText || '').slice(0,800)").catch(() => "")) as string);
    return { ok: false, error: "Stripe portal showed no email field — layout changed. Nothing was changed." };
  }
  // Wait a moment for the form to validate the email.
  await sleep(2000);
  // Try multiple button strategies: submit buttons, then text match, then any button in the form.
  let contClicked: string | null = await page.clickFirst(['button[type="submit"]', 'input[type="submit"]']);
  if (!contClicked) {
    contClicked = await page.clickText("^(continue|sign in|log in|send.*link|send|submit)$");
  }
  if (!contClicked) {
    // Last resort: click any visible button near the email field.
    contClicked = await page.eval(`(() => {
      const emailEl = document.querySelector('input[type="email"], input[name="email"]');
      if (!emailEl) return null;
      const form = emailEl.closest('form') || document;
      const btns = [...form.querySelectorAll('button')].filter(b => b.offsetParent !== null);
      if (btns.length === 0) return null;
      const btn = btns[0];
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      return (btn.innerText || 'button').slice(0, 40);
    })()`).catch(() => null) as string | null;
  }
  ev.continue_clicked = contClicked;
  if (!ev.continue_clicked) {
    // Last resort: press Enter in the email field.
    const enterWorked = await page.eval(`(() => {
      const el = document.querySelector('input[type="email"], input[name="email"]');
      if (!el) return false;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      return true;
    })()`).catch(() => false);
    ev.enter_key_tried = enterWorked;
    if (!enterWorked) {
      return { ok: false, error: "Entered the email but found no continue button. Nothing was changed." };
    }
  }
  // Stripe confirms the link was sent ("Check your email", "we sent you a link", etc.).
  const linkCheck = `(() => {
    const t = (document.body.innerText || "").toLowerCase();
    return /check your (email|inbox)|we (sent|emailed) you|sign-in link|login link|email.*link.*sent/i.test(t);
  })()`;
  const linkSent = await page.waitFor(linkCheck, 15000);
  ev.link_sent = linkSent;
  ev.after_continue_url = await page.url().catch(() => null);
  pushShot(ev, await page.screenshot("link-sent"));
  if (!linkSent) {
    ev.post_continue_text = ((await page.eval(
      "(document.body.innerText || '').slice(0,1200)").catch(() => "")) as string);
    return { ok: false, error: "Entered the email but Stripe gave no sign-in-link confirmation. Nothing was changed." };
  }
  return {
    awaitingOtp: true,
    otpHint: "Stripe emailed you a sign-in link — it will be picked up automatically to continue.",
    resume: { stage: "magic_link" },
  };
}

async function cluelyResume(
  ctx: ExecContext, page: BbPage, magicLink: string,
  ev: Record<string, unknown>, _resume: Record<string, unknown>,
): Promise<BrowserOutcome> {
  void ctx; void _resume;
  if (!/^https:\/\/billing\.stripe\.com\//i.test(magicLink.trim())) {
    return { ok: false, error: "The sign-in link didn't look like a Stripe portal URL — refusing to open it. Nothing was changed." };
  }
  await page.goto(magicLink.trim(), 45000);
  ev.after_link_url = await page.url().catch(() => null);
  // Portal dashboard: wait for subscription info to render.
  const portalReady = await page.waitFor(`(() => {
    const t = (document.body.innerText || "").toLowerCase();
    return /cluely|pro\\+|subscription|plan/i.test(t) &&
      !/loading|please wait/i.test(t.slice(0, 500));
  })()`, 30000);
  ev.portal_ready = portalReady;
  pushShot(ev, await page.screenshot("portal-dashboard"));
  if (!portalReady) {
    return { ok: false, error: "The sign-in link didn't open the billing portal (expired or invalid). Nothing was changed." };
  }
  // Click "cancel subscription/plan" (word-boundary match avoids dismiss buttons).
  const clicked = await page.clickText("cancel (your |the )?(subscription|plan)");
  ev.cancel_clicked = clicked;
  if (!clicked) {
    return { ok: false, error: "Opened the billing portal but found no cancel control — nothing was changed." };
  }
  // Observe: dialog, navigation, or nothing. Poll 20s.
  const preCancelUrl = await page.url().catch(() => null);
  let dialogSeen = false;
  let urlChanged = false;
  const ct0 = Date.now();
  while (Date.now() - ct0 < 20000) {
    const txt = ((await page.eval("document.body.innerText || \"\"").catch(() => "")) as string);
    if (/are you sure|confirm|cancellation|before you go|lose access|keep (your|the) (subscription|plan)/i.test(txt)) {
      dialogSeen = true; break;
    }
    const u = await page.url().catch(() => null);
    if (u && u !== preCancelUrl) { urlChanged = true; break; }
    const modal = await page.eval(
      `!!document.querySelector('[role="dialog"],[role="alertdialog"],[data-state="open"]')`
    ).catch(() => false);
    if (modal) { dialogSeen = true; break; }
    await sleep(1000);
  }
  ev.confirm_dialog = dialogSeen;
  pushShot(ev, await page.screenshot("cancel-dialog"));
  if (!dialogSeen && !urlChanged) {
    return { ok: false, error: "Clicked cancel but the portal didn't respond — nothing was changed." };
  }
  const confirmed = await page.clickDialogButton(
    "confirm|yes,?\\s*cancel|cancel (my |the )?subscription|end (my |the )?(subscription|plan)"
  ) || await page.eval(`(() => {
    const els = [...document.querySelectorAll("button, [role=button], input[type=submit]")];
    const bad = /keep|back|not now|never mind|dismiss|close/i;
    const good = /^(confirm|yes[,.]?\\s*(cancel|do it)|cancel (my |the )?(subscription|plan)|end (my |the )?(subscription|plan))$/i;
    for (const el of els) {
      const t = ((el.innerText || el.value) || "").trim();
      if (!t || el.offsetParent === null) continue;
      if (good.test(t) && !bad.test(t)) {
        el.scrollIntoView({ block: "center" }); el.click();
        return t.slice(0, 80);
      }
    }
    return null;
  })()`).catch(() => null);
  ev.confirm_clicked = confirmed;
  if (!confirmed) {
    return { ok: false, error: "The cancel dialog appeared but the confirm button couldn't be clicked — nothing was changed." };
  }
  await sleep(4000);
  const pageText = ((await page.eval("document.body.innerText || \"\"").catch(() => "")) as string);
  const m = pageText.match(/cancell?ed|cancellation confirmed|subscription (will |has )?(end|cancel)|no longer be billed|access until/i);
  if (m) {
    const i = pageText.indexOf(m[0]);
    ev.confirmation_text = pageText.slice(Math.max(0, i - 120), i + 200);
  }
  pushShot(ev, await page.screenshot("confirmation"));
  if (!m) {
    return { ok: false, error: "Clicked cancel but no confirmation text appeared — check the Stripe portal before retrying." };
  }
  ev.note = "Cluely subscription cancellation confirmed in the Stripe portal.";
  return { ok: true };
}

// ---- MyClaw.ai (2026-09-29): web login + dashboard cancel ----
// Login at myclaw.ai/login offers Google SSO, Slack SSO, and an email flow.
// Strategy: try the email flow first (likely a magic link/code — no password,
// no 2FA surface); fall back to Google SSO with the vaulted Google login.
// After login, discover the billing/subscription area adaptively.
async function myclawStart(
  ctx: ExecContext, page: BbPage, ev: Record<string, unknown>,
): Promise<BrowserOutcome> {
  ev.login_url = "https://myclaw.ai/login";
  await page.goto(ev.login_url as string, 45000);
  ev.after_goto_url = await page.url().catch(() => null);
  ev.title = await page.title().catch(() => null);
  // Let the React app render.
  await sleep(5000);
  pushShot(ev, await page.screenshot("login"));
  ev.login_text_sample = ((await page.eval(
    "(document.body.innerText || '').slice(0,800)").catch(() => "")) as string);

  // Attempt 1: email flow (magic link/code).
  const emailSel = await page.typeInto(EMAIL_SELECTORS, ctx.username);
  ev.email_field = emailSel;
  if (emailSel) {
    const contSel = await page.clickFirst(['button[type="submit"]', 'input[type="submit"]']);
    const contText = contSel ? contSel : await page.clickText("^(continue|sign in|log in)$");
    ev.email_continue_clicked = contSel || contText;
    if (ev.email_continue_clicked) {
      const magicCheck = `(() => {
        const t = (document.body.innerText || "").toLowerCase();
        return /check your email|enter (the )?code|verification code|one-time|we sent you|magic link/i.test(t) ||
          !!document.querySelector('input[autocomplete="one-time-code"], input[name*="code" i], input[name*="otp" i]');
      })()`;
      const magicSeen = await page.waitFor(magicCheck, 15000);
      ev.email_magic_prompt = magicSeen;
      ev.after_email_continue_url = await page.url().catch(() => null);
      pushShot(ev, await page.screenshot("email-flow"));
      if (magicSeen) {
        return {
          awaitingOtp: true,
          otpHint: "MyClaw emailed you a sign-in link/code — it will be picked up automatically to continue.",
          resume: { stage: "email_magic" },
        };
      }
      // Email flow didn't yield a magic prompt (maybe password?). Fall through to Google SSO.
      ev.email_flow_note = "Email flow gave no magic-link/code prompt; trying Google SSO.";
    }
  }

  // Attempt 2: Google SSO (confirmed login method).
  const googleClicked = await page.clickText("continue with google");
  ev.google_clicked = googleClicked;
  if (!googleClicked) {
    return { ok: false, error: "MyClaw login showed neither a working email flow nor a Google button. Nothing was changed." };
  }
  // Google's identifier page.
  const gEmailSel = await page.waitFor(`(() => !!document.querySelector('input[type="email"]'))()`, 15000)
    .then((ok) => ok ? page.typeInto(['input[type="email"]'], ctx.username) : null);
  ev.google_email_field = gEmailSel;
  if (!gEmailSel) {
    return { ok: false, error: "Google sign-in showed no email field. Nothing was changed." };
  }
  const gNext1 = await page.clickText("^(next)$");
  ev.google_next1 = gNext1;
  await sleep(2500);
  // Google's password page.
  const gPassSel = await page.waitFor(`(() => !!document.querySelector('input[type="password"]'))()`, 15000)
    .then((ok) => ok ? page.typeInto(['input[type="password"]'], ctx.password || "") : null);
  ev.google_password_field = gPassSel;
  if (!gPassSel) {
    // Might be a "Verify it's you" / 2FA challenge instead of a password field.
    const pageText = ((await page.eval("(document.body.innerText || '').slice(0,1500)").catch(() => "")) as string);
    ev.google_challenge_text = pageText.slice(0, 500);
    if (/verify (it's|its) you|2-step|two-step|try another way|confirm.*identity/i.test(pageText)) {
      return { ok: false, error: "Google asked for extra verification (2FA/\"Verify it's you\") which the agent cannot complete. Nothing was changed — you'll need to approve it on your phone, then I can retry." };
    }
    return { ok: false, error: "Google sign-in showed no password field. Nothing was changed." };
  }
  if (!ctx.password) {
    return { ok: false, error: "Google sign-in needs the Google password, which isn't saved. Nothing was changed." };
  }
  const gNext2 = await page.clickText("^(next)$");
  ev.google_next2 = gNext2;
  await sleep(4000);
  // Check for post-password challenges.
  const postText = ((await page.eval("(document.body.innerText || '').slice(0,1500)").catch(() => "")) as string);
  if (/verify (it's|its) you|2-step|two-step|try another way|confirm.*identity|phone.*verif/i.test(postText)) {
    ev.google_challenge_text = postText.slice(0, 500);
    pushShot(ev, await page.screenshot("google-challenge"));
    return { ok: false, error: "Google asked for extra verification after the password (2FA/\"Verify it's you\") which the agent cannot complete. Nothing was changed." };
  }
  // Wait to land back in MyClaw (logged in).
  const loggedIn = await page.waitFor(`(() => {
    const u = location.href;
    return u.includes("myclaw.ai") && !u.includes("/login") && !u.includes("accounts.google.com");
  })()`, 45000);
  ev.logged_in = loggedIn;
  ev.post_login_url = await page.url().catch(() => null);
  pushShot(ev, await page.screenshot("logged-in"));
  if (!loggedIn) {
    return { ok: false, error: "Google sign-in didn't complete (wrong password or challenge). Nothing was changed." };
  }
  // Logged in via Google SSO — proceed to find billing/cancel in the same phase.
  return await myclawFindAndCancel(page, ev);
}

// Shared: after MyClaw login (email-magic or Google), discover billing and cancel.
async function myclawFindAndCancel(
  page: BbPage, ev: Record<string, unknown>,
): Promise<BrowserOutcome> {
  await sleep(3000);
  let billingUrl: string | null = null;
  const foundLink = await page.eval(`(() => {
    const els = [...document.querySelectorAll("a[href]")];
    const m = els.find((a) =>
      /billing|subscription/i.test(a.getAttribute("href") || "") ||
      /billing|subscription|plan/i.test(a.innerText || ""));
    return m ? m.getAttribute("href") : null;
  })()`).catch(() => null);
  if (foundLink) {
    try {
      billingUrl = foundLink.startsWith("http")
        ? foundLink
        : new URL(foundLink, await page.url()).toString();
      await page.goto(billingUrl, 25000);
    } catch { billingUrl = null; }
  }
  if (!billingUrl) {
    for (const p of ["/settings/billing", "/settings/subscription", "/billing",
                     "/account/billing", "/settings", "/account", "/dashboard/settings"]) {
      const u = "https://myclaw.ai" + p;
      await page.goto(u, 25000);
      await sleep(2500);
      const t = ((await page.eval("document.body.innerText || \"\"").catch(() => "")) as string);
      if (/cancel (your |the )?(subscription|plan)|billing/i.test(t)) { billingUrl = u; break; }
      ev["billing_try_" + p.replace(/\//g, "_")] = t.slice(0, 300);
    }
  }
  ev.billing_url = billingUrl;
  pushShot(ev, await page.screenshot("billing"));
  if (!billingUrl) {
    return { ok: false, error: "Signed in to MyClaw, but couldn't find the billing page — nothing was changed." };
  }
  const clicked = await page.clickText("cancel (your |the )?(subscription|plan)");
  ev.cancel_clicked = clicked;
  if (!clicked) {
    return { ok: false, error: "Found MyClaw billing but no cancel-subscription control — nothing was changed." };
  }
  const preCancelUrl = await page.url().catch(() => null);
  let dialogSeen = false;
  let urlChanged = false;
  const ct0 = Date.now();
  while (Date.now() - ct0 < 20000) {
    const txt = ((await page.eval("document.body.innerText || \"\"").catch(() => "")) as string);
    if (/are you sure|confirm|cancellation|before you go|lose access|keep (your|the) (subscription|plan)/i.test(txt)) {
      dialogSeen = true; break;
    }
    const u = await page.url().catch(() => null);
    if (u && u !== preCancelUrl) { urlChanged = true; break; }
    const modal = await page.eval(
      `!!document.querySelector('[role="dialog"],[role="alertdialog"],[data-state="open"]')`
    ).catch(() => false);
    if (modal) { dialogSeen = true; break; }
    await sleep(1000);
  }
  ev.confirm_dialog = dialogSeen;
  pushShot(ev, await page.screenshot("cancel-dialog"));
  if (!dialogSeen && !urlChanged) {
    return { ok: false, error: "Clicked cancel but the page didn't respond — nothing was changed." };
  }
  const confirmed = await page.clickDialogButton(
    "confirm|yes,?\\s*cancel|cancel (my |the )?subscription|end (my |the )?(subscription|plan)"
  ) || await page.eval(`(() => {
    const els = [...document.querySelectorAll("button, [role=button], input[type=submit]")];
    const bad = /keep|back|not now|never mind|dismiss|close/i;
    const good = /^(confirm|yes[,.]?\\s*(cancel|do it)|cancel (my |the )?(subscription|plan)|end (my |the )?(subscription|plan))$/i;
    for (const el of els) {
      const t = ((el.innerText || el.value) || "").trim();
      if (!t || el.offsetParent === null) continue;
      if (good.test(t) && !bad.test(t)) {
        el.scrollIntoView({ block: "center" }); el.click();
        return t.slice(0, 80);
      }
    }
    return null;
  })()`).catch(() => null);
  ev.confirm_clicked = confirmed;
  if (!confirmed) {
    return { ok: false, error: "The cancel dialog appeared but the confirm button couldn't be clicked — nothing was changed." };
  }
  await sleep(4000);
  const pageText = ((await page.eval("document.body.innerText || \"\"").catch(() => "")) as string);
  const m = pageText.match(/cancell?ed|cancellation confirmed|subscription (will |has )?(end|cancel)|no longer be billed|access until/i);
  if (m) {
    const i = pageText.indexOf(m[0]);
    ev.confirmation_text = pageText.slice(Math.max(0, i - 120), i + 200);
  }
  pushShot(ev, await page.screenshot("confirmation"));
  if (!m) {
    return { ok: false, error: "Clicked cancel but no confirmation text appeared — check the MyClaw dashboard before retrying." };
  }
  ev.note = "MyClaw.ai subscription cancellation confirmed in the browser.";
  return { ok: true };
}

async function myclawResume(
  ctx: ExecContext, page: BbPage, magic: string,
  ev: Record<string, unknown>, resume: Record<string, unknown>,
): Promise<BrowserOutcome> {
  void ctx;
  const stage = (resume as { stage?: string })?.stage;
  if (stage === "email_magic" && /^https:\/\//i.test(magic.trim())) {
    // Magic link: open it to complete login.
    await page.goto(magic.trim(), 45000);
    const loggedIn = await page.waitFor(`(() => {
      const u = location.href;
      return u.includes("myclaw.ai") && !u.includes("/login");
    })()`, 45000);
    ev.magic_link_logged_in = loggedIn;
    ev.post_login_url = await page.url().catch(() => null);
    pushShot(ev, await page.screenshot("magic-logged-in"));
    if (!loggedIn) {
      return { ok: false, error: "The MyClaw sign-in link didn't complete login (expired or invalid). Nothing was changed." };
    }
    return await myclawFindAndCancel(page, ev);
  }
  // Otherwise treat as a one-time code typed into the page.
  const how = await page.fillOtp(magic);
  ev.otp_entry = how || null;
  if (!how) {
    return { ok: false, error: "The code field disappeared — the session may have expired. Nothing was changed." };
  }
  await sleep(2000);
  const loggedIn = await page.waitFor(`(() => {
    const u = location.href;
    return u.includes("myclaw.ai") && !u.includes("/login");
  })()`, 45000);
  ev.logged_in = loggedIn;
  if (!loggedIn) {
    return { ok: false, error: "The code was rejected or expired — nothing was changed." };
  }
  return await myclawFindAndCancel(page, ev);
}

const browserPlaybooks: Record<string, BrowserPlaybookDef> = {
  "devin": { start: devinStart, resume: devinResume },
  "cluely": { start: cluelyStart, resume: cluelyResume },
  "myclaw": { start: myclawStart, resume: myclawResume },
};

// ================= merchant catalog wiring =================
// Hard gates (legal/product requirements):
//   - unknown merchant or no playbook -> audited guided fallback
//   - playbook.verified !== true -> executor REFUSES with
//     { path: "guided", reason: "unverified_playbook" }; vaulted credentials
//     and Browserbase are never touched for unverified playbooks.
//   - missing Browserbase env -> audited needs_setup + fallback, never fake
//     execution.
//   - every attempt, including guided refusals, is audited in exec_runs.

function bbEnvReady(): boolean {
  return !!(Deno.env.get("BROWSERBASE_API_KEY") && Deno.env.get("BROWSERBASE_PROJECT_ID"));
}

// Audited guided refusal: writes an exec_runs row (status failed, structured
// evidence) and reverts a claimed approval to approved so the user can retry
// later. Returns the response body.
async function recordGuidedRun(opts: {
  admin: ReturnType<typeof createClient>;
  approval: Record<string, unknown> | null;
  userId: string;
  reason: string;
  note?: string;
  directory_entry: unknown;
}): Promise<{ ok: false; path: "guided"; reason: string; directory_entry: unknown }> {
  const { admin, approval, userId, reason, note, directory_entry } = opts;
  const evidence: Record<string, unknown> = { path: "guided", reason, directory_entry };
  if (note) evidence.note = note;
  if (approval) {
    await admin.from("exec_runs").insert({
      approval_id: approval.id, user_id: userId, status: "failed",
      evidence, error: note || reason,
      finished_at: new Date().toISOString(),
    });
    // Guided refusals are not terminal: revert the claim so a later retry
    // (after setup / verification / manual cancellation) can proceed.
    await admin.from("exec_approvals").update({ status: "approved" })
      .eq("id", approval.id).eq("status", "executing");
  }
  return { ok: false, path: "guided", reason, directory_entry };
}

// runDeclarative lives in ./execution-guards.ts (shared trust module).

// ================= Learning from mistakes (2026-09-28) =================
// The agent's failure memory. fetchExecLessons pulls open lessons for the
// merchant (plus global ones) BEFORE a run; learnFromRunOutcome records the
// terminal outcome AFTER it. Guided refusals (no playbook, unverified,
// excluded category, learned skips) are by-design — they are audited in
// exec_runs but never become lessons.

/** Open (unresolved) lessons for this merchant + global ones, most-seen first. */
async function fetchExecLessons(
  admin: any, merchantKey: string,
): Promise<ExecLessonRow[]> {
  try {
    const { data } = await admin.from("agent_lessons")
      .select("id, category, title, times_seen, what_to_do_instead")
      .eq("resolved", false)
      .is("user_id", null)
      .in("scope", ["global", `merchant:${merchantKey}`])
      .order("times_seen", { ascending: false })
      .limit(5);
    return (data ?? []) as ExecLessonRow[];
  } catch {
    return []; // lesson fetch must never block execution
  }
}

/**
 * Record the terminal outcome of a real run. Failures are categorized
 * (deterministic, via the shared categorizeExecFailure) and deduped per
 * (scope, category): a repeat sighting bumps times_seen instead of adding a
 * row, and 3+ sightings of a site-change failure flag the playbook for
 * re-verification. A success resolves the merchant's open lessons and counts
 * as an application of any lesson that was injected into the run.
 */
async function learnFromRunOutcome(opts: {
  admin: any;
  merchantKey: string;
  merchantLabel: string;
  finalStatus: "done" | "failed";
  error: string | null;
  ev: Record<string, unknown>;
  runId: string;
  appliedLessonIds: string[];
}): Promise<void> {
  const { admin, merchantKey, merchantLabel, finalStatus, error, runId, appliedLessonIds } = opts;
  const scope = `merchant:${merchantKey}`;
  try {
    if (finalStatus === "failed") {
      const ev = (opts.ev ?? {}) as Record<string, unknown>;
      const analysis = categorizeExecFailure(error ?? "", ev);
      const { data: existing } = await admin.from("agent_lessons")
        .select("id, times_seen").eq("resolved", false).is("user_id", null)
        .eq("scope", scope).eq("category", analysis.category)
        .limit(1).maybeSingle();
      if (existing) {
        const seen = (existing.times_seen ?? 1) + 1;
        await admin.from("agent_lessons").update({
          times_seen: seen,
          what_happened: (error ?? "unknown error").slice(0, 500),
          signal: (error ?? "").slice(0, 200),
          needs_reverification: seen >= REPEAT_FAILURE_REVERIFY_THRESHOLD &&
            (analysis.category === "layout_changed" || analysis.category === "no_confirmation"),
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await admin.from("agent_lessons").insert({
          user_id: null,
          kind: "exec_failure",
          scope,
          category: analysis.category,
          title: execLessonTitle(analysis.category, merchantLabel),
          what_happened: (error ?? "unknown error").slice(0, 500),
          what_to_do_instead: analysis.what_to_do_instead,
          signal: (error ?? "").slice(0, 200),
          source_run_id: runId && /^[0-9a-f-]{36}$/i.test(runId) ? runId : null,
        });
      }
    } else {
      // Success: the loop closes. Lessons injected into this run count as
      // applied; open lessons for the merchant are resolved — the current
      // approach demonstrably works again.
      if (appliedLessonIds.length) {
        // Atomic increment of times_applied for the lessons this run used.
        await admin.rpc("agent_lessons_bump_applied", { p_ids: appliedLessonIds });
      }
      const note = `Resolved by successful run ${runId.slice(0, 8)} on ${new Date().toISOString().slice(0, 10)} — the current approach works.`;
      await admin.from("agent_lessons").update({
        resolved: true, resolved_note: note, updated_at: new Date().toISOString(),
      }).eq("resolved", false).is("user_id", null).eq("scope", scope);
    }
  } catch (e) {
    console.error("learnFromRunOutcome failed:", (e as Error)?.message);
  }
}

// Build a browser playbook from a verified catalog entry. Only called for
// verified:true playbooks; unverified entries are refused by the gate.
function declarativeDef(pb: MerchantPlaybook): BrowserPlaybookDef {
  return {
    start: (ctx, page, ev) => runDeclarative(ctx, page, pb, ev, 0, null),
    resume: (ctx, page, otp, ev, resumeState) => {
      const idx = Number((resumeState as Record<string, unknown>).step_index ?? 0);
      return runDeclarative(ctx, page, pb, ev, idx, otp);
    },
  };
}

// checkExcludedCategory lives in ./execution-guards.ts (shared trust module).

// ================= Cancel claims (2026-09-28) =================
// A "done" agent run never means "cancelled" — it means CLAIMED. The claim
// records the expected next billing date; the cancel-watcher confirms the
// bill is clean (or catches a zombie charge) against synced transactions.
async function writeCancelClaim(
  admin: any, approval: Record<string, unknown>,
  userId: string, runId: string, merchantKey: string,
): Promise<void> {
  try {
    const ctx = (approval.approval_context || {}) as Record<string, unknown>;
    let expected: string | null = typeof ctx.next_billing_date === "string" ? ctx.next_billing_date : null;
    if (!expected) {
      // Fall back to interval arithmetic: monthly +30d, annual +365d.
      const interval = String(ctx.billing_interval || approval.billing_interval || "monthly").toLowerCase();
      const days = interval.includes("annual") || interval.includes("year") ? 365 : 30;
      expected = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    }
    const { data: claim } = await admin.from("cancel_claims").insert({
      user_id: userId,
      merchant: String(approval.merchant || ctx.merchant_name || merchantKey),
      merchant_key: merchantKey,
      amount: ctx.amount ?? approval.amount ?? null,
      expected_billing_date: expected,
      grace_days: 2,
      status: "open",
      run_id: runId,
      approval_id: approval.id,
      subscription_id: ctx.subscription_id ?? null,
    }).select("id").single();
    // Mirror the claim onto the subscription row: claimed, never "cancelled".
    const subId = ctx.subscription_id;
    if (subId && claim) {
      await admin.from("save_subscriptions").update({
        status: "cancel_claimed",
        updated_at: new Date().toISOString(),
      }).eq("id", subId).eq("user_id", userId);
    }
  } catch { /* claim write is best-effort; the run itself already succeeded */ }
}

// ================= serve =================
// ---- Gmail auto-OTP (2026-09-28) ----
// Lets the executor fetch a merchant sign-in code from the user's connected
// Gmail itself, so the user never has to retype codes. Hard scoping:
//   - gmail.readonly OAuth scope only;
//   - search restricted to the merchant's catalog otp_senders + last 15 min;
//   - only while a run owned by the user is actively awaiting_otp;
//   - the code travels only into the resume path below — it is never logged,
//     never stored, and never returned to any client.
function gmailVaultName(userId: string): string {
  return `oauth_gmail_${userId}`;
}

async function getGmailAccessToken(admin: any, userId: string): Promise<string> {
  const { data: conn } = await admin.from("user_oauth_connections")
    .select("vault_name").eq("user_id", userId).eq("provider", "gmail").maybeSingle();
  const expected = gmailVaultName(userId);
  if (!conn || conn.vault_name !== expected) {
    throw Object.assign(new Error("Gmail is not connected"), { code: "not_connected" });
  }
  const { data: raw, error } = await admin.rpc("oauth_vault_read", { p_name: expected });
  if (error || !raw) throw new Error("Could not read Gmail credentials");
  let tok: any;
  try { tok = JSON.parse(String(raw)); } catch { throw new Error("Could not read Gmail credentials"); }
  if (tok.access_token && Date.now() < Number(tok.expires_at || 0) - 60000) {
    return String(tok.access_token);
  }
  if (!tok.refresh_token) throw new Error("Gmail session expired — reconnect Gmail in the app");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "",
      refresh_token: String(tok.refresh_token),
      grant_type: "refresh_token",
    }),
  });
  const nt = await r.json().catch(() => ({}));
  if (!r.ok || !nt.access_token) throw new Error("Gmail session expired — reconnect Gmail in the app");
  const updated = {
    ...tok,
    access_token: nt.access_token,
    refresh_token: nt.refresh_token || tok.refresh_token,
    expires_at: Date.now() + (Number(nt.expires_in) || 3600) * 1000,
  };
  await admin.rpc("oauth_vault_store", { p_name: expected, p_secret: JSON.stringify(updated) });
  return String(nt.access_token);
}

function b64ToText(b64: string): string {
  try {
    const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch { return ""; }
}

function gmailMessageText(full: any): string {
  let out = String(full?.snippet || "") + "\n";
  const headers: any[] = full?.payload?.headers || [];
  for (const h of headers) {
    if (/^subject$/i.test(String(h?.name || ""))) out += String(h.value || "") + "\n";
  }
  const walk = (p: any): void => {
    if (!p) return;
    const mt = String(p.mimeType || "");
    if ((mt === "text/plain" || mt === "text/html") && p.body?.data) {
      let t = b64ToText(String(p.body.data));
      if (mt === "text/html") t = t.replace(/<[^>]+>/g, " ");
      out += t + "\n";
    }
    for (const q of p.parts || []) walk(q);
  };
  walk(full?.payload);
  return out;
}

// First 6-digit group wins (all current OTP merchants use 6 digits);
// fall back to any 4-8 digit group.
function extractOtpCode(text: string): string | null {
  const m = text.match(/\b(\d{6})\b/) || text.match(/\b(\d{4,8})\b/);
  return m ? m[1] : null;
}

// Magic-link extraction (2026-09-29): for merchants whose sign-in email
// carries a one-time URL instead of a code (Cluely's Stripe portal). Finds
// the first https URL on an allowlisted host. The link travels only into
// the run's browser via the resume path — never into evidence/logs.
function extractMagicLink(text: string, hosts: string[]): string | null {
  const urls = text.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  for (const u of urls) {
    try {
      const host = new URL(u).hostname.toLowerCase();
      if (hosts.some((h) => host === h || host.endsWith("." + h))) return u;
    } catch { /* not a URL */ }
  }
  return null;
}

async function searchGmailForOtp(accessToken: string, sender: string): Promise<string | null> {
  const q = `from:${sender} newer_than:15m`;
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=5`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const list = await listRes.json().catch(() => ({}));
  if (!listRes.ok) return null;
  for (const m of list.messages || []) {
    if (!m?.id) continue;
    const fullRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const full = await fullRes.json().catch(() => ({}));
    if (!fullRes.ok) continue;
    const code = extractOtpCode(gmailMessageText(full));
    if (code) return code;
  }
  return null;
}

async function searchGmailForMagicLink(
  accessToken: string, sender: string, hosts: string[],
): Promise<string | null> {
  const q = `from:${sender} newer_than:15m`;
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=5`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const list = await listRes.json().catch(() => ({}));
  if (!listRes.ok) return null;
  for (const m of list.messages || []) {
    if (!m?.id) continue;
    const fullRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const full = await fullRes.json().catch(() => ({}));
    if (!fullRes.ok) continue;
    const link = extractMagicLink(gmailMessageText(full), hosts);
    if (link) return link;
  }
  return null;
}

// Shared OTP resume path (2026-09-28): manual submit_otp AND auto
// fetch_otp both funnel through here. The code travels only into the
// page below — never into evidence/logs, and never back to a client.
async function resumeRunWithOtp(
  admin: any, user: { id: string }, run: any, otpCode: string,
): Promise<{ body: any; status: number }> {
  const R = (body: unknown, status = 200) => ({ body, status });
      // OTP acceptance decision (2026-09-28): the shared decideOtpSubmit —
      // the SAME function the fixtures exercise. Expired pauses are dead:
      // the session is killed and the run is failed. Never accept a code for
      // an expired pause, and never for a run that isn't awaiting one.
      const otpDecision = decideOtpSubmit(
        { status: run.status as string, otp_expires_at: run.otp_expires_at as string | null },
        Date.now(),
      );
      if (!otpDecision.proceed && otpDecision.code === "expired") {
        if (run.browserbase_session_id) {
          try { await bbStopSession(run.browserbase_session_id as string); } catch { /* best effort */ }
        }
        await admin.from("exec_runs").update({
          status: "failed",
          error: "The verification window expired (30 minutes). Nothing was changed — start again if you still want this cancelled.",
          finished_at: new Date().toISOString(),
        }).eq("id", run.id);
        // Learning: an expired OTP pause is a categorized, learnable failure.
        {
          const evm = (run.evidence as Record<string, unknown>) ?? {};
          const mkey = String(evm.merchant ?? "");
          if (mkey) {
            await learnFromRunOutcome({
              admin, merchantKey: mkey, merchantLabel: mkey,
              finalStatus: "failed",
              error: "The verification window expired (30 minutes). Nothing was changed — start again if you still want this cancelled.",
              ev: evm, runId: run.id,
              appliedLessonIds: (evm.lessons_applied_ids as string[]) ?? [],
            });
          }
        }
        return R({ error: otpDecision.error }, 410);
      }
      if (!otpDecision.proceed) {
        return R({ error: otpDecision.error }, 409);
      }
      if (!run.browserbase_session_id) {
        return R({ error: "Run has no browser session" }, 409);
      }
      // Atomic lock: only one resume proceeds.
      const { data: locked } = await admin.from("exec_runs")
        .update({ status: "started" })
        .eq("id", run.id).eq("status", "awaiting_otp")
        .select("id");
      if (!locked || !locked.length) {
        return R({ error: "This code is already being processed" }, 409);
      }

      const { data: approval } = await admin.from("exec_approvals")
        .select("*").eq("id", run.approval_id).maybeSingle();
      // Revalidate the approval on resume: ownership, action, and that the
      // run's merchant still resolves to a VERIFIED playbook. OTP codes are
      // never stored — otp_code travels only into the page below.
      if (!approval || approval.user_id !== user.id ||
          approval.action !== "cancel_subscription" ||
          !["approved", "executing"].includes(approval.status as string)) {
        await admin.from("exec_runs").update({
          status: "failed", error: "Approval is not valid for resume",
          finished_at: new Date().toISOString(),
        }).eq("id", run.id);
        return R({ error: "Approval is not valid for resume" }, 409);
      }
      const resumeKey = normalizeMerchant(String(approval.merchant_key || ""));
      const resumePb = playbookRegistry[resumeKey];
      // Verification runs (verify_merchant_live one-shot) are allowed through:
      // they are the supervised path that GRADUATES a playbook. The run's
      // evidence carries verification_run:true from the start phase.
      const isVerificationRun = (run.evidence as Record<string, unknown>)?.verification_run === true;
      if (!resumePb || (resumePb.verified !== true && !isVerificationRun)) {
        const directory_entry = merchantDirectory[resumeKey] ?? GENERIC_FALLBACK;
        await admin.from("exec_runs").update({
          status: "failed",
          evidence: { path: "guided", reason: "unverified_playbook", directory_entry },
          error: "unverified_playbook",
          finished_at: new Date().toISOString(),
        }).eq("id", run.id);
        return R({ ok: false, path: "guided", reason: "unverified_playbook", directory_entry }, 409);
      }
      const def = browserPlaybooks[resumeKey] ?? declarativeDef(resumePb);

      const ev: Record<string, unknown> = {
        ...((run.evidence as Record<string, unknown>) || {}),
        resumed_at: new Date().toISOString(),
      };
      const resumeState = (ev.resume as Record<string, unknown>) || {};
      let sessionAlive = false;
      try {
        const { connectUrl } = await bbRefreshSession(run.browserbase_session_id as string);
        sessionAlive = true;
        const cdp = await Cdp.connect(connectUrl);
        let outcome: BrowserOutcome;
        try {
          const page = await BbPage.open(cdp);
          // The OTP travels only into the page — never into evidence/logs.
          outcome = await def.resume(
            { username: "", password: "", approval, admin },
            page, otpCode.trim(), ev, resumeState);
        } finally {
          cdp.close();
        }
        await bbStopSession(run.browserbase_session_id as string);
        const finalStatus = outcome.ok ? "done" : "failed";
        const err = outcome.ok ? null : (outcome as { error: string }).error;
        await admin.from("exec_runs").update({
          status: finalStatus, evidence: ev, error: err,
          finished_at: new Date().toISOString(),
        }).eq("id", run.id);
        await admin.from("exec_approvals").update({
          status: finalStatus, decided_at: new Date().toISOString(),
        }).eq("id", run.approval_id);
        // Learning: record the resumed run's terminal outcome.
        await learnFromRunOutcome({
          admin, merchantKey: resumeKey,
          merchantLabel: String(approval.merchant ?? resumeKey),
          finalStatus, error: err, ev, runId: run.id,
          appliedLessonIds: (ev.lessons_applied_ids as string[]) ?? [],
        });
        if (finalStatus === "done") {
          await writeCancelClaim(admin, approval, user.id, run.id, resumeKey);
        }
        return R({ ok: outcome.ok, status: finalStatus, error: err });
      } catch (e) {
        if (sessionAlive) await bbStopSession(run.browserbase_session_id as string);
        const msg = String(e?.message || e);
        await admin.from("exec_runs").update({
          status: "failed", evidence: ev,
          error: "Resume failed: " + msg,
          finished_at: new Date().toISOString(),
        }).eq("id", run.id);
        await admin.from("exec_approvals").update({
          status: "failed", decided_at: new Date().toISOString(),
        }).eq("id", run.approval_id);
        await learnFromRunOutcome({
          admin, merchantKey: resumeKey,
          merchantLabel: String(approval.merchant ?? resumeKey),
          finalStatus: "failed", error: "Resume failed: " + msg,
          ev, runId: run.id,
          appliedLessonIds: (ev.lessons_applied_ids as string[]) ?? [],
        });
        return R({ ok: false, status: "failed", error: "Resume failed: " + msg }, 500);
      }
}

serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Sign in required" }, 401);
    const admin = createClient(supabaseUrl, serviceKey);
    // TEMPORARY founder bypass (2026-09-29): service-role invocation for the
    // supervised Cluely/MyClaw graduation runs. The body is parsed early;
    // only verify_merchant_live with founder_bypass=true is allowed through.
    // REMOVE AFTER GRADUATION.
    let founderBypass = false;
    let user: { id: string } | null = null;
    try {
      const b64 = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(b64)) as { role?: string };
      if (payload.role === "service_role") {
        const earlyBody = await req.json().catch(() => ({})) as Record<string, unknown>;
        if (earlyBody.action === "verify_merchant_live" && earlyBody.founder_bypass === true) {
          founderBypass = true;
          (req as unknown as { _parsedBody: unknown })._parsedBody = earlyBody;
        }
      }
    } catch { /* not a decodable JWT; fall through to normal auth */ }
    if (!founderBypass) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: { user: u }, error: authErr } = await userClient.auth.getUser(jwt);
      if (authErr || !u) return json({ error: "Invalid session" }, 401);
      user = u as { id: string };
    }

    // ---- OTP sweeper (2026-09-28): lazily expire stale awaiting_otp runs.
    // Runs on every invocation so no external scheduler is required: any
    // pause older than its 30-minute TTL is marked failed and its dangling
    // Browserbase session is killed. KeepAlive sessions bill per minute and
    // are a dangling-access risk — they must not outlive the TTL.
    try {
      // The expiry DECISION is otpIsExpired (shared trust module) — the same
      // function the fixtures exercise. otp_expires_at is set with OTP_TTL_MS.
      const now = Date.now();
      const { data: awaiting } = await admin.from("exec_runs")
        .select("id, browserbase_session_id, otp_expires_at")
        .eq("user_id", user.id)
        .eq("status", "awaiting_otp")
        .not("otp_expires_at", "is", null);
      const expired = (awaiting || []).filter((r) =>
        otpIsExpired(r.otp_expires_at as string, now));
      for (const r of expired) {
        if (r.browserbase_session_id) {
          try { await bbStopSession(r.browserbase_session_id as string); } catch { /* best effort */ }
        }
        await admin.from("exec_runs").update({
          status: "failed",
          error: "The verification window expired (30 minutes). Nothing was changed.",
          finished_at: new Date().toISOString(),
        }).eq("id", r.id);
      }
    } catch { /* sweeper is best-effort; never block the request */ }

    const body = ((req as unknown as { _parsedBody?: unknown })._parsedBody ??
      await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action || "execute";

    // ---- health check: real Browserbase session, safe target only ----
    if (action === "browser_selftest") {
      let session: { id: string; connectUrl: string } | null = null;
      try {
        session = await bbCreateSession(false);
        const cdp = await Cdp.connect(session.connectUrl);
        try {
          const page = await BbPage.open(cdp);
          await page.goto("https://example.com", 30000);
          const title = await page.title();
          return json({ ok: true, title, session_id: session.id });
        } finally {
          cdp.close();
        }
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      } finally {
        if (session) await bbStopSession(session.id);
      }
    }

    // ---- kill_run: stop one paused/in-flight run (2026-09-28) ----
    // Kills the run's Browserbase session (no dangling keepAlive) and marks
    // the run failed. Used when the user aborts from the chatbox.
    if (action === "kill_run") {
      const { run_id } = body;
      if (!run_id) return json({ error: "run_id required" }, 400);
      const { data: run } = await admin.from("exec_runs")
        .select("id, user_id, browserbase_session_id, status").eq("id", run_id).maybeSingle();
      if (!run || (run as Record<string, unknown>).user_id !== user.id) {
        return json({ error: "Run not found" }, 404);
      }
      const st = (run as Record<string, unknown>).status as string;
      if (!["started", "awaiting_otp"].includes(st)) {
        return json({ ok: true, already: st });
      }
      const sid = (run as Record<string, unknown>).browserbase_session_id as string | null;
      if (sid) { try { await bbStopSession(sid); } catch { /* best effort */ } }
      await admin.from("exec_runs").update({
        status: "failed", error: "Stopped by user — nothing was changed.",
        finished_at: new Date().toISOString(),
      }).eq("id", (run as Record<string, unknown>).id);
      return json({ ok: true, stopped: true });
    }

    // ---- describe_merchant: chatbox pre-check (2026-09-28) ----
    // Lets the chatbox decide between the exec path and the guided fallback
    // without touching credentials or the browser. Returns the playbook's
    // verified status and whether the caller has a vaulted login.
    if (action === "describe_merchant") {
      const raw = String(body.merchant || "").slice(0, 80);
      const key = normalizeMerchant(raw);
      const pb = playbookRegistry[key];
      const dir = merchantDirectory[key] ?? GENERIC_FALLBACK;
      const { data: credRef } = await admin.from("exec_credential_refs")
        .select("merchant_key").eq("user_id", user.id).eq("merchant_key", key).maybeSingle();
      return json({
        ok: true,
        merchant_key: key,
        display_name: (pb?.display_name ?? (dir as { display_name?: string }).display_name ?? raw) as string,
        has_playbook: !!pb,
        verified: pb?.verified === true,
        has_credential: !!credRef,
        deep_link: (dir as { deep_link?: string }).deep_link ?? null,
      });
    }

    // ---- one-tap revoke: instant, total kill of all agent access ----
    // Deletes every exec_cred_* vault secret for the user, clears credential
    // refs, kills in-flight Browserbase sessions, marks non-terminal runs
    // revoked, cancels pending/approved approvals. The response proves
    // nothing remains: credential refs and vault secrets must both be zero.
    if (action === "revoke_all") {
      const checklist: Array<{
        merchant_key: string; label: string | null;
        credential: "deleted" | "delete_failed";
      }> = [];
      // 1. Kill in-flight Browserbase sessions for non-terminal runs.
      const { data: liveRuns } = await admin.from("exec_runs")
        .select("id, browserbase_session_id")
        .eq("user_id", user.id)
        .in("status", ["started", "awaiting_otp"]);
      let sessionsKilled = 0;
      for (const r of liveRuns || []) {
        if (r.browserbase_session_id) {
          await bbStopSession(r.browserbase_session_id as string);
          sessionsKilled++;
        }
      }
      const { data: revokedRuns } = await admin.from("exec_runs")
        .update({ status: "revoked", error: "Revoked by user", finished_at: new Date().toISOString() })
        .eq("user_id", user.id).in("status", ["started", "awaiting_otp"])
        .select("id");
      // 2. Cancel approvals that never executed.
      const { data: cancelledApprovals } = await admin.from("exec_approvals")
        .update({ status: "cancelled", decided_at: new Date().toISOString() })
        .eq("user_id", user.id).in("status", ["pending", "approved"])
        .select("id");
      // 3. Delete every vaulted credential, per merchant, then clear refs.
      const { data: refs } = await admin.from("exec_credential_refs")
        .select("merchant_key, vault_name, label").eq("user_id", user.id);
      for (const ref of refs || []) {
        let credential: "deleted" | "delete_failed" = "deleted";
        try {
          const { error } = await admin.rpc("exec_vault_delete", { p_name: ref.vault_name });
          if (error) credential = "delete_failed";
        } catch { credential = "delete_failed"; }
        checklist.push({ merchant_key: ref.merchant_key, label: ref.label ?? null, credential });
      }
      await admin.from("exec_credential_refs").delete().eq("user_id", user.id);
      // 4. Prove nothing remains: zero refs AND zero readable vault secrets.
      const { data: refsAfter } = await admin.from("exec_credential_refs")
        .select("merchant_key").eq("user_id", user.id);
      let vaultRemaining = -1;
      try {
        const names = (refs || []).map((r) => (r as { vault_name: string }).vault_name);
        const reads = await Promise.all(
          names.map((n) => admin.rpc("exec_vault_read", { p_name: n })),
        );
        vaultRemaining = reads.filter((r) => !r.error && r.data).length;
      } catch { /* verification best-effort; refs count is authoritative */ }
      return json({
        ok: true,
        checklist,
        sessions_killed: sessionsKilled,
        runs_revoked: (revokedRuns || []).length,
        approvals_cancelled: (cancelledApprovals || []).length,
        credentials_remaining: (refsAfter || []).length,
        vault_secrets_remaining: vaultRemaining,
      });
    }

    // ---- retry_run (2026-09-28): retry a FAILED attempt under the SAME
    // approval. Retries only happen inside the already-approved attempt —
    // a run that reached "done" can never be retried (execute refuses it),
    // and a new cancellation always needs a new explicit approval.
    if (action === "retry_run") {
      const { run_id } = body;
      if (!run_id) return json({ error: "run_id required" }, 400);
      const { data: run } = await admin.from("exec_runs")
        .select("*, exec_approvals!inner(user_id, status)")
        .eq("id", run_id).maybeSingle();
      if (!run || (run as any).exec_approvals?.user_id !== user.id) {
        return json({ error: "Run not found" }, 404);
      }
      if (run.status === "done") {
        return json({ error: "This attempt already completed — approve again for a new cancellation" }, 409);
      }
      if (!["failed", "revoked"].includes(run.status)) {
        return json({ error: `Run is ${run.status}, not retryable` }, 409);
      }
      if (run.browserbase_session_id) {
        try { await bbStopSession(run.browserbase_session_id as string); } catch { /* best effort */ }
      }
      // Reset the approval to approved so execute's atomic claim can fire
      // exactly once more for this same approval.
      await admin.from("exec_approvals").update({ status: "approved", decided_at: null })
        .eq("id", run.approval_id).eq("user_id", user.id);
      await admin.from("exec_runs").update({
        status: "failed",
        error: "Superseded by retry — a fresh attempt ran under the same approval",
        finished_at: new Date().toISOString(),
      }).eq("id", run.id);
      // Fall through to execute with the same approval_id.
      body.approval_id = run.approval_id;
    }

    // ---- report_playbook_mismatch (2026-09-28): a user reports that the
    // playbook didn't match the merchant's site. 3 mismatch reports in 30
    // days auto-demote the playbook (see the executor gate).
    if (action === "report_playbook_mismatch") {
      const { run_id, merchant_key, note } = body;
      if (!run_id && !merchant_key) {
        return json({ error: "run_id or merchant_key required" }, 400);
      }
      let mkey = merchant_key ? String(merchant_key) : null;
      if (run_id && !mkey) {
        const { data: r } = await admin.from("exec_runs")
          .select("approval_id, exec_approvals!inner(merchant_key, user_id)")
          .eq("id", run_id).maybeSingle();
        if (!r || (r as any).exec_approvals?.user_id !== user.id) {
          return json({ error: "Run not found" }, 404);
        }
        mkey = String((r as any).exec_approvals.merchant_key || "");
      }
      if (!mkey) return json({ error: "merchant_key required" }, 400);
      const { data: report, error: repErr } = await admin.from("playbook_reports")
        .insert({
          user_id: user.id, merchant_key: mkey,
          run_id: run_id || null, kind: "mismatch",
          note: note ? String(note).slice(0, 1000) : null,
        }).select("id").single();
      if (repErr) return json({ error: "Could not record report" }, 500);
      // Learning: a mismatch report is the user teaching the agent the
      // playbook no longer matches the site — record it as a layout_changed
      // lesson immediately (it also feeds the 3-report auto-demotion).
      await learnFromRunOutcome({
        admin, merchantKey: mkey, merchantLabel: mkey,
        finalStatus: "failed",
        error: "User reported the playbook didn't match the merchant's site" +
          (note ? `: ${String(note).slice(0, 300)}` : ""),
        ev: { source: "user_mismatch_report" },
        runId: String(run_id ?? ""),
        appliedLessonIds: [],
      });
      return json({ ok: true, report_id: report.id });
    }

    // ---- OTP resume: reconnect to the SAME session and continue ----
    if (action === "submit_otp") {
      const { run_id, otp_code } = body;
      if (!run_id || typeof otp_code !== "string" || !otp_code.trim()) {
        return json({ error: "run_id and otp_code required" }, 400);
      }
      const { data: run } = await admin.from("exec_runs")
        .select("*").eq("id", run_id).maybeSingle();
      if (!run || run.user_id !== user.id) {
        return json({ error: "Run not found" }, 404);
      }
      const res = await resumeRunWithOtp(admin, user, run, otp_code);
      return json(res.body, res.status);
    }

    // Auto-OTP (2026-09-28): fetch the merchant's sign-in code from the
    // user's connected Gmail and resume the run with it — no user retyping.
    // Returns {ok:false, auto_otp:<reason>} for every non-success path so the
    // caller (chatbox/app) can fall back to asking the user. The code itself
    // is NEVER included in any response, log, or evidence row.
    if (action === "fetch_otp") {
      const { run_id } = body;
      if (!run_id) return json({ error: "run_id required" }, 400);
      const { data: run } = await admin.from("exec_runs")
        .select("*").eq("id", run_id).maybeSingle();
      if (!run || run.user_id !== user.id) {
        return json({ error: "Run not found" }, 404);
      }
      const evm = (run.evidence as Record<string, unknown>) ?? {};
      const mkey = normalizeMerchant(String(evm.merchant_key ?? evm.merchant ?? ""));
      const pb = playbookRegistry[mkey];
      const senders = pb?.otp_senders;
      if (!senders || !senders.length) {
        return json({ ok: false, auto_otp: "unsupported", status: run.status });
      }
      // otp_kind "magic_link": the email carries a one-time sign-in URL
      // (Cluely's Stripe portal). "code_or_link": accept whichever arrives.
      const otpKind = pb?.otp_kind ?? "code";
      const linkHosts = mkey === "cluely"
        ? ["billing.stripe.com"]
        : mkey === "myclaw" ? ["myclaw.ai", "accounts.google.com"] : [];
      let accessToken: string;
      try {
        accessToken = await getGmailAccessToken(admin, user.id);
      } catch (e: any) {
        const reason = (e as any)?.code === "not_connected" ? "not_connected" : "gmail_error";
        return json({ ok: false, auto_otp: reason, status: run.status, error: String(e?.message || e) });
      }
      // Poll for the sign-in email: it usually lands 20-60s after the login
      // form is submitted. Bail early if the run stops waiting.
      let secret: string | null = null;
      for (let i = 0; i < 6 && !secret; i++) {
        if (i > 0) await sleep(15000);
        const { data: cur } = await admin.from("exec_runs")
          .select("status").eq("id", run.id).maybeSingle();
        if (!cur || cur.status !== "awaiting_otp") {
          return json({ ok: false, auto_otp: "run_changed", status: cur?.status ?? "unknown" });
        }
        for (const s of senders) {
          try {
            if (otpKind === "magic_link") {
              secret = await searchGmailForMagicLink(accessToken, s, linkHosts);
            } else if (otpKind === "code_or_link") {
              secret = await searchGmailForOtp(accessToken, s) ||
                await searchGmailForMagicLink(accessToken, s, linkHosts);
            } else {
              secret = await searchGmailForOtp(accessToken, s);
            }
          } catch { secret = null; }
          if (secret) break;
        }
      }
      if (!secret) {
        return json({ ok: false, auto_otp: "not_found", status: "awaiting_otp" });
      }
      const rres = await resumeRunWithOtp(admin, user, run, secret);
      return json({ ...rres.body, auto_otp: "fetched" }, rres.status);
    }

    if (action === "gmail_status") {
      const { data } = await admin.from("user_oauth_connections")
        .select("email").eq("user_id", user.id).eq("provider", "gmail").maybeSingle();
      return json({ connected: !!data, email: data?.email ?? null });
    }

    // ---- verify_merchant_live: ONE-SHOT supervised graduation run (2026-09-29)
    // The normal execute path refuses unverified playbooks, so this supervised
    // action runs the merchant's DEDICATED implementation (browserPlaybooks)
    // against production with the caller's vaulted login. Two phases:
    //   { action:"verify_merchant_live", phase:"start", merchant_key, approval_id }
    //     -> { status:"awaiting_otp", run_id, otp_hint }
    //   { action:"verify_merchant_live", phase:"resume", run_id, otp_code }
    //     -> { ok, status:"done"|"failed", evidence }
    // Requires a real exec_approvals row (cancel_subscription, approved,
    // caller-owned, matching merchant) — this run performs the REAL
    // cancellation the user approved. REMOVE AFTER GRADUATION.
    if (action === "verify_merchant_live") {
      const phase = body.phase || "start";
      const merchantKey = normalizeMerchant(String(body.merchant_key || ""));
      const def = browserPlaybooks[merchantKey];
      const pb = playbookRegistry[merchantKey];
      if (!def || !pb) return json({ error: "No browser implementation for this merchant" }, 500);
      if (!bbEnvReady()) return json({ error: "Browserbase not configured" }, 503);
      // TEMPORARY founder bypass (2026-09-29): service-role invocation with
      // explicit user_id for the supervised Cluely/MyClaw graduation runs.
      // REMOVE AFTER GRADUATION.
      let runUser = user;
      if (!runUser && founderBypass && body.user_id) {
        const { data: bu } = await admin.auth.admin.getUserById(String(body.user_id));
        if (bu?.user) runUser = bu.user as typeof user;
      }
      if (!runUser) return json({ error: "Sign in required" }, 401);
      // Load vaulted credential (email required; password optional — Cluely's
      // Stripe portal needs only the email).
      const { data: credRef } = await admin.from("exec_credential_refs")
        .select("*").eq("user_id", runUser.id).eq("merchant_key", merchantKey).maybeSingle();
      if (!credRef) return json({ error: `No saved login for ${pb.display_name}` }, 409);
      const { data: vsecret, error: verr } = await admin.rpc("exec_vault_read", {
        p_name: (credRef as { vault_name: string }).vault_name,
      });
      if (verr || !vsecret) return json({ error: "Could not read saved login" }, 500);
      let vcred: { username?: string; password?: string } = {};
      try { vcred = JSON.parse(vsecret || "{}"); } catch { /* ignore */ }
      if (!vcred.username) return json({ error: "Saved login is incomplete" }, 409);

      if (phase === "start") {
        const approvalId = body.approval_id;
        if (!approvalId) return json({ error: "approval_id required" }, 400);
        const { data: approval } = await admin.from("exec_approvals")
          .select("*").eq("id", approvalId).maybeSingle();
        if (!approval || (approval as Record<string, unknown>).user_id !== runUser.id ||
            (approval as Record<string, unknown>).merchant_key !== merchantKey ||
            (approval as Record<string, unknown>).action !== "cancel_subscription" ||
            (approval as Record<string, unknown>).status !== "approved") {
          return json({ error: "Approval not valid for verification run" }, 409);
        }
        const { data: claimed } = await admin.from("exec_approvals")
          .update({ status: "executing" })
          .eq("id", (approval as Record<string, unknown>).id).eq("user_id", runUser.id)
          .eq("action", "cancel_subscription").eq("status", "approved")
          .select("id");
        if (!claimed || !claimed.length) return json({ error: "Approval already claimed" }, 409);
        const ctx: ExecContext = {
          username: vcred.username, password: vcred.password || "",
          approval: approval as Record<string, unknown>, admin,
        };
        const { data: run } = await admin.from("exec_runs").insert({
          approval_id: (approval as Record<string, unknown>).id, user_id: runUser.id, status: "started",
          evidence: { merchant: merchantKey, merchant_key: merchantKey, driver: "browserbase", verification_run: true, playbook_version: pb.version },
        }).select("id").single();
        const runId = (run as { id: string }).id;
        let session: { id: string; connectUrl: string } | null = null;
        const ev: Record<string, unknown> = { merchant: merchantKey, merchant_key: merchantKey, driver: "browserbase", verification_run: true };
        try {
          session = await bbCreateSession(true); // keepAlive: survives the OTP pause
          ev.session_id = session.id;
          const cdp = await Cdp.connect(session.connectUrl);
          let outcome: BrowserOutcome;
          try {
            const page = await BbPage.open(cdp);
            outcome = await def.start(ctx, page, ev);
          } finally { cdp.close(); }
          if ("awaitingOtp" in outcome && (outcome as { awaitingOtp?: boolean }).awaitingOtp) {
            ev.resume = (outcome as { resume?: unknown }).resume;
            await admin.from("exec_runs").update({
              status: "awaiting_otp", evidence: ev,
              browserbase_session_id: session.id,
              otp_hint: (outcome as { otpHint?: string }).otpHint,
              otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
            }).eq("id", runId);
            return json({ ok: false, status: "awaiting_otp", run_id: runId,
              otp_hint: (outcome as { otpHint?: string }).otpHint });
          }
          await bbStopSession(session.id);
          const finalStatus = outcome.ok ? "done" : "failed";
          const err = outcome.ok ? null : (outcome as { error: string }).error;
          await admin.from("exec_runs").update({
            status: finalStatus, evidence: ev, error: err, finished_at: new Date().toISOString(),
          }).eq("id", runId);
          await learnFromRunOutcome({
            admin, merchantKey, merchantLabel: pb.display_name,
            finalStatus, error: err, ev, runId, appliedLessonIds: [],
          });
          await admin.from("exec_approvals").update({ status: finalStatus, decided_at: new Date().toISOString() })
            .eq("id", (approval as Record<string, unknown>).id);
          return json({ ok: outcome.ok, status: finalStatus, evidence: ev, error: err });
        } catch (e) {
          if (session) await bbStopSession(session.id);
          const msg = String((e as Error)?.message || e);
          await admin.from("exec_runs").update({
            status: "failed", evidence: ev, error: "Verification run failed: " + msg,
            finished_at: new Date().toISOString(),
          }).eq("id", runId);
          await admin.from("exec_approvals").update({ status: "failed", decided_at: new Date().toISOString() })
            .eq("id", (approval as Record<string, unknown>).id);
          return json({ ok: false, status: "failed", error: "Verification run failed: " + msg }, 500);
        }
      }

      if (phase === "resume") {
        const { run_id, otp_code } = body;
        if (!run_id || typeof otp_code !== "string" || !otp_code.trim()) {
          return json({ error: "run_id and otp_code required" }, 400);
        }
        const rres = await resumeRunWithOtp(admin, runUser,
          await admin.from("exec_runs").select("*").eq("id", run_id).maybeSingle()
            .then((r: { data: unknown }) => r.data), otp_code.trim());
        return json(rres.body, rres.status);
      }
      return json({ error: "Unknown phase" }, 400);
    }

    // ---- default: execute an approved approval ----
    const { approval_id } = body;
    if (!approval_id) return json({ error: "approval_id required" }, 400);

    // Load the approval; the shared decideExecuteGate (execution-guards.ts —
    // the SAME function the fixtures exercise) verifies ownership, approved
    // status, the terminal done-run guard, action, approval_context, and the
    // category exclusion, in that order.
    const { data: approval } = await admin.from("exec_approvals")
      .select("*").eq("id", approval_id).maybeSingle();
    // Retry scoping (2026-09-28): an approval that already produced a terminal
    // "done" run may NEVER execute again — a new cancellation needs a new
    // explicit approval. Retries of failed attempts go through retry_run.
    // (Read-only pre-check so the shared gate can enforce it.)
    const { data: doneRun } = await admin.from("exec_runs")
      .select("id").eq("approval_id", approval_id).eq("status", "done").limit(1).maybeSingle();
    const gate = decideExecuteGate(approval, {
      callerOwns: !!approval && approval.user_id === user.id,
      doneRunExists: !!doneRun,
    });
    if (!gate.proceed) {
      if (gate.guidedReason) {
        const r = await recordGuidedRun({
          admin, approval, userId: user.id,
          reason: gate.guidedReason,
          note: gate.note || gate.error,
          directory_entry: null,
        });
        return json(r, gate.status);
      }
      return json({ error: gate.error }, gate.status);
    }
    // Resolve the merchant through the catalog (statement descriptors are
    // noisy: "SPOTIFY USA", "MICROSOFT*XBOX", ...). The executor gate:
    //   - unknown / no playbook -> audited guided fallback
    //   - playbook.verified !== true -> REFUSE: { path:"guided",
    //     reason:"unverified_playbook" }. Vaulted credentials and Browserbase
    //     are never touched for unverified playbooks.
    const resolved: Resolution = resolveMerchant(String(approval.merchant_key || ""));
    if (resolved.merchant_key === "unknown" || !resolved.playbook) {
      const r = await recordGuidedRun({
        admin, approval, userId: user.id,
        reason: "no_playbook",
        note: `Upmore has no cancellation path for "${approval.merchant_key}" yet — here is the guided self-serve flow.`,
        directory_entry: resolved.directory,
      });
      return json(r, 400);
    }
    if (resolved.playbook.verified !== true) {
      const r = await recordGuidedRun({
        admin, approval, userId: user.id,
        reason: "unverified_playbook",
        note: `The ${resolved.playbook.display_name} cancellation path is not live-verified yet, so the agent will not attempt it — here is the guided self-serve flow.`,
        directory_entry: resolved.directory,
      });
      return json(r, 400);
    }
    // Playbook demotion (2026-09-28): 3 user mismatch reports in 30 days
    // auto-demote a playbook to unverified — the executor refuses until it
    // is re-verified. Vault credentials and Browserbase are never touched
    // for demoted playbooks.
    {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString();
      const { count: mismatchCount } = await admin.from("playbook_reports")
        .select("id", { count: "exact", head: true })
        .eq("merchant_key", resolved.merchant_key)
        .eq("kind", "mismatch")
        .gte("created_at", thirtyDaysAgo);
      if ((mismatchCount || 0) >= 3) {
        const r = await recordGuidedRun({
          admin, approval, userId: user.id,
          reason: "playbook_demoted",
          note: `The ${resolved.playbook.display_name} cancellation path was paused after recent reports that it didn't match the site — here is the guided self-serve flow instead.`,
          directory_entry: resolved.directory,
        });
        return json(r, 400);
      }
    }
    const merchantKey = resolved.merchant_key;
    // Learning from mistakes (2026-09-28): pull the agent's failure memory
    // for this merchant BEFORE touching vault credentials or Browserbase. If
    // past attempts kept failing the same way, the agent has learned this
    // path does not work — skip the doomed run and go straight to guided.
    // Otherwise the lessons ride along in the run evidence and the response
    // so the user can see what was learned.
    const execLessons = await fetchExecLessons(admin, merchantKey);
    const skipRetry = shouldSkipRetryExec(execLessons);
    if (skipRetry.skip) {
      const r = await recordGuidedRun({
        admin, approval, userId: user.id,
        reason: "learned_repeat_failure",
        note: skipRetry.reason ?? "Past attempts kept failing the same way — using the guided path instead.",
        directory_entry: resolved.directory,
      });
      return json({ ...r, learned_from: skipRetry.lesson?.title ?? null }, 400);
    }
    const appliedLessonIds = execLessons.map((l) => l.id);
    const appliedLessonTitles = execLessons.map((l) => l.title);
    const browserDef = browserPlaybooks[merchantKey] ?? declarativeDef(resolved.playbook);
    const httpPlaybook = playbooks[merchantKey];
    if (!browserDef && !httpPlaybook) {
      const r = await recordGuidedRun({
        admin, approval, userId: user.id, reason: "no_playbook",
        directory_entry: resolved.directory,
      });
      return json(r, 400);
    }

    // Atomic claim: approved -> executing, only when the row is still
    // approved and caller-owned. Two concurrent execute calls cannot both
    // proceed — exactly one wins the claim.
    const { data: claimed } = await admin.from("exec_approvals")
      .update({ status: "executing" })
      .eq("id", approval.id).eq("user_id", user.id)
      .eq("action", "cancel_subscription").eq("status", "approved")
      .select("id");
    if (!claimed || !claimed.length) {
      return json({ error: "Approval was already claimed or is no longer approved" }, 409);
    }

    // Load vaulted credential. Browser playbooks (passwordless OTP flows)
    // need only the username/email; HTTP playbooks need both.
    const { data: credRef } = await admin.from("exec_credential_refs")
      .select("*").eq("user_id", user.id).eq("merchant_key", merchantKey).maybeSingle();
    if (!credRef) {
      const r = await recordGuidedRun({
        admin, approval, userId: user.id,
        reason: "no_vault_credentials",
        note: "No saved login for this merchant. Connect it in the app first — here is the guided self-serve flow in the meantime.",
        directory_entry: resolved.directory,
      });
      return json(r, 409);
    }
    const { data: vsecret2, error: verr2 } = await admin.rpc("exec_vault_read", {
      p_name: (credRef as { vault_name: string }).vault_name,
    });
    if (verr2 || !vsecret2) return json({ error: "Could not read saved login" }, 500);
    let cred: { username?: string; password?: string } = {};
    try { cred = JSON.parse(vsecret2 || "{}"); } catch { /* ignore */ }
    if (!cred.username || (!browserDef && !cred.password)) {
      const r = await recordGuidedRun({
        admin, approval, userId: user.id,
        reason: "no_vault_credentials",
        note: "Saved login is incomplete. Reconnect it in the app — here is the guided self-serve flow in the meantime.",
        directory_entry: resolved.directory,
      });
      return json(r, 409);
    }

    // Honest setup check: no Browserbase credentials -> audited needs_setup
    // with the guided fallback, never a fake execution.
    if (!bbEnvReady()) {
      const r = await recordGuidedRun({
        admin, approval, userId: user.id,
        reason: "needs_setup",
        note: "Browser automation is not configured yet (Browserbase credentials are missing), so the agent cannot run the browser. Here is the guided self-serve flow.",
        directory_entry: resolved.directory,
      });
      return json(r, 503);
    }

    const ctx: ExecContext = {
      username: cred.username, password: cred.password || "",
      approval, admin,
    };

    // Open run row (approval is already atomically claimed above).
    const { data: run } = await admin.from("exec_runs")
      .insert({
        approval_id: approval.id, user_id: user.id, status: "started",
        evidence: {
          playbook_version: resolved.playbook.version ?? 1,
          playbook_verified_at: resolved.playbook.last_verified_at ?? null,
          merchant_key: merchantKey,
          // Learning: the past lessons injected into this attempt.
          lessons_applied: appliedLessonTitles,
          lessons_applied_ids: appliedLessonIds,
        },
      })
      .select("id").single();

    // ---- browser path ----
    if (browserDef) {
      let session: { id: string; connectUrl: string } | null = null;
      const ev: Record<string, unknown> = {
        merchant: merchantKey, driver: "browserbase",
        lessons_applied: appliedLessonTitles,
        // Learning: preserve the applied lesson IDs through the OTP pause —
        // without this, the awaiting_otp evidence overwrites the run row's
        // lessons_applied_ids and resumed runs never increment times_applied.
        lessons_applied_ids: appliedLessonIds,
      };
      const directory_entry = resolved.directory;
      try {
        session = await bbCreateSession(true); // keepAlive: survives the OTP pause
        ev.session_id = session.id;
        const cdp = await Cdp.connect(session.connectUrl);
        let outcome: BrowserOutcome;
        try {
          const page = await BbPage.open(cdp);
          outcome = await browserDef.start(ctx, page, ev);
        } finally {
          cdp.close();
        }
        if ("awaitingOtp" in outcome && outcome.awaitingOtp) {
          // Pause: keep the session alive, wait for the user's code.
          // 30-minute TTL (2026-09-28): the sweeper kills expired pauses.
          ev.resume = outcome.resume;
          await admin.from("exec_runs").update({
            status: "awaiting_otp",
            evidence: ev,
            browserbase_session_id: session.id,
            otp_hint: outcome.otpHint,
            otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(), // shared 30-min TTL
          }).eq("id", run.id);
          return json({ ok: false, status: "awaiting_otp", run_id: run.id, otp_hint: outcome.otpHint, otp_expires_in_minutes: 30 });
        }
        await bbStopSession(session.id);
        session = null;
        const finalStatus = outcome.ok ? "done" : "failed";
        const err = outcome.ok ? null : (outcome as { error: string }).error;
        if (finalStatus === "failed") ev.directory_entry = directory_entry;
        await admin.from("exec_runs").update({
          status: finalStatus, evidence: ev, error: err,
          finished_at: new Date().toISOString(),
        }).eq("id", run.id);
        await admin.from("exec_approvals").update({
          status: finalStatus, decided_at: new Date().toISOString(),
        }).eq("id", approval.id);
        // Learning: record this terminal outcome in the failure memory.
        await learnFromRunOutcome({
          admin, merchantKey,
          merchantLabel: String(approval.merchant ?? merchantKey),
          finalStatus, error: err, ev, runId: run.id, appliedLessonIds,
        });
        if (finalStatus === "done") {
          await writeCancelClaim(admin, approval, user.id, run.id, merchantKey);
        }
        return json(outcome.ok
          ? { ok: true, status: finalStatus, evidence: ev, error: err }
          : { ok: false, status: finalStatus, evidence: ev, error: err, directory_entry });
      } catch (e) {
        if (session) await bbStopSession(session.id);
        const msg = String(e?.message || e);
        ev.directory_entry = directory_entry;
        await admin.from("exec_runs").update({
          status: "failed", evidence: ev,
          error: "Browser run failed: " + msg,
          finished_at: new Date().toISOString(),
        }).eq("id", run.id);
        await admin.from("exec_approvals").update({
          status: "failed", decided_at: new Date().toISOString(),
        }).eq("id", approval.id);
        await learnFromRunOutcome({
          admin, merchantKey,
          merchantLabel: String(approval.merchant ?? merchantKey),
          finalStatus: "failed", error: "Browser run failed: " + msg,
          ev, runId: run.id, appliedLessonIds,
        });
        return json({ ok: false, status: "failed", error: "Browser run failed: " + msg, directory_entry }, 500);
      }
    }

    // ---- HTTP path ----
    let result: ExecResult;
    try {
      result = await httpPlaybook!(ctx);
    } catch (e) {
      result = { ok: false, evidence: { merchant: approval.merchant_key, stage: "exception" }, error: String(e?.message || e) };
    }

    const finalStatus = result.ok ? "done" : "failed";
    if (!result.ok) {
      (result.evidence as Record<string, unknown>).directory_entry = resolved.directory;
    }
    await admin.from("exec_runs").update({
      status: finalStatus,
      evidence: result.evidence,
      error: result.error || null,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);
    await admin.from("exec_approvals").update({
      status: finalStatus,
      decided_at: new Date().toISOString(),
    }).eq("id", approval.id);
    // Learning: record this terminal outcome in the failure memory.
    await learnFromRunOutcome({
      admin, merchantKey,
      merchantLabel: String(approval.merchant ?? merchantKey),
      finalStatus, error: result.error || null,
      ev: result.evidence as Record<string, unknown>,
      runId: run.id, appliedLessonIds,
    });
    if (finalStatus === "done") {
      await writeCancelClaim(admin, approval, user.id, run.id, merchantKey);
    }

    return json(result.ok
      ? { ok: true, status: finalStatus, evidence: result.evidence, error: result.error || null }
      : { ok: false, status: finalStatus, evidence: result.evidence, error: result.error || null, directory_entry: resolved.directory });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
