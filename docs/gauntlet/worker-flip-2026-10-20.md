# Worker flip record — 2026-10-20 (career worker switched ON)

Lane: worker flip (operator wiring only — no code changed, no
agent-chat code touched, env only). Authorization: the owner
approved the full 2026-10-20 supply list ("i approve everything");
the worker-host item resolves to **this VM** with the recorded
Chromium sandbox opt-out (`UPMORE_CHROMIUM_SANDBOX=off`). Project:
upmore ONLY (mrwngntwmnaqrqhupvlt). Live product during the flip:
agent-chat **v242** (4b4e7981). Operator checklist of record:
`~/workspace/your_files/career-worker-operator-checklist-final.md`
(§2 items 1, 2, 6, 7, 8 marked DONE there; smoke graded in its §5
execution record; standing state + incidents in its §10).

## Standing configuration after the flip

One shared worker secret was generated on this VM
(`openssl rand -hex 32`). Its VALUE appears in no report, log,
file, or commit beyond its three sanctioned homes:

- (a) Supabase function secrets `UPMORE_CAREER_WORKER_URL`
  (= `http://127.0.0.1:8471`) + `UPMORE_CAREER_WORKER_SECRET` on the
  upmore project — set via `sb.py secrets-set` with values piped by
  stdin; verified present BY NAME ONLY via `secrets-list` (sb.py's
  rc=3 "provider response was not valid JSON" on secrets-set is
  the known spurious error; the sets landed).
- (b) `/home/hatch/worker-config/board-config.cjs` (mode 600):
  `{ port: 8471, secret: <the shared secret>, familyVerdicts:
  { greenhouse: true } }` — every other family omitted = fail-closed.
  `resolveResumePath` omitted → the service default (no path) —
  a named follow-up before the first real batch (§Follow-ups).
- (c) `/home/hatch/worker-config/executor.env` (mode 600, systemd
  EnvironmentFile): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  (fetched transiently from the Management API into the file;
  never printed), `WORKER_BOARD_URL=http://127.0.0.1:8471`,
  `WORKER_SECRET=<the shared secret>`. Config dir mode 700,
  outside the repo. `executor-config.cjs` assembles Lane E's
  production sources + supabase transport from that env and binds
  `boardForFor(userId)` = the J9 provider over the sync HTTP
  transport to `WORKER_BOARD_URL`, per batch-executor.cjs's
  documented composition pattern.

systemd units (in /etc/systemd/system — EPHEMERAL on this VM class;
recreate from these texts after any VM replacement, then
`systemctl daemon-reload` + enable/start + re-verify):

- `upmore-career-board.service` — Type=simple, Restart=on-failure,
  enabled at boot. ExecStart: `node
  workers/career-browser/board-service.cjs
  /home/hatch/worker-config/board-config.cjs`, WorkingDirectory =
  the candidate worktree. Env: the egress-proxy block
  (http_proxy/https_proxy/HTTP_PROXY/HTTPS_PROXY =
  http://hatch-egress-proxy:3128, NODE_USE_ENV_PROXY=1,
  NODE_EXTRA_CA_CERTS + SSL_CERT_FILE = the egress CA bundle) +
  **NO_PROXY/no_proxy = 127.0.0.1,localhost** +
  UPMORE_CHROMIUM_SANDBOX=off.
- `upmore-career-board-smoke.service` — same shape, no [Install];
  ExecStart `node /home/hatch/worker-config/board-smoke-launcher.cjs`
  (the real board service with module 149's sandbox-board factory at
  the factory seam, port 8472, same secret, verdicts
  {greenhouse: true}). STOPPED in the standing posture; used only
  for §5-style smokes.
- `upmore-career-executor.service` — Type=oneshot,
  EnvironmentFile=/home/hatch/worker-config/executor.env, the same
  proxy+NO_PROXY env block (NO_PROXY is load-bearing here — see
  Incident 1). ExecStart: `node
  workers/career-browser/batch-executor.cjs
  /home/hatch/worker-config/executor-config.cjs`.
