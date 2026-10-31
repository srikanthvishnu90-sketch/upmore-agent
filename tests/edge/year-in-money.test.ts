// The year in money through the chat's money answers (agent-chat/_shared/money_answers.ts ->
// packages/domain/96-year-in-money.js; capability list item 26). Accounts and transactions here are MOCK fixtures.
// No file or network permission is needed.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { moneyKind, moneyReply, MONEY_UNAVAILABLE, TX_READ_CAP, type AccountRow, type MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";
// Read as text so the suite runs without file permissions (the evidence recorder runs it with none).
const SRC_HANDLER = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));

const TZ = "America/New_York";
const NOW = new Date("2026-10-13T03:30:00Z"); // 11:30 p.m. Oct 12 in New York; the bank's UTC date is Oct 13
const SYNC = "2026-10-13T03:00:00Z";
const ACCOUNTS: AccountRow[] = [{ account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 0, available_cents: null, balance_as_of: SYNC, fetched_at: SYNC, status: "active", currency: "USD" }];
let n = 0;
const tx = (posted_on: string | null, amount_cents: number, merchant_raw: string, o: Partial<MoneyTxRow> = {}): MoneyTxRow =>
  ({ account_id: "mock-chk", provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, currency: "USD", fetched_at: SYNC, ...o });
const TX: MoneyTxRow[] = [];
for (const m of ["03", "04", "05", "06", "07", "08", "09", "10"]) {
  TX.push(tx(`2026-${m}-05`, -150000, "OAK PROPERTY MGMT RENT"), tx(`2026-${m}-10`, -1599, "NETFLIX.COM"));
  if (m !== "03") TX.push(tx(`2026-${m}-01`, 300000, "MOCK EMPLOYER PAYROLL"));
}
TX.push(
  tx("2026-03-15", 300000, "MOCK EMPLOYER PAYROLL"), tx("2026-03-04", -12000, "KROGER #0042"), tx("2026-06-20", -8000, "KROGER #0042"),
  tx("2026-10-02", -25000, "KROGER #0042"), tx("2026-10-10", 2000, "KROGER #0042 REFUND"), tx("2026-09-20", -9000, "TARGET 00012345"),
  tx("2026-07-08", -4500, "CHIPOTLE 1234"), tx("2026-07-20", -5000, "BLUE HERON HARDWARE"), tx("2026-08-03", -50000, "ONLINE TRANSFER TO SAV 9921", { is_transfer: true }),
  tx("2026-09-08", -30000, "CREDIT CARD PAYMENT THANK YOU"), tx("2026-06-04", -3000, "PARIS CAFE", { currency: "EUR" }), tx(null, -2850, "DOORDASH*THAI PLACE", { is_pending: true }),
  tx("2026-10-13", -1200, "STARBUCKS STORE 01234"), tx("2026-05-12", -48900, "DELTA AIR LINES"),
);
// MOCK: rows from 2025 the shared 400-day read does not reach, returned only by the history reader.
const HISTORY: MoneyTxRow[] = [tx("2025-01-02", 250000, "MOCK EMPLOYER PAYROLL"), tx("2025-03-05", -140000, "OAK PROPERTY MGMT RENT"), tx("2025-11-05", -140000, "OAK PROPERTY MGMT RENT")].concat(TX);
function readers(transactions: MoneyTxRow[] = TX, history: MoneyTxRow[] | null = null) {
  const calls = { accounts: 0, transactions: 0, history: [] as string[] };
  return {
    calls,
    read: {
      accounts: async () => { calls.accounts++; return ACCOUNTS; },
      transactions: async () => { calls.transactions++; return transactions; },
      ...(history ? { history: async (from: string) => { calls.history.push(from); return history; } } : {}),
    },
  };
}
const SAVED = "Saved or recovered by Upmore: no confirmed savings are on record yet, so none is counted here (one counts only once its record confirms it, like a fee's credit posting).";
const SRC = "From your linked accounts, transactions through Oct 13, 2026, as of Oct 12, 11:00 PM EDT. Transfers and card payments are left out.";

Deno.test("routing: the year asks are their own kind; spending, advice and small talk keep their owners", () => {
  for (const m of ["my year in money", "year in review", "how did my year go financially", "how did 2026 go", "annual review", "show me my year", "how's my year going", "my 2025 year in review"]) assertEquals(moneyKind(m), "year", m);
  const kept: [string, string | null][] = [["how much did i spend this year", "spend"], ["how much did I spend last year", "spend"], ["how am i doing", "checkup"], ["how can i do better next year", null],
    ["how did this year go", null], ["is my sapphire annual fee worth it", null], ["should i switch spotify to annual", null], ["how did the market do this year", null]];
  for (const [m, k] of kept) assertEquals(moneyKind(m), k, m);
});

