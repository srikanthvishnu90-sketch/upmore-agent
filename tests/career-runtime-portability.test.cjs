"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(process.env.PIN_ENV_TEST_ROOT || path.join(__dirname, ".."));

function world() {
  let sequence = 0;
  const timers = new Map();
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "packages/domain/69-agent-router.js"), "utf8"), {
    module,
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { router: module.exports, timers };
}

for (const outcome of ["resolved", "rejected", "synchronous error"]) {
  test(`router extraction ${outcome}: completion releases its deadline timer`, async () => {
    const { router, timers } = world();
    const result = await router.handle("a question", {
      extract: outcome === "resolved" ? async () => ({ intent: "other" })
        : outcome === "rejected" ? async () => { throw new Error("synthetic rejection"); }
        : () => { throw new Error("synthetic synchronous error"); },
    });
    assert.equal(result.route, "fallthrough");
    assert.equal(result.source, outcome === "resolved" ? "model" : "regex_net");
    assert.equal(timers.size, 0, "a completed turn must not retain a model deadline");
  });
}

test("router extraction deadline still expires at the requested budget and falls back", async () => {
  const { router, timers } = world();
  const pending = router.handle("a question", { extract: () => new Promise(() => {}), timeout_ms: 23 });
  await Promise.resolve();
  assert.equal(timers.size, 1);
  const timer = [...timers.values()][0];
  assert.equal(timer.delay, 23);
  timer.fn();
  const result = await pending;
  assert.equal(result.route, "fallthrough");
  assert.equal(result.source, "regex_net");
  assert.ok(result.problems.includes("model timeout"));
  assert.equal(timers.size, 0, "the expired deadline is released too");
});
