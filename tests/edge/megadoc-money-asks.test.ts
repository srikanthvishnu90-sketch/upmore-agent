// Megadoc first messages the money answers own (verdicts in evals/scenarios/verdicts.cjs): G16 "what's my cash", L02
// "where is my money going", L08 "what's my biggest expense", L11 "how much do I have left this month after bills", L12
// "can I afford a 900 trip", plus L01 and L05 which already were. Through the handler's own chain (tests/edge/lib/
// direct_chain.ts, MOCK rows): the first answer that speaks, and the start of what it says. Permission-free.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { ANSWERS, ORDER } from "./lib/direct_chain.ts";

async function first(m: string): Promise<[string | null, string]> {
  for (const k of ORDER) { const f = ANSWERS[k]; if (!f) continue; const r = await f(m); if (r) return [k, r]; }
  return [null, ""];
}
const SRC = /\nFrom your linked accounts\b[^\n]*\.(?: [^\n]*)?$/;

Deno.test("G16 / F08: the cash balance, with its as-of", async () => {
  const [k, r] = await first("what's my cash");
  assertEquals(k, "moneyReply");
  assertMatch(r, /^You have \$2,500\.00 in cash across 1 account, as of Oct 12/);
  assertMatch(r, SRC);
});

Deno.test("L02 / L08: this month's spending with its top places", async () => {
  for (const m of ["where is my money going", "what's my biggest expense"]) {
    const [k, r] = await first(m);
    assertEquals(k, "moneyReply", m);
    assertMatch(r, /^You spent \$154\.29 this month so far \(Oct 1-12\)\.\n[^\n]+\nTop: Target \$96\.30, Kroger \$42\.00, Netflix \$15\.99\./, m);
    assertMatch(r, SRC, m);
  }
});

Deno.test("L11: what is left after bills is safe to spend, its period said", async () => {
  const [k, r] = await first("how much do I have left this month after bills");
  assertEquals(k, "moneyReply");
  assertMatch(r, /^Safe to spend over the next 30 days \(to Nov 11\): \$2,484\.01/);
  assert(r.includes("minus $15.99 of bills due by then"), r);
});

Deno.test("L12: a bare 900 is $900.00; a 2 week trip is not $2", async () => {
  const [k, r] = await first("can I afford a 900 trip");
  assertEquals(k, "moneyReply");
  assertMatch(r, /^For \$900\.00 today: yes\./);
  assertEquals((await first("can i afford a 2 week trip"))[0], null);
});

Deno.test("J03: the subscriptions that repeat, each with its latest charge, and the cancel flow's own yes", async () => {
  const [k, r] = await first("what subscriptions do I have");
  assertEquals(k, "moneyReply");
  assertMatch(r, /^1 subscription repeats in your linked accounts, about \$15\.99 a month \(\$191\.88 a year\):\n- Netflix: \$15\.99 a month, last charged Oct 5\n/);
  assert(r.includes('Say "cancel Netflix" to start a cancellation; nothing is cancelled until you say yes to it.'), r);
  assertMatch(r, SRC);
});

Deno.test("M04 / C08: interest paid in and a payment from a person, from rows; none is said with where else to look", async () => {
  const [k, r] = await first("how much am I earning on savings");
  assertEquals(k, "moneyReply");
  assertMatch(r, /^I don't see any interest paid into your linked accounts since Aug 5, 2026\. The rate isn't in your bank rows/);
  const [k2, r2] = await first("did maya pay me back?");
  assertEquals(k2, "moneyReply");
  assertMatch(r2, /^I don't see a payment from Maya in your linked accounts since Aug 13\.\nVenmo, Cash App and PayPal money stays in the app/);
  assertMatch(r2, SRC);
});

Deno.test("K01 / K02 / K05: what's this charge, from rows; disputes stay with the dispute answer", async () => {
  const [k, r] = await first("whats this 96.30 charge from target");
  assertEquals(k, "moneyReply");
  assertMatch(r, /^\$96\.30 on Oct 3 \([^)]+\), shown by your bank as "Target"\.\n/);
  assert(r.includes('say "dispute this charge" and I\'ll draft the dispute for you to file. Nothing was sent.'), r);
  assertMatch(r, SRC);
  assertMatch((await first("target charged me twice"))[1], /^I see one charge from Target in the last 90 days, but no two of the same amount within 3 days/);
  assertEquals((await first("i never authorized this charge"))[0], "disputeReply");
});


