// Live-local cancellation outcomes — a real Chromium, the REAL step loop.
//
// Drives the production runDeclarative (execution-guards.ts) and the
// production Spotify playbook steps (merchant-catalog.ts, unchanged except
// the account URL is pointed at a local merchant) through a Playwright page
// whose methods run the same in-page JavaScript as BbPage in
// agent-exec/index.ts. The local merchant keeps real subscription state, so
// each check asserts the OUTCOME (the merchant's own record), not only what
// the agent reported.
//
// Run: node tests/execution/live-local/run-live-local.js
// Needs Playwright with Chromium (global install is fine).

import http from "node:http";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { check, section, totals } from "../real-trust/assert.js";
import {
  runDeclarative, decideExecuteGate, buildCancelClaimRow,
} from "../../../supabase/functions/agent-exec/execution-guards.ts";
import { playbookRegistry } from "../../../supabase/functions/agent-exec/merchant-catalog.ts";

const require = createRequire(import.meta.url);
let chromium;
// Resolution order: local install, PLAYWRIGHT_MODULE, global npm root.
for (const id of ["playwright", process.env.PLAYWRIGHT_MODULE, () => execSync("npm root -g").toString().trim() + "/playwright"]) {
  try { if (id) { ({ chromium } = require(typeof id === "function" ? id() : id)); break; } } catch { /* next */ }
}
if (!chromium) { console.error("Playwright not found: npm i -D playwright, or set PLAYWRIGHT_MODULE."); process.exit(2); }

