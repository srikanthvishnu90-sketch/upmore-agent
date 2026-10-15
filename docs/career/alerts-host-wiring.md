# Alerts host wiring — design note (Crew B Cycle 2, W4; audit item 2)

Status: DESIGN + host-tier build. Nothing here is deployed. Module 151
(watch) and module 152 (assign) are complete and deliberately host-free:
151 emits alert records to an injected sink; 152 holds per-user watch
profiles, a reminder queue, and seat history in an injected `{get,set}`
store and expects the host to run 151's cycle, then `runAssignCycle`,
then drain the queue through its channel. This note is that host, and
`scripts/career/alerts-host.mjs` is its host-tier implementation.

Reminder shape baseline: PD-1 has landed — a reminder
(`career_job_reminder`, 152 `composeReminder`) carries `deadline`
(quoted verbatim from the posting's own text, `null` when unstated,
never invented) and `fit.lines` including the MI-028 match-basis lines,
so a delivered reminder always states *why* it matched. Everything
below preserves those two fields end to end; the tier-2 proof asserts
both survive delivery.

## 1. Durable per-user store

**Contract.** 121's KV contract, exactly as 151/152 consume it:
`{ get(key) -> value|null, set(key, value) }`, sync or async, plain
JSON values. Keys are exactly the ones 152 defines — the host invents
no key of its own for 152's data:

| key | owner | content |
|---|---|---|
| `career:watch-profile:<user_id>` | 152 `PROFILE_KEY` | the user's `career_watch_profile` |
| `career:reminder-queue:<user_id>` | 152 `QUEUE_KEY` | FIFO reminder queue (drain = exactly-once pull) |
| `career:reminder-history:<user_id>` | 152 `HISTORY_KEY` | per-user seat-suppression history (14-day window) |
| `career:jobs:snapshot:board:<source>:<token>:<user_id>` | host (151 scheme + user suffix) | per-board 121 snapshot for this user |
| `career:delivery-ledger:<user_id>` | host (this wiring) | delivered `reminder_id`s — the delivery exactly-once ledger |

The snapshot key needs care. `docs/career/alert-watch.md`'s host spec
says "one snapshot key per user", but 151's scale wave (BUG-091)
proved a *shared* snapshot + subset polling corrupts the seen-set:
unpolled boards' ids fall out and re-fire as new. The scheduler below
polls starred and non-starred subsets on different cadences, so the
host uses 151's own per-board key (`boardSnapshotKey`) with a
`:<user_id>` suffix — per user **and** per board. That is the only
reading under which both documents are true.

**Deployed choice: Supabase-backed.** The product's host state is
Supabase (project `mrwngntwmnaqrqhupvlt`): the chat handler already
persists per-thread career state as JSON in
`agent_flow_state.state.career`. The watch store is per-*user*, not
per-thread, so it does not belong inside a thread row. The durable
adapter (`createSupabaseStore` in `alerts-host.mjs`) targets one
generic KV table behind the same `{get,set}` interface:

```sql
-- PROPOSED — not applied by this lane (migrations are owner/coordinator work)
create table public.career_watch_kv (
  user_id uuid not null references auth.users(id) on delete cascade,
  key     text not null,
  value   jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
-- RLS: service_role only (the scheduler/host writes; no client reads in v1)
```

Until that table exists the Supabase adapter honestly reports
`NOT_WIRED` (it refuses to construct without an injected PostgREST
client, and its status object names the missing migration). The
adapter was wired against the table in MI-032 step 2 (Crew A,
branch `work/crewa-mi032-host`): the migration file now exists at
`supabase/migrations/20261015020000_career_watch_kv.sql` (owner-run,
NOT applied), `probeSupabaseStore()` resolves WIRED / NOT_WIRED
against a live-shaped client, and any operation against a database
where the table is absent fails `NOT_WIRED` naming the table and
the pending migration — never a raw PostgREST error, never a fake
write. The
host-tier proof uses the file-backed adapter
(`createFileStore(path)`: one JSON file, whole-map read/write, the
same pattern as `alert-watch-runner.mjs`) — durable across processes
on one host, sufficient to prove the seam, **not** the production
store.

