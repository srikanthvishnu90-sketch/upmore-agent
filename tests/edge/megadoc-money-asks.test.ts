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

