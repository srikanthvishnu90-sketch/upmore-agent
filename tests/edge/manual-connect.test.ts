// Guided manual connect over HTTP (supabase/functions/_shared/manual_connect.ts, served by supabase/functions/manual-connect)
// and its scheduled health check. The browser is a MOCK of the ManualBrowser interface (no Browserbase, no real site);
// the database is a MOCK Supabase client (an in-memory table and the three Vault RPCs, whose SQL is tested in
// tests/db/manual_connections.test.sql). Every value here is test-only. Nothing reaches a platform.
import { handleManualConnect, manualDb, runManualHealth, extract, detect, PLAYBOOKS, vaultName, type ManualBrowser, type SessionState } from "../../supabase/functions/_shared/manual_connect.ts";
import { browserbaseBrowser } from "../../supabase/functions/_shared/manual_browser.ts";
import { handleProactive } from "../../supabase/functions/_shared/proactive.ts";
import { ManualConnect } from "../../supabase/functions/_shared/router_core.js";

const MC: any = ManualConnect;
const eq = (a: unknown, b: unknown, m?: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m ?? "not equal"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const USER_A = "11111111-1111-4111-8111-111111111111", USER_B = "22222222-2222-4222-8222-222222222222";
const T0 = Date.UTC(2026, 9, 12, 15, 5, 0);
const COOKIE = "sid-test-only-" + "c0ffee".repeat(6); // looks like a session value on purpose: it must never be logged
const LIVE_VIEW = "https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=connect.browserbase.com/debug/win-1/devtools/browser/test";
const SIGNED_IN_PAGE = ["Overview", "Account value", "$12,345.67", "Net returns", "$1,020.30", "As of Oct 11, 2026", "Your funds", "Flagship Real Estate Fund  $8,000.00", "Income Real Estate Fund  $4,345.67", "Log out"].join("\n");
const SIGNED_OUT_PAGE = "Welcome back\nLog in\nEmail address\nContinue";

// ---- MOCK Supabase client: one table, the Vault RPCs with the SQL's name rule ----
function mockSupabase() {
  const rows: any[] = [], vault = new Map<string, string>(), rpcs: string[] = [];
  const NAME = /^manual_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[a-z0-9][a-z0-9-]{0,62}$/;
  function from(table: string) {
    if (table !== "manual_connections") throw new Error(`unexpected table ${table}`);
    const q: any = { op: "select", filters: [] as [string, unknown][], one: false, lim: 0 };
    const match = (r: any) => q.filters.every(([k, v]: [string, unknown]) => r[k] === v);
    const run = () => {
      if (q.op === "upsert") {
        const i = rows.findIndex((r) => r.user_id === q.row.user_id && r.platform_id === q.row.platform_id);
        if (i >= 0) Object.assign(rows[i], q.row); else rows.push(Object.assign({ state: "pending_login", vault_name: null, window_id: null, last_checked: null, failures: 0, told_signed_out: false }, q.row));
        return { data: null, error: null };
      }
      if (q.op === "update") { rows.filter(match).forEach((r) => Object.assign(r, q.patch)); return { data: null, error: null }; }
      let data = rows.filter(match).map((r) => ({ ...r }));
      if (q.lim) data = data.slice(0, q.lim);
      return { data: q.one ? data[0] || null : data, error: null };
    };
    Object.assign(q, {
      select() { return q; }, eq(k: string, v: unknown) { q.filters.push([k, v]); return q; }, order() { return q; }, limit(n: number) { q.lim = n; return q; },
      maybeSingle() { q.one = true; return q; }, upsert(row: any) { q.op = "upsert"; q.row = row; return q; }, update(p: any) { q.op = "update"; q.patch = p; return q; },
      then(res: any, rej: any) { return Promise.resolve().then(run).then(res, rej); },
    });
    return q;
  }
  async function rpc(name: string, a: { p_name: string; p_secret?: string }) {
    rpcs.push(name);
    if (!NAME.test(a.p_name || "")) return { data: null, error: { message: "invalid vault name" } };
    if (name === "manual_vault_store") { vault.set(a.p_name, a.p_secret!); return { data: "vault-id", error: null }; }
    if (name === "manual_vault_read") return { data: vault.get(a.p_name) ?? null, error: null };
    if (name === "manual_vault_delete") { vault.delete(a.p_name); return { data: null, error: null }; }
    return { data: null, error: { message: "unknown rpc" } };
  }
  return { client: { from, rpc }, rows, vault, rpcs };
}

// ---- MOCK browser: what the page shows is set by the test; the session is the cookie the platform set ----
function mockBrowser(o: { configured?: boolean; page?: () => string } = {}) {
  const calls: any[] = [], windows = new Map<string, { url: string; imported: SessionState | null; stopped: boolean }>();
  let n = 0;
  const state = { loggedIn: false, sessionValid: true, failLoad: false };
  const b: ManualBrowser = {
    configured: () => o.configured !== false,
    async create() { const id = `win-${++n}`; windows.set(id, { url: "about:blank", imported: null, stopped: false }); calls.push(["create", id]); return id; },
    async liveViewUrl(id) { calls.push(["liveViewUrl", id]); return LIVE_VIEW.replace("win-1", id); },
    async goto(id, url) { calls.push(["goto", id, url]); if (state.failLoad) throw new Error("did not load"); windows.get(id)!.url = url; },
    async click(id, alts) { calls.push(["click", id, alts]); return true; },
    async text(id) {
      calls.push(["text", id]);
      const w = windows.get(id)!;
      if (state.failLoad) return "";
      if (o.page) return o.page();
      // The sign-in window shows the account once the person has logged in; a restored window shows it while the
      // stored session is still valid.
      const signedIn = w.imported ? state.sessionValid && w.imported.cookies.some((c: any) => c.value === COOKIE) : state.loggedIn;
      return signedIn ? SIGNED_IN_PAGE : SIGNED_OUT_PAGE;
    },
    async exportState(id, domain) { calls.push(["exportState", id, domain]); return { cookies: [{ name: "sid", value: COOKIE, domain: ".fundrise.com", path: "/", secure: true, httpOnly: true }], origins: [{ origin: "https://fundrise.com", local_storage: [["auth_token", "tok-test-only"]] }], saved_at: new Date(T0).toISOString() }; },
    async importState(id, s) { calls.push(["importState", id]); windows.get(id)!.imported = s; },
    async stop(id) { calls.push(["stop", id]); windows.get(id)!.stopped = true; },
  };
  return { b, calls, windows, state };
}

function world(o: { configured?: boolean; browser?: ManualBrowser } = {}) {
  const sb = mockSupabase(), mb = mockBrowser({ configured: o.configured });
  const logs: string[] = [];
  let now = T0;
  const deps = () => ({ cors: {}, user: async (jwt: string) => (jwt === "jwt-a" ? { id: USER_A } : jwt === "jwt-b" ? { id: USER_B } : null), db: manualDb(sb.client), browser: o.browser || mb.b, now: () => now, log: (l: string) => logs.push(l) });
  const call = async (body: unknown, jwt: string | null = "jwt-a") => {
    const r = await handleManualConnect(new Request("https://x/functions/v1/manual-connect", { method: "POST", headers: jwt ? { Authorization: `Bearer ${jwt}`, "content-type": "application/json" } : { "content-type": "application/json" }, body: JSON.stringify(body) }), deps());
    return { status: r.status, body: await r.json() };
  };
  return { sb, mb, logs, call, deps, setNow: (t: number) => { now = t; } };
}
const F = "fundrise";
const noLeaks = (logs: string[]) => {
  for (const l of logs) {
    assert(!l.includes(COOKIE) && !l.includes("tok-test-only") && !l.includes("browserbase.com"), `a log line carries the session or the window URL: ${l}`);
    assert(MC.leaks(JSON.parse(l)) === false, `ManualConnect.leaks is true for a logged entry: ${l}`);
  }
};
async function connected(w: ReturnType<typeof world>) {
  eq((await w.call({ action: "consent", platform_id: F, accepted: true })).status, 200);
  eq((await w.call({ action: "start", platform_id: F })).status, 200);
  w.mb.state.loggedIn = true;
  const c = await w.call({ action: "check", platform_id: F });
  eq(c.status, 200, JSON.stringify(c.body));
}

Deno.test("manual-connect: only the signed-in person, only platforms with a playbook, and every answer says the playbook is unverified", async () => {
  const w = world();
  eq((await w.call({ action: "status" }, null)).status, 401);
  eq((await w.call({ action: "status" }, "jwt-forged")).status, 401);
  eq(PLAYBOOKS.map((p) => p.platform_id), ["cash-app-investing", "fundrise", "yieldstreet"]);
  const s = await w.call({ action: "status" });
  eq(s.status, 200); eq(s.body.platforms.length, 3);
  for (const p of s.body.platforms) { eq(p.playbook_status, "unverified playbook"); eq(p.status_line, `${p.display_name}: not connected`); eq(p.consent_text, MC.consentText(p.display_name)); }
  const nope = await w.call({ action: "consent", platform_id: "robinhood", accepted: true });
  eq(nope.status, 404); eq(nope.body.code, "no_playbook");
  for (const a of ["consent", "start", "check", "read", "disconnect"]) { const r = await w.call({ action: a, platform_id: F, accepted: false }); eq(r.body.playbook_status, "unverified playbook", a); }
});

Deno.test("consent is required: no yes, nothing opens; the exact words and their version are recorded before anything opens", async () => {
  const w = world();
  const early = await w.call({ action: "start", platform_id: F });
  eq(early.status, 412); eq(early.body.code, "no_consent"); eq(w.mb.calls.length, 0, "no window was created");
  for (const accepted of [false, "yes", 1, undefined]) {
    const r = await w.call({ action: "consent", platform_id: F, accepted });
    eq(r.status, 400); eq(r.body.text, "Nothing was connected: Fundrise connects only after you agree.");
  }
  eq(w.sb.rows.length, 0, "nothing recorded without a yes");
  eq((await w.call({ action: "consent", platform_id: F, accepted: true, consent_version: "2025-01-01" })).body.code, "consent_changed");
  const ok = await w.call({ action: "consent", platform_id: F, accepted: true, consent_version: MC.CONSENT_VERSION });
  eq(ok.status, 200);
  const row = w.sb.rows[0];
  eq([row.user_id, row.platform_id, row.state, row.consent_version, row.consent_at], [USER_A, F, "pending_login", MC.CONSENT_VERSION, new Date(T0).toISOString()]);
  eq(row.consent_text, MC.consentText("Fundrise").join(" "), "the consent text, verbatim");
  eq(w.mb.calls.length, 0, "consent alone opens nothing");
  noLeaks(w.logs);
});

Deno.test("start without Browserbase keys answers 503 NOT_WIRED and opens nothing (the real Browserbase browser, no env)", async () => {
  let fetched = 0;
  const off = browserbaseBrowser({ get: () => undefined }, (async () => { fetched++; return new Response("{}"); }) as unknown as typeof fetch);
  const w = world({ browser: off });
  await w.call({ action: "consent", platform_id: F, accepted: true });
  const r = await w.call({ action: "start", platform_id: F });
  eq(r.status, 503); eq(r.body.code, "NOT_WIRED"); assert(/nothing was opened and nothing was connected/.test(r.body.text), r.body.text);
  eq(fetched, 0, "no call to Browserbase");
  eq((await w.call({ action: "read", platform_id: F })).status, 409, "not connected, so nothing to read");
});

Deno.test("start opens the platform's own sign-in page in a live window and returns the live-view URL for the person", async () => {
  const w = world();
  await w.call({ action: "consent", platform_id: F, accepted: true });
  const r = await w.call({ action: "start", platform_id: F });
  eq(r.status, 200); eq(r.body.live_view_url, LIVE_VIEW); eq(r.body.playbook_status, "unverified playbook");
  assert(/Log in to Fundrise yourself/.test(r.body.text) && /never sees your password/.test(r.body.text), r.body.text);
  eq(w.mb.calls.map((c) => c.slice(0, 1)[0]), ["create", "goto", "click", "liveViewUrl"]);
  eq(w.mb.calls[1][2], "https://fundrise.com/", "the playbook's own login_url");
  eq(w.mb.calls[2][2], ["Log in", "Sign in"], "a sign-in link, nothing else");
  eq(w.sb.rows[0].window_id, "win-1");
  // Opening again closes the old window first: no dangling keepAlive session.
  await w.call({ action: "start", platform_id: F });
  assert(w.mb.windows.get("win-1")!.stopped, "the first window was released"); eq(w.sb.rows[0].window_id, "win-2");
  noLeaks(w.logs);
});

Deno.test("check: not signed in yet keeps the window and saves nothing; signed in saves the session in Vault, closes the window and connects; logs carry no cookie or token", async () => {
  const w = world();
  await w.call({ action: "consent", platform_id: F, accepted: true });
  eq((await w.call({ action: "check", platform_id: F })).body.code, "no_window");
  await w.call({ action: "start", platform_id: F });
  const notYet = await w.call({ action: "check", platform_id: F });
  eq(notYet.status, 409); eq(notYet.body.code, "not_signed_in"); eq(w.sb.vault.size, 0); eq(w.sb.rows[0].state, "pending_login");
  w.mb.state.loggedIn = true; // the person logs in themselves in the live window
  w.setNow(T0 + 60000);
  const ok = await w.call({ action: "check", platform_id: F });
  eq(ok.status, 200); eq(ok.body.state, "connected");
  eq(ok.body.status_line, "Fundrise: connected (manual session), last checked Oct 12, 3:06 PM UTC");
  const name = vaultName(USER_A, F);
  eq(name, `manual_${USER_A}_fundrise`);
  assert(w.sb.rpcs.includes("manual_vault_store"), "stored through the Vault RPC");
  const stored = JSON.parse(w.sb.vault.get(name)!);
  eq(stored.cookies[0].value, COOKIE, "the session (cookies and storage) is what Vault holds");
  eq(w.mb.calls.find((c) => c[0] === "exportState")[2], "fundrise.com", "only the platform's own cookies");
  const row = w.sb.rows[0];
  eq([row.state, row.vault_name, row.window_id, row.failures, row.told_signed_out, row.last_checked], ["connected", name, null, 0, false, new Date(T0 + 60000).toISOString()]);
  assert(!JSON.stringify(row).includes(COOKIE), "the table holds the Vault name, never the session");
  assert(w.mb.windows.get("win-1")!.stopped, "the window is closed");
  assert(!JSON.stringify(ok.body).includes(COOKIE) && !JSON.stringify(ok.body).includes("tok-test-only"), "the response never carries the session");
  assert(w.logs.length >= 4, "every step logged"); noLeaks(w.logs);
});

Deno.test("check on a stored session: signed out moves to needs_login and says it once; signed in again resets it; a page that changed is a blip, then broken, said once", async () => {
  const w = world();
  await connected(w);
  w.mb.state.sessionValid = false; // the platform signed the person out
  w.setNow(T0 + 7 * 3600000);
  const a = await w.call({ action: "check", platform_id: F });
  eq(a.body.state, "needs_login"); assert(/^Fundrise signed you out/.test(a.body.message), a.body.message);
  eq(a.body.status_line, "Fundrise: signed out - log in again to keep reading it (last read Oct 12, 3:05 PM UTC)");
  const b = await w.call({ action: "check", platform_id: F });
  eq(b.body.state, "needs_login"); eq(b.body.message, null, "told once, not every check");
  eq(w.sb.rows[0].told_signed_out, true);
  assert(w.mb.calls.filter((c) => c[0] === "stop").length >= 3, "every restored window is released");
  w.mb.state.sessionValid = true;
  eq((await w.call({ action: "check", platform_id: F })).body.state, "connected");
  eq(w.sb.rows[0].told_signed_out, false);
  w.mb.state.failLoad = true;
  const blip = await w.call({ action: "check", platform_id: F });
  eq([blip.body.state, blip.body.message], ["connected", null], "one failed load is a blip");
  const broken = await w.call({ action: "check", platform_id: F });
  eq(broken.body.state, "broken"); assert(/page changed.*Nothing was changed/.test(broken.body.message), broken.body.message);
  eq((await w.call({ action: "check", platform_id: F })).body.message, null, "broken is said once");
  noLeaks(w.logs);
});

Deno.test("read: restores the session, returns the numbers next to the playbook's labels with the as-of time and the source; read verbs only", async () => {
  const w = world();
  await connected(w);
  w.setNow(T0 + 3600000);
  const before = w.mb.calls.length;
  for (const verb of ["place_order", "transfer", "withdraw", "change_setting", "buy"]) {
    const r = await w.call({ action: "read", platform_id: F, verb });
    eq(r.status, 403, verb); eq(r.body.code, "read_only"); assert(/Nothing was done\.$/.test(r.body.text), r.body.text);
  }
  for (const action of ["buy", "sell", "transfer", "place_order"]) { const r = await w.call({ action, platform_id: F }); eq([r.status, r.body.code], [403, "read_only"], action); }
  eq(w.mb.calls.length, before, "a refused verb never touches the browser");
  const r = await w.call({ action: "read", platform_id: F });
  eq(r.status, 200, JSON.stringify(r.body));
  eq(r.body.read_only, true); eq(r.body.playbook_status, "unverified playbook");
  eq(r.body.source, "Fundrise, manual session (unverified playbook)");
  eq(r.body.balances, [{ label: "Account value", amount_cents: 1234567, amount: "$12,345.67" }, { label: "Net returns", amount_cents: 102030, amount: "$1,020.30" }]);
  eq(r.body.positions.map((p: any) => [p.name, p.amount_cents]), [["Flagship Real Estate Fund", 800000], ["Income Real Estate Fund", 434567]]);
  eq(r.body.as_of_page_text, "Oct 11, 2026"); eq(r.body.as_of_basis, "the page's own date"); assert(r.body.as_of.startsWith("2026-10-1"), r.body.as_of);
  eq(r.body.read_at, new Date(T0 + 3600000).toISOString());
  assert(/^Fundrise, manual session \(unverified playbook\), as of .+: Account value \$12,345\.67, Net returns \$1,020\.30, 2 holdings\.$/.test(r.body.text), r.body.text);
  const restored = w.mb.calls.filter((c) => c[0] === "importState");
  eq(restored.length, 1, "the stored session was restored in a fresh window");
  assert(w.mb.windows.get(restored[0][1])!.stopped, "and the window released");
  eq(w.sb.rows[0].last_checked, new Date(T0 + 3600000).toISOString(), "a read is also a health check");
  // Signed out at read time: nothing is read, and the state says so.
  w.mb.state.sessionValid = false;
  const out = await w.call({ action: "read", platform_id: F });
  eq(out.status, 409); eq(out.body.code, "needs_login"); eq(out.body.balances, undefined);
  noLeaks(w.logs);
});

Deno.test("extract and detect: no number is guessed; a sign-in page is signed out even when it says Portfolio; a date needs its year", () => {
  const pb = PLAYBOOKS.find((p) => p.platform_id === F);
  eq(detect(SIGNED_IN_PAGE, pb), { signed_out: false, signed_in: true });
  eq(detect("Portfolio\nLog in", pb), { signed_out: true, signed_in: false });
  eq(detect("Something else entirely", pb), { signed_out: false, signed_in: false });
  const x = extract({ "https://fundrise.com/": "Account value\n(loading)\nAs of Sep 30" }, pb, T0);
  eq(x.balances, []); assert(x.missing.includes("balance: Account value") && x.missing.includes("balance: Net returns"), JSON.stringify(x.missing));
  eq([x.as_of_basis, x.as_of, x.as_of_page_text], ["read time", new Date(T0).toISOString(), "Sep 30"]);
  eq(extract({ "https://fundrise.com/": "Account value -$1,000" }, pb, T0).balances[0].amount_cents, -100000);
});

Deno.test("disconnect deletes the Vault session at once and the status reads disconnected; a fresh consent is needed to connect again", async () => {
  const w = world();
  await connected(w);
  const name = vaultName(USER_A, F);
  assert(w.sb.vault.has(name), "session stored");
  const d = await w.call({ action: "disconnect", platform_id: F });
  eq(d.status, 200); eq(d.body.state, "revoked"); eq(d.body.status_line, "Fundrise: disconnected");
  assert(!w.sb.vault.has(name), "the Vault secret is deleted"); assert(w.sb.rpcs.includes("manual_vault_delete"), "through the Vault RPC");
  eq([w.sb.rows[0].state, w.sb.rows[0].vault_name, w.sb.rows[0].window_id], ["revoked", null, null]);
  eq((await w.call({ action: "start", platform_id: F })).body.code, "no_consent");
  eq((await w.call({ action: "read", platform_id: F })).body.code, "no_consent");
  // Another person never sees or touches it.
  eq((await w.call({ action: "status" }, "jwt-b")).body.platforms.find((p: any) => p.platform_id === F).state, "not_connected");
  noLeaks(w.logs);
});

Deno.test("scheduled health: only due sessions are checked; a sign-out is delivered once, with a key the once-only log can hold; nothing without Browserbase", async () => {
  const w = world();
  await connected(w);
  const delivered: any[] = [];
  const deliver = async (userId: string, msg: any) => { if (delivered.some((d) => d.key === msg.key)) return false; delivered.push(Object.assign({ userId }, msg)); return true; };
  const run = (t: number, browser = w.mb.b) => runManualHealth({ db: manualDb(w.sb.client), browser, deliver, now: () => t, log: (l) => w.logs.push(l) });
  eq((await run(T0 + 3600000)).checked, 0, "checked an hour ago: not due");
  w.mb.state.sessionValid = false;
  const r1 = await run(T0 + 6 * 3600000 + 60000);
  eq([r1.checked, r1.told, r1.needs_login], [1, 1, 1]);
  eq(delivered.length, 1); eq(delivered[0].userId, USER_A); eq(delivered[0].kind, "connection");
  eq(delivered[0].key, `manual:fundrise:signed_out:${new Date(T0).toISOString()}`);
  assert(/^Fundrise signed you out/.test(delivered[0].text) && /manual session; checked/.test(delivered[0].text), delivered[0].text);
  eq(w.sb.rows[0].state, "needs_login");
  eq((await run(T0 + 30 * 3600000)).checked, 0, "a signed-out session is not polled again, so it is never said twice");
  eq(delivered.length, 1);
  eq((await run(T0 + 30 * 3600000, mockBrowser({ configured: false }).b)).not_wired, true);
  noLeaks(w.logs);
});

Deno.test("agent-proactive runs the manual connect health check inside its own authenticated call and reports counts only", async () => {
  const secret = "s".repeat(40);
  const store = { users: async () => [], load: async () => ({ accounts: [], transactions: [], settings: null, sent: [] }), deliver: async () => [] };
  let ran = 0;
  const req = (h: Record<string, string>) => new Request("https://x/functions/v1/agent-proactive", { method: "POST", headers: h });
  const r = await handleProactive(req({ "x-upmore-proactive-secret": secret }), { env: { get: (k) => (k === "PROACTIVE_SECRET" ? secret : undefined) }, store, now: () => T0, extra: async () => { ran++; return { checked: 2, told: 1 }; } });
  eq(r.status, 200); eq((await r.json()).manual_connect, { checked: 2, told: 1 }); eq(ran, 1);
  const no = await handleProactive(req({}), { env: { get: (k) => (k === "PROACTIVE_SECRET" ? secret : undefined) }, store, extra: async () => { ran++; return {}; } });
  eq(no.status, 401); eq(ran, 1, "no secret, no health check");
  const failing = await handleProactive(req({ "x-upmore-proactive-secret": secret }), { env: { get: (k) => (k === "PROACTIVE_SECRET" ? secret : undefined) }, store, extra: async () => { throw new Error("down"); } });
  eq(failing.status, 200); eq((await failing.json()).manual_connect, { failed: true });
});

Deno.test("the Browserbase window: a keepAlive session in the project, the live-view URL from its debug page, released on stop (STUBBED fetch)", async () => {
  const seen: any[] = [];
  const f = (async (url: string, init: any = {}) => {
    seen.push([init.method || "GET", url, init.body ? JSON.parse(init.body) : null, init.headers && init.headers["x-bb-api-key"]]);
    if (url.endsWith("/sessions") && init.method === "POST") return new Response(JSON.stringify({ id: "bb-1", connectUrl: "wss://connect.browserbase.com?apiKey=bb-key-test" }));
    if (url.endsWith("/sessions/bb-1/debug")) return new Response(JSON.stringify({ debuggerFullscreenUrl: LIVE_VIEW }));
    return new Response("{}");
  }) as unknown as typeof fetch;
  const b = browserbaseBrowser({ get: (k) => ({ BROWSERBASE_API_KEY: "bb-key-test", BROWSERBASE_PROJECT_ID: "proj-test" } as Record<string, string>)[k] }, f);
  eq(b.configured(), true);
  eq(await b.create(), "bb-1");
  eq(seen[0], ["POST", "https://api.browserbase.com/v1/sessions", { projectId: "proj-test", keepAlive: true }, "bb-key-test"]);
  eq(await b.liveViewUrl("bb-1"), LIVE_VIEW);
  await b.stop("bb-1");
  eq(seen[2].slice(0, 3), ["POST", "https://api.browserbase.com/v1/sessions/bb-1", { projectId: "proj-test", status: "REQUEST_RELEASE" }]);
});

Deno.test("no password storage: a request carrying a password, a code or a login is refused before anything is read, stored or logged", async () => {
  const w = world();
  await w.call({ action: "consent", platform_id: F, accepted: true });
  const before = { calls: w.mb.calls.length, vault: w.sb.vault.size, rows: JSON.stringify(w.sb.rows) };
  for (const extra of [{ password: "hunter2-test-only" }, { otp: "123456" }, { code: "123456" }, { username: "me@example.com" }, { one_time_code: "000000" }, { cookie: "sid=x" }]) {
    const r = await w.call(Object.assign({ action: "start", platform_id: F }, extra));
    eq([r.status, r.body.code], [400, "no_passwords"], JSON.stringify(Object.keys(extra)));
  }
  eq([w.mb.calls.length, w.sb.vault.size, JSON.stringify(w.sb.rows)], [before.calls, before.vault, before.rows], "nothing opened, stored or changed");
  for (const l of w.logs) assert(!/hunter2|123456|000000|me@example\.com/.test(l), l);
  noLeaks(w.logs);
});
