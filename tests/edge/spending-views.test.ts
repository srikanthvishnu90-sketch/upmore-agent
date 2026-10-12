// This month against last month and the person's own average, and spending by card, through the chat's money answers
// (agent-chat/_shared/money_answers.ts -> packages/domain/94-spending-views.js; capability list items 12 and 13).
// Accounts and transactions here are MOCK fixtures. No file or network permission is needed.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { moneyKind, moneyReply, MONEY_UNAVAILABLE, type AccountRow, type MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";
import { NO_ACCOUNTS, noDataReply } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";
// Read as text so the suite runs without file permissions (the evidence recorder runs it with none).
import SRC_HANDLER from "../../supabase/functions/agent-chat/handler.ts" with { type: "text" };

const TZ = "America/New_York";
const NOW = new Date("2026-10-13T03:30:00Z"); // 11:30 p.m. Oct 12 in New York; the bank's UTC date is Oct 13
const SYNC = "2026-10-13T03:00:00Z";
const acct = (account_id: string, name: string, institution: string, account_kind: string): AccountRow =>
  ({ account_id, name, institution, account_kind, balance_cents: 0, available_cents: null, balance_as_of: SYNC, fetched_at: SYNC, status: "active", currency: "USD" });
const ACCOUNTS: AccountRow[] = [acct("mock-chk", "Everyday Checking", "Mock Bank", "checking"), acct("mock-amex", "Gold Card", "American Express", "credit"), acct("mock-ff", "Freedom Flex", "Chase", "credit")];
let n = 0;
const tx = (posted_on: string | null, amount_cents: number, merchant_raw: string, account_id = "mock-chk", o: Partial<MoneyTxRow> = {}): MoneyTxRow =>
  ({ account_id, provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, currency: "USD", fetched_at: SYNC, ...o });
const TX: MoneyTxRow[] = [
  tx("2026-07-01", -20000, "KROGER #0042", "mock-amex"), tx("2026-07-08", -3000, "CHIPOTLE 1234", "mock-ff"), tx("2026-07-20", -5000, "BLUE HERON HARDWARE"),
  tx("2026-08-02", -18000, "KROGER #0042", "mock-amex"), tx("2026-08-10", -1500, "STARBUCKS STORE 01234", "mock-ff"), tx("2026-08-25", -4000, "SHELL OIL 57444"),
  tx("2026-09-04", -16000, "KROGER #0042", "mock-amex"), tx("2026-09-05", -1599, "NETFLIX.COM", "mock-ff"), tx("2026-09-15", -2500, "CHIPOTLE 1234", "mock-ff"), tx("2026-09-20", -9000, "TARGET 00012345", "mock-amex"),
  tx("2026-10-01", 250000, "MOCK EMPLOYER PAYROLL"), tx("2026-10-02", -25000, "KROGER #0042", "mock-amex"), tx("2026-10-03", -50000, "ONLINE TRANSFER TO SAV 9921", "mock-chk", { is_transfer: true }),
  tx("2026-10-04", -3000, "PARIS CAFE", "mock-amex", { currency: "EUR" }), tx("2026-10-05", -1599, "NETFLIX.COM", "mock-ff"), tx("2026-10-06", -6000, "TRADER JOE S #552", "mock-amex"),
  tx("2026-10-07", -4500, "CHIPOTLE 1234", "mock-ff"), tx("2026-10-08", -30000, "CREDIT CARD PAYMENT THANK YOU"), tx("2026-10-09", -3000, "BLUE HERON HARDWARE"),
  tx("2026-10-10", 2000, "KROGER #0042 REFUND", "mock-amex"), tx("2026-10-11", -4000, "SHELL OIL 57444"), tx("2026-10-13", -1200, "STARBUCKS STORE 01234", "mock-ff"),
  tx(null, -2850, "DOORDASH*THAI PLACE", "mock-ff", { is_pending: true }),
];
function readers(accounts: AccountRow[] = ACCOUNTS, transactions: MoneyTxRow[] = TX) {
  const calls = { accounts: 0, transactions: 0 };
  return { calls, read: { accounts: async () => { calls.accounts++; return accounts; }, transactions: async () => { calls.transactions++; return transactions; } } };
}
const SRC = "From your linked accounts, transactions through Oct 13, 2026, as of Oct 12, 11:00 PM EDT.";

