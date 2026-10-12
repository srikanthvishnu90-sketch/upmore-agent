// See-everything numbers in chat (capability list section 1), answered from code over the person's own rows, never by
// the model: "what's my balance" (S16-01), "how much did i spend on food last month" (S16-02), "how am i doing"
// (S16-14), "did rent go through" (S16-16). The numbers and wording come from packages/domain/80-money-answers.js
// (MoneyAnswers, through the router bundle); this file decides which messages it answers and reads the rows.
// Every answer ends with its source and as-of time. With nothing linked it returns null: noDataReply in
// direct_answers.ts says that in one plain line. Pure apart from the injected readers, so
// tests/edge/money-answers.test.ts drives it with fixtures.
// The numbers (capability list section 1, overnight E1-E7) come from packages/domain/86-the-numbers.js (TheNumbers):
// "how much can i spend" (safe to spend until payday), "what bills are coming up", "how long will my money last",
// "can i afford a $600 trip next month", "what's my net worth", "forecast", and "show me the math" for any of them
// (the last answer in the thread, read through the optional previous() reader). tests/edge/the-numbers.test.ts.
// This month against last month and the person's own average ("am i spending more than usual", "this month vs last
// month") and spending by card ("spending by card", "how much did i put on my amex") come from
// packages/domain/94-spending-views.js (SpendingViews; capability list items 12 and 13). tests/edge/spending-views.test.ts.
// Buy now, pay later (capability list items 85 and 87): "show my buy now pay later plans", "what do i owe klarna", "my
// afterpay payments", "bnpl" list every plan read from the person's rows; "would a $400 afterpay plan push me negative"
// projects the next 30 days with them. packages/domain/97-bnpl.js (Bnpl) over the dated provider file
// (packages/offers/bnpl-providers.json, BNPL_PROVIDERS_JSON in the bundle). Read-only: paying, paying off and rescheduling
// are not built and go on. tests/edge/bnpl-answer.test.ts.
// The year in money ("my year in money", "year in review", "how did 2026 go", "annual review"; capability list item 26)
// comes from packages/domain/96-year-in-money.js (YearInMoney): this year so far in the person's zone, or a named past
// year read through the optional history() reader, which reaches back to that year's Jan 1. tests/edge/year-in-money.test.ts.
// "Did my refund arrive?" (megadoc K07; capability list item 38, the asking half): credits from the merchant named, or
// that look like refunds, in the last 90 days, to the cent; none is said with the watch offered. packages/domain/
// 98-refund-check.js (RefundCheck). tests/edge/refund-check.test.ts.
// "What subscriptions do I have?" (megadoc J03): the repeating charges at subscription services, each with its latest
// charge, and the ones that stopped (packages/domain/100-subscription-list.js). tests/edge/subscription-list.test.ts.
import { Bnpl, BNPL_PROVIDERS_JSON, MoneyAnswers, RefundCheck, SpendingViews, SubscriptionList, TheNumbers, YearInMoney } from "../../_shared/router_core.js";

export type AccountRow = {
  account_id: string; name: string; institution: string | null; account_kind: string; balance_cents: number | null;
  available_cents: number | null; balance_as_of: string | null; fetched_at?: string | null; status: string; currency?: string; sync_error?: boolean;
};
export type MoneyTxRow = {
  account_id: string; provider_transaction_id: string; amount_cents: number | null; posted_on: string | null; merchant_raw: string;
  is_pending: boolean; is_transfer: boolean | null; fetched_at?: string | null; currency?: string;
};
// history(from): the person's rows from a past day on (a past year's review), when the host can read further back than
// transactions() does; without it the review uses transactions() and says where those rows start.
export type MoneyReaders = { accounts(): Promise<AccountRow[]>; transactions(): Promise<MoneyTxRow[]>; previous?(): Promise<{ role: string; content: string }[]>; history?(from: string): Promise<MoneyTxRow[]> };
// "math" names its number ("show me the math on my net worth"); "explain" is a bare "show me the math", answered only
// when the thread's last answer was one of these numbers (else null: the model explains its own arithmetic).
export type NumbersKind = "safe" | "upcoming" | "runway" | "afford" | "networth" | "forecast" | "math" | "explain";
export type MoneyKind = "balance" | "spend" | "checkup" | "through" | "compare" | "cards" | "year" | "bnpl" | "bnplcheck" | "refund" | "subs" | NumbersKind;
// The most rows the host's transaction readers return (_shared/recent_transactions.ts, newest first). A read that comes
// back this full was cut at its oldest end, so the year review says the rows it read start there, not the history.
export const TX_READ_CAP = 5000;

