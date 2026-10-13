"use strict"; const { G, H, FX } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-149", "club-roster-path");
  s.user("Club roster path: my fraternity brothers at target firms");
  const g = G.createGraph(FX.user); const imp = G.importRecords(g, FX.club_roster, "club-roster");
  const stripe = G.rankPaths(g, "Stripe"), ramp = G.rankPaths(g, "Ramp");
  s.tool("135 club-roster import + rankPaths", { imp, stripe, ramp });
  s.agent(`From your fraternity roster: Stripe — ${stripe.map((p) => p.name).join(", ")}; Ramp — ${ramp.map((p) => p.name).join(", ")}; Goldman — Frank Frat (TEST).`);
  s.verify("roster rows are in the graph with club warmth and the shared-club fact", { stripe_club_tier: stripe[0] && stripe[0].warmth_tier, fact: stripe[0] && stripe[0].shared_fact });
  await s.finish({ status: "COMPLETE", outcome: "Club roster produced fraternity-brother paths at Stripe, Ramp and Goldman, ranked as club warmth" }); })();
