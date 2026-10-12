// The model-path claim guard (testing agent O-15): a model reply never claims a money action that did not run.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { guardMoneyClaim, CORRECTION, guardSecretAsk, SECRET_SAFE } from "../../supabase/functions/_shared/claim_guard.ts";

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
// The handler wiring is checked in tests/model-guards-wiring.test.cjs (it reads the source; edge tests run without permissions).

Deno.test("a reply that asks for a password, a code or a full number in a message loses that sentence and says the right way", () => {
  for (const ask of ["Send me your Robinhood password and I'll log in.", "What's your Fidelity login password?", "Reply with the 6-digit verification code from your bank.", "Please enter your account number here.", "Give me your API key and secret and I'll connect Kalshi.", "I'll need your card number and CVV to set that up."]) {
    const g = guardSecretAsk(`Sure. ${ask} Then we're set.`);
    assert(g.caught, ask);
    assertEquals(g.reply, `Sure. Then we're set.\n\n${SECRET_SAFE}`);
  }
  assertEquals(guardSecretAsk("What's your Fidelity login password?").reply, SECRET_SAFE);
  // A warning is not an ask, and ordinary replies pass untouched.
  for (const ok of ["Never share your password with anyone.", "Don't send me your SSN.", "Tap the link to connect Alpaca.", "You spent $40 on food this week.", SECRET_SAFE]) assertEquals(guardSecretAsk(ok), { reply: ok, caught: false }, ok);
});