const LEAD = String.raw`^\s*(?:hey|hi|ok|okay|so|yo|pls|please|quick q:?)?[,\s]*`;
const END = String.raw`(?:\s+(?:now|right now|today|pls|please))?\s*[?.!]*\s*$`;
const BALANCE = new RegExp(LEAD + String.raw`(?:(?:what'?s|whats|what is|what are|show me|check|tell me|give me|get me)\s+)?(?:my\s+)?(?:(?:total|current|bank|account|checking|savings|cash|credit card|card)\s+)*(?:balances?|bal)` + END, "i");
const HAVE = new RegExp(LEAD + String.raw`how much (?:money |cash )?(?:do i have|have i got|is in my (?:account|accounts|bank|checking|savings))(?:\s+(?:in|at)\s+(?:the bank|my (?:account|accounts|bank|checking|savings)))?` + END, "i");
// "what's my cash", "how much cash do i have" (megadoc G16): the cash balance.
const CASH = new RegExp(LEAD + String.raw`(?:what'?s|whats|what is|how much is|show me|tell me)\s+(?:my\s+)?(?:total\s+|current\s+)?cash(?:\s+on hand|\s+balance)?` + END, "i");
const CHECKUP = new RegExp(LEAD + String.raw`(?:how am i doing|how'?m i doing|how are my finances(?: doing| looking)?|how'?s my money(?: looking)?|how are things looking|am i doing ok(?:ay)?)(?:\s+(?:financially|money-?wise|with money|with my money|this month|overall|lately|so far))*\s*[?.!]*\s*$`, "i");
// Also "where is my money going" (megadoc L02) and "what's my biggest expense" (L08): this month's spending with its top
// places, the same answer.
const SPEND = /\b(?:how much|what)\s+(?:did|have|do)\s+i\s+(?:spend|spent)\b|\bhow much i(?:'ve| have)? spent\b|\bwhat(?:'s| is| was)? (?:my )?spending\b|\bshow (?:me )?my spending\b|^\s*my spending\b|^\s*(?:hey|ok|so)?[,\s]*where(?:'s| is| does| did| has)? (?:all )?(?:my|the) money (?:go|going|gone|been going)\b|^\s*(?:hey|ok|so)?[,\s]*(?:what'?s|whats|what is|what are) (?:my )?(?:biggest|largest|top) (?:expenses?|spending|costs?|charges?)\b/i;
const ADVICE = /\b(?:should|could|cut|reduce|lower|stop|budget|tips?|help me|plan|save|limit|afford)\b/i;
const THROUGH = /^\s*(?:hey|ok|okay|so|pls|please)?[,\s]*(?:did|has|have|is|was)\b/i;

