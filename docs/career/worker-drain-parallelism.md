# Worker drain parallelism — Throughput Fix Package A (serial drain)

Lane: Throughput Fix Package A, branch `muse/2026-10-21-worker-drain`
(owner parallel-packages directive, 2026-10-21; benchmark: 50
applications prepared + approved in ONE batch, submitted within
30 minutes). This package changes NO worker/board/executor code and
NO live systemd unit. It pins the drain as deployed, measures the
parallel shape with a simulator, stages the unit/config diffs, and
specs the one worker-code change the benchmark actually needs.

**STAGED, NOT APPLIED.** The staged units in
`tools/drain-simulator/staged-units/` apply only after the
throughput measurement lane's live-host baseline lands (its drive
timings replace this note's stated service-time distribution), and
only together with the activation gates in §5.

## 1. The drain as deployed — three serial layers

**Trigger.** `upmore-career-executor.timer` (live, read from the
host): `OnBootSec=30s`, `OnUnitActiveSec=60s` → starts
`upmore-career-executor.service`, `Type=oneshot`,
`ExecStart=node workers/career-browser/batch-executor.cjs
/home/hatch/worker-config/executor-config.cjs`. One process per
drain; it runs `runBatchPending()` once, prints
`{"batchExecutor":"drained",...}`, exits
(`workers/career-browser/batch-executor.cjs:255-258`; flip record:
`docs/gauntlet/worker-flip-2026-10-20.md`).

**Layer 1 — intents are claimed and executed strictly serially.**
`runBatchPending()` (`batch-executor.cjs:151-190`) snapshots the
queue once — `store.pending()` → `career_batch_pending_v1()`, which
returns at most **LIMIT 50** queued intents across ALL users,
oldest first (`supabase/migrations/20261016010000_career_batch_intents_v1.sql:109-111`)
— then a plain `for (const intent of intents)` loop (:154) awaits
claim → execute → finish per intent. No concurrency primitive
exists in the process. Per intent the writes are: claim
(`career_batch_claim_v1` — per-user advisory lock + `FOR UPDATE`,
sets `state='claimed'`, mints a lease token, extends expiry
+60 min, :112-121), for approve intents a run read
(`career_batch_result_v1`), then `career_batch_save_run_v1` +
`career_batch_save_ledger_v1`, then `career_batch_finish_v1`
(lease-checked, :123-130). Claim-once is real: a second drain's
claim raises, and the executor's store translates exactly those
refusals to a null claim recorded as `skipped_claimed`
(`batch-executor.cjs`, `createBatchRpcStore.claim`) — the code
already anticipates "claimed by another drain". Intents committed
after the snapshot wait for the next drain; a queue deeper than 50
intents takes multiple drains.

**Layer 2 — inside one batch, applications drive strictly
serially.** Module 155's `executeRun` loops
`for (const key of run.selected)` (`packages/domain/155-career-batch-apply.js:352`)
— session create, `Portal.runApply` (the fill drive),
`Portal.submitDoorstep`, one application at a time.
`prepareRun` has the same shape (:220, `for (const posting of
chosen)`) — preparing a 50-posting batch is ~50 serial doorstep
drives before the card even exists. The executor calls both
synchronously (batch-executor.cjs `executeApprove`/`executePrepare`).

**Layer 3 — the board service serializes every drive call
globally.** This is the deepest layer and the one executor
parallelism alone cannot fix. `board-service.cjs:16-19`: "The
drive stack is synchronous at every layer (155, 149, and 150's own
helper bridge, which waits on files with Atomics.wait), so this
core is synchronous too." The HTTP adapter
(`board-service.cjs:239-262`) calls the synchronous `handle()`
inline per request — while one call (open/fill/submit, each
blocking on `Atomics.wait` for the browser helper) executes, the
service's event loop is blocked and no second session's call is
even read. Sessions themselves are cheap and concurrent-safe (a
Map, per-user cap 32 — `board-service.cjs:63,95,135-138`), but
exactly one drive call is in flight per board-service process.
Every production drive today crosses the ONE board service on
:8471 (`/home/hatch/worker-config/executor-config.cjs`:
`WORKER_BOARD_URL`, one binding for all users).

**Timer overrun semantics.** systemd never runs two instances of
the same oneshot unit: a tick that elapses mid-drain does not
start a second executor and is not queued — the effective period
stretches to the drain's own duration. The DB queue
(`state='queued'`) is the real backlog, and claim leases (60 min)
mean a long drain's intents are never double-served meanwhile.
Worst case for a freshly approved batch: it just missed a snapshot
→ waits the remainder of the current drain + up to 60 s for the
next tick, THEN executes serially.

**Ceiling, stated plainly.** One batch of 50 applications submits
at one drive at a time, through one board service, inside one
drain. At any plausible per-application drive time (30–90 s), the
submit leg alone takes 25–75 minutes. The serial drain misses the
30-minute benchmark by construction, not by tuning.

## 2. Simulator — method and results