## 2. Scheduler step

One invocation = one pass over every active watch profile. "Active"
= a `career:watch-profile:<user_id>` record exists and
`opt_out.global` is not true (152 re-checks opt-out per candidate
regardless; an opted-out profile is skipped here only to save polls).

```
for each userId with a watch profile:
  runUserAlertCycle(userId, { store, fetch, feeds, now }):
    1. load watch profile (152 loadWatchProfile); scoring profile =
       profile.scoring_profile (the 121 scoreFit shape)
    2. split feeds: starred (company in scoring preferences'
       starred_companies) vs the rest
    3. 151 runWatchCycle per feed (per-board snapshot key above),
       sink collects alert records. Two cadence classes per
       alert-watch.md / 121 POLL_MINUTES: starred every 15 min,
       others every 60. One invocation runs the subset its tick
       selects (deps.cadence = "starred" | "default" | "all");
       "all" is the host-tier/proof mode.
    4. presentJobIds = union of the user's per-board snapshot job_ids
       (152's seat rule needs presence to tell a repost from a
       seat-count change)
    5. 152 runAssignCycle({ alerts, watchProfile, store, now,
       presentJobIds }) — matches, suppresses, enqueues
    6. drain: 152 createReminderQueue(store, userId).drain() then
       deliverReminder() per record (see §3)
  returns a typed per-user summary { alerts, reminders_queued,
  delivered, suppressed, errors }
```

Cadence is the scheduler's (cron / systemd timer / edge scheduled
trigger — owner's choice, as `alert-watch.md` already rules). The
step itself is idempotent: re-running it delivers nothing twice
(§3), so an overlapping or retried tick is safe.

## 3. Delivery channel — what "received" means per tier

`deliverReminder(reminder, deps)` in `alerts-host.mjs` produces the
delivered record:

```
{ type: "career_job_reminder_delivered", reminder_id, user_id,
  delivered_at, channel, speak_line, deadline, fit_lines,
  company, title, url }
```

`speak_line` is 152's own `speakLine(reminder)` — the one-sentence
form carrying role, company (or honestly not-stated), the first fit
line, the deadline in the posting's own words, and the apply link.
`deadline` and `fit_lines` ride the record verbatim from the reminder
(PD-1 shape preserved, asserted by the tier-2 proof).

**Exactly-once.** Two independent guards, either sufficient:
(a) 152's queue contract — `drain()` removes exactly the records it
returns, and `enqueue` refuses a duplicate `reminder_id`; (b) the
host delivery ledger (`career:delivery-ledger:<user_id>`) —
`deliverReminder` checks the ledger *before* delivering and appends
the `reminder_id` as part of the same delivery step, so a crash
between drain and channel send can re-present a record to
`deliverReminder` but can never produce a second delivered record.
The tier-2 proof runs the whole cycle twice: second run delivers 0.

**Tiers of "received":**

| tier | channel | "received" means |
|---|---|---|
| host-tier proof (built here) | `channel: "host_record"` — the delivered record appended to a JSONL delivered-log + returned | the record exists in the log with its `reminder_id` in the ledger; read-back verifies it |
| product, data-only (tier-1 attempt) | a row the deployed product already reads (see §5) | read-back from the product DB returns the record |
| product, deployed (not built) | the user's next chat surface: the delivered record lands in the user's product state and the chat layer speaks `speak_line` | the user sees the reminder text in the product — requires the deploy steps in §5 |

No email, push, or any send to any person is part of this wiring.
Delivery is to the user's own product state only.

## 4. The two router intents (chat)

Delivered as a patch against `packages/domain/142-career-router.js`
(`/tmp/crewb2-w4-intents-142.patch`, coordinator integrates) plus
`tests/career-alert-intents.test.cjs`. The intents:

1. **create-watch** — "watch for investment banking analyst roles in
   Chicago", "alert me when a software engineering intern role posts",
   "set up a watch for …". Parses the role against 152's
   `roleSpecFor` (curated splits first, derived taxonomy spec
   otherwise), locations and remote from the ask, bands defaulting to
   `intern`/`new_grad` when the ask names them and unfiltered
   otherwise; builds the interest through 152's
   `createWatchProfile`/`upsertInterest` and persists it. Reply names
   the role, locations, and cadence truthfully (starred 15 / default
   60 once the host scheduler runs; the watch is *recorded* in chat,
   the polling is the host's).
2. **list/manage-watches** — "what am I watching?", "show my
   watches", "stop watching X", "pause my job alerts". Lists the
   profile's interests from the store; stop removes the named
   interest (`removeInterest`); pause sets `opt_out.global`
   (`setOptOut`); resume clears it. All mutations persist through the
   same store the host cycle reads, so a chat change binds the next
   scheduler tick.

**The store-access truth, plainly:** 142 today has *no* per-user KV
access. Its durable state is thread state — `ctx.trackStore` and the
other snapshot-whitelisted ctx keys that `career_host.js`
(`STATE_KEYS`) persists per thread in `agent_flow_state`. The patch
therefore introduces `watchStoreOf(ctx)`, a **sync** `{get,set}`
adapter (142 is a pure/sync module; 152's store contract allows sync)
with this precedence:

1. `ctx.alertStore` — a host-injected sync KV, if a future host
   supplies one (the deployed scheduler's Supabase store is async and
   belongs to the host tier, not the chat turn);
2. `ctx.alertWatchState` — a plain JSON object carried on ctx,
   created lazily on first write. **This only becomes durable when
   the host adds `"alertWatchState"` to `career_host.js`'s
   `STATE_KEYS`** (a one-line host change, named in §5). DONE in
   MI-032 step 2 (Crew A, branch `work/crewa-mi032-host`): the key
   is whitelisted, and tests/career-alerts-host-wiring.test.cjs
   proves a watch created through the host seam in one thread is
   listed from a fresh thread restored from the snapshot. (The
   deployed function picks the change up at the step-5 deploy.)

The watch profile is keyed by `ctx.userId` (the handler sets it from
the authenticated user; the `"user-1"` fallback matches 142's
existing convention for harness turns). Because the profile record
itself is user-scoped (`career:watch-profile:<user_id>`), threads are
views onto one per-user record, never separate profiles.

## 5. Deploy vs data-only

**Data-only (no deploy):**
- Seeding/inspecting a watch profile, queue, or history in any store
  implementing the KV contract (file store today; the KV table once
  it exists).
- The tier-1 probe: reading the test user's existing product rows.

**Needs a deploy (none done by this lane):**
1. Coordinator integrates the 142 patch + rebuilds the router bundle
   (`python3 scripts/build-router-core.py`) — 151/152 join the bundle
   only if the coordinator chooses; the intents degrade honestly
   (step aside) when 152 is absent from the bundle.
2. Host: add `"alertWatchState"` to `career_host.js` `STATE_KEYS`
   (or inject a sync `ctx.alertStore`) so chat-created watches persist
   across threads in the deployed product. **DONE — MI-032 step 2
   (Crew A, branch `work/crewa-mi032-host`), with the Supabase adapter
   wired and the tier-2 E2E green (14/14); rides the step-5 deploy.**
3. Migration: create `public.career_watch_kv` (§1) — owner-run.
   The SQL file is written (`supabase/migrations/20261015020000_career_watch_kv.sql`,
   additive only); the owner runs it.
4. Host: run the scheduler (`alerts-host.mjs`'s `runUserAlertCycle`
   per user on the 15/60 cadence) as a deployed cron/edge trigger
   with the Supabase store — this is the step that turns recorded
   watches into delivered reminders in the real product.
5. Deploy the `agent-chat` edge function with the rebuilt bundle.

Until 3–5 land, a watch created in the live chat does not poll and a
reminder cannot reach a real user's product state — the tier-1
attempt (§ "Proof" in the W4 report) stops exactly at that doorstep.
Step 2 also surfaced BUG-232 / FR-390: a chat-created watch's stored
record stated no gate leg and no skill citations, so the cycle could
never alert it — the host now bridges the gate's watched occupations
from the record's interests (`watchCycleProfile` in alerts-host.mjs)
and 142's scoringProfile carries fact_id + evidence through.
