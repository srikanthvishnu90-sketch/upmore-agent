// C12 income reconciliation in chat (agent-chat/_shared/paycheck_answer.ts): real deposits identified and classified
// from the rows — the recurring payroll pattern (packages/domain/57-agent-ledger.js TXN-005 recurring + ANL-010
// paycheckAllocation), side income apart, transfers-in excluded — and a missing or short paycheck flagged against
// the pattern's trailing median with the exact delta. Rows are MOCK statement rows in the database's own shapes.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { paycheckReply, PAYCHECK_UNAVAILABLE } from "../../supabase/functions/agent-chat/_shared/paycheck_answer.ts";
import type { AccountRow, MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";

const NOW = new Date("2026-10-12T15:05:00Z");
const ACCOUNTS: AccountRow[] = [
  { account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 250000, available_cents: 250000, balance_as_of: "2026-10-12T09:00:00Z", fetched_at: "2026-10-12T09:00:00Z", status: "active" },
  { account_id: "mock-sav", name: "Savings", institution: "Mock Bank", account_kind: "savings", balance_cents: 900000, available_cents: 900000, balance_as_of: "2026-10-12T09:00:00Z", fetched_at: "2026-10-12T09:00:00Z", status: "active" },
];
let n = 0;
const tx = (posted_on: string, amount_cents: number, merchant_raw: string, more: any = {}): MoneyTxRow =>
  Object.assign({ account_id: "mock-chk", provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, fetched_at: "2026-10-12T08:00:00Z", currency: "USD" }, more);
// Semimonthly payroll of $2,850 (1st and 15th), the latest one short at $2,610. Newest first, as the handler reads.
const PAYS: [string, number][] = [["2026-10-01", 261000], ["2026-09-15", 285000], ["2026-09-01", 285000], ["2026-08-15", 285000], ["2026-08-01", 285000], ["2026-07-15", 285000], ["2026-07-01", 285000]];
const TX: MoneyTxRow[] = [
  tx("2026-10-08", 285000, "ACME CORP PAYROLL", { is_transfer: true }),   // a transfer-in wearing payroll words: never a paycheck
  tx("2026-10-02", -185000, "MOCK PROPERTY MANAGEMENT RENT"),
  ...PAYS.map(([on, c]) => tx(on, c, "ACME CORP PAYROLL")),
  tx("2026-09-20", 45000, "STRIPE PAYOUT"),                                // side income: a real deposit, not payroll
  tx("2026-09-18", -1799, "NETFLIX.COM"),
];
const read = (accounts: AccountRow[] = ACCOUNTS, transactions: MoneyTxRow[] = TX) => ({ accounts: async () => accounts, transactions: async () => transactions });

Deno.test("C12: the last paycheck, the usual amount, and the exact short delta ($240), from the pattern over the rows", async () => {
  const r = (await paycheckReply("did my paycheck land", NOW, read(), { tz: "UTC" }))!;
  assert(r.includes("Your last paycheck: $2,610.00 from Acme Corp Payroll on Oct 1, 2026, into Mock Bank Everyday Checking."), r);
  assert(r.includes("Your usual paycheck is $2,850.00 (the median of the last 7)."), r);
  assert(r.includes("The Oct 1, 2026 paycheck is $240.00 short of that."), r);
  assert(!/paycheck is missing/i.test(r), r);
});

Deno.test("C12: deposits are classified — payroll apart, side income named as side income, the transfer-in never a paycheck", async () => {
  const r = (await paycheckReply("did i get paid", NOW, read(), { tz: "UTC" }))!;
  assert(r.includes("Other deposits in the last 90 days: $450.00 of side income (1 deposit: Stripe Payout $450.00 on Sep 20, 2026), not counted as payroll."), r);
  const body = r.slice(0, r.lastIndexOf("From your linked accounts"));
  assert(!body.includes("Oct 8"), r); // the Oct 8 transfer-in of the same $2,850 is named nowhere in the answer body: not last, not next, not a deposit line (the source line's "through Oct 8" is the read's newest posted row, the transfer itself)
  assert(r.includes("Your last paycheck: $2,610.00"), r); // still the Oct 1 posted paycheck, not the Oct 8 transfer
});

Deno.test("C12: the next expected date comes from the semimonthly pattern; every reply ends with source + as-of", async () => {
  const r = (await paycheckReply("when is my next paycheck", NOW, read(), { tz: "UTC" }))!;
  assert(r.includes("Next paycheck expected: Oct 15, 2026."), r);
  assertEquals(r.split("\n").slice(-1)[0], "From your linked accounts, transactions through Oct 8, 2026, as of Oct 12, 8:00 AM UTC.");
});

Deno.test("C12: a missing cycle is flagged with the expected amount and the exact days past", async () => {
  // Same pattern, but the Oct 1 paycheck never posted; "now" is Oct 6, so the expected date is exactly 5 days past.
  const NOW2 = new Date("2026-10-06T15:05:00Z");
  const rows = PAYS.filter(([on]) => on < "2026-10-01").map(([on, c]) => tx(on, c, "ACME CORP PAYROLL", { fetched_at: "2026-10-06T08:00:00Z" }));
  const r = (await paycheckReply("did my paycheck land", NOW2, read(ACCOUNTS, rows), { tz: "UTC" }))!;
  assert(r.includes("Your last paycheck: $2,850.00 from Acme Corp Payroll on Sep 15, 2026, into Mock Bank Everyday Checking."), r);
  assert(r.includes("A paycheck is missing: $2,850.00 was expected on Oct 1, 2026, 5 days ago, and no deposit has posted for that cycle."), r);
  assert(r.includes("Next paycheck expected: Oct 15, 2026."), r);
  assertEquals(r.split("\n").slice(-1)[0], "From your linked accounts, transactions through Sep 15, 2026, as of Oct 6, 8:00 AM UTC.");
});

Deno.test("C12: the ask patterns fire; unrelated messages and the paycheck-send command return null and read nothing", async () => {
  for (const m of ["did my paycheck land", "did i get paid", "when is my next paycheck", "is my paycheck short", "did my pay come in", "has my paycheck posted", "when do i get paid next"])
    assert(await paycheckReply(m, NOW, read(), { tz: "UTC" }), m);
  let reads = 0;
  const counting = { accounts: async () => { reads++; return ACCOUNTS; }, transactions: async () => { reads++; return TX; } };
  for (const m of ["what's my balance", "send sam 40", "pay maya 40 only if my paycheck landed", "what fees did i pay", "how much did i spend on food"])
    assertEquals(await paycheckReply(m, NOW, counting, { tz: "UTC" }), null, m);
  assertEquals(reads, 0, "a non-paycheck message reads no rows");
});

Deno.test("C12: no visible pattern is one plain line (plus the source line); nothing linked returns null; a failed read is said plainly", async () => {
  const oneOff = [tx("2026-10-01", 285000, "ACME CORP PAYROLL"), tx("2026-10-02", -5000, "TRADER JOE S #552")];
  const r = (await paycheckReply("did my paycheck land", NOW, read(ACCOUNTS, oneOff), { tz: "UTC" }))!;
  assertEquals(r.split("\n")[0], "No regular paycheck pattern is visible in your linked accounts yet.");
  assertEquals(r.split("\n").length, 2, "the plain line plus the source line, nothing else");
  assertEquals(await paycheckReply("did my paycheck land", NOW, read([], []), { tz: "UTC" }), null);
  const broken = { accounts: async () => { throw new Error("db down"); }, transactions: async () => TX };
  assertEquals(await paycheckReply("did my paycheck land", NOW, broken, { tz: "UTC" }), PAYCHECK_UNAVAILABLE);
});
