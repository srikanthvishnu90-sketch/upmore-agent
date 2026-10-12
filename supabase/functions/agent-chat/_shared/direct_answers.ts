// Answers the chat gives from code, not from the model, for asks the live gauntlet (2026-10-12) showed the model getting
// wrong or the flows not covering:
//   - "connect my fidelity": the model invented app steps (S16-19). Now the connector matrix answers: a live connect link,
//     the read-only Plaid path, a fallback while trading waits on approval, not built yet, off, or can't connect.
//   ("pay my rent" used to be answered here as not built. It is now the standing rent flow, packages/domain/81-standing-rent.js,
//   routed by AgentRouter through _shared/flow_router.ts, so nothing here intercepts it.)
//   - "find me money": the model's answer was swapped for a dispute fallback (S16-18). Now the save engine reads the
//     person's own transactions and ranks what it finds, every number from their rows, with the source and as-of date.
//     The subscription and shopping savings (packages/domain/85-subscription-savings.js: cheaper tier, annual switch, perk
//     overlap, rotation, Costco tier, Subscribe and Save) rank alongside, each title citing its offer-book term.
//   - balance and spending with nothing linked: the planner's fallback spoke in internal terms ("retained USD posted
//     records"). Now one plain line says nothing is connected and how to connect it.
// Pure apart from the injected readers, so tests/edge/direct-answers.test.ts drives them with fixtures.
import { BrokerageConnectors, PLATFORMS_JSON, ConnectCards, AgentSave, SubscriptionSavings, OfferBook, OFFER_TERMS_JSON } from "../../_shared/router_core.js";

const CONNECT_EMAIL = /^\s*(?:please |pls |can you |could you |can u )?(?:connect|link|add|hook up|sync|set up)\s+(?:my\s+)?(?:gmail|google mail|email|inbox)\b/i;

export function connectReply(message: string): string | null {
  if (CONNECT_EMAIL.test(message)) return ConnectCards.message("gmail");
  // "Connect my Ally savings" is the bank, not Ally Invest: a bank account kind said with a bank's name is the bank's.
  const bank = bankConnectReply(message);
  if (bank && /\b(?:checking|savings|credit cards?|debit card|card|bank)\b/i.test(message)) return bank;
  const a = BrokerageConnectors.connectAnswer(PLATFORMS_JSON, message);
  if (!a) return bank;
  return a.card ? ConnectCards.message(a.card, { lead: a.text }) : a.text;
}

