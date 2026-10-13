// With nothing linked, every direct answer says so, never "I looked through your accounts" (overnight sweep,
// 2026-10-12: it found "did my bank fail?" claiming to have checked linked accounts, and a rewards question about a
// named card asking "which card?"). Runs the routing corpus through each answer with empty readers.
import { assert } from "jsr:@std/assert@1";
import { findMoneyReply } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";
import { disputeReply } from "../../supabase/functions/agent-chat/_shared/dispute_answer.ts";
import { subscriptionReply } from "../../supabase/functions/agent-chat/_shared/subscription_answer.ts";
import { moneyReply } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";
import { rewardsReply } from "../../supabase/functions/agent-chat/_shared/rewards_answer.ts";
import { priceDropReply } from "../../supabase/functions/agent-chat/_shared/price_drop_answer.ts";
import { moneyOwedReply } from "../../supabase/functions/agent-chat/_shared/money_owed_answer.ts";
import { airlineReply } from "../../supabase/functions/agent-chat/_shared/airline_answer.ts";
import { unclaimedReply } from "../../supabase/functions/agent-chat/_shared/unclaimed_answer.ts";
import { whatsNewReply } from "../../supabase/functions/agent-chat/_shared/whats_new_answer.ts";
import { budgetReply } from "../../supabase/functions/agent-chat/_shared/budget_answer.ts";
import { cardOffersReply } from "../../supabase/functions/agent-chat/_shared/card_offers_answer.ts";
import { winBackReply } from "../../supabase/functions/agent-chat/_shared/win_back_answer.ts";
import { substitutesReply } from "../../supabase/functions/agent-chat/_shared/substitutes_answer.ts";
import { deadlinesReply } from "../../supabase/functions/agent-chat/_shared/deadlines_answer.ts";
import { feeAuditReply } from "../../supabase/functions/agent-chat/_shared/fee_audit_answer.ts";
import { paycheckReply } from "../../supabase/functions/agent-chat/_shared/paycheck_answer.ts";
import { foundMoneyReply } from "../../supabase/functions/agent-chat/_shared/found_money_answer.ts";
import { tipFeesReply } from "../../supabase/functions/agent-chat/_shared/tip_fees_answer.ts";
// Read as text imports so the suite runs without file permissions (the evidence recorder runs it with none).
import SRC_DIRECT_ASKS from "./fixtures/direct-asks.json" with { type: "text" };
import SRC_HANDLER from "../../supabase/functions/agent-chat/handler.ts" with { type: "text" };

const T = "2026-10-12", NOW = new Date("2026-10-12T15:00:00Z"), none = async () => [] as any[];
const ANSWERS: [string, (m: string) => Promise<string | null>][] = [
  // Wave 1 answers (2026-10-12), first in the handler's chain: with no accounts both return null; the tip/fee
  // answer's only no-data reply is its honest none-on-file line, which claims no look at any account.
  ["paycheck", (m) => paycheckReply(m, NOW, { accounts: none, transactions: none }, { tz: "America/New_York" })],
  ["fee audit", (m) => feeAuditReply(m, NOW, { accounts: none, transactions: none }, { tz: "America/New_York" })],
  ["tip fees", (m) => tipFeesReply(m, NOW, { receipts: none, transactions: none }, { tz: "America/New_York" })],
  ["money", (m) => moneyReply(m, NOW, { accounts: none, transactions: none })],
  // A budget the person set, with nothing linked: the reply says nothing is linked, never "$0.00 spent".
  ["budgets", (m) => budgetReply(m, NOW, { budgets: async () => [{ id: "budget-groceries-mock", kind: "category_budget", category: "groceries", amount_cents: 40000, status: "active" }], transactions: none })],
  ["what's new", (m) => whatsNewReply(m, T, none, none)], ["dispute", (m) => disputeReply(m, T, none, { hasPhoto: false })],
  ["win-back", (m) => winBackReply(m, T, none, none)], ["subscription", (m) => subscriptionReply(m, T, none)], ["substitutes", (m) => substitutesReply(m, T, none)], ["find money", (m) => findMoneyReply(m, T, none)], ["card offers", (m) => cardOffersReply(m, T, none, none)], ["rewards", (m) => rewardsReply(m, T, none, none)],
  ["price drop", (m) => priceDropReply(m, T, none)], ["airline", (m) => airlineReply(m, T, none)], ["unclaimed", (m) => unclaimedReply(m, T, none, none)],
  ["money owed", (m) => moneyOwedReply(m, T, none, none)],
  // Found money (cluster K12): with nothing linked the settlements/recalls replies report no match on the person's
  // evidence (never "$0.00", never a claim to have searched accounts) and the unclaimed plan asks for the name/states.
  ["found money", (m) => foundMoneyReply(m, T, none)],
  // Deadlines read no account: dated public dates and the person's own facts (none here).
  ["deadlines", (m) => deadlinesReply(m, NOW, { tz: "America/New_York", watches: none })],
];
const corpus = JSON.parse(SRC_DIRECT_ASKS);
const LOOKED = /\b(?:in|through|from|among|or|and) your linked (?:accounts|cards|history|transactions)\b|\byour linked (?:cards|accounts), whose history\b/i;
const SAYS_NONE = /\b(?:nothing is linked|no (?:card|account|bank)[a-z ]* (?:is )?linked|don't see a (?:connected|linked)|not linked)\b/i;

Deno.test("with nothing linked, no direct reply claims to have looked through the person's accounts", async () => {
  for (const [ask] of corpus.asks as [string, string | null][]) {
    for (const [name, f] of ANSWERS) {
      const r = await f(ask);
      if (!r) continue;
      // A sentence about later ("ask me after Oct 20 and I'll look for it in your linked accounts") is a promise, not a claim.
      const claims = r.split(/(?<=[.!?])\s+|\n/).filter((l) => !/\bI'll\b/.test(l)).join("\n");
      assert(!LOOKED.test(claims) || SAYS_NONE.test(claims), `${name} / "${ask}": ${r.slice(0, 200)}`);
      assert(!/\$0\.00/.test(r), `${name} / "${ask}" states $0.00 from no data: ${r.slice(0, 200)}`);
      break;
    }
  }
});

Deno.test("this sweep covers every direct answer the handler has", () => {
  const h = SRC_HANDLER;
  assert([...h.matchAll(/direct = await (\w+)\(/g)].length === ANSWERS.length, "add the new answer to this sweep");
});
