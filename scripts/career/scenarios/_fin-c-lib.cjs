"use strict";
// Finisher lane C shared lib (SC-242/243/244): loads the free public datasets built under
// packages/career-data/datasets/ and drives the REAL 134-career-paths evidence functions,
// gated by 125's verifyClaims + lintAdvice (same gates as _w13-lib company files).
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const CI = require(path.join(ROOT, "packages/domain/125-career-intel.js"));
const CP = require(path.join(ROOT, "packages/domain/134-career-paths.js"));
const H = require(path.join(__dirname, "..", "scenario-harness.cjs"));
const DS_DIR = path.join(ROOT, "packages/career-data/datasets");
const NOW = "2026-10-13";
const loadDataset = (name) => JSON.parse(fs.readFileSync(path.join(DS_DIR, name), "utf8"));

async function runEvidenceScenario(scId, slug, userText, datasetNames, buildAnswer, outcomeLine) {
  const s = H.session(scId, slug);
  s.user(userText);
  const datasets = {};
  for (const n of datasetNames) { datasets[n] = loadDataset(n); s.tool(`dataset loaded: packages/career-data/datasets/${n}`, { dataset_id: datasets[n].dataset_id, retrieved_at: datasets[n].retrieved_at, source: datasets[n].source || datasets[n].coverage || datasets[n].source_label }); }
  const ans = buildAnswer(datasets);
  s.tool("134 evidence function output", { claims: ans.claims.length, known_vs_anecdotal: ans.known_vs_anecdotal });
  s.agent(ans.text);
  const v = CI.verifyClaims(ans.text, ans.claims, { allowedNumbers: ans.allowed_numbers || [] });
  const lint = CI.lintAdvice(ans.text);
  s.tool("verifyClaims + lintAdvice", { verifyClaims: v, lintAdvice: lint });
  const pass = v.ok && lint.ok;
  s.verify(`Answer composed by the real 134 evidence function over the datasets recorded above; every number in the reply traces to a dataset record (verifyClaims ok=${v.ok}, errors=${JSON.stringify(v.errors)}); lintAdvice ok=${lint.ok}; known vs anecdotal/unknown separated in the reply text itself.`, { verify_ok: v.ok, lint_ok: lint.ok, claims: ans.claims.length });
  await s.finish(pass
    ? { status: "COMPLETE", outcome: outcomeLine }
    : { status: "LEARN", outcome: `${scId} evidence gates did not all pass.`, reason: `verifyClaims ok=${v.ok} (${JSON.stringify(v.errors).slice(0, 300)}), lint ok=${lint.ok}`, unblock: "Fix the failing gate in the dataset or composer, then rerun this scenario." });
  return { s, pass, v, lint, ans };
}
module.exports = { CI, CP, H, ROOT, DS_DIR, NOW, loadDataset, runEvidenceScenario };