`tools/drain-simulator/simulate-drain.cjs` (zero dependencies,
seeded mulberry32, discrete-event; 300 trials per cell; run it:
`node tools/drain-simulator/simulate-drain.cjs`).

- **Service time (STATED, not measured):** per application drive
  triangular(20 s, mode 45 s, max 120 s), mean 61.7 s, + 0.5 s/job
  claim/finish overhead. The throughput lane's live drive timings
  (its baseline doc, `throughput/BASELINE.md` on
  `muse/2026-10-21-throughput`: idle drain ≈ 2 s; drive timings
  pending) replace this distribution when they land; the
  sensitivity table below bounds the conclusion meanwhile.
- **Contention models:** `ideal` (workers never slow each other)
  and `ps2` — processor sharing on C = 2 cores. This host measures
  `nproc` = 2, 8 GB RAM (read live this session); Chromium drives
  are CPU-heavy, so ps2 is the planning model past N = 2. Reality
  sits between the two (drives carry network/page-wait time that
  oversubscription can hide).

### Scenario A — 50 application-jobs (the benchmark batch)

| Model | Workers | Mean drain of 50 | p50 | p95 | Apps/min | Speedup |
|---|---|---|---|---|---|---|
| ideal | 1 (today) | 3,105.7 s (51.8 min) | 3,110.4 s | 3,351.0 s | 0.97 | 1.00x |
| ideal | 2 | 1,564.6 s (26.1 min) | 1,563.1 s | 1,689.7 s | 1.92 | 1.98x |
| ideal | 4 | 804.3 s (13.4 min) | 803.5 s | 875.6 s | 3.73 | 3.86x |
| ideal | 8 | 429.0 s (7.2 min) | 427.9 s | 467.8 s | 6.99 | 7.24x |
| ps2 | 1 (today) | 3,124.0 s (52.1 min) | 3,114.6 s | 3,382.4 s | 0.96 | 0.99x |
| ps2 | 2 | 1,575.4 s (26.3 min) | 1,570.8 s | 1,713.8 s | 1.90 | 1.97x |
| ps2 | 4 | 1,560.9 s (26.0 min) | 1,561.4 s | 1,675.2 s | 1.92 | 1.99x |
| ps2 | 8 | 1,562.4 s (26.0 min) | 1,563.3 s | 1,686.0 s | 1.92 | 1.99x |

### Scenario B — 50 intent-jobs (multi-user queue, 10 applications each = 500)

Same shape at intent granularity: serial 31,110 s (518 min);
ideal N=2/4/8 → 261 / 134 / 70 min; ps2 saturates at N=2 →
~260 min (1.99x). Cross-intent parallelism on this host is worth
~2x of queue throughput and no more.

### Sensitivity — Scenario A at fixed per-application service times

| Fixed | Model | N=1 | N=4 |
|---|---|---|---|
| 30 s | ideal | 25.4 min | 6.6 min |
| 30 s | ps2 | 25.4 min | 12.7 min |
| 60 s | ideal | 50.4 min | 13.1 min |
| 60 s | ps2 | 50.4 min | 25.2 min |
| 90 s | ideal | 75.4 min | 19.6 min |
| 90 s | ps2 | 75.4 min | 37.7 min (misses) |

**Reading.** (a) Today's serial drain beats 30 minutes only if
the true mean drive is under ~35 s/application. (b) Two parallel
drive chains beat the benchmark at the stated distribution under
BOTH models (26.1–26.3 min) — but the ps2 margin is thin, and at a
90 s true mean even N=4/ps2 misses: the live drive-time baseline
decides whether K=2 on this host suffices or the benchmark needs
a bigger host. (c) Past N=2, this host's CPU is the wall — more
workers on this VM buy nothing under ps2.

## 3. The staged fix (units/config only — in `tools/drain-simulator/staged-units/`)

Pairs of instances, because Layer 3 makes executor-only fan-out
useless: each executor instance is pinned to its OWN board-service
instance (its own port, its own in-process session Map; sessions
never cross instances because an executor only ever addresses the
service that vended them).

| File | Change vs live |
|---|---|
| `upmore-career-board@.service` | NEW template. Same env/proxy/sandbox block as the live board unit; per-instance operator config `board-config-%i.cjs` (port 8480+%i, same shared secret, same familyVerdicts — operator creates these at activation; they hold the secret, so they are never committed). |
| `upmore-career-executor@.service` | NEW template. Same oneshot shape; `WORKER_BOARD_URL=http://127.0.0.1:848%i` (Environment= overrides the shared EnvironmentFile value, which keeps pointing at the legacy :8471 for the pre-activation world); per-instance `executor-config-%i.cjs`. |
| `upmore-career-executors.target` | NEW. One tick fans out to executor@1 + executor@2 (K=2, the ps2 saturation point). |
| `upmore-career-executor.timer` | REPLACEMENT at activation: identical cadence; `Unit=` now names the target instead of the single service. |

**Before/after (simulator, Scenario A, stated distribution):**
serial 51.8 min / 0.97 apps/min → K=2 paired instances 26.1 min
ideal / 26.3 min ps2, 1.90–1.92 apps/min — IF the work arrives as
≥2 claimable units. Which is the catch:

