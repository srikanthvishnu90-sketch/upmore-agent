// Gauntlet EXPANSION LANE U (stage 5) — evidence integrity test (grader code,
// not product code). Validates the U01-U12 x 3-config records produced by
// scripts/career/gauntlet/run-u-journeys.cjs: pinned to b7d9f83, 36 runs,
// computed grading on BOTH axes (journey + surface), combined-verdict rule,
// explicit coverage gaps on every run, and consistency with index.json.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(require("../scripts/career/critical-repairs/archive-gate.cjs").archiveRoot(), "upmore-career-gauntlet-u");
const CASES = ["U01", "U02", "U03", "U04", "U05", "U06", "U07", "U08", "U09", "U10", "U11", "U12"];
const CONFIGS = ["w320", "w390", "desktop-ts200"];
const VERDICTS = new Set(["PASS", "FAIL", "BLOCKED", "NOT IMPLEMENTED", "INCONCLUSIVE"]);
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

test("U-lane evidence: 36 records pinned to b7d9f83 with two-axis computed grading", () => {
  const index = read(path.join(ROOT, "index.json"));
  assert.equal(index.runs.length, 36, "index carries 36 runs");
  assert.equal(index.build_revision, "b7d9f83");
  for (const c of CASES) for (const cfg of CONFIGS) {
    const dir = path.join(ROOT, c, cfg);
    const rec = read(path.join(dir, "record.json"));
    assert.equal(rec.case_id, c, c + "/" + cfg);
    assert.equal(rec.build_revision, "b7d9f83", c + "/" + cfg + " build pin");
    assert.equal(rec.config, cfg, c + "/" + cfg + " config stamp");
    assert.ok(VERDICTS.has(rec.journey_verdict) && VERDICTS.has(rec.combined_verdict), c + "/" + cfg + " verdict vocab");
    assert.ok(["PASS", "FAIL"].includes(rec.surface_verdict), c + "/" + cfg + " surface verdict");
    for (const a of [...rec.assertions, ...rec.surface_assertions]) {
      assert.ok("expected" in a && "observed" in a && typeof a.pass === "boolean", c + "/" + cfg + " assertion shape " + a.id);
    }
    const failed = rec.assertions.filter((a) => !a.pass).map((a) => a.id);
    assert.deepEqual(rec.verdict_derivation.failed_assertions, failed, c + "/" + cfg + " derivation matches");
    // combined rule: PASS journey + FAIL surface -> FAIL; otherwise combined = journey
    const expectCombined = rec.journey_verdict === "PASS" && rec.surface_verdict !== "PASS" ? "FAIL" : rec.journey_verdict;
    assert.equal(rec.combined_verdict, expectCombined, c + "/" + cfg + " combined rule");
    // coverage gaps are explicit on every run, never silently passed
    assert.ok(Array.isArray(rec.coverage_gaps) && rec.coverage_gaps.some((g) => g.id === "GAP-U-COMPOSER"), c + "/" + cfg + " composer gap recorded");
    assert.equal(rec.contrast_measured, false, c + "/" + cfg + " contrast honestly not measured");
    assert.ok(fs.existsSync(path.join(dir, "screen.png")), c + "/" + cfg + " config screenshot");
    assert.ok(fs.existsSync(path.join(dir, "surface-checks.json")), c + "/" + cfg + " surface measurements");
    const fromIndex = index.runs.find((r) => r.case_id === c && r.config === cfg);
    assert.ok(fromIndex, c + "/" + cfg + " in index");
    assert.equal(fromIndex.combined_verdict, rec.combined_verdict, c + "/" + cfg + " index matches record");
  }
});

test("U-lane evidence: journey replies are config-invariant (deterministic path)", () => {
  for (const c of CASES) {
    const sets = CONFIGS.map((cfg) => JSON.stringify(read(path.join(ROOT, c, cfg, "record.json")).delivered_messages));
    assert.equal(new Set(sets).size, 1, c + " delivered bubbles identical across configs");
  }
});
