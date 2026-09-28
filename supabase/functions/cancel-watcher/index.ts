// cancel-watcher: server-side billing-cycle confirmation for cancel claims.
// Runs on a schedule (or on demand). For each open cancel_claim past its
// expected billing date + grace period, it checks the user's synced SimpleFIN
// transactions for a charge from that merchant:
//   - no charge found  -> claim confirmed; action_ledger gets an "Avoided"
//     entry; subscription stays cancel_claimed (honest: claimed, not cancelled)
//   - zombie charge    -> action_ledger gets an offsetting reversal entry;
//     claim marked zombie; subscription re-queued to active with honest copy.
// The ledger never shows a dollar before confirmation.
//
// Auth: service_role only (scheduled job / admin). Never expose to clients.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function normalizeMerchant(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

// A transaction matches the merchant if the normalized descriptor contains
// the merchant key (or vice versa) — statement descriptors are noisy.
function txnMatchesMerchant(txnDesc: string, merchantKey: string, merchantName: string): boolean {
  const d = normalizeMerchant(txnDesc);
  const k = normalizeMerchant(merchantKey);
  const n = normalizeMerchant(merchantName);
  if (!d || (!k && !n)) return false;
  const tokens = (k || n).split(" ").filter((t) => t.length > 2);
  if (!tokens.length) return false;
  // Require at least the first significant token to appear in the descriptor.
  return tokens.some((t) => d.includes(t)) && d.includes(tokens[0]);
}

async function readVaultSecret(name: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/vault_secrets?select=secret&name=eq.${encodeURIComponent(name)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.secret ?? null;
}

async function fetchTransactions(userId: string): Promise<Array<{ posted_at: string | null; amount: number; merchant_raw: string }>> {
  // Same pattern as simplefin-proxy: per-user secret first, then the legacy
  // global key. The watcher runs as service_role so it can read the vault.
  const accessUrl = (await readVaultSecret(`simplefin_access_url_${userId}`))
    || (await readVaultSecret("simplefin_access_url"));
  if (!accessUrl) return [];
  const m = String(accessUrl).match(/^https?:\/\/([^:]+):([^@]+)@(.+)$/);
  if (!m) return [];
  const [, username, password, base] = m;
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
  const url = `${base}/accounts?version=2&start-date=${startDate}&end-date=${endDate}`;
  const auth = btoa(`${username}:${password}`);
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) return [];
  const data = await res.json();
  const txns: Array<{ posted_at: string | null; amount: number; merchant_raw: string }> = [];
  for (const a of data.accounts || []) {
    for (const t of a.transactions || []) {
      txns.push({
        posted_at: t.posted ? new Date(t.posted * 1000).toISOString().slice(0, 10) : null,
        amount: Number(t.amount) || 0,
        merchant_raw: String(t.description || t.memo || "Unknown"),
      });
    }
  }
  return txns;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authz = req.headers.get("authorization") || "";
  // Service-role only (scheduled job / admin). Accepts the service key or a
  // dedicated CANCEL_WATCHER_SECRET (for pg_cron, which must not hold the
  // service key). Never a user JWT.
  const scheduleSecret = Deno.env.get("CANCEL_WATCHER_SECRET") || "";
  const okAuth = authz === `Bearer ${serviceKey}` ||
    (scheduleSecret !== "" && authz === `Bearer ${scheduleSecret}`);
  if (!okAuth) {
    return json({ error: "service_role required" }, 403);
  }
  const admin = createClient(supabaseUrl, serviceKey);
  const today = new Date().toISOString().slice(0, 10);
  const dryRun = new URL(req.url).searchParams.get("dry") === "1"
    || (await req.json().catch(() => ({}))).dry_run === true;

  // Open claims whose expected billing date + grace has passed.
  const { data: claims, error } = await admin.from("cancel_claims")
    .select("*").eq("status", "open");
  if (error) return json({ error: "claim query failed" }, 500);
  const due = (claims || []).filter((c: any) => {
    const deadline = new Date(new Date(c.expected_billing_date).getTime() + (c.grace_days || 2) * 864e5)
      .toISOString().slice(0, 10);
    return deadline < today;
  });

  const results: Array<Record<string, unknown>> = [];
  // Cache transactions per user (one SimpleFIN fetch per user per run).
  const txnCache = new Map<string, Array<{ posted_at: string | null; amount: number; merchant_raw: string }>>();
  for (const claim of due) {
    const userId = claim.user_id as string;
    if (!txnCache.has(userId)) {
      txnCache.set(userId, await fetchTransactions(userId));
    }
    const txns = txnCache.get(userId)!;
    const windowStart = new Date(new Date(claim.expected_billing_date).getTime() - 5 * 864e5)
      .toISOString().slice(0, 10);
    const hits = txns.filter((t) =>
      t.posted_at && t.posted_at >= windowStart && t.posted_at <= today &&
      txnMatchesMerchant(t.merchant_raw, claim.merchant_key || "", claim.merchant || "")
    );
    // Only count charges (money out). Refunds/credits are negative in
    // SimpleFIN's sign convention for debits... SimpleFIN amounts are
    // negative for debits. A zombie charge is a debit from the merchant.
    const charges = hits.filter((t) => t.amount < 0);

    if (charges.length === 0) {
      // CONFIRMED: the bill came and went with no charge.
      if (!dryRun) {
        await admin.from("action_ledger").insert({
          user_id: userId,
          action: "cancel_confirmed",
          amount: claim.amount ?? null,
          outcome: "confirmed",
          evidence: {
            kind: "Avoided",
            title: `Cancellation confirmed — ${claim.merchant}`,
            body: `No ${claim.merchant} charge appeared on your ${claim.expected_billing_date} bill (checked through ${today}).`,
            claim_id: claim.id, merchant: claim.merchant,
            run_id: claim.run_id, source: "cancel_watcher",
          },
        });
        await admin.from("cancel_claims").update({
          status: "confirmed", resolved_at: new Date().toISOString(),
        }).eq("id", claim.id);
      }
      results.push({ claim_id: claim.id, merchant: claim.merchant, outcome: "confirmed", dryRun });
    } else {
      // ZOMBIE: they charged anyway. Reversal entry + re-queue, honest copy.
      const charge = charges[0];
      if (!dryRun) {
        await admin.from("action_ledger").insert({
          user_id: userId,
          action: "cancel_zombie_charge",
          amount: -Math.abs(charge.amount),
          outcome: "zombie",
          evidence: {
            kind: "Reversal",
            title: `Charged anyway — ${claim.merchant}`,
            body: `${claim.merchant} charged ${fmtMoney(Math.abs(charge.amount))} on ${charge.posted_at} despite the cancellation. The card is back on your watch list.`,
            claim_id: claim.id, merchant: claim.merchant,
            run_id: claim.run_id, source: "cancel_watcher",
            zombie_charge: charge,
          },
        });
        await admin.from("cancel_claims").update({
          status: "zombie", resolved_at: new Date().toISOString(),
        }).eq("id", claim.id);
        if (claim.subscription_id) {
          await admin.from("save_subscriptions").update({
            status: "active", updated_at: new Date().toISOString(),
          }).eq("id", claim.subscription_id).eq("user_id", userId);
        }
      }
      results.push({ claim_id: claim.id, merchant: claim.merchant, outcome: "zombie", charge, dryRun });
    }
  }
  return json({ ok: true, checked: due.length, results });
});

function fmtMoney(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "money";
  return "$" + v.toFixed(2).replace(/\.00$/, "");
}
