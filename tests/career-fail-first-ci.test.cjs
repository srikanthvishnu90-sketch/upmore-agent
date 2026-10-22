"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const checker = path.resolve(__dirname, "../scripts/check-fail-first.py");
const TEST = "tests/career-fixture.test.cjs";
const testBody = expected => `require('node:assert/strict').equal(require('../packages/value.cjs'), ${expected});\n`;
function scenario(fn, initialTests = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fail-first-ci-fixture-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" }).toString().trim();
  const write = (p, v) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), v); };
  try {
    git("init", "-b", "main"); git("config", "user.name", "Synthetic CI fixture"); git("config", "user.email", "fixture@example.test");
    write("packages/value.cjs", "module.exports = 1;\n");
    for (const [p, v] of Object.entries(initialTests)) write(p, v);
    git("add", "."); git("commit", "-m", "synthetic base"); const base = git("rev-parse", "HEAD");
    const run = (extra = []) => {
      git("add", "-A"); git("commit", "--allow-empty", "-m", "synthetic candidate");
      const r = spawnSync("python3", [checker, "--base", base, "--timeout", "5", ...extra], { cwd: root, encoding: "utf8", timeout: 20000 });
      let report; try { report = JSON.parse(r.stdout); } catch { report = { output: r.stdout, error: r.stderr }; }
      return { ...r, report };
    };
    fn({ root, git, write, run });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
test("CI accepts the identical new test failing on merge base and passing on candidate, then cleans its worktrees", () => scenario(({ git, write, run }) => {
  write("packages/value.cjs", "module.exports = 2;\n"); write(TEST, testBody(2));
  const r = run(); assert.equal(r.status, 0, JSON.stringify(r.report)); assert.equal(r.report.verdict, "PASS");
  assert.equal(r.report.tests[0].base.exit_code, 1); assert.equal(r.report.tests[0].head.exit_code, 0);
  assert.equal(git("worktree", "list", "--porcelain").split("worktree ").length - 1, 1);
}));
test("CI rejects a new test already green on merge base", () => scenario(({ write, run }) => {
  write("packages/value.cjs", "module.exports = 2;\n"); write(TEST, "require('node:assert/strict').equal(2,2);\n");
  const r = run(); assert.equal(r.status, 1); assert.equal(r.report.tests[0].base.exit_code, 0);
}));
test("CI rejects a test still failing on the candidate", () => scenario(({ write, run }) => {
  write("packages/value.cjs", "module.exports = 2;\n"); write(TEST, testBody(3));
  const r = run(); assert.equal(r.status, 1); assert.equal(r.report.tests[0].head.exit_code, 1);
}));
test("CI rejects product changes without a new or changed test", () => scenario(({ write, run }) => {
  write("packages/value.cjs", "module.exports = 2;\n"); const r = run(); assert.equal(r.status, 1); assert.equal(r.report.reason, "no_changed_tests");
}));
test("CI skips docs-only changes without executing a failing fixture", () => scenario(({ write, run }) => {
  write("docs/note.md", "Synthetic note\n"); const r = run(); assert.equal(r.status, 0); assert.equal(r.report.verdict, "NOT_REQUIRED");
}, { [TEST]: testBody(99) }));
test("CI skips tests-only changes", () => scenario(({ write, run }) => {
  write(TEST, testBody(99)); const r = run(); assert.equal(r.status, 0); assert.equal(r.report.verdict, "NOT_REQUIRED");
}));
test("CI does not accept deleting a test as fail-first evidence", () => scenario(({ root, write, run }) => {
  write("packages/value.cjs", "module.exports = 2;\n"); fs.unlinkSync(path.join(root, TEST)); const r = run(); assert.equal(r.status, 1); assert.equal(r.report.reason, "no_changed_tests");
}, { [TEST]: testBody(1) }));
test("CI checks deletion of product code too", () => scenario(({ root, write, run }) => {
  fs.unlinkSync(path.join(root, "packages/value.cjs")); write(TEST, "require('node:assert/strict').equal(require('node:fs').existsSync(require('node:path').join(__dirname,'../packages/value.cjs')),false);\n");
  const r = run(); assert.equal(r.status, 0, JSON.stringify(r.report)); assert.equal(r.report.verdict, "PASS");
}));
test("CI gives the baseline the candidate's test helpers without replacing baseline product code", () => scenario(({ write, run }) => {
  write("packages/value.cjs", "module.exports = 2;\n"); write("tests/helper.cjs", "module.exports = 2;\n");
  write(TEST, "require('node:assert/strict').equal(require('../packages/value.cjs'),require('./helper.cjs'));\n");
  const r = run(); assert.equal(r.status, 0, JSON.stringify(r.report)); assert.equal(r.report.tests[0].base.exit_code, 1);
}));
test("CI rejects an unsupported test runner instead of silently skipping it", () => scenario(({ write, run }) => {
  write("packages/value.cjs", "module.exports = 2;\n"); write("tests/career-fixture.test.rb", "raise 'not executed'\n");
  const r = run(); assert.equal(r.status, 1); assert.equal(r.report.reason, "unsupported_test_runner");
}));
test("CI fails closed on a timed-out candidate test", () => scenario(({ write, run }) => {
  write("packages/value.cjs", "module.exports = 2;\n"); write(TEST, "setTimeout(()=>{},5000);\n");
  const r = run(["--timeout", "0.2"]); assert.equal(r.status, 1); assert.equal(r.report.tests[0].head.timed_out, true);
}));
test("CI refuses an unresolved merge base", () => scenario(({ write, run }) => {
  write("packages/value.cjs", "module.exports = 2;\n"); write(TEST, testBody(2));
  const r = run(["--base", "missing-base"]); assert.equal(r.status, 2); assert.equal(r.report.verdict, "ERROR");
}));
test("CI checks modified existing tests with the same candidate bytes on the base", () => scenario(({ write, run }) => {
  write("packages/value.cjs", "module.exports = 2;\n"); write(TEST, testBody(2));
  const r = run(); assert.equal(r.status, 0, JSON.stringify(r.report)); assert.equal(r.report.verdict, "PASS");
}, { [TEST]: testBody(1) }));
test("CI includes runtime JSON behavior changes", () => scenario(({ write, run }) => {
  write("packages/settings.json", '{"value":2}\n');
  write(TEST, "require('node:assert/strict').equal(require('../packages/settings.json').value,2);\n");
  const r = run(); assert.equal(r.status, 0, JSON.stringify(r.report)); assert.equal(r.report.verdict, "PASS");
}, { "packages/settings.json": '{"value":1}\n' }));
