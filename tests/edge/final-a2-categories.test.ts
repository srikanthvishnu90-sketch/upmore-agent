// Final A2 — category truth from merchant knowledge, through the production code path (the router bundle's
// MoneyAnswers, driven by agent-chat's own moneyReply harness with mock readers over the owner's real-row twins).
// Before: the ledger filed the $10.00 POLYMARKET charge as groceries (the bare word "market") and the chat placed
// almost none of these merchants. After: dated merchant knowledge (packages/offers/merchant-knowledge.json,
// MERCHANT_KNOWLEDGE_JSON in the bundle) is consulted before the word rules on both surfaces.
// Hand count (September): groceries $0.00; prediction markets $20.21 (Polymarket $10.00 + Kalshi $10.21);
// sports betting $146.79; health & wellness $330.39; pay-later $119.66; fees $25.00; person-to-person $185.00.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { MoneyAnswers, AgentLedger, MERCHANT_KNOWLEDGE_JSON } from "../../supabase/functions/_shared/router_core.js";
import { moneyReply, type AccountRow, type MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";

const NOW = new Date("2026-10-12T15:05:00Z");
const ACCOUNTS: AccountRow[] = [
  { account_id: "chk", name: "TOTAL CHECKING", institution: "Chase", account_kind: "checking", balance_cents: 123456, available_cents: 123456, balance_as_of: "2026-10-12T09:00:00Z", fetched_at: "2026-10-12T14:00:00Z", status: "active" },
];
let n = 0;
const tx = (posted_on: string, amount_cents: number, merchant_raw: string): MoneyTxRow =>
  ({ account_id: "chk", provider_transaction_id: `a2-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, fetched_at: "2026-10-12T14:00:00Z" });
const SEPT: MoneyTxRow[] = [
  tx("2026-09-21", -1000, "POLYMARKET CLEARING POLYMARKETCLE FL"), tx("2026-09-23", -1021, "KALSHI KALSHI.COM NY 09/22"),
  tx("2026-09-08", -2000, "Rebet 5550134477 NH 09/06"), tx("2026-09-22", -5513, "Rebet 5550134477 NH 09/22"), tx("2026-09-23", -7166, "Rebet 5550134477 NH 09/22"),
  tx("2026-09-16", -30240, "PEPTIRA 402-5550199 NE 09/15"), tx("2026-09-17", -2799, "PEPTIRA 402-5550199 NE 09/15"),
  tx("2026-09-15", -6144, "AFFIRM.COM PAYMENTS 185-55501234 CA"), tx("2026-09-02", -1600, "AFFIRM * PAY KJ4OR9CH SAN FRANCISCO CA"),
  tx("2026-09-21", -2500, "MONTHLY SERVICE FEE"), tx("2026-09-25", -10000, "Zelle payment to Avery"),
  tx("2026-09-14", -8500, "APPLE CASH INST XFER SENT MONEY CUPERTINO CA"), tx("2026-09-01", -500, "ROBINHOOD DEBITS 555001999 WEB ID:"),
  tx("2026-09-18", -289, "GELATOTECA SUSO VENEZIA 09/17 EURO 2.50 X 1.156000 (EXCHG RTE)"),
];
const read = { accounts: async () => ACCOUNTS, transactions: async () => SEPT };
const reply = (m: string) => moneyReply(m, NOW, read, { tz: "America/Chicago" });

Deno.test("the bundle carries the dated merchant knowledge", () => {
  assertEquals((MERCHANT_KNOWLEDGE_JSON as any).checked_on, "2026-10-12");
  assert((MERCHANT_KNOWLEDGE_JSON as any).merchants.length >= 100);
  const poly = (MERCHANT_KNOWLEDGE_JSON as any).merchants.find((m: any) => m.id === "polymarket");
  assertEquals([poly.money_group, poly.ledger_category], ["prediction_markets", "prediction_markets"]);
});

Deno.test("production path: both classifiers in the bundle agree on the real descriptors", () => {
  const ma = (r: string) => (MoneyAnswers as any).classify(r)?.group ?? null;
  const lg = (r: string) => (AgentLedger as any).categorize({ merchant_raw: r, amount: -10 }).category;
  const cases: [string, string, string][] = [
    ["POLYMARKET CLEARING POLYMARKETCLE FL", "prediction_markets", "prediction_markets"],
    ["KALSHI.COM", "prediction_markets", "prediction_markets"],
    ["REBET 5550134477 NH 09/22", "sports_betting", "sports_betting"],
    ["PEPTIRA 402-5550199 NE 09/15", "health", "health"],
    ["WWW.FIVERR.COM NEW YORK NY", "work_services", "work_services"],
    ["ANTHROPIC", "subscriptions", "subscriptions"],
    ["TOPGOLF", "entertainment", "entertainment"],
    ["ZARA", "shopping", "shopping"],
    ["NAF NAF GRILL", "restaurants", "dining"],
    ["TROPICAL CHILL ICE CREAM", "restaurants", "dining"],
    ["MONTHLY SERVICE FEE", "fees", "fees"],
    ["AFFIRM * PAY Y8PRUXM0 SAN FRANCISCO CA", "pay_later", "pay_later"],
    ["ROBINHOOD DEBITS XXXXX0000 WEB ID:", "investing", "transfers"],
    ["Zelle payment to Avery", "person_to_person", "transfers"],
    ["CORNER MARKET", "groceries", "groceries"],
    ["THE FRESH MARKET", "groceries", "groceries"],
    ["MARKET BASKET", "groceries", "groceries"],
  ];
  for (const [raw, g, l] of cases) { assertEquals(ma(raw), g, `MA ${raw}`); assertEquals(lg(raw), l, `ledger ${raw}`); }
  assertEquals(lg("RIVER MARKET DELI"), "groceries", "unknown merchant: the ledger's word-rule fallback");
  assertEquals(ma("RIVER MARKET DELI"), null, "chat never guesses an unknown merchant into a category (S08)");
  // A person's own rule still beats knowledge, in the bundle too.
  assertEquals((MoneyAnswers as any).classify("TARGET 00012345", [{ term: "target", group: "groceries" }]).group, "groceries");
  assertEquals((MoneyAnswers as any).classify("POLYMARKET CLEARING", [{ term: "polymarket", group: "groceries" }]).group, "groceries");
});

Deno.test("production path: the September asks tie to the hand count, groceries $0.00", async () => {
  assertMatch((await reply("how much did i spend on groceries in september"))!, /^You spent \$0\.00 on groceries in September/);
  assertMatch((await reply("how much did i spend on prediction markets in september"))!, /^You spent \$20\.21 on prediction markets in September/);
  assertMatch((await reply("how much did i spend on sports betting in september"))!, /^You spent \$146\.79 on sports betting in September/);
  assertMatch((await reply("how much did i spend on health in september"))!, /^You spent \$330\.39 on health & wellness in September/);
  assertMatch((await reply("how much did i spend on person-to-person in september"))!, /^You spent \$185\.00 on person-to-person in September/);
});
