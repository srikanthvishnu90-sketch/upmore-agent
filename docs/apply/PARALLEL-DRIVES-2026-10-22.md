# PARALLEL DRIVES — serialization root cause + sharded board service (night plan chunk 70%, 2026-10-22)

## The measured problem

Concurrent drives for one user did not scale at all — worse, they were
fragile. Two facts, both measured on the live TEST worker host
(board service :8471, TEST profile only, prepare-only, zero submits):

1. **One board call in flight, globally.** A solo Figma Greenhouse
   drive (batch-c8c8acabdf2b) took 55,103 ms of drain time; the sum of
   its board calls was 54,537 ms (open 4,147 · form 873 · fill ×14 sum
   49,386, median 1,501 / max 18,561 · answers 131). A drive's wall
   clock IS the sum of its calls — and while any call runs, the
   service answers nothing else: external probes during the drive ran
   p50 1 ms / p90 2 ms but max 18,558 ms — a probe's wait is exactly
   the in-flight call's remaining time (idle baseline: p99 4 ms).
2. **Concurrent legs died.** Two concurrent prepare legs (Figma +
   Descript) were attempted twice against the single-core service;
   both times one leg died mid-drive with WORKER_UNREACHABLE
   (batch-72d97b58db58 at 13.1 s; batch-f8882beab43e at 12.9 s) while
   the other completed. Reproduced a third time with an instrumented
   transport: `fetch failed / causeCode=ECONNRESET / read ECONNRESET`,
   ~6.6 s into the queued call, within milliseconds of the in-flight
   call completing. That defect is ledgered as F-033 (see below).

## Root cause, by layer (attribution)

- **Binding layer — the board service process.** `board-service.cjs`'s
  core is synchronous BY DESIGN ("The drive stack is synchronous at
  every layer (155, 149, and 150's own helper bridge, which waits on
  files with Atomics.wait), so this core is synchronous too" — file
  header). `handle()` runs each board call to completion on the one
  event loop, so the process serves exactly one call at a time for
  ALL users and sessions. The blocking is almost pure sleep: during a
  drive the service's node process does not appear in the host's top
  CPU consumers (the Chromium children peak ~25% of one core; the
  host has 2 vCPU / 7 GB) — the process is parked in Atomics.wait on
  its helper seam while the board site and Chromium do the work.
  Serialization here is a latency structure, not a compute limit.
- **Second layer — executor/155 serial drain (unchanged by this
  chunk).** `batch-executor.cjs` drains intents serially and 155's
  prepareRun/executeRun loop per app serially. The S-1 lane already
  built and prototyped the within-run sharding for this layer
  (branch muse/2026-10-22-s1-parallel-drain: serial 1,309 ms →
  parallel 801 ms on stub drives; its ledger migration is DRAFT,
  unapplied). But S-1's parallel processes still funnel into the one
  board service — with the service serial, real-board parallelism
  was capped at one call regardless. This chunk removes the service
  cap; composing the two is the chunk-80 bench's job.
- **Not the cause:** the egress relay (probes don't touch it; idle
  probe p99 4 ms), the database (posting/profile reads complete
  before drain_start; drain time is board calls), host CPU
  (≤ ~0.5 core total during a drive), the board sites (solo drives
  complete; the failures were connection resets, not challenges —
  captcha count on every measurement drive in this chunk: 0).

## F-033 — the keep-alive race (defect found by this chunk)

Node's HTTP server arms a 5 s keep-alive timer on a socket when a
response completes. When the service loop is blocked inside another
session's long call, a queued request can sit UNPARSED in its
socket's buffer past that expiry; when the loop frees, timers run
before the parser, the expired timer destroys the socket, and the
client's outstanding request dies with `read ECONNRESET`
(WORKER_UNREACHABLE at the bridge). Solo drives never span an expiry
with an outstanding request, which is why it hid until concurrency.
Fix: `server.keepAliveTimeout = 0` in `createBoardHttpServer`
(loopback-only service; every client is our own transport, so idle
sockets are bounded by our own clients). Guard:
`career-parallel-drives` F-033 test — fail-first verified (without
the fix it reproduces `Error: read ECONNRESET` in 6.06 s; with it,
the queued request is served after the 6 s block).

