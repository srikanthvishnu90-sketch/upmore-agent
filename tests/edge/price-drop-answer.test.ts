// Price-drop claims in chat (agent-chat/_shared/price_drop_answer.ts): which messages fire, and rows are read only then.
import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { priceDropReply } from "../../supabase/functions/agent-chat/_shared/price_drop_answer.ts";

const ROWS = [{ account_id: "mock-card", provider_transaction_id: "m1", posted_on: "2026-10-03", amount_cents: -9630, merchant_raw: "TARGET 00012345", is_pending: false, is_transfer: false, currency: "USD" }];

Deno.test("a store price drop is answered from the person's card rows with the cited window", async () => {
  let reads = 0;
  const r = await priceDropReply("target dropped the price of my air fryer from $89.99 to $69.99", "2026-10-12", async () => { reads++; return ROWS; });
  assertMatch(r!, /inside Target's 14-day window \(per Target Price Match Guarantee, checked 2026-10-11\)/);
  assertEquals(reads, 1);
});

Deno.test("other messages read nothing", async () => {
  for (const m of ["what's my balance", "find me money", "cancel target circle", "send sam 40 for target run"]) {
    let reads = 0;
    assertEquals(await priceDropReply(m, "2026-10-12", async () => { reads++; return ROWS; }), null, m);
    assertEquals(reads, 0, m);
  }
});
