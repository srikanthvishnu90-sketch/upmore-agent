// Win-back watch in chat (overnight D4, Methods 3 M3-SUBS-09): the person pastes a "come back" email from a service
// they cancelled. The sender is checked against the service's domain on file (the researched cancel catalog,
// agent-exec/merchant-catalog.ts), the offer is quoted from the email as it states it, and the regular price is the
// person's own last charge before they cancelled (packages/domain/89-win-back.js). Resubscribing is their call: nothing
// here signs anyone up or opens a link. Pure apart from the injected readers; rows and cancellation records are read
// only for a message that is a pasted offer.
import { WinBack } from "../../_shared/router_core.js";
import { playbookRegistry } from "../../agent-exec/merchant-catalog.ts";
import type { TxRow } from "./direct_answers.ts";

// Each catalog service's domain: the host of its own account page, without "www." and down to the registered name
// ("www.disneyplus.com" -> "disneyplus.com"). Only services WinBack knows are ever looked up.
export function serviceDomains(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of Object.values(playbookRegistry as Record<string, any>)) {
    try {
      const host = new URL(String(p.account_url)).hostname.toLowerCase().replace(/^www\./, "");
      out[String(p.merchant_key)] = host.split(".").slice(-2).join(".");
    } catch { /* an entry without a readable page has no domain on file */ }
  }
  return out;
}
const DOMAINS = serviceDomains();

export async function winBackReply(message: string, today: string, readTx: () => Promise<TxRow[]>, readCancellations: () => Promise<any[] | null>): Promise<string | null> {
  const kind = WinBack.kind(message, DOMAINS);
  if (!kind) return null;
  if (kind === "ask") return WinBack.answer({ message, today, transactions: [], cancellations: [], domains: DOMAINS });
  const [transactions, cancellations] = await Promise.all([readTx(), readCancellations()]);
  return WinBack.answer({ message, today, transactions, cancellations, domains: DOMAINS });
}

// Every cancellation the cancel flow recorded for this person, across their threads (agent_flow_state, RLS: own rows
// only). An unreadable table is null, which the answer says plainly instead of claiming there is no record.
export async function readCancellations(supabase: any, userId: string): Promise<any[] | null> {
  const r = await supabase.from("agent_flow_state").select("state").eq("user_id", userId).limit(500);
  if (r.error) return null;
  const out: any[] = [];
  for (const row of r.data || []) {
    const cases = row && row.state && row.state.cancel && Array.isArray(row.state.cancel.cases) ? row.state.cancel.cases : [];
    for (const c of cases) if (c && typeof c === "object") out.push({ merchant: c.merchant, name: c.name, state: c.state, cancelled_at: c.cancelled_at, claim: c.claim ? { created_at: c.claim.created_at } : null, reference: c.reference || null });
  }
  return out;
}