- `upmore-career-executor.timer` — OnBootSec=30s,
  OnUnitActiveSec=60s, enabled.

## Verification evidence

**Board gates (both instances, real HTTP):** no secret → 401;
wrong secret → 401; Lever session → 403 FAMILY_NOT_DRIVEABLE;
unlisted host (example.com) → 403 DRIVER_HOST_REFUSED (the §6.3
gate fires before the verdict gate). Smoke instance full
lifecycle: Greenhouse session → 201; open → 200; form → 200 with
10 fields; wrong user → 403 user_mismatch; unknown method → 400;
close → 200; call after close → 404. No Greenhouse session was
ever created on the production instance (gate probes only) — the
201 lifecycle was proven on the sandbox-factory instance, Lane D's
pattern. After the NO_PROXY fix, a session lifecycle driven
through the executor's exact provider stack (bridge provider +
sync transport) completed in **167 ms**.

**Executor:** drains against the live RPCs return
`{"batchExecutor":"drained","results":[]}` and exit 0; the timer
fires unattended every ~60 s. Restart-recovery: both board
services were restarted and re-verified enforcing 401s; the timer
kept its schedule.

## Post-flip smoke (checklist §5; test user only; sandbox boards)

Driver + full verbatim capture:
`~/workspace/prune-lane/worker-flip/flip-smoke.py` +
`flip-smoke-results.json` (same directory). Board traffic went to
the smoke instance (:8472) for the smoke's duration; the executor
was then re-pointed to :8471 and re-verified draining empty.

- **§5.1 PASS.** "apply to 3 software engineering intern roles" →
  reply: "I've handed this batch to the browser worker to prepare:
  it will find 3 software engineering intern roles, screen out the
  ones that don't fit, tailor each application, and bring the batch
  back here at the final review screen. Nothing has been filled or
  submitted yet — ask me for the batch status and I'll read back
  exactly where it stands." Prepare intent committed (run
  batch-fnv1a-8bbd7b). No prepared/submitted claim.
- **§5.2 PASS on execution; doorstep state not reached (named
  reason).** One drain → intent `completed`; run record:
  found 600, 5 duplicates removed, screened out 4 named
  (clickhouse, reddit, databricks, Braze — knockout requirement),
  591 eligible, 588 deferred beyond the 3 named. The 3 selected
  (gusto — AI/IT Controls Engineer, Enterprise Applications;
  natera — Senior Product Manager, Provider and RWD; natera —
  Product Manager) each drove the sandbox board and stopped
  **UNCOVERED_QUESTION**: "a required question has no confirmed
  fact — nothing was invented to fill it". The live test profile
  carries no attestation facts and the sandbox form requires one;
  the stop is the product's designed honesty, not a wiring fault.
  Zero doorsteps → the run's honest terminal state is `completed`
  (not `awaiting_approval`), `cardSha256` null (no card exists).
- **§5.3 PASS.** "batch status" readback in-thread speaks the
  record exactly: counts, screened-out names + reason, the three
  stops, the deferred count.
