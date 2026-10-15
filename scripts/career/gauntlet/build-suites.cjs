// A-02 suite split (Crew A, 2026-10-15): generates suites.json from the
// assembled gauntlet records. REGRESSION = scenarios that passed in the
// source full run (bar ~100%; any dip = stop). CAPABILITY = scenarios that
// failed or were not implemented (defect rows, novel conversations,
// absent-adjacents; a low rate is reported without shame).
// GRADUATION: a capability scenario moves to regression only after passing
// in TWO consecutive full runs — this generator records the source run so
// the next run can apply the rule; it never graduates on a single pass.
// Usage: node build-suites.cjs [recordsDir] [outFile]
"use strict";
const fs = require("fs");
const path = require("path");

const recordsDir = process.argv[2] || path.join(process.env.HOME, "workspace/your_files/upmore-career-gauntlet-assembled-300");
const outFile = process.argv[3] || path.join(__dirname, "suites.json");

const idx = JSON.parse(fs.readFileSync(path.join(recordsDir, "index.json"), "utf8"));
const results = idx.results || [];
const regression = [];
const capability = [];
for (const r of results) {
  const entry = { scenario_id: r.scenario_id, family: r.family || null, verdict_in_source_run: r.verdict };
  if (r.verdict === "PASS") regression.push(entry);
  else capability.push(entry);
}
const out = {
  generated: new Date().toISOString(),
  source: { recordsDir, grader: idx.grader || null, mode: idx.mode || null, counts: idx.counts || null },
  warning: "Classification inherits the source run's build (A-08): re-generate after every full run; a carried PASS is labeled with the build it belongs to, never silently inherited.",
  graduation_rule: "A capability scenario graduates to regression only after passing in two consecutive full runs. This file records one source run; graduation is evaluated when the next full run is generated.",
  bars: { regression: "approx 100% — any dip is a stop", capability: "no bar — the rate is reported, per class, without shame" },
  regression_count: regression.length,
  capability_count: capability.length,
  regression,
  capability,
};
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
console.log(`suites.json: regression=${regression.length} capability=${capability.length} (source counts: ${JSON.stringify(idx.counts)})`);
