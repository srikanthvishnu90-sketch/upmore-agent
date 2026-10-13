"use strict"; const { H, OS, NOW } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-190", "network-upkeep");
  s.user("who in my network is going cold?");
  // Injected relationship rows (the 126/OUTR seam): labeled TEST rows standing in for relationship memory.
  const store = OS.createStore({ relationships: [
    { name: "Priya Nair (TEST)", org: "Stripe", warmth: "warm", last_touch: "2026-05-20", channel: "email" },
    { name: "Marcus Lee (TEST)", org: "Datadog", warmth: "warm", last_touch: "2026-08-11", channel: "linkedin" },
    { name: "Elena Ruiz (TEST)", org: "Ramp", warmth: "warm", last_touch: "2026-10-02", channel: "email" } ] });
  const r = OS.networkUpkeep(store, { now: NOW }); s.tool("129.networkUpkeep", r);
  s.agent(`Going cold, ranked by last touch:\n${r.ranked.map((x) => `• ${x.name} (${x.org}) — ${x.days_since} days since last touch`).join("\n")}\n\nRestart draft for your coldest warm contact is on the card — nothing sends without your yes.`, { card: r.card });
  s.verify("ranking sorted by days_since desc from injected rows; coldest warm = Priya Nair (TEST) at 145 days", { ranked: r.ranked });
  await s.finish({ status: "COMPLETE", outcome: "Network ranked by last-touch from injected relationship rows; restart draft for the coldest warm contact card-gated" }); })();