// ---------------- local merchant with real state ----------------
// Variants: "normal" | "retention" (offer screen asking to switch plans
// before the confirm dialog) | "silent" (confirm does nothing server-side
// and shows no confirmation) | "wrong_password".
function merchant(variant, offerText = "Wait! Special offer. Switch plan to Premium Lite for $4.99 instead.") {
  const state = { subscription: "active", logins: 0, cancel_posts: 0 };
  const page = (body, script = "") => `<!doctype html><html><head><title>Local Music</title></head><body>${body}<script>${script}</script></body></html>`;
  const server = http.createServer((req, res) => {
    const send = (html, code = 200) => { res.writeHead(code, { "content-type": "text/html" }); res.end(html); };
    const authed = /session=ok/.test(req.headers.cookie || "");
    const url = new URL(req.url, "http://x");
    if (req.method === "POST" && url.pathname === "/login") {
      let body = ""; req.on("data", c => body += c); req.on("end", () => {
        const f = new URLSearchParams(body);
        state.logins++;
        if (f.get("email") === "owner@example.test" && f.get("password") === "correct-horse") {
          res.writeHead(303, { "set-cookie": "session=ok; Path=/", location: "/account/subscription/" }); res.end();
        } else send(page(`<p>Incorrect email or password.</p><form method=post action=/login><input type=email name=email><input type=password name=password><button>Log in</button></form>`), 401);
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/cancel") {
      state.cancel_posts++;
      if (!authed) return send("no", 401);
      if (variant !== "silent") state.subscription = "cancelled";
      res.writeHead(303, { location: variant === "silent" ? "/account/subscription/" : "/account/cancelled" }); res.end();
      return;
    }
    if (url.pathname === "/account/subscription/") {
      if (!authed) return send(page(`<h1>Log in to continue</h1><form method=post action=/login><label>Email <input type=email name=email></label><label>Password <input type=password name=password></label><button type=submit>Log in</button></form>`));
      if (state.subscription === "cancelled") return send(page(`<h1>Your subscription</h1><p>Premium has been cancelled.</p>`));
      const dialog = `<div role=dialog id=dlg hidden><p>Are you sure?</p><button onclick="document.getElementById('dlg').hidden=true">Keep Premium</button><form method=post action=/cancel style=display:inline><button type=submit>Yes, cancel</button></form></div>`;
      const offer = `<div id=offer hidden><p>${offerText}</p><button onclick="document.getElementById('offer').hidden=true;document.getElementById('dlg').hidden=false">No thanks</button></div>`;
      const open = variant === "retention" ? "document.getElementById('offer').hidden=false" : "document.getElementById('dlg').hidden=false";
      return send(page(`<h1>Your subscription</h1><p>Premium Individual, $11.99/month. Next billing 2026-11-01.</p><button id=c onclick="${open}">Cancel Premium</button>${offer}${dialog}`));
    }
    if (url.pathname === "/account/cancelled" && authed)
      return send(page(`<h1>Premium cancelled</h1><p>Your Premium ends on 2026-11-01. You won't be charged again.</p>`));
    send("not found", 404);
  });
  return new Promise(r => server.listen(0, "127.0.0.1", () => r({ server, state, base: `http://127.0.0.1:${server.address().port}` })));
}

// ---------------- Playwright page with BbPage's in-page code ----------------
const jsq = s => JSON.stringify(s);
class PwPage {
  constructor(p) { this.p = p; this.calls = []; }
  async eval(expression) { return this.p.evaluate(expression); }
  async goto(url, timeoutMs = 40000) { this.calls.push(["goto", url]); await this.p.goto(url, { timeout: timeoutMs }).catch(() => {}); }
  async waitFor(js, timeoutMs = 20000, pollMs = 200) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { try { if (await this.eval(js)) return true; } catch {} await new Promise(r => setTimeout(r, pollMs)); }
    return false;
  }
  async settle() { await this.p.waitForLoadState("load").catch(() => {}); await new Promise(r => setTimeout(r, 150)); await this.p.waitForLoadState("load").catch(() => {}); }
  async clickFirst(selectors) {
    for (const sel of selectors) {
      const r = await this.eval(`(() => { const el = document.querySelector(${jsq(sel)}); if (!el || el.offsetParent === null) return null; el.scrollIntoView({ block: "center" }); el.click(); return "clicked"; })()`).catch(() => null);
      if (r === "clicked") { await this.settle(); return sel; }
    }
    return null;
  }
  async clickText(pattern) {
    this.calls.push(["clickText", pattern]);
    const r = await this.eval(`(() => { const re = new RegExp(${jsq(pattern)}, "i"); const els = [...document.querySelectorAll("button, a, [role=button], input[type=submit]")]; for (const el of els) { const t = ((el.innerText || el.value) || "").trim(); if (t && re.test(t) && el.offsetParent !== null) { el.scrollIntoView({ block: "center" }); el.click(); return t.slice(0, 80); } } return null; })()`).catch(() => null);
    if (r) await this.settle();
    return r;
  }
  async clickDialogButton(pattern) {
    this.calls.push(["clickDialogButton", pattern]);
    const r = await this.eval(`(() => { const re = new RegExp(${jsq(pattern)}, "i"); const scope = document.querySelector('[role="dialog"], [data-state="open"]') || document; const els = [...scope.querySelectorAll("button")]; for (const el of els) { const t = (el.innerText || "").trim(); if (t && re.test(t) && el.offsetParent !== null) { el.scrollIntoView({ block: "center" }); el.click(); return t.slice(0, 80); } } return null; })()`).catch(() => null);
    if (r) await this.settle();
    return r;
  }
  async typeInto(selectors, text) {
    for (const sel of selectors) {
      const r = await this.eval(`(() => { const el = document.querySelector(${jsq(sel)}); if (!el || el.offsetParent === null) return null; el.focus(); const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value"); if (desc && desc.set) desc.set.call(el, ${jsq(text)}); else el.value = ${jsq(text)}; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return "typed"; })()`).catch(() => null);
      if (r === "typed") return sel;
    }
    return null;
  }
  async fillOtp() { return ""; }
  async screenshot(label) { try { return { label, data: (await this.p.screenshot({ type: "jpeg", quality: 40 })).toString("base64") }; } catch { return null; } }
}

const spotify = playbookRegistry.spotify;
function localPlaybook(base) {
  return { display_name: spotify.display_name,
    steps: spotify.steps.map(s => s.kind === "goto" ? { ...s, url: base + "/account/subscription/" } : s) };
}
const approval = {
  id: "appr-1", status: "approved", action: "cancel_subscription", merchant: "Spotify", merchant_key: "spotify",
  approval_context: { merchant_name: "Spotify", amount: 11.99, billing_interval: "monthly", next_billing_date: "2026-11-01",
    subscription_id: "sub-1", disclosed_at: "2026-10-10T16:00:00Z" },
};

async function attempt(browser, variant, password = "correct-horse", offerText, playbook) {
  const m = await merchant(variant, offerText);
  const ctxB = await browser.newContext();
  const page = new PwPage(await ctxB.newPage());
  const ev = {};
  let outcome;
  try { outcome = await runDeclarative({ username: "owner@example.test", password }, page, (playbook || localPlaybook)(m.base), ev, 0, null); }
  finally { await ctxB.close(); m.server.close(); }
  return { outcome, ev, state: m.state, page };
}

const browser = await chromium.launch();
try {
  section("gate: only an owned, approved, not-yet-completed cancel approval may reach the browser");
  check("approved approval proceeds", decideExecuteGate(approval, { callerOwns: true, doneRunExists: false }).proceed === true);
  check("pending approval is refused", decideExecuteGate({ ...approval, status: "pending" }, { callerOwns: true, doneRunExists: false }).proceed === false);
  check("another user's approval is refused", decideExecuteGate(approval, { callerOwns: false, doneRunExists: false }).proceed === false);
  check("a completed approval cannot cancel twice", decideExecuteGate(approval, { callerOwns: true, doneRunExists: true }).proceed === false);

  section("real browser: production Spotify playbook cancels at the local merchant");
  const ok = await attempt(browser, "normal");
  check("runDeclarative reports ok", ok.outcome.ok === true, JSON.stringify(ok.outcome));
  check("OUTCOME: merchant record says cancelled", ok.state.subscription === "cancelled", ok.state.subscription);
  check("exactly one cancel request reached the merchant", ok.state.cancel_posts === 1, String(ok.state.cancel_posts));
  check("confirmation text captured as evidence", /won't be charged again|cancell?ed/i.test(String(ok.ev.confirmation_text)), String(ok.ev.confirmation_text));
  check("account + confirmation screenshots captured", (ok.ev.shots || []).map(s => s.label).join() === "account,confirmation");
  check("no credential appears in evidence", !JSON.stringify(ok.ev).includes("correct-horse"));
  const claim = buildCancelClaimRow(approval, "user-1", "run-1", "spotify", Date.parse("2026-10-10T16:00:00Z"));
  check("success is recorded as an open claim to verify at next billing, not as savings", claim.status === "open" && claim.expected_billing_date === "2026-11-01" && claim.grace_days === 2);

  section("real browser: retention offer to switch plans stops the run");
  const ret = await attempt(browser, "retention");
  check("run fails", ret.outcome.ok === false, JSON.stringify(ret.outcome));
  check("plan_change tripwire recorded", ret.ev.stopped_at_tripwire === "plan_change", String(ret.ev.stopped_at_tripwire));
  check("OUTCOME: merchant record still active (nothing changed)", ret.state.subscription === "active" && ret.state.cancel_posts === 0);

  section("real browser: merchant shows no confirmation, so success is not claimed");
  const silent = await attempt(browser, "silent");
  check("run fails", silent.outcome.ok === false, JSON.stringify(silent.outcome));
  check("failure says no confirmation, not success", /no confirmation|confirmation text/i.test(silent.outcome.error || ""), silent.outcome.error);
  check("OUTCOME: merchant record still active", silent.state.subscription === "active");

  section("real browser: wrong password fails without touching the subscription");
  const bad = await attempt(browser, "normal", "wrong");
  check("run fails", bad.outcome.ok === false, JSON.stringify(bad.outcome));
  check("OUTCOME: no cancel request and still active", bad.state.cancel_posts === 0 && bad.state.subscription === "active");
  section("real browser: each retention phrase alone stops the run");
  for (const [phrase, text] of [["special offer", "Before you go, a special offer just for you."],
      ["switch plan", "You could switch your plan to Lite."], ["stay for", "Stay for 3 more months at 50% off."],
      ["downgrade", "Downgrade to Lite instead?"]]) {
    const r = await attempt(browser, "retention", "correct-horse", text);
    check(`"${phrase}" trips plan_change and leaves the subscription active`,
      r.ev.stopped_at_tripwire === "plan_change" && r.state.subscription === "active" && r.state.cancel_posts === 0,
      `${r.ev.stopped_at_tripwire} ${r.state.subscription}`);
  }

  section("real browser: a playbook without a confirmation step still cannot claim success");
  const noConfirm = base => ({ display_name: "Spotify", steps: localPlaybook(base).steps.filter(s => s.kind !== "requireText") });
  const nc = await attempt(browser, "silent", "correct-horse", undefined, noConfirm);
  check("run fails without visible confirmation", nc.outcome.ok === false && /No visible confirmation/i.test(nc.outcome.error || ""), JSON.stringify(nc.outcome));
  check("OUTCOME: merchant record still active", nc.state.subscription === "active");
} finally {
  await browser.close();
}
const t = totals(); console.log(`\n${t.passed} passed, ${t.failed} failed`);
process.exit(t && t.failed ? 1 : 0);
