# Intro delivery — integration note (Lane B, O2)

Package: `packages/domain/163-career-connector-intro-delivery.js` on branch
`muse/2026-10-21-intro-delivery`. Guards: `tests/career-connector-intro-delivery.test.cjs`
— **15 pass / 0 fail** (fail-first recorded @ `8b261af7`: suite red on base
`cea914fe`, module absent).

Outcome trace: **O2** — felt the moment both people actually RECEIVE the warm
intro. Module 158 emits `intro_unlocked`; module 163 turns that event into a
delivery plan on the in-product inbox and tracks it to proven receipt or a
named failure. Nothing in this package deploys, writes live, or sends.

## Decisions stated up front

- **Composition is 159's, injected.** 163 takes `deps.composeIntro`. The guard
  suite injects a byte-faithful vendored copy of 159 @ `29a67280`
  (`tests/fixtures/159-career-connector-intro.fixture.js`, sha256
  `8688472aa5b68244f2d0e91dee2b25c4680d255e288424a89b7a777f4e64069f`, verified
  by diff against the intro branch). The assembly lane injects the real 159 —
  identical export surface (`composeIntro` / `composeFollowUp`).
- **Consent is 157's, injected, re-read at delivery time.**
  `deps.isConsented(personId, scope)`; 163 asks for scope `introduced` on
  both sides during `plan()`. The suite wires the real 157 fixture
  (sha256 `2892aab776b3add0226da644c6df9ce50ccb79c7617102eccfef5d15e5b19d1d`).
- **Primary surface = in-product inbox** (`career_outbox`, below). Channel
  delivery is specified at the end of this note only — real channels stay
  closed to real users under the standing rule.

## The live tables (closure, applied to prod 2026-10-21 — sources read-only)

| Table | Source migration | Role for intro delivery |
|---|---|---|
| `career_outbox` | `20261019010001_career_alerts.sql` (base) + `20261019020000_channel_delivery.sql` (delivery columns) | THE inbox/outbox row store. One row per side per purpose. |
| `channel_contacts` | `20261019020000_channel_delivery.sql`, `thread_id` added by `20261019030000_channel_inbound.sql` | A person's texting contact + STOP/opt-out state. Only relevant to the channel copy (specified, not built). |
| `channel_delivery_runs` | `20261019020000_channel_delivery.sql` | One row per channel delivery run (delivered/failed/retried/skipped/capped counts) — a silent stop is visible. |
| `channel_inbound` | `20261019030000_channel_inbound.sql` | Provider message ids claimed before any inbound turn runs (id only, no content). Replies only; not on the intro path. |

### `career_outbox` — final live shape (all migrations applied, in order)

```
id           bigserial primary key
user_id      uuid not null references auth.users(id) on delete cascade
key          text not null  -- regex + kind list below
kind         text not null
text         text not null check (length(text) between 1 and 4000)
deliver_at   timestamptz not null
created_at   timestamptz not null default now()
delivered_at timestamptz
status       text not null default 'queued'
             check (status in ('queued','sending','delivered','failed','skipped_opt_out')
                    and attempts between 0 and 10
                    and (status <> 'delivered' or delivered_at is not null)
                    and (provider_id is null or length(provider_id) <= 200)
                    and (error is null or length(error) <= 500))
attempts     int not null default 0
retry_at     timestamptz
claimed_at   timestamptz
contact      text           -- set by the channel claim, not by the writer
provider_id  text
error        text
constraint career_outbox_once unique (user_id, key)   -- at most one row per person+key, ever
```

Final kind/key vocabulary after the closure's monotonic widening
(last step `20261021075000_career_apply_ops.sql`):

```
kind in ('alert','report','reply','receipt','card','status','followup','mock','brief','digest','link','questions')
key  ~  '^(alert|report|reply|receipt|card|status|followup|mock|brief|digest|link|questions):.+$' and length(key) <= 310
```

**There is no `intro` kind in the live schema.** 163 therefore rides kinds
that exist today — `status` for the intro, `followup` for the 72h follow-up.
An optional future migration widening kind/key with `intro`
(key `intro:<proposalId>:<side>`) is polish for query clarity, **not** a
blocker; do not gate assembly on it.

Access: RLS on; `grant select` to `authenticated` with policy
`career_outbox_own` (`user_id = auth.uid()`) — a person can read their own
rows, which is what makes the inbox *theirs*. **All writes are service-role**
(no insert/update grant to `authenticated` anywhere in the chain).

## Write shapes the assembly lane wires

`plan()` output `delivery.rows[]` maps 1:1 to inserts. Per unlock
(`proposalId = P`), four rows (two when 159 could not schedule a follow-up —
then `follow_up` is null and only the intro rows exist):

```sql
-- intro, side a  (side b identical with user_id = B, key suffix ':b')
insert into public.career_outbox (user_id, key, kind, text, deliver_at)
values ($A_UUID, 'status:intro:' || $P || ':a', 'status', $COMPOSED_TEXT, $INTRO_AT)
returning id;   -- -> markWritten(delivery_id, { 'status:intro:P:a': id, ... })

-- follow-up, side a (deliver_at = intro_at + 72h exactly, from 159's record)
insert into public.career_outbox (user_id, key, kind, text, deliver_at)
values ($A_UUID, 'followup:intro:' || $P || ':a', 'followup', $FOLLOWUP_TEXT, $INTRO_AT + interval '72 hours')
returning id;
```

