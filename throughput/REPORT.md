# Throughput lane — FINAL REPORT (2026-10-21, branch muse/2026-10-21-throughput)

Benchmark (owner, 2026-10-21 11:59 CDT): beat Tsenta's 50 applications in 30 minutes —
50 postings prepared + approved in ONE batch, submitted within 30 min, test world
first, per-batch hash approval intact. Every number below was measured in this run
by the named method; estimates are labeled ESTIMATE. Raw records: `BASELINE.md`,
the harnesses in this directory, `docs/career/throughput-handoff-2026-10-21.md`.

## Headline

- **Everything except the browser drives costs ~6 seconds for a batch of 50**
  (feed 5.1–5.4 s + prepare screening/tailoring ~0.4–1.5 s + approve/execute 17–25 ms,
  all measured in the test-world cycle). The benchmark is won or lost entirely in
  the drive leg.
- **The worker could not drive at all this morning** — three stacked causes, all
  measured and all fixed at the config layer (below). First full doorstep drive
  after the fix: 163 s for a partial (6-fill) form.
- **As fixed, the pipeline lands an ESTIMATE of ~2–4 of 50 in 30 minutes** on this
  host. The binding constraint is the drive leg: ~11–28 s per field fill inside a
  single serial command lane, paid TWICE per application (prepare + approve
  re-drive). Topology alone cannot close a ~15–25× gap on a 2-vCPU host; the
  per-fill cost itself must fall (worker-code profiling, handoff F3/F7 + per-call
  evidence).

## Bottleneck table

