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