// The numbers, each a whole message in the person's words. "how much can i spend on groceries" (a budget question),
// "can i afford a house" (no amount), "can i afford $500 a month" (a recurring cost) and the weather forecast go on.
const OPT_END = String.raw`\s*[?.!]*\s*$`;
const SAFE = new RegExp(LEAD + String.raw`(?:how much (?:money |cash )?(?:do i have|have i got|is there|is) left(?: to spend)?(?: (?:this month|for the month|until payday|till payday))?(?: after (?:my )?(?:bills|rent|expenses))?(?: (?:this month|for the month))?|how much (?:money |cash )?(?:can|could) i (?:still )?spend|how much (?:money |cash )?(?:is|do i have) (?:safe|free|left) to spend|what'?s (?:my )?safe[- ]to[- ]spend(?: number| amount)?|(?:my )?safe[- ]to[- ]spend|what can i (?:still )?spend|how much spending money do i have(?: left)?)(?:\s+(?:today|right now|now|this week|until (?:payday|my next pay ?check|i get paid)|till (?:payday|i get paid)|before (?:payday|my next pay ?check|i get paid)))?` + OPT_END, "i");
const UPCOMING = new RegExp(LEAD + String.raw`(?:(?:what|which) (?:bills|payments|bills and payments)(?: do i have)? (?:are |is )?(?:coming up|due|upcoming|coming)(?: soon)?|(?:show me |list |what are )?(?:my )?(?:upcoming|next) (?:bills|payments)|(?:any )?bills (?:coming up|due soon)|when are my bills due|what'?s coming up (?:in|on|for) my (?:bills|accounts|money))(?:\s+(?:this week|this month|in the next 30 days|next 30 days|soon))?` + OPT_END, "i");
const RUNWAY = new RegExp(LEAD + String.raw`(?:how long (?:will|would|can|could|does|do) (?:my )?(?:money|cash|savings|funds)(?: i have)? last(?: me)?|how long can i (?:last|go|survive)(?: on (?:my )?(?:money|cash|savings))?|what'?s my (?:cash )?runway|(?:my )?(?:cash )?runway)(?:\s+(?:if i (?:lost|lose) my job|without (?:a )?(?:paycheck|income|work)|if i stopped working|at this rate|at my current spending))?` + OPT_END, "i");
const NETWORTH = new RegExp(LEAD + String.raw`(?:(?:what'?s|whats|what is|show me|tell me|calculate|check|give me) my |my )?(?:total |current )?net ?worth(?:\s+(?:now|today|right now))?` + OPT_END, "i");
const WORTH = new RegExp(LEAD + String.raw`how much am i worth` + OPT_END, "i");
const FORECAST = new RegExp(LEAD + String.raw`(?:(?:show me|give me|run|do) (?:my |a |the )?|(?:what'?s|whats|what is) my |my )?(?:(?:90[- ]day|3[- ]month|cash[- ]?flow|balance) )*forecast(?: (?:for|over) (?:the next )?(?:90 days|3 months|three months))?` + OPT_END, "i");
// The verb first: "forecast my cash for the next 90 days".
const FORECAST_VERB = new RegExp(LEAD + String.raw`forecast (?:my )?(?:cash|balance|balances|money|cash ?flow)(?: (?:for|over) (?:the next )?(?:90 days|3 months|three months))?` + OPT_END, "i");
const LATER = new RegExp(LEAD + String.raw`what will my (?:balance|cash) be (?:in (?:30|60|90) days|in (?:a|one|two|three|1|2|3) months?|next month)` + OPT_END, "i");
const AFFORD = /^\s*(?:hey|hi|ok|okay|so|yo|pls|please|quick q:?)?[,\s]*(?:can|could) i (?:really |still )?afford\b/i;
const NOT_AFFORD = /\b(?:a|per|each|every) (?:month|week|year)\b|\/(?:mo|month|wk|yr)\b|\bmonthly\b|\bweekly\b|\byearly\b|\bmortgage\b|\bloan\b|\bhouse\b|\bhome\b|\bcar payment\b|\binvest|\bstocks?\b|\bshares?\b|\bcrypto|\bbitcoin\b|\bbet\b|\bgambl|\bshould\b/i;
const MATH = new RegExp(LEAD + String.raw`(?:(?:can you |could you |please )?(?:show|walk|give|explain)(?: me)?(?: through)? (?:the|your) (?:math|maths|calculation|working)|how did you (?:get|calculate|work out|come up with) (?:that|this|the)(?: number| figure| amount)?|show your work)(?:\s+(?:on|for|behind|of) (?:my |the |that |this )?[a-z' -]{0,40})?` + OPT_END, "i");

function numbersKind(m: string): NumbersKind | null {
  if (MATH.test(m)) return TheNumbers.topicOf(m) ? "math" : "explain";
  if (SAFE.test(m)) return "safe";
  if (UPCOMING.test(m)) return "upcoming";
  if (RUNWAY.test(m)) return "runway";
  if (NETWORTH.test(m) || WORTH.test(m)) return "networth";
  if (FORECAST.test(m) || FORECAST_VERB.test(m) || LATER.test(m)) return "forecast";
  if (AFFORD.test(m) && !NOT_AFFORD.test(m) && TheNumbers.parseAmount(m)) return "afford";
  return null;
}

// Which ask this message is, or null. Conservative: a near miss goes on to the flows and the model.
export function moneyKind(message: string): MoneyKind | null {
  const m = String(message || "");
  if (CHECKUP.test(m)) return "checkup";
  // Before "did it go through": "did the refund go through" is about money coming back, not a charge.
  if (RefundCheck.ask(m)) return "refund";
  if (SubscriptionList.ask(m)) return "subs";
  if (THROUGH.test(m) && MoneyAnswers.goThroughTarget(m)) return "through";
  // "my year in money", "year in review", "how did 2026 go": a whole year. "how much did i spend this year" is spend's.
  if (YearInMoney.ask(m)) return "year";
  // Before the spending views and "can i afford": "can i afford a $200 klarna pay in 4" is a pay-later check.
  const later = Bnpl.ask(m) as "list" | "check" | null;
  if (later) return later === "list" ? "bnpl" : "bnplcheck";
  // Before spend: "how much did i spend on my amex" is a card, "did i spend more on food than last month" a comparison.
  const view = SpendingViews.ask(m) as "compare" | "cards" | null;
  if (view) return view;
  if (SPEND.test(m) && !ADVICE.test(m)) return "spend";
  if ((BALANCE.test(m) && !/\btransfer\b/i.test(m)) || HAVE.test(m) || CASH.test(m)) return "balance";
  return numbersKind(m);
}

