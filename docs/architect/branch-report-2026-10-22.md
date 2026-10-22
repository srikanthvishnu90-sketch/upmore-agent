# Branch report (2026-10-22)

Built against `consolidate/2026-10-22`, the branch that puts trunk, the landing pin (348c2d4a), the fix line that production was deployed from (forked at v242) and today's fix branches into one tree. **Nothing was deleted.** This report is so the owner can delete safely.

| Status | Count | What it means | Safe to delete after this branch merges? |
|---|---|---|---|
| contained | 203 | every commit is already in the consolidated branch | yes |
| equivalent | 135 | its commits are present as identical patches (cherry-picked or rebased) | yes |
| docs-only | 20 | what it adds is only docs, notes, ledgers or evidence | yes, unless a note is wanted |
| keep-not-carried | 4 | in history, but its work was deliberately left out (listed below) | **no** — the code lives only there |
| unique-code | 196 | holds code that is not in the consolidated branch | **no** — review first |

## Keep: work deliberately not carried

- `muse/2026-10-22-session-reuse` — F-031 session reuse (prepare -> approve in one drive): built on the awaiting_attestation design trunk replaced with WO-094; redo on trunk.
- `muse/2026-10-21-widget-attach` — File-identity resume upload design; trunk kept its own resume-upload slots. Its F-018 readback fix IS carried.
- `muse/2026-10-22-event-driven-fills` — Event-driven waits (speed only); not carried, F-032 existed only with them.
- `work/extension-on-trunk` — The second assisted-apply extension (packages/extension + extension-sync); trunk ships extension/.

## Unique code, newest first (review before deleting)

