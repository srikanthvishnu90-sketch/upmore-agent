"use strict";
/* Wait primitives for the portal browser helper (event-driven fills,
   2026-10-22 — docs/apply/EVENT-DRIVEN-FILLS-2026-10-22.md).
 *
 * The fill path used to proceed on fixed sleeps: sleep the settle
 * budget, then check the condition ONCE. These primitives invert
 * that: wait ON the condition, bounded by the same budget the sleep
 * used, and report how the wait ended. A timeout is a result the
 * caller handles with exactly the behavior the ladder had (re-fill,
 * next stage, verdict) — never a silent longer sleep.
 *
 * Deliberately free of Playwright imports so the semantics are
 * unit-testable with fake pages/checks (tests/career-event-waits.test.cjs).
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Run `check` now, then every `intervalMs`, until it returns a truthy
 * verdict or `deadlineMs` passes. The FIRST check always runs (a
 * condition that already holds costs one check, not one interval).
 * A check that throws propagates: in the readback path a thrown
 * STALE_OBSERVATION is a verdict the caller must see, not a retry
 * signal. Returns { value, waitedMs, polls, timedOut }. */
async function pollUntil(check, opts) {
  const o = opts || {};
  const deadlineMs = Math.max(0, o.deadlineMs == null ? 0 : o.deadlineMs);
  const intervalMs = Math.max(1, o.intervalMs == null ? 40 : o.intervalMs);
  const now = o.now || Date.now;
  const nap = o.sleep || sleep;
  const t0 = now();
  let polls = 0;
  for (;;) {
    polls += 1;
    const value = await check();
    const waitedMs = now() - t0;
    if (value) return { value, waitedMs, polls, timedOut: false };
    if (waitedMs >= deadlineMs) return { value: null, waitedMs, polls, timedOut: true };
    await nap(Math.min(intervalMs, deadlineMs - waitedMs));
  }
}

/* Wait for an in-page condition. Prefers page.waitForFunction,
 * which re-evaluates the predicate on DOM mutations BY DEFAULT —
 * no `polling` option is passed for that: the installed Playwright
 * rejects polling:"mutation" outright (F-032, found on the first
 * live drive of this module: every waitForDom threw DRIVER_ERROR
 * "Unknown polling option: mutation"). Only the two polling values
 * Playwright actually accepts ("raf" or a millisecond number) are
 * forwarded when a caller asks for one; anything else is dropped so
 * an invalid option can never reach the driver again. Environments
 * whose page object lacks waitForFunction degrade to an evaluate
 * poll at 40 ms — same bound, same result shape. `fn` must be
 * self-contained (it is serialized into the page). Returns
 * { fired, value, waitedMs, timedOut }; on timeout `value` is null
 * and `fired` false. A page error other than the wait's own timeout
 * propagates — a dead page is not a timeout. */
async function waitForDom(page, fn, arg, opts) {
  const o = opts || {};
  const timeoutMs = Math.max(0, o.timeoutMs == null ? 0 : o.timeoutMs);
  const t0 = Date.now();
  if (page && typeof page.waitForFunction === "function") {
    try {
      const wfOpts = { timeout: timeoutMs };
      if (o.polling === "raf" || typeof o.polling === "number") wfOpts.polling = o.polling;
      const handle = await page.waitForFunction(fn, arg, wfOpts);
      const value = handle ? await handle.jsonValue().catch(() => true) : true;
      return { fired: true, value: value == null ? true : value, waitedMs: Date.now() - t0, timedOut: false };
    } catch (e) {
      if (e && /timeout/i.test(String(e.message || e))) return { fired: false, value: null, waitedMs: Date.now() - t0, timedOut: true };
      throw e;
    }
  }
  const r = await pollUntil(async () => {
    const v = await page.evaluate(fn, arg);
    return v ? v : null;
  }, { deadlineMs: timeoutMs, intervalMs: o.intervalMs || 40 });
  return { fired: !r.timedOut, value: r.value, waitedMs: r.waitedMs, timedOut: r.timedOut };
}

/* The kill switch, as named config data. Env UPMORE_EVENT_WAITS:
 *   unset / "" / "all"  -> every named wait is event-driven
 *   "off" / "none"      -> every named wait runs its old ladder form
 *   "a,b,c"             -> only the named waits run their ladder form
 * Read once by the caller at startup; flipping it is a service-config
 * change + restart, never a code change. */
function ladderForced(envValue, waitName) {
  if (envValue == null) return false;
  const v = String(envValue).trim().toLowerCase();
  if (!v || v === "all") return false;
  if (v === "off" || v === "none") return true;
  return v.split(",").map((s) => s.trim()).filter(Boolean).includes(waitName);
}

module.exports = { pollUntil, waitForDom, ladderForced };
