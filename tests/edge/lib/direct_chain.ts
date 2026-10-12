// The direct answers in handler.ts, in its own order, over one set of MOCK rows: shared by the routing test
// (tests/edge/direct-order.test.ts) and the routing corpus (tests/edge/direct-routing-corpus.test.ts), so a new answer is
// added once and both walk exactly what the handler walks. No tests here.
import { findMoneyReply } from "../../../supabase/functions/agent-chat/_shared/direct_answers.ts";
import { disputeReply } from "../../../supabase/functions/agent-chat/_shared/dispute_answer.ts";
import { subscriptionReply } from "../../../supabase/functions/agent-chat/_shared/subscription_answer.ts";
import { moneyReply } from "../../../supabase/functions/agent-chat/_shared/money_answers.ts";
import { rewardsReply } from "../../../supabase/functions/agent-chat/_shared/rewards_answer.ts";
import { cardOffersReply } from "../../../supabase/functions/agent-chat/_shared/card_offers_answer.ts";
import { priceDropReply } from "../../../supabase/functions/agent-chat/_shared/price_drop_answer.ts";
import { moneyOwedReply } from "../../../supabase/functions/agent-chat/_shared/money_owed_answer.ts";
import { airlineReply } from "../../../supabase/functions/agent-chat/_shared/airline_answer.ts";
import { unclaimedReply } from "../../../supabase/functions/agent-chat/_shared/unclaimed_answer.ts";
import { whatsNewReply } from "../../../supabase/functions/agent-chat/_shared/whats_new_answer.ts";
import { winBackReply } from "../../../supabase/functions/agent-chat/_shared/win_back_answer.ts";
import { substitutesReply } from "../../../supabase/functions/agent-chat/_shared/substitutes_answer.ts";
import { budgetReply } from "../../../supabase/functions/agent-chat/_shared/budget_answer.ts";
import { deadlinesReply } from "../../../supabase/functions/agent-chat/_shared/deadlines_answer.ts";
// Read as text imports so the suite runs without file permissions (the evidence recorder runs it with none).
import SRC_HANDLER from "../../../supabase/functions/agent-chat/handler.ts" with { type: "text" };

export const NOW = new Date("2026-10-12T15:05:00Z"), TODAY = "2026-10-12";
const ACCOUNTS = [
  { account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 250000, available_cents: 250000, balance_as_of: "2026-10-12T08:00:00Z", fetched_at: "2026-10-12T08:00:00Z", status: "active", currency: "USD" },
  { account_id: "mock-ff", name: "Chase Freedom Flex", institution: "Mock Chase", account_kind: "credit", balance_cents: -12000, available_cents: null, balance_as_of: "2026-10-12T08:00:00Z", fetched_at: "2026-10-12T08:00:00Z", status: "active", currency: "USD" },
];
const TX = [
  ["2026-08-05", -1599, "NETFLIX.COM"], ["2026-09-05", -1599, "NETFLIX.COM"], ["2026-10-05", -1599, "NETFLIX.COM"],
  ["2026-10-03", -9630, "TARGET 00012345"], ["2026-09-28", -48900, "DELTA AIR LINES"], ["2026-10-07", -4200, "KROGER #1"],
  ["2026-10-01", 300000, "MOCK EMPLOYER PAYROLL"],
].map(([d, c, m], i) => ({ account_id: i % 2 ? "mock-ff" : "mock-chk", provider_transaction_id: `mock-${i}`, posted_on: d as string, amount_cents: c as number, merchant_raw: m as string, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T08:00:00Z" }));
export const oldest = async () => TX.slice().sort((a, b) => (a.posted_on < b.posted_on ? -1 : 1)) as any[];
const accounts = async () => ACCOUNTS as any[];
// A Netflix cancellation the cancel flow recorded (MOCK).
const CANCELS = [{ merchant: "NETFLIX.COM", name: "Netflix", state: "cancelled", cancelled_at: Date.parse("2026-10-06T12:00:00Z"), reference: null }];
export const EMAIL = "From: Netflix <info@mailer.netflix.com>\nDate: Oct 10, 2026\nWe miss you! Come back to Netflix for $6.99/month for 3 months, then $15.99/month. Offer ends Nov 15, 2026.";
export const RECEIPT = "can i swap to store brands here?\nTIDE PODS 42CT 13.99\nCHEERIOS 18OZ 4.29\nBANANAS 1.29\nTOTAL 19.57";

// A groceries budget the person set (MOCK), stored the way the settings path stores it.
export const BUDGETS = [{ id: "budget-groceries-mock", kind: "category_budget", category: "groceries", amount_cents: 40000, period: "month", created_at: "2026-10-01T12:00:00.000Z", created_on: "2026-10-01", status: "active" }];

export const ANSWERS: Record<string, (m: string) => Promise<string | null>> = {
  budgetReply: (m) => budgetReply(m, NOW, { budgets: async () => BUDGETS, transactions: async () => TX as any[] }, { tz: "America/New_York" }),
  moneyReply: (m) => moneyReply(m, NOW, { accounts, transactions: async () => TX as any[] }),
  disputeReply: (m) => disputeReply(m, TODAY, oldest, { hasPhoto: false }),
  winBackReply: (m) => winBackReply(m, TODAY, oldest, async () => CANCELS),
  subscriptionReply: (m) => subscriptionReply(m, TODAY, oldest),
  substitutesReply: (m) => substitutesReply(m, TODAY, oldest),
  findMoneyReply: (m) => findMoneyReply(m, TODAY, oldest),
  cardOffersReply: (m) => cardOffersReply(m, TODAY, accounts, oldest),
  rewardsReply: (m) => rewardsReply(m, TODAY, accounts, oldest),
  priceDropReply: (m) => priceDropReply(m, TODAY, oldest),
  moneyOwedReply: (m) => moneyOwedReply(m, TODAY, oldest, accounts),
  airlineReply: (m) => airlineReply(m, TODAY, oldest),
  unclaimedReply: (m) => unclaimedReply(m, TODAY, oldest, accounts),
  whatsNewReply: (m) => whatsNewReply(m, TODAY, async () => TX as any[], async () => []),
  // The person's settings row as the handler reads it: here the budget only, no deadline facts (MOCK).
  deadlinesReply: (m) => deadlinesReply(m, NOW, { tz: "America/New_York", watches: () => BUDGETS }),
};
const handler = SRC_HANDLER;
export const ORDER = [...handler.matchAll(/direct = await (\w+)\(/g)].map((m) => m[1]);