| # | Stage | Measured cost (method) | Class | Fix |
|---|---|---|---|---|
| 1 | Feed: 600-row recency window is the only shelf view | **0 eligible** postings for the benchmark shape (SWE intern, greenhouse) in the window; the 50th eligible sits ~8,032 rows deep; shelf total 91 (production loader + 121 classifiers, live KB) | Fundamental | **FIXED on this branch** — queue-feed.cjs targeted top-up: 50 driveable eligible assembled in **5.1–5.4 s** (18 boards, 7,406 rows scanned); guard 6/6; in-executor stops 15 → 0 |
| 2 | PostgREST / transport paging | every read caps at **1,000 rows** (limit 2500 → 1000 returned); worker transport has **no offset** | Fundamental (transport design) | Worked around per-board; owner spec F6 (Range paging) |
| 3 | Feed data: employer-site wrapper URLs | **29 of 91** eligible postings carry URLs the §6.3 gate refuses at session creation (URL census via 150 hostAllowed) | Incidental (data) | **FIXED in queue-feed** — hostAllowed is part of eligibility + ordering contract (guard-proven) |
| 4 | Board session cap | default 32/user → **33rd session of a 50-batch refused 409 SESSION_LIMIT** (probe: 32 created, 33rd refused) | Incidental (config) | **FIXED live** — board-config maxSessionsPerUser 64; after: 40/40 probe sessions created |
| 5 | Executor start lag | oneshot timer 60 s; idle drain ~2 s (journal) | Incidental (config) | **FIXED live** — OnUnitActiveSec 20 s (read back from the timer) |
| 6 | Executor shape | oneshot process per drain; intents + postings strictly serial; drains never overlap | Fundamental | Owner spec F2 (resident executor + drive pool) |
| 7 | Board service | synchronous handle() + Atomics.wait: during a drive, a no-op probe's latency hit **p99/max 27.9 s** (idle p50 23–39 ms) | Fundamental | Owner spec F4/F1 |
| 8 | Browser helper | ONE Chromium per service; command pump awaits each command across ALL boards — globally serial; 2 concurrent drives interleave on one lane, and one transport failure (WORKER_UNREACHABLE) was observed under concurrency (service itself: NRestarts=0) | Fundamental | Owner spec F3/F1 |
| 9 | Per-fill in-page cost | **fills 11–28 s each, uniformly** (3 drives, per-call timing); open 7–33 s; form 1–12 s; answers 0.6–11 s; helper settle waits are sub-second, so the cost is in-page widget work/readbacks on a proxy-loaded page on 2 vCPU — root-cause split NOT_RUN (handoff carries the profiling spec) | Fundamental | Owner spec (profile cmdFill/driveWidget/readback) |
| 10 | Double drive | prepare and approve run in separate oneshot processes; 155's sessions live in a per-process Map → every posting is driven twice end-to-end | Fundamental | Owner spec F2 (resident executor holds sessions inside their TTL) |
| 11 | Drive path down (egress/Chromium) | 100% of drives failed at open: stub headless-shell dir in /root/.cache (no binary); Chromium CONNECT to the egress proxy refused (curl: 200) + env proxies ignored; interception CA untrusted (ERR_CERT_AUTHORITY_INVALID through a relay) | Incidental (config) | **FIXED live** — upmore-egress-relay.service (:8474) + UPMORE_CHROMIUM_PATH wrapper (--proxy-server + --ignore-certificate-errors, the helper's own knob; ci-browse posture). After: page load 200 in 12.0 s; full drives complete |
| 12 | Worker-host durability | VM replacement wiped ALL worker units **twice in one day** (~11:05 and 12:30 CDT; the second mid-benchmark) | Fundamental (host class) | Restore procedure measured: detection → gates green ≈ 10 min; owner spec F8 (auto-restore/watchdog) |

## Ruled boundary — caps (owner ruling 2026-10-21 12:06 CDT; NOT a bottleneck, nothing changed)

TEST world is uncapped by design; LIVE caps stay on permanently. Measured in-engine
(SPEC_CAPS are code constants in module 149, counted from the cap ledger; the
test-world cycle above ran with them in force):

- **perVendorPerDay = 5 binds first** on an all-Greenhouse queue: the fixed feed's
  approve drain submitted exactly **5**, deferred_cap 45.
- **perDay = 15 binds at submission 16** (the owner's headline number) on any queue.
- **perCompanyPer30Days = 1** binds at each company's 2nd posting — with the
  pre-fix feed (RocketLab-heavy selection) it alone deferred 34 of 35.
- The chat rate limit (60 req/60 min/user) does not bind the batch path: one batch
  costs 2 chat turns; all 50 drives are worker-side.

## End-to-end projection — TEST world, 50 in one batch, as fixed

| Leg | Cost for 50 | Evidence |
|---|---|---|
| Queue feed (driveable eligible) | **5.1–5.4 s** | measured ×3 (queue-feed in the executor cycle) |
| Prepare: screen 4,370 + tailor + card | **0.4–1.5 s** | measured (prepare drain 5,588–5,765 ms minus feed) |
| Approval (hash-bound, one tap) | ~0 s machine time | the owner's tap; card hash verify in-engine |
| Approve + execute, in-engine | **17–25 ms** | measured (sandbox boards) |
| **Drive leg ×2 (prepare doorstep + approve re-drive), real pages** | **the whole game**: per app ≈ open 7–33 s + form 1–12 s + fills 11–28 s × fields + answers 1–11 s, ×2 legs. A 15-field form ≈ 3–7 min/leg (ESTIMATE from the measured per-call distribution) | per-call timings from 4 real drives (Gusto ×3, Robinhood ×1) |
| **Total as fixed** | **≈ 2–4 of 50 in 30 min** (ESTIMATE band) | serial sum of the above |

What has to be true to hit 50-in-30 (each factor's status):
~1.4 apps/min sustained ⇒ with K parallel board processes and per-leg drive time T,
K/T ≥ 1.4/min. K=2 (this host's realistic ceiling: 2 vCPU, ~2.9 GB free; one
Chromium tree swings whole-box chrome RSS by roughly +0.6–1.2 GB — noisy shared
box, re-measure quiet) needs T ≤ 85 s/leg, i.e. per-fill ≈ 2–3 s — a ~7–10×
in-page improvement that is **NOT_RUN** (nobody has profiled where a fill's
11–28 s goes). K=4 + per-fill ~5 s also lands it, on a bigger host. The fixes are
sequenced in the handoff: F1 topology → F3 helper concurrency → the fill profile.

NOT_RUN, named: the submit leg's timing on real pages (doorstep drives only, by
design — no real submissions in this lane; the sandbox submit leg is inside the
17–25 ms approve drain) · atReview cost on real pages (every real drive stopped
at ANSWER_OBSERVATION_MISMATCH with the test profile before review — the mismatch
itself is the F-007-class answer-coverage defect, not a throughput quantity) ·
per-fill root-cause split (page CPU vs proxy waits) · Chromium RSS per session on
a quiet host.

## What the pending closure deploy changes for throughput (structural only)

Receipts/outbox waves make the queue→drive→receipt path durable per action (one
RPC write per action — negligible beside 20 s fills); form_answers gives 149's
answers a schema home (throughput-neutral until the F-007 consumer reads it);
the authority wave swaps claim/hook bodies at identical signatures (drain
semantics unchanged). Nothing in the closure touches the serialization stack —
apply throughput is a worker-architecture problem, not a schema problem.

## Fixes applied by this lane (all with before/after pairs above)

1. Worker drive path restored (relay unit + Chromium wrapper drop-in) — drives
   went from 100% failure at open to completing.
2. Board session cap 32 → 64 (33rd-session refusal removed).
3. Executor timer 60 s → 20 s.
4. queue-feed.cjs + guard (6/6) on this branch — feed 0 → 50 driveable eligible
   in ~5 s; wiring into the executor config is one line for the config owner
   (handoff F5). Full worker stack also restored after the 12:30 CDT VM wipe.
