"use strict";
// BUG-QA-2026-10-21-04 — browser test gates' Playwright resolvers diverged
// from the helper's: the helper (scripts/career/portal-browser-helper.cjs)
// tries env -> "playwright" -> the Sporv-clone sibling fallback, but the
// test gates tried only the first two, so whole suites silently SKIPPED
// (14/14) on a machine where the driver itself resolved and ran fine.
// A skipped browser suite is a NOT_RUN, never a pass.
// Guard: every browser-suite gate carries the helper's full try list, and
// the shared fallback actually resolves on this machine with no env set.
// Check: node --test tests/career-qa-bug04-resolver.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

const GATES = [
  "tests/career-portal-browser.test.cjs",
  "tests/career-portal-lever-radio.test.cjs",
  "tests/career-portal-submit-integrity.test.cjs",
];
const HELPER = "scripts/career/portal-browser-helper.cjs";
const SIBLING = path.join(root, "..", "sporve-agent-clone", "node_modules", "playwright");

test("the helper's resolver carries the Sporv sibling fallback (the reference shape)", () => {
  const src = fs.readFileSync(path.join(root, HELPER), "utf8");
  assert.ok(src.includes('sporve-agent-clone') && src.includes('node_modules", "playwright"') || src.includes("sporve-agent-clone"),
    "helper resolver keeps its sibling fallback — the gates align TO it");
});

for (const gate of GATES) {
  test(`${gate}: gate resolver includes the helper's sibling fallback`, () => {
    const src = fs.readFileSync(path.join(root, gate), "utf8");
    const m = src.match(/function resolvePlaywright\(\) \{[\s\S]*?\n\}/);
    assert.ok(m, "resolver function present");
    assert.ok(m[0].includes("UPMORE_PLAYWRIGHT_PATH"), "env try present");
    assert.ok(m[0].includes('"playwright"'), "bare-name try present");
    assert.ok(m[0].includes("sporve-agent-clone"), `sibling fallback present — without it this gate silently skips while the driver works`);
  });
}

test("the sibling fallback resolves Playwright with UPMORE_PLAYWRIGHT_PATH unset", () => {
  assert.ok(!process.env.UPMORE_PLAYWRIGHT_PATH || process.env.UPMORE_PLAYWRIGHT_PATH === SIBLING,
    "this proof runs with the env unset (the posture that used to skip)");
  assert.ok(fs.existsSync(SIBLING), `sibling install present at ${SIBLING}`);
  const pw = require(SIBLING);
  assert.equal(typeof pw.chromium.launch, "function", "the resolved module is a working Playwright");
});
