// Card-linked offers in chat (agent-chat/_shared/card_offers_answer.ts): a pasted offer list is answered from the
// person's own rows; an ask without a list reads nothing; anything else returns null without reading a row. Accounts and
// rows are MOCK.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { cardOffersReply } from "../../supabase/functions/agent-chat/_shared/card_offers_answer.ts";

const TODAY = "2026-10-12";
const ACCOUNTS = [{ account_id: "mock-bce", name: "Blue Cash Everyday", institution: "American Express", account_kind: "credit", status: "active" }];
const TX = [
  { account_id: "mock-bce", provider_transaction_id: "m1", posted_on: "2026-09-01", amount_cents: -6210, merchant_raw: "WALGREENS #1234", is_pending: false, is_transfer: false, currency: "USD" },
  { account_id: "mock-bce", provider_transaction_id: "m2", posted_on: "2026-10-01", amount_cents: -5500, merchant_raw: "WALGREEN PHARMACY 77", is_pending: false, is_transfer: false, currency: "USD" },
];

Deno.test("a pasted offer list is matched against the person's own rows, terms per the paste, nothing activated", async () => {
  let reads = 0;
  const r = await cardOffersReply("Amex Offers: Spend $50 or more at Walgreens, get $10 back. Expires 11/30/2026", TODAY, async () => { reads++; return ACCOUNTS; }, async () => { reads++; return TX; });
  assertMatch(r!, /terms per the offer you pasted/);
  assertMatch(r!, /- Walgreens: spend \$50\.00 or more, get \$10\.00 back; expires 2026-11-30\. You bought there 2 times in the last 180 days/);
  assertMatch(r!, /Amex Offers: on your Blue Cash Everyday\./);
  assertMatch(r!, /I don't add, activate or enroll anything/);
  assertMatch(r!, /From your linked accounts: posted purchases 2026-09-01 through 2026-10-01\./);
  assertEquals(reads, 2);
});

Deno.test("an ask without a list, or to activate, is answered without reading a row", async () => {
  for (const m of ["which of these amex offers should i use?", "activate all my chase offers"]) {
    let reads = 0;
    const r = await cardOffersReply(m, TODAY, async () => { reads++; return ACCOUNTS; }, async () => { reads++; return TX; });
    assert(r && /Paste the offers/.test(r), m);
    assertEquals(reads, 0, m);
  }
});

Deno.test("anything else returns null without reading a row", async () => {
  for (const m of ["what's my balance", "send sam 40", "cancel netflix", "find me money", "how am i doing on my freedom flex 5%", "i got $10 back from walgreens for a return", "does chase offer a checking bonus?"]) {
    let reads = 0;
    assertEquals(await cardOffersReply(m, TODAY, async () => { reads++; return ACCOUNTS; }, async () => { reads++; return TX; }), null, m);
    assertEquals(reads, 0, m);
  }
});
