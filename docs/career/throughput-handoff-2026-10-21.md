# Throughput handoff — worker-code fix specs (2026-10-21, throughput lane)

For the worker/board code owners. Every claim below is measured in
`throughput/BASELINE.md` + the lane's status entries (branch
muse/2026-10-21-throughput). The throughput lane changed NO worker
code; the config-layer fixes it did apply are listed at the end.

## The serialization stack (why one board service = one drive at a time)

1. **batch-executor.cjs** — `runBatchPending` processes intents in one
   sequential loop; module 155 drives selected postings one at a time.
   The executor is a oneshot under a 60 s timer: drains cannot overlap,
   and a drain's start can lag intent commit by up to 60 s.
2. **board-service.cjs** — `handle()` is synchronous; module 150's
   bridge waits on the helper via Atomics.wait, so every board call
   blocks the service's event loop for its full duration. MEASURED:
   during a drive, an authenticated no-op probe's latency hit p99/max
   **27.9 s** (idle p50 23–39 ms).
3. **portal-browser-helper.cjs** — one Chromium per service process;
   the command pump `await`s each command to completion before the
   next, across ALL boards. Per-board contexts exist, but command
   execution is globally serial.
4. **Sessions never survive prepare → approve.** 155's session
   runtime is a per-process Map; the executor is a fresh process per
   drain, so the approve drain re-drives every posting from scratch
   (full runApply) before submit. Every application is driven twice.

## Per-call costs on a real Greenhouse page (this host, measured)

- open 19–33 s · form 7–12 s · **fill 11–28 s each (uniformly slow,
  not one outlier)** · answers 0.75–11 s · a 6-fill partial doorstep
  totals 126–171 s. A 27-field form projects to ~8–11 min per
  application at these rates (estimate from the measured per-call
  distribution). The helper's own settle waits are sub-second
  ([450, 650, 1000] ms), so the cost sits inside in-page widget work
  and readbacks on a proxy-loaded page on a 2-vCPU host — profile
  cmdFill/driveWidget/readbackBinding against a local copy of a
  Greenhouse page to split page-CPU vs wait time before optimizing.

## Fix specs (in payoff order)

F1. **Parallel drive topology.** Run N board-service processes
    (distinct ports), one helper/Chromium each, and give the
    executor a bounded drive pool (K postings in flight, one per
    board process). The claim/lease RPC discipline already makes
    concurrent drains safe (a raced claim resolves
    skipped_claimed). Host ceiling measured: 2 vCPU / ~2 GB free
    RAM; one Chromium tree swings whole-box chrome RSS by roughly
    +0.6–1.2 GB (noisy shared box — re-measure on a quiet host);
    K=2 is the realistic start on this VM class.
F2. **Resident executor.** Replace the 60 s oneshot timer with a
    long-lived drain process (claim loop with backoff). Removes the
    ≤60 s start lag and lets sessions live across the prepare →
    approve gap inside their 10-min TTL, killing the double drive
    (spec 4) for the common approve-quickly case.
F3. **Helper concurrency.** Per-board command queues: execute
    commands for DIFFERENT boards concurrently, preserve strict
    order within a board. (Playwright contexts are independent;
    the pump's global await is the only serializer.)
F4. **Board-service async adapter.** Make the node:http adapter
    await an async handle (or shard behind F1) so one slow board
    call never stalls unrelated sessions' calls.
F5. **Feed wiring (discovery).** Point the executor config's
    postingsFor at the targeted feed (this branch:
    workers/career-browser/queue-feed.cjs, guard 4/4) and filter
    feed output through module 150's hostAllowed: MEASURED, 29 of
    the shelf's 91 SWE-intern-greenhouse postings carry
    employer-site wrapper URLs the §6.3 gate refuses at session
    creation — as stored they are undriveable and must not enter
    a queue. boardsFor = a worker-start census (GROUP BY board)
    over career_kb_postings.
F6. **Transport paging.** supabase-transport.readRows exposes no
    offset/range; PostgREST caps every read at 1,000 rows
    (measured: limit 2500 → 1000). Add Range-header paging so the
    pool loader can page the shelf directly instead of per-board
    reads.
F7. **Egress/Chromium posture in code.** The helper launch should
    take its proxy + CA from worker config: on this host class,
    Chromium ignores env proxies, cannot CONNECT to the egress
    proxy directly, and does not trust the interception CA
    (all measured; the operator wrapper in the config fixes below
    is the workaround, not the design). A config-owned
    `proxy` + `ignoreHTTPSErrors`/CA option in the helper's launch
    path retires the wrapper.
F8. **Worker-host durability.** The systemd units live in
    /etc/systemd/system, which VM replacements wipe — twice in one
    day (2026-10-21 ~11:05 and ~12:30 CDT; the second wipe landed
    mid-benchmark). The flip doc's recreate procedure works
    (~10 min including verification), but nothing runs it
    automatically. Add a boot-time restore (a unit in the
    persistent tree that re-registers the worker units from
    /home/hatch/worker-config + the flip doc texts) or a watchdog
    that pages when :8471 stops answering.

## What the closure deploy changes for throughput (structural only)

- `career_apply_receipts` (file 3) + the outbox/card waves give the
  executor a durable per-action receipt write — the queue→drive→
  receipt path stops depending on the run record alone; no change
  to drive cost itself.
- `20261021120000_career_apply_form_answers` gives 149's answers a
  schema home — removes per-drive answer reconstruction only if the
  consumer (F-007) reads it; throughput-neutral until then.
- The authority file's claim/hook replacements keep the same
  signatures — drain semantics unchanged.
- Nothing in the closure touches the serialization stack above;
  the apply engine's throughput is a worker-architecture problem,
  not a schema problem.

## Config-layer fixes the throughput lane APPLIED (worker host)

1. `upmore-egress-relay.service` — loopback CONNECT relay on
   127.0.0.1:8474 (script: /home/hatch/worker-config/connect-relay.cjs,
   copy in this branch's throughput/). Chromium's own CONNECT to
   the egress proxy fails on this host; the relay's minimal
   re-issued CONNECT is accepted.
2. Board-service drop-in `throughput-chromium.conf` —
   UPMORE_CHROMIUM_PATH → /home/hatch/worker-config/chromium-egress-wrapper.sh
   (copy in throughput/), appending `--proxy-server=http://127.0.0.1:8474`
   and `--ignore-certificate-errors` after Playwright's args. Also
   fixes the missing-binary failure: the board service (root) was
   resolving a stub headless-shell dir under /root/.cache with no
   binary in it; the working Chromium 1243 build lives in
   /home/hatch/.cache. The --ignore-certificate-errors posture
   mirrors the host's proven ci-browse pattern (the egress
   TLS-intercepts everything; node's trust comes from the CA
   bundle the units already carry) — F7 above is its retirement.
3. Both were wiped by the 12:30 CDT VM replacement and restored
   with the rest of the stack; the restore is part of the lane's
   measured record (detection → gates green ≈ 10 min).
