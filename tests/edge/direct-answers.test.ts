// Direct answers from code (agent-chat/_shared/direct_answers.ts), each from a live gauntlet failure, 2026-10-12.
// Transactions here are MOCK fixtures.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import * as DirectAnswers from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";
import { connectReply, noDataReply, NO_ACCOUNTS, findMoneyReply, type TxRow } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";

Deno.test("connect my X answers from the connector matrix, never invented app steps (S16-19)", () => {
  assertMatch(connectReply("connect my fidelity")!, /^Fidelity doesn't let apps place trades, so Upmore tracks it read-only through Plaid .*Connect investments/);
  assertMatch(connectReply("can you connect my schwab account")!, /^Trading at Charles Schwab needs Charles Schwab's approval of Upmore/);
  assertEquals(connectReply("link my kalshi"), "Kalshi isn't available in Upmore, so nothing was connected.");
  assertEquals(connectReply("connect my coinbase"), "Coinbase isn't available in Upmore, so nothing was connected.");
  assertMatch(connectReply("connect my webull")!, /^Upmore can't connect Webull yet: .*Nothing was connected\.$/);
  // The live connector gets the owner's reference design: one line, then the link alone.
  assertEquals(connectReply("connect alpaca"), "Not connected yet - here's the link.\n\nhttps://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca");
  assertEquals(connectReply("connect my gmail"), "Not connected yet - here's the link.\n\nhttps://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/gmail");
  for (const t of ["what is fidelity", "connect the dots", "how do i connect"]) assertEquals(connectReply(t), null, t);
  for (const t of ["connect my fidelity", "connect my webull", "connect my cash app", "connect my empower 401k"]) assert(!/SnapTrade|owner|keys/.test(connectReply(t)!), `${t}: no internal words`);
});

// S16-15 "pay my rent" is the standing rent flow now (packages/domain/81-standing-rent.js through the flow router;
// tests/standing-rent.test.cjs, tests/edge/flow-router.test.ts). No direct answer may intercept it with "not built".
Deno.test("pay my rent is not answered from here: no direct answer intercepts it, so the standing rent flow does (S16-15)", async () => {
  for (const t of ["pay my rent", "pls pay the rent", "rent is 1500 now", "stop rent", "pay sam 900 for rent"]) {
    assertEquals(connectReply(t), null, t);
    assertEquals(noDataReply(t, 0), null, t);
    assertEquals(await findMoneyReply(t, "2026-10-12", async () => { throw new Error("no read for a rent message"); }), null, t);
  }
  const mod: Record<string, unknown> = DirectAnswers;
  assert(!("rentReply" in mod) && !("RENT_NOT_BUILT" in mod), "the not-built rent answer is gone");
});

Deno.test("with nothing linked, balance and spending get one plain line, not internal terms (S16-01, 02, 14, 16)", () => {
  for (const t of ["what's my balance", "how much did i spend on food last month", "how am i doing", "did rent go through"]) assertEquals(noDataReply(t, 0), NO_ACCOUNTS, t);
  assertEquals(noDataReply("what's my balance", 2), null, "with accounts linked the planner answers");
  assertEquals(noDataReply("what's a roth ira", 0), null);
  assert(!/retained|posted records|\[F1\]/.test(NO_ACCOUNTS));
});

const row = (id: string, on: string, cents: number, m: string): TxRow => ({ account_id: "mock-card", provider_transaction_id: id, amount_cents: cents, posted_on: on, merchant_raw: m, is_pending: false, is_transfer: false });

Deno.test("find me money ranks what the person's own rows show, with the source and as-of date (S16-18)", async () => {
  const tx: TxRow[] = [];
  let n = 0;
  for (const m of ["2026-07", "2026-08", "2026-09", "2026-10"]) {
    tx.push(row(`f${++n}`, `${m}-07`, -500, "MONTHLY MAINTENANCE FEE"));
    tx.push(row(`n${++n}`, `${m}-03`, -1799, "NETFLIX.COM"));
  }
  const r = (await findMoneyReply("find me money", "2026-10-12", async () => tx))!;
  assertMatch(r, /^Here's where your money is going that you could cut, biggest first:\n1\. \$5\.00 monthly maintenance fee every month: this saves an estimated \$5\.00 a month/);
  assertMatch(r, /From your linked accounts, transactions through 2026-10-07\. Estimates, not savings yet/);
  assertEquals(await findMoneyReply("find me money", "2026-10-12", async () => []), NO_ACCOUNTS);
  assertEquals(await findMoneyReply("how much money do i have", "2026-10-12", async () => tx), null);
});

Deno.test("find me money with only ordinary subscriptions lists them with their monthly total, never a made-up saving", async () => {
  const tx: TxRow[] = [];
  let n = 0;
  for (const m of ["2026-07", "2026-08", "2026-09", "2026-10"]) tx.push(row(`n${++n}`, `${m}-03`, -1799, "NETFLIX.COM"));
  const r = (await findMoneyReply("where can i save", "2026-10-12", async () => tx))!;
  assertMatch(r, /^Nothing stands out as waste, but these repeat \(\$17\.99 a month together\)\. Worth a look:\n1\. NETFLIX\.COM: \$17\.99 monthly\n/);
  assert(!/NaN|undefined/.test(r));
  assert(!/guarantee/i.test(r));
});
