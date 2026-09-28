// Upmore plaid edge function — server-side Plaid integration (read-only).
// Actions via POST JSON {action, ...}:
//   status      -> {plaid_configured, connected, month_spend_cents, cap_cents,
//                   capped, last_updated, next_manual_refresh_at}
//   link_token  -> {link_token} (503 honest error if PLAID_CLIENT_ID/PLAID_SECRET missing)
//   exchange    -> {public_token} -> stores access token in Vault -> {connected: true}
//   holdings    -> sanitized {accounts, holdings, securities} (+ cached flags);
//                  202 {retry:true} if PRODUCT_NOT_READY
//   refresh     -> on-demand /investments/refresh (add-on) + fresh holdings
//   disconnect  -> deletes the vault token -> {connected: false}
//
// COST ARMOR 2026-09-27 (founder order): the server is the authority on Plaid
// spend. Pricing (pay-as-you-go): Investments Holdings $0.18/item/month,
// Investments Refresh $0.12/successful call. (Investments Transactions
// $0.35/item/month is NOT consumed — Upmore only calls /investments/holdings/get.)
// Policy:
//   - Auto holdings refresh: at most weekly per item (cache served otherwise).
//   - Manual refresh (action=refresh): max 1 per item per 24h -> 429
//     {error:"refresh_cooldown", retry_after_seconds} otherwise.
//   - Hard per-user cap: $3.00/month. Over cap -> 429 {error:"plaid_cap",
//     cached:true} and last cached holdings are served.
//   - Every billable event writes to plaid_spend_ledger. Monthly item fees
//     accrue once per item per calendar month on the first holdings call.
//   - Founder alert: any user crossing 80% of cap -> founder_alerts row
//     (kind=plaid_cap_warning), once per user per month.
//
// Security model:
// - Caller must present a valid Supabase JWT (401 otherwise).
// - Vault token name is exec_cred_<user.id>_plaid. NOTE: the existing
//   exec_vault_store / exec_vault_delete RPCs enforce the exec_cred_% prefix,
//   so a literal "plaid_access_token_<id>" name is rejected by the RPC — the
//   exec_cred_<user.id>_plaid name follows the established vault convention.
// - The access token never reaches the client; holdings are sanitized.
// - CORS restricted to the Upmore origins (no wildcard).
// - Rate budget: 24 requests/day/user (public.plaid_requests).
// - Read-only: only Plaid Investments product (holdings, balances). Upmore
//   never moves money.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const ALLOWED_ORIGINS = [
  "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app",
  "http://localhost:8901",
  "http://127.0.0.1:8901",
];
const DAILY_BUDGET = 24;
const PLAID_HOSTS: Record<string, string> = {
  production: "https://production.plaid.com",
  development: "https://development.plaid.com",
  sandbox: "https://sandbox.plaid.com",
};

// COST ARMOR 2026-09-27: Plaid spend governor policy numbers.
const PLAID_MONTHLY_CAP_CENTS = 300;   // $3.00 hard cap per user per month
const PLAID_CAP_WARN_CENTS = 240;      // 80% of cap -> founder_alerts row
const HOLDINGS_ITEM_CENTS = 18;        // $0.18/item/month (Investments Holdings)
const REFRESH_CALL_CENTS = 12;         // $0.12/successful on-demand refresh call
const AUTO_REFRESH_MS = 7 * 864e5;     // auto holdings refresh at most weekly
const MANUAL_REFRESH_MS = 24 * 3600e3; // manual refresh max 1 per 24h

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

const vaultName = (userId: string) => `exec_cred_${userId}_plaid`;

