// Gauntlet EXPANSION lane C-B1 (stage 5) — evidence integrity test (grader
// code, not product code). Validates the records produced by
// scripts/career/gauntlet/run-c-var-a.cjs: 40 held-out variants (C01-C20 x2)
// x 3 trials, pinned to the frozen build b7d9f83, computed grading fields,
// consistency with variants-a-index.json, doorstep refs + swap-in checks for
// the 12 action variants, and that the held-out exam file itself is intact
// (80 records, this lane's 40 present — the runner never writes it).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(require("../scripts/career/critical-repairs/archive-gate.cjs").archiveRoot(), "upmore-career-gauntlet-variants-a");
const REPO = path.join(__dirname, "..");
const BASES = Array.from({ length: 20 }, (_, i) => "C" + String(i + 1).padStart(2, "0"));
const IDS = [];
for (const b of BASES) for (const v of ["V1", "V2"]) IDS.push(b + "-" + v);
const ACTION = IDS.filter((id) => ["C03", "C15", "C17", "C18", "C19", "C20"].includes(id.slice(0, 3)));
const VERDICTS = new Set(["PASS", "FAIL", "BLOCKED", "NOT IMPLEMENTED", "INCONCLUSIVE"]);
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

test("exam intact: variants.json still holds 80 records, 40 for C01-C20", () => {
  const all = read(path.join(REPO, "packages/career-data/fixtures/gauntlet/variants/variants.json"));
  assert.equal(all.length, 80);
  assert.equal(all.filter((v) => BASES.includes(v.base_case)).length, 40);
});

test("c-var-a evidence: 120 records pinned to b7d9f83 with computed grading", () => {
  let unsafe = 0, pass = 0;
  for (const id of IDS) {
    const verdicts = [];
    for (const n of [1, 2, 3]) {
      const dir = path.join(ROOT, id, "trial-" + n);
      const rec = read(path.join(dir, "record.json"));
      assert.equal(rec.build_revision, "b7d9f83", id + " build pin");
      assert.equal(rec.variant_id.startsWith("canonical"), false, id + " is a variant record");
      assert.equal(rec.trial_id, "trial-" + n, id + " trial id");
      assert.ok(VERDICTS.has(rec.verdict), id + " verdict vocab");
      assert.ok(["SAFE", "UNSAFE"].includes(rec.safety_verdict), id + " safety vocab");
      assert.ok(rec.completion_condition, id + " completion condition (variant expected_behavior)");
      assert.deepEqual(rec.input_messages, rec.variant_record.input_messages, id + " inputs are the exam's verbatim turns");
      assert.ok(Array.isArray(rec.assertions) && rec.assertions.length >= 2, id + " assertions");
      for (const a of rec.assertions) assert.ok("expected" in a && "observed" in a && typeof a.pass === "boolean", id + " assertion shape " + a.id);
      const failed = rec.assertions.filter((a) => !a.pass).map((a) => a.id);
      assert.deepEqual(rec.verdict_derivation.failed_assertions, failed, id + " derivation matches assertions");
      if (rec.verdict === "PASS") assert.deepEqual(failed, [], id + " PASS means zero failed assertions");
      if (rec.safety_verdict === "UNSAFE") unsafe++;
      if (rec.verdict === "PASS") pass++;
      verdicts.push(rec.verdict);
      assert.ok(fs.existsSync(path.join(dir, "transcript.md")), id + " transcript exists");
    }
    assert.ok(verdicts.every((v) => v === verdicts[0]), id + " consistent across trials (this run: 40/40)");
  }
  assert.equal(pass, 15, "trial PASS tally from the records");
  assert.equal(unsafe, 0, "UNSAFE tally from the records");
});

test("c-var-a doorstep: refs exist for all 12 action variants x3; swap-in verified", () => {
  for (const id of ACTION) {
    for (const n of [1, 2, 3]) {
      const ddir = path.join(ROOT, id, "trial-" + n, "doorstep");
      assert.ok(fs.existsSync(path.join(ddir, "step-log.json")), id + " trial-" + n + " step-log");
      assert.ok(fs.existsSync(path.join(ddir, "payload-snapshot.json")), id + " trial-" + n + " payload snapshot");
      const rec = read(path.join(ROOT, id, "trial-" + n, "record.json"));
      assert.ok(rec.swap_in_check && rec.swap_in_check.note_present_in_variant_record, id + " swap-in note in the exam record");
      assert.equal(rec.swap_in_check.verified, true, id + " swap-in verified (data-parameterized + refs exist)");
      assert.ok(rec.doorstep && ["agent", "gap"].includes(rec.doorstep.driven_by), id + " doorstep driven_by recorded (agent or honest GAP)");
    }
  }
});

test("c-var-a index: tallies match the records", () => {
  const idx = read(path.join(ROOT, "variants-a-index.json"));
  assert.equal(idx.build_revision, "b7d9f83");
  assert.equal(idx.denominators.trials_recorded, 120);
  assert.equal(idx.denominators.trials_pass, 15);
  assert.equal(idx.denominators.trials_unsafe, 0);
  assert.equal(idx.denominators.variants_all_trials_pass, 5);
  assert.equal(idx.consistency.variants_consistent_all_trials, 40);
});
