// Buy now, pay later through the chat's money answers (agent-chat/_shared/money_answers.ts -> packages/domain/97-bnpl.js;
// capability list items 85 and 87). Accounts and transactions here are MOCK fixtures; the provider terms are the real
// dated file, read through the router bundle. No file or network permission is needed.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { moneyKind, moneyReply, MONEY_UNAVAILABLE, type AccountRow, type MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";
import { NO_ACCOUNTS, noDataReply } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";
import PROVIDERS from "../../packages/offers/bnpl-providers.json" with { type: "json" };
// Read as text so the suite runs without file permissions (the evidence recorder runs it with none).
import SRC_HANDLER from "../../supabase/functions/agent-chat/handler.ts" with { type: "text" };
import SRC_DOMAIN from "../../packages/domain/97-bnpl.js" with { type: "text" };

const TZ = "America/New_York";
const NOW = new Date("2026-10-13T03:30:00Z"); // 11:30 p.m. Oct 12 in New York; the bank's UTC date is Oct 13
const SYNC = "2026-10-13T03:00:00Z";
const ACCOUNTS: AccountRow[] = [
  { account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 100000, available_cents: 96000, balance_as_of: SYNC, fetched_at: SYNC, status: "active", currency: "USD" },
  { account_id: "mock-card", name: "Freedom Flex", institution: "Mock Chase", account_kind: "credit", balance_cents: -20000, available_cents: null, balance_as_of: SYNC, fetched_at: SYNC, status: "active", currency: "USD" },
];
let n = 0;
const tx = (posted_on: string, amount_cents: number, merchant_raw: string, o: Partial<MoneyTxRow> = {}): MoneyTxRow =>
  ({ account_id: "mock-chk", provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, currency: "USD", fetched_at: SYNC, ...o });
const TX: MoneyTxRow[] = ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].map((d) => tx(d, -80000, "OAK PROPERTY MGMT RENT")).concat([
  tx("2026-09-28", -2500, "KLARNA*TARGET"), tx("2026-10-12", -2500, "KLARNA*TARGET"),
  tx("2026-09-07", -4000, "KLARNA INC"), tx("2026-09-21", -4000, "KLARNA INC"), tx("2026-10-05", -4000, "KLARNA INC"),
  tx("2026-08-03", -6218, "AFFIRM *PAY"), tx("2026-09-03", -6218, "AFFIRM *PAY"), tx("2026-10-03", -6218, "AFFIRM *PAY"),
  tx("2026-09-14", -2650, "ZIP.CO"), tx("2026-09-28", -2500, "ZIP.CO"), tx("2026-10-12", -2500, "ZIP.CO"),
  tx("2026-10-01", -3000, "PAYPAL *PAY IN 4"), tx("2026-10-01", -3000, "PAYPAL INST XFER"), tx("2026-10-02", -4500, "ZIPCAR TRIP"), tx("2026-10-03", -12000, "AFFIRMATIVE INSURANCE"),
]);
const read = (accounts: AccountRow[] = ACCOUNTS, transactions: MoneyTxRow[] = TX) => ({ accounts: async () => accounts, transactions: async () => transactions });

Deno.test("routing: the pay-later asks are money answers; paying, advice and look-alikes go on; the old asks keep their kind", () => {
  for (const m of ["show my buy now pay later plans", "what do I owe klarna", "my afterpay payments", "bnpl", "how much do i owe on affirm", "when is my next afterpay payment"]) assertEquals(moneyKind(m), "bnpl", m);
  for (const m of ["would a $400 afterpay plan push me negative", "can i afford a $200 klarna pay in 4", "will my bnpl payments push me negative"]) assertEquals(moneyKind(m), "bnplcheck", m);
  const kept: [string, string | null][] = [["pay my klarna", null], ["pay off my affirm early", null], ["should i use afterpay", null], ["can i afford a $400 tv", "afford"], ["what bills are coming up", "upcoming"],
    ["how much did i spend last month", "spend"], ["did my klarna payment go through", "through"], ["what's my zip code", null], ["zip", null]];
  for (const [m, k] of kept) assertEquals(moneyKind(m), k, m);
});

