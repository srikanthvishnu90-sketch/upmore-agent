// See-everything numbers in chat (agent-chat/_shared/money_answers.ts): which messages it answers, which it leaves to the
// flows and the model, and that it reads only what the answer needs. Accounts and transactions here are MOCK fixtures.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { moneyKind, moneyReply, mergeKinds, MONEY_UNAVAILABLE, type AccountRow, type MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";
import { connectReply, findMoneyReply } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";

const NOW = new Date("2026-10-12T15:05:00Z");
const ACCOUNTS: AccountRow[] = [
  { account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 123456, available_cents: 123456, balance_as_of: "2026-10-12T09:00:00Z", fetched_at: "2026-10-12T09:00:00Z", status: "active" },
];
let n = 0;
const tx = (posted_on: string | null, amount_cents: number, merchant_raw: string, is_pending = false): MoneyTxRow =>
  ({ account_id: "mock-chk", provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending, is_transfer: false, fetched_at: "2026-10-12T08:00:00Z" });
const TX: MoneyTxRow[] = [
  tx("2026-08-04", -8000, "TRADER JOE S #552"), tx("2026-09-03", -9000, "TRADER JOE S #552"), tx("2026-09-07", -3000, "UBER *EATS"),
  tx("2026-10-01", -185000, "MOCK PROPERTY MANAGEMENT RENT"), tx("2026-10-01", 250000, "MOCK EMPLOYER PAYROLL"), tx("2026-10-05", -1799, "NETFLIX.COM"),
];
function readers(accounts: AccountRow[] = ACCOUNTS, transactions: MoneyTxRow[] = TX) {
  const calls = { accounts: 0, transactions: 0 };
  return { calls, read: { accounts: async () => { calls.accounts++; return accounts; }, transactions: async () => { calls.transactions++; return transactions; } } };
}

Deno.test("routing: the four asks fire, in the person's own words", () => {
  const cases: [string, string][] = [
    ["what's my balance", "balance"], ["whats my balance?", "balance"], ["balance", "balance"], ["my checking balance", "balance"],
    ["what's my credit card balance", "balance"], ["how much money do i have", "balance"], ["how much do i have in my checking", "balance"],
    ["how much did i spend on food last month", "spend"], ["how much have i spent this week", "spend"], ["what did i spend at starbucks in september", "spend"],
    ["what's my spending this month", "spend"],
    ["how am i doing", "checkup"], ["how am i doing financially?", "checkup"], ["hey how am i doing this month", "checkup"], ["how's my money looking", "checkup"],
    ["did rent go through", "through"], ["did my netflix payment go through", "through"], ["has my paycheck come in", "through"], ["did the comcast bill post", "through"],
  ];
  for (const [m, k] of cases) assertEquals(moneyKind(m), k, m);
});

Deno.test("routing: near misses go on to the flows and the model", () => {
  for (const m of [
    "what's a good minimum balance for a savings account", "transfer my balance to savings", "balance transfer card", "how much should i spend on rent",
    "how do i cut my spending", "help me budget my spending", "how am i doing on my emergency fund goal", "how is the market doing", "send sam 40",
    "cancel netflix", "did it go through", "what is rent", "pay my rent", "connect my chase", "find me money", "what's a roth ira",
  ]) assertEquals(moneyKind(m), null, m);
});

Deno.test("asks that belong elsewhere keep their place: paying rent is the standing rent flow, connect and find me money come first", () => {
  assertEquals(moneyKind("pay my rent"), null, "the rent flow takes it");
  assertEquals(moneyKind("did rent go through"), "through", "checking a rent payment is a money answer, not the rent flow");
  assertEquals(connectReply("did rent go through"), null);
  assertEquals(connectReply("what's my balance"), null);
});

Deno.test("balance reads accounts only, and answers with dollars and an as-of time, no question back (S16-01)", async () => {
  const { calls, read } = readers();
  const r = (await moneyReply("what's my balance", NOW, read))!;
  assertMatch(r, /^You have \$1,234\.56 in cash across 1 account, as of Oct 12, 9:00 AM UTC\./);
  assert(!r.includes("?"));
  assertEquals(calls, { accounts: 1, transactions: 0 });
});

Deno.test("spend, checkup and did-it-go-through read both and cite the source (S16-02, 14, 16)", async () => {
  const food = (await moneyReply("how much did i spend on food last month", NOW, readers().read))!;
  assertMatch(food, /^You spent \$120\.00 on food last month \(Sep 1-30\): \$90\.00 groceries, \$30\.00 delivery\.\nThat's \$40\.00 more than in August, when it was \$80\.00\./);
  assertMatch(food, /From your linked accounts, transactions through Oct 5, 2026, as of Oct 12, 8:00 AM UTC\./);
  const how = (await moneyReply("how am i doing", NOW, readers().read))!;
  assertMatch(how, /^Cash: \$1,234\.56 across 1 account/);
  assert(how.length <= 900);
  const rent = (await moneyReply("did rent go through", NOW, readers().read))!;
  assertMatch(rent, /^Yes, it posted: \$1,850\.00 to Mock Property Management Rent on Oct 1 \(Mock Bank Everyday Checking\)\./);
  const pending = (await moneyReply("did rent go through", NOW, readers(ACCOUNTS, [tx(null, -185000, "MOCK RENT", true)]).read))!;
  assertMatch(pending, /^It's pending: \$1,850\.00 to Mock Rent/);
});

Deno.test("nothing linked returns null (noDataReply says it); a message that isn't a money ask reads nothing", async () => {
  const none = readers([], []);
  assertEquals(await moneyReply("what's my balance", NOW, none.read), null);
  assertEquals(await moneyReply("how much did i spend on food last month", NOW, none.read), null);
  assertEquals(none.calls.transactions, 0);
  const disconnected = readers([{ ...ACCOUNTS[0], status: "disconnected" }]);
  assertEquals(await moneyReply("what's my balance", NOW, disconnected.read), null);
  const other = readers();
  assertEquals(await moneyReply("send sam 40", NOW, other.read), null);
  assertEquals(other.calls, { accounts: 0, transactions: 0 });
});

Deno.test("a failed read is said plainly; no number is guessed", async () => {
  const broken = { accounts: async () => { throw new Error("db down"); }, transactions: async () => [] as MoneyTxRow[] };
  assertEquals(await moneyReply("what's my balance", NOW, broken), MONEY_UNAVAILABLE);
  const brokenTx = { accounts: async () => ACCOUNTS, transactions: async (): Promise<MoneyTxRow[]> => { throw new Error("db down"); } };
  assertEquals(await moneyReply("how am i doing", NOW, brokenTx), MONEY_UNAVAILABLE);
  assert(!/\$\d/.test(MONEY_UNAVAILABLE));
});

Deno.test("the person's own account type wins over the provider's unknown", async () => {
  const rows = mergeKinds([{ ...ACCOUNTS[0], account_kind: "unknown", name: "Joint" }], [{ account_id: "mock-chk", account_kind: "checking" }]);
  assertEquals(rows[0].account_kind, "checking");
  assertMatch((await moneyReply("balance", NOW, readers(rows).read))!, /^You have \$1,234\.56 in cash/);
  const unset = mergeKinds([{ ...ACCOUNTS[0], account_kind: "unknown", name: "Joint" }], []);
  assertMatch((await moneyReply("balance", NOW, readers(unset).read))!, /^No checking or savings balance is linked/);
});

Deno.test("find me money still belongs to the save engine", async () => {
  assertEquals(moneyKind("find me money"), null);
  assert(await findMoneyReply("find me money", "2026-10-12", async () => []));
});
