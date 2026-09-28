// plaid-sync: "connect once" background sync for Plaid items.
// Runs every 6h via pg_cron (service_role or PLAID_SYNC_SECRET bearer).
// For every vaulted Plaid item (exec_cred_<userId>_plaid):
//   - transactions: incremental /transactions/sync (cursor in plaid_items)
//   - holdings/balances: /investments/holdings/get only when the cache is
//     older than 7 days (founder's COST ARMOR weekly policy stands)
//   - ITEM_LOGIN_REQUIRED / INVALID_ACCESS_TOKEN -> needs_reauth=true and
//     ONE type='plaid_reconnect' reminder (deduped, max 1 per item per 7d)
// Zero connected items -> clean no-op {ok:true, items:0}.
// Raw access tokens are NEVER written to logs or responses.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PLAID_HOSTS: Record<string, string> = {
  production: "https://production.plaid.com",
  development: "https://development.plaid.com",
  sandbox: "https://sandbox.plaid.com",
};
const HOLDINGS_MAX_AGE_MS = 7 * 864e5;   // COST ARMOR: holdings at most weekly
const NUDGE_COOLDOWN_MS = 7 * 864e5;     // max 1 reconnect nudge per item per 7d
const TXN_MAX_PAGES = 3;                 // bound initial-sync work per run
const CAP_CENTS = 300;                   // mirror of the plaid $3.00/mo cap

