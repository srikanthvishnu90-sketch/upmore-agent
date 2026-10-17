"use strict";
// BUG-238 / MI-033 (Depth Lane D, 2026-10-16): watcher misses from the
// transport-error backoff class — MT2 Window 2 measured 8 misses, one uniform
// class: a board whose fetch failed with a TRANSPORT error (no HTTP response
// at all: DNS, reset, timeout) had its next poll pushed out 120 minutes by
// 151's planCadence (one error doubles the standard 60-minute interval; two
// park it at 240), so postings that appeared during the backoff were detected
// late or past the window — delayed-not-lost, at a 29% transport error tax.
// A transport failure is not a sick or rate-limiting board: the polite
// response (backoff) belongs to HTTP answers, above all 429. Fix: planCadence
// takes the error KIND — transport errors retry on the short (active, 15-min)
// cycle and never reach the 120/240 backoffs; sustained transport failure
// (3+ in a row) settles at standard cadence rather than hammering a dead
// board every 15 minutes forever. HTTP backoff behavior is unchanged.
// Fail-first: pre-fix planCadence ignores error kind and returns 120 for the
// transport case, and the adaptive board below is not due at +15 minutes.
// Check: node --test tests/career-mi033-backoff.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));
const W = require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js"));

const MIN = 60000;
const T0 = Date.parse("2026-10-16T12:00:00.000Z");
const BASE = { cycles_observed: 6, ewma_new_per_day: 0.1 }; // standard 60-minute tier

test("MI-033: a transport error retries on the short cycle, not the 120-minute backoff", () => {
  const p = W.planCadence(Object.assign({}, BASE, { consecutive_errors: 1, error_kind: "transport", consecutive_transport_errors: 1 }));
  assert.ok(p.interval_minutes <= 15, `transport retry must be short (got ${p.interval_minutes}: ${p.reason})`);
  assert.match(p.reason, /transport/i);
});

test("MI-033: HTTP errors keep the polite backoff (doubling, then the cap)", () => {
  const one = W.planCadence(Object.assign({}, BASE, { consecutive_errors: 1, error_kind: "http", consecutive_transport_errors: 0 }));
  assert.equal(one.interval_minutes, 120, "one HTTP error still doubles — politeness is not the bug");
  const two = W.planCadence(Object.assign({}, BASE, { consecutive_errors: 2, error_kind: "http", consecutive_transport_errors: 0 }));
  assert.equal(two.interval_minutes, 240, "repeated HTTP errors still park at the cap");
});

test("MI-033: sustained transport failure settles at standard cadence (no 15-minute hammering of a dead board)", () => {
  const p = W.planCadence(Object.assign({}, BASE, { consecutive_errors: 3, error_kind: "transport", consecutive_transport_errors: 3 }));
  assert.ok(p.interval_minutes >= 60, `sustained transport failure must not retry every 15 min forever (got ${p.interval_minutes})`);
  assert.ok(p.interval_minutes < 240, "and must not park at the HTTP cap either — the board is unreachable, not rate-limiting us");
});

test("MI-033 replay: a board that transport-fails is due again at +15 min and its posting is not missed", async () => {
  const feeds = [J.feeds.greenhouse("acme")];
  const profile = { preferences: { role_families: ["Finance"], starred_companies: [] }, skills: [] };
  const store = W.createMemoryStore();
  const alerts = [];
  let mode = "down";
  const fetchImpl = async () => {
    if (mode === "down") throw new Error("socket hang up (ECONNRESET)");
    const jobs = mode === "seed"
      ? []
      : [{ id: 7, title: "Finance Intern", location: { name: "New York, NY" }, absolute_url: "https://example.test/7", first_published: new Date(T0 + 70 * MIN).toISOString(), requisition_id: "REQ-7", departments: [{ name: "Finance" }], content: "Finance internship on the trading floor." }];
    return { status: 200, json: async () => ({ name: "Acme", jobs }) };
  };
  const base = { feeds, fetch: fetchImpl, profile, store, sink: async (r) => { alerts.push(r); } };

  const c1 = await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 }));
  assert.equal(c1.boards_polled, 1);
  assert.ok(c1.errors.length >= 1, "the transport failure is on the cycle record");

  mode = "seed";
  const c2 = await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 + 15 * MIN }));
  assert.equal(c2.boards_polled, 1, "the board is DUE at +15 min under the short transport retry (pre-fix: parked until +120)");
  assert.equal(c2.errors.length, 0);

  // After a successful poll the board returns to its designed standard
  // cadence (60 min — velocity still unknown), so the next due poll is +75.
  // The posting goes up at +70, inside what the 120-minute backoff would
  // have swallowed whole.
  mode = "live";
  const c3 = await W.runAdaptiveCycle(Object.assign({}, base, { now: T0 + 75 * MIN }));
  assert.equal(c3.boards_polled, 1);
  assert.equal(c3.alerts_delivered, 1, `the posting that appeared during the outage window alerts (errors: ${JSON.stringify(c3.errors)})`);
  assert.equal(alerts.length, 1);
});