Deno.test("routing: the comparison and spending-by-card asks, in the person's words; the old asks keep their kind", () => {
  for (const m of ["how does this month compare to last month", "am I spending more than usual", "this month vs last month", "how's my spending compared to normal", "did I spend more on food this month than last"]) assertEquals(moneyKind(m), "compare", m);
  for (const m of ["spending by card", "which card do I use most", "how much did I put on my amex this month", "what's on my chase card", "how much did i spend on my freedom flex last month"]) assertEquals(moneyKind(m), "cards", m);
  const kept: [string, string | null][] = [["how much did i spend last month", "spend"], ["how much did i spend on food last month", "spend"], ["what's my credit card balance", "balance"], ["how am i doing this month", "checkup"],
    ["did rent go through", "through"], ["how much can i spend", "safe"], ["should i spend less than last month", null], ["how much did i spend on my car", "spend"], ["what's on my credit report", null], ["which card should i use for gas", null]];
  for (const [m, k] of kept) assertEquals(moneyKind(m), k, m);
});

Deno.test("this month against last month and the average, through moneyReply, in the person's own month (tz)", async () => {
  const { calls, read } = readers();
  const r = await moneyReply("am I spending more than usual", NOW, read, { tz: TZ });
  assertEquals(r, [
    "This month so far (Oct 1-12), you spent $432.99.",
    "Same days last month (Sep 1-12, day 12 vs day 12): $175.99, so this month is $257.00 more.",
    "Your average over the last 3 full months (Jul-Sep): $268.66 a month, $200.33 by day 12; this month is $232.66 above that.",
    "Biggest changes from the same days last month: groceries up $130.00 ($290.00 vs $160.00), restaurants up $57.00 ($57.00 vs $0.00), gas up $40.00 ($40.00 vs $0.00).",
    "Refunds taken off: $20.00.",
    "Pending, not added yet: $28.50 (1 charge).",
    "In another currency, not added: 30.00 EUR.",
    "$30.00 of this month's spending matched no category I know (none the same days last month), so it's in the totals but not in the changes.",
    `${SRC} Transfers and card payments are left out.`,
  ].join("\n"));
  assertEquals(calls, { accounts: 1, transactions: 1 });
  // The same moment in UTC is already Oct 13: day 13, and the as-of time is said in UTC.
  const utc = (await moneyReply("am I spending more than usual", NOW, read))!;
  assertMatch(utc, /^This month so far \(Oct 1-13\), you spent \$432\.99\.\nSame days last month \(Sep 1-13, day 13 vs day 13\)/);
  assertMatch(utc, /as of Oct 13, 3:00 AM UTC\./);
});

Deno.test("a category in the ask narrows the comparison to it, its own average included", async () => {
  const r = (await moneyReply("did I spend more on food this month than last", NOW, readers().read, { tz: TZ }))!;
  assertEquals(r.split("\n").slice(0, 3), [
    "This month so far (Oct 1-12), you spent $347.00 on food: $290.00 groceries, $57.00 restaurants.",
    "Same days last month (Sep 1-12, day 12 vs day 12): $160.00, so this month is $187.00 more.",
    "Your average over the last 3 full months (Jul-Sep): $203.33 a month on food, $195.00 by day 12; this month is $152.00 above that.",
  ]);
});