Deno.test("this year so far through moneyReply, in the person's own year (tz) and with their category rules", async () => {
  const { read, calls } = readers(TX, HISTORY);
  assertEquals(await moneyReply("my year in money", NOW, read, { tz: TZ, rules: [{ term: "target", group: "groceries" }] }), [
    "Your 2026 so far (Jan 1-Oct 12): $24,000.00 in, $13,243.92 out, so $10,756.08 more came in than went out. Your linked transactions start Mar 4, 2026, so this covers only from then.",
    "By category: groceries $520.00, subscriptions $127.92, restaurants $57.00; $12,539.00 matched no category I know, so it isn't put in one.",
    "Top places: Oak Property Mgmt Rent $12,000.00, Delta Air Lines $489.00, Kroger $430.00, Netflix $127.92, Target $90.00.",
    "Biggest month: May, $2,004.99 out. Quietest full month: April, $1,515.99.",
    "Repeating charges (Oak Property Mgmt Rent, Netflix): $12,127.92 charged this year.",
    "By your category rule: \"Target\" as groceries $90.00.",
    "Refunds taken off what went out: $20.00. Pending, not added yet: $28.50 (1 charge). In another currency, not added: 30.00 EUR out.",
    SAVED,
    SRC,
  ].join("\n"));
  // This year is in the shared read; the history reader is only for a past year.
  assertEquals([calls.transactions, calls.history.length], [1, 0]);
});

Deno.test("a past year reads from its Jan 1 through history(); without one, the shared read's start is said, never $0.00", async () => {
  const withHistory = readers(TX, HISTORY);
  const r = (await moneyReply("how did 2025 go", NOW, withHistory.read, { tz: TZ }))!;
  assertEquals(withHistory.calls.history, ["2025-01-01"]);
  assertEquals(withHistory.calls.transactions, 0);
  assertEquals(r.split("\n")[0], "Your 2025 (Jan 1-Dec 31): $2,500.00 in, $2,800.00 out, so $300.00 more went out than came in. Your linked transactions start Jan 2, 2025, so this covers only from then.");
  const without = readers(TX);
  assertEquals(await moneyReply("how did 2025 go", NOW, without.read, { tz: TZ }), `Your linked transactions start Mar 4, 2026, so I can't see 2025: there's nothing from then to add up.\n${SRC}`);
});

Deno.test("a read that came back at the row cap says where the rows it read start, not the history", async () => {
  const full = Array.from({ length: TX_READ_CAP - TX.length }, (_, i) => tx("2026-06-15", -100, `MOCK SHOP ${i}`)).concat(TX);
  const r = (await moneyReply("year in review", NOW, readers(full).read, { tz: TZ }))!;
  assertMatch(r.split("\n")[0], / I can read only your newest 5,000 transactions, and they start Mar 4, 2026, so this covers only from then\.$/);
});

Deno.test("nothing linked: null (the handler's nothing-linked line answers); a failed read is said, never guessed", async () => {
  assertEquals(await moneyReply("my year in money", NOW, { accounts: async () => [], transactions: async () => TX }), null);
  assertEquals(await moneyReply("my year in money", NOW, { accounts: async () => ACCOUNTS, transactions: async () => { throw new Error("down"); } }, { tz: TZ }), MONEY_UNAVAILABLE);
  assertEquals(await moneyReply("how did 2025 go", NOW, { accounts: async () => ACCOUNTS, transactions: async () => TX, history: async () => { throw new Error("down"); } }, { tz: TZ }), MONEY_UNAVAILABLE);
  assert(/history: \(from: string\) => readRecentTransactions\(supabase, user\.id, Date\.now\(\), \{ days: /.test(SRC_HANDLER), "the handler passes a history reader for a past year");
});

Deno.test("every year reply names its source and as-of time, counts no unconfirmed savings and gives no advice", async () => {
  for (const m of ["my year in money", "annual review", "how did 2026 go", "how did 2025 go", "how did 2027 go", "show me my year"]) {
    const r = (await moneyReply(m, NOW, readers().read, { tz: TZ }))!;
    assertMatch(r.split("\n").slice(-1)[0], /^From your linked accounts, transactions through Oct 13, 2026, as of Oct 12, 11:00 PM EDT\./, m);
    assert(!/\b(?:you should|we recommend|consider|try to)\b/i.test(r), m);
    const saved = r.split("\n").find((l) => /^Saved or recovered/.test(l));
    if (saved) assertEquals(saved, SAVED, m);
    assert(r.split("\n").length <= 12, m);
  }
});