async function plaidCall(host: string, clientId: string, secret: string, path: string, body: Record<string, unknown>) {
  const res = await fetch(`${host}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const REAUTH_CODES = new Set(["ITEM_LOGIN_REQUIRED", "INVALID_ACCESS_TOKEN"]);
// Product-not-ready is a skip, not an error and never a nudge.
const SKIP_CODES = new Set(["PRODUCT_NOT_READY", "ITEM_PRODUCT_NOT_READY"]);

async function monthSpend(admin: any, userId: string): Promise<number> {
  const { data } = await admin.rpc("plaid_month_spend", { p_user_id: userId });
  return Number(data) || 0;
}

// One reconnect nudge per item per 7 days, deduped against open reminders.
async function maybeNudge(admin: any, userId: string, itemId: string, row: any) {
  if (row?.last_nudge_at && Date.now() - new Date(row.last_nudge_at).getTime() < NUDGE_COOLDOWN_MS) {
    return { nudged: false, reason: "cooldown" };
  }
  const { data: open } = await admin.from("reminders")
    .select("id").eq("user_id", userId).eq("type", "plaid_reconnect")
    .eq("state", "open").limit(1);
  if (open && open.length) return { nudged: false, reason: "already_open" };
  const { error } = await admin.from("reminders").insert({
    user_id: userId,
    type: "plaid_reconnect",
    title: "Reconnect your brokerage",
    evidence: {
      text: "Your brokerage login needs attention — synced data may be out of date. Reconnect to resume automatic sync. Nothing was changed.",
      item_id: itemId,
      kind: "plaid_reconnect",
    },
    state: "open",
  });
  if (error) return { nudged: false, reason: "insert_failed" };
  await admin.from("plaid_items").update({
    last_nudge_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("item_id", itemId);
  return { nudged: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authz = req.headers.get("authorization") || "";
  const scheduleSecret = Deno.env.get("PLAID_SYNC_SECRET") || "";
  const okAuth = authz === `Bearer ${serviceKey}` ||
    (scheduleSecret !== "" && authz === `Bearer ${scheduleSecret}`);
  if (!okAuth) return json({ error: "service_role required" }, 403);

  const admin = createClient(supabaseUrl, serviceKey);
  const dry = new URL(req.url).searchParams.get("dry") === "1"
    || (await req.json().catch(() => ({}))).dry_run === true;

  const clientId = Deno.env.get("PLAID_CLIENT_ID") || "";
  const plaidSecret = Deno.env.get("PLAID_SECRET") || "";
  if (!clientId || !plaidSecret) return json({ ok: false, error: "Plaid not configured" });

  const host = PLAID_HOSTS[(Deno.env.get("PLAID_ENV") || "production").toLowerCase()] || PLAID_HOSTS.production;

  // Enumerate vaulted Plaid access tokens. Names are exec_cred_<userId>_plaid;
  // the token values are read per item below and never logged.
  const listRes = await fetch(
    `${supabaseUrl}/rest/v1/vault_secrets?select=name&name=like.exec_cred_*_plaid`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const names: Array<{ name: string }> = listRes.ok ? await listRes.json().catch(() => []) : [];
  const items: Array<{ userId: string; vaultName: string }> = [];
  for (const n of names) {
    const nm = n?.name || "";
    if (!nm.startsWith("exec_cred_") || !nm.endsWith("_plaid")) continue;
    const userId = nm.slice("exec_cred_".length, -"_plaid".length);
    if (!/^[0-9a-f-]{36}$/i.test(userId)) continue;
    items.push({ userId, vaultName: nm });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const { userId, vaultName } of items) {
    const per: Record<string, unknown> = { user_id: userId };
    try {
      const tokRes = await fetch(
        `${supabaseUrl}/rest/v1/vault_secrets?select=secret&name=eq.${encodeURIComponent(vaultName)}`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      );
      const tokRows = tokRes.ok ? await tokRes.json().catch(() => []) : [];
      const accessToken: string | null = tokRows?.[0]?.secret || null;
      if (!accessToken) { per.skipped = "no_token"; results.push(per); continue; }

      // Canonical item_id (cheap, non-billable).
      let itemId: string | null = null;
      const { data: cacheRow } = await admin.from("plaid_holdings_cache")
        .select("item_id").eq("user_id", userId).maybeSingle();
      itemId = cacheRow?.item_id || null;
      if (!itemId) {
        const ig = await plaidCall(host, clientId, plaidSecret, "/item/get", { access_token: accessToken });
        if (ig.ok && ig.data?.item?.item_id) itemId = String(ig.data.item.item_id);
      }
      if (!itemId) itemId = "default";
      per.item_id = itemId;

      const { data: row } = await admin.from("plaid_items")
        .select("*").eq("user_id", userId).eq("item_id", itemId).maybeSingle();
      if (!row) {
        await admin.from("plaid_items").insert({ user_id: userId, item_id: itemId });
      }

      const fail = async (code: string | null, msg: string) => {
        if (code && REAUTH_CODES.has(code)) {
          if (!dry) {
            await admin.from("plaid_items").update({
              needs_reauth: true, last_sync_error: msg,
              updated_at: new Date().toISOString(),
            }).eq("user_id", userId).eq("item_id", itemId);
            per.nudge = await maybeNudge(admin, userId, itemId, row);
          }
          per.needs_reauth = true;
        } else if (code && SKIP_CODES.has(code)) {
          per.skipped = code;
        } else {
          if (!dry) {
            await admin.from("plaid_items").update({
              last_sync_error: msg,
              consecutive_failures: (row?.consecutive_failures || 0) + 1,
              updated_at: new Date().toISOString(),
            }).eq("user_id", userId).eq("item_id", itemId);
          }
          per.error = msg;
        }
      };

      // Cost guard: when the user is at the $3 cap, skip anything that could
      // bill. (Holdings/get is a monthly item fee, but conservatism is cheap.)
      const spend = await monthSpend(admin, userId);
      if (spend >= CAP_CENTS) {
        per.skipped = "plaid_cap";
        if (!dry) {
          await admin.from("plaid_items").update({
            last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq("user_id", userId).eq("item_id", itemId);
        }
        results.push(per);
        continue;
      }

      // --- Transactions (incremental; every run) ---
      let cursor: string | undefined = row?.txn_cursor || undefined;
      let added = 0, modified = 0, removed = 0, txnErr: string | null = null;
      for (let page = 0; page < TXN_MAX_PAGES; page++) {
        const body: Record<string, unknown> = { access_token: accessToken, count: 100 };
        if (cursor) body.cursor = cursor;
        const tr = await plaidCall(host, clientId, plaidSecret, "/transactions/sync", body);
        if (!tr.ok) {
          const code = tr.data?.error_code || null;
          if (code && (REAUTH_CODES.has(code) || SKIP_CODES.has(code))) {
            await fail(code, tr.data?.error_message || code);
            txnErr = code;
          } else {
            await fail(code, tr.data?.error_message || tr.data?.error_code || `txn_sync ${tr.status}`);
            txnErr = "error";
          }
          break;
        }
        const d: any = tr.data || {};
        if (!dry) {
          const upserts = [...(d.added || []), ...(d.modified || [])].map((t: any) => ({
            user_id: userId, item_id: itemId,
            transaction_id: String(t.transaction_id),
            posted: t.date || null,
            amount: Number(t.amount) || 0,
            merchant_name: t.merchant_name || null,
            merchant_raw: String(t.merchant_name || t.name || "Unknown"),
            pending: !!t.pending,
            category: t.personal_finance_category?.primary || null,
          }));
          if (upserts.length) {
            await admin.from("plaid_txn_cache").upsert(upserts, {
              onConflict: "user_id,item_id,transaction_id",
            });
          }
          const remIds = (d.removed || []).map((t: any) => String(t.transaction_id)).filter(Boolean);
          if (remIds.length) {
            await admin.from("plaid_txn_cache").delete()
              .eq("user_id", userId).eq("item_id", itemId).in("transaction_id", remIds);
          }
        }
        added += (d.added || []).length;
        modified += (d.modified || []).length;
        removed += (d.removed || []).length;
        cursor = d.next_cursor || d.cursor || cursor;
        if (!d.has_more) break;
      }
      if (!txnErr && !dry && cursor && cursor !== row?.txn_cursor) {
        await admin.from("plaid_items").update({
          txn_cursor: cursor, updated_at: new Date().toISOString(),
        }).eq("user_id", userId).eq("item_id", itemId);
      }
      per.txns = { added, modified, removed };

      // --- Holdings/balances (at most weekly per COST ARMOR) ---
      const { data: hcache } = await admin.from("plaid_holdings_cache")
        .select("fetched_at").eq("user_id", userId).maybeSingle();
      const holdingsDue = !hcache?.fetched_at ||
        Date.now() - new Date(hcache.fetched_at).getTime() > HOLDINGS_MAX_AGE_MS;
      if (holdingsDue && !per.needs_reauth) {
        const hr = await plaidCall(host, clientId, plaidSecret, "/investments/holdings/get", {
          access_token: accessToken,
        });
        if (!hr.ok) {
          await fail(hr.data?.error_code || null,
            hr.data?.error_message || hr.data?.error_code || `holdings ${hr.status}`);
        } else if (!dry) {
          const dd: any = hr.data || {};
          const accounts = (dd.accounts || []).map((a: any) => ({
            id: a.account_id, name: a.name, type: a.type, subtype: a.subtype ?? null,
            balances: {
              current: a.balances?.current ?? null,
              available: a.balances?.available ?? null,
              limit: a.balances?.limit ?? null,
              iso_currency_code: a.balances?.iso_currency_code ?? null,
            },
          }));
          const holdings = (dd.holdings || []).map((h: any) => ({
            account_id: h.account_id, security_id: h.security_id, quantity: h.quantity,
            institution_price: h.institution_price, institution_value: h.institution_value,
            cost_basis: h.cost_basis ?? null,
          }));
          const securities = (dd.securities || []).map((s: any) => ({
            security_id: s.security_id, ticker_symbol: s.ticker_symbol ?? null,
            name: s.name ?? null, type: s.type ?? null,
          }));
          await admin.from("plaid_holdings_cache").upsert({
            user_id: userId, item_id: itemId,
            payload: { accounts, holdings, securities },
            fetched_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          per.holdings_refreshed = true;
        }
      } else {
        per.holdings = holdingsDue ? "due_skipped_reauth" : "cached_weekly_policy";
      }

      // Success bookkeeping: a clean run clears a stale reauth flag.
      if (!dry && !per.needs_reauth && !per.error) {
        await admin.from("plaid_items").update({
          needs_reauth: false, last_sync_error: null, consecutive_failures: 0,
          last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("user_id", userId).eq("item_id", itemId);
        per.synced = true;
      }
    } catch (e) {
      per.error = String((e as any)?.message || e).slice(0, 200);
    }
    results.push(per);
  }

  return json({ ok: true, items: items.length, dry_run: dry, results });
});
