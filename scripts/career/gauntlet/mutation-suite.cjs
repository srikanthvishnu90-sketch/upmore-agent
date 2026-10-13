// mutation-suite.cjs — 04 Part 3 grader self-test runner for grader-v2.
// Feeds the 15 mutants (known-bad reply+state fixtures for real scenarios)
// and the 15 known-good replies (run-1 "Before" outputs) through the full
// pipeline with a perfect-score judge injected — so a deterministic PASS
// path is exercised end to end, and any mutant that still passes proves
// the PIPELINE is wrong (fix the pipeline, never the expectation).
"use strict";
const fs = require("fs");
const path = require("path");
// Lazy-required inside runMutationSuite: grader-v2.cjs requires this file
// for its `mutations` subcommand, so a top-level require here would be
// circular when grader-v2 is the entry point.
const grade = (...a) => require("./grader-v2.cjs").grade(...a);

function perfectJudge(input) {
  const quote = input.reply.slice(0, 60);
  const dims = {};
  for (const d of ["D1", "D2", "D3", "D4", "D5", "D6", "D7"]) dims[d] = { score: 3, quote, reason: "fixture judge (test-only): perfect scores so deterministic results decide" };
  return { scores: dims, attempts: 1, model: "fixture" };
}

async function runMutationSuite() {
  const dir = path.join(__dirname, "fixtures");
  const mutants = JSON.parse(fs.readFileSync(path.join(dir, "mutants.json"), "utf8"));
  const knownGood = JSON.parse(fs.readFileSync(path.join(dir, "known-good.json"), "utf8"));
  const mutantResults = [];
  for (const m of mutants) {
    const r = await grade(m.record, { judgeFn: perfectJudge });
    const tripped = r.failures.map((f) => f.check);
    const hit = m.mustTrip.filter((c) => tripped.some((t) => t === c || t.startsWith(c)));
    mutantResults.push({ id: m.id, name: m.name, verdict: r.verdict, mustTrip: m.mustTrip, tripped, namedHit: hit.length === m.mustTrip.length || hit.length > 0, allNamedHit: hit.length === m.mustTrip.length, ok: r.verdict === "FAIL" && hit.length > 0, failures: r.failures });
  }
  const goodResults = [];
  for (const g of knownGood) {
    const r = await grade(g, { judgeFn: perfectJudge });
    goodResults.push({ id: g.scenario_id, verdict: r.verdict, ok: r.verdict === "PASS", failures: r.failures, severityCounts: r.severityCounts });
  }
  const summary = {
    mutants: { pass: mutantResults.filter((r) => r.ok).length, total: mutantResults.length, allNamedChecksHit: mutantResults.every((r) => r.allNamedHit) },
    knownGood: { pass: goodResults.filter((r) => r.ok).length, total: goodResults.length },
  };
  summary.allOk = summary.mutants.pass === summary.mutants.total && summary.knownGood.pass === summary.knownGood.total;
  return { summary, mutantResults, goodResults };
}

if (require.main === module) runMutationSuite().then((r) => {
  console.log(JSON.stringify(r.summary, null, 2));
  for (const m of r.mutantResults) console.log(`${m.id} ${m.name}: verdict=${m.verdict} tripped=[${m.tripped.join(", ")}] mustTrip=[${m.mustTrip.join(", ")}] ok=${m.ok}`);
  for (const g of r.goodResults) console.log(`KG ${g.id}: verdict=${g.verdict} ok=${g.ok} failures=${JSON.stringify(g.failures)}`);
  if (!r.summary.allOk) process.exitCode = 1;
}).catch((e) => { console.error(e); process.exit(1); });

module.exports = { runMutationSuite, perfectJudge };
