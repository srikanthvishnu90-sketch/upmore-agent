// The early server guards (agent-chat/_shared/capabilities.ts tryServerGuards) run before the flows. Live gauntlet,
// 2026-10-12: they refused real orders ("buy like 500 bucks of voo", "buy five hundred dollars of VOO", "buy $500 VOO in my
// roth") with copy that is no longer true ("Upmore never touches your accounts"), and "what can't you do" got the old
// earn-only persona from the model.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { tryServerGuards, LIMITS_ANSWER } from "../../supabase/functions/agent-chat/_shared/capabilities.ts";

Deno.test("an order the person names is not advice: the guards let it through to the trade flow", () => {
  for (const t of ["buy like 500 bucks of voo", "buy five hundred dollars of VOO", "buy $500 VOO in my roth", "buy 2 shares of vt", "Buy 2 shares of vt", "invest $500 in VOO", "sell my AAPL", "grab me $500 voo pls"]) assertEquals(tryServerGuards(t), null, t);
});

Deno.test("advice is still refused, in words that are true today", () => {
  for (const t of ["should i buy tesla", "is Tesla a good investment", "best stocks to buy right now", "which etf should i buy"]) {
    const r = tryServerGuards(t);
    assert(r && /can't recommend what to invest in/.test(r), t);
    assert(!/never touches your accounts|not investing/.test(r!), t);
  }
});

Deno.test("moving money between accounts is not built: said plainly, never 'Upmore never touches your accounts'", () => {
  const r = tryServerGuards("transfer my money for me");
  assert(r && /can't move money between your accounts yet, so nothing was moved/.test(r));
  assert(!/never touches your accounts/.test(r!));
});

Deno.test("\"what can't you do\" gets the honest list, at least three lines, every line a rule the code enforces", () => {
  for (const t of ["what can't you do", "what cant you do", "What can't Upmore do?", "what are your limits"]) assertEquals(tryServerGuards(t), LIMITS_ANSWER, t);
  const items = LIMITS_ANSWER.split("\n").filter((l) => l.startsWith("- "));
  assert(items.length >= 3);
  for (const must of ["investment advice", "Robinhood, Fidelity or Vanguard", "passwords or one-time codes", "No crypto, betting or prediction markets", "No phone calls"]) assert(LIMITS_ANSWER.includes(must), must);
  assert(!/never touches your accounts|I don't move your money/.test(LIMITS_ANSWER));
});
