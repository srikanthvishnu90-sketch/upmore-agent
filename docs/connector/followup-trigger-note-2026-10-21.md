# Connector 72h follow-up — trigger design (module 161, Lane B)

Outcome trace: O2 — the follow-up is felt 72 hours after the first real
intro, when the check-in message actually arrives. Module 159 composes the
message and stamps the due marker; module 161
(`packages/domain/161-career-connector-followup.js`, guards
`tests/career-connector-followup.test.cjs`, 15/15) owns the plan that makes
it fire. This note is the assembly contract: what the plan becomes in the
live schema, who polls it, and why none of it touches the FAILED alerts
scheduler. All schema facts below are read from the closure migrations as
applied to prod 2026-10-21.

## The live surfaces the design uses (and only these)

- `public.career_outbox` (created `20261019010001_career_alerts`; delivery
  columns added `20261019020000_channel_delivery`): `user_id`, `key`,
  `kind`, `text` (1–4000 chars), `deliver_at`, `delivered_at`, plus
  `status` ∈ `queued | sending | delivered | failed | skipped_opt_out`,
  `attempts`, `retry_at`, `claimed_at`, `contact`, `provider_id`, `error`.
  Idempotency is a database fact: `UNIQUE (user_id, key)`
  (`career_outbox_once`). Due rows are indexed by
  `career_outbox_due (deliver_at, id) WHERE status IN ('queued','failed')`.
- The `followup` kind and the `followup:` key prefix are already legal:
  both enter the widened constraints in `20261020100000_career_mail_tracking`
  and survive every later widening (final kind set after
  `20261021070000_channel_parity` has 11 kinds incl. `followup`; key regex
  allows `followup:` and caps length at 310 — the module enforces the same
  cap at schedule time).
- `public.career_outbox_claim(p_now, p_limit)` (service_role only,
  `20261019020000_channel_delivery`): claims due rows for people who have a
  `channel_contacts` row, `FOR UPDATE SKIP LOCKED`, at-most-once — a row
  left `sending` by a dead run is failed, never resent. Every run is
  recorded in `public.channel_delivery_runs`, whose stated purpose is that
  a silent stop is visible.
- `public.connector_intros.checkin_at` and the service-only
  `public.connector_followup_for(p_intro, 'checkin', p_now)`
  (`20261020110000_career_connector`): the product's own record that the
  post-intro check-in happened — stamped exactly once, only from state
  `introduced`.

## What the plan becomes

1. **Schedule (event, not cadence).** When an intro is marked delivered,
   the connector host calls `schedule()` with the delivered-intro record
   `{introId, matchId, aId, bId, aName, bName, deliveredAt}` and each side's
   IANA time zone from their profile. The host persists the machine via
   `snapshot()` alongside the other connector records (the 157/158
   carriage pattern). **No outbox row exists yet** — the plan is the
   obligation; the row is written only at fire time, after the consent
   re-check, so a revoked plan never leaves a retractable row behind.
2. **Evaluate (the trigger surface).** The host runs `tick(now)` +
   `fireCandidates(now)` (a) whenever the connector host handles any turn
   for either person, and (b) at the head of each channel-delivery worker
   wake, before it claims — evaluate, write what is due, then the same
   wake's claim picks the new rows up. This evaluator is part of the
   connector/delivery path named here; it is not a new scheduler and it
   is not the alerts scheduler (below).
3. **Fire + write.** For each candidate, `fire(id, now)` re-checks consent
   (157's `isConsented(state, 'contacted')` per person — the chained scope
   that covers being contacted about this intro) and returns one payload
   per side whose fire time has arrived. The host inserts, per payload:

   ```sql
   insert into public.career_outbox (user_id, key, kind, text, deliver_at)
   values (:user_id, 'followup:' || :introId || ':fu72', 'followup', :text, :fire_at)
   on conflict (user_id, key) do nothing
   returning id;
   ```

   The composed message is one thread check-in naming both people (159's
   contract); it becomes **two rows**, one per recipient under their own
   `user_id`, same key, same text — which is exactly the shape the
   `UNIQUE (user_id, key)` backstop and the module's idempotency key
   (`introId + ':fu72'`) are built for. A conflict (row already exists)
   returns no id: the host reads the existing row back instead. Either
   way it then calls `markWritten(id, side, outboxId)` and verifies with
   a read-back `select key, text, deliver_at` → `markReadBack(...)`:
   key, text and deliver_at must match the plan or the plan lands in
   `failed_named` with the differing field on the record.
