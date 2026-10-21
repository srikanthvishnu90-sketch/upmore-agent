# K=2 install checklist — staged drain-parallelism units vs today's live config (TP-INFRA, 2026-10-21)

Staged package under review: `tools/drain-simulator/staged-units/` on
branch `muse/2026-10-21-worker-drain` @ 3774d0bf (design:
`docs/career/worker-drain-parallelism.md`, activation gates its §5).
Verified against the live host on 2026-10-21: board :8471 + relay
:8474 + the throughput lane's config fixes (chromium wrapper drop-in,
board session cap 64, executor timer 20 s). **Nothing was installed by
this lane. S-2 remains a hard gate: no K>1 before it lands.**

## Expectation reset (read first)

The staged package's headline — 50 in 26.1 min at K=2 — comes from the
drain simulator's *stated* distribution (mean drive 61.7 s). Measured
reality (throughput lane + TP-INFRA D1): a real doorstep drive runs
**157–171 s**, paid **twice** per application (prepare + approve
re-drive; sessions never survive), and ≈ 80% of fill wall is the widget
drive's fixed 500 ms poll ladder, which parallelism does not shrink.
The drain design's own gate §5.1 says: if the true mean drive is
≥ ~85 s, K=2 on this host does NOT beat 30 min — escalate host size.
We are at ~160 s. So, honestly:

- K=2 as staged buys **~2× on multi-batch / multi-user queues**
  (concurrent chains), not the one-batch benchmark.
- The one-batch 50-in-30 additionally needs: S-1 (sharding of the ONE
  intent), the per-fill fix (D1 verdict: event-driven option wait in
  driveWidget), F2 (resident executor — kills the double drive),
  and/or a bigger host. The install below is still the right rails —
  under a corrected expectation.

## Hard gates (from the design's §5, unchanged)

- [ ] **G0a — S-2 lands** (same-user cap-ledger fencing:
      `career_batch_save_ledger_v1` whole-array replace race). HARD
      gate for any K>1. Not landed at checklist time.
- [ ] **G0b — S-1 lands** if the goal is the one-batch benchmark
      (without it, K executors drain K *intents*; one batch stays
      serial inside one executor's 155 loop).
- [ ] G0c — first live parallel drain observed end-to-end before the
      configuration is called standing (design §5.5).

## Deltas — staged units vs today's live config

- [ ] **D-1 Timer cadence REGRESSION in the staged timer.** Staged
      `upmore-career-executor.timer` carries `OnUnitActiveSec=60s`
      ("cadence unchanged" — true when staged). Live cadence today is
      **20 s** (throughput lane fix, read back from the live timer).
      Installing as-is triples worst-case intent->drain lag.
      **Action: set `OnUnitActiveSec=20s` in the staged timer at install.**
- [ ] **D-2 Board instances ship WITHOUT the Chromium egress fix.**
      Staged `upmore-career-board@.service` has no
      `UPMORE_CHROMIUM_PATH`, and no board@ drop-in is staged. Without
      the wrapper, instances hit the 2026-10-21 triple failure (stub
      Chromium resolution, direct-CONNECT refusal, interception-CA
      distrust) — drives fail at open.
      **Action: install `upmore-career-board@.service.d/throughput-chromium.conf`
      with the same one-line content as the live board drop-in.**
      Both instances share the ONE egress relay on :8474 (stateless
      CONNECT relay; already live as its own unit; it is not templated
      and needs no per-instance copy).
- [ ] **D-3 Per-instance operator configs do not exist yet.** The
      templates reference `/home/hatch/worker-config/board-config-%i.cjs`
      and `executor-config-%i.cjs`. **Action: create board-config-1/2
      from TODAY's board-config.cjs** (port 8481/8482, same secret,
      same familyVerdicts) — critically carrying
      **`maxSessionsPerUser: 64`**: a config copied from the flip-doc
      shape omits it, the service default (32) returns, and a
      50-batch prepare dies at posting 33 with SESSION_LIMIT
      (measured). executor-config-1/2 are straight copies. Mode 600;
      the secret never enters the repo.
- [ ] **D-4 Board pinning — verified sound, one caveat.** Staged
      executor@ sets `Environment=WORKER_BOARD_URL=http://127.0.0.1:848%i`
      AFTER `EnvironmentFile=` — systemd applies them in order, so the
      pin overrides the shared executor.env's :8471 (the design's §3
      states the same). Caveat verified by grep:
      **`EXECUTOR_INSTANCE=%i` has no consumer** in the current worker
      code or executor-config — instance identity rides entirely on
      the URL pin + config pairing today. Do not build anything that
      assumes the env var is read until S-1 lands.
- [ ] **D-5 Retire-or-keep the single-instance stack (design §5.4).**
      Default at install: stop + disable `upmore-career-board.service`
      and the old executor service/timer units, replaced by board@1/2
      + executor@1/2 + target + the (D-1-corrected) timer. The
      alternative — keep :8471 as instance 1 — is legitimate; choose
      once, on the record, at install. Either way **keep
      board-config.cjs in place**: the smoke launcher reads it (D-7).
- [ ] **D-6 F8 interplay — a K=2 host restored by today's F8 package
      silently reverts to K=1.** `tools/worker-restore/` templates +
      detection describe the single-instance stack. That is a safe
      failure posture (the stack works, at half width) but a silent
      downgrade. **Action before K=2 is called standing: either add a
      K=2 variant of the restore templates/detection, or record the
      decision that restore-to-K1 is the accepted posture.** Flagged
      here; not resolved by this checklist.
- [ ] **D-7 Untouched by K=2 (verified).** Smoke instance :8472
      (stopped posture; its port is free today). Ports 8481/8482
      verified free on 2026-10-21 (only 8471 + 8474 listening) —
      re-verify at install. WorkingDirectory in both templates =
      /home/hatch/workspace/upmore-v2-candidate, matching live.
      executor.env stays shared by both instances (same Supabase
      credentials + worker secret) — by design; WORKER_BOARD_URL is
      the only per-instance override.
- [ ] **D-8 Session-cap arithmetic.** The cap is per board instance
      per user (64 each after D-3). A 50-batch prepare pinned to ONE
      executor/board pair needs all 50 sessions in that one instance:
      64 >= 50 holds. With S-1 sharding across both instances the
      per-instance need halves.

## Install sequence (only when G0a [+ G0b for the benchmark] clear)

1. Create the four per-instance configs (D-3); verify mode 600.
2. Apply D-1 (timer 20 s) + D-2 (board@ drop-in) to the staged units.
3. Install units + drop-in to /etc/systemd/system; `daemon-reload`.
4. Execute the D-5 decision (retire or keep :8471 as instance 1).
5. Enable + start board@1, board@2, executors.target, the new timer.
6. Per-instance gate probes on BOTH 8481 and 8482: no-secret 401 ·
   wrong-secret 401 · example.com 403 DRIVER_HOST_REFUSED · Lever 403
   FAMILY_NOT_DRIVEABLE (the restore-worker.sh probe set, per port).
7. One empty drain per executor instance (`{"batchExecutor":"drained","results":[]}`).
8. First live parallel drain observed end to end (G0c) before the
   configuration is called standing.

**Rollback:** reinstall the single-instance stack from
`tools/worker-restore/units/` (restore-worker.sh's templates) and
re-run its probes; claim-once discipline makes the swap safe for any
intent in flight.
