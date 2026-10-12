// Money owed to the person, answered from code (overnight duties C2-C4): a credit balance on a card (12 CFR 1026.11),
// an escrow surplus from a pasted escrow analysis (12 CFR 1024.17), and whether a refund notice (PayPal, Venmo, Zelle,
// a check, an email naming the FTC or a settlement) comes from a program on file (packages/offers/refund-programs.json).
// Upmore drafts the request and the person sends it; nothing here sends, files, accepts or moves money. Thresholds come
// from the offer book with their source and checked date. Thin wrapper over packages/domain/84-money-owed.js (MoneyOwed,
// through the router bundle); pure apart from the injected readers, so tests/edge/money-owed-answer.test.ts drives it
// with fixtures. Mirrors disputeReply in dispute_answer.ts.
import { MoneyOwed, OfferBook, OFFER_TERMS_JSON, REFUND_PROGRAMS_JSON } from "../../_shared/router_core.js";
import type { TxRow } from "./direct_answers.ts";
import { mergeKinds, type AccountRow } from "./money_answers.ts";

const book = OfferBook.create(OFFER_TERMS_JSON);
const usable = (rows: TxRow[]) => rows.filter((r) => r && r.posted_on && Number.isFinite(r.amount_cents));

export function moneyOwedKind(message: string): string | null {
  return MoneyOwed.kind(message);
}

// readAccounts is only called for a card question; readTx only when rows can change the answer (a deposit that
// resolves a balance or a surplus, a charge inside a refund window). A pasted notice reads nothing.
export async function moneyOwedReply(message: string, today: string, readTx: () => Promise<TxRow[]>, readAccounts: () => Promise<AccountRow[]>): Promise<string | null> {
  const kind = MoneyOwed.kind(message);
  if (!kind) return null;
  const ctx: Record<string, unknown> = { today, book, programs: REFUND_PROGRAMS_JSON };
  if (kind === "escrow") {
    // The deposit watch is a bonus on top of the pasted numbers: an unreadable history leaves it out, never the answer.
    try { ctx.transactions = usable(await readTx()); } catch { ctx.transactions = []; }
  } else if (kind === "credit_balance" || kind === "owed") {
    const [accounts, tx] = await Promise.all([readAccounts(), readTx()]);
    ctx.accounts = accounts;
    ctx.transactions = usable(tx);
  }
  return MoneyOwed.answer(message, ctx).text ?? null;
}

// Every card the person has linked, closed (disconnected) ones included: a closed card is where a credit balance is
// usually left behind. Read with the person's RLS client; their own account types win (mergeKinds).
export async function readOwedAccounts(supabase: any, userId: string): Promise<AccountRow[]> {
  const [a, p] = await Promise.all([
    supabase.from("agent_financial_accounts").select("account_id,name,institution,currency,account_kind,balance_cents,available_cents,balance_as_of,fetched_at,sync_error,status").eq("user_id", userId),
    supabase.from("agent_account_preferences").select("account_id,account_kind").eq("user_id", userId),
  ]);
  if (a.error) throw new Error("Accounts unavailable.");
  return mergeKinds(a.data || [], p.error ? [] : p.data || []);
}