## 4. What units alone cannot do — the code-change spec (handoff, not code)

K instances drain K *intents* concurrently. The benchmark's batch
is ONE intent. Two worker-code changes are therefore the real
benchmark fix; both are specced here for the worker-code owner
(Claude's lane) — this package deliberately writes no worker code.

**S-1 — shard the batch execution (the benchmark mover).**
- On approval, commit K approve intents instead of one: same
  `run_id`, same `card_sha256`, plus a binding field `keys: [...]`
  partitioning `run.selected` into K disjoint shards (shard size
  ~10 → K=5 for a 50-batch; shard count capped by live instance
  count). Prepare shards the same way (`prepareRun`'s loop,
  155:220) so the prepare leg parallelizes too; the card composes
  from the union of shard doorstep sets at readback, and approval
  waits for all prepare shards.
- `batch-executor.cjs executeApprove/executePrepare`: pass
  `binding.keys` through; module 155's `executeRun`/`prepareRun`
  gain an optional key filter over the loops at :352/:220.
- Run-record writes must not race: `career_batch_save_run_v1`
  upserts the WHOLE run record, so shards write per-shard records
  (run_id suffix `-shard<i>` — matches the RPC's run-id regex
  `^batch-[A-Za-z0-9-]{4,96}$`; `#` does not) and the readback path
  (`career_batch_result_v1` consumers, incl. batch-status) merges
  shard records of one run: app sets are disjoint by key, summaries
  sum, run status = completed iff every shard completed.
- Approval integrity: each shard's binding carries the FULL card
  hash + its key subset; 155's approval verification must check
  subset ⊆ approved set, so a shard can never execute a posting
  the card did not cover. 149's click-time payload-hash and cap
  re-verification (MI-116/MI-110) are per-application and unchanged.
- Failure posture unchanged per shard: claim-once, a crashed shard
  finishes UNCERTAIN and is never re-driven (MI-115); sibling
  shards' submissions stand — each was individually on the
  approved card.

**S-2 — fence the per-user cap ledger (lands before or with
S-1; also gates the staged units).** `executePrepare`/
`executeApprove` both do `ledgerFor(userId)` at build time and
`saveLedger(userId, records)` at the end, and
`career_batch_save_ledger_v1` REPLACES the user's whole records
array. Two drains executing two intents of the SAME user
concurrently (two batches in flight — possible the moment K>1 or
shards exist) can silently drop each other's cap-ledger records:
last writer wins, the cap count understates, a later batch can
over-submit past the daily/company caps. Fix (either shape;
recommend the first — smaller blast radius, no connection pinning
in a oneshot process): (i) `career_batch_save_ledger_v1` merges by
record id (union, never replace) inside its existing per-user
advisory lock, and the executor sends only records it appended or
mutated since its read; or (ii) claim/finish hold a session-level
per-user advisory lock for the execution's duration. Until S-2
lands, K>1 instances must not be enabled for queues where one user
can hold two intents — i.e., not in production at all.

**S-3 — considered and rejected:** an in-process worker pool in
`batch-executor.cjs`. The drive stack is synchronous by design
(155/149/150 + `Atomics.wait` helper bridge); threads would need
the sync transport per thread and still hit Layer 3 unless the
board service is also split — at which point separate processes
(the staged units) are the same architecture with systemd as the
supervisor and zero new code.

## 5. Activation gates and sequence

1. Throughput lane's live-host baseline lands (real per-drive
   timings + per-session CPU/RSS). If the true mean drive is
   ≥ ~85 s, K=2 on this host does NOT beat 30 min under ps2 —
   escalate host size instead of raising K blindly.
2. S-2 lands (ledger fencing) — hard gate for any K>1.
3. S-1 lands (sharding) — the benchmark's one-batch shape.
4. Operator creates `board-config-1/2.cjs` +
   `executor-config-1/2.cjs` under `/home/hatch/worker-config/`
   (mode 600, secret never in the repo), installs the staged
   units, retires the single executor service + :8471 board
   service (or keeps :8471 as instance 1 by pointing
   executor@1 at it — the staged ports 8481/8482 keep the two
   worlds unambiguous; choose at activation), `daemon-reload`,
   re-runs the flip record's gate probes per instance
   (401/401/403/403) + one empty drain per instance.
5. First live parallel drain is observed end to end before the
   configuration is called standing (the v248 discipline: staged
   is not live).

## 6. Before/after summary

| | Today (measured pin + simulator) | After staged units + S-1/S-2 |
|---|---|---|
| Concurrent drive calls | 1 (one drain × one run loop × one board service) | K=2 chains end to end |
| 50-app batch submit leg | 51.8 min mean (stated dist.) | 26.1 min ideal / 26.3 min ps2 |
| Apps/min | 0.97 | 1.90–1.92 |
| 500-app multi-user queue | 518 min | ~260 min (ps2 ceiling) |
| Binding constraint after fix | — | host CPU (2 vCPU); then board-service count = instance count |
