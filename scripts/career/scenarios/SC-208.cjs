"use strict"; const { H, N, cir, fixture, NOW, F10 } = require("./w11-lib.cjs");
(async () => { const s = H.session("SC-208", "counter-scripts");
  s.user("Counter scripts: word-for-word email and call versions; nothing sends without my yes");
  const o = N.parseOffer(fixture("test-offer-a.txt"), { now: NOW });
  const cs = N.counterStrategy(o, N.benchmark(cir("airbnb")));
  s.tool("128.counterStrategy", cs);
  s.agent(`Counter strategy for ${o.company} (base $${o.base_salary.toLocaleString()}):\n${cs.asks.map((a) => `• ${a.lever}: ${a.ask}`).join("\n")}\n\nEMAIL (word-for-word, on the card below — not sent):\n${cs.scripts.email}\n\nCALL SCRIPT (word-for-word):\n${cs.scripts.call}`, { card: cs.card });
  s.verify("card requires_approval=true and sent=false; email cites the sourced $142,000 top-of-range with its source URL", { card: cs.card, email_cites_figure: /\$142,000/.test(cs.scripts.email) });
  await s.finish({ status: "COMPLETE", outcome: "Word-for-word counter email + call scripts produced from the sourced benchmark, both behind an approval card (sent:false). Prior sibling evidence under old numbering SC-183 — see " + F10 }); })();
