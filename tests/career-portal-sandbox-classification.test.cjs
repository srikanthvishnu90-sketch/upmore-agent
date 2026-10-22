"use strict";
// Guard for the DRIVER_ERROR misclassification behind the E2E H4 finding
// (docs/e2e/H4-DRIVER-ERROR-ROOT-CAUSE.md): when Chromium cannot start
// WITH its sandbox on a host that cannot initialize one, the helper's
// response classifier must say BROWSER_SANDBOX_UNAVAILABLE — the measured
// Playwright wording for that condition is "Chromium sandboxing failed!",
// which the pre-fix regex (/SUID sandbox|sandbox.*abort|No usable
// sandbox/i) did not match, so every sandbox failure on such a host was
// reported as a generic DRIVER_ERROR and lanes chased a phantom driver
// bug. Error strings below are copied from measured output on
// 2026-10-22 (this VM), not invented.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const helper = require("../scripts/career/portal-browser-helper.cjs");

test("classifyDriverError is exported by the helper", () => {
  assert.equal(typeof helper.classifyDriverError, "function",
    "the pump() response classifier must be an exported, testable function");
});

test("measured sandbox-failure wordings classify as BROWSER_SANDBOX_UNAVAILABLE", () => {
  const c = helper.classifyDriverError;
  // Playwright, sandboxed launch as root in this VM (measured 2026-10-22).
  assert.equal(c(new Error("browserType.launch: Target page, context or browser has been closed\nBrowser logs:\nChromium sandboxing failed!")), "BROWSER_SANDBOX_UNAVAILABLE");
  // Chromium zygote FATAL, sandboxed launch as an unprivileged user here.
  assert.equal(c(new Error("No usable sandbox! If you are running on Ubuntu 23.10+ ... see https://chromium.googlesource.com/chromium/src/+/main/docs/linux/suid_sandbox_development.md")), "BROWSER_SANDBOX_UNAVAILABLE");
  // The pre-existing wordings keep classifying as before.
  assert.equal(c(new Error("SUID sandbox helper is not configured")), "BROWSER_SANDBOX_UNAVAILABLE");
  assert.equal(c(new Error("sandbox: abort called")), "BROWSER_SANDBOX_UNAVAILABLE");
});

test("non-sandbox failures are unchanged: own code wins, else DRIVER_ERROR", () => {
  const c = helper.classifyDriverError;
  assert.equal(c(new Error("Target page, context or browser has been closed")), "DRIVER_ERROR");
  assert.equal(c(new Error("elementHandle.evaluate: Target crashed")), "DRIVER_ERROR");
  const coded = Object.assign(new Error("boom"), { code: "PAGE_GONE" });
  assert.equal(c(coded), "PAGE_GONE", "an error carrying its own code keeps it");
  const codedSandbox = Object.assign(new Error("Chromium sandboxing failed!"), { code: "PAGE_GONE" });
  assert.equal(c(codedSandbox), "BROWSER_SANDBOX_UNAVAILABLE",
    "the sandbox condition outranks a generic code — it names the host blocker, not a page fault");
});
