# Job Radar — alerts scheduler root-cause note: `reminder_storage_unavailable`

Evidence: `scripts/career/alerts-host.mjs`,
`supabase/migrations/20261015020000_career_watch_kv.sql`, the host cycle
log `~/workspace/alerts-scheduler/logs/cycles.jsonl` (330 cycles),
live prod catalog reads (2026-10-21), and the systemd unit
`upmore-alerts-scheduler.{service,timer}` (q15min, gauntlet test user
only, launcher `scripts/career/alerts-scheduler-launch.py`).

## The failure, measured

15 of 330 logged cycles crashed with the error message "Reminder
storage could not be confirmed" — the message of the error coded
`reminder_storage_unavailable`, thrown at `alerts-host.mjs:141`.
Occurrences: 2026-10-17 ×3, 2026-10-19 ×1, 2026-10-20 ×8 (five of them
in one 90-minute evening cluster, 20:45–22:15Z), 2026-10-21 ×3 (last
at 14:02:45Z). Cycles since then (17:00Z, 17:45Z, 18:00Z) completed;
the one other recent crash (17:30Z) is a different failure — the VM
replacement window ("career_watch_kv probe failed: fetch failed").

## Root cause

The host's Supabase store fences every cycle with the account row's
`(version, epoch)` from `career_watch_kv`, captured once at the first
read and never refreshed — by design (alerts-host.mjs, `beginCycle` /
`currentFence`: refreshing mid-cycle could let a stale read overwrite
a concurrent turn). Every cycle ends in `career_watch_cycle_commit`
(alerts-host.mjs:378), and the commit RPC — like `career_watch_write`
and `career_reminder_enqueue` — **raises the exception `stale or
paused career worker`** when the live account `(version, epoch)` no
longer matches the fence (migration 20261015020000, lines 165 / 224 /
242). The same `career:account` row is written by the product's chat
path (the KV backs chat turn/account state as well as the watch
store), so **any chat turn or account write for the same user that
lands between the scheduler's first read and its commit invalidates
the fence**. PostgREST returns the raised exception as an RPC error,
and the host's `rpc()` wrapper (alerts-host.mjs:141) collapses ANY
RPC failure or error-shaped payload into the single opaque code
`reminder_storage_unavailable` — which is why the log names a storage
outage for what is actually an optimistic-concurrency conflict. The
only scheduler user today is the gauntlet test user, who is also the
chat probing user, so collisions are guaranteed under concurrent
testing; the evening cluster on 2026-10-20 coincides with heavy live
chat probing of that same account.

## Did the closure cure it? No — and it never touched the mechanism

Verified against prod after the closure (2026-10-21): all nine RPCs
the host needs (`career_watch_read/write`, `career_watch_cycle_commit`,
`career_reminder_enqueue/claim/ack/status/list`,
`career_reminder_allowed`) and both tables (`career_watch_kv`,
`career_reminder_outbox`) exist — and all of them come from migration
20261015020000, which predates the closure and was already live. The
closure's 21 files contain no change to the fence protocol or the
reminder RPCs (its only touch of this table is file 20's unrelated
BEFORE trigger `career_account_authority` on `career_watch_kv`). The
post-closure cycles passed because no concurrent write landed inside
their windows — the collision condition is unchanged and the failure
will recur the next time a cycle overlaps a chat write for the user.

## What a repair consists of (specified, NOT executed)

1. **Retry-on-stale, once, with a fresh fence** — in
   `createSupabaseStore`/`runUserAlertCycle`
   (`scripts/career/alerts-host.mjs`): when commit raises the
   stale-worker error, re-read to capture the current fence and replay
   the cycle's buffered writes (the `beginCycle` write Map makes a
   replay structural). Bounded to one retry; never retry when the
   account is `paused` (a pause must win).
2. **Stop collapsing the error** — the `rpc()` wrapper
   (alerts-host.mjs:141) must surface the underlying Postgres message
   under a distinct code (e.g. `reminder_storage_stale_fence`) so the
   cycle log is diagnosable; `reminder_storage_unavailable` should
   mean an actual unconfirmed store, nothing else.
3. **A fail-first regression test**: simulate a mid-cycle version bump
   on `career:account` and assert the cycle completes via the retry
   (and that a paused account still refuses).
4. Optional structural alternative (architect call, needs a
   migration): give the worker its own fence domain (a separate
   account-row key) so chat writes can never invalidate a scheduler
   cycle. Bigger blast radius; not required for the pilot.

Files touched by the repair: `scripts/career/alerts-host.mjs`
(wrapper ~L141, cycle commit ~L163–178, 378),
`scripts/career/alerts-scheduler.mjs` (cycle error reporting ~L153),
plus a new test under `tests/`. No schema change for items 1–3.
Effort: 0.5–1 day including the regression test.