## The build — sharded board service

`workers/career-browser/board-service.cjs` gains a sharded mode;
`workers/career-browser/board-service-shard.cjs` is new.

- `boardShards: N` (integer ≥ 2) in the operator config turns it on.
  Absent or 1 = the original single-core path, byte-for-byte (the
  kill switch is one config number + restart).
- The main process never touches a board. It runs the same HTTP
  adapter and routes: session creation → the least-loaded shard;
  `/call` and `/close` → the shard that owns the session id (the map
  lives only in this process's memory — sessions have never survived
  a service restart and still do not). Each shard is a worker thread
  running a complete, unmodified `createBoardService` core — its own
  sessions, its own module-150 boards, its own helper processes. A
  blocking call blocks only its thread.
- The refusal surface is preserved exactly: the router applies the
  same secret + method checks before routing (same bodies, same
  order — an unauthenticated caller cannot oracle session existence
  from routing), and every routed request is re-checked by the
  owning shard's core.
- `maxSessionsPerUser` stays a GLOBAL cap: each shard enforces
  ceil(cap / N) and creation routes least-loaded, so a user's total
  never exceeds the configured cap (guard-proven at cap 4 / 2 shards).
- Config reaches shards without functions crossing threads: each
  shard require()s the same operator config module the service was
  started with (single-sourced; `resolveResumePath` and all). Inline
  callers (tests) use data config + `boardFactoryModule` /
  `resolveResumePathModule` paths; function-valued config with no
  module route is refused at startup, named.
- A dead shard is respawned; its sessions are gone and their ids
  answer the same 404 `session_not_found` an unknown id gets —
  never a cross-shard spill. In-flight requests to it resolve 502
  `shard_unavailable` naming the consequence.
- The F-033 fix lives in the shared HTTP adapter, so it covers both
  modes.

Guards — `tests/career-parallel-drives.test.cjs`, 8/8:
roundtrip + refusal parity · the serialization measured both ways
over real HTTP (single-core: two 250 ms fills serialize ≥480 ms;
sharded: they overlap <420 ms) · no cross-talk between concurrent
sessions · foreign user refused mid-flight · a leg's board failure
never touches its sibling · global session cap across shards ·
F-033 queued-request survival · kill-switch behavior. Cap-race
guard: see below.

## Caps under parallelism — what is proven, what is not

Caps (149: perDay 15 · perVendorPerDay 5 · perCompanyPer30Days 1)
are counted from the submissions ledger, and only `submitDoorstep`
writes submitted records. **Prepares are read-only against the
ledger** — parallel prepares cannot consume or race cap slots; the
ladder below runs all legs against one shared store and the ledger
is byte-identical after (0 submitted records; every leg's stop is
its own).

The submit seam is different, and the guard says so honestly
(cap-race test, real executor + 155 + 149 + sandbox boards, two
drains racing the last per-day slot):

- (a) with the executor's current discipline — snapshot the ledger,
  execute (mutating the snapshot), whole-ledger replace
  (`career_batch_save_ledger_v1` takes only the records) — BOTH legs
  submit (reality 16 > cap 15) and the second save silently erases
  the first leg's record: the ledger reads a compliant 15. The cap
  count is blind exactly when it matters.
- (b) with a versioned store (saveLedger refuses a stale snapshot,
  `LEDGER_VERSION_CONFLICT`): exactly one leg proceeds, the cap
  holds at 15, the loser's refusal is named.
- (c) a leg drained after the winner with a fresh ledger read stops
  in 149/155 as stage `deferred_cap`, recorded `CAP_REACHED` —
  the refusal shape a re-drive meets.

Production status of (a): the executor is a single systemd oneshot
(a timer cannot start a second instance), so two drains of one
user's ledger cannot overlap on this host today; the race opens
with multi-process drains (S-1 sharding / multi-host). The version
token belongs in the ledger RPC — S-1's draft-migration territory —
and test (b) is its fail-first specification. This chunk does not
change any cap value or check.

## Measurement — concurrency ladder (TEST user, live service, real Greenhouse postings)

