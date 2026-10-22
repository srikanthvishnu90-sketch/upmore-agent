"use strict";
/* Event-driven wait primitives (chunk 60%, 2026-10-22). The fill path
 * used to sleep a fixed settle budget and check its condition once;
 * these guards pin the replacement semantics with fake pages/checks —
 * no Chromium, no timers beyond the budgets under test:
 *   - an event that fires is proceeded on at event speed, not tick speed
 *   - an event that never fires ends in a BOUNDED, reported timeout
 *   - a slow event never causes a premature proceed
 *   - a throwing check is a verdict that propagates, never a retry
 *   - the ladder kill switch reads as named config data */
const test = require("node:test");
const assert = require("node:assert");
const { pollUntil, waitForDom, ladderForced } = require("../scripts/career/wait-primitives.cjs");

test("pollUntil: a condition that already holds costs one poll", async () => {
  const r = await pollUntil(async () => "ready", { deadlineMs: 500, intervalMs: 40 });
  assert.equal(r.value, "ready");
  assert.equal(r.polls, 1);
  assert.equal(r.timedOut, false);
  assert.ok(r.waitedMs < 100, `waited ${r.waitedMs}ms`);
});

test("pollUntil: proceeds only when the condition turns true — never early", async () => {
  let calls = 0;
  const r = await pollUntil(async () => { calls += 1; return calls >= 3 ? "third" : null; }, { deadlineMs: 2000, intervalMs: 25 });
  assert.equal(r.value, "third");
  assert.equal(r.polls, 3);
  assert.equal(calls, 3);
});

test("pollUntil: a condition that never holds is a bounded timeout", async () => {
  const r = await pollUntil(async () => null, { deadlineMs: 120, intervalMs: 40 });
  assert.equal(r.timedOut, true);
  assert.equal(r.value, null);
  assert.ok(r.waitedMs >= 120 && r.waitedMs < 400, `waited ${r.waitedMs}ms`);
});

test("pollUntil: a throwing check propagates (a verdict, not a retry)", async () => {
  const boom = Object.assign(new Error("the observed DOM node changed; re-observe"), { code: "STALE_OBSERVATION" });
  await assert.rejects(() => pollUntil(async () => { throw boom; }, { deadlineMs: 500 }), (e) => e === boom);
});

test("waitForDom: an event that fires is proceeded on at event speed", async () => {
  let fired = false;
  setTimeout(() => { fired = true; }, 30);
  const page = {
    async waitForFunction(fn, arg) {
      const t0 = Date.now();
      while (!fired) { if (Date.now() - t0 > 5000) throw new Error("Timeout 5000ms exceeded"); await new Promise((r) => setTimeout(r, 5)); }
      return { jsonValue: async () => fn(arg) };
    },
  };
  const r = await waitForDom(page, () => "the-option", null, { timeoutMs: 5000 });
  assert.equal(r.fired, true);
  assert.equal(r.value, "the-option");
  assert.ok(r.waitedMs < 1000, `waited ${r.waitedMs}ms — event speed, not the 5s budget`);
});

test("waitForDom: no event within budget is a reported timeout, not a longer sleep", async () => {
  const page = { async waitForFunction() { throw new Error("Timeout 150ms exceeded"); } };
  const r = await waitForDom(page, () => true, null, { timeoutMs: 150 });
  assert.deepEqual({ fired: r.fired, value: r.value, timedOut: r.timedOut }, { fired: false, value: null, timedOut: true });
});

test("waitForDom: without waitForFunction the evaluate poll still waits for the event", async () => {
  let calls = 0;
  const page = { evaluate: async () => { calls += 1; return calls >= 3 ? "late-value" : null; } };
  const r = await waitForDom(page, () => null, null, { timeoutMs: 2000, intervalMs: 20 });
  assert.equal(r.fired, true);
  assert.equal(r.value, "late-value");
  assert.equal(calls, 3);
});

test("waitForDom: evaluate fallback timeout is bounded", async () => {
  const page = { evaluate: async () => null };
  const r = await waitForDom(page, () => null, null, { timeoutMs: 110, intervalMs: 30 });
  assert.equal(r.timedOut, true);
  assert.ok(r.waitedMs >= 110 && r.waitedMs < 400, `waited ${r.waitedMs}ms`);
});

test("waitForDom: a page error that is not the wait's timeout propagates", async () => {
  const page = { async waitForFunction() { throw new Error("Target closed"); } };
  await assert.rejects(() => waitForDom(page, () => true, null, { timeoutMs: 100 }), /Target closed/);
});

/* F-032 regression guard: the installed Playwright validates the
 * waitForFunction polling option and rejects "mutation" — the first
 * live drive of this module died on exactly that (DRIVER_ERROR on
 * every widget fill) while lenient fakes passed. These fakes model
 * the real validation; the module must never hand the driver an
 * option value it rejects. */
function strictPlaywrightPage(result) {
  return {
    async waitForFunction(fn, arg, opts) {
      const p = opts && opts.polling;
      if (p !== undefined && p !== "raf" && typeof p !== "number") throw new Error(`Unknown polling option: ${p}`);
      return { jsonValue: async () => result };
    },
  };
}

test("waitForDom: never passes a polling option the real driver rejects (F-032)", async () => {
  const r = await waitForDom(strictPlaywrightPage("ok"), () => "ok", null, { timeoutMs: 100 });
  assert.equal(r.fired, true);
  assert.equal(r.value, "ok");
});

test("waitForDom: a caller asking for polling 'mutation' is sanitized, not forwarded (F-032)", async () => {
  const r = await waitForDom(strictPlaywrightPage("ok2"), () => "ok2", null, { timeoutMs: 100, polling: "mutation" });
  assert.equal(r.fired, true);
  assert.equal(r.value, "ok2");
});

test("ladderForced: named config data — unset/all on, off all, list per-wait", () => {
  assert.equal(ladderForced(undefined, "widget_option"), false);
  assert.equal(ladderForced("", "widget_option"), false);
  assert.equal(ladderForced("all", "widget_option"), false);
  assert.equal(ladderForced("off", "widget_option"), true);
  assert.equal(ladderForced("none", "persist_verify"), true);
  assert.equal(ladderForced("widget_option", "widget_option"), true);
  assert.equal(ladderForced("widget_option", "persist_verify"), false);
  assert.equal(ladderForced(" widget_option , persist_verify ", "persist_verify"), true);
});
