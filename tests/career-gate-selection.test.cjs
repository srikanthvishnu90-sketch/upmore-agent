"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
// Execute the real gate's selection and control flow in a synthetic tree.
// Runners only record argv: this suite never runs a model, browser or DB.
function selection(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-gate-selection-"));
  try {
    for (const dir of ["scripts", "bin"]) fs.mkdirSync(path.join(root, dir));
    fs.copyFileSync(path.join(__dirname, "../scripts/gate.sh"), path.join(root, "scripts/gate.sh"));
    for (const file of files) { const p = path.join(root, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, "// synthetic inventory fixture\n"); }
    for (const tool of ["node", "deno", "python3"]) fs.writeFileSync(path.join(root, "bin", tool), '#!/bin/bash\nprintf "%s\\n" "$@" >> "$GATE_ARGV/' + tool + '"\n', { mode: 0o755 });
    execFileSync("bash", ["scripts/gate.sh"], { cwd: root, env: { ...process.env, GATE_ARGV: root, PATH: path.join(root, "bin") + path.delimiter + process.env.PATH }, stdio: "pipe", timeout: 10000 });
    return Object.fromEntries(["node", "deno", "python3"].map(t => [t, fs.readFileSync(path.join(root, t), "utf8").split("\n")]));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const fixes = [
  "tests/career-roles-and-links.test.cjs", // F-001
  "tests/career-batch-status-route.test.cjs", // F-002
  "tests/career-f004-mock-goal-handoff.test.cjs",
  "tests/career-f005-targeted-executor-read.test.cjs",
  "tests/career-shelf-targeted.test.cjs",
  "tests/career-f006-seniority-morphology.test.cjs",
  "tests/career-band-matrix.test.cjs",
  "tests/career-f024-lever-disability-decline.test.cjs",
  "tests/career-fill-refusal.test.cjs", // F-023
];
test("gate selects all published Node fix guards automatically", () => {
  const got = selection(fixes); for (const f of fixes) assert.ok(got.node.includes(f), f);
});
test("gate retains the architect directory covering Option A and networking #20", () => {
  const got = selection(["tests/architect/chat-approval-card-binding.test.ts", "tests/architect/text-yes-never-sends.test.ts", "tests/architect/networking-real-people.test.ts"]);
  assert.ok(got.deno.includes("tests/architect/"));
  assert.ok(got.deno.includes("--ignore=tests/architect/pending"));
});
for (const file of ["tests/career-f004-live-mock-handoff.test.ts", "tests/career-f013-compiled-ingest.test.ts", "tests/career-new-regression.test.ts"]) test(`gate selects root TypeScript regression ${file}`, () => {
  const got = selection([file]); assert.ok(got.deno.includes(file), file);
  assert.ok(!got.node.includes(file), "TypeScript uses the Deno test step");
});
test("gate keeps unscoped finance tests and archived evidence out of career execution", () => {
  const a = "tests/career-gauntlet-r2.test.cjs", b = "tests/finance-new.test.ts";
  const got = selection([a, b]); assert.ok(!got.node.includes(a)); assert.ok(!got.deno.includes(b));
});
test("gate with no root TypeScript fixtures does not pass a literal unmatched glob to Deno", () => {
  const got = selection([]); assert.ok(!got.deno.includes("tests/career-*.test.ts"));
});
