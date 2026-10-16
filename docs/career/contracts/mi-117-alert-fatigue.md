# MI-117 — Alert fatigue policy (module 152 delivery layer)

Spec 2 §4.1/§4.4, implemented in `packages/domain/152-career-assign.js`
(Tier 2 — engine under harness; no deploy, no sends: the policy only
*decides* delivery, the host still owns the channel).

## Policy (per user, on the watch profile as `alert_policy`)

`normalizeAlertPolicy(raw)` — defaults: quiet hours 22:00–07:00 in the
policy timezone (default UTC), `night_alerts: false`, `instant_daily_cap: 5`
(Spec 2 §4.4, until the user raises it), `skip_tighten_after: 5`.
`quiet_hours: null` disables quiet hours. `setAlertPolicy(wp, patch)` is the
raise/edit path. `validateWatchProfile` rejects a non-positive cap or an
unparseable quiet-hours value.

## Delivery layer

`planDelivery({ reminders, watchProfile, store, now })` runs after the host
drains the 152 queue (runAssignCycle's queue semantics are unchanged — the
policy never eats a reminder):

1. **Quiet hours** — inside the window and no night opt-in: every reminder
   is held, persisted in the fatigue state, `release_at` = the window's end
   (minute-scan in the policy timezone, correct across DST/overnight wrap).
   Held alerts consume **no** instant budget; at/after release they re-enter
   ahead of fresh reminders.
2. **Batching** — reminders at one *stated* company in one delivery pass form
   one unit: `career_batched_alert` with `count`, all job ids, and the best 3
   by fit score. A batched alert consumes exactly one instant slot.
   Company-less reminders never batch together (an unstated company is not
   one employer).
3. **Daily cap** — units go instant while `instant_sent < effective_cap`
   (per local day in the policy timezone; a new day refills). Overflow folds
   into the digest (`digest` list + one `career_alert_digest` record).
4. **Auto-tightening** — `recordAlertFeedback(store, wp, action, {now})`:
   `"skip"` extends the streak, any other action resets it. At 5 in a row the
   state tightens (effective cap = `max(1, floor(cap/2))` — 5 → 2) and the
   call returns the announcement, exactly one sentence, exactly once; it is
   also recorded on the state as `tighten_notice`.

Fatigue state persists per user under `career:alert-fatigue:<user_id>`
(FATIGUE_KEY): day, instant_sent, digest census, held set, skip streak,
tightened flag — so caps and streaks bind across cycles, never per call.

## Guard

`tests/career-mi117-alert-fatigue.test.cjs` (10 tests, FTG-1…FTG-5):
8-opening burst → one batched alert; quiet-hours hold → release at window
end; night opt-in delivers; 6th instant folds to digest + next-day reset;
5-skip tightening with a one-sentence notice + tightened cap binding
delivery; streak reset on non-skip; company-less never batches; Chicago
timezone quiet window (07:00 CDT = 12:00 UTC release).