Deno.test("spending by card through moneyReply: names as stored, no digits without a mask, shares and top places", async () => {
  const { calls, read } = readers();
  assertEquals(await moneyReply("spending by card", NOW, read, { tz: TZ }), [
    "Spending by card and account this month so far (Oct 1-12), $432.99 in all:",
    "- American Express Gold Card: $290.00, 67% (top: Kroger $230.00, Trader Joe's $60.00)",
    "- Chase Freedom Flex: $72.99, 17% (top: Chipotle $45.00, Netflix $15.99, Starbucks $12.00)",
    "- Mock Bank Everyday Checking: $70.00, 16% (top: Shell $40.00, Blue Heron Hardware $30.00)",
    "Refunds taken off: American Express Gold Card $20.00.",
    "Pending, not added yet: Chase Freedom Flex $28.50 (1 charge).",
    "In another currency, not added: American Express Gold Card 30.00 EUR.",
    `${SRC} Transfers and card payments are left out, so a card paid from checking isn't counted twice.`,
  ].join("\n"));
  assertEquals(calls, { accounts: 1, transactions: 1 });
  assertEquals((await moneyReply("how much did I put on my amex this month", NOW, read, { tz: TZ }))!.split("\n")[0],
    "American Express Gold Card: $290.00 this month so far (Oct 1-12), 67% of the $432.99 you spent across your accounts. Top: Kroger $230.00, Trader Joe's $60.00.");
  assertEquals((await moneyReply("which card do I use most", NOW, read, { tz: TZ }))!.split("\n")[0],
    "Most of it went on American Express Gold Card: $290.00 of the $432.99 you spent this month so far (Oct 1-12), 67%.");
  assertMatch((await moneyReply("what's on my chase card", NOW, read, { tz: TZ }))!, /^Chase Freedom Flex: \$72\.99 this month so far \(Oct 1-12\), 17% of the \$432\.99/);
});

Deno.test("nothing linked: the reply is null and the handler's nothing-linked line answers; a failed read is said, never guessed", async () => {
  for (const m of ["am I spending more than usual", "this month vs last month", "spending by card", "how much did I put on my amex this month"]) {
    assertEquals(await moneyReply(m, NOW, readers([], []).read, { tz: TZ }), null, m);
    const k = moneyKind(m);
    assert(k !== null && k !== "explain", `${m}: the handler answers NO_ACCOUNTS only for a money kind`);
    assertEquals(noDataReply(m, 0) ?? (k ? NO_ACCOUNTS : null), NO_ACCOUNTS, m);
  }
  assert(/linkedCount === 0 && moneyKind\(message\) && moneyKind\(message\) !== "explain" \? NO_ACCOUNTS/.test(SRC_HANDLER), "the handler still says NO_ACCOUNTS for every money kind");
  const failTx = { accounts: async () => ACCOUNTS, transactions: async () => { throw new Error("db down"); } };
  assertEquals(await moneyReply("this month vs last month", NOW, failTx, { tz: TZ }), MONEY_UNAVAILABLE);
  assertEquals(await moneyReply("spending by card", NOW, failTx, { tz: TZ }), MONEY_UNAVAILABLE);
  const failAcct = { accounts: async () => { throw new Error("db down"); }, transactions: async () => TX };
  assertEquals(await moneyReply("spending by card", NOW, failAcct, { tz: TZ }), MONEY_UNAVAILABLE);
});

Deno.test("every comparison and card reply with a dollar amount names its source and a date, and gives no advice", async () => {
  const asks = ["how does this month compare to last month", "am I spending more than usual", "this month vs last month", "how's my spending compared to normal", "did I spend more on food this month than last",
    "spending by card", "which card do I use most", "how much did I put on my amex this month", "what's on my chase card", "spending by card last month", "spending by account this year"];
  for (const m of asks) {
    const r = (await moneyReply(m, NOW, readers().read, { tz: TZ }))!;
    assert(/\$\d/.test(r), m);
    assertMatch(r, /From your linked accounts, transactions through [A-Z][a-z]{2} \d{1,2}, \d{4}/, m);
    assert(!/\b(?:you should|try to|consider|recommend|cut back|too much)\b/i.test(r), `${m}: ${r}`);
  }
});
