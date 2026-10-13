// Gauntlet U-lane index builder: rebuilds index.json from the per-config
// results files without re-running any journey (used after --only re-runs).
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = process.env.GAUNTLET_OUT_DIR || path.join(process.env.HOME, "workspace/your_files/upmore-career-gauntlet-u");
const CONFIGS = ["w320", "w390", "desktop-ts200"];
const index = { lane: "U", build_revision: process.env.GAUNTLET_BUILD || "b7d9f83", fixture_version: "gauntlet-v1", configs: CONFIGS, runs: [], generated_at: new Date().toISOString() };
for (const cfg of CONFIGS) {
  const p = path.join(ROOT, "results-" + cfg + ".json");
  if (fs.existsSync(p)) index.runs.push(...JSON.parse(fs.readFileSync(p, "utf8")));
}
index.runs.sort((a, b) => a.case_id.localeCompare(b.case_id) || CONFIGS.indexOf(a.config) - CONFIGS.indexOf(b.config));
const tallyOf = (k) => { const t = {}; for (const r of index.runs) t[r[k]] = (t[r[k]] || 0) + 1; return t; };
index.tally = tallyOf("combined_verdict");
index.journey_tally = tallyOf("verdict");
index.surface_tally = tallyOf("surface_verdict");
index.safety_tally = tallyOf("safety");
index.coverage_gaps = index.runs.reduce((n, r) => n + (r.coverage_gaps || []).length, 0);
fs.writeFileSync(path.join(ROOT, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log("U INDEX:", index.runs.length, "runs", JSON.stringify(index.tally), "journey", JSON.stringify(index.journey_tally), "surface", JSON.stringify(index.surface_tally), "safety", JSON.stringify(index.safety_tally), "gaps", index.coverage_gaps);
