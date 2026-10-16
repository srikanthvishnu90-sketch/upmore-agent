// Portable contract checks. Original historical validations remain required in tests-archival/.
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

const ROOT = path.join(process.env.HOME, "workspace/your_files/upmore-career-gauntlet-variants-a");
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
