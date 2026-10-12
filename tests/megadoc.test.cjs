// The megadoc (corpus/upmore-scenario-megadoc.txt): parsed in full, every scenario labeled with a supported verdict, the
// report current, and PROVEN only with a provider-confirmed record (none today). The sim evidence itself is checked in
// tests/edge/megadoc-sim.test.ts.
const test = require("node:test"), assert = require("node:assert/strict"), { execFileSync } = require("node:child_process"), path = require("node:path");
const run = (...a) => execFileSync(process.execPath, a.map((x, i) => i === 0 ? path.join(__dirname, "..", x) : x), { encoding: "utf8" });
test("megadoc: 240 scenarios parsed, the JSON current", () => { assert.match(run("scripts/build-megadoc.cjs", "--check"), /megadoc verified: 240 scenarios/); });
test("megadoc: every scenario has a supported verdict and docs/scenarios/README.md is current", () => { assert.match(run("evals/scenarios/report.cjs", "--check"), /megadoc report verified/); });
test("megadoc: nothing is PROVEN without a provider record, and the report says so", () => {
  const V = require("../evals/scenarios/verdicts.cjs");
  assert.equal(Object.values(V).filter(v => v.state === "PROVEN").length, 0);
  assert.match(require("node:fs").readFileSync(path.join(__dirname, "../docs/scenarios/README.md"), "utf8"), /PROVEN today: 0 of 240/);
});
