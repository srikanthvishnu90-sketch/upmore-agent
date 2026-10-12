// Subscription and shopping savings answered from code (Methods 3, overnight D1, D2, D3, D5, D6): "am i overpaying for
// streaming", "should i switch to annual", "is costco executive worth it", "should i stack subscribe and save". Thin
// wrapper over packages/domain/85-subscription-savings.js (SubscriptionSavings, through the router bundle): every number
// is from the person's own rows (dated) or an offer-book term cited with its source and checked date, and a stale term
// says "may have changed: check before acting". Read-only: nothing is cancelled, switched, activated or turned on here;
// a cancel is the cancel flow's own card and yes. Pure apart from the injected reader, so
// tests/edge/subscription-answer.test.ts drives it with fixtures. Mirrors findMoneyReply in direct_answers.ts.
import { SubscriptionSavings, OfferBook, OFFER_TERMS_JSON } from "../../_shared/router_core.js";
import { NO_ACCOUNTS, type TxRow } from "./direct_answers.ts";

export type SubsTopic = "streaming" | "annual" | "costco" | "amazon" | "perks" | "all";

const STREAM = String.raw`(?:stream(?:ing|ers?)?|netflix|hulu|disney\+?|peacock|paramount\+?|max|espn\+?|apple tv)`;
const TOPICS: [SubsTopic, RegExp][] = [
  ["costco", /\bcostco\b[^.?!]*\b(?:executive|gold star|membership|worth|upgrade|downgrade|tier|renew)\b|\b(?:executive|gold star) (?:membership|tier)\b[^.?!]*\bcostco\b|\bwarehouse club\b[^.?!]*\b(?:worth|math|membership)\b/i],
  ["amazon", /\bsubscribe\s*(?:and|&|n)\s*save\b/i],
  ["annual", /\b(?:switch|move|go|change)\s+(?:\w+\s+)?(?:to\s+)?(?:an?\s+)?(?:annual|yearly)\b|\bpay(?:ing)?\s+(?:annually|yearly)\b|\b(?:annual|yearly)\s+(?:plan|billing)\b[^.?!]*\b(?:cheaper|worth|save|better)\b|\b(?:monthly|month to month)\s+(?:vs\.?|or|versus)\s+(?:annual|yearly)\b/i],
  ["perks", /\b(?:already (?:included|includes|get|have)|comes? with|included with|paying twice|pay(?:ing)? (?:for it )?twice|perks?)\b[^.?!]*\b(?:stream\w*|netflix|hulu|disney|peacock|paramount|walmart|t-?mobile|amex|plan)\b/i],
  ["streaming", new RegExp(String.raw`\b(?:over ?pay(?:ing)?|pay(?:ing)? too much|cheaper (?:plan|tier|option)|ad[- ]supported|with ads|rotat(?:e|ing|ion)|save (?:money )?on|cut (?:back )?on|too many)\b[^.?!]*\b${STREAM}\b|\b${STREAM}\b[^.?!]*\b(?:over ?pay(?:ing)?|too much|cheaper|rotat(?:e|ing|ion))\b`, "i")],
  ["all", /\b(?:am i |are we )?(?:over ?pay(?:ing)?|pay(?:ing)? too much)\b[^.?!]*\bsubscriptions?\b|\bsave (?:money )?on (?:my )?subscriptions?\b|\bcheaper (?:plans?|tiers?) for (?:my )?subscriptions?\b/i],
];
const CANCEL = /\b(?:cancel|unsubscribe|stop paying)\b/i;

// Which kind of savings ask this is, or null. Conservative: an ask to cancel goes to the cancel flow, never here.
export function subscriptionTopic(message: string): SubsTopic | null {
  const m = String(message || "");
  if (CANCEL.test(m) && !/\bworth\b/i.test(m)) return null;
  for (const [topic, re] of TOPICS) if (re.test(m)) return topic;
  return null;
}

const KINDS: Record<SubsTopic, (f: any) => boolean> = {
  streaming: (f) => ["cheaper_tier", "perk_overlap", "card_credit", "rotation"].includes(f.kind) || (f.kind === "annual_switch" && f.service === "peacock"),
  annual: (f) => f.kind === "annual_switch",
  costco: (f) => f.kind === "warehouse_club",
  amazon: (f) => f.kind === "subscribe_and_save",
  perks: (f) => f.kind === "perk_overlap" || f.kind === "card_credit",
  all: () => true,
};
const NOTHING: Record<SubsTopic, string> = {
  streaming: "Nothing in your streaming charges matches a cheaper tier or a perk you already have, and you don't pay for three or more at once.",
  annual: "None of your subscriptions with a yearly plan on file (Peacock Premium, Amazon Prime) has been billed the monthly price 10 or more months in a row, so there's no annual switch to suggest.",
  costco: "I don't see Costco charges in the last 12 months, so there's no tier math to do.",
  amazon: "I don't see five or more Amazon purchases repeating at the same amount, so there's no Subscribe and Save stack to suggest.",
  perks: "I don't see a separate charge for something a plan you pay for already includes.",
  all: "Nothing in your subscriptions matches a cheaper tier, a yearly plan, a perk you already have or a rotation.",
};
const LEAD: Record<SubsTopic, string> = {
  streaming: "Here's what your streaming charges show, biggest saving first:",
  annual: "Here's where paying yearly would cost less:",
  costco: "Here's the Costco math from your own charges:",
  amazon: "Here's the Subscribe and Save math from your Amazon charges:",
  perks: "You're paying for something a plan already gives you:",
  all: "Here's what your subscriptions show, biggest saving first:",
};

export async function subscriptionReply(message: string, today: string, readTx: () => Promise<TxRow[]>, facts?: { tmobile_plan?: string; cards?: { account_id: string; product: string }[] }): Promise<string | null> {
  const topic = subscriptionTopic(message);
  if (!topic) return null;
  const rows = (await readTx()).filter((r) => r && !r.is_pending && r.posted_on && Number.isFinite(r.amount_cents));
  if (!rows.length) return NO_ACCOUNTS;
  const all = SubscriptionSavings.find({ today, book: OfferBook.create(OFFER_TERMS_JSON), transactions: rows, facts: facts || {} });
  const findings = all.findings.filter(KINDS[topic]);
  const questions = topic === "costco" || topic === "amazon" || topic === "annual" ? [] : all.questions;
  const text = SubscriptionSavings.render({ ...all, findings, questions }, { lead: LEAD[topic] });
  return text ?? `${NOTHING[topic]} From your linked card and bank rows, transactions through ${all.through}.`;
}