Rules for the write executor:

1. **Insert all rows, then report all ids at once** to `markWritten(id,
   rowIdsByKey)`. Both intro ids are required; a partial report is refused
   (`INCOMPLETE_WRITE_REPORT`) and the record stays `planned`.
2. **Idempotency is the unique constraint's job too.** A replayed insert hits
   `career_outbox_once` — treat the conflict as "already written": select
   the existing row's id and report that, never insert a variant key.
   (163's own plan-level idempotency on `proposalId` is the first line; the
   constraint is the second.)
3. **Read-back = receipt.** After writing, read both intro rows back and
   hand the texts to `markReadBack(id, { aText, bText })`:
   `select text from public.career_outbox where user_id = $UUID and key = $KEY`.
   Byte-equality with the planned text is the only path to
   `read_back_verified`; a mismatch lands in `failed_named` with reason
   `READBACK_MISMATCH` and the side named. The same rows are what the
   recipient sees in-product under `career_outbox_own` — the read-back the
   host performs is the same read the user gets.
4. **Any write-layer failure** (insert error, missing row on read-back) goes
   to `markFailed(id, NAME)` with a stable named error
   (e.g. `OUTBOX_INSERT_CONFLICT`, `OUTBOX_ROW_MISSING_ON_READBACK`) — the
   record must never sit in `planned`/`written` unexplained.
5. **Refusals need no writes.** When `plan()` returns `ok:false` with a
   `delivery` attached (states `refused`: `CONSENT_NOT_HELD_AT_DELIVERY`,
   `EVENT_PROFILE_MISMATCH`, `COMPOSER_REFUSED`), the record itself is the
   audit trail; the host persists the 163 snapshot exactly as it persists
   158's, and writes zero outbox rows.

Delivery-record persistence: 163 is snapshot-based like 158 —
`snapshot()` / restore via `createIntroDelivery(deps, snapshotJson)`. Where
the snapshot lives (profile carriage vs a host store) is the assembly lane's
existing decision for 158; keep 163's snapshot beside it.

## Call sequence (assembly lane)

```
for event of matchEngine.drainEvents():            // 158, type intro_unlocked
  r = delivery.plan({ event, a: profileA, b: profileB, reasoning, proposedTimes })
  if (!r.ok && !r.delivery) -> log code (NO_UNLOCK_EVENT / INVALID_UNLOCK_EVENT); continue
  if (r.delivery.state == 'refused') -> persist snapshot; continue   // recorded, zero rows
  ids = insertRows(r.delivery.rows)                // shapes above
  w = delivery.markWritten(r.delivery.id, ids)     // must be ok
  texts = readBackIntroRows(r.delivery)
  delivery.markReadBack(r.delivery.id, texts)      // verified, or failed_named with the side
  persist snapshot
```

Injection sites mirror the connector integration design note
(`docs/connector/integration-design.md`): bundle the 163 file alongside
156–159, construct the engine where 158's engine is constructed, with
`composeIntro` = real 159 and `isConsented` = an adapter over 157 state
(`(personId, scope) => Consent.isConsented(stateFor(personId), scope)`).

## Channel delivery — SPECIFIED ONLY, not built, not wired

The intro rows above are ordinary `career_outbox` rows, so the live channel
machinery already knows how to carry them — no new rows, no new tables:

- `career_outbox_claim(p_now, p_limit)` claims due rows
  (`deliver_at <= p_now`, status `queued`, or `failed` past `retry_at`) for
  users **with a `channel_contacts` row**, oldest first, `for update skip
  locked`, marking them `sending` with `claimed_at` + `contact`. Two
  overlapping runs never claim the same row; a row left `sending` by a dead
  run is failed, never resent (at-most-once).
- `career_outbox_claim_key(p_user, p_key, p_now)` is the single-key variant
  (the reply path's shape) if an intro ever needs immediate dispatch.
- Opt-outs: a contact with `opted_out = true` is never claimed for a send;
  final delivery outcomes land as `delivered` (+ `delivered_at`,
  `provider_id`) / `failed` (+ `error`, `retry_at` or final) /
  `skipped_opt_out`, and every run writes a `channel_delivery_runs` row.
- The 72h follow-up rows need nothing extra: their `deliver_at` is in the
  future, so the same claim picks them up when due.
- Inbound replies to an intro ride `channel_inbound` (provider id claimed
  first) and answer on `career_outbox` with key `reply:<message id>`, kind
  `reply` — the daily contact cap (`career_outbox_contacts_on`) covers them.

**Standing rule, unchanged:** Telegram/WhatsApp stay closed to real users
until per-user channel identity and payload-bound approvals exist. The
in-product inbox receipt above does not depend on any channel: a user with
no `channel_contacts` row gets the intro in-product, and no channel claim
ever fires for them.

## Assembly-lane debt this package leaves named

- Register module 163 in the mutation-coverage report (classify as covered,
  rerun `node scripts/build-mutation-report.cjs`) — same item the match lane
  flagged for 158; expect the same +fail signature in a full sweep until done.
- BUILD-STATUS claim line + `packages/capabilities/registry.json` entry for
  163 — not written here, per the established per-package pattern (gate and
  consent lanes did the same); the integration/assembly lane owns both.
- No deploy, no env vars, no live writes in this package.

## What I need from you

Nothing.
