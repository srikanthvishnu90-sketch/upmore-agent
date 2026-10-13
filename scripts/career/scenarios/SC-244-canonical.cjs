"use strict";
// SC-244 canonical — "Which major should I pick?" — answered from population data at my target companies.
// Grounded in packages/career-data/datasets/posting-degree-signals.json (population of 3,108 live
// postings at 10 target companies) + dol-lca-fy2025q4-cir-companies.json (DOL filing population).
// The hire-major population does not exist in any free source and is named in the reply as the
// exact remaining licensed input — it is not estimated.
const L = require("./_fin-c-lib.cjs");
(async () => {
  await L.runEvidenceScenario("SC-244", "which-major-from-population-data",
    "Which major should I pick?",
    ["posting-degree-signals.json", "dol-lca-fy2025q4-cir-companies.json"],
    (d) => L.CP.majorPopulationRead(d["posting-degree-signals.json"], d["dol-lca-fy2025q4-cir-companies.json"], { now: L.NOW }),
    "Answered from two counted populations at the target companies: all 3,108 live postings (degree/major requirement signals extracted from real posting text) and the DOL LCA filing population for FY2025 Q4 — with the one population no free source holds (majors of actual hires) named in the reply as the licensed input, never estimated.");
})().catch((e) => { console.error(e); process.exit(1); });
