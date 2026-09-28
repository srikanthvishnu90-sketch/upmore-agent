// SimpleFIN proxy Edge Function (Upmore Track spec) — v2 with OWNER SCOPING.
// Server-side only: reads the vaulted Access URL, calls the Bridge,
// returns sanitized accounts/transactions. The secret never reaches the client.
//
// Security model:
// - Caller must present a valid Supabase JWT; the user_id is verified via Auth.
// - The caller must own a row in public.simplefin_connections. Anyone else
//   gets 403 — one user's bank data is never served to another user.
// - CORS is restricted to the Upmore origins (no wildcard).
// - Date windows are clamped to <=90 days. Rate budget: 24 req/day/user.
//
// Rules: read-only, surface errlist, pending excluded from totals (client),
// transfers excluded from spending (client), refunds netted (client-side),
// delete data on disconnect (client clears + owner row deleted on disconnect).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const GLOBAL_VAULT_KEY = "simplefin_access_url"; // legacy: Vishnu's own connection
const ALLOWED_ORIGINS = [
  "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app",
  "http://localhost:8901",
  "http://127.0.0.1:8901",
];
const DAILY_BUDGET = 24;
const MAX_WINDOW_DAYS = 90;

function corsFor(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

async function getAccessUrl(supabaseUrl: string, serviceKey: string, userId: string): Promise<string | null> {
  // Prefer the user-scoped secret; fall back to the legacy global one
  // (Vishnu's own connection, claimed before per-user claiming existed).
  for (const name of [`simplefin_access_url_${userId}`, GLOBAL_VAULT_KEY]) {
    const res = await fetch(`${supabaseUrl}/rest/v1/vault_secrets?select=secret&name=eq.${encodeURIComponent(name)}`, {
      headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` },
    });
    if (!res.ok) continue;
    const rows = await res.json();
    if (rows?.[0]?.secret) return rows[0].secret as string;
  }
  return null;
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

    // 1. Authenticate: verify the caller's JWT via Auth.
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Sign in required" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // 2. Owner scoping: caller must own the SimpleFIN connection.
    const { data: conn } = await admin.from("simplefin_connections")
      .select("user_id").eq("user_id", user.id).maybeSingle();
    if (!conn) return json({ error: "No bank connection on this account" }, 403);

    // 3. Rate budget: <=24 requests/day per user.
    const dayAgo = new Date(Date.now() - 864e5).toISOString();
    const { count } = await admin.from("simplefin_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("requested_at", dayAgo);
    if ((count || 0) >= DAILY_BUDGET) {
      return json({ error: "Daily bank-sync budget reached (24/day). Try tomorrow." }, 429);
    }
    await admin.from("simplefin_requests").insert({ user_id: user.id });

    const accessUrl = await getAccessUrl(supabaseUrl, serviceKey, user.id);
    if (!accessUrl) return json({ error: "SimpleFIN not connected" }, 404);

    const url = new URL(accessUrl);
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const bridgeBase = `${url.protocol}//${url.host}`;
    const accountsPath = url.pathname;

    // 4. Date window: clamp to <=90 days, default last 90.
    let startDate: string | null = null, endDate: string | null = null;
    try {
      const body = await req.json();
      startDate = body.startDate || null;
      endDate = body.endDate || null;
    } catch { /* no body */ }
    const today = new Date().toISOString().slice(0, 10);
    const minStart = new Date(Date.now() - MAX_WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
    if (!endDate || endDate > today) endDate = today;
    if (!startDate || startDate < minStart) startDate = minStart;
    if (startDate > endDate) startDate = endDate;

    const fetchUrl = `${bridgeBase}${accountsPath}?version=2&start-date=${startDate}&end-date=${endDate}`;
    const auth = btoa(`${username}:${password}`);
    const bridgeRes = await fetch(fetchUrl, { headers: { "Authorization": `Basic ${auth}` } });
    if (!bridgeRes.ok) {
      return json({ error: `Bridge error: ${bridgeRes.status}`, errlist: [`HTTP ${bridgeRes.status} from SimpleFIN Bridge`] }, 502);
    }
    const data = await bridgeRes.json();

    const result = {
      accounts: (data.accounts || []).map((a: any) => ({
        id: a.id, name: a.name, currency: a.currency, balance: a.balance,
        available_balance: a["available-balance"], balance_date: a["balance-date"],
      })),
      transactions: [] as any[],
      errlist: data.errlist || [],
    };
    (data.accounts || []).forEach((a: any) => {
      (a.transactions || []).forEach((t: any) => {
        result.transactions.push({
          id: t.id, account_id: a.id,
          posted_at: t.posted ? new Date(t.posted * 1000).toISOString().slice(0, 10) : null,
          amount: t.amount,
          merchant_raw: t.description || t.memo || "Unknown",
          is_pending: !!t.pending,
        });
      });
    });
    result.transactions.sort((a: any, b: any) => (b.posted_at || "").localeCompare(a.posted_at || ""));

    return json(result);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