// "Link my Chase account", "connect my bank", "add my checking" (megadoc Q10): banks and cards connect in the app through
// SimpleFIN Bridge (the app's Connect bank screen, src/upmore-app-template.html), read-only. The brokerage matrix answers
// first ("connect my fidelity"); this takes only a bank, a bank account kind, or a bank's name. No card is drawn: only a
// provider a person can connect from the link gets one, and SimpleFIN is a token pasted in the app. Whether SimpleFIN
// lists a given bank is not on file, so it is never promised.
const BANKS: [string, RegExp][] = [["Chase", /\bchase\b/], ["Bank of America", /\bbank of america\b|\bbofa\b|\bboa\b/], ["Wells Fargo", /\bwells fargo\b|\bwells\b/], ["Citi", /\bciti(?:bank)?\b/], ["Capital One", /\bcapital one\b|\bcap one\b/], ["U.S. Bank", /\bu\.?s\.? bank\b/], ["PNC", /\bpnc\b/], ["Ally", /\bally\b/], ["Discover", /\bdiscover\b/], ["American Express", /\bamerican express\b|\bamex\b/], ["Chime", /\bchime\b/], ["Navy Federal", /\bnavy federal\b/], ["USAA", /\busaa\b/], ["TD Bank", /\btd bank\b/], ["Truist", /\btruist\b/], ["Citizens", /\bcitizens(?: bank)?\b/], ["Varo", /\bvaro\b/], ["Marcus", /\bmarcus\b/], ["Synchrony", /\bsynchrony\b/], ["Barclays", /\bbarclays\b/]];
const BANK_ASK = /^\s*(?:please |pls |can you |could you |can u |i want to |i wanna |help me |how do i |how can i )?(?:connect|link|add|hook up|sync|set up)\s+(?:my\s+|our\s+|a\s+)?(.{1,60}?)\s*[?.!]*\s*$/i;
const BANK_WORDS = /^(?:(?:new |other |second )?(?:bank|bank accounts?|checking(?: account)?|savings(?: account)?|credit cards?|debit card|card account|bank and cards?))$/;
export function bankConnectReply(message: string): string | null {
  const m = BANK_ASK.exec(String(message || ""));
  if (!m) return null;
  const what = m[1].toLowerCase().replace(/[’']/g, "'").trim();
  const bank = BANKS.find(([, re]) => re.test(what));
  // "Chase", "my chase account", "chase checking", "chase credit card"; or no name and only an account kind.
  const rest = bank ? what.replace(bank[1], "").replace(/\s+/g, " ").trim() : what;
  if (!(bank ? /^(?:(?:bank )?(?:account|accounts|checking|savings|credit card|card|cards|debit card|bank)(?: account)?)?$/.test(rest) : BANK_WORDS.test(rest))) return null;
  const name = bank ? bank[0] : "your bank";
  return `Nothing was connected yet. ${bank ? `To connect ${name}, open Home in the app and tap Connect bank.` : "Banks and cards connect from the app: open Home and tap Connect bank."} It goes through SimpleFIN Bridge: you pick ${bank ? name : "your bank"} on its list and sign in on the bank's own page, then paste the setup token it gives you into Upmore. Upmore never sees your bank password, and the connection is read-only: it reads balances and transactions and never moves money.${bank ? ` If ${name} isn't on SimpleFIN's list, it can't be connected yet.` : ""}`;
}

// "What's my credit score": no credit bureau or score feed is connected (capability items 37 and 101), and the reply guard
// polices dollar amounts only, so the model could state a made-up score. Code answers the person's own score; how-to
// questions ("how do I improve my credit score", "does closing a card hurt it") still go to the model with the FICO facts,
// and anything about a credit card, limit or report is not a score.
const MY_SCORE = /\b(?:what(?:'?s| is)|whats|check|see|show(?: me)?|tell me|look up|pull|get|know|did|has|how(?:'?s| is| has))\b[^?.!]{0,30}?\bmy (?:credit(?: score)?|fico(?: score)?|vantage ?score)s?\b(?! (?:cards?|limits?|lines?|reports?|union|balance))/i;
const SCORE_HOWTO = /\bhow (?:do|can|could|should|to|would)\b|\bwhat (?:affects|hurts|helps|lowers|raises|impacts)\b|\b(?:does|do|will|would|could|should)\b(?! you\b| u\b)|\bwhat(?:'?s| is) a (?:good|bad)\b/i;
export const CREDIT_SCORE_NONE =
  "I can't see your credit score: no credit bureau or score source is connected to Upmore, so I won't guess at a number. Many card issuers and banks show a free score in their app, and AnnualCreditReport.com gives you your free credit reports from all three bureaus (reports, not scores).";
export function creditScoreReply(message: string): string | null {
  const m = String(message || "");
  return MY_SCORE.test(m) && !SCORE_HOWTO.test(m) ? CREDIT_SCORE_NONE : null;
}

// "Let me test ideas with paper trading": everything is live (owner rule, 2026-10-11): no paper trading, practice
// accounts or paper fallback anywhere, so code says so instead of letting the model offer one. Paper towels, a paper
// statement fee, a paper check or return, and practice budgeting are not trading asks.
const PAPER_TRADING = /\b(?:paper[- ]?trad(?:e|es|ing)|paper (?:account|mode|portfolio|money)|practice (?:trading|trades?|brokerage|account|portfolio)|demo (?:account|trading|mode|portfolio)|fake money|play money|simulat(?:e|ed|ion|ing) (?:a |an |my )?(?:trades?|trading|orders?|buys?|portfolio|stock))\b/i;
export const PAPER_TRADING_NONE =
  "Upmore doesn't offer paper trading or practice accounts: every order is real, in your own brokerage account, placed only after your yes, and capped at $5 an order for now. Nothing was placed.";
export function paperTradingReply(message: string): string | null {
  return PAPER_TRADING.test(String(message || "")) ? PAPER_TRADING_NONE : null;
}

// No phone calls (standing rule). An ask for Upmore itself to place a call is answered here, after the capability
// scripts (which tell the person what to say when they call), so the model never promises one. "Call me when...",
// call options, margin calls, a phone bill, "how do I call" and "should I call" are not asks to place a call.
const NOT_A_CALL = "(?!me\\b|you\\b|it\\b|this\\b|that\\b|or\\b|bill|number|plan|line|case|charger|options?\\b|puts?\\b|on\\b)";
const PHONE_ASK = [
  new RegExp(`^\\s*(?:(?:hey|ok|okay|so|um)[,\\s]+)?(?:(?:can|could|would|will) (?:you|u|upmore) (?:please |pls )?|please |pls |plz )?(?:call|phone|ring|dial)(?: up)? ${NOT_A_CALL}\\S`, "i"),
  new RegExp(`\\b(?:need|want|get) (?:you|upmore) to (?:call|phone|ring)(?: up)? ${NOT_A_CALL}\\S`, "i"),
];
export const PHONE_CALL_NONE =
  "I don't make phone calls, so I haven't called anyone. If you call them yourself, I can tell you what to say and what to ask for; or tell me what it's about and I'll check whether it can be done online instead.";
export function phoneCallReply(message: string): string | null {
  const m = String(message || "");
  return PHONE_ASK.some((re) => re.test(m)) ? PHONE_CALL_NONE : null;
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
  const subsOpps = SubscriptionSavings.opportunities(SubscriptionSavings.find({ today, book: OfferBook.create(OFFER_TERMS_JSON), transactions: rows }));
  const ranked = AgentSave.rank(found.opportunities.concat(subsOpps), null).slice(0, 3);
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
