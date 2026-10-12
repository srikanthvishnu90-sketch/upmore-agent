// See-everything numbers in chat (capability list section 1), answered from code over the person's own rows, never by
// the model: "what's my balance" (S16-01), "how much did i spend on food last month" (S16-02), "how am i doing"
// (S16-14), "did rent go through" (S16-16). The numbers and wording come from packages/domain/80-money-answers.js
// (MoneyAnswers, through the router bundle); this file decides which messages it answers and reads the rows.
// Every answer ends with its source and as-of time. With nothing linked it returns null: noDataReply in
// direct_answers.ts says that in one plain line. Pure apart from the injected readers, so
// tests/edge/money-answers.test.ts drives it with fixtures.
import { MoneyAnswers } from "../../_shared/router_core.js";

export type AccountRow = {
  account_id: string; name: string; institution: string | null; account_kind: string; balance_cents: number | null;
  available_cents: number | null; balance_as_of: string | null; fetched_at?: string | null; status: string; currency?: string; sync_error?: boolean;
};
export type MoneyTxRow = {
  account_id: string; provider_transaction_id: string; amount_cents: number | null; posted_on: string | null; merchant_raw: string;
  is_pending: boolean; is_transfer: boolean | null; fetched_at?: string | null; currency?: string;
};
export type MoneyReaders = { accounts(): Promise<AccountRow[]>; transactions(): Promise<MoneyTxRow[]> };
export type MoneyKind = "balance" | "spend" | "checkup" | "through";

const LEAD = String.raw`^\s*(?:hey|hi|ok|okay|so|yo|pls|please|quick q:?)?[,\s]*`;
const END = String.raw`(?:\s+(?:now|right now|today|pls|please))?\s*[?.!]*\s*$`;
const BALANCE = new RegExp(LEAD + String.raw`(?:(?:what'?s|whats|what is|what are|show me|check|tell me|give me|get me)\s+)?(?:my\s+)?(?:(?:total|current|bank|account|checking|savings|cash|credit card|card)\s+)*(?:balances?|bal)` + END, "i");
const HAVE = new RegExp(LEAD + String.raw`how much (?:money |cash )?(?:do i have|have i got|is in my (?:account|accounts|bank|checking|savings))(?:\s+(?:in|at)\s+(?:the bank|my (?:account|accounts|bank|checking|savings)))?` + END, "i");
const CHECKUP = new RegExp(LEAD + String.raw`(?:how am i doing|how'?m i doing|how are my finances(?: doing| looking)?|how'?s my money(?: looking)?|how are things looking|am i doing ok(?:ay)?)(?:\s+(?:financially|money-?wise|with money|with my money|this month|overall|lately|so far))*\s*[?.!]*\s*$`, "i");
const SPEND = /\b(?:how much|what)\s+(?:did|have|do)\s+i\s+(?:spend|spent)\b|\bhow much i(?:'ve| have)? spent\b|\bwhat(?:'s| is| was)? (?:my )?spending\b|\bshow (?:me )?my spending\b|^\s*my spending\b/i;
const ADVICE = /\b(?:should|could|cut|reduce|lower|stop|budget|tips?|help me|plan|save|limit|afford)\b/i;
const THROUGH = /^\s*(?:hey|ok|okay|so|pls|please)?[,\s]*(?:did|has|have|is|was)\b/i;

// Which of the four asks this message is, or null. Conservative: a near miss goes on to the flows and the model.
export function moneyKind(message: string): MoneyKind | null {
  const m = String(message || "");
  if (CHECKUP.test(m)) return "checkup";
  if (THROUGH.test(m) && MoneyAnswers.goThroughTarget(m)) return "through";
  if (SPEND.test(m) && !ADVICE.test(m)) return "spend";
  if ((BALANCE.test(m) && !/\btransfer\b/i.test(m)) || HAVE.test(m)) return "balance";
  return null;
}

// The person's own account types (agent_account_preferences) win over the provider's, which SimpleFIN leaves "unknown".
export function mergeKinds(accounts: AccountRow[], prefs: { account_id: string; account_kind: string }[]): AccountRow[] {
  const by = new Map((prefs || []).map((p) => [p.account_id, p.account_kind]));
  return (accounts || []).map((a) => (by.has(a.account_id) ? { ...a, account_kind: by.get(a.account_id) as string } : a));
}

export const MONEY_UNAVAILABLE = "I can't read your linked accounts right now, so I won't guess at a number. Try again in a minute.";

export async function moneyReply(message: string, now: Date | number | string, read: MoneyReaders, opts?: { tz?: string }): Promise<string | null> {
  const kind = moneyKind(message);
  if (!kind) return null;
  const tz = opts?.tz || "UTC";
  let accounts: AccountRow[];
  try { accounts = ((await read.accounts()) || []).filter((a) => a && a.status !== "disconnected"); } catch { return MONEY_UNAVAILABLE; }
  if (!accounts.length) return null;
  if (kind === "balance") return MoneyAnswers.balance(accounts, now, { tz });
  let tx: MoneyTxRow[];
  try { tx = (await read.transactions()) || []; } catch { return MONEY_UNAVAILABLE; }
  if (kind === "spend") return MoneyAnswers.spend(tx, message, now, { tz });
  if (kind === "checkup") return MoneyAnswers.checkup(accounts, tx, now, { tz });
  return MoneyAnswers.didItGoThrough(tx, message, now, { tz, accounts });
}
