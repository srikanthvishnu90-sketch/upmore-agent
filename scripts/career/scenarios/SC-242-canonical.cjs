"use strict";
// SC-242 canonical — "Will AI take my job?" — evidence and uncertainty, no fluff either direction.
// Grounded in packages/career-data/datasets/bls-labor-data.json (BLS EP 2024-34, free public).
const L = require("./_fin-c-lib.cjs");
(async () => {
  await L.runEvidenceScenario("SC-242", "will-ai-take-my-job",
    "Will AI take my job?",
    ["bls-labor-data.json"],
    (d) => L.CP.aiJobOutlookRead(d["bls-labor-data.json"], { now: L.NOW }),
    "Evidence-based answer served: BLS 2024-34 projections show the persona's fields (software developers +15%, financial analysts +6%, management analysts +9% vs +3% all occupations) growing, with the dataset's own limit stated in the reply — BLS publishes no AI-displacement probability, and anecdote is labeled and unused.");
})().catch((e) => { console.error(e); process.exit(1); });