| Branch | Last commit | Commits not in consolidated | Code files | Last subject |
|---|---|---|---|---|
| `arch/chat-approval-card-binding` | 2026-10-22 | 2 | 8 | Option A wording: chosen under the owner's delegation, not a rule he stated |
| `arch/grad-year-ask` | 2026-10-22 | 1 | 3 | fix(apply): a graduation/class/end year box takes only an answer that states a year |
| `arch/mail-trainee-row` | 2026-10-22 | 1 | 3 | fix(mail): employer replies move the right application: Trainee's rows carry their posting |
| `arch/networking-real-people` | 2026-10-22 | 1 | 11 | #20 networking: real people only, with a source; a guard that never invents anyone; nothin |
| `arch/waiver-counts-sends` | 2026-10-22 | 1 | 3 | held(item 16, option B): a cloud waiver counts possible sends, not claims (not applied) |
| `ci/card-cloud-browser-baseline-20261022` | 2026-10-22 | 17 | 31 | ci: isolated browser-only cloud bridge proof; never merge |
| `ci/card-cloud-gate-only-20261022` | 2026-10-22 | 1 | 1 | ci: isolate full free gate without database job |
| `ci/card-cloud-pg16-acceptance-20261022` | 2026-10-22 | 3 | 2 | ci: retest corrected disposable fixtures with direct failure evidence |
| `ci/card-cloud-pg16-export-20261022` | 2026-10-22 | 2 | 2 | ci: export successful disposable retest evidence only |
| `feat/submission-completion-notify` | 2026-10-22 | 3 | 11 | Submission-completion notification (owner commission 2026-10-21 #4): 149 emits exactly one |
| `fix/alert-delivery-enqueue` | 2026-10-22 | 3 | 12 | Alert delivery: BUG-277 — an interest with no location list has no location gate; detected |
| `fix/mi124-assertion-capture` | 2026-10-22 | 3 | 12 | MI-124 (LF-10): stated-facts capture writes only from assertions — people-search turns and |
| `muse/2026-10-22-chat-begin-caller` | 2026-10-22 | 5 | 12 | F-030 SQL LEG RUNS + ROLLBACK PIN FIXED (rebase follow-up): tests/db/run.sh exits 0 on PG1 |
| `muse/2026-10-22-submit-armed` | 2026-10-22 | 6 | 13 | Chunk 100% submit path ARMED: gate report + dry exercise (28/28) on the branch's final sch |
| `ops/first-send-owner-steps` | 2026-10-22 | 4 | 3 | held(item 5): the owner's first-send steps as hash-bound held files, with a read-only read |
| `ops/held-live-apply-card-bridge` | 2026-10-22 | 1 | 2 | ops: held live apply for the Messages card + card->cloud bridge (not run) |
| `wo/f006-seniority-morphology-20261022` | 2026-10-22 | 3 | 16 | F-006 include independent QA raw reproduction evidence [skip ci] |
| `ci/brain-eval` | 2026-10-21 | 117 | 4 | WO-061 data: held-out eval, run 39606066270 (WO-061: held-out agent passes 34, 37, 34, 33, |
| `ci/brain-reliability-one-20261021` | 2026-10-21 | 1 | 1 | ci: measure one pinned brain candidate within the reserved dollar |
| `ci/brain320-failure-analysis-20261021` | 2026-10-21 | 3 | 1 | eval: prove tracker and qualitative claim guard gaps locally |
| `ci/brain320-higher-20261021` | 2026-10-21 | 5 | 1 | eval: launch approved eight-dollar higher arm after reported mini analysis |
| `ci/brain320-higher-ledger-recover-20261021` | 2026-10-21 | 1 | 1 | Export existing higher cost ledger without provider access |
| `ci/brain320-mini-20261021` | 2026-10-21 | 1 | 1 | eval: launch owner-approved mini on verified 22671697 integration |
| `ci/brain320-recover-20261021` | 2026-10-21 | 1 | 1 | ci: recover existing mini evaluation ledger without model calls |
| `codex/case2-greeting-20261020` | 2026-10-21 | 9 | 39 | Keep parameterized start commands outside greeting orientation |
| `codex/correction-current-goal` | 2026-10-21 | 3 | 10 | Record portable correction handoff 38-test verification |
| `codex/fresh-profile-owner` | 2026-10-21 | 3 | 8 | review: package fresh-profile ownership proposal and QA repro |
| `codex/search-provider-parity` | 2026-10-21 | 2 | 6 | review: package synthetic search-provider parity gate and proof |
| `codex/tracking-row-identity` | 2026-10-21 | 2 | 7 | docs: clarify offline QA and authorized publication |
| `fix/negotiation-capture` | 2026-10-21 | 2 | 8 | Job Radar scheduler: stale-fence repair — refresh once on the fence raise, never when paus |
| `muse/2026-10-20-batch-trigger-fix` | 2026-10-21 | 2 | 3 | docs(evidence): batch trigger fix — live transcripts, DB probe, iteration-1 record |
| `muse/2026-10-20-ci-base-repair` | 2026-10-21 | 8 | 14 | docs(ci-base-repair): close the record — fix log, two product-real filings, final arbiter |
| `muse/2026-10-20-link-liveness` | 2026-10-21 | 4 | 13 | docs(evidence): link liveness PR package — F-003 verbatim, 60-URL live proof, collision hi |
| `muse/2026-10-20-loop-writer` | 2026-10-21 | 3 | 9 | Regenerate router bundles from the packaged sources (CI freshness) |
| `muse/2026-10-20-surfacing-status` | 2026-10-21 | 3 | 4 | Regenerate router bundles from the packaged sources (CI freshness) |
| `muse/2026-10-21-ask-on-missing` | 2026-10-21 | 2 | 4 | ASK-ON-MISSING (module 172): a required field is covered only by a user-stated confirmed f |
| `muse/2026-10-21-board-session` | 2026-10-21 | 4 | 2 | Package C: 50-drive before/after pair + isolation smoke, package complete |
| `muse/2026-10-21-connector-assembly` | 2026-10-21 | 10 | 16 | Connector assembly 6/6: assembly record + deploy checklist + BUILD-STATUS claim |
| `muse/2026-10-21-connector-consent` | 2026-10-21 | 2 | 2 | connector consent (Lane B pkg 1): 157-career-connector-consent — consent data model |
| `muse/2026-10-21-connector-gate` | 2026-10-21 | 3 | 2 | Connector gate integration note: exact call sites (build-router-core names/exports, handle |
| `muse/2026-10-21-connector-intro` | 2026-10-21 | 3 | 2 | connector intro composer: renumber 156 -> 159 (coordinator assignment — 156 is the gate pa |
| `muse/2026-10-21-connector-match` | 2026-10-21 | 2 | 2 | Connector match (158): double opt-in state machine — pure module, 28/28 guards pass |
| `muse/2026-10-21-connector-v1` | 2026-10-21 | 4 | 7 | Connector integration design: package wiring, seams, assembled guard list |
| `muse/2026-10-21-consent-capture` | 2026-10-21 | 3 | 3 | CAPTURE: integration note — assembly call sites + carriage read/write points |
| `muse/2026-10-21-correction-privacy-fix` | 2026-10-21 | 3 | 9 | MUSE-F-014: PR body — fail-first to pass on Codex's exact repro, sweep delta |
| `muse/2026-10-21-cover-letter` | 2026-10-21 | 3 | 3 | 167 stub-swap completion: D-007 proof premise now expects module167 (real reader); suite 1 |
| `muse/2026-10-21-decline-vocab` | 2026-10-21 | 1 | 3 | DECLINE-VOCAB: 149's EEO-decline acceptance aligned to one meaning class |
| `muse/2026-10-21-dropdown-measure` | 2026-10-21 | 1 | 44 | DROPDOWN-MEASURE lane: instrumented doorstep harness + census + 50-interaction evidence ba |
| `muse/2026-10-21-facts-parser` | 2026-10-21 | 1 | 2 | 170: texted-facts parser — deterministic free-text -> provenance-stamped draft facts |
| `muse/2026-10-21-fe-approval-ui` | 2026-10-21 | 3 | 8 | FE-B APPROVAL CARD + ASK UI (module 175): the Messages card IS the cloud-worker's approval |
| `muse/2026-10-21-form-inventory` | 2026-10-21 | 2 | 10 | 171 stub swap: module 167 vendored byte-identical, now the default fact reader |
| `muse/2026-10-21-intro-booking` | 2026-10-21 | 3 | 2 | BOOKING note: how booked=true feeds the match count + the Google upgrade path |
| `muse/2026-10-21-intro-delivery` | 2026-10-21 | 3 | 4 | INTRO-DELIVERY integration note: live outbox shapes, write/read-back wiring, channel spec |
| `muse/2026-10-21-intro-followup` | 2026-10-21 | 3 | 2 | FOLLOWUP pkg: trigger design note against the live outbox schema |
| `muse/2026-10-21-match-host` | 2026-10-21 | 2 | 3 | Connector match host (162): persistence adapter + outbox + surfacing — 25/25 guards |
| `muse/2026-10-21-o5-gate-kit` | 2026-10-21 | 3 | 1 | O5 flag-seam memo: CAREER_AGENT_SUBMIT is read only inside Postgres (migration :16/:92), s |
| `muse/2026-10-21-profile-structurer` | 2026-10-21 | 3 | 3 | 167 stub-swap completion: premise now expects provenance.reader.stub === false (real reade |
| `muse/2026-10-21-radar-fence-repair` | 2026-10-21 | 2 | 8 | Job Radar scheduler: stale-fence repair — refresh once on the fence raise, never when paus |
| `muse/2026-10-21-reprepare-card` | 2026-10-21 | 1 | 3 | 173 RE-PREPARE + NEW APPROVAL CARD: answered-state watcher over the career_apply_questions |
| `muse/2026-10-21-resume-structuring` | 2026-10-21 | 2 | 2 | Resume structuring: design + integration note (WO-028/WO-075, F-011 runtime note, board ac |
| `muse/2026-10-21-state-binding` | 2026-10-21 | 2 | 2 | docs: state-of-residence root-cause note + BUILD-STATUS claim (STATE-BINDING lane) |
| `muse/2026-10-21-throughput` | 2026-10-21 | 4 | 13 | throughput lane: final report + host-gate eligibility in queue-feed (guard 6/6) |
| `muse/2026-10-21-throughput-infra` | 2026-10-21 | 6 | 21 | F8 watchdog INSTALLED: cron aligned to kit spec (5m, two-consecutive, single-flight, resto |
| `muse/2026-10-21-trusted-fact-reader` | 2026-10-21 | 2 | 11 | D-007: convert every drafter onto the trusted-fact reader (167) |
| `muse/2026-10-21-worker-drain` | 2026-10-21 | 1 | 5 | Throughput Package A (serial drain): as-deployed drain pin, simulator, staged parallel uni |
| `ops/lever-waiver-held` | 2026-10-21 | 1 | 1 | HELD (not run): the D-010 waiver row for the owner's account, Lever, 5 cloud sends, 7 days |
| `qa/chat-id-quarantine` | 2026-10-21 | 6 | 15 | D-007 quarantine reads the bank range from factId only; a chat profile's own F-027..F-079  |
| `qa/decline-browser-tests` | 2026-10-21 | 3 | 3 | qa: correct npm-registry note in decline browser verdict (registry reachable, ~17s) |
| `qa/worker-recovery-076712eb` | 2026-10-21 | 1 | 1 | QA: independent fault injection for WORKER_UNREACHABLE fix @076712eb |
| `qa/worker-recovery-fc1ccd31` | 2026-10-21 | 1 | 1 | QA: port worker-recovery fault-injection suite to fc1ccd31 ladder (0.75/1.5/3s x2) |
| `train/2026-10-21` | 2026-10-21 | 39 | 51 | WO-097's go-live check names the deploy loop, not its exact text (the loop now also deploy |
| `wo/091d-apply-states` | 2026-10-21 | 9 | 17 | An emailed-code stop is 'Not finished', like every needs_user card (091d F4 meets WO-096) |
| `wo/101-connect` | 2026-10-21 | 4 | 15 | Merge origin/trunk (2f481062) into wo/101-connect |
| `wo/102-deploy-all-functions` | 2026-10-21 | 1 | 3 | Go-live deploys every function the product calls |
| `wo/105-apply-nth` | 2026-10-21 | 1 | 11 | WO-105: find, then "apply to the second one", queues that posting |
| `wo/agent-slice` | 2026-10-21 | 3 | 6 | WO-061: after a waiver ask, an offer of approval that is not per item (once a week, in bul |
| `wo/brain-native-constraints-20261021` | 2026-10-21 | 1 | 4 | fix(apply): enforce native limits before planning and contract fill |
| `wo/brain-reliability-20261021` | 2026-10-21 | 8 | 5 | fix(model): discard truncated tool calls before decoding arguments |
| `wo/brain-reliability-eval-20261021` | 2026-10-21 | 2 | 2 | fix(ci): keep gate reporting from aborting on long failures |
| `wo/c1-pdf-edge-trunk` | 2026-10-21 | 4 | 6 | Merge trunk into wo/c1-pdf-edge-trunk (answer-once flake fixed on trunk by #122) |
| `wo/goal-correction` | 2026-10-21 | 9 | 16 | F-033 ruling regression: frs-qa's 157-case acceptance probe of 98648920 as a permanent arc |
| `wo/lever-driver-readiness-20261021` | 2026-10-21 | 2 | 1 | fix(apply): bind captured acknowledgement wire proof |
| `wo/qa-chat-bank-id-20261021` | 2026-10-21 | 1 | 1 | test(qa): distinguish chat sequence IDs from bank quarantine IDs |
| `wo/typed-field-writer-flow-20261021` | 2026-10-21 | 2 | 2 | feat(apply): project explicitly confirmed first and last names |
| `work/loop-task1` | 2026-10-21 | 2 | 3 | docs(handoff): MUSE-F-005 diagnosis follow-up — family filter's SWE+intern pair is empty o |
| `work/serve-link-liveness` | 2026-10-21 | 3 | 13 | failures: MUSE-F-003 fix recorded — liveness discipline built @ 516e4d43 + 2e283cff, not y |
| `ci/answer-draft` | 2026-10-20 | 12 | 24 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `ci/brutal-battery` | 2026-10-20 | 23 | 7 | WO-087: run 1's harness misreads fixed; run 1 rescored without new model calls [skip ci] |
| `ci/form-capture` | 2026-10-20 | 7 | 111 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `ci/gate-census` | 2026-10-20 | 5 | 6 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `ci/posting-locations` | 2026-10-20 | 2 | 5 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `ci/question-capture` | 2026-10-20 | 4 | 5 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `ci/question-capture-c` | 2026-10-20 | 4 | 6 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `ci/question-capture-d` | 2026-10-20 | 3 | 6 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `ci/question-capture-e` | 2026-10-20 | 3 | 6 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `ci/question-capture-f` | 2026-10-20 | 3 | 6 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `ci/question-capture-g` | 2026-10-20 | 3 | 6 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `ci/question-capture-h` | 2026-10-20 | 2 | 5 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `ci/trainee-tasks` | 2026-10-20 | 23 | 6 | WO-065 data: real-world task battery, run 39505938110 (ROUTER 2/15 ±1, AGENT 11/15 ±2 judg |
| `codex/apply-stack-integration-20261018` | 2026-10-20 | 18 | 19 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/browser-native-recovery-20261017` | 2026-10-20 | 31 | 69 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/career-critical-repairs-20261016` | 2026-10-20 | 159 | 232 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/career-flexible-grounding-20261016` | 2026-10-20 | 69 | 102 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/career-model-gateway-20261016` | 2026-10-20 | 38 | 73 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/conversation-fixes-20261016` | 2026-10-20 | 6 | 27 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/correction-authority-privacy-20261016` | 2026-10-20 | 4 | 15 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/evaluator-live-admission-20261017` | 2026-10-20 | 97 | 164 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/forward-upgrade-preflight-20261018` | 2026-10-20 | 232 | 342 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/greenhouse-submit-handoff-20261017` | 2026-10-20 | 9 | 33 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/greenhouse-vertical-slice-20261017` | 2026-10-20 | 18 | 48 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/mass-applications-20261017` | 2026-10-20 | 227 | 336 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/model-gateway-boundary-review-20261016` | 2026-10-20 | 42 | 79 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/native-browser-integration-20261017` | 2026-10-20 | 199 | 295 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/native-recovery-20261017` | 2026-10-20 | 163 | 235 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/privacy-research-conversation-integration-20261016` | 2026-10-20 | 31 | 62 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/public-research-browser-20261016` | 2026-10-20 | 6 | 18 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/research-conversation-review-20261016` | 2026-10-20 | 23 | 50 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/resume-correction-supersession-20261016` | 2026-10-20 | 35 | 67 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `codex/spec-b-interview-depth-20261016` | 2026-10-20 | 91 | 151 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `discovery/boards-39345730265` | 2026-10-20 | 2 | 9 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `discovery/boards-39377124463` | 2026-10-20 | 2 | 9 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `discovery/boards-39380185627` | 2026-10-20 | 2 | 9 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `discovery/boards-39433413503` | 2026-10-20 | 1 | 5 | board discovery run 39433413503: VERIFIED 27450 boards answered 200 with the expected shap |
| `discovery/label-pool-39345730265` | 2026-10-20 | 2 | 5 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `finish/answer-bindings` | 2026-10-20 | 11 | 10 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `finish/apply-readiness` | 2026-10-20 | 4 | 14 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `fix/bug-240-batch-seam` | 2026-10-20 | 2 | 10 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `fix/portal-driver-r3` | 2026-10-20 | 14 | 15 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `fix/t1-channel-completeness` | 2026-10-20 | 1 | 4 | FIX LANE T1: channel conversation completeness — greeting route, prep-plan route, own-fram |
| `fix/t2-telegram-presentation` | 2026-10-20 | 1 | 4 | T2: Telegram presentation — typing heartbeat, no plain-send bypass, link-safe HTML fallbac |
| `fix/t3-stated-facts-extraction` | 2026-10-20 | 2 | 4 | docs(t3): correct targeted-suites count to the session's terminal summary (55/55, not 195/ |
| `wo/001-green-gate` | 2026-10-20 | 11 | 26 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/009b-2-form-snapshots` | 2026-10-20 | 2 | 10 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/009b-3-acceptance` | 2026-10-20 | 12 | 9 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/009b-3-fill-readback` | 2026-10-20 | 2 | 9 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/009b-3-rendered-readback` | 2026-10-20 | 4 | 9 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/009b-5-worker-pull` | 2026-10-20 | 4 | 21 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/009b-6-coverage` | 2026-10-20 | 3 | 10 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/009b-apply-worker` | 2026-10-20 | 4 | 10 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/044-discovery-scale` | 2026-10-20 | 13 | 23 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/064-short-drafts` | 2026-10-20 | 8 | 24 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/069-posting-pay` | 2026-10-20 | 3 | 11 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/073-title-search` | 2026-10-20 | 5 | 9 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/074-standing-answers` | 2026-10-20 | 10 | 16 | WO-042: Greenhouse option lists and the live fill (never sent) from CI |
| `wo/075-resume-pair` | 2026-10-20 | 3 | 9 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/076-ready-first-build` | 2026-10-20 | 2 | 16 | WO-042: Greenhouse option lists and the live fill (never sent) from CI |
| `wo/081-009b-3-acceptance` | 2026-10-20 | 1 | 4 | WO-081: port wo/009b-3-acceptance (PR #28, C-01): contact precision in module 150 and the  |
| `wo/081-capability2-grounding` | 2026-10-20 | 3 | 12 | Merge origin/trunk into wo/081-capability2-grounding (gate list keeps every line; bundles  |
| `wo/081-pasted-text-injection` | 2026-10-20 | 3 | 11 | WO-081: the injection guards compose with the other ports (MI-106's alert fields, MI-118's |
| `wo/081-portal-families` | 2026-10-20 | 2 | 24 | WO-081: port the seven fellowship portal families (mi098 … mi104) and per-run telemetry (m |
| `wo/081-repost-stale` | 2026-10-20 | 1 | 6 | WO-081: port work/mi106-repost-stale: a reposted job is one record, never a second alert;  |
| `wo/081-resume-supersession` | 2026-10-20 | 3 | 8 | Merge origin/trunk into wo/081-resume-supersession (gate list keeps every line; bundles re |
| `wo/081-site-port` | 2026-10-20 | 5 | 14 | WO-081 record: #104 merged; #111 composes with #116 and #119; the full integration on trun |
| `wo/082-person-scope` | 2026-10-20 | 4 | 3 | WO-042: Greenhouse option lists and the live fill (never sent) from CI |
| `wo/083-corrections` | 2026-10-20 | 2 | 4 | Merge trunk (dc8e5802, fixture scrub) into wo/083-corrections |
| `wo/084-emailed-codes` | 2026-10-20 | 5 | 14 | WO-042: Greenhouse option lists and the live fill (never sent) from CI |
| `wo/086-store-package` | 2026-10-20 | 2 | 11 | WO-042: Greenhouse option lists and the live fill (never sent) from CI |
| `wo/088-router-residuals` | 2026-10-20 | 1 | 4 | WO-088: router residuals from the brutal list, fixed fail-first |
| `wo/097-agent-api` | 2026-10-20 | 3 | 10 | Merge origin/trunk into wo/097-agent-api: go-live keeps #117's career_apply_authority migr |
| `wo/c03-live-assist-guard` | 2026-10-20 | 2 | 9 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `wo/c1-tailor-edge` | 2026-10-20 | 1 | 4 | fix(c1-tailor-edge): module 148 runs without a global Buffer — the resume-confirm tailor l |
| `wo/site-preview-repair-20261020` | 2026-10-20 | 2 | 7 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/depth-154-155` | 2026-10-20 | 2 | 7 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/extension-assist` | 2026-10-20 | 2 | 18 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi023-tailoring-residual` | 2026-10-20 | 2 | 6 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi034-board-tranche2` | 2026-10-20 | 2 | 9 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi034-egress-2` | 2026-10-20 | 3 | 12 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi098-constellation` | 2026-10-20 | 2 | 13 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi099-tally` | 2026-10-20 | 2 | 13 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi100-formassembly` | 2026-10-20 | 2 | 13 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi101-google-forms` | 2026-10-20 | 2 | 13 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi102-neo-bubble` | 2026-10-20 | 2 | 13 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi103-thiel` | 2026-10-20 | 2 | 13 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi104-bespoke-sites` | 2026-10-20 | 2 | 13 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi106-repost-stale` | 2026-10-20 | 2 | 11 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi107-polling-efficiency` | 2026-10-20 | 3 | 10 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi108-duplicate-check` | 2026-10-20 | 2 | 11 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi111-credit-ledger` | 2026-10-20 | 3 | 10 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi114-injection` | 2026-10-20 | 2 | 14 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi117-alert-fatigue` | 2026-10-20 | 2 | 9 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi118-telemetry` | 2026-10-20 | 2 | 11 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/mi121-pasted-email` | 2026-10-20 | 3 | 16 | Scrub: remove the real-draft writing-pattern fixtures (owner-approved 2026-10-20) |
| `work/wave1-mock-t3` | 2026-10-20 | 1 | 6 | wave1(953 burn-down): mock session lifecycle (BL-240..BL-269) + T3 extraction + T1 channel |
| `fix/crew-a` | 2026-10-19 | 3 | 1 | GC pass #2 (MI-045/B-04): register re-synced byte-identical (29-block drift repaired, FR-3 |
| `codex/capability2-review-fixes-20261016` | 2026-10-16 | 2 | 11 | Record unchanged frozen review retest and remaining H20 blocker |
| `codex/conversation-recovery-eval-20261016` | 2026-10-16 | 5 | 7 | Capture exact final branch whitespace diagnostic and evidence hashes |
| `fix/submit-path` | 2026-10-15 | 5 | 6 | BUG-207 guard repair, corrected: runApply's submit delegation merges base() so the armed p |
| `audit/memory-capability-20261013` | 2026-10-14 | 8 | 24 | Continue paid semantic scenarios toward authorized budget ceiling |
| `career/gauntlet-deepdive` | 2026-10-13 | 1 | 1 | gauntlet stage 6: deep-dive RE-GRADE round 2 on bd25d40 — PASS 12/12 cases, 36/36 trials,  |
| `claude/k12-settlements` | 2026-10-13 | 5 | 18 | K12: rebuild router bundle after registry regeneration |
| `claude/k13-vault` | 2026-10-13 | 6 | 9 | K13 fix: vaultDocsKind read the oldest assistant turn, not the latest (previous is newest- |
| `claude/k8-portals` | 2026-10-13 | 4 | 8 | K8 doorstep proofs: PortalCases.doorstep on the guided manual-connect lane (filled review  |
| `claude/upmore-16-spec-instinct-0qyuqj` | 2026-10-13 | 2 | 2 | go-live 39cf441 (5e033cb + the S16-08 roth fact): live gauntlet results — spec16 9/19 (7 b |
| `release/career-build-20261015-v1` | 2026-10-13 | 2 | 2 | go-live 39cf441 (5e033cb + the S16-08 roth fact): live gauntlet results — spec16 9/19 (7 b |
| `codex/upmore-messaging-native-20261010` | 2026-10-11 | 2 | 14 | Wire protected messaging runtime preparation and registry seam |
| `codex/upmore-production-integration-20261010` | 2026-10-10 | 3 | 16 | fix(upmore): apply Codex loop/voice review; harness self-test 10/10 |

## Safe to delete once `consolidate/2026-10-22` is merged into trunk

Run from a clone, after the merge (each line deletes one remote branch; it cannot be undone):

Release and deploy branches (4) are left off this list on purpose: they record what shipped. `main` and `trunk` are never on it.


```bash
git push origin --delete arch/ashby-location-ask
git push origin --delete arch/bridge-authorize-tests
git push origin --delete arch/cap-inventory
git push origin --delete arch/card-cloud-bridge-gate
git push origin --delete arch/engine-input
git push origin --delete arch/eval-meter-wiring
git push origin --delete arch/f001-roles-and-links
git push origin --delete arch/f002-batch-status
git push origin --delete arch/f006-band-and-wrong-zero
git push origin --delete arch/nine-gap-specs
git push origin --delete arch/pin-landing-candidate-bridge
git push origin --delete architect/competitors
git push origin --delete architect/requirements
git push origin --delete architect/task-cards
git push origin --delete career/acc
git push origin --delete career/cir-b1
git push origin --delete career/cir-b2
git push origin --delete career/cir-b3
git push origin --delete career/cir-b4
git push origin --delete career/cir-b5
git push origin --delete career/disc
git push origin --delete career/fin-a1
git push origin --delete career/fin-a2
git push origin --delete career/fin-b
git push origin --delete career/fin-c
git push origin --delete career/fin-d1
git push origin --delete career/fin-d2
git push origin --delete career/fin-e
git push origin --delete career/fin-f
git push origin --delete career/gauntlet-baseline
git push origin --delete career/gauntlet-c-canon
git push origin --delete career/gauntlet-c-var-a
git push origin --delete career/gauntlet-c-var-b
git push origin --delete career/gauntlet-capabsent
git push origin --delete career/gauntlet-conflictscan
git push origin --delete career/gauntlet-contracts
git push origin --delete career/gauntlet-dd-ap
git push origin --delete career/gauntlet-dd-cg
git push origin --delete career/gauntlet-dd-mi
git push origin --delete career/gauntlet-dd-nw
git push origin --delete career/gauntlet-dd-sh
git push origin --delete career/gauntlet-deepdive-regrade
git push origin --delete career/gauntlet-f1-profiles
git push origin --delete career/gauntlet-f2-jobs
git push origin --delete career/gauntlet-f3-forms
git push origin --delete career/gauntlet-g1-guidance
git push origin --delete career/gauntlet-g2-fill
git push origin --delete career/gauntlet-g3-prep
git push origin --delete career/gauntlet-g4-outreach
git push origin --delete career/gauntlet-g5-data
git push origin --delete career/gauntlet-g6-payloads
git push origin --delete career/gauntlet-gate5prep
git push origin --delete career/gauntlet-grader-hardening
git push origin --delete career/gauntlet-grand
git push origin --delete career/gauntlet-item10-build
git push origin --delete career/gauntlet-item10-survey
git push origin --delete career/gauntlet-m1-gate0
git push origin --delete career/gauntlet-m2-grader
git push origin --delete career/gauntlet-niwire
git push origin --delete career/gauntlet-onboarding
git push origin --delete career/gauntlet-personas
git push origin --delete career/gauntlet-pilot
git push origin --delete career/gauntlet-pipeline
git push origin --delete career/gauntlet-r1-routing
git push origin --delete career/gauntlet-r2-containment
git push origin --delete career/gauntlet-r2a-intents
git push origin --delete career/gauntlet-r2b-guards
git push origin --delete career/gauntlet-r3-actions
git push origin --delete career/gauntlet-records
git push origin --delete career/gauntlet-rerun
git push origin --delete career/gauntlet-robust
git push origin --delete career/gauntlet-routegrade
git push origin --delete career/gauntlet-staging
git push origin --delete career/gauntlet-u-journeys
git push origin --delete career/gauntlet-variants
git push origin --delete career/intl
git push origin --delete career/outr
git push origin --delete career/prof
git push origin --delete career/rq-boards
git push origin --delete career/rq-docx
git push origin --delete career/rq-oracle
git push origin --delete career/rq-reply
git push origin --delete career/sc-f01
git push origin --delete career/sc-f02
git push origin --delete career/sc-f03
git push origin --delete career/sc-f04
git push origin --delete career/sc-f09
git push origin --delete career/sc-f10
git push origin --delete career/sc-w01
git push origin --delete career/sc-w02
git push origin --delete career/sc-w03
git push origin --delete career/sc-w05
git push origin --delete career/sc-w08
git push origin --delete career/sc-w09
git push origin --delete career/sc-w11
git push origin --delete career/sc-w12
git push origin --delete career/sc-w13
git push origin --delete career/sc-w14
git push origin --delete ci/answer-once-flake
git push origin --delete ci/apply-bench-no-pr-push
git push origin --delete claude/bugfix-kalshi-connect
git push origin --delete claude/fin-a1-bnpl
git push origin --delete claude/fin-a2-categories
git push origin --delete claude/fin-a3-intake
git push origin --delete claude/fin-a4-dividends
git push origin --delete claude/fin-a5-cadence
git push origin --delete claude/k1-feeds
git push origin --delete claude/k10-payroll
git push origin --delete claude/k11-government
git push origin --delete claude/k2-scheduler
git push origin --delete claude/k3-market
git push origin --delete claude/k4-brokerage-reads
git push origin --delete claude/k5-crypto-tax
git push origin --delete claude/k6-p2p
git push origin --delete claude/k7-bank-actions
git push origin --delete claude/k9-bureaus
git push origin --delete claude/w1-briefs
git push origin --delete claude/w1-detectors
git push origin --delete claude/w1-numbers
git push origin --delete claude/w2-guard
git push origin --delete claude/w2-orders
git push origin --delete claude/w3-guided
git push origin --delete claude/w3-optimize
git push origin --delete claude/w3-p2p
git push origin --delete claude/wave01-build
git push origin --delete codex/capability2-grounded-20261015
git push origin --delete codex/career-bundle-reachability-20261015
git push origin --delete codex/career-host-durability-20261015
git push origin --delete codex/career-owned-browser-worker-20261015
git push origin --delete codex/career-worker-integration-fix-20261015
git push origin --delete depth/alerts
git push origin --delete depth/families
git push origin --delete depth/integration
git push origin --delete depth/knowledge
git push origin --delete depth/memory
git push origin --delete depth/submissions
git push origin --delete docs/backend-audit
git push origin --delete docs/channel-battery-review
git push origin --delete docs/owner-trials-drift
git push origin --delete docs/status-0820
git push origin --delete docs/submission-process
git push origin --delete docs/targets-update
git push origin --delete docs/tonight-test-plan
git push origin --delete filing/battery14
git push origin --delete fix/career-bundle-compress
git push origin --delete fix/channel-integrity
git push origin --delete fix/classify-precision
git push origin --delete fix/complexity-wave
git push origin --delete fix/depth-wave
git push origin --delete fix/draft-subject
git push origin --delete fix/gmail-code-freshness
git push origin --delete fix/go-live-apply-migrations
git push origin --delete fix/ingest-clock
git push origin --delete fix/last-word
git push origin --delete fix/lf-08-target-firm
git push origin --delete fix/lf-09-attribution
git push origin --delete fix/mi123-account-rebase
git push origin --delete fix/named-role-capture
git push origin --delete fix/prep-kb-routing
git push origin --delete fix/probe-d-draft-binding
git push origin --delete fix/v240-live-gaps
git push origin --delete fix/v241-live-gaps
git push origin --delete fix/v242-live-gaps
git push origin --delete fix/worker-resume-upload-live
git push origin --delete integration/channel-rollout
git push origin --delete integration/v2-candidate
git push origin --delete integration/v228-candidate
git push origin --delete integration/v229-candidate
git push origin --delete iterate/named-gaps
git push origin --delete muse/2026-10-20-failures-backlog
git push origin --delete muse/2026-10-20-training-doc
git push origin --delete muse/2026-10-21-bench-50
git push origin --delete muse/2026-10-21-cost-model
git push origin --delete muse/2026-10-21-discovery-quality
git push origin --delete muse/2026-10-21-fdse-mismatch
git push origin --delete muse/2026-10-21-fdse-question-kind
git push origin --delete muse/2026-10-21-fe-dashboard
git push origin --delete muse/2026-10-21-fe-lane-c
git push origin --delete muse/2026-10-21-goal-frame
git push origin --delete muse/2026-10-21-job-radar
git push origin --delete muse/2026-10-21-privacy-fix-v246-line
git push origin --delete muse/2026-10-21-qa-bug-fixes
git push origin --delete muse/2026-10-21-queue-feed
git push origin --delete muse/2026-10-21-scale-plan
git push origin --delete muse/2026-10-21-tailor-buffer-fix
git push origin --delete muse/2026-10-21-worker-recovery
git push origin --delete muse/2026-10-22-audit-table
git push origin --delete muse/2026-10-22-bench-60
git push origin --delete muse/2026-10-22-bench-60-fix
git push origin --delete muse/2026-10-22-decline-vocab-host
git push origin --delete muse/2026-10-22-f027-phone-render
git push origin --delete muse/2026-10-22-f028-location-render
git push origin --delete muse/2026-10-22-f029-gusto-coverage
git push origin --delete muse/2026-10-22-fix-f023
git push origin --delete muse/2026-10-22-fix-f024
git push origin --delete muse/2026-10-22-fix-f025
git push origin --delete muse/2026-10-22-fix-f029-guard
git push origin --delete muse/2026-10-22-parallel-drives
git push origin --delete muse/2026-10-22-s1-parallel-drain
git push origin --delete muse/2026-10-22-telegram-slice
git push origin --delete pivot/career
git push origin --delete prune/career-only-bundle
git push origin --delete qa/bug4-compound-location-rtw
git push origin --delete tools/sim-router-pool
git push origin --delete wo/002-agent-brain
git push origin --delete wo/003-eval-runner
git push origin --delete wo/004-conversation-simulator
git push origin --delete wo/006-job-ingestion
git push origin --delete wo/007a-alert-planner
git push origin --delete wo/007b-alerts-runner
git push origin --delete wo/009a-apply-core
git push origin --delete wo/009b-1-apply-queue
git push origin --delete wo/009b-2-ci-fixtures
git push origin --delete wo/009b-4-apply-cli
git push origin --delete wo/009b-4-engine
git push origin --delete wo/009b-6-question-data
git push origin --delete wo/009b-6-replicate
git push origin --delete wo/009b-7-real-forms
git push origin --delete wo/009b-8-uploads
git push origin --delete wo/013a-channel
git push origin --delete wo/013b1-delivery
git push origin --delete wo/013b2-inbound
git push origin --delete wo/017-board-harvest
git push origin --delete wo/018-trainee-go-live
git push origin --delete wo/019-conversations
git push origin --delete wo/020-meaning
git push origin --delete wo/020-wire
git push origin --delete wo/021-approve-first
git push origin --delete wo/021-receipts
git push origin --delete wo/021-run-loop
git push origin --delete wo/021-w2-w3
git push origin --delete wo/022-card-push
git push origin --delete wo/023-compare
git push origin --delete wo/023-memory
git push origin --delete wo/023-style
git push origin --delete wo/024-mail-tracking
git push origin --delete wo/025-mock-interview
git push origin --delete wo/026-connector
git push origin --delete wo/027-memory-timeline
git push origin --delete wo/028-tailor-in-chat
git push origin --delete wo/029-ask-once
git push origin --delete wo/030-essay-drafts
git push origin --delete wo/031-extension
git push origin --delete wo/032-apply-ops
git push origin --delete wo/033-outreach
git push origin --delete wo/034-brief-digest
git push origin --delete wo/035-voice-mock
git push origin --delete wo/036-guidance-offer
git push origin --delete wo/037-discovery
git push origin --delete wo/038-channels
git push origin --delete wo/039-cloud-worker
git push origin --delete wo/040-mail-accuracy
git push origin --delete wo/041-source-freshness
git push origin --delete wo/042-sixty-in-thirty
git push origin --delete wo/043-mail-generalise
git push origin --delete wo/045-mail-interviews
git push origin --delete wo/046-mail-languages
git push origin --delete wo/047-answer-bank
git push origin --delete wo/048-workday
git push origin --delete wo/048b-workday-r2
git push origin --delete wo/048c-harness-schema
git push origin --delete wo/048d-workday-r3
git push origin --delete wo/049-essay-card
git push origin --delete wo/049b-hide-draft
git push origin --delete wo/050-mail-english
git push origin --delete wo/051-mail-model
git push origin --delete wo/052-answer-bank
git push origin --delete wo/053-posting-location
git push origin --delete wo/054-answer-once
git push origin --delete wo/055-abroad
git push origin --delete wo/056-sample-e
git push origin --delete wo/057-sample-f
git push origin --delete wo/058-sample-g
git push origin --delete wo/059-sample-h
git push origin --delete wo/059-workday-misses
git push origin --delete wo/060-port-v2
git push origin --delete wo/061-brain-does-the-task
git push origin --delete wo/062-deploy-word
git push origin --delete wo/066-chat-to-queue
git push origin --delete wo/067-correction-privacy
git push origin --delete wo/070-port-v242-fix
git push origin --delete wo/072-answer-once-race
git push origin --delete wo/076-ready-first
git push origin --delete wo/077-claims
git push origin --delete wo/078-form-links
git push origin --delete wo/079-tailor-ask
git push origin --delete wo/080-tool-errors
git push origin --delete wo/081-c03-depth-writing
git push origin --delete wo/085-ask-stops
git push origin --delete wo/087-brutal-triage
git push origin --delete wo/090-port-live
git push origin --delete wo/091a-reply-guards
git push origin --delete wo/091b-tool-checks
git push origin --delete wo/091c-control-state
git push origin --delete wo/092-apply-fence
git push origin --delete wo/093-deploy-provenance
git push origin --delete wo/094-loop-input
git push origin --delete wo/095-assertion-gate
git push origin --delete wo/096-email-code
git push origin --delete wo/098-channel-quota
git push origin --delete wo/099-trainee-connect-cards
git push origin --delete wo/100-situation
git push origin --delete wo/apply-cap-25
git push origin --delete wo/brain-eval-live-meter-20261021
git push origin --delete wo/brain-eval-progress-20261021
git push origin --delete wo/brain-live-candidate-20261021
git push origin --delete wo/brain-reliability-stack-20261021
git push origin --delete wo/c04-relevance-floor
git push origin --delete wo/card-cloud-bridge-20261021
git push origin --delete wo/cloud-card-effect-bridge-20261022
git push origin --delete wo/cloud-preflight-questions-20261021
git push origin --delete wo/f004-mock-goal-handoff-20261022
git push origin --delete wo/f005-targeted-executor-read-20261022
git push origin --delete wo/f007-saved-answer-consumption-20261022
git push origin --delete wo/f013-ashby-structured-location-20261022
git push origin --delete wo/f024-lever-disability-decline-20261022
git push origin --delete wo/first-real-submission
git push origin --delete wo/frs-compete
git push origin --delete wo/frs-cover-letter
git push origin --delete wo/frs-deploy
git push origin --delete wo/frs-fifty
git push origin --delete wo/frs-fifty-merge
git push origin --delete wo/frs-gh-widget
git push origin --delete wo/frs-install
git push origin --delete wo/frs-lever-worker
git push origin --delete wo/frs-option-measure
git push origin --delete wo/frs-paths
git push origin --delete wo/frs-resume
git push origin --delete wo/frs-saved-answers
git push origin --delete wo/frs-stated-facts
git push origin --delete wo/frs-yesno
git push origin --delete wo/lane-b-approval-card-20261021
git push origin --delete wo/lane-b-card-browser-20261021
git push origin --delete wo/lane-b-card-nonce-20261021
git push origin --delete wo/lane-b-card-render-20261021
git push origin --delete wo/mail-erase
git push origin --delete wo/mini-safe-ledger-20261021
git push origin --delete wo/paired-safe-ledger-20261021
git push origin --delete wo/qa-fixture-legal-integration-20261021
git push origin --delete wo/qa-legacy-legal-manifest-20261021
git push origin --delete wo/qa-receipt-integration-20261021
git push origin --delete work/channel-bots
git push origin --delete work/channel-doc-1
git push origin --delete work/conversation-depth-v2
git push origin --delete work/crewa-mi032-host
git push origin --delete work/crewb-cycle2
git push origin --delete work/drive-blockers
git push origin --delete work/edge-pdf-renderer
git push origin --delete work/loop-acceptance
git push origin --delete work/s2-integrity
git push origin --delete work/worker-wiring
git push origin --delete work/writing-pattern
```