BEFORE (single-core service):
- solo Figma: 55,103 ms drain (30 board calls, sum 54,537 ms)
- 2 legs (Figma + Descript): attempted twice — a leg died
  WORKER_UNREACHABLE both times (F-033); the survivor's calls sum
  59,818 ms of client-observed time for a 55 s solo workload, i.e.
  its calls queued behind the other leg's — total service throughput
  unchanged at one call at a time.

AFTER (F-033 fix + `boardShards: 4` live on the host; shared store
per level, legs staggered 1.5 s, probes throughout each window):

| level | legs (posting) | per-leg drain ms | window | apps/min | probes during window |
|---|---|---|---|---|---|
| L1 | Figma | 55,946 (30 calls, sum 55,663) | 55,950 ms | 1.07 | n=1,026 · p99 23 ms · max 129 ms |
| L2 | Figma + Descript | 71,323 (sum 71,037) · 54,518 (sum 54,220) | 71,324 ms | 1.68 | p99 53 ms · max 111 ms |
| L3 | + Relativity | 86,893 (86,513) · 61,284 (60,797) · 83,911 (83,214) | 90,200 ms | 2.00 | p99 73 ms · max 154 ms |
| L4 | + Cloudflare | 89,768 · 73,748 · 95,831 · 87,852 | ≈97,000 ms | 2.47 | see below |

Every leg at every level completed with 0 call errors and 0
submitted; every leg's final stop was its own (UNCOVERED_QUESTION
class); the shared ledger stayed at 0 records / 0 submitted after
every level. Board-site challenges across all chunk-70 drives: 0.

**Success bar: MET at L3** — 3 concurrent legs finished in
90,200 ms, under the 1.8×-solo bound (100.7 s), with probe max
154 ms against 18,558 ms BEFORE. L4 finished 4 legs in ≈97 s —
1.74× the solo wall for 4× the work.

L4 probe detail (n=361, series truncated by the VM replacement at
09:18:45Z, after all four legs had completed): p50 5 ms, but 9
probes exceeded 1 s, worst 24,249 ms — **all nine are the
refused-host probe, i.e. the session-CREATE path**. Auth refusals
are answered by the router before routing and stayed at ~ms. A
create is routed to a shard and the refusal is issued by that
shard's core, which processes one `handle()` at a time: with all
4 shards busy, a create queues behind the target shard's
in-flight call (calls run to ~18 s). In-flight calls of existing
sessions are never delayed by this. At L1–L3 a free shard always
absorbed creates instantly, which is why the effect only appears
at saturation.

## What the ceiling is now, and what lifts it

Measured, in binding order:

1. **Host CPU — 2 vCPU shared by N Chromium instances.** Per-leg
   call sums inflate with concurrency (Figma: 55.7k → 71.0k →
   86.5k ms at L1/L2/L3) and throughput flattens accordingly:
   1.07 → 1.68 → 2.00 → 2.47 apps/min. This is now the primary
   ceiling. Lift: more vCPU on the worker host; nothing in the
   service design blocks it.
2. **Session-create queueing at shard saturation** (the L4 probe
   finding above): when every shard is mid-call, a new create
   waits for one in-flight call, worst 24.2 s tonight. Existing
   sessions are unaffected. Lifts: a router-side host/family
   refusal pre-check (refusals never reach a shard), or more
   shards than peak concurrent legs. Neither is built; this
   chunk's bar did not require it and one-fix-per-round applies.
3. **The executor/155 serial drain** still bounds single-batch
   throughput per user; composing S-1's within-run sharding with
   this service sharding is chunk 80's job.
4. **Board-site behavior** under parallel load from one egress
   IP: no challenges, refusals, or rate walls observed tonight
   (0 across all chunk-70 drives, Greenhouse family). Recorded
   as data; never bypassed.

Operational note: the host VM was replaced at 09:18:45Z, minutes
after the L4 legs completed. The F8 watchdog restored the stack
unattended (restore_applied 09:24:23Z); host file shas and
`boardShards: 4` were unchanged, and the gate probes re-passed
(401/401 · example.com 403 DRIVER_HOST_REFUSED · Ashby 403
FAMILY_NOT_DRIVEABLE · Lever create 201 + close 200).