- **§5.4 bare yes — PASS on the safety property.** Intents
  4 → 4; nothing executed. Copy note: the reply was the router's
  generic fallback ("I didn't catch that. Try naming the job,
  company, or person…"), not the batch-specific refusal sentence.
- **§5.4 approve + §5.5 execution — NOT EXERCISED.** No doorsteps
  → no approval card → nothing to approve. The approve →
  SBX-submission leg remains tier-2 proven (Lane D / J10
  composition, checklist §1) with a covering fixture profile.
  Named blocker for a live re-run: the TEST user's attestations
  must come to exist through the product's own confirmation path
  (never direct state writes).
- **§5.5 claim-once — PASS.** An extra drain changed nothing
  (run rows identical including `updated_at`; `results: []`).
  Cap-ledger rows for the test user unchanged (no submissions).
- **§5.6 PASS.** Final readback identical in substance to the
  worker's record.
- **Named-apply (lane addition) — engagement PASS, posting
  fidelity FAIL.** The owner's sentence verbatim ("I want to apply
  to the Finance Intern (Summer 2027) role at Gusto. The posting
  is on Greenhouse. Please handle the application for me.") →
  reply hands "the Finance Intern (Summer 2027) role at gusto" to
  the browser worker; a count-1 prepare intent committed and
  completed (run batch-fnv1a-eb57d6) — the v242 BOARD_NOT_WIRED
  terminal stop is gone on the live path. BUT the worker prepared
  a different Gusto posting (AI/IT Controls Engineer, Denver;
  stopped UNCOVERED_QUESTION): the executor's `postingsFor` loads
  only the plain 600-row pool, while the in-turn path supplements
  with the targeted named-role lookup (`loadTargeted`) that finds
  the named posting beyond the window. Follow-up below.
- **Selection breadth observation:** 155's screening marked
  591/600 eligible for "software engineering intern roles" and the
  top 3 were not intern-titled. Screening relevance belongs to the
  router/155 lane; recorded so the selection is never misread as
  a wiring fault.

## Incidents (both closed; operator/platform, not code defects)

1. **Proxy fence.** The executor unit first carried the proxy env
   block WITHOUT `NO_PROXY`. With `NODE_USE_ENV_PROXY=1`, Node's
   fetch proxied even loopback board calls; drives stalled toward
   the 120 s transport timeout. Diagnosis was layered (Supabase RPC
   transport, pool/flow-state reads, and the board service each
   timed ≤ ~1 s standalone; the executor showed live connections
   only to the proxy :3128 and none to :8472). The claimed prepare
   (run batch-fnv1a-dbf219) was stopped by me and stays fenced
   `uncertain` forever — the §6 safe end state, never re-driven.
   Fix: NO_PROXY in the units (above); provider lifecycle then
   167 ms.
2. **VM replacement mid-smoke.** /tmp wiped; /etc unit files gone;
   all processes dead. A second claimed prepare (run
   batch-fnv1a-2f164b) fenced `uncertain` mid-prepare — claim-once
   held under host death: no half-execution, no blind retry. A
   third prepare from the same pre-replacement driver (named-
   apply, run batch-fnv1a-1b0f47) had completed and saved its run
   minutes before the replacement. Recovery ≈ 4 minutes: configs
   + secret survived under /home/hatch; Supabase secrets + DB are
   remote; units recreated from this record; 401s + empty drains
   re-verified; the smoke then re-ran clean from scratch.
   **Supervision honesty: systemd supervision covers crashes and
   restarts on a living VM (verified). It does not survive a VM
   replacement unattended — unit files live in ephemeral /etc and
   must be recreated from this record; everything then
   re-verifies deterministically.**

## Rollback (not triggered)

The smoke leaves the product strictly better than the pre-flip
state (batches engage the worker and stop honestly by name instead
of terminating BOARD_NOT_WIRED). Rollback remains checklist §6
verbatim: `sb.py secrets-delete` the two names, stop the units —
the product returns to honest BOARD_NOT_WIRED stops; the schema is
additive and inert; fenced intents stay fenced.

## Follow-ups named (not built by this lane)

- **resolveResumePath**: wire the board-service config to the
  user's own stored resume artifact before the first REAL batch is
  approved (today: no path — a drive needing an upload stops
  named at that seam).
- **Named-posting fidelity in the worker pool**: pass the run
  skeleton's named target through the shared loader's targeted
  supplement on the worker side, mirroring the in-turn path.
- **Live approve → SBX leg**: re-run §5.4–5.5 once the test user's
  attestations exist via the product's own confirmation path.
- Playwright for real drives: module 150 resolves it at drive
  time (UPMORE_PLAYWRIGHT_PATH per checklist §4); the flip's
  smokes used sandbox boards, so no browser was launched.
