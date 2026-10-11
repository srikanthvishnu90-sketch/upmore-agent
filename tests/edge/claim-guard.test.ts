// The model-path claim guard (testing agent O-15): a model reply never claims a money action that did not run.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { guardMoneyClaim, CORRECTION } from "../../supabase/functions/_shared/claim_guard.ts";

Deno.test("claims of a money action the model cannot take are corrected", () => {
  for (const r of ["Done! Sent $40 to Mike.", "I've sent Mike $40.", "I just bought $5 of NVDA for you.", "All set: cancelled your Hulu subscription.", "I went ahead and cancelled Hulu.", "Your payment has been sent.", "I have transferred $200 to savings.", "Sure, I placed the order."]) {
    const g = guardMoneyClaim(r);
    assert(g.caught, r);
    assert(g.reply.startsWith(r) && g.reply.endsWith(CORRECTION), r);
  }
});

Deno.test("ordinary answers, history and offers pass untouched", () => {
  for (const r of ["You sent Mike $40 on Tuesday (Chase checking, as of 2:14 PM).", "Want me to send Mike $40? I'll put up a card.", "I sent you a summary above.", "Your NVDA order filled at $182.40 per your Alpaca account.", "I can cancel Hulu for you: say cancel hulu and I'll show a card.", "Nothing was sent.", "I've set up nothing yet."]) {
    const g = guardMoneyClaim(r);
    assertEquals(g, { reply: r, caught: false }, r);
  }
});

Deno.test("the correction is appended once", () => {
  const once = guardMoneyClaim("I've sent it.").reply;
  assertEquals(guardMoneyClaim(once).reply, once);
});

Deno.test("the handler runs the guard on both model paths, before the reply is stored", () => {
  const h = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));
  assert(h.includes('import { guardMoneyClaim } from "../_shared/claim_guard.ts";'));
  assert(h.indexOf("reply = guardMoneyClaim(reply).reply;") < h.indexOf('{ thread_id: tid, role: "assistant", content: reply, meta: { action, violations'));
  assert(h.includes("const reply = result.action ? result.reply : guardMoneyClaim(result.reply).reply;"));
});
