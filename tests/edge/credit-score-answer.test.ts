// "What's my credit score" with no credit source connected (overnight 2026-10-12, from the INTENTS packet's notes): it
// went to the model with the general FICO facts, and the reply guard polices dollar amounts only, so nothing stopped a
// made-up score. No bureau or score feed is connected (capability items 37 and 101), so the answer comes from code and
// says so. How-to questions about credit still go to the model with the FICO facts; credit cards are not a score.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
const handler = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));
import { creditScoreReply, connectReply } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";

const ASKS = ["what is my credit score", "whats my credit score?", "what's my fico score", "did my credit score go up", "did my credit score drop this month",
  "how's my credit", "how is my credit score doing", "can you check my credit score", "show me my credit score", "what's my vantagescore", "hey what is my credit score rn"];
const NOT = ["how do i improve my credit score", "what is a good credit score", "does closing a card hurt my credit score", "will paying off my card raise my credit score",
  "what affects my credit score", "what's my credit card balance", "how is my credit card doing", "what's my credit limit", "pay my credit card",
  "is my sapphire preferred annual fee worth it", "how am i doing on my freedom flex 5%", "check my credit report"];

Deno.test("a question about the person's own score is answered from code: nothing connected, no number guessed", () => {
  for (const ask of ASKS) {
    const r = creditScoreReply(ask);
    assert(r, `not answered: ${ask}`);
    assert(/no credit bureau or score source is connected/.test(r!), r!);
    assert(!/\b[3-8]\d\d\b/.test(r!), `a score-like number in: ${r}`);
    assertEquals(connectReply(ask), null, ask);
  }
});

Deno.test("how-to questions, credit cards and rewards are not a score lookup", () => {
  for (const ask of NOT) assertEquals(creditScoreReply(ask), null, ask);
});

Deno.test("the handler asks it right after the connect answers, before any read of the person's rows", () => {
  assertMatch(handler, /let direct: string \| null = connectReply\(message\) \?\? creditScoreReply\(message\)/);
});
