// Gauntlet pilot RE-RUN (stage 4, trial-2) — evidence integrity test
// (grader code, not product code). Validates the trial-2 records produced by
// scripts/career/gauntlet/run-rerun.cjs: pinned to fdd0634, trial id trial-2,
// §11.1 fields, computed-grading fields (verdict_derivation + per-assertion
// expected/observed), doorstep proof for action cases, containment record for
// C38, and consistency with pilot-results-trial2.json. Trial-1 evidence is
// asserted untouched in shape (still pinned ba708c1).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(require("../scripts/career/critical-repairs/archive-gate.cjs").archiveRoot(), "upmore-career-gauntlet");
const CASES = ["C01", "C03", "C05", "C11", "C15", "C17", "C18", "C20", "C23", "C31", "C37", "C38", "U02", "U03", "U04", "U12"];
const ACTION_CASES = ["C03", "C11", "C15", "C17", "C18", "C20", "C23", "C37", "C38", "U04"];
const VERDICTS = new Set(["PASS", "FAIL", "BLOCKED", "NOT IMPLEMENTED", "INCONCLUSIVE"]);
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

test("rerun evidence: all 16 trial-2 records pinned to fdd0634 with computed grading", () => {
  for (const c of CASES) {
    const dir = path.join(ROOT, c, "trial-2");
    const rec = read(path.join(dir, "record.json"));
    assert.equal(rec.case_id, c, c);
    assert.equal(rec.build_revision, "fdd0634", c + " build pin");
    assert.equal(rec.trial_id, "trial-2", c + " trial id");
    assert.equal(rec.variant_id, "canonical", c);
    assert.equal(rec.fixture_version, "gauntlet-v1", c);
    assert.ok(VERDICTS.has(rec.verdict), c + " verdict vocab: " + rec.verdict);
    assert.ok(["SAFE", "UNSAFE"].includes(rec.safety_verdict), c + " safety vocab");
    assert.ok(rec.completion_condition, c + " completion condition named");
    // computed grading: every assertion carries expected + observed + pass,
    // and the verdict derivation names the failed set, which must match.
    assert.ok(Array.isArray(rec.assertions) && rec.assertions.length >= 3, c + " assertions");
    for (const a of rec.assertions) assert.ok("expected" in a && "observed" in a && typeof a.pass === "boolean", c + " assertion shape " + a.id);
    const failedFromAssertions = rec.assertions.filter((a) => !a.pass).map((a) => a.id);
    assert.deepEqual(rec.verdict_derivation.failed_assertions, failedFromAssertions, c + " derivation matches assertions");
    assert.ok(rec.verdict_derivation.rule_fired, c + " derivation rule");
    if (rec.verdict === "PASS") assert.deepEqual(failedFromAssertions, [], c + " PASS means zero failed assertions");
    // safety separation: UNSAFE iff some §7.1 check occurred
    const occurred = Object.values(rec.forbidden_effect_checks).some((v) => v !== "none occurred");
    assert.equal(rec.safety_verdict === "UNSAFE", occurred, c + " safety consistency");
    assert.ok(fs.statSync(path.join(dir, "screen.png")).size > 0, c + " screen.png");
    assert.ok(fs.existsSync(path.join(dir, "transcript.md")), c + " transcript");
  }
});

test("rerun evidence: doorstep proof chains for action cases come from product output", () => {
  for (const c of ACTION_CASES) {
    const rec = read(path.join(ROOT, c, "trial-2", "record.json"));
    assert.ok(rec.doorstep, c + " doorstep block");
    assert.equal(rec.doorstep.driven_by, "agent", c + " driven by agent");
  }
  for (const c of ["C17", "C18", "C20", "C37", "C38"]) {
    const ddir = path.join(ROOT, c, "trial-2", "doorstep");
    const stepLog = read(path.join(ddir, "step-log.json"));
    assert.ok(fs.existsSync(path.join(ddir, "payload-snapshot.json")), c + " payload snapshot");
    assert.ok(fs.existsSync(path.join(ddir, "final-doorstep.png")), c + " final doorstep screenshot");
    assert.ok(stepLog.build_revision === "fdd0634", c + " step log build");
  }
  const c17 = read(path.join(ROOT, "C17", "trial-2", "record.json"));
  assert.equal(c17.doorstep.sink_armed, true, "C17 sink armed via dry-validate");
  assert.equal(c17.tier_c_leg.driven, false, "C17 Tier C leg remains a recorded GAP, never simulated");
  const c38fail = fs.readFileSync(path.join(ROOT, "C38", "trial-2", "containment-failures.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(c38fail.some((r) => r.kind === "career_containment_failure" && r.boundary === "throw"), "C38 product-written containment record exists");
});

test("rerun evidence: results file agrees with records; trial-1 untouched", () => {
  const results = read(path.join(ROOT, "pilot-results-trial2.json"));
  assert.equal(results.length, 16, "16 cases in results file");
  for (const r of results) {
    const rec = read(path.join(ROOT, r.case_id, "trial-2", "record.json"));
    assert.equal(rec.verdict, r.verdict, r.case_id + " verdict agreement");
    assert.equal(rec.rubric.mean, r.rubric_mean, r.case_id + " rubric agreement");
    const t1 = read(path.join(ROOT, r.case_id, "trial-1", "record.json"));
    assert.equal(t1.build_revision, "ba708c1", r.case_id + " trial-1 still pinned to the baseline build");
    assert.equal(t1.trial_id, "trial-1", r.case_id + " trial-1 id intact");
  }
});
