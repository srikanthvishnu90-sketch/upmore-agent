// "Let me test ideas with paper trading" (owner's 200 list #46, 50-scenario S46) against the standing rule (owner,
// 2026-10-11): everything is live, no paper trading, paper accounts or paper fallback anywhere. The ask used to fall
// through to the model, which could offer a practice account; code answers it now. Other uses of "paper" are not taken.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { paperTradingReply, connectReply, creditScoreReply } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";
import handler from "../../supabase/functions/agent-chat/handler.ts" with { type: "text" };

const ASKS = ["let me test ideas with paper trading", "can I paper trade first?", "i want to practice trading with fake money", "is there a paper account", "do you have a demo account for trading",
  "set me up with a practice brokerage account", "can i simulate a trade before buying", "paper trading mode please", "turn on paper mode"];
const NOT = ["buy paper towels", "is costco toilet paper cheaper", "paper statement fee on my account", "i got a paper check from my insurer", "should i file a paper return",
  "buy $5 of VOO", "what's the white paper on this coin", "practice budgeting with me", "simulate my cash flow for 90 days"];

Deno.test("a paper-trading ask is answered from code: live only, nothing placed, no practice account", () => {
  for (const ask of ASKS) {
    const r = paperTradingReply(ask);
    assert(r, `not answered: ${ask}`);
    assertEquals(r, "Upmore doesn't offer paper trading or practice accounts: every order is real, in your own brokerage account, placed only after your yes, and capped at $5 an order for now. Nothing was placed.");
    assertEquals(connectReply(ask), null, ask);
    assertEquals(creditScoreReply(ask), null, ask);
  }
});

Deno.test("other uses of paper, and real orders, are not taken", () => {
  for (const ask of NOT) assertEquals(paperTradingReply(ask), null, ask);
});

Deno.test("the handler asks it with the other code answers, before any read of the person's rows", () => {
  assert(/connectReply\(message\) \?\? creditScoreReply\(message\) \?\? bureauReply\(message, localClock\(Date\.now\(\), tz\)\.date\) \?\? paperTradingReply\(message\)/.test(handler));
});