Deno.test("J08: charged after a cancel, from the cancel flow's own record and the rows; an unreadable record is said", async () => {
  const [k, r] = await first("I got charged for something I cancelled");
  assertEquals(k, "moneyReply");
  // The MOCK record: Netflix cancelled Oct 6 (its own record); the last Netflix charge is Oct 5, before it.
  assertMatch(r, /^I don't see a charge from Netflix after you cancelled on Oct 6 \(Netflix's own record when I cancelled it for you\)\./);
  assertMatch(r, SRC);
  for (const m of ["netflix charged me after i cancelled", "still being billed for netflix even though i cancelled"]) assertEquals((await first(m))[0], "moneyReply", m);
  // The dispute and win-back answers keep theirs.
  assertEquals((await first("dispute the netflix charge i cancelled"))[0], "disputeReply");
  const { moneyReply } = await import("../../supabase/functions/agent-chat/_shared/money_answers.ts");
  const acc = [{ account_id: "a", name: "Card", institution: "Mock", account_kind: "credit", balance_cents: 0, balance_as_of: "2026-10-12T08:00:00Z", fetched_at: "2026-10-12T08:00:00Z", status: "active", currency: "USD" }];
  const unreadable = await moneyReply("I got charged for something I cancelled", new Date("2026-10-12T15:00:00Z"), { accounts: async () => acc as any, transactions: async () => [], cancellations: async () => { throw new Error("down"); } }, { tz: "America/New_York" });
  assertMatch(unreadable!, /^I can't read the cancellations I've done for you right now/);
});

Deno.test("D13: rent against cash from the rows, through the handler's chain; paying rent stays the rent flow's", async () => {
  const [k, r] = await first("rent is due and I only have 1900");
  assertEquals(k, "moneyReply");
  // The MOCK rows have no repeating rent, so the rent is asked for, never guessed.
  assertMatch(r, /^I don't see a rent payment that repeats in your linked accounts; .*How much is rent and when is it due\?/);
  assertMatch(r, SRC);
  assertEquals((await first("pay my rent"))[0], null);
  const { moneyReply } = await import("../../supabase/functions/agent-chat/_shared/money_answers.ts");
  const acc = [{ account_id: "chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 50000, available_cents: 50000, balance_as_of: "2026-10-12T12:00:00Z", fetched_at: "2026-10-12T12:00:00Z", status: "active", currency: "USD" }];
  const rows = ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].map((d, i) => ({ account_id: "chk", provider_transaction_id: `rent-${i}`, posted_on: d, amount_cents: -240000, merchant_raw: "OAK PROPERTY MGMT RENT", is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T12:00:00Z" }));
  const t = await moneyReply("i can't pay rent this month", new Date("2026-10-12T15:00:00Z"), { accounts: async () => acc as any, transactions: async () => rows as any }, { tz: "America/New_York" });
  assertMatch(t!, /^Rent: \$2,400\.00 due Nov 1 \(your repeating payment to Oak Property Mgmt Rent\)\.\nCash: \$500\.00 \(your linked checking and savings\)\.\nShort by \$1,900\.00 today\./);
  assertMatch(t!, /\nNothing was paid, moved or sent\.\n/);
});

Deno.test("M06: a savings target's monthly amount against what the person keeps, through the handler's chain; nothing moved", async () => {
  const [k, r] = await first("I want to save 10000 by June");
  assertEquals(k, "moneyReply");
  assertMatch(r, /^To save \$10,000\.00 by Jun 30, 2027: \$1,250\.00 a month for 8 months \(Nov through Jun\), or about \$264\.00 a week\.\n/);
  assertMatch(r, /\nThis is the math only: nothing is moved or set aside, and goals aren't saved yet\.\n/);
  assertMatch(r, SRC);
  assertEquals((await first("help me save money"))[0], "findMoneyReply");
});

Deno.test("L06: a disputed spending total is rechecked from the thread's last answer, with the charges behind it", async () => {
  const { moneyReply } = await import("../../supabase/functions/agent-chat/_shared/money_answers.ts");
  const acc = [{ account_id: "chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 100000, available_cents: 100000, balance_as_of: "2026-10-12T12:00:00Z", fetched_at: "2026-10-12T12:00:00Z", status: "active", currency: "USD" }];
  const t = (d: string, c: number, m: string) => ({ account_id: "chk", provider_transaction_id: `${d}-${m}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T12:00:00Z" });
  const rows = [t("2026-08-02", -500, "X"), t("2026-09-03", -9000, "TRADER JOE S #552"), t("2026-09-11", -6000, "WHOLEFDS MKT 10230")];
  const now = new Date("2026-10-12T15:00:00Z"), ask = "how much did i spend on groceries in september";
  const rd = (thread: any[]) => ({ accounts: async () => acc as any, transactions: async () => rows as any, previous: async () => thread });
  const answer = await moneyReply(ask, now, rd([]), { tz: "America/New_York" });
  assertMatch(answer!, /^You spent \$150\.00 on groceries in September/);
  const thread = [{ role: "assistant", content: answer }, { role: "user", content: ask }];
  const r = await moneyReply("i spent less than that", now, rd(thread), { tz: "America/New_York" });
  assertMatch(r!, /^Rechecked from your rows: \$150\.00 on groceries in September \(Sep 1-30\), from 2 charges\.\nThe charges: Trader Joe's \$90\.00 on Sep 3; Whole Foods \$60\.00 on Sep 11\.\n/);
  // "Show me the math" right after a spending total gives the same recheck.
  assertMatch((await moneyReply("show me the math", now, rd(thread), { tz: "America/New_York" }))!, /^Rechecked from your rows: \$150\.00/);
  // A bare "that's wrong" with no spending answer just given goes on to the model.
  assertEquals(await moneyReply("that's wrong", now, rd([]), { tz: "America/New_York" }), null);
});
