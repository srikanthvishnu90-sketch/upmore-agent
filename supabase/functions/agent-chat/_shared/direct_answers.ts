// Answers the chat gives from code, not from the model, for asks the live gauntlet (2026-10-12) showed the model getting
// wrong or the flows not covering:
//   - "connect my fidelity": the model invented app steps (S16-19). Now the connector matrix answers: a live connect link,
//     the read-only Plaid path, a fallback while trading waits on approval, not built yet, off, or can't connect.
//   - "pay my rent": got "How much?". A standing rent payment is not built (Phase 3), said plainly with what works today.
//   - "find me money": the model's answer was swapped for a dispute fallback (S16-18). Now the save engine reads the
//     person's own transactions and ranks what it finds, every number from their rows, with the source and as-of date.
//   - balance and spending with nothing linked: the planner's fallback spoke in internal terms ("retained USD posted
//     records"). Now one plain line says nothing is connected and how to connect it.
// Pure apart from the injected readers, so tests/edge/direct-answers.test.ts drives them with fixtures.
import { BrokerageConnectors, PLATFORMS_JSON, ConnectCards, AgentSave } from "../../_shared/router_core.js";

const CONNECT_EMAIL = /^\s*(?:please |pls |can you |could you |can u )?(?:connect|link|add|hook up|sync|set up)\s+(?:my\s+)?(?:gmail|google mail|email|inbox)\b/i;

export function connectReply(message: string): string | null {
  if (CONNECT_EMAIL.test(message)) return ConnectCards.message("gmail");
  const a = BrokerageConnectors.connectAnswer(PLATFORMS_JSON, message);
  if (!a) return null;
  return a.card ? ConnectCards.message(a.card, { lead: a.text }) : a.text;
}

const RENT = /^\s*(?:please |pls |can you |could you |can u )?pay (?:my |the |this month'?s )?rent\b(?!.*\b(?:to|for)\s+@?[a-z]+\s+\$?\d)/i;
export const RENT_NOT_BUILT =
  "Paying rent from Upmore isn't built yet, so nothing was set up. If your landlord takes Venmo or Zelle, say \"send <name> <amount> for rent\" and I'll set it up for you to send.";
export function rentReply(message: string): string | null {
  return RENT.test(message) ? RENT_NOT_BUILT : null;
}

export const NO_ACCOUNTS =
  "I don't see a connected bank or card yet, so I can't answer that from your own numbers. Connect one in the app (Home, then Connect bank) and ask again.";
const BALANCE_OR_SPEND = /\b(balance|how much (?:money )?(?:do i have|did i spend|have i spent)|what did i spend|spent on|spending|how am i doing|cash flow|net worth|did (?:my )?rent go through)\b/i;
export function noDataReply(message: string, linkedAccounts: number): string | null {
  return linkedAccounts === 0 && BALANCE_OR_SPEND.test(message) ? NO_ACCOUNTS : null;
}

export type TxRow = { account_id: string; provider_transaction_id: string; amount_cents: number | null; posted_on: string | null; merchant_raw: string; is_pending: boolean; is_transfer: boolean | null };
const FIND_MONEY = /^\s*(?:can you |could you |pls |please )?(?:find (?:me )?(?:some )?money|find me savings|where can i save|how (?:can|do) i save(?: money)?|help me save money|save me money)\b/i;
const money = (c: number) => "$" + (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export async function findMoneyReply(message: string, today: string, readTx: () => Promise<TxRow[]>): Promise<string | null> {
  if (!FIND_MONEY.test(message)) return null;
  const rows = (await readTx()).filter((r) => !r.is_pending && r.posted_on && Number.isFinite(r.amount_cents));
  if (!rows.length) return NO_ACCOUNTS;
  const tx = rows.map((r) => ({ id: r.provider_transaction_id, account_id: r.account_id, posted_at: r.posted_on, amount: (r.amount_cents as number) / 100, merchant_raw: r.merchant_raw, is_pending: false, is_transfer: !!r.is_transfer }));
  const through = rows.map((r) => r.posted_on as string).sort().slice(-1)[0];
  const found = AgentSave.detect({ today, transactions: tx, accounts: [], bills: [], debts: [] });
  const ranked = AgentSave.rank(found.opportunities, null).slice(0, 3);
  const source = `From your linked accounts, transactions through ${through}. Estimates, not savings yet: nothing counts as saved until your next statements show it.`;
  if (ranked.length) {
    return [`Here's where your money is going that you could cut, biggest first:`, ...ranked.map((o: any, i: number) => `${i + 1}. ${o.title}: ${o.reason}`), "Tell me which one and I'll start on it.", source].join("\n");
  }
  const subs = (found.inventory || []).filter((s: any) => Number.isSafeInteger(s.monthly_cents)).sort((a: any, b: any) => b.monthly_cents - a.monthly_cents).slice(0, 5);
  if (subs.length) {
    return [`Nothing stands out as waste, but these repeat (${money(found.run_rate_monthly_cents || 0)} a month together). Worth a look:`, ...subs.map((s: any, i: number) => `${i + 1}. ${s.merchant}: ${money(s.amount_cents)} ${s.interval || "monthly"}`), "Say \"cancel\" and the name for any you don't use.", source].join("\n");
  }
  return `I looked through your transactions and nothing stands out to cut right now: no repeat fees, price increases or duplicate services. ${source}`;
}