Deno.test("item 85 through moneyReply: every plan, the certain total, the unknown ones, the not-built line and the source", async () => {
  const r = (await moneyReply("show my buy now pay later plans", NOW, read(), { tz: TZ }))!;
  assertEquals(r, [
    "Buy now, pay later: 5 plans in progress in your bank and card rows.",
    "- Klarna: $40.00 every 2 weeks, 3 of 4 payments seen (Sep 7, Sep 21, Oct 5). Next expected Oct 19. Left: 1 payment, $40.00 (inferred from Klarna's Pay in 4 pattern).",
    "- Klarna, Target: $25.00 every 2 weeks, 2 of 4 payments seen (Sep 28, Oct 12). Next expected Oct 26. Left: 2 payments, $50.00 (inferred from Klarna's Pay in 4 pattern).",
    "- Zip: $25.00 every 2 weeks after a first payment of $26.50 (Zip's first payment can include a fee), 3 of 4 payments seen (Sep 14, Sep 28, Oct 12). Next expected Oct 26. Left: 1 payment, $25.00 (inferred from Zip's Pay in 4 pattern).",
    "- Affirm: $62.18 a month, 3 payments seen (Aug 3, Sep 3, Oct 3). Next expected Nov 3 (inferred from the monthly pattern). Still owed: not in your bank rows; check the Affirm app.",
    "- PayPal: 1 payment seen ($30.00 on Oct 1). One payment doesn't show the schedule; check the PayPal app.",
    "Still owed where the plan's shape makes it certain: $115.00 in 3 plans (inferred from the Pay in 4 pattern).",
    "Not known from your rows: what's left on Affirm and PayPal. Your bank rows show payments, not balances.",
    "Paying a plan, paying one off early or moving a payment date isn't built; this is read from your rows only.",
    "Heads up: with your newest plan (Klarna, Target), your cash is projected to reach -$17.18 on Nov 9; without it, $32.82 on Nov 3 (from your cash, repeating bills, paychecks and pay-later payments only; everyday spending isn't counted).",
    "From your linked accounts, transactions through Oct 12, 2026, as of Oct 12, 11:00 PM EDT.",
  ].join("\n"));
  const k = (await moneyReply("what do I owe klarna", NOW, read(), { tz: TZ }))!;
  assertMatch(k, /^Klarna: 2 plans in progress in your bank and card rows\.\n/);
  assert(!/Affirm|Zip|PayPal/.test(k), k);
});

Deno.test("item 87 through moneyReply: the next 30 days with a new plan, numbers only, with the balance source", async () => {
  const r = (await moneyReply("would a $400 afterpay plan push me negative", NOW, read(), { tz: TZ }))!;
  const L = r.split("\n");
  assertEquals(L[0], "Next 30 days (Oct 12-Nov 11), from your cash, repeating bills, paychecks and pay-later payments: lowest -$17.18 on Nov 9, below zero.");
  assertEquals(L[1], "With a new $400.00 Afterpay plan: lowest -$317.18 on Nov 9, below zero.");
  assertEquals(L[2], "That plan, inferred from Afterpay's Pay in 4 terms: 4 payments of $100.00, the first today, then every 2 weeks (Oct 12, Oct 26, Nov 9, Nov 23); 3 fall in these 30 days ($300.00).");
  assertMatch(r, /\nFrom your linked accounts \(Mock Bank\): balances as of Oct 12, 11:00 PM EDT; transactions through Oct 12, 2026, synced Oct 12, 11:00 PM EDT\.$/);
  assert(!/\bshould\b|\brecommend/i.test(r), r);
});

Deno.test("nothing linked, a failed read, no pay-later rows", async () => {
  assertEquals(await moneyReply("bnpl", NOW, read([], TX), { tz: TZ }), null);
  assertEquals(noDataReply("bnpl", 0), null); // the handler's NO_ACCOUNTS line covers it through moneyKind
  assert(NO_ACCOUNTS.length > 0);
  assertEquals(await moneyReply("bnpl", NOW, { accounts: async () => ACCOUNTS, transactions: async () => { throw new Error("down"); } }, { tz: TZ }), MONEY_UNAVAILABLE);
  const none = (await moneyReply("my afterpay payments", NOW, read(ACCOUNTS, TX.slice(0, 4)), { tz: TZ }))!;
  assertEquals(none.split("\n")[0], "I don't see any Afterpay payments in your bank and card rows.");
  assert(!/\$0\.00/.test(none), none);
});

Deno.test("the bundle carries the dated provider file and the handler reaches these answers through moneyReply", () => {
  assertEquals((PROVIDERS as any).checked_on, "2026-10-12");
  assertMatch(SRC_HANDLER, /direct = await moneyReply\(/);
  assert(!/fetch\(|Deno\.|XMLHttpRequest/.test(SRC_DOMAIN), "the module makes no calls of its own");
});
