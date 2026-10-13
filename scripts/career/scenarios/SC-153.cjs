"use strict"; const { G, H, graphAll } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-153", "public-source-employee-lookup");
  s.user("Employee lookup from public sources only: GitHub, speakers, team pages");
  const r = G.publicSourceLookup(graphAll(), "Stripe"); s.tool("135.publicSourceLookup(Stripe)", r);
  s.agent(`Public sources only — no LinkedIn scraping: ${r.map((p) => `${p.name}, ${p.position} (${p.sources.join("+")})`).join("; ")}.`);
  s.verify("every returned person carries a public: source and a public link; no linkedin-export-only person is returned as 'public'", { count: r.length, all_public: r.every((p) => p.sources.some((x) => String(x).startsWith("public:"))) });
  await s.finish({ status: "COMPLETE", outcome: "Employee lookup answered from public-source records only (GitHub/speakers/team-page fixtures), with the no-scraping boundary stated" }); })();
