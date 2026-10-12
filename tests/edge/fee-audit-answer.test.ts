// C10 fee audit in chat (agent-chat/_shared/fee_audit_answer.ts): every bank fee across all accounts over the trailing
// 12 months, totaled in dollars by type, the fightable ones named individually for the SAVE-005 reversal path.
// Detection is packages/domain/41-agent-recovery.js (AgentRecovery.scan, TXN-018) over rows mapped the way
// _shared/proactive.ts maps them; totals here are computed independently from the fixture rows. Rows are MOCK
// statement rows in the database's own shapes (agent_financial_transactions, newest first as the handler reads them).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { feeAuditReply, FEE_AUDIT_UNAVAILABLE } from "../../supabase/functions/agent-chat/_shared/fee_audit_answer.ts";
import type { AccountRow, MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";

const NOW = new Date("2026-10-12T15:05:00Z");
const ACCOUNTS: AccountRow[] = [
  { account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 250000, available_cents: 250000, balance_as_of: "2026-10-12T09:00:00Z", fetched_at: "2026-10-12T09:00:00Z", status: "active" },
  { account_id: "mock-card", name: "Travel Credit Card", institution: "Mock Bank", account_kind: "credit", balance_cents: 80000, available_cents: null, balance_as_of: "2026-10-12T09:00:00Z", fetched_at: "2026-10-12T09:00:00Z", status: "active" },
];
let n = 0;
const tx = (posted_on: string | null, amount_cents: number, merchant_raw: string, more: any = {}): MoneyTxRow =>
  Object.assign({ account_id: "mock-chk", provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, fetched_at: "2026-10-12T08:00:00Z", currency: "USD" }, more);
// 14 months of rows so the trailing-12-month window (Oct 12, 2025 to Oct 12, 2026) cuts at both ends.
const TX: MoneyTxRow[] = [
  tx("2026-10-11", -3500, "OVERDRAFT FEE", { is_pending: true }),                    // pending: not a posted fee, never counted
  tx("2026-10-10", -5000, "TRADER JOE S #552"),                                       // newest posted row: sets the source line
  tx("2026-10-08", 285000, "ACME CORP PAYROLL"),
  tx("2026-09-05", -500, "PAPER STATEMENT FEE"),
  tx("2026-08-14", -2900, "LATE FEE", { account_id: "mock-card" }),
  tx("2026-07-04", -12000, "DELTA AIR LINES"),
  tx("2026-06-20", -1500, "NSF FEE"),
  tx("2026-05-20", -199, "DOORDASH SERVICE FEE"),                                     // a merchant's fee, not the bank's: never counted
  tx("2026-05-01", -1200, "MONTHLY SERVICE CHARGE"),
  tx("2026-04-01", -1200, "MONTHLY SERVICE CHARGE"),
  tx("2026-03-08", -1200, "FOREIGN TRANSACTION FEE", { account_id: "mock-card" }),
  tx("2026-02-10", -275, "ATM FEE"),
  tx("2026-01-15", -3500, "OVERDRAFT FEE"),
  tx("2025-11-03", -3500, "OVERDRAFT FEE"),
  tx("2025-10-12", -300, "ATM FEE"),                                                  // exactly on the window start: counted
  tx("2025-10-11", -999, "ATM FEE"),                                                  // one day before the window: not counted
  tx("2025-09-12", -3500, "OVERDRAFT FEE"),                                           // 13 months old: not counted
];
const read = (accounts: AccountRow[] = ACCOUNTS, transactions: MoneyTxRow[] = TX) => ({ accounts: async () => accounts, transactions: async () => transactions });
const money = (c: number) => "$" + Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(c % 100).padStart(2, "0");

// Independent recomputation from the fixture rows alone: posted, negative, in the window, a descriptor this test
// itself names as a bank fee (the same words a statement reader would pick out), grouped by the fee's own words.
const FEE_WORDS: [string, string][] = [
  ["overdraft", "OVERDRAFT FEE"], ["atm", "ATM FEE"], ["foreign", "FOREIGN TRANSACTION FEE"], ["service", "MONTHLY SERVICE CHARGE"],
  ["nsf", "NSF FEE"], ["late", "LATE FEE"], ["paper", "PAPER STATEMENT FEE"],
];
function independent() {
  const inWindow = TX.filter((t) => !t.is_pending && t.posted_on && t.posted_on >= "2025-10-12" && t.posted_on <= "2026-10-12" && (t.amount_cents || 0) < 0);
  const byKind = new Map<string, number>(), byKindCount = new Map<string, number>();
  let total = 0, count = 0;
  for (const t of inWindow) {
    const hit = FEE_WORDS.find(([, w]) => t.merchant_raw === w);
    if (!hit) continue;
    byKind.set(hit[0], (byKind.get(hit[0]) || 0) - (t.amount_cents || 0));
    byKindCount.set(hit[0], (byKindCount.get(hit[0]) || 0) + 1);
    total += -(t.amount_cents || 0); count++;
  }
  return { byKind, byKindCount, total, count };
}

Deno.test("C10: total and per-type totals over the trailing 12 months, across all accounts, computed from the rows", async () => {
  const want = independent();
  assertEquals(want.total, 16075, "fixture sanity: the independent total is $160.75");
  assertEquals(want.count, 10, "fixture sanity: 10 posted bank fees in the window");
  assertEquals(want.byKind.get("atm"), 575); assertEquals(want.byKind.get("foreign"), 1200); assertEquals(want.byKind.get("service"), 2400);
  const r = (await feeAuditReply("what fees did i pay", NOW, read(), { tz: "UTC" }))!;
  assert(r.startsWith(`Fee audit, last 12 months (Oct 12, 2025 to Oct 12, 2026): ${money(want.total)} in bank fees across ${want.count} charges.`), r);
  for (const line of [
    `Overdraft fees: ${money(want.byKind.get("overdraft")!)} (${want.byKindCount.get("overdraft")} charges)`,
    `Late payment fees: ${money(want.byKind.get("late")!)} (1 charge)`,                       // on the credit card account
    `Monthly maintenance and service charges: ${money(want.byKind.get("service")!)} (${want.byKindCount.get("service")} charges)`,
    `NSF and returned item fees: ${money(want.byKind.get("nsf")!)} (1 charge)`,
    `Foreign transaction fees: ${money(want.byKind.get("foreign")!)} (1 charge)`,             // on the credit card account
    `ATM fees: ${money(want.byKind.get("atm")!)} (${want.byKindCount.get("atm")} charges)`,
    `Paper statement fees: ${money(want.byKind.get("paper")!)} (1 charge)`,
  ]) assert(r.includes(line), `${line}\n--- reply ---\n${r}`);
});

Deno.test("C10: the window boundary cuts: the 13-month-old fee and the day-before fee are out, the start-date fee is in", async () => {
  const r = (await feeAuditReply("fee audit", NOW, read(), { tz: "UTC" }))!;
  assert(r.includes("Atm Fee: $3.00 on Oct 12, 2025"), r);          // exactly on the window start
  assert(!r.includes("$9.99"), r);                                   // Oct 11, 2025: one day before the window
  assert(!r.includes("Sep 12, 2025"), r);                             // 13 months old
  assert(!r.includes("Oct 11, 2026"), r);                            // the pending overdraft fee is not posted, not counted
  assert(!/DoorDash|Food delivery/i.test(r), r);                     // a merchant's service fee is not a bank fee
});

Deno.test("C10: the fightable ones are named individually and handed to SAVE-005 by name; nothing is drafted", async () => {
  const r = (await feeAuditReply("how much have i paid in fees", NOW, read(), { tz: "UTC" }))!;
  assert(r.includes("Fightable: Upmore can draft a reversal request for each of these through SAVE-005 (the fee-reversal path); nothing is drafted or sent until you approve it:"), r);
  for (const line of [
    "Atm Fee: $3.00 on Oct 12, 2025 (Mock Bank Everyday Checking)",
    "Overdraft Fee: $35.00 on Nov 3, 2025 (Mock Bank Everyday Checking)",
    "Overdraft Fee: $35.00 on Jan 15, 2026 (Mock Bank Everyday Checking)",
    "Atm Fee: $2.75 on Feb 10, 2026 (Mock Bank Everyday Checking)",
    "Foreign Transaction Fee: $12.00 on Mar 8, 2026 (Mock Bank Travel Credit Card)",
    "Monthly Service Charge: $12.00 on Apr 1, 2026 (Mock Bank Everyday Checking)",
    "Monthly Service Charge: $12.00 on May 1, 2026 (Mock Bank Everyday Checking)",
    "Nsf Fee: $15.00 on Jun 20, 2026 (Mock Bank Everyday Checking)",
    "Late Fee: $29.00 on Aug 14, 2026 (Mock Bank Travel Credit Card)",
    "Paper Statement Fee: $5.00 on Sep 5, 2026 (Mock Bank Everyday Checking)",
  ]) assert(r.includes(line), `${line}\n--- reply ---\n${r}`);
  assert(!/Hello, I/.test(r), "the reversal request itself is never drafted here");
});

Deno.test("C10: the ask patterns fire; unrelated messages and fee questions about the world return null and read nothing", async () => {
  for (const m of ["what did banks and cards charge me this year", "what fees did i pay", "fee audit", "how much have i paid in fees", "how much did i pay in fees this year", "show me my fees", "what are my total fees"])
    assert(await feeAuditReply(m, NOW, read(), { tz: "UTC" }), m);
  let reads = 0;
  const counting = { accounts: async () => { reads++; return ACCOUNTS; }, transactions: async () => { reads++; return TX; } };
  for (const m of ["what's my balance", "send sam 40", "what is an overdraft fee", "how do i avoid bank fees", "dispute this fee", "reverse my overdraft fee", "did my paycheck land"])
    assertEquals(await feeAuditReply(m, NOW, counting, { tz: "UTC" }), null, m);
  assertEquals(reads, 0, "a non-fee message reads no rows");
});

Deno.test("C10: no fees in the period says none and names the period; every reply ends with source + as-of", async () => {
  const plain = TX.filter((t) => t.merchant_raw === "TRADER JOE S #552" || t.merchant_raw === "ACME CORP PAYROLL");
  const none = (await feeAuditReply("what fees did i pay", NOW, read(ACCOUNTS, plain), { tz: "UTC" }))!;
  assertEquals(none.split("\n")[0], "No bank fees in the last 12 months (Oct 12, 2025 to Oct 12, 2026) across your linked accounts.");
  const r = (await feeAuditReply("fee audit", NOW, read(), { tz: "UTC" }))!;
  const last = r.split("\n").slice(-1)[0];
  assertEquals(last, "From your linked accounts, transactions through Oct 10, 2026, as of Oct 12, 8:00 AM UTC.");
  assertEquals(none.split("\n").slice(-1)[0], last, "the no-fees reply ends with the same source + as-of line (its newest posted row is also Oct 10)");
});

Deno.test("C10: nothing linked returns null; a failed read is said plainly, never a guessed number", async () => {
  assertEquals(await feeAuditReply("fee audit", NOW, read([], []), { tz: "UTC" }), null);
  const broken = { accounts: async () => { throw new Error("db down"); }, transactions: async () => TX };
  assertEquals(await feeAuditReply("fee audit", NOW, broken, { tz: "UTC" }), FEE_AUDIT_UNAVAILABLE);
  const brokenTx = { accounts: async () => ACCOUNTS, transactions: async (): Promise<MoneyTxRow[]> => { throw new Error("db down"); } };
  assertEquals(await feeAuditReply("fee audit", NOW, brokenTx, { tz: "UTC" }), FEE_AUDIT_UNAVAILABLE);
});
