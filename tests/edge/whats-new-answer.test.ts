// "What's new" answered from code (agent-chat/_shared/whats_new_answer.ts; packages/domain/92-whats-new.js): which
// messages fire, what each reads, and that the marker comes back from the thread. Rows are MOCK.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { whatsNewReply } from "../../supabase/functions/agent-chat/_shared/whats_new_answer.ts";

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
  const h = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));
  const wn = h.indexOf("if (!direct) direct = await whatsNewReply(message, today, readTx, readPrevious);");
  const disp = h.indexOf("if (!direct) direct = await disputeReply(");
  assert(wn > 0 && disp > wn);
  assert(h.includes("previous: readPrevious,"));
});
