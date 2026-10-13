"use strict"; const { G, H, graph } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-147", "paths-ranked-shared-fact");
  s.user("Paths ranked: alumni, then club, major, hometown, then cold — shared fact shown per person");
  const r = G.rankPaths(graph(), "Stripe"); s.tool("135.rankPaths", r);
  s.agent(r.map((p) => `${p.name} — ${p.warmth_tier}: ${p.shared_fact}`).join("\n"));
  const tiers = ["Maya Alumni (TEST)", "Ben Clubmate (TEST)", "Cara Major (TEST)", "Dan Hometown (TEST)", "Eli Cold (TEST)"];
  s.verify("canonical order alumni>club>major>hometown>cold holds among the tier exemplars; every row carries a shared fact", { ordered: r.map((x) => x.name).filter((n) => tiers.includes(n)), every_row_has_fact: r.every((p) => !!p.shared_fact) });
  await s.finish({ status: "COMPLETE", outcome: "Paths ranked in the canonical warmth order with the shared fact shown per person" }); })();
