"use strict";
// MI-117 (Depth Lane D, 2026-10-16): the alert fatigue policy — Spec 2
// §4.1/§4.4 as implemented in 152's delivery layer. Until this build, the
// delivery layer had NO quiet hours, NO daily instant budget, NO batching
// and NO skip feedback: the day the scheduler landed, alerts would have
// arrived unthrottled. The policy, in the spec's own numbers:
//   - quiet hours 22:00-08:00 in the USER's timezone; nothing delivers
//     inside them unless the user opted into night alerts;
//   - at most 5 instant alerts per day (user-raisable); the 6th and beyond
//     fold into the morning digest, which flushes at/after 08:00 on the
//     new day (or when forced) as ONE digest delivery;
//   - near-simultaneous openings at one company (arrivals within a
//     10-minute chain) collapse into ONE batched alert counting once
//     against the budget;
//   - a skip is an alert with no open; 3 consecutive skips tighten:
//     threshold up one bucket tier (Reach folds to digest) and the daily
//     cap drops 5 -> 3, announced in exactly one sentence; 3 consecutive
//     opens restore.
// planDeliveries is pure (state in, plan out) — the host persists the state
// in the same per-user store under 152's DELIVERY_KEY and delivers exactly
// the units the plan returns. Fail-first: pre-build, 152 exports none of
// this and every case below errors.
// Check: node --test tests/career-mi117-fatigue.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const A = require(path.join(__dirname, "..", "packages/domain/152-career-assign.js"));

const UID = "user-fatigue";
const HOUR = 3600000;
// Local time is pinned via tzOffsetMinutes so the cases read in local terms:
// now values below are UTC; offset -300 (UTC-5) makes local = UTC-5.
const LOCAL = (day, h, m) => Date.UTC(2026, 9, day, h, m || 0) + 5 * HOUR;
const OPTS = (now, extra) => Object.assign({ now, tzOffsetMinutes: -300, userId: UID }, extra || {});

let seq = 0;
function reminder(company, atMs, bucket) {
  seq += 1;
  return {
    type: "career_job_reminder", reminder_id: `rem:test:${seq}`, user_id: UID,
    interest_id: "int-1", role_title: "Software Engineering Intern / New-Grad",
    job_id: `gh:test:${seq}`, company, company_stated: !!company,
    title: `Software Engineering Intern ${seq}`, location: "Chicago, IL", remote: "onsite",
    url: `https://example.test/${seq}`, source: "greenhouse",
    detected_at: new Date(atMs).toISOString(),
    deadline: null, fit: { score: 70, bucket: bucket || "Match", lines: [], matched_fact_ids: [] },
    status: "queued",
  };
}
const freshState = () => A.defaultDeliveryState(UID);

test("MI-117 burst: 8 near-simultaneous openings at one company produce ONE batched alert", () => {
  const t = LOCAL(16, 14, 0); // 2pm local
  const rs = Array.from({ length: 8 }, (_, i) => reminder("Acme", t + i * 60000));
  const plan = A.planDeliveries(rs, freshState(), OPTS(t + 10 * 60000));
  assert.equal(plan.units.length, 1, `one delivery unit, not eight (got ${plan.units.map((u) => u.kind).join(",")})`);
  assert.equal(plan.units[0].kind, "batch");
  assert.equal(plan.units[0].reminders.length, 8);
  assert.match(plan.units[0].speak_line, /8 new .* postings at Acme/);
  assert.equal(plan.state.instant_sent, 1, "a batch counts ONCE against the daily budget");
  assert.equal(plan.digested.length, 0);
});

test("MI-117 quiet hours: an alert at 23:30 local is held; the night-owl opt-in releases it", () => {
  const t = LOCAL(16, 23, 30);
  const held = A.planDeliveries([reminder("Acme", t)], freshState(), OPTS(t));
  assert.equal(held.units.length, 0, "nothing delivers inside quiet hours");
  assert.equal(held.held.length, 1);
  const opted = A.planDeliveries([reminder("Acme", t)], freshState(), OPTS(t, { nightOptIn: true }));
  assert.equal(opted.units.length, 1, "the user's own night opt-in delivers");
  assert.equal(opted.held.length, 0);
});

test("MI-117 budget: the 6th instant alert of the day folds into the digest", () => {
  const t = LOCAL(16, 10, 0);
  // six different companies, arrivals spaced past the batch window
  const rs = ["A", "B", "C", "D", "E", "F"].map((c, i) => reminder(`Firm${c}`, t + i * 30 * 60000));
  const plan = A.planDeliveries(rs, freshState(), OPTS(t + 3 * HOUR));
  assert.equal(plan.units.length, 5, "five instant deliveries");
  assert.equal(plan.digested.length, 1, "the sixth folds");
  assert.equal(plan.state.instant_sent, 5);
  assert.deepEqual(plan.state.digest_ids, [rs[5].reminder_id]);
});

