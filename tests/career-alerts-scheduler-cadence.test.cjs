"use strict";
// BUG-239 (Depth Lane D, 2026-10-16) — scheduler cadence phase drift.
// The scheduler's first due-rule was elapsed-based ("starred due when
// 14+ minutes since the last starred run"). A run at 23:04 pushed the
// next due to 23:18; the 23:15 timer fire found nothing due and exited
// clean; the next starred run landed at 23:30 — a 26-minute gap on a
// 15-minute cadence, invisible in every individual cycle log and caught
// only by the grid auditor (alerts-scheduler-audit.mjs flagged the
// 23:15 tick MISSED). Due-ness is now anchored to wall-clock slots: a
// subset is due when a new slot has begun since its last run, so the
// cadence can never drift, whatever manual runs interleave.
// Check: node --test tests/career-alerts-scheduler-cadence.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const schedP = import(pathToFileURL(path.join(__dirname, "..", "scripts/career/alerts-scheduler.mjs")).href);
const T = (h, m) => Date.UTC(2026, 9, 16, h, m);

test("BUG-239 replay: a :04 run does NOT push the :15 slot out — the :15 fire finds starred due", async () => {
  const { cadencesDue } = await schedP;
  const sched = { starred_last: T(23, 4), default_last: T(23, 4) };
  assert.deepEqual(cadencesDue(sched, T(23, 15), "due"), ["starred"],
    "the 23:15 slot must run starred even though only 11 minutes elapsed since 23:04");
});

test("cadence: steady state runs each subset once per slot, never twice", async () => {
  const { cadencesDue } = await schedP;
  const sched = { starred_last: T(23, 15), default_last: T(23, 0) };
  assert.deepEqual(cadencesDue(sched, T(23, 29), "due"), [], "same slots — nothing due");
  assert.deepEqual(cadencesDue(sched, T(23, 30), "due"), ["starred"], "new quarter slot");
  assert.deepEqual(cadencesDue(sched, T(0, 0) + 24 * 3600000, "due"), ["starred", "default"], "new hour slot brings both");
});

test("cadence: first run (no state) is due for both; explicit modes pass through", async () => {
  const { cadencesDue } = await schedP;
  assert.deepEqual(cadencesDue({}, T(23, 15), "due"), ["starred", "default"]);
  assert.deepEqual(cadencesDue({}, T(23, 15), "all"), ["starred", "default"]);
  assert.deepEqual(cadencesDue({}, T(23, 15), "default"), ["default"]);
});
