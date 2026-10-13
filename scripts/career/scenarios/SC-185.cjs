"use strict"; const { H, N, fixture, NOW } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-185", "multi-offer-comparison");
  s.user("compare my two offers");
  const store = N.createStore(); const a = N.storeOffer(store, N.parseOffer(fixture("test-offer-a.txt"), { now: NOW })); const b = N.storeOffer(store, N.parseOffer(fixture("test-offer-b.txt"), { now: NOW }));
  const cmp = N.compareOffers(a, b); s.tool("128.compareOffers", cmp);
  s.agent(`Side-by-side (year 1 / annualized):\n${cmp.rows.map((r) => `• ${r.field}: Airbnb ${r.a == null ? "unvalued" : "$" + r.a.toLocaleString()} vs Notion ${r.b == null ? "unvalued" : "$" + r.b.toLocaleString()}${r.delta_b_minus_a == null ? " (no delta — unvalued side)" : ` (Δ ${r.delta_b_minus_a >= 0 ? "+" : ""}$${r.delta_b_minus_a.toLocaleString()})`}`).join("\n")}\nNotion's 6,000 options carry no stated price, so they're shown unvalued — the cash math favors Airbnb year 1 ($180,200 vs $160,000) before any equity value at Notion.`);
  s.verify("comparison built from the two stored parsed offers; equity delta is null (unvalued), not zero", { rows: cmp.rows, stored: store.offers.length });
  await s.finish({ status: "COMPLETE", outcome: "Two parsed offers compared side-by-side with full total-comp math from stored values" }); })();