async function getVaultSecret(supabaseUrl: string, serviceKey: string, name: string): Promise<string | null> {
  const res = await fetch(`${supabaseUrl}/rest/v1/vault_secrets?select=secret&name=eq.${name}`, {
    headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` },
  });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => null);
  const s = rows?.[0]?.secret;
  return (typeof s === "string" && s.length > 0) ? s : null;
}

async function plaidCall(host: string, clientId: string, secret: string, path: string, body: Record<string, unknown>) {
  const res = await fetch(`${host}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ---- COST ARMOR: spend ledger helpers (server is the authority) ----
const periodMonth = () => new Date().toISOString().slice(0, 7); // YYYY-MM

async function monthSpend(admin: any, userId: string): Promise<number> {
  const { data } = await admin.rpc("plaid_month_spend", { p_user_id: userId });
  return Number(data) || 0;
}

async function getCache(admin: any, userId: string) {
  const { data } = await admin.from("plaid_holdings_cache")
    .select("payload, fetched_at, item_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data || null;
}

// Monthly item fee: accrue once per item per calendar month (idempotent —
// the partial unique index is the backstop against races).
async function accrueItemMonth(admin: any, userId: string, itemId: string) {
  const pm = periodMonth();
  const { data: existing } = await admin.from("plaid_spend_ledger")
    .select("id").eq("user_id", userId).eq("item_id", itemId)
    .eq("kind", "item_month").eq("period_month", pm).limit(1);
  if (existing && existing.length) return;
  const { error } = await admin.from("plaid_spend_ledger").insert({
    user_id: userId, item_id: itemId, kind: "item_month",
    cost_cents: HOLDINGS_ITEM_CENTS, period_month: pm,
  });
  // Unique-violation means a concurrent call won the race — not an error.
  if (error && !/duplicate|unique/i.test(error.message || "")) {
    console.error("plaid: item_month accrual failed:", error.message);
  }
}

// When the next manual refresh is allowed (ISO) or null if allowed now.
async function nextManualRefreshAt(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin.from("plaid_spend_ledger")
    .select("created_at").eq("user_id", userId).eq("kind", "refresh")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const next = new Date(new Date(data.created_at).getTime() + MANUAL_REFRESH_MS);
  return next.getTime() > Date.now() ? next.toISOString() : null;
}

// Founder alert at 80% of cap — once per user per month.
async function maybePlaidCapAlert(admin: any, userId: string, spendCents: number) {
  if (spendCents < PLAID_CAP_WARN_CENTS) return;
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin.from("founder_alerts")
    .select("id", { count: "exact", head: true })
    .eq("kind", "plaid_cap_warning").eq("user_id", userId)
    .gte("created_at", monthStart.toISOString());
  if (!count) {
    await admin.from("founder_alerts").insert({
      kind: "plaid_cap_warning",
      user_id: userId,
      detail: { user_id: userId, month_spend_cents: spendCents, cap_cents: PLAID_MONTHLY_CAP_CENTS },
    });
  }
}

function sanitizeHoldings(data: any) {
  const accounts = (data.accounts || []).map((a: any) => ({
    id: a.account_id,
    name: a.name,
    type: a.type,
    subtype: a.subtype ?? null,
    balances: {
      current: a.balances?.current ?? null,
      available: a.balances?.available ?? null,
      limit: a.balances?.limit ?? null,
      iso_currency_code: a.balances?.iso_currency_code ?? null,
    },
  }));
  const holdings = (data.holdings || []).map((h: any) => ({
    account_id: h.account_id,
    security_id: h.security_id,
    quantity: h.quantity,
    institution_price: h.institution_price,
    institution_value: h.institution_value,
    cost_basis: h.cost_basis ?? null,
  }));
  const securities = (data.securities || []).map((s: any) => ({
    security_id: s.security_id,
    ticker_symbol: s.ticker_symbol ?? null,
    name: s.name ?? null,
    type: s.type ?? null,
  }));
  return { accounts, holdings, securities };
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
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Sign in required" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "Invalid session" }, 401);
    const admin = createClient(supabaseUrl, serviceKey);

    const { action, ...params } = await req.json().catch(() => ({}));

    // 2. Rate budget: <=24 requests/day per user.
    const dayAgo = new Date(Date.now() - 864e5).toISOString();
    const { count } = await admin.from("plaid_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("requested_at", dayAgo);
    if ((count || 0) >= DAILY_BUDGET) {
      return json({ error: "Daily Plaid budget reached (24/day). Try tomorrow." }, 429);
    }
    await admin.from("plaid_requests").insert({ user_id: user.id });

    const clientId = Deno.env.get("PLAID_CLIENT_ID") || "";
    const plaidSecret = Deno.env.get("PLAID_SECRET") || "";
    const plaidEnv = (Deno.env.get("PLAID_ENV") || "production").toLowerCase();
    const host = PLAID_HOSTS[plaidEnv] || PLAID_HOSTS.production;
    const plaidConfigured = !!(clientId && plaidSecret);
    const name = vaultName(user.id);

    if (action === "status") {
      const token = await getVaultSecret(supabaseUrl, serviceKey, name);
      const spend = await monthSpend(admin, user.id);
      const cache = await getCache(admin, user.id);
      const nextManual = await nextManualRefreshAt(admin, user.id);
      return json({
        plaid_configured: plaidConfigured,
        connected: !!token,
        month_spend_cents: spend,
        cap_cents: PLAID_MONTHLY_CAP_CENTS,
        capped: spend >= PLAID_MONTHLY_CAP_CENTS,
        last_updated: cache?.fetched_at || null,
        next_manual_refresh_at: nextManual,
      });
    }

    if (action === "link_token") {
      if (!plaidConfigured) return json({ error: "Plaid not configured yet", plaid_configured: false }, 503);
      const { ok, data } = await plaidCall(host, clientId, plaidSecret, "/link/token/create", {
        client_name: "Upmore",
        products: ["investments"],
        country_codes: ["US"],
        language: "en",
        user: { client_user_id: user.id },
      });
      if (!ok || !data.link_token) {
        return json({ error: data?.error_message || data?.error_code || "Link token creation failed" }, 502);
      }
      return json({ link_token: data.link_token });
    }

    if (action === "exchange") {
      if (!plaidConfigured) return json({ error: "Plaid not configured yet", plaid_configured: false }, 503);
      const publicToken = String(params.public_token || "");
      if (!publicToken) return json({ error: "public_token required" }, 400);
      const { ok, data } = await plaidCall(host, clientId, plaidSecret, "/item/public_token/exchange", {
        public_token: publicToken,
      });
      if (!ok || !data.access_token) {
        return json({ error: data?.error_message || data?.error_code || "Token exchange failed" }, 502);
      }
      const { error: verr } = await admin.rpc("exec_vault_store", {
        p_name: name,
        p_secret: String(data.access_token),
      });
      if (verr) return json({ error: "Could not save connection" }, 500);
      // Remember the Plaid item_id for spend-ledger granularity (one item per
      // user in the current vault scheme; "default" for legacy connections).
      try {
        const itemId = String(data.item_id || "default");
        const { data: existingCache } = await admin.from("plaid_holdings_cache")
          .select("payload").eq("user_id", user.id).maybeSingle();
        await admin.from("plaid_holdings_cache").upsert({
          user_id: user.id,
          item_id: itemId,
          payload: existingCache?.payload || { accounts: [], holdings: [], securities: [] },
          ...(existingCache ? {} : { fetched_at: new Date(0).toISOString() }),
        }, { onConflict: "user_id" });
      } catch (_) { /* item tracking must never break connect */ }
      return json({ connected: true });
    }

    // Auto path: governed by the weekly policy. Manual on-demand refresh is
    // the separate "refresh" action below.
    if (action === "holdings") {
      if (!plaidConfigured) return json({ error: "Plaid not configured yet", plaid_configured: false }, 503);
      const accessToken = await getVaultSecret(supabaseUrl, serviceKey, name);
      if (!accessToken) return json({ error: "Plaid not connected" }, 404);
      const cache = await getCache(admin, user.id);
      const itemId = cache?.item_id || "default";

      // Monthly item fee accrues once per item per calendar month, on the
      // first holdings call of the month (even if we serve cache below).
      await accrueItemMonth(admin, user.id, itemId);

      // Hard cap: serve last cached holdings, never hit Plaid.
      const spend = await monthSpend(admin, user.id);
      if (spend >= PLAID_MONTHLY_CAP_CENTS) {
        const p = cache?.payload || { accounts: [], holdings: [], securities: [] };
        return json({
          error: "plaid_cap", cached: true,
          accounts: p.accounts || [], holdings: p.holdings || [], securities: p.securities || [],
          last_updated: cache?.fetched_at || null,
          month_spend_cents: spend, cap_cents: PLAID_MONTHLY_CAP_CENTS,
        }, 429);
      }

      // Weekly auto policy: serve cache if fresh.
      if (cache && cache.fetched_at &&
          Date.now() - new Date(cache.fetched_at).getTime() < AUTO_REFRESH_MS) {
        const p = cache.payload || { accounts: [], holdings: [], securities: [] };
        return json({
          accounts: p.accounts || [], holdings: p.holdings || [], securities: p.securities || [],
          cached: true, last_updated: cache.fetched_at,
        });
      }

      const { ok, data } = await plaidCall(host, clientId, plaidSecret, "/investments/holdings/get", {
        access_token: accessToken,
      });
      if (!ok) {
        // Holdings not ready yet — not an error; client should retry later.
        if (data?.error_code === "PRODUCT_NOT_READY") return json({ retry: true }, 202);
        return json({ error: data?.error_message || data?.error_code || "Holdings fetch failed" }, 502);
      }
      const clean = sanitizeHoldings(data);
      const nowIso = new Date().toISOString();
      await admin.from("plaid_holdings_cache").upsert({
        user_id: user.id, item_id: itemId, payload: clean, fetched_at: nowIso,
      }, { onConflict: "user_id" });
      return json({ ...clean, cached: false, last_updated: nowIso });
    }

    // Manual on-demand refresh: Plaid's /investments/refresh add-on
    // ($0.12/successful call). Max 1 per item per 24h. The refresh itself is
    // asynchronous — we return the latest holdings right away with
    // refreshed:true; Plaid lands new prices shortly after.
    if (action === "refresh") {
      if (!plaidConfigured) return json({ error: "Plaid not configured yet", plaid_configured: false }, 503);
      const accessToken = await getVaultSecret(supabaseUrl, serviceKey, name);
      if (!accessToken) return json({ error: "Plaid not connected" }, 404);
      const cache = await getCache(admin, user.id);
      const itemId = cache?.item_id || "default";
      const emptyPayload = { accounts: [], holdings: [], securities: [] };
      const cachedPayload = cache?.payload || emptyPayload;

      // Hard cap: no billable calls; serve cache.
      const spend = await monthSpend(admin, user.id);
      if (spend >= PLAID_MONTHLY_CAP_CENTS) {
        return json({
          error: "plaid_cap", cached: true,
          accounts: cachedPayload.accounts || [], holdings: cachedPayload.holdings || [],
          securities: cachedPayload.securities || [],
          last_updated: cache?.fetched_at || null,
          month_spend_cents: spend, cap_cents: PLAID_MONTHLY_CAP_CENTS,
        }, 429);
      }

      // 24h manual cooldown.
      const nextAt = await nextManualRefreshAt(admin, user.id);
      if (nextAt) {
        const retryAfter = Math.max(1, Math.ceil((new Date(nextAt).getTime() - Date.now()) / 1000));
        return json({
          error: "refresh_cooldown",
          retry_after_seconds: retryAfter,
          next_refresh_at: nextAt,
        }, 429);
      }

      const r = await plaidCall(host, clientId, plaidSecret, "/investments/refresh", {
        access_token: accessToken,
      });
      if (!r.ok) {
        return json({ error: r.data?.error_message || r.data?.error_code || "Refresh request failed" }, 502);
      }

      // Successful call = billable. Record BEFORE fetching holdings so the
      // spend is never lost if the fetch below fails.
      await admin.from("plaid_spend_ledger").insert({
        user_id: user.id, item_id: itemId, kind: "refresh",
        cost_cents: REFRESH_CALL_CENTS, period_month: periodMonth(),
      });
      await maybePlaidCapAlert(admin, user.id, spend + REFRESH_CALL_CENTS);

      const { ok, data } = await plaidCall(host, clientId, plaidSecret, "/investments/holdings/get", {
        access_token: accessToken,
      });
      if (!ok) {
        if (data?.error_code === "PRODUCT_NOT_READY") return json({ retry: true, refreshed: true }, 202);
        return json({ error: data?.error_message || data?.error_code || "Holdings fetch failed", refreshed: true }, 502);
      }
      const clean = sanitizeHoldings(data);
      const nowIso = new Date().toISOString();
      await admin.from("plaid_holdings_cache").upsert({
        user_id: user.id, item_id: itemId, payload: clean, fetched_at: nowIso,
      }, { onConflict: "user_id" });
      return json({ ...clean, refreshed: true, cached: false, last_updated: nowIso });
    }

    if (action === "disconnect") {
      const { error: derr } = await admin.rpc("exec_vault_delete", { p_name: name });
      if (derr) return json({ error: "Could not remove connection" }, 500);
      return json({ connected: false });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
