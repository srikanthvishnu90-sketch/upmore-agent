// The testing agent's live runner (evals/agent/live.ts), driven here by a MOCK chat handler: it proves the guard refuses
// before any request, a wrong card is answered no, and every yes is written to the ledger. No real order is placed here.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { runLive, spent, type Ledger } from "../../evals/agent/live.ts";

const now = () => new Date("2026-10-11T15:00:00Z");
const ledger = (rows: any[] = []): Ledger => ({ envelope_cents: 20000, order_cap_cents: 500, rows });
function mock(card: string, receipt: string) {
  const calls: string[] = [];
  return { calls, send: async (m: string) => { calls.push(m); return m.startsWith("buy") ? { reply: card, thread_id: "t1" } : m === "yes" ? { reply: receipt, thread_id: "t1" } : { reply: "Okay, nothing was placed.", thread_id: "t1" }; } };
}
const CARD = "LIVE: Buy $5.00 of SPY (SPDR S&P 500) in your Alpaca account (****4417). No fee. Quote $571.20 (your Alpaca account, IEX ask, 15:00 UTC). Reply YES or NO within 10 min, or DETAILS.";
const WORKING = "LIVE: Placed, not filled: buy $5.00 of SPY in your Alpaca account (****4417), order ord-abc123, working per your Alpaca account (as of 15:00 UTC).";

Deno.test("MOCK: a good card and receipt pass, and the receipt is in the ledger before anything else", async () => {
  const m = mock(CARD, WORKING), l = ledger(); let saved = 0;
  const r = await runLive({ send: m.send, ledger: l, line: "manual_and_dividends", symbol: "SPY", cents: 500, now, save: () => saved++ });
  assertEquals(r.status, "PASS"); assertEquals(m.calls, ["buy $5.00 of SPY", "yes"]); assertEquals(saved, 1);
  assertEquals(l.rows[0].order_id, "ord-abc123"); assertEquals(l.rows[0].status, "working"); assertEquals(spent(l), 500);
});

Deno.test("MOCK: the guard refuses before any request: over $5, over the line, over $200", async () => {
  for (const [cents, rows, line] of [[600, [], "manual_and_dividends"], [500, [{ cents: 2500, line: "manual_and_dividends" }], "manual_and_dividends"], [500, Array.from({ length: 40 }, () => ({ cents: 500, line: "buffer" })), "recurring"], [500, [], "not_a_line"]] as const) {
    const m = mock(CARD, WORKING);
    const r = await runLive({ send: m.send, ledger: ledger(rows as any[]), line, symbol: "SPY", cents, now, save: () => { throw new Error("must not save"); } });
    assertEquals(r.status, "REFUSED", `${cents} ${line}`); assertEquals(m.calls, []);
  }
});

Deno.test("MOCK: a card that is not LIVE, for the wrong amount, or mentions paper is answered no and costs nothing", async () => {
  for (const bad of [CARD.replace("LIVE: ", ""), CARD.replace("$5.00", "$4.00"), CARD + " Paper account."]) {
    const m = mock(bad, WORKING), l = ledger();
    const r = await runLive({ send: m.send, ledger: l, line: "manual_and_dividends", symbol: "SPY", cents: 500, now, save: () => {} });
    assertEquals(r.status, "FAIL"); assertEquals(m.calls, ["buy $5.00 of SPY", "no"]); assertEquals(l.rows, []);
  }
});

Deno.test("MOCK: an unreadable receipt after a yes is still counted as spent", async () => {
  const m = mock(CARD, "Something went wrong."), l = ledger();
  const r = await runLive({ send: m.send, ledger: l, line: "manual_and_dividends", symbol: "SPY", cents: 500, now, save: () => {} });
  assertEquals(r.status, "FAIL"); assertEquals(spent(l), 500); assert(l.rows[0].status === "unknown");
});

Deno.test("the committed ledger is inside the envelope and every row is $5 or less", () => {
  const l: Ledger = JSON.parse(Deno.readTextFileSync(new URL("../../evals/agent/live-ledger.json", import.meta.url)));
  assertEquals([l.envelope_cents, l.order_cap_cents], [20000, 500]);
  assert(spent(l) <= 20000); assert(l.rows.every(r => r.cents <= 500));
});
