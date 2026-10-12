// Standing rules on crypto and prediction markets (CLAUDE.md, decision 2; overnight 2026-10-12). "buy some ETH" slipped
// past the crypto guard (it knew only crypto/bitcoin/ethereum). And Kalshi or Polymarket got the sports-betting lecture
// ("most retail traders lose", "how gambling problems start"), while the owner's rule for them is: never encourage a
// decision; anything said there rests on numbers only. They now get a neutral "off for now"; sports betting is unchanged.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { tryCryptoGuard, tryGamblingGuard } from "../../supabase/functions/agent-chat/_shared/capabilities.ts";

Deno.test("crypto shorthand is caught by the crypto guard; look-alike words are not", () => {
  for (const a of ["buy some ETH", "put $5 in btc", "buy solana", "should i get dogecoin", "move my savings into usdc", "swap to a stablecoin", "buy XRP", "how much is litecoin"])
    assert(tryCryptoGuard(a), a);
  for (const a of ["ethan sent me 20", "whether i can afford a tv", "buy $5 of VOO", "my ethernet cable", "solar panels worth it", "pay sol 30"])
    assertEquals(tryCryptoGuard(a), null, a);
});

Deno.test("a prediction-market ask gets a neutral 'off for now', no opinion about winning or losing", () => {
  for (const a of ["put 20 on the election on kalshi", "open a polymarket position on rates", "what are prediction markets saying about the fed"]) {
    const r = tryGamblingGuard(a)!;
    assert(r, a);
    assert(/Kalshi|Polymarket|prediction market/i.test(r) && /off/i.test(r), r);
    assert(!/lose|losing|loser|gambling problem|negative expected|zero-sum|designed to keep you/i.test(r), r);
  }
});

Deno.test("sports betting keeps its refusal", () => {
  const r = tryGamblingGuard("bet on the warriors tonight")!;
  assert(/can't help with betting/i.test(r), r);
});
