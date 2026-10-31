"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const root = path.resolve(process.env.PIN_ENV_TEST_ROOT || path.join(__dirname, ".."));
const { launch } = require(path.join(root, "evals/apply/workday-fill.cjs"));

async function fixture(mode, verify) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workday-launch-fixture-"));
  const modulePath = path.join(dir, "playwright.cjs");
  fs.writeFileSync(modulePath, `
    const state = { profile: null, closed: 0, options: null };
    const failure = new Error("synthetic browser setup failure");
    const worker = { fixture: true };
    const ctx = {
      serviceWorkers: () => ${mode === "ready" ? "[worker]" : "[]"},
      async waitForEvent() { throw failure; },
      async close() { state.closed++; ${mode === "close-error" ? 'throw new Error("synthetic close failure");' : ""} },
    };
    exports.state = state; exports.failure = failure; exports.ctx = ctx; exports.worker = worker;
    exports.chromium = {
      executablePath: () => "not-an-executable",
      async launchPersistentContext(profile, options) {
        state.profile = profile; state.options = options;
        ${mode === "launch-error" ? "throw failure;" : "return ctx;"}
      },
    };
  `);
  const saved = process.env.UPMORE_PLAYWRIGHT_PATH;
  process.env.UPMORE_PLAYWRIGHT_PATH = modulePath;
  const fake = require(modulePath);
  try { await verify(fake); }
  finally {
    if (saved === undefined) delete process.env.UPMORE_PLAYWRIGHT_PATH;
    else process.env.UPMORE_PLAYWRIGHT_PATH = saved;
    if (fake.state.profile) fs.rmSync(fake.state.profile, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const mode of ["worker-timeout", "close-error", "launch-error"]) {
  test(`Workday fixture ${mode}: release setup resources and preserve the original error`, async () => {
    await fixture(mode, async ({ state, failure }) => {
      await assert.rejects(launch({ hostRules: "MAP * ~NOTFOUND" }), (e) => e === failure);
      assert.equal(state.closed, mode === "launch-error" ? 0 : 1, "a created browser context must close");
      assert.equal(fs.existsSync(state.profile), false, "failed setup must not retain its temporary profile");
    });
  });
}

test("Workday fixture success: preserve the actual context and worker until the caller closes them", async () => {
  await fixture("ready", async ({ state, ctx, worker }) => {
    const browser = await launch({ hostRules: "MAP * ~NOTFOUND" });
    assert.equal(browser.ctx, ctx);
    assert.equal(browser.sw, worker);
    assert.equal(state.closed, 0);
    assert.equal(fs.existsSync(state.profile), true);
    await browser.close();
    assert.equal(state.closed, 1);
    assert.equal(fs.existsSync(state.profile), false);
  });
});
