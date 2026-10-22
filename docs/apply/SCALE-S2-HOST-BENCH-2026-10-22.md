# SCALE S2 — Host-Side Multi-User Bench (2026-10-22)

Lane: SCALE S2 (owner direction 2026-10-22 09:56 CDT — Muse implements and
tests at mass scale; Codex takes the bugs). Prepares ONLY. No live submits,
no deploys, no applies, no migrations, no merges, no external texts, no
spend. Production Supabase touched read-only. Submitted: 0. Real
completions: 0.

## Posture and stack under test (every run header)

- **The host stack as it stands.** All runs drove the TEST worker host on
  this VM: board service `upmore-career-board.service` on 127.0.0.1:8471,
  egress relay on :8474, executor timer, host tree
  `~/workspace/upmore-v2-candidate` (tonight's host-applied fixes:
  event-waits, sharding, reap-on-crash, decline-vocab, F-027/F-028).
  **The fix branches on origin (fix-f025 @ d510bc38, fix-f029-guard, etc.)
  are NOT host-applied — no run in this document tests them.**
- Board config (read live from `/home/hatch/worker-config/board-config.cjs`):
  `maxSessionsPerUser: 64`, `boardShards: 4`,
  `familyVerdicts: { greenhouse: true, lever: true }`.
- Host: 8 GB RAM (MemTotal 8,125,588 kB), 2 vCPU, **no swap**.
- Users: the doorstep TEST user `b2625909-d67f-41b2-8270-983d212c6052` plus
  synthetic ids `s2synth-01…07`. Synthetic users exist **only** inside the
  local harness: each leg clones the TEST profile in-process
  (`profileFor` override) and the board service sees the distinct id; a
  per-id resume file was seeded in the local worker-config store. **No
  account was created in the production project.**
- Composition per leg: executor → module 155 → bridge → sync transport →
  board service :8471 → real board page (the chunk-80 bench composition,
  one process per leg). Harness: `~/workspace/bench60-harness/s2/`
  (`s2-leg.cjs`, `s2-driver.cjs`, `s2-orchestrate.cjs`, `probe.cjs`,
  `s2-iso.cjs`, `s2-analyze.py`). Raw records:
  `~/workspace/bench60-harness/s2-runs/<run>/`.