4. **Close the product record.** Once both sides are written, the host
   stamps the intro's own check-in via
   `connector_followup_for(:introId, 'checkin', :now)` (service role).
5. **Deliver (existing machinery, unmodified).** The row sits `queued`
   with `deliver_at` = the side's fire time — already reached, or minutes
   out for a quiet-hours-shifted side — and `career_outbox_claim` takes
   it from there: contact join (a person who texted STOP lands
   `skipped_opt_out`, never sent), provider send, `delivered` with
   `delivered_at` + `provider_id`, run recorded in
   `channel_delivery_runs`.

State mapping, module → schema: `scheduled` = plan only, no row · `due` =
fire time reached, consent re-check passed, payloads issuable · `written`
= outbox row exists per side · `read_back_verified` = row read back equal
on key/text/deliver_at · `failed_named` = refusal/failure with the reason
(or the mismatching field) on the plan · `cancelled_on_revoke` = consent
gone before fire; no row was ever written.

## Revocation, honestly, at each stage

- **Before fire** (plan `scheduled`/`due`): the host hears the 157 revoke
  event and calls `applyRevoke` — the plan cancels whole (the message
  names both people; one side's no silences it for both) and nothing was
  ever written to retract. If the event is missed, the fire-time consent
  re-check in step 3 cancels instead of sending. Two independent stops.
- **After write, before claim** (plan `written`, row still `queued`):
  `applyRevoke` deliberately refuses here — the module's contract is
  pre-fire cancellation. Retraction at this stage is the host's assembly
  duty, named so it is not lost: on a revoke, delete the still-`queued`
  row for `(user_id, key)` in the same transaction.
- **After claim** (`sending`/`delivered`): the follow-up cannot be
  recalled. Stated plainly; no design here pretends otherwise.

## Why this does not inherit the alerts scheduler's FAILED state

The alerts scheduler currently sits FAILED with
`reminder_storage_unavailable`. That failure lives in the *generation*
path — the proactive/alerts machinery (`career_alert_prefs`,
`career_proactive_runs`, the module 151/56 scheduler family) that reads
reminder storage and generates `alert`/`report` rows on a cadence. The
follow-up path:

- never reads reminder storage, never starts a proactive run, and writes
  no `career_proactive_runs` row — its trigger is an **event** (an intro
  was delivered) plus a timestamp comparison in the evaluator, not a
  cadence scan of reminder state;
- delivers through a **different subsystem** — `career_outbox` +
  `career_outbox_claim` + `channel_delivery_runs` — whose inputs are the
  outbox rows themselves, not the scheduler's storage;
- keeps the obligation in the connector host's own snapshot carriage, so
  no scheduler outage of any kind can erase a pending follow-up: when
  the evaluator next runs, due plans fire;
- fails visibly if delivery ever does stall: the plan sits in `written`
  and `channel_delivery_runs` shows the stop — the opposite of a
  generation failure upstream that produces nothing and says nothing.

## Assembly checklist (integration lane)

1. Bundle/host wiring where 156–159 land (bundler names list, host ctx,
   the 142 seam) — deps: `composeFollowUp` = 159's export;
   `isConsented` = per-person adapter over 157's
   `isConsented(state, 'contacted')`.
2. Register module 161 in the generated mutation-coverage report
   (`node scripts/build-mutation-report.cjs`) — the module-158 lesson:
   an unclassified new module adds mutation-report failures.
3. Persist the machine snapshot with the connector records; restore on
   host start (guard FU72-011: a restored terminal plan never re-fires).
4. Per-side time zones come from the user profile; absent or invalid, the
   module's named warning stands and that side fires at the due time —
   do not substitute a default zone at the host layer.
5. Registry/capability registration for 161, same as its sibling
   packages — integration lane's step, not this package's.

## What I need from you

Nothing.
