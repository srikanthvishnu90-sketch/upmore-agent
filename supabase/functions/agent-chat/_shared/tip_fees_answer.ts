// Tip and junk-fee inflation in chat (C11; registry TXN-019 "tip and adjustment reconciliation";
// packages/domain/116-tip-fees.js through the router bundle): "are delivery fees getting worse?", "how much do
// i tip on doordash". Effective tip % and service/delivery fee load per merchant, the calendar month of `now`
// against the month before it (or the months the ask names), from itemized receipt rows only — a totals-only
// receipt states no tip and no fees, so nothing is estimated from it. Every number is computed by the domain
// functions from the rows the readers return, and the reply ends with its source and as-of time.
// Pure apart from the injected readers, so tests/edge/tip-fees-answer.test.ts drives it with fixtures.
// Wiring still owed by the coordinator: a call site in handler.ts, with a receipts reader for the person's
// itemized receipts (parsed receipt rows: merchant, on, subtotal_cents, tip_cents, delivery_fee_cents,
// service_fee_cents), alongside the shared transaction read.
import { TipFees } from "../../_shared/router_core.js";

export type TipFeesReaders = { receipts(): Promise<any[]>; transactions(): Promise<any[]> };
export const TIP_FEES_UNAVAILABLE = "I can't read your receipts right now, so I won't guess at a number. Try again in a minute.";
export const TIP_FEES_NO_RECEIPTS = "Tips and fees can only be tracked from itemized receipts, and none are on file.";

// A tip/fee tracking ask about the person's own receipts, or not (anything else goes on).
export function isTipFeesAsk(message: string): boolean {
  return !!(TipFees as any).ask(message);
}

export async function tipFeesReply(message: string, now: Date | number | string, read: TipFeesReaders, opts?: { tz?: string }): Promise<string | null> {
  const q: any = (TipFees as any).ask(message);
  if (!q) return null;
  let receipts: any[];
  try { receipts = (await read.receipts()) || []; } catch { return TIP_FEES_UNAVAILABLE; }
  // Itemized rows can also arrive on the transaction read (a row that itself states a subtotal, a tip or a fee);
  // plain transactions state none of those, so they never add a number here.
  if (!receipts.some((r) => (TipFees as any).itemized(r)) && read && typeof read.transactions === "function") {
    try {
      const tx = (await read.transactions()) || [];
      const itemizedTx = tx.filter((r) => r && (TipFees as any).itemized(r));
      if (itemizedTx.length) receipts = receipts.concat(itemizedTx);
    } catch { /* the receipts read already decided the answer */ }
  }
  if (!receipts.some((r) => (TipFees as any).itemized(r))) return TIP_FEES_NO_RECEIPTS;
  return (TipFees as any).answer({ receipts, words: q, now, tz: opts?.tz || "UTC" }) ?? null;
}
