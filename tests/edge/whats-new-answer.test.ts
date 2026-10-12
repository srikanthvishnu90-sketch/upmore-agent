// "What's new" answered from code (agent-chat/_shared/whats_new_answer.ts; packages/domain/92-whats-new.js): which
// messages fire, what each reads, and that the marker comes back from the thread. Rows are MOCK.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { whatsNewReply } from "../../supabase/functions/agent-chat/_shared/whats_new_answer.ts";
// Read as text imports so the suite runs without file permissions (the evidence recorder runs it with none).
import SRC_HANDLER from "../../supabase/functions/agent-chat/handler.ts" with { type: "text" };

const TODAY = "2026-10-12";
const row = (d: string, c: number, m: string) => ({ account_id: "MOCK-chk", provider_transaction_id: `MOCK-${d}-${m}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false });
const ROWS = [row("2026-09-01", -1200, "SHELL OIL"), row("2026-10-10", -899, "NEWSTREAM.TV"), row("2026-10-11", -2500, "KROGER #1")];

Deno.test("only a what's-new ask fires; nothing else reads anything", async () => {
  let reads = 0;
  for (const m of ["what's my balance", "find me money", "what's new with tesla stock", "dispute this charge"]) {
    assertEquals(await whatsNewReply(m, TODAY, async () => { reads++; return []; }, async () => { reads++; return []; }), null, m);
  }
  assertEquals(reads, 0);
});

Deno.test("the first ask covers 7 days; the next one starts after the marker it left in the thread", async () => {
  const first = (await whatsNewReply("what's new?", TODAY, async () => ROWS as any, async () => []))!;
  assertMatch(first, /^2 new transactions in the last 7 days/);
  assertMatch(first, /Reviewed through 2026-10-11\./);
  const thread = [{ role: "assistant", content: first }];
  const again = (await whatsNewReply("anything new", TODAY, async () => ROWS as any, async () => thread))!;
  assertMatch(again, /^Nothing new has posted since you last checked \(reviewed through Oct 11\)\./);
});

Deno.test("a failed thread read falls back to the first-time window, never an error", async () => {
  const r = (await whatsNewReply("what's new?", TODAY, async () => ROWS as any, async () => { throw new Error("down"); }))!;
  assertMatch(r, /in the last 7 days/);
});

Deno.test("the handler asks it after the money answers and before dispute, with the shared thread reader", () => {
  const h = SRC_HANDLER;
  const wn = h.indexOf("if (!direct) direct = await whatsNewReply(message, today, readTx, readPrevious);");
  const disp = h.indexOf("if (!direct) direct = await disputeReply(");
  assert(wn > 0 && disp > wn);
  assert(h.includes("previous: readPrevious,"));
});

// "Anything unusual?" through the chat answer (capability list item 9, overnight 2026-10-12). MOCK rows.
Deno.test("an unusual-spending ask is answered from the person's rows, with the source line, and changes nothing", async () => {
  const rows: any[] = [["2026-08-02", -1200, "SHELL OIL 1234"], ["2026-09-02", -1300, "SHELL OIL 1234"], ["2026-09-05", -1250, "SHELL OIL 1234"], ["2026-10-08", -4200, "SHELL OIL 1234"]]
    .map(([d, c, m], i) => ({ account_id: "mock-chk", provider_transaction_id: "mock-u" + i, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false }));
  const r = (await whatsNewReply("any unusual charges?", "2026-10-12", async () => rows, async () => []))!;
  assertEquals(r.split("\n")[0], "In the last 30 days (Sep 13 to Oct 12), 1 thing stands out:");
  assert(/SHELL OIL 1234 charged \$42\.00 on Oct 8, more than twice its usual \$12\.50\./.test(r), r);
  assert(r.endsWith("Nothing was changed or disputed. From your linked accounts, transactions through Oct 8, 2026."), r);
});