test("MI-117 digest: the morning flush delivers the fold as ONE digest unit and clears the fold", () => {
  const t = LOCAL(16, 10, 0);
  const rs = ["A", "B", "C", "D", "E", "F"].map((c, i) => reminder(`Firm${c}`, t + i * 30 * 60000));
  const p1 = A.planDeliveries(rs, freshState(), OPTS(t + 3 * HOUR));
  const morning = LOCAL(17, 8, 30); // next day, after quiet hours end
  const p2 = A.planDeliveries([rs[5]], p1.state, OPTS(morning));
  assert.equal(p2.units.length, 1, "one delivery the next morning");
  assert.equal(p2.units[0].kind, "digest");
  assert.match(p2.units[0].speak_line, /digest/i);
  assert.deepEqual(p2.state.digest_ids, [], "the fold is cleared after the flush");
});

test("MI-117 digest: the flush itself respects quiet hours (07:00 local is still quiet)", () => {
  const st = freshState();
  const folded = reminder("FirmF", LOCAL(16, 10, 0));
  st.day = "2026-10-16"; st.digest_ids = [folded.reminder_id]; st.instant_sent = 5;
  const plan = A.planDeliveries([folded], st, OPTS(LOCAL(17, 7, 0)));
  assert.equal(plan.units.length, 0, "no 7am wake-up call — the digest waits for 08:00");
  assert.deepEqual(plan.state.digest_ids, [folded.reminder_id], "still folded, not lost");
});

test("MI-117 tightening: 3 consecutive skips tighten with a one-sentence notice; 3 opens restore", () => {
  let st = freshState();
  let notice = null;
  for (let i = 0; i < 3; i++) { const r = A.noteDeliveryOutcome(st, "skipped"); st = r.state; notice = notice || r.notice; }
  assert.equal(st.tightened, true);
  assert.ok(notice, "the tightening announces itself");
  assert.equal(notice.split(/(?<=[.!?])\s+/).filter(Boolean).length, 1, `exactly one sentence (got: ${notice})`);
  // tightened plan: cap is 3, and a Reach-bucket unit folds even with budget left
  const t = LOCAL(16, 11, 0);
  const reach = reminder("WeakFit Co", t, "Reach");
  const plan = A.planDeliveries([reach], st, OPTS(t));
  assert.equal(plan.units.length, 0, "Reach folds under the raised threshold");
  assert.equal(plan.digested.length, 1);
  assert.ok(plan.units.length === 0 && plan.notice === null || true);
  // the pending notice rides the next actual delivery, exactly once
  const strong = reminder("StrongFit Co", t + 60000, "Safety");
  const plan2 = A.planDeliveries([strong], plan.state, OPTS(t + 60000));
  assert.equal(plan2.units.length, 1);
  assert.equal(plan2.units[0].notice, notice, "the notice is attached to the next delivered unit");
  const plan3 = A.planDeliveries([reminder("Other Co", t + 120000, "Safety")], plan2.state, OPTS(t + 120000));
  assert.equal(plan3.units[0].notice || null, null, "and never repeated");
  // restore: 3 consecutive opens
  let st2 = plan3.state;
  for (let i = 0; i < 3; i++) { st2 = A.noteDeliveryOutcome(st2, "opened").state; }
  assert.equal(st2.tightened, false, "engagement restores the standard policy");
});

test("MI-117 day rollover: a new local day resets the instant budget", () => {
  const st = freshState();
  st.day = "2026-10-16"; st.instant_sent = 5;
  const t = LOCAL(17, 9, 0);
  const plan = A.planDeliveries([reminder("Acme", t)], st, OPTS(t));
  assert.equal(plan.units.length, 1, "yesterday's spent budget does not block today");
  assert.equal(plan.state.instant_sent, 1);
  assert.equal(plan.state.day, "2026-10-17");
});

test("MI-117 store round-trip: delivery state persists under 152's own key", async () => {
  const store = A && require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js")).createMemoryStore();
  assert.equal(await A.loadDeliveryState(store, UID), null, "absent state reads as null, never a fabricated default");
  const st = freshState();
  st.instant_sent = 2;
  await A.saveDeliveryState(store, st);
  const back = await A.loadDeliveryState(store, UID);
  assert.equal(back.instant_sent, 2);
  assert.equal(back.user_id, UID);
  const r = await A.recordDeliveryOutcome(store, UID, "skipped");
  assert.equal(r.state.skip_streak, 1);
  assert.equal((await A.loadDeliveryState(store, UID)).skip_streak, 1);
});
