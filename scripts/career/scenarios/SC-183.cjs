"use strict"; const { H, N, cir, fixture, NOW } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-183", "counter-script");
  s.user("write my counter");
  const store = N.createStore(); const o = N.storeOffer(store, N.parseOffer(fixture("test-offer-a.txt"), { now: NOW }));
  const cs = N.counterStrategy(o, N.benchmark(cir("airbnb"))); s.tool("128.counterStrategy", cs);
  s.agent(`Strategy: ${cs.asks.map((a) => a.ask).join(" | ")}\n\nWord-for-word email and call scripts are on the card — nothing sends without your yes.`, { card: cs.card });
  s.agent(`Call script:\n${cs.scripts.call}\n\n${cs.disclaimer}`);
  s.verify("card requires approval and sent=false; email cites the sourced $142,000 top-of-range with its source URL", { card: cs.card, email_has_source: /careers\.airbnb\.com/.test(cs.scripts.email) });
  await s.finish({ status: "COMPLETE", outcome: "Counter strategy + word-for-word email/call scripts delivered on an approval card; nothing sent" }); })();
