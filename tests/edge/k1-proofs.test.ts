// K1 cluster proofs (2026-10-12, overnight): feeds & normalization — C1, C3, C4, C5, C6, C7, C9, C10, C11,
// C12, C16, C193, C201 over twins of the owner's REAL Chase rows (tests/edge/k1-fixtures.ts — fresh SimpleFIN
// pull the same night; amounts, dates and balances are the real rows' values). Every expected number below was
// recomputed from the raw rows by hand before the agent was asked (Muse-parity):
//   September debits $834.94 (18 charges); August debits $2,392.36; fees $75.00 (3 x $25.00);
//   balance $413.29; recurring bills $91.44/mo (Affirm $61.44 + service fee $25.00 + Robinhood $5.00);
//   Rebet out: Sep $146.79, last 30d $154.35, prior 30d $150.00, 90d $514.35 (11 orders, $46.76 avg);
//   Rebet payouts in (90d) $864.17 across 6 payouts; Kalshi out $40.83, Kalshi payout in $39.90;
//   October to Oct 12: $432.06 in, $52.56 out; the EUR charge: 2.50 x 1.156000 = $2.89.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { moneyReply, moneyKind } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";
import { feeAuditReply, isFeeAuditAsk } from "../../supabase/functions/agent-chat/_shared/fee_audit_answer.ts";
import { paycheckReply, isPaycheckAsk } from "../../supabase/functions/agent-chat/_shared/paycheck_answer.ts";
import { tipFeesReply, isTipFeesAsk } from "../../supabase/functions/agent-chat/_shared/tip_fees_answer.ts";
import { budgetReply } from "../../supabase/functions/agent-chat/_shared/budget_answer.ts";
import { plan, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
// @ts-ignore: plain JS domain through the generated bundle
import { Budgets } from "../../supabase/functions/_shared/router_core.js";
import { K1_ACCOUNTS, K1_TX } from "./k1-fixtures.ts";

const NOW = new Date("2026-10-12T20:05:00Z");
const TZ = { tz: "America/Chicago" };
const read = { accounts: async () => K1_ACCOUNTS, transactions: async () => K1_TX };
const NOWMS = Date.UTC(2026, 9, 12, 20, 0, 0);

// ---------- C1 ----------
Deno.test("C1: September ties to the raw rows to the cent, drill-downs included", async () => {
  const r = await moneyReply("Where did my money go in September?", NOW, read, TZ);
  assertStringIncludes(r!, "You spent $834.94 in September");
  assertStringIncludes(r!, "Peptira $330.39");
  assertStringIncludes(r!, "Rebet $146.79");
  assertStringIncludes(r!, "Affirm $119.66");
  const g = await moneyReply("how much did i spend on groceries in september", NOW, read, TZ);
  assertStringIncludes(g!, "You spent $0.00 on groceries in September");
  const pm = await moneyReply("how much did i spend on prediction markets in september", NOW, read, TZ);
  assertStringIncludes(pm!, "You spent $20.21 on prediction markets in September");
});

Deno.test("C1 adversarial: a pending charge and an internal transfer change nothing", async () => {
  const extra = [
    { account_id: "chk", provider_transaction_id: "x1", amount_cents: -99999, posted_on: "2026-09-10", merchant_raw: "DOORDASH *ORDER", is_pending: true, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T19:30:00Z" },
    { account_id: "chk", provider_transaction_id: "x2", amount_cents: -50000, posted_on: "2026-09-10", merchant_raw: "ONLINE TRANSFER TO SAV 9921", is_pending: false, is_transfer: true, currency: "USD", fetched_at: "2026-10-12T19:30:00Z" },
  ];
  const r = await moneyReply("Where did my money go in September?", NOW, { accounts: read.accounts, transactions: async () => [...K1_TX, ...extra] }, TZ);
  assertStringIncludes(r!, "You spent $834.94 in September");
});

// ---------- C3 ----------
Deno.test("C3: the capability's headline ask routes and the number ties (413.29 - 91.44 = 321.85)", async () => {
  assertEquals(moneyKind("How much can I actually spend right now?"), "safe");
  const r = await moneyReply("How much can I actually spend right now?", NOW, read, TZ);
  assertStringIncludes(r!, "Safe to spend over the next 30 days (to Nov 11): $321.85");
  assertStringIncludes(r!, "Affirm $61.44 (Oct 15)");
  assertStringIncludes(r!, "Monthly Service Fee $25.00 (Oct 21)");
  assertStringIncludes(r!, "Robinhood $5.00 (Nov 1)");
  assertStringIncludes(r!, "I couldn't find a regular paycheck in your deposits");
});

Deno.test("C3 adversarial: a $100 buffer and a $50 scheduled transfer come off the same number", async () => {
  const withBuffer = await moneyReply("How much can I actually spend right now?", NOW, read, { ...TZ, buffer_cents: 10000 });
  assertStringIncludes(withBuffer!, "$221.85");
  const withTransfer = await moneyReply("How much can I actually spend right now?", NOW, read, { ...TZ, scheduled_transfers: [{ on: "2026-10-20", amount_cents: 5000, name: "Transfer to savings" }] });
  assertStringIncludes(withTransfer!, "$271.85");
});

// ---------- C4 ----------
Deno.test("C4: 'make it to payday' routes to the forecast; the day-by-day math ties", async () => {
  assertEquals(moneyKind("Am I going to make it to payday?"), "forecast");
  const r = await moneyReply("Am I going to make it to payday?", NOW, read, TZ);
  assertStringIncludes(r!, "$321.85 on Nov 11 (30 days), $230.41 on Dec 11 (60 days), $138.97 on Jan 10, 2027 (90 days)");
  assertStringIncludes(r!, "Paychecks: none found in your deposits");
  const prev = { ...read, previous: async () => [{ role: "assistant", content: r! }] };
  const math = await moneyReply("show me the math", NOW, prev, TZ);
  assertStringIncludes(math!, "$413.29 + $0.00 in - $274.32 out = $138.97 on Jan 10, 2027");
  assertStringIncludes(math!, "Lowest: $138.97 on Jan 1, 2027");
});

Deno.test("C4 proactive: the low-balance watch projects day by day and names the day it breaks the buffer", () => {
  const p = plan({ accounts: mapAccounts(K1_ACCOUNTS as any), transactions: mapTransactions(K1_TX as any), settings: { time_zone: "America/Chicago" }, sent: [] } as any, NOWMS);
  const w = p.messages.find((m: any) => m.key.startsWith("watch:low_balance"));
  assert(w, JSON.stringify(p.messages.map((m: any) => m.key)));
  assertStringIncludes(w.text, "goes under your $100.00 buffer on 2026-10-20 ($73.85)");
  assertStringIncludes(w.text, "bottoms at -$720.65 on 2026-11-11");
});

// ---------- C5 ----------
Deno.test("C5: on the owner's real rows the subscription list is honestly empty — his recurring charges are a bank fee, pay-later plans and an investing debit, not subscription services", async () => {
  const r = await moneyReply("what subscriptions do I have?", NOW, read, TZ);
  assertStringIncludes(r!, "I don't see any subscriptions repeating in your linked accounts.");
});

Deno.test("C5 adversarial: a planted price rise on the real feed is caught the first cycle, quantified, with a cancel path", () => {
  const nf = ["2026-07-15", "2026-08-15", "2026-09-15"].map((d, i) => ({ account_id: "chk", provider_transaction_id: "nf" + i, amount_cents: -1549, posted_on: d, merchant_raw: "NETFLIX.COM", is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T19:30:00Z" }));
  nf.push({ account_id: "chk", provider_transaction_id: "nf3", amount_cents: -1799, posted_on: "2026-10-11", merchant_raw: "NETFLIX.COM", is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T19:30:00Z" });
  const payroll = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].map((d, i) => ({ account_id: "chk", provider_transaction_id: "pay" + i, amount_cents: 180000, posted_on: d, merchant_raw: "ACME CORP PAYROLL DIR DEP", is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T19:30:00Z" }));
  const input = (sent: any[]) => ({ accounts: mapAccounts(K1_ACCOUNTS as any), transactions: mapTransactions([...payroll, ...K1_TX, ...nf] as any), settings: { time_zone: "America/Chicago" }, sent } as any);
  // Day 1: the rise IS detected (suppressed only by the daily budget behind the urgent low-balance watch).
  const p1 = plan(input([]), NOWMS);
  assert(p1.suppressed.some((s: any) => /price_increase:NETFLIX/.test(s.key) && s.reason === "daily_budget"), JSON.stringify(p1.suppressed));
  // The proactive queue drains one unrequested finding a day: over the following days the creep finding
  // surfaces exactly once, quantified, with its cancel path — queued behind the urgent watch, never lost.
  let sent = p1.messages.map((m: any) => ({ key: m.key, sent_at: NOWMS, cadence: !!m.cadence }));
  const surfaced: any[] = [];
  let robinhoodQueued = false;
  for (let d = 1; d <= 7; d++) {
    const p = plan(input(sent), NOWMS + d * 86400000);
    surfaced.push(...p.messages.filter((m: any) => /went up/.test(m.text)));
    if (p.messages.some((m: any) => /new/i.test(m.text) && /Robinhood/i.test(m.text)) || p.suppressed.some((s: any) => /new_subscription:robinhood/.test(s.key))) robinhoodQueued = true;
    sent = sent.concat(p.messages.map((m: any) => ({ key: m.key, sent_at: NOWMS + d * 86400000, cadence: !!m.cadence })));
  }
  assertEquals(surfaced.length, 1, JSON.stringify(surfaced.map((m: any) => m.text)));
  assertStringIncludes(surfaced[0].text, "$15.49");
  assertStringIncludes(surfaced[0].text, "$17.99");
  assertStringIncludes(surfaced[0].text, "$2.50");
  assert(robinhoodQueued, "the real feed's own new recurring merchant (Robinhood, first charged Aug 4) is flagged as new");
});

// ---------- C6 ----------
Deno.test("C6: Rebet ties to the hand count in all three windows; payouts are money in, never netted", async () => {
  const r = await moneyReply("How much am I spending on Rebet, really?", NOW, read, TZ);
  assertStringIncludes(r!, "Rebet: $154.35 in the last 30 days (Sep 13-Oct 12), 3 orders, $51.45 an order on average");
  assertStringIncludes(r!, "when it was $150.00 (4 orders)");
  assertStringIncludes(r!, "Last 90 days (Jul 15-Oct 12): $514.35, 11 orders, $46.76 an order on average");
  assertStringIncludes(r!, "Money in from Rebet in the last 90 days: $864.17 across 6 payouts");
  assert(!/Refunds taken off/.test(r!), r!);
});

Deno.test("C6: Kalshi — $40.83 out; the $39.90 clearing payout is money in, not a refund", async () => {
  const r = await moneyReply("How much am I spending on Kalshi, really?", NOW, read, TZ);
  assertStringIncludes(r!, "$40.83");
  assertStringIncludes(r!, "Money in from Kalshi in the last 90 days: $39.90 across 1 payout");
});

Deno.test("C6 adversarial: a true refund under the charge's own descriptor still nets", async () => {
  const rows = [
    { account_id: "chk", provider_transaction_id: "d1", amount_cents: -3000, posted_on: "2026-10-05", merchant_raw: "DOORDASH *ORDER", is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T19:30:00Z" },
    { account_id: "chk", provider_transaction_id: "d2", amount_cents: 1000, posted_on: "2026-10-06", merchant_raw: "DOORDASH *ORDER", is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T19:30:00Z" },
  ];
  const { SpendingViews } = await import("../../supabase/functions/_shared/router_core.js") as any;
  const r = SpendingViews.merchantSpend(rows, "how much am I spending on DoorDash, really?", NOW, TZ);
  assertStringIncludes(r, "$20.00 in the last 30 days");
  assertStringIncludes(r, "Refunds taken off: $10.00.");
});

// ---------- C7 ----------
Deno.test("C7: the real Kalshi double charge ($15.31, Aug 4 and Aug 5) is flagged in chat with the dispute path", async () => {
  const r = await moneyReply("What's this $15.31 Kalshi charge?", NOW, read, TZ);
  assertStringIncludes(r!, "It shows twice within 3 days at the same amount (Aug 4 and Aug 5), which may be a double charge.");
  assertStringIncludes(r!, "dispute this charge");
});

Deno.test("C7: a doubled subscription (direct + App Store) is pushed once with both streams and the cancel path", () => {
  const tx = (id: string, on: string, cents: number, merchant: string) => ({ account_id: "chk", provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed", fetched_at: "2026-10-12T19:30:00Z" });
  const rows = [
    ...["2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05"].map((d, i) => tx("sd" + i, d, -1199, "SPOTIFY")),
    ...["2026-07-07", "2026-08-07", "2026-09-07", "2026-10-07"].map((d, i) => tx("sa" + i, d, -1199, "APL*ITUNES")),
  ];
  const p = plan({ accounts: mapAccounts(K1_ACCOUNTS as any), transactions: mapTransactions(rows as any), settings: { time_zone: "America/Chicago" }, sent: [] } as any, NOWMS);
  const hits = p.messages.filter((m: any) => /paid for 2 times over/.test(m.text));
  assertEquals(hits.length, 1, JSON.stringify(p.messages.map((m: any) => m.text)));
  assertStringIncludes(hits[0].text, "$287.76 a year");
  assertEquals(hits[0].capability_id, "subscriptions.cancel");
});

// ---------- C9 ----------
Deno.test("C9: the $1,200 couch fails against the real safe-to-spend, with the number cited", async () => {
  const r = await moneyReply("Can I afford a $1,200 couch?", NOW, read, TZ);
  assertStringIncludes(r!, "not on these numbers");
  assertStringIncludes(r!, "Your safe to spend over the next 30 days is $321.85");
});

// ---------- C10 + C193 ----------
Deno.test("C10: the fee audit totals the real fees to the cent, each one fightable", async () => {
  const r = await feeAuditReply("What did banks and cards charge me this year?", NOW, read, TZ);
  assertStringIncludes(r!, "$75.00 in bank fees across 3 charges");
  assertStringIncludes(r!, "Monthly maintenance and service charges: $75.00 (3 charges)");
  assertStringIncludes(r!, "Monthly Service Fee: $25.00 on Sep 21, 2026");
});

Deno.test("C193: the foreign audit — $0.00 foreign fees, the EUR charge's own conversion math, DCC named", async () => {
  assert(isFeeAuditAsk("Am I getting fleeced abroad?"));
  const r = await feeAuditReply("How much did I pay in foreign transaction fees this year?", NOW, read, TZ);
  assertStringIncludes(r!, "Foreign transaction fees charged: $0.00");
  assertStringIncludes(r!, "International charge: Gelatoteca Suso: $2.89 on Sep 18, 2026");
  assertStringIncludes(r!, "Euro 2.50 × 1.156000 = $2.89");
  assertStringIncludes(r!, "Dynamic currency conversion");
});

// ---------- C11 ----------
Deno.test("C11: with no itemized receipts on file the answer is the honest none-on-file line", async () => {
  assert(isTipFeesAsk("Are delivery fees getting worse?"));
  const r = await tipFeesReply("Are delivery fees getting worse?", NOW, { receipts: async () => [], transactions: async () => K1_TX }, TZ);
  assertEquals(r, "Tips and fees can only be tracked from itemized receipts, and none are on file.");
});

// ---------- C12 ----------
Deno.test("C12: on the owner's real rows there is no paycheck pattern, and the answer says so plainly", async () => {
  const r = await paycheckReply("Did my paycheck land?", NOW, read, TZ);
  assertStringIncludes(r!, "No regular paycheck pattern is visible in your linked accounts yet.");
});

Deno.test("C12 adversarial (stand-in payroll): a $300.00-short paycheck and a missing cycle are flagged with exact deltas", async () => {
  let n = 0;
  const prow = (d: string, c: number) => ({ account_id: "chk", provider_transaction_id: "p" + (++n), amount_cents: c, posted_on: d, merchant_raw: "ACME PAYROLL DIRECT DEP", is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T19:30:00Z" });
  const short = [prow("2026-08-14", 200000), prow("2026-08-28", 200000), prow("2026-09-11", 200000), prow("2026-09-25", 200000), prow("2026-10-09", 170000)];
  assert(isPaycheckAsk("did my paycheck land?"));
  const r1 = await paycheckReply("is my paycheck short?", NOW, { accounts: read.accounts, transactions: async () => short }, TZ);
  assertStringIncludes(r1!, "The Oct 9, 2026 paycheck is $300.00 short of that.");
  const missing = [prow("2026-08-28", 200000), prow("2026-09-11", 200000), prow("2026-09-25", 200000)];
  const r2 = await paycheckReply("did my paycheck land?", NOW, { accounts: read.accounts, transactions: async () => missing }, TZ);
  assertStringIncludes(r2!, "A paycheck is missing: $2,000.00 was expected on Oct 9, 2026, 3 days ago");
});

// ---------- C16 ----------
Deno.test("C16: a stored restaurants cap reports against the real rows; the monthly report names person-to-person apart", async () => {
  const budgets = [{ id: "b1", kind: "category_budget", category: "restaurants", amount_cents: 40000, period: "month", status: "active" }];
  const r = await budgetReply("how are my budgets doing?", NOW, { budgets: async () => budgets, transactions: async () => K1_TX }, TZ);
  assertStringIncludes(r!, "Restaurants budget for October: $0.00 spent of $400.00, $400.00 left.");
  const report = (Budgets as any).monthlyReport(budgets, K1_TX.map((t: any) => ({ ...t, posted_at: t.posted_on, amount: t.amount_cents / 100 })), "2026-09", TZ);
  assert(report && /person-to-person/i.test(report.text), report && report.text);
});

Deno.test("C16: the set command in the capability's own words ('Cap restaurants at $400 a month') sets the budget", () => {
  const p = (Budgets as any).parse("Cap restaurants at $400 a month");
  assert(p && p.kind === "set" && p.category === "restaurants" && p.amount_cents === 40000, JSON.stringify(p));
  const out = (Budgets as any).command("Cap restaurants at $400 a month", [], NOW, "America/Chicago");
  assert(out && Array.isArray(out.watches) && out.watches.length === 1, JSON.stringify(out));
  assertStringIncludes(out.reply, "$400.00");
});

// ---------- C201 (nearest existing surfaces; the annual underwriting report itself is not built) ----------
Deno.test("C201 partial surfaces: the checkup's October numbers tie to the raw rows", async () => {
  const r = await moneyReply("How am I doing?", NOW, read, TZ);
  assertStringIncludes(r!, "Cash: $413.29 across 1 account");
  assertStringIncludes(r!, "This month so far (Oct 1-12): $432.06 in, $52.56 out.");
});
