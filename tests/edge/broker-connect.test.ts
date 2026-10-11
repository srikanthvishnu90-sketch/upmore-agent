// Brokerage connect over HTTP: broker-oauth-start and broker-oauth-callback as the edge serves them
// (supabase/functions/_shared/broker_connect.ts). Alpaca's OAuth endpoints are a STUBBED fetch; the database is an
// in-memory stand-in for the RPCs (their SQL is tested in tests/db/brokerage_accounts.test.sql). Nothing reaches Alpaca.
import { connectEnv, handleCallback, handleStart, DEFAULT_APP_URL, type ConnectDb } from "../../supabase/functions/_shared/broker_connect.ts";

const eq = (a: unknown, b: unknown, m?: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m ?? "not equal"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const ENV: Record<string, string> = { ALPACA_OAUTH_CLIENT_ID: "cid-test", ALPACA_OAUTH_CLIENT_SECRET: "csecret-test", SUPABASE_URL: "https://mrwngntwmnaqrqhupvlt.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "srk-test" };
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0);
function mem() {
  const states = new Map<string, any>(), links: any[] = [];
  const db: ConnectDb = {
    createState: async (a) => { states.set(a.nonce_hash, { ...a, used: false }); },
    consumeState: async (a) => { const s = states.get(a.nonce_hash); if (!s || s.used || s.user_id !== a.user_id || s.provider !== a.provider) return false; s.used = true; return true; },
    stage: async (a) => { if (links.some((l) => l.account_id === a.account_id && l.user_id !== a.user_id)) return { ok: false, conflict: true }; links.push(a); return { ok: true, link_id: "11111111-2222-4333-8444-" + String(links.length).padStart(12, "0") }; },
  };
  return { db, states, links };
}
const alpaca = (async (url: string, init: any = {}) => {
  if (url === "https://api.alpaca.markets/oauth/token") { const f = new URLSearchParams(init.body); return new Response(JSON.stringify(f.get("code") === "good" && f.get("client_secret") === "csecret-test" ? { access_token: "tok-live", token_type: "bearer", scope: "trading data" } : { message: "invalid_grant" }), { status: f.get("code") === "good" ? 200 : 401 }); }
  if (url === "https://api.alpaca.markets/v2/account") return init.headers.authorization === "Bearer tok-live" ? new Response(JSON.stringify({ id: "acct-live", account_number: "612345678", status: "ACTIVE" })) : new Response("{}", { status: 401 });
  return new Response("{}", { status: 599 });
}) as unknown as typeof fetch;
const env = connectEnv((k) => ENV[k]);
const startReq = (jwt: string | null, body: unknown = { provider: "alpaca" }) => new Request("https://x/functions/v1/broker-oauth-start", { method: "POST", headers: jwt ? { Authorization: `Bearer ${jwt}`, "content-type": "application/json" } : { "content-type": "application/json" }, body: JSON.stringify(body) });
const users = async (jwt: string) => (jwt === "jwt-a" ? { id: "user-a" } : jwt === "jwt-b" ? { id: "user-b" } : null);

Deno.test("broker-oauth-start: a signed-in person gets the Alpaca approval URL; no JWT, a bad JWT, or missing credentials are refused honestly", async () => {
  eq(env.UPMORE_APP_URL, DEFAULT_APP_URL);
  const m = mem();
  const r = await handleStart(startReq("jwt-a", { provider: "alpaca", user_id: "user-b" }), { env, cors: {}, user: users, db: m.db, now: () => T0 });
  eq(r.status, 200); const j = await r.json(); assert(j.url.startsWith("https://app.alpaca.markets/oauth/authorize?"), j.url);
  eq([...m.states.values()][0].user_id, "user-a", "the person is the JWT's user, never a body field");
  eq((await handleStart(startReq(null), { env, cors: {}, user: users, db: m.db })).status, 401);
  eq((await handleStart(startReq("jwt-forged"), { env, cors: {}, user: users, db: m.db })).status, 401);
  const off = await handleStart(startReq("jwt-a"), { env: connectEnv((k) => (k === "ALPACA_OAUTH_CLIENT_SECRET" ? undefined : ENV[k])), cors: {}, user: users, db: mem().db });
  eq(off.status, 503); eq((await off.json()).code, "not_configured");
  const rh = await handleStart(startReq("jwt-a", { provider: "robinhood" }), { env, cors: {}, user: users, db: mem().db });
  eq(rh.status, 400); eq((await rh.json()).code, "unsupported");
});

Deno.test("broker-oauth-callback: the round trip stages the connection for the state's person and sends the browser to the app to confirm it; a replay, a tampered state and a paper-only token connect nothing", async () => {
  const m = mem();
  const s = await (await handleStart(startReq("jwt-a"), { env, cors: {}, user: users, db: m.db, now: () => T0 })).json();
  const state = new URL(s.url).searchParams.get("state")!;
  const cb = (q: string) => handleCallback(new Request(`https://x/functions/v1/broker-oauth-callback?${q}`), { env, db: m.db, fetch: alpaca, now: () => T0 + 30000 });
  const ok = await cb(`code=good&state=${encodeURIComponent(state)}&user_id=user-b`);
  eq(ok.status, 302); eq(ok.headers.get("location"), `${DEFAULT_APP_URL}/#you?broker=confirm&link=11111111-2222-4333-8444-000000000001`); eq(ok.headers.get("cache-control"), "no-store");
  eq(m.links.length, 1); eq(m.links[0].user_id, "user-a"); eq(m.links[0].account_id, "acct-live"); eq(JSON.parse(m.links[0].token).access_token, "tok-live");
  const again = await cb(`code=good&state=${encodeURIComponent(state)}`);
  eq(again.headers.get("location"), `${DEFAULT_APP_URL}/#you?broker=error&reason=state_used`); eq(m.links.length, 1);
  const forged = await cb(`code=good&state=${encodeURIComponent(state.slice(0, -2) + "xx")}`);
  eq(forged.headers.get("location"), `${DEFAULT_APP_URL}/#you?broker=error&reason=state_invalid`);
  const s2 = await (await handleStart(startReq("jwt-b"), { env, cors: {}, user: users, db: m.db, now: () => T0 })).json();
  const paper = await cb(`code=bad&state=${encodeURIComponent(new URL(s2.url).searchParams.get("state")!)}`);
  eq(paper.headers.get("location"), `${DEFAULT_APP_URL}/#you?broker=error&reason=exchange_failed`); eq(m.links.length, 1);
  for (const r of [ok, again, forged, paper]) assert(!String(r.headers.get("location")).includes("tok-") && !String(r.headers.get("location")).includes("good"), "no token or code in a redirect");
  eq((await handleCallback(new Request("https://x/cb", { method: "POST" }), { env, db: m.db })).status, 405);
});