// The person's own account types (agent_account_preferences) win over the provider's, which SimpleFIN leaves "unknown".
export function mergeKinds(accounts: AccountRow[], prefs: { account_id: string; account_kind: string }[]): AccountRow[] {
  const by = new Map((prefs || []).map((p) => [p.account_id, p.account_kind]));
  return (accounts || []).map((a) => (by.has(a.account_id) ? { ...a, account_kind: by.get(a.account_id) as string } : a));
}

export const MONEY_UNAVAILABLE = "I can't read your linked accounts right now, so I won't guess at a number. Try again in a minute.";

// opts.rules: the person's category rules (95-category-rules.js), so "Target" counts where they said in spending, the
// month comparison, spending by card, "how am i doing" and the year in money.
export async function moneyReply(message: string, now: Date | number | string, read: MoneyReaders, opts?: { tz?: string; rules?: any[] }): Promise<string | null> {
  const kind = moneyKind(message);
  if (!kind) return null;
  const tz = opts?.tz || "UTC", rules = Array.isArray(opts?.rules) ? opts!.rules : [];
  let accounts: AccountRow[];
  try { accounts = ((await read.accounts()) || []).filter((a) => a && a.status !== "disconnected"); } catch { return MONEY_UNAVAILABLE; }
  if (!accounts.length) return null;
  if (kind === "balance") return MoneyAnswers.balance(accounts, now, { tz });
  if (kind === "networth") return TheNumbers.netWorth(accounts, now, { tz })?.text ?? null;
  let tx: MoneyTxRow[];
  if (kind === "year") {
    // A past year needs rows from its Jan 1, further back than the shared read goes; this year is in the shared read.
    const thisYear = +MoneyAnswers.todayIn(now, tz).slice(0, 4), year = Number(YearInMoney.yearOf(message, now, tz)) || thisYear;
    try { tx = (year < thisYear && read.history ? await read.history(`${year}-01-01`) : await read.transactions()) || []; } catch { return MONEY_UNAVAILABLE; }
    return YearInMoney.review(tx, message, now, { tz, rules, capped: tx.length >= TX_READ_CAP ? TX_READ_CAP : null });
  }
  try { tx = (await read.transactions()) || []; } catch { return MONEY_UNAVAILABLE; }
  if (kind === "spend") return MoneyAnswers.spend(tx, message, now, { tz, rules });
  if (kind === "bnpl") return Bnpl.list(tx, message, now, { tz, providers: BNPL_PROVIDERS_JSON, accounts });
  if (kind === "bnplcheck") return Bnpl.check(accounts, tx, message, now, { tz, providers: BNPL_PROVIDERS_JSON });
  if (kind === "compare") return SpendingViews.compare(tx, message, now, { tz, rules });
  if (kind === "cards") return SpendingViews.byCard(accounts, tx, message, now, { tz, rules });
  if (kind === "checkup") return MoneyAnswers.checkup(accounts, tx, now, { tz, rules });
  if (kind === "refund") return RefundCheck.answer(tx, message, now, { tz });
  if (kind === "subs") return SubscriptionList.answer(tx, message, now, { tz, rules });
  if (kind === "through") return MoneyAnswers.didItGoThrough(tx, message, now, { tz, accounts });
  if (kind === "math" || kind === "explain") {
    // The thread's last messages, newest first, so a bare "show me the math" explains the answer just given. A failed
    // read only loses that context: a bare ask then goes on to the model, a named one is still answered.
    let previous: { role: string; content: string }[] = [];
    try { previous = (read.previous ? await read.previous() : []) || []; } catch { previous = []; }
    return TheNumbers.showMath(accounts, tx, message, now, { tz, previous });
  }
  return TheNumbers.answer(kind, accounts, tx, message, now, { tz })?.text ?? null;
}