- Counting rule (the bench's strict rule): a leg is a **counted outcome**
  when the board was actually driven (board calls > 0) and the application
  reached a named outcome in its record. Crashed legs are counted
  separately and the composition is always stated. Legs in flight at a
  run's window end are recorded, never counted as outcomes.
- Stop rule (armed in every orchestrated run): MemAvailable < 100 MB for
  3 consecutive 2 s samples → kill all drivers and record the stop. The
  board unit was restarted between runs (allowed: TEST worker host); the
  restart itself takes ~90 s (`final-sigterm` timeout; see Finding F-S2-6).
- Submit flag read-backs (sb.py, production, read-only):
  - Before the ladder (15:21Z): `career_cloud_settings` = 0 rows,
    `career_apply_agent_submit_enabled()` = false,
    `career_apply_jobs` = 0. **OFF.**
  - After the ladder: see the closing read-back at the end of this doc.

## Environment incidents (measured, part of the evidence)

This VM was replaced **three times** during the lane:

1. Boot 15:15:38Z (boot id `08457a90…` → `900291ee…`) killed the first
   control run (`s2-u1c4`, 2 of 24 legs recorded: 1 drove
   UNCOVERED_QUESTION, 1 screened out; partial record preserved at
   `s2-runs/s2-u1c4/`). The F8 watchdog restored the stack:
   `restore_applied` 15:19:33Z, self-verify healthy 15:19:34Z (probes
   401/401/403, Lever create 201 + close 200); an independent lane entry
   records healthy at 15:21:10Z with the flag read-back OFF.
2. Boot 16:51:17Z (boot id → `e2e1cd2c…`) killed `s2-u8c2` mid-run
   (partial record below). Watchdog first degraded read 16:50:13Z.
3. A runtime service restart also interrupted this lane's tooling once;
   no bench state was lost beyond incident 2.

The bench harness itself survived every replacement (all state on disk).

## Pre-ladder checks (2026-10-22 ~15:07–15:12Z, stack as restored)

- **Smoke (PASS):** one leg, synthetic `s2synth-01`, Cloudflare Greenhouse
  posting — full drive in 70.8 s, run `batch-6d3601a69f9b`, terminal
  UNCOVERED_QUESTION (required questions with no confirmed fact; nothing
  invented). Record: `s2-runs/smoke1-result.json`.
- **Board-layer isolation (5/5 PASS):** record `s2-runs/iso-board.json` —
  user B addressing user A's session id refused with
  `WORKER_SESSION_FORBIDDEN` ("the worker refused this session for this
  user — board sessions are per-user and are never addressed across
  owners"); A kept ownership (18 fields read); 6 concurrent session
  creates (3 per user) all succeeded with 6 distinct session ids.
- **Unknown-user leg (finding F-S2-5):** a leg for an unseeded user id was
  blocked in 127 ms as `BATCH_RPC_TRANSPORT_FAILED` (the transport throws
  at `supabase-transport.cjs:59`). The designed `BATCH_PROFILE_NOT_FOUND`
  outcome never surfaces. Record: `s2-runs/unknown1-*`.

## The ladder

Posting sets: Greenhouse legs partitioned per user from the 84-posting
bench list — u4 partitions 21 each (84 total, no reuse across users), u8
partitions 10–11 each (84 total), u1 control = the first 24 of the u4
partition 0's lineage list. All runs: shards 4, window as noted, board
restarted before the run.

### Ladder table (counted outcomes = drove legs; composition always stated)

| Run | Users × conc (in flight) | Window | Finish | Launched | Drove | Healthy named outcomes | DRIVER_ERROR | Transport/helper timeouts | Captcha | RAM floor (MemAvailable) | Probes p50 / p99 / max |
|---|---|---|---|---|---|---|---|---|---|---|---|
| s2-u1c4b (control) | 1 × 4 (4) | 1200 s | all legs done, 492 s | 24 | 23 | 15 UNCOVERED_QUESTION | 8 | 0 | 0 | 1,003,356 kB | 8 ms / 8,712 ms / 25,790 ms |
| s2-u4c1 | 4 × 1 (4) | 1200 s | all legs done, ~684 s | 84 | 83 | 16 UNCOVERED_QUESTION | 66 | 0 | 1 | 1,482,956 kB | 11 ms / 135 ms / 25,583 ms |
| s2-u4c2 | 4 × 2 (8) | 1200 s | all legs done, ~624 s | 84 | 83 | 16 UNCOVERED_QUESTION | 65 | 0 | 2 | 673,720 kB | 12 ms / 4,861 ms / 28,498 ms |
| s2-u4c4 | 4 × 4 (16) | 1200 s | **window end** (16 legs still in flight) | 84 recorded | 55 | 14 UNCOVERED_QUESTION | 14 | 16 WORKER_TRANSPORT_TIMEOUT + 3 DRIVER_TIMEOUT + 1 HELPER_TIMEOUT | 0 | 700,152 kB | 31 ms / 45,002 ms / 45,050 ms (7 probe timeouts) |
| s2-u8c1 | 8 × 1 (8) | 1200 s | **window end** (8 legs still in flight) | 70 recorded | 53 | 23 UNCOVERED_QUESTION | 29 | 1 DRIVER_TIMEOUT | 0 | 921,948 kB | 8 ms / 5,262 ms / 45,003 ms (1 probe timeout) |
| s2-u8c2 | 8 × 2 (16) | 900 s | **INTERRUPTED — VM replaced 16:51:17Z** | 16 recorded | 15 | 3 UNCOVERED_QUESTION + 1 ANSWER_OBSERVATION_MISMATCH | 0 | 11 WORKER_TRANSPORT_TIMEOUT | 0 | not recorded (harness killed) | not recorded |
| s2-u8c4 | 8 × 4 (32) | — | **NOT RUN** (see below) | — | — | — | — | — | — | — | — |
| s2-lever | 1 × 2 (2) | 900 s | all legs done, 326 s | 14 | 13 | 4 UNCOVERED_QUESTION + 3 ANSWER_OBSERVATION_MISMATCH + 1 EMPTY_FORM | 0 | 0 | **5** | 705,464 kB | 5 ms / 61 ms / 30,124 ms |

Per-user detail, probes per driver, CPU, and crash signatures per run are
in the raw records (`s2-runs/<run>/`, `orchestration.json` +
`u<i>/*-record.json`) and reproducible with `s2/s2-analyze.py <run dir>`.
Doorsteps in every S2 run: **0** (every healthy drive stopped at a named
question/attestation gate — the TEST profile's coverage limit, not a
worker failure). CPU while driving: avg 93–96 %, p95 99.9 % (2 vCPU
saturated in every run).

**s2-u8c4 not run — reason:** two independent 16-in-flight runs
(s2-u4c4 to completion of its window, s2-u8c2 partial) both collapsed to
the transport-timeout regime within their first legs; 32 in flight
extrapolates that collapse, and this host had already been replaced three
times in one day. A smaller completed ladder beats a collapsed one. What
u8c4 could still have measured is named as an open item, not hidden:
SESSION_LIMIT behavior was **never observed in any S2 run** (per-user
concurrency peaked at 4 against a cap of 64; no leg ever received a
session-limit refusal).

### Per-run notes

- **s2-u1c4b (control, 1 user × 4):** 23/24 drove in 492 s (2.8/min).
  8/23 drives (35 %) died mid-drive as DRIVER_ERROR — verbatim:
  `elementHandle.evaluate: Target crashed` (dominant),
  `elementHandle.evaluate: Target page, context or browser has been
  closed`, `page.waitForTimeout: Target page, context or browser has
  been closed`. After each such crash the next leg drove normally — at
  this load the browser plane degraded per-target but recovered between
  legs. Probe p99 of 8.7 s shows the board event loop already stalls
  seconds at a time under 4 concurrent drives.
- **s2-u4c1 (4 users × 1):** first legs drove normally (75–111 s each).
  At **15:44:54–15:45:44Z every user's legs flipped to instant failure**
  (first instant-fail legs: u0 idx 5 @15:44:54, 918 ms; u1 idx 6
  @15:44:54, 956 ms; u3 idx 7 @15:44:54, 875 ms; u2 idx 5 @15:45:44,
  1,826 ms) — after that, 100 % of legs failed in ~0.6–1.9 s at `open`
  with `browser.newContext: Target page, context or browser has been
  closed`. 66/83 drove legs (80 %) ended DRIVER_ERROR. The board
  service process never died (probes p50 11 ms throughout, systemd
  NRestarts=0); its 4 shard helper processes were still alive afterward
  — their Chromium browsers were dead and **nothing relaunched them**.
  The run "completed" all 84 legs only because the dead plane fails
  fast. One captcha: u3 leg 4 (Descript, Greenhouse-served) →
  `captcha_handoff`, one attempt, no retry (harness moves on by
  construction).
- **s2-u4c2 (4 users × 2):** same shape, death onset **15:56:11–15:57:22Z**
  (~6 min in, 3–6 healthy drives per user first). 65/83 DRIVER_ERROR
  (78 %), 2 captcha handoffs. RAM floor fell to 674 MB (8 in flight
  costs ~2× the RAM of 4).
- **s2-u4c4 (4 users × 4, 16 in flight):** a different regime from the
  first legs — the board service stopped answering calls at all:
  16 legs burned the full **120,000 ms** transport timeout
  (`WORKER_TRANSPORT_TIMEOUT`: "the career worker board service did not
  answer in 120000ms"), plus HELPER_TIMEOUT ("browser helper did not
  become ready in 20s"), DRIVER_TIMEOUT ×3, EMPTY_FORM ×5 (zero-field
  reads under starvation — the F-025 shape), STALE_FIELD_MEANING ×2.
  Probes: p99 = the 45 s probe timeout itself, 7 timeouts. The window
  ended with 16 legs still in flight; per-user throughput collapsed to
  0.63–0.86 drives/min (vs 1.8–2.4 at conc 1–2).
- **s2-u8c1 (8 users × 1):** window-ended with 53 drove of 70 recorded.
  Death was **staggered per shard** rather than one instant: u6 was
  still 4/4 healthy at the ~12 min mark while u4 was 5/6 DRIVER_ERROR —
  users on live shards kept driving, users on dead shards failed.
  29 DRIVER_ERROR / 23 healthy named outcomes overall. Per-user rate
  0.32–0.46/min.
- **s2-u8c2 (8 users × 2, partial):** 16 legs recorded before the VM was
  replaced: 11/15 drove legs WORKER_TRANSPORT_TIMEOUT from the first
  legs (the 16-in-flight regime, agreeing with s2-u4c4), 3 healthy
  UNCOVERED_QUESTION, 1 ANSWER_OBSERVATION_MISMATCH.

## Family mix — Lever (section C)

Run **s2-lever**: TEST user × conc 2 × the 14 driveable Palantir postings
from the 107 pre-flighted Lever set (`s2-lever-list.json`), window 900 s,
all 14 legs done in 326 s. Board stack freshly restored by the F8
watchdog at 16:54:09Z (healthy 16:54:10Z) immediately before the run —
that restore was this run's between-runs reset. Record:
`s2-runs/s2-lever/`.

Composition (13 drove, 1 not driven):

- `captcha_handoff` ×5 (38 % of drove legs) — legs 4, 5, 6, 7
  consecutively, then leg 10. Each leg filled 9–10 fields before the
  handoff. **Captcha recorded as an outcome class; one attempt per
  posting, never retry-looped** (the harness moves to the next posting
  by construction). The burst pattern — clean drives first, then a run
  of challenges — is the egress-IP escalation shape the earlier lanes
  predicted for Lever; on this evidence Lever throughput from one
  egress is captcha-capped, not host-capped.
- `UNCOVERED_QUESTION` ×4 — full Lever drives (up to 21 fills / 40 board
  calls on one leg, 101 s) stopping at the TEST profile's uncovered
  questions, exactly as on Greenhouse. Lever is driveable end-to-end on
  the host stack as it stands.
- `ANSWER_OBSERVATION_MISMATCH` ×3 — fills landed but the readback did
  not match (the standing observation family; present on Lever too).
- `EMPTY_FORM` ×1 — zero-field read on a Lever form (26.6 s, leg 1).
- `no_drive:family_filtered` ×1 — leg 0's title matched no family term;
  pipeline outcome, no board calls, never counted.

At this load (1 user × 2) the stack was healthy: zero crash signatures,
probes p50 5 ms / p99 61 ms, CPU avg 82 %. RAM floor 705,464 kB —
Lever's heavier pages cost RAM comparable to 8 Greenhouse drives.

## Multi-user verdict

- **Session ownership isolation HOLDS.** The board layer refuses
  cross-user session addressing (`WORKER_SESSION_FORBIDDEN`, iso 5/5),
  concurrent creates succeed with distinct ids, and in 376 recorded
  ladder legs (325 drove) no leg ever observed another user's session,
  profile, or outcome.
- **Availability isolation does NOT hold.** All users share 4 shard
  browsers. When a shard's Chromium dies, every user routed to it fails
  — in s2-u4c1/u4c2 the failure hit all four users within the same
  minute — and the host stack as it stands **never recovers**: helper
  processes stay alive, the board HTTP plane stays green (probe p50
  8–12 ms), systemd sees a healthy service, and 100 % of new drives fail
  until a human restarts the unit. One user's crashing drive degrades
  all users; there is no per-user blast-radius boundary at the browser
  plane.
- **Throughput does not scale with users on this host.** Aggregate
  healthy-drive rate peaked at 2.8/min (1 user × 4). Adding users at
  fixed total in-flight (u4c1) kept the early rate but collapsed the
  plane; raising total in-flight to 16 collapsed throughput below the
  4-in-flight rate. The binding constraints, in order: (1) browser-plane
  death without relaunch, (2) board-service event-loop stalls (probe
  p99 4.9–45 s at ≥8 in flight), (3) 2-vCPU saturation (avg CPU
  93–96 %), (4) RAM (floor 674 MB at 8 in flight; the 100 MB stop rule
  never fired — RAM was never the first constraint).

## Findings — classification

### Design-level (structural; reproduce across runs/users by construction)

- **F-S2-1 — Browser-plane death is permanent until manual restart.**
  Shard Chromium dies (per-target `Target crashed` escalating to
  whole-browser closure); helpers live, board HTTP lives, systemd
  reports healthy, every subsequent drive fails at `browser.newContext`
  in <2 s, forever. Evidence: s2-u4c1 (onset 15:44:54Z, 66 DRIVER_ERROR),
  s2-u4c2 (onset 15:56:11Z, 65), s2-u8c1 (staggered per shard, 29).
  The host tree carries a reap-on-crash fix; whatever it reaps, it does
  not restore a dead shard browser on this path. **This is the #1
  blocker to multi-user scale on the host stack as it stands.**
- **F-S2-2 — Shared browser plane = shared fate.** 4 shards serve all
  users; per-user isolation exists at the session layer only. One
  user's crash cascade is every user's outage (F-S2-1 onsets are
  simultaneous across users in u4c1/u4c2). A scale design needs a
  per-user (or per-session-pool) failure boundary plus a browser
  supervisor that relaunches dead shards — or honest per-user capacity
  accounting that treats the plane as one shared resource.
- **F-S2-3 — Board-service event loop stalls under concurrent drives.**
  Probe p99: 8.7 s @ 4 in flight (1 user), 4.9 s @ 8, 45 s (probe
  timeout, 7 timeouts) @ 16; at 16 in flight, calls hit the 120 s
  transport timeout from the first legs (WORKER_TRANSPORT_TIMEOUT ×16
  in u4c4, ×11 in u8c2's partial). Synchronous drive work on the service
  loop makes the control plane unresponsive exactly when load rises —
  the service cannot even refuse work quickly (no SESSION_LIMIT, no
  fast refusal observed; requests queue until they time out).
- **F-S2-4 — No load-shedding vocabulary at the transport seam.** The
  only overload signals a leg can receive are a 120 s timeout
  (WORKER_TRANSPORT_TIMEOUT), a 20 s helper timeout (HELPER_TIMEOUT),
  or a dead-browser error. Nothing answers quickly with "busy, retry
  later", so overload burns 120 s per leg and the bench (and, by the
  same seam, the product) cannot distinguish a dead plane from a busy
  one without probing out-of-band.

### Single bugs / narrower defects

- **F-S2-5 — Unknown-user error taxonomy masked.** An unseeded user id
  surfaces as `BATCH_RPC_TRANSPORT_FAILED` instead of the designed
  `BATCH_PROFILE_NOT_FOUND`: `supabase-transport.cjs:59` throws the
  transport code for any failed read (the file's own header, line 28,
  documents that contract), so a per-user "profile not found" answer is
  indistinguishable from a transport outage one layer up. One leg,
  127 ms, no drive attempted. Error-mapping bug, single site.
- **F-S2-6 — Board unit restart leaves orphan processes.** `systemctl
  restart` hit `final-sigterm` timeout (journal 15:35:09Z): systemd
  SIGKILLed late, logged "Unit process … remains running after unit
  stopped" for 3 node processes, and started the new unit alongside
  them. Orphans hold RAM/ports-adjacent state across restarts; restarts
  took ~90 s each time in this lane (one took ~3 s — the variance is
  itself the signal). Ops defect in the unit's shutdown contract.
- **F-S2-7 — Per-target `Target crashed` rate at baseline load.** Even
  the healthiest run (control, 1 user × 4) lost 8/23 drives (35 %) to
  mid-drive target crashes. Recovery between legs worked at this load,
  so this is separable from F-S2-1: a per-drive crash-rate problem
  (Chromium stability under swiftshader/2-vCPU contention is the
  standing hypothesis from earlier lanes; not isolated further here).

### Not observed (named so the absence is on record)

- SESSION_LIMIT refusals: none, in any run (cap 64/user never
  approached; peak 4 concurrent sessions per user).
- Cross-user data leakage: none, in 376 recorded legs + the 5/5 iso checks.
- RAM stop rule firing: never (floor 674 MB ≫ 100 MB threshold).
- A doorstep (fully covered prepare) on any S2 leg: none — every
  healthy drive stopped at the TEST profile's uncovered-question or
  attestation gates. That is the profile's coverage limit (class-(c)
  answers are the owner's to give), not a worker defect.

## Closing state

- **Submit flag read-back after the ladder** (sb.py, production,
  read-only, 17:0xZ): `career_cloud_settings` = 0 rows,
  `career_apply_agent_submit_enabled()` = false, `career_apply_jobs` =
  0 — **OFF, identical to the pre-ladder read-back.** Submitted: **0**.
  Real completions: **0**. Doorsteps carded by S2 runs: 0 (every healthy
  drive stopped at a named question/attestation gate).
- Board service left **active** (MainPID 2396, NRestarts=0, the F8
  watchdog's 16:54:09Z restore); executor timer active. No unit was left
  stopped by this lane.
- Raw records for every run (including the VM-killed partials
  `s2-u1c4` and `s2-u8c2`): `~/workspace/bench60-harness/s2-runs/`;
  harness: `~/workspace/bench60-harness/s2/`; per-run summaries
  reproducible with `python3 s2/s2-analyze.py s2-runs/<run>`.
- Not done, named: s2-u8c4 (reason in the ladder table); a re-run of
  s2-u8c2 to a full window (its partial already agrees with s2-u4c4 at
  the same in-flight count); SESSION_LIMIT probing (never approached —
  would need ≥65 concurrent sessions for one user, beyond every S2
  configuration the host survived long enough to reach).
