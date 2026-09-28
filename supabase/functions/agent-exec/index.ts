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
  type BrowserOutcome,
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
    "Access-Control-Allow-Headers": "authorization, content-type",
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
  const otpSeen = await page.waitFor(`(() => {
    const t = (document.body.innerText || "").toLowerCase();
    return /check your email|enter (the )?code|verification code|one-time/.test(t) ||
      !!document.querySelector('input[autocomplete="one-time-code"], input[name*="code" i], input[name*="otp" i]');
  })()`, 25000);
  ev.otp_prompt = otpSeen;
  ev.after_continue_url = await page.url().catch(() => null);
  pushShot(ev, await page.screenshot("otp-prompt"));
  if (!otpSeen) {
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

  // Find billing: scan for a billing link, else try known paths.
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
    for (const p of ["/settings/billing", "/settings", "/account"]) {
      const u = "https://app.devin.ai" + p;
      await page.goto(u, 25000);
      const t = ((await page.eval("document.body.innerText || \"\"").catch(() => "")) as string);
      if (/cancel (your |the )?(subscription|plan)|billing/i.test(t)) { billingUrl = u; break; }
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
  await sleep(2500);
  const dialogSeen = await page.waitFor(
    `/are you sure|confirm|cancellation|before you go/i.test(document.body.innerText || "")`,
    12000);
  ev.confirm_dialog = dialogSeen;
  pushShot(ev, await page.screenshot("confirm-dialog"));

  // Confirm inside the dialog.
  const confirmed = await page.clickDialogButton("confirm|yes,?\\s*cancel|cancel (my |the )?subscription");
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

const browserPlaybooks: Record<string, BrowserPlaybookDef> = {
  // Only runs when a real approved exec_approvals row exists — the serve()
  // handler enforces this before any playbook is invoked. Never invent
  // approvals, never run in tests.
  "devin": { start: devinStart, resume: devinResume },
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
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "Invalid session" }, 401);
    const admin = createClient(supabaseUrl, serviceKey);

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

    const body = await req.json().catch(() => ({}));
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
      // 4. Prove nothing remains: zero refs AND zero vault secrets.
      const { data: refsAfter } = await admin.from("exec_credential_refs")
        .select("merchant_key").eq("user_id", user.id);
      let vaultRemaining = -1;
      try {
        const vres = await fetch(
          `${supabaseUrl}/rest/v1/vault_secrets?select=name&name=like.exec_cred_${user.id}_*`,
          { headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` } },
        );
        if (vres.ok) vaultRemaining = ((await vres.json()) as unknown[]).length;
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
        return json({ error: otpDecision.error }, 410);
      }
      if (!otpDecision.proceed) {
        return json({ error: otpDecision.error }, 409);
      }
      if (!run.browserbase_session_id) {
        return json({ error: "Run has no browser session" }, 409);
      }
      // Atomic lock: only one resume proceeds.
      const { data: locked } = await admin.from("exec_runs")
        .update({ status: "started" })
        .eq("id", run.id).eq("status", "awaiting_otp")
        .select("id");
      if (!locked || !locked.length) {
        return json({ error: "This code is already being processed" }, 409);
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
        return json({ error: "Approval is not valid for resume" }, 409);
      }
      const resumeKey = normalizeMerchant(String(approval.merchant_key || ""));
      const resumePb = playbookRegistry[resumeKey];
      if (!resumePb || resumePb.verified !== true) {
        const directory_entry = merchantDirectory[resumeKey] ?? GENERIC_FALLBACK;
        await admin.from("exec_runs").update({
          status: "failed",
          evidence: { path: "guided", reason: "unverified_playbook", directory_entry },
          error: "unverified_playbook",
          finished_at: new Date().toISOString(),
        }).eq("id", run.id);
        return json({ ok: false, path: "guided", reason: "unverified_playbook", directory_entry }, 409);
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
            page, otp_code.trim(), ev, resumeState);
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
        if (finalStatus === "done") {
          await writeCancelClaim(admin, approval, user.id, run.id, resumeKey);
        }
        return json({ ok: outcome.ok, status: finalStatus, error: err });
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
        return json({ ok: false, status: "failed", error: "Resume failed: " + msg }, 500);
      }
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
    const vres = await fetch(
      `${supabaseUrl}/rest/v1/vault_secrets?select=secret&name=eq.${encodeURIComponent(credRef.vault_name)}`,
      { headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` } },
    );
    if (!vres.ok) return json({ error: "Could not read saved login" }, 500);
    const vrows = await vres.json();
    let cred: { username?: string; password?: string } = {};
    try { cred = JSON.parse(vrows?.[0]?.secret || "{}"); } catch { /* ignore */ }
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
        },
      })
      .select("id").single();

    // ---- browser path ----
    if (browserDef) {
      let session: { id: string; connectUrl: string } | null = null;
      const ev: Record<string, unknown> = {
        merchant: merchantKey, driver: "browserbase",
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
