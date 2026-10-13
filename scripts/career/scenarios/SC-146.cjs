"use strict"; const { G, H, graph } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-146", "who-do-i-know-at-stripe");
  s.user('"Who do I know at Stripe?" — warm paths from my LinkedIn export');
  const g = graph(); const paths = G.rankPaths(g, "Stripe");
  s.tool("135.rankPaths(Stripe, from LinkedIn-export fixture)", paths);
  s.agent(`From your LinkedIn export, ${paths.length} people at Stripe. Warmest: ${paths.slice(0, 3).map((p) => `${p.name} (${p.warmth_tier} — ${p.shared_fact})`).join("; ")}.`, { card: { title: "Warm paths at Stripe (TEST export)", count: paths.length, paths } });
  s.verify("all results come from the labeled TEST LinkedIn-export fixture in the graph; count matches graph rows at Stripe", { graph_people_at_stripe: G.atCompany(g, "Stripe").length, returned: paths.length });
  await s.finish({ status: "COMPLETE", outcome: `${paths.length} warm paths at Stripe answered from the user's LinkedIn export, warmest first` }); })();
