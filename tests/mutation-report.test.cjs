// Mutation coverage report (scripts/build-mutation-report.cjs, overnight G4): current, every domain module listed once
// (covered or a gap), and every recorded depth defect proven.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");

test("the report is current and every recorded planted defect bit", () => {
  const r = spawnSync(process.execPath, ["scripts/build-mutation-report.cjs", "--check"], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("every domain module appears, as covered or as a gap, and no module is in both", () => {
  const doc = fs.readFileSync(path.join(root, "docs/depth/MUTATION-COVERAGE.md"), "utf8");
  const gaps = new Set([...doc.split("## Gaps")[1].matchAll(/^- (\S+\.js)$/gm)].map(m => m[1]));
  const covered = new Set([...doc.split("## Gaps")[0].matchAll(/^\| (\d\d-\S+\.js) \|/gm)].map(m => m[1]));
  for (const f of fs.readdirSync(path.join(root, "packages/domain")).filter(f => /^\d\d-.*\.js$/.test(f))) {
    assert.ok(gaps.has(f) !== covered.has(f), `${f} must be exactly one of covered or gap`);
  }
});
