# SCALE-ON-E2E-GREEN — the scale batteries on the integrated E2E branch — 2026-10-22

Branch: `muse/2026-10-22-e2e-green` @ f0f900f2 (integrated map at that
commit: H1/H2/H3a/H3b/H3/H6 PASS, H4/H5 ENVIRONMENT). This lane ran the
S1-style repo battery, the DB suite, a new claimer volume leg against
the branch's own `workers/career-cloud/drain.ts` + `pg-queue.ts`, and a
5× E2E repeatability set. Repo + tests only; disposable PG16 only; no
deploy, no migration applied anywhere live, no merge, no spend, submit
flag untouched, S2/S3 battery files untouched. Measured vs claimed is
kept apart throughout; every headline number carries its composition.
Raw evidence: `~/workspace/scale-e2e-green-logs/` (sweep.log,
fail-set-compare.json, db.log, agent100.log, edge.log, vol-*.sql/ts,
vol995-driver.log, e2eB-run-1..5.log).

**Real completions: 0.** Everything below is synthetic fixtures on
disposable clusters.

## 1. Full repo battery (S1 method, this branch)

Command (S1's form): `node --test --test-reporter=tap
--test-concurrency=2 tests/*.test.cjs`, deno on PATH (a first attempt
without deno on PATH produced `spawn deno ENOENT` artifacts and was
discarded and re-run clean).

| Battery | Result | Baseline (S1) |
|---|---|---|
| Node sweep (425 files) | **5,298 tests / 5,005 pass / 133 fail / 160 skip** | arch lineage FULL: 5,252–5,291 tests / **206 fail** / 160 skip |
| agent100 | **103/103** | 103/103 on all 8 S1 branches |
| Edge (`deno test tests/edge/`, 149 files) | **897 pass / 0 fail** | — (different lineage inventory; 0 fail is the comparable fact) |
| loop-acceptance | 22/22 | 22/22 |
| portal-apply | 14/14 | 14/14 |
| board-provider | 11/11 | 11/11 |
| submit-integrity | 9 pass / 9 fail (the 9 D-names, Chromium environment) | identical on every S1 branch |

**Failing-set verdict vs the S1 arch-lineage baseline: the integrated
branch's failing set is a strict subset of the baseline — 0 NEW
failures, 73 baseline failures GONE.** The baseline set (206 names) was
re-verified name-identical across S1's audit-table / submit-armed /
chat-begin-caller JSON before comparing. The 73, by file:

| File | Baseline fails gone |
|---|---|
| career-cloud-current-sources-qa | 28 |
| career-cloud-worker-card-bridge-process | 12 |
| career-cloud-card-producer-qa | 10 |
| career-cloud-worker-card-bridge | 9 |
| extension-package-agent | 5 |
| career-apply-engine | 3 |
| career-cloud-card-producer-drift | 3 |
| career-apply-script | 1 |
| career-approve-first | 1 |
| career-email-code-engine | 1 |

These are the WO card/bridge/worker suites — tests-first code whose
passing composition (the cloud claimer, the PG queue, the card
delivery path) did not exist on the lineage base and does on this
branch. Genuineness spot-verified standalone, not inferred from the
sweep: current-sources-qa 28/28, card-bridge-process 12/12,
card-producer-qa 11/11, each exit 0.

Still failing: 133 names in 22 files, **all of them baseline names**
(apply-engine 23 · apply-real-forms 17 · workday-native-fields 16 ·
greenhouse-savedform 15 · apply-script 13 · portal-submit-integrity 9 ·
cloud-worker-card-bridge-lever 7 · email-code-engine 7 ·
cloud-worker-lever 5 · approve-first 4 · cloud-worker 3 ·
cloud-engine-input 2 · posting-location 2 · tailor-quarantine 2 ·
approval-card-browser 1 · gauntlet-r2 1 · gauntlet-r2a 1 · datasets 1 ·
depth-patches-current 1 · finance-build 1 · proactive-wiring 1 ·
trainee-go-live 1). The form-driving continent remains red; the
card/bridge/worker continent is what the integration healed.

## 2. DB suite

`tests/db/run.sh` on disposable PG16 (run as an unprivileged user from
a tree copy, S1's arrangement): **EXIT 0 — 2,029 ok / 0 not-ok.**
S1 measured 2,028 ok on submit-armed and 2,000 on chat-begin-caller;
the chain here includes 20261024130000 (card-cloud bridge) and
20261024140000 (agent cloud begin). The migration layer remains the
healthiest surface measured (S1's negative result holds).

## 3. Claimer volume leg (new) — drain.ts + pg-queue.ts vs disposable PG16

Tier 2 throughout: the drain and queue are the product's own; the
engine is the harness stub (the real engine is environment-bound in
this VM — H4/H5). Seeding: 1,000 card-bound QUEUED rows — 1 minted by
the card machinery (stage-5 shape) + 999 clones. Clone honesty: a
first clone recipe that changed only job_id/url/company was refused
by the product's own authorize with `APPROVED_APPLICATION_CHANGED`
(the approval hashes cover those fields — the product working as
designed). Working clones recompute `engine_approval` with the repo's
own `engineApprovalFromPayload`, keep `approved_snapshot.original`
identical to the payload, and clone the binding rows with hashes
recomputed by `career_apply_canonical` — one transaction per row
(multi-row single-transaction inserts trip the guard's binding
lookup; mechanism not isolated, and the product never inserts that
way — `cloud_tap` is one transaction per card). All 1,000 rows
verified claim-shaped: `career_apply_cloud_refusal` NULL for every
queued row while the gate was open.

Measured runs, in order:

| Run | Shape | Result |
|---|---|---|
| V100 | contexts=1, target 100 | **5 finishes, all `submitted_unconfirmed`, all recorded** — then claims return nothing: refusal flips to `gate_closed`. The stage-1 gate waiver (max_sends=5; the schema CHECK caps max_sends at 1..5) is consumed to exactly 0 (`career_apply_cloud_waiver_left` = max_sends − cloud jobs attempted since issuance). Exactly-once: 5 claimed / 5 distinct / 0 duplicates. |
| V995 | contexts=3, target 995, waiver sidecar (177 re-issuances) | **+10 finishes (15 total), all `submitted_unconfirmed`** — then claims return nothing again: refusal flips to `daily_limit` for all 985 remaining rows. The opt-in function itself sets `daily := least(15, career_apply_daily_limit(user))` — a hard product ceiling of **15 cloud submissions per user per day**. Exactly-once held across both runs: 15 claimed / 15 finished / 15 telemetry events (outcome `submitted`), 0 duplicates, 0 error states, 985 rows left queued and intact. |

So the 100/1,000-row single-user leg is **refused by design, not
failed by the drain**: every row the product's safety economy allowed
(15) was claimed, authorized, and finished successfully. The queue is
built for many users — `career_apply_cloud_claim_at` claims at most 6
per call and round-robins candidates per user — so single-user queue
depth is an anti-pattern the schema declines. Any "N in M minutes per
individual" figure above 15/day is unreachable through these doors as
they stand; that is a cap-constant decision for the owner, not a
defect this lane may tune around.

Claim-call cost (isolated, DB idle): `career_apply_cloud_claim(6)`
with 985 queued / 1 live waiver = **1.88 s per call, returning 0**
(the candidate scan is paid even when everything is capped). With
178 live waiver rows (my sidecar's accumulation), the same call
**exceeded ~170 s** (a 5-call batch was killed incomplete at
14m19s). Cause, from the function source: `career_apply_cloud_
waiver_left` is evaluated per candidate and itself aggregates over
**all live waiver rows** for that user+portal — claim cost grows with
waiver *history*, not just queue depth. Waivers are insert-only and
expire; nothing prunes them from the claim's evaluation set. This is
the waiver axis of S3's claim-cost finding (S3 measured the backlog
axis: ~0.16 s/batch at 1k queued, 2.6–14.9 s at 7–9k).

Second-instance behavior (measured against the real `drain.ts`
entrypoint): instance 1 starts ("Cloud drain up"); instance 2 exits 2
with `DRAIN_ALREADY_RUNNING: another cloud drain holds this
database's lock` — the session advisory lock refuses a second claimer
exactly as designed. SIGTERM to instance 1 prints the designed stop
line and exits with no rows in flight.

**F-034 (executor whole-ledger race): NOT re-run here.** S3's harness
(`tests/db/scale_s3_*`) does not exist in this tree, and F-034 belongs
to a different component — the host executor's snapshot→replace cap
ledger — not to this drain. This drain's exactly-once rests on claim
row locks plus the single-instance advisory lock, both measured
above. F-034 remains **DESIGN ONLY** (S3's fix shape: version token on
the ledger RPC), untouched by this lane.

## 4. E2E repeatability — 5 runs of the full skeleton

Two sets were run; the difference between them is itself a finding.

- **Set A** (PGBIN not in the process env): 4 runs completed with the
  expected map; the 5th run's provisioning failed (`pg_ctl: could not
  start server`). Cause: the skeleton's cleanup stop could not locate
  the PG binaries without PGBIN in the inherited environment, so each
  run leaked a live cluster (~47 MB) into this VM's 512 MB /tmp
  tmpfs; by the 5th run the tmpfs was full. All leaked clusters were
  stopped and removed by hand.
- **Set B** (PGBIN exported): **5/5 runs completed; the printed
  E2E-MAPs are byte-identical across all 5** (same md5), runtimes
  13.2–17.0 s (test-reported). Cleanup leaves only a 4 KB shell dir
  per run; no server leaks.

Map in every completed run of both sets (9/9):

```
H1  chat->card:                        PASS
H2  card->approval:                    PASS
H3a approval->cloud worker (begin):    PASS
H3b approval->cloud worker (claim):    PASS
H3  approval->cloud worker (drain):    PASS
H4  cloud worker->board:               ENVIRONMENT (BROWSER_SANDBOX_REQUIRED)
H5  board->confirmation:               ENVIRONMENT
H6  confirmation->recorded state:      PASS
```

Node's own tally per run: 5 pass / 1 fail — the single "fail" is the
H4/H5 test, which hard-fails by design while recording ENVIRONMENT in
the map (exit 1 ≠ a wiring failure; the classification is the
result). No leg flaked: across 9 completed runs no handoff changed
state.

## Ranked fundamental issues — what scale exposed that the single E2E cannot see

1. **(design) The per-user safety economy caps cloud throughput at
   15 submissions/user/day (opt-in `least(15, …)`) plus 5 sends per
   gate-waiver issuance (CHECK 1..5).** Measured to the row
   (gate_closed at 5, daily_limit at 15). Scale therefore lives in
   user count, not queue depth — and any per-individual throughput
   target above 15/day conflicts with the shipped cap constants.
   Owner decision, not a bug.
2. **(product) Claim-call cost grows with backlog and with waiver
   history.** 1.88 s per claim(6) at 985 queued with 1 waiver,
   returning nothing; ≥90× worse with 178 live waivers
   (`waiver_left` per candidate × per waiver row). An idle capped
   user makes the drain burn ~2 s of DB per poll forever, and waiver
   rows are never pruned from the evaluation set.
3. **(product) The WO form-driving continent is still 133 tests red
   on the integrated branch** (apply-engine, real-forms, workday,
   greenhouse-savedform, apply-script, lever suites). The integration
   healed the card/bridge/worker continent (73 names); the
   form-driving continent remains tests-first code with no passing
   composition in a clean checkout. All 133 are baseline names —
   zero new failures.
4. **(environment / test-infra) The E2E skeleton's cleanup depends on
   PGBIN being in the inherited environment**; without it every run
   leaks a live PG cluster, and back-to-back runs on a small-/tmp
   host self-exhaust disk by the ~5th run (measured). Fix shape:
   pass the provisioned PGBIN to the stop call. This is the
   repeatability gate's own reliability, not product code.
5. **(design-open) There is no supported way to mint valid card-bound
   applications at volume.** The card fixture is a fixed corpus
   (~20 tags); a valid item must satisfy engine_approval / manifest /
   snapshot invariants only the fixture generator knows. Volume
   seeding for any future scale run needs a real fixture generator —
   today it is hand-cloning with the repo's own hash functions.
6. **(environment) H4/H5 stay ENVIRONMENT on this VM** (sandboxed
   Chromium cannot initialize for any user — proven by the H4 lane,
   not re-litigated). Board-leg throughput at scale on the integrated
   branch (S2's shard-death axis) is therefore still unmeasured here.
7. **(product, carried) F-034 — the host executor's whole-ledger cap
   race — is untouched by this integration** and remains DESIGN ONLY.
   The new drain does not share its shape (row-locked claims,
   single-instance lock, both measured), but the executor side has no
   new evidence either way.

Harnesses for §3 live in `~/workspace/scale-e2e-green-logs/`
(vol-gen.ts, vol-clone-one.sql, vol-drain-driver.ts, vol-run-995.sh) —
workspace records, not repo files, per the lane split.
