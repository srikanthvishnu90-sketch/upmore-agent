// Brokerage connect, the HTTP side (packages/domain/74-broker-connect.js holds the logic and is bundled in router_core).
//   broker-oauth-start     POST, signed-in (verify_jwt on): { provider } -> { url } to send the person to the broker's own
//                          approval page. The person is the verified JWT's user, never a body field.
//   broker-oauth-callback  GET, public (verify_jwt off: the broker redirects a browser here with no Upmore JWT):
//                          ?code&state -> 302 back to the app's You screen with #you?broker=confirm&link=<one-time id>
//                          (the app confirms it with the signed-in person's own session: broker_confirm_link) or
//                          #you?broker=error&reason=<code>.
//                          The person is the one in the signed, single-use state. The destination is UPMORE_APP_URL (or
//                          the deployed app), never anything in the query string.
// Secrets (ALPACA_OAUTH_CLIENT_ID, ALPACA_OAUTH_CLIENT_SECRET, the state key) stay in this process; no token, code or
// secret is logged, put in a URL, or returned.
import { BrokerConnect } from "./router_core.js";

export const DEFAULT_APP_URL = "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app";
const KEYS = ["ALPACA_OAUTH_CLIENT_ID", "ALPACA_OAUTH_CLIENT_SECRET", "BROKER_OAUTH_STATE_SECRET", "BROKER_OAUTH_REDIRECT_URI", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "UPMORE_APP_URL"];
export function connectEnv(get: (k: string) => string | undefined): Record<string, string | undefined> {
  const e: Record<string, string | undefined> = {};
  for (const k of KEYS) e[k] = get(k);
  if (!e.UPMORE_APP_URL) e.UPMORE_APP_URL = DEFAULT_APP_URL;
  return e;
}

export interface ConnectDb {
  createState(a: { user_id: string; provider: string; nonce_hash: string; expires_at: string }): Promise<void>;
  consumeState(a: { user_id: string; provider: string; nonce_hash: string }): Promise<boolean>;
  stage(a: { user_id: string; provider: string; account_id: string; account_mask: string | null; scope: string | null; token: string }): Promise<{ ok: boolean; conflict?: boolean; link_id?: string }>;
}
export function connectDb(admin: any): ConnectDb {
  return {
    createState: async (a) => {
      const r = await admin.rpc("broker_state_create", { p_user: a.user_id, p_provider: a.provider, p_nonce_hash: a.nonce_hash, p_expires_at: a.expires_at });
      if (r.error) throw new Error("connect attempt could not be saved");
    },
    consumeState: async (a) => {
      const r = await admin.rpc("broker_state_consume", { p_user: a.user_id, p_provider: a.provider, p_nonce_hash: a.nonce_hash });
      return !r.error && r.data === true;
    },
    stage: async (a) => {
      const r = await admin.rpc("broker_stage_link", { p_user: a.user_id, p_provider: a.provider, p_account_id: a.account_id, p_account_mask: a.account_mask, p_scope: a.scope, p_token: a.token });
      if (r.error) return { ok: false, conflict: /account_connected_to_another_user/.test(String(r.error.message || "")) };
      return typeof r.data === "string" && r.data ? { ok: true, link_id: r.data } : { ok: false };
    },
  };
}

const json = (headers: Record<string, string>, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json" } });

export async function handleStart(req: Request, deps: { env: Record<string, string | undefined>; cors: Record<string, string>; user: (jwt: string) => Promise<{ id: string } | null>; db: ConnectDb; now?: () => number }): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: deps.cors });
  if (req.method !== "POST") return json(deps.cors, { error: "method" }, 405);
  const m = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const user = m ? await deps.user(m[1]).catch(() => null) : null;
  if (!user) return json(deps.cors, { error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const r: any = await BrokerConnect.start({ user_id: user.id, provider: typeof body.provider === "string" ? body.provider : "alpaca", env: deps.env, db: deps.db, now: deps.now ? deps.now() : Date.now() }).catch(() => ({ ok: false, code: "error", message: "I couldn't start the connection. Nothing was connected; try again." }));
  if (!r.ok) return json(deps.cors, { ok: false, code: r.code, message: r.message }, r.code === "unauthenticated" ? 401 : r.code === "not_configured" ? 503 : 400);
  return json(deps.cors, { ok: true, url: r.url });
}

export async function handleCallback(req: Request, deps: { env: Record<string, string | undefined>; db: ConnectDb; fetch?: typeof fetch; now?: () => number; log?: (l: string) => void }): Promise<Response> {
  if (req.method !== "GET") return new Response("method", { status: 405 });
  const u = new URL(req.url), q: Record<string, string> = {};
  for (const k of ["code", "state", "error"]) { const v = u.searchParams.get(k); if (v !== null) q[k] = v; }
  const r = await BrokerConnect.callback({ query: q, env: deps.env, db: deps.db, fetch: deps.fetch, now: deps.now ? deps.now() : Date.now(), log: deps.log });
  const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
  if (r.redirect) return new Response(null, { status: 302, headers: { ...headers, location: r.redirect } });
  return new Response(r.message, { status: r.outcome === "connected" ? 200 : 400, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
}
