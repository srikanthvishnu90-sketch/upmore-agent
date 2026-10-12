// Which answer owns which ask, in the handler's own order (overnight C1 merge). The direct answers in handler.ts run one
// after another and the first non-null wins, so an earlier answer that also matches a later one's ask hides it: "my
// delta flight was cancelled, what am I owed?" must reach the airline answer, not money owed or dispute. The order is
// read from handler.ts itself, so moving a line or adding an answer without a row here fails. All rows are MOCK.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { connectReply, findMoneyReply } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";
import { disputeReply } from "../../supabase/functions/agent-chat/_shared/dispute_answer.ts";
import { subscriptionReply } from "../../supabase/functions/agent-chat/_shared/subscription_answer.ts";
import { moneyReply } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";
import { rewardsReply } from "../../supabase/functions/agent-chat/_shared/rewards_answer.ts";
import { priceDropReply } from "../../supabase/functions/agent-chat/_shared/price_drop_answer.ts";
import { moneyOwedReply } from "../../supabase/functions/agent-chat/_shared/money_owed_answer.ts";
import { airlineReply } from "../../supabase/functions/agent-chat/_shared/airline_answer.ts";

const NOW = new Date("2026-10-12T15:05:00Z"), TODAY = "2026-10-12";
const ACCOUNTS = [
  { account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 250000, available_cents: 250000, balance_as_of: "2026-10-12T08:00:00Z", fetched_at: "2026-10-12T08:00:00Z", status: "active", currency: "USD" },
  { account_id: "mock-ff", name: "Chase Freedom Flex", institution: "Mock Chase", account_kind: "credit", balance_cents: -12000, available_cents: null, balance_as_of: "2026-10-12T08:00:00Z", fetched_at: "2026-10-12T08:00:00Z", status: "active", currency: "USD" },
];
const TX = [
  ["2026-08-05", -1599, "NETFLIX.COM"], ["2026-09-05", -1599, "NETFLIX.COM"], ["2026-10-05", -1599, "NETFLIX.COM"],
  ["2026-10-03", -9630, "TARGET 00012345"], ["2026-09-28", -48900, "DELTA AIR LINES"], ["2026-10-07", -4200, "KROGER #1"],
  ["2026-10-01", 300000, "MOCK EMPLOYER PAYROLL"],
].map(([d, c, m], i) => ({ account_id: i % 2 ? "mock-ff" : "mock-chk", provider_transaction_id: `mock-${i}`, posted_on: d as string, amount_cents: c as number, merchant_raw: m as string, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T08:00:00Z" }));
const oldest = async () => TX.slice().sort((a, b) => (a.posted_on < b.posted_on ? -1 : 1)) as any[];
const accounts = async () => ACCOUNTS as any[];

const ANSWERS: Record<string, (m: string) => Promise<string | null>> = {
  moneyReply: (m) => moneyReply(m, NOW, { accounts, transactions: async () => TX as any[] }),
  disputeReply: (m) => disputeReply(m, TODAY, oldest, { hasPhoto: false }),
  subscriptionReply: (m) => subscriptionReply(m, TODAY, oldest),
  findMoneyReply: (m) => findMoneyReply(m, TODAY, oldest),
  rewardsReply: (m) => rewardsReply(m, TODAY, accounts, oldest),
  priceDropReply: (m) => priceDropReply(m, TODAY, oldest),
  moneyOwedReply: (m) => moneyOwedReply(m, TODAY, oldest, accounts),
  airlineReply: (m) => airlineReply(m, TODAY, oldest),
};
const handler = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));
const ORDER = [...handler.matchAll(/direct = await (\w+)\(/g)].map((m) => m[1]);

// The answer each ask belongs to; null = none of these (it goes on to the flows or the model).
const OWNER: [string, string | null][] = [
  ["what's my balance", "moneyReply"],
  ["how much did i spend last month", "moneyReply"],
  ["dispute the $42 charge on oct 7", "disputeReply"],
  ["am i overpaying for streaming", "subscriptionReply"],
  ["find me money", "findMoneyReply"],
  ["how am i doing on my freedom flex 5%", "rewardsReply"],
  ["target dropped the price of my air fryer from $89.99 to $69.99", "priceDropReply"],
  ["does my closed card have a credit balance?", "moneyOwedReply"],
  ["am i owed any money?", "moneyOwedReply"],
  ["My Delta flight was cancelled, what am I owed?", "airlineReply"],
  ["I was denied boarding on my Spirit flight, am I owed anything?", "airlineReply"],
  ["my united flight got cancelled and they want to give me a voucher, can I get cash instead?", "airlineReply"],
  ["Delta moved my flight 4 hours earlier, can I get a refund?", "airlineReply"],
  ["my bag showed up 14 hours late on my jetblue flight, do they owe me the bag fee?", "airlineReply"],
  ["the wifi didn't work on my American Airlines flight, refund?", "airlineReply"],
  ["I got bumped from my Alaska Airlines flight, what compensation do I get?", "airlineReply"],
  ["the airline owes me money for my cancelled delta flight", "airlineReply"],
  ["I cancelled my Delta ticket, am I owed anything?", "airlineReply"],
  ["I cancelled my flight, can I get a refund?", "airlineReply"],
  ["cancel my delta flight", null],
  ["book me a flight to Denver", null],
  ["send sam 40", null],
];

Deno.test("the handler's direct answers are exactly the ones this table covers", () => {
  assertEquals(ORDER.slice().sort(), Object.keys(ANSWERS).sort(), `handler order: ${ORDER.join(", ")}`);
});

Deno.test("every ask reaches the answer that owns it, in the handler's order", async () => {
  for (const [ask, owner] of OWNER) {
    assertEquals(connectReply(ask), null, `connect takes "${ask}"`);
    let got: string | null = null;
    for (const name of ORDER) if ((await ANSWERS[name](ask)) !== null) { got = name; break; }
    assertEquals(got, owner, `"${ask}" went to ${got}, belongs to ${owner}`);
  }
});

Deno.test("an airline ask the earlier answers also match is still answered by the airline rules", async () => {
  const reply = (await airlineReply("My Delta flight was cancelled, what am I owed?", TODAY, oldest))!;
  assert(/DOT|Department of Transportation|refund/i.test(reply), reply);
});
