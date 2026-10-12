// Rewards math in chat (agent-chat/_shared/rewards_answer.ts): which messages it answers, and that it reads the
// person's rows only when it does. Accounts and rows are MOCK.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { rewardsReply } from "../../supabase/functions/agent-chat/_shared/rewards_answer.ts";

const ACCOUNTS = [{ account_id: "mock-ff", name: "Chase Freedom Flex", account_kind: "credit", status: "active" }];
const TX = [{ account_id: "mock-ff", provider_transaction_id: "m1", posted_on: "2026-10-02", amount_cents: -4000, merchant_raw: "KROGER #1", is_pending: false, is_transfer: false, currency: "USD" }];

Deno.test("rewards questions are answered from the person's own card rows, with the dated term cited", async () => {
  let reads = 0;
  const r = await rewardsReply("how am i doing on my freedom flex 5% this quarter", "2026-10-12", async () => { reads++; return ACCOUNTS; }, async () => { reads++; return TX; });
  assertMatch(r!, /\$40\.00 at merchants that fit/);
  assertMatch(r!, /checked 2026-10-11/);
  assertEquals(reads, 2);
});

Deno.test("anything else returns null without reading a row", async () => {
  for (const m of ["what's my balance", "send sam 40", "cancel netflix", "apply for the sapphire card", "how much did i spend on food last month"]) {
    let reads = 0;
    const r = await rewardsReply(m, "2026-10-12", async () => { reads++; return ACCOUNTS; }, async () => { reads++; return TX; });
    assertEquals(r, null, m);
    assertEquals(reads, 0, m);
  }
});

Deno.test("no linked cards: nothing to say here (the nothing-linked line answers elsewhere)", async () => {
  const r = await rewardsReply("freedom flex 5% categories", "2026-10-12", async () => [], async () => []);
  assert(r === null);
});
