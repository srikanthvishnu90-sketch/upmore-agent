"use strict"; const { G, H, NOW, graph } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-160", "new-hire-radar");
  s.user("New-hire radar: someone from my school just joined a target — flagged as the warmest path");
  const g = graph(); const prev = { at: "2026-08-01", people: [{ name: "Nina Newhire (TEST)", company: "TEST Systems Inc" }, { name: "Maya Alumni (TEST)", company: "Stripe" }] };
  const r = G.newHireRadar(g, prev, { now: NOW, targetCompanies: ["Stripe", "Datadog", "Ramp"] });
  s.tool("135.newHireRadar(graph delta)", r);
  s.agent(`Flagged: ${r[0].name} joined ${r[0].company} on ${r[0].joined_at} (from ${r[0].prior_company}) — ${r[0].shared_fact}. ${r[0].flag}`);
  s.verify("flag derived from the snapshot delta + joinedCompanyAt inside 90 days, at a target company, with alumni warmth", { flagged: r.map((x) => x.name), tier: r[0] && r[0].warmth_tier });
  await s.finish({ status: "COMPLETE", outcome: "New-hire radar flagged Nina (TEST University → Stripe, joined 2026-09-15) as an alumni warm path from the graph delta" }); })();
