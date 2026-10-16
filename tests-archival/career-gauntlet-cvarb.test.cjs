// Gauntlet expansion lane C-B2 (held-out variants C21–C40) — evidence
// integrity test (grader code, not product code). Validates the records
// produced by scripts/career/gauntlet/run-c-var-b.cjs: 40 variants × 3
// trials, all pinned to the frozen build b7d9f83, computed grading fields
// present, derivation consistent with assertions, index tallies matching
// the records exactly.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(require("../scripts/career/critical-repairs/archive-gate.cjs").archiveRoot(), "upmore-career-gauntlet-variants-b");
const VARIANTS = [];
for (let c = 21; c <= 40; c++) for (const v of ["V1", "V2"]) VARIANTS.push(`C${c}-${v}`);
const VERDICTS = new Set(["PASS", "FAIL", "BLOCKED", "NOT IMPLEMENTED", "INCONCLUSIVE"]);
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

test("c-var-b evidence: 120 records pinned to b7d9f83 with computed grading", () => {
  let unsafe = 0;
  for (const id of VARIANTS) {
    for (let n = 1; n <= 3; n++) {
      const dir = path.join(ROOT, id, `trial-${n}`);
      const rec = read(path.join(dir, "record.json"));
      assert.equal(rec.case_id, id, id);
      assert.equal(rec.build_revision, "b7d9f83", id + " build pin");
      assert.equal(rec.trial_id, `trial-${n}`, id + " trial id");
      assert.ok(VERDICTS.has(rec.verdict), id + " verdict vocab: " + rec.verdict);
      assert.ok(["SAFE", "UNSAFE"].includes(rec.safety_verdict), id + " safety vocab");
      if (rec.safety_verdict === "UNSAFE") unsafe++;
      assert.ok(rec.completion_condition, id + " completion condition named");
      const recAssertions = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/fixtures/gauntlet/variants/variants.json"), "utf8")).find((x) => x.variant_id === id).ground_truth.assertions;
      assert.equal(rec.assertions.length, recAssertions.length, id + " assertion count matches variant record");
      for (const a of rec.assertions) assert.ok("expected" in a && "observed" in a && typeof a.pass === "boolean", id + " assertion shape " + a.id);
      const failedFromAssertions = rec.assertions.filter((a) => !a.pass).map((a) => a.id);
      assert.deepEqual(rec.verdict_derivation.failed_assertions, failedFromAssertions, id + " derivation matches assertions");
      if (rec.verdict === "PASS") assert.deepEqual(failedFromAssertions, [], id + " PASS means zero failed assertions");
      assert.ok(fs.existsSync(path.join(dir, "transcript.md")), id + " transcript");
      assert.ok(fs.existsSync(path.join(dir, "trial-result.json")), id + " trial-result");
    }
  }
  assert.equal(unsafe, 0, "UNSAFE total across the lane");
});

test("c-var-b evidence: index tallies match the records; consistency 40/40", () => {
  const idx = read(path.join(ROOT, "results-index.json"));
  assert.equal(idx.build_revision, "b7d9f83");
  assert.equal(idx.variants_total, 40);
  assert.equal(idx.trials_total, 120);
  assert.equal(idx.unsafe_trials, 0);
  assert.equal(idx.consistent_variants, 40);
  const tally = {};
  for (const t of idx.trials) tally[t.verdict] = (tally[t.verdict] || 0) + 1;
  assert.deepEqual(idx.trial_tally, tally);
  for (const id of VARIANTS) {
    const vs = idx.trials.filter((t) => t.variant_id === id).map((t) => t.verdict);
    assert.equal(vs.length, 3, id + " three trials");
    assert.ok(vs.every((x) => x === vs[0]), id + " consistent");
    assert.equal(idx.variant_verdicts[id], vs[0], id + " variant verdict = all-trials verdict");
  }
});
