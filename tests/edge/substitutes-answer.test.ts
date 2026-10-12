// Free substitutes in chat (agent-chat/_shared/substitutes_answer.ts, overnight D7): which messages fire, and rows are
// read only for a library-streaming ask (a pasted receipt reads nothing). Rows are MOCK.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { substitutesReply } from "../../supabase/functions/agent-chat/_shared/substitutes_answer.ts";

const TODAY = "2026-10-12";
const ROWS = [
  { account_id: "mock-card", provider_transaction_id: "m1", posted_on: "2026-09-05", amount_cents: -1599, merchant_raw: "NETFLIX.COM", is_pending: false, is_transfer: false, currency: "USD" },
  { account_id: "mock-card", provider_transaction_id: "m2", posted_on: "2026-10-05", amount_cents: -1599, merchant_raw: "NETFLIX.COM", is_pending: false, is_transfer: false, currency: "USD" },
];

Deno.test("a library-streaming ask reads the rows once and cites the offer book", async () => {
  let reads = 0;
  const r = (await substitutesReply("is there a free alternative to netflix", TODAY, async () => { reads++; return ROWS as any[]; }))!;
  assertMatch(r, /Kanopy is free with a participating library card; check your library \(per Kanopy, Seattle Public Library, checked 2026-10-11\)/);
  assertMatch(r, /- Netflix: \$15\.99 on 2026-10-05, billed every month\. The gap is \$15\.99 a month/);
  assertEquals(reads, 1);
});

Deno.test("a pasted receipt reads nothing and puts no price on the store brand", async () => {
  let reads = 0;
  const r = (await substitutesReply("store brand swaps?\nTIDE PODS 13.99\nCHEERIOS 4.29", TODAY, async () => { reads++; return ROWS as any[]; }))!;
  assertMatch(r, /- Tide \(\$13\.99 on your receipt\): the store's own laundry detergent/);
  assertMatch(r, /the price is on the shelf tag/);
  assertEquals(reads, 0);
});

Deno.test("other messages read nothing", async () => {
  for (const m of ["what's my balance", "find me money", "cancel netflix", "am i overpaying for streaming", "is netflix free with my t-mobile plan", "hulu free trial ends friday", "is there a generic version of my prescription"]) {
    let reads = 0;
    assertEquals(await substitutesReply(m, TODAY, async () => { reads++; return ROWS as any[]; }), null, m);
    assertEquals(reads, 0, m);
  }
});

Deno.test("the handler asks substitutes after the savings answer and before find-me-money, inside the plain-failure catch", () => {
  const h = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));
  const subs = h.indexOf("if (!direct) direct = await subscriptionReply(message, today, oldestFirst);");
  const sub = h.indexOf("if (!direct) direct = await substitutesReply(message, today, oldestFirst);");
  const find = h.indexOf("if (!direct) direct = await findMoneyReply(message, today, oldestFirst);");
  const caught = h.indexOf("} catch { direct = MONEY_UNAVAILABLE; }");
  assert(subs > 0 && sub > subs && find > sub && caught > find);
});
