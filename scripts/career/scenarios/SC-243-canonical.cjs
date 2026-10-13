"use strict";
// SC-243 canonical — "Should I go to grad school?" — ROI framework for my field.
// Grounded in packages/career-data/datasets/bls-labor-data.json (BLS CPS Table 5.1, 2024 + OOH gates).
const L = require("./_fin-c-lib.cjs");
(async () => {
  await L.runEvidenceScenario("SC-243", "should-i-go-to-grad-school",
    "Should I go to grad school?",
    ["bls-labor-data.json"],
    (d) => L.CP.gradSchoolROIRead(d["bls-labor-data.json"], { now: L.NOW }),
    "ROI framework computed from BLS population data: CPS 2024 medians (bachelor's $1,543/wk vs master's $1,840/wk; annualized gap ~$15,444 labeled as computed association, not causal return), gate test from OOH typical-entry records (bachelor's is the entry gate in all three persona fields), and the program-specific cost terms named as the user's exact next input.");
})().catch((e) => { console.error(e); process.exit(1); });
