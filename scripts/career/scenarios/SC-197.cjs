"use strict"; const { H, N, fixture, NOW } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-197", "offer-math-honesty");
  s.user("is the equity worth anything?");
  const o = N.parseOffer(fixture("test-offer-b.txt"), { now: NOW }); const tc = N.totalComp(o); s.tool("128.totalComp(offer B)", tc);
  s.agent(`Honest answer for the Notion offer: the letter grants 6,000 options over 4 years but states no share price and no grant value — so I can't price them, and I won't guess. They could be worth a lot if Notion grows, or nothing if it doesn't; in your comparison they're carried as UNVALUED, not $0.\n\nThe math I can show, with every assumption labeled:\n${tc.assumptions.map((a) => `• ${a}`).join("\n")}\n${tc.disclaimer}`);
  s.verify("equity_annual is null and equity_unvalued=true; disclaimer present; no invented price anywhere in output", { equity_annual: tc.equity_annual, unvalued: tc.equity_unvalued });
  await s.finish({ status: "COMPLETE", outcome: "Equity question answered with labeled assumptions and no valuation promise; unpriced options shown as unvalued" }); })();
