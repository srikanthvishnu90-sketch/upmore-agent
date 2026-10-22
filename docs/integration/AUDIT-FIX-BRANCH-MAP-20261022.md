# Audit fix → branch map (2026-10-22)

Vishnu, 2:22 PM (relayed): "Look at what claude said in the chat. Run through and fix all those issues." This file is
the architect's part, and it is docs only. It maps every row of `docs/apply/AUDIT-INITIAL-WRONGS-2026-10-22.md` (on
`origin/muse/2026-10-22-audit-table` @cbcd0141, 56 rows) to the branch and SHA that holds its fix. No code is changed,
and nothing was deployed, merged, migrated or spent.

**How this was read**
- Read at 14:29 CDT from a fresh fetch of every origin branch (574 refs).
- `origin/main` = `77ff1ce5` (2026-10-22 10:33 CDT, "Enable CodeRabbit comments-only automatic reviews (#154)").
- "On origin/main?" means `git merge-base --is-ancestor <sha> origin/main`.
- "Holding branch" means `git branch -r --contains <sha>`; the first one is named, then "+N more".
- Only origin refs were used.

**The two verification columns**
- **Checked by the architect:** only where I re-ran the row's tests today. Everything else says "unchecked".
- **Verified by the relaying agent:** this session was not told of any verification you ran on any of these SHAs, so every row says "not reported to this session". You fill this column in. (You did report verifying 1ea403f9 and 17654c18 earlier today; neither is an audit row.)
- Muse's own audit status ("fixed-verified" or "fixed-claimed") is copied as written and is Muse's claim, not a check by me.

## Headline

- **Not one fix for any audit row is on `origin/main`.** Every SHA below is branch-only. The "fixed-verified" rows were verified by Muse on the deployed muse line (agent-chat v248 and the host), not merged to main.
- **Fixes pushed since the audit:** branches now exist for 18 of the open rows.
  - Codex: 14 `wo/f0NN-*-20261022` branches (F-003, 004, 005, 006, 007, 008, 009, 010, 012, 013, 015, 016, 023, 024), plus `wo/regression-ledger-20261022` (records).
  - Muse: 4 `muse/2026-10-22-fix-f0NN` branches (F-023 and F-024 notes, the F-025 fix, the F-029 guard).
  - Mine: 3 (F-001, F-002, F-006).
  - F-007's fix was already inside 348c2d4a (`774f24b0`).
- **Two rows have two parallel fixes and need one chosen before merging:**
  - F-006: `arch/f006-band-and-wrong-zero` and `wo/f006-seniority-morphology-20261022`.
  - F-007: `774f24b0`, already inside 348c2d4a, and `wo/f007-saved-answer-consumption-20261022`.
- **Muse's `muse/2026-10-22-fix-f023` and `fix-f024` tips are root-cause notes, not fixes.** Codex's `wo/f023` and `wo/f024` carry the code.
- **No fix branch exists for these open rows:**
  - F-030: the SQL leg is on `chat-begin-caller`. The audit lists it open.
  - F-034, F-037 and F-038.
  - F-011's fix (`bc20c5dc`) exists but is not deployed.
  - BUG-169..180: claimed fixed at `be86307a`, which is on 452 branches but not on main.
- **One cited SHA is not on any origin ref:** `52cc70a6`, as the audit itself notes for F-030.

## Every row

| Row | Audit status (Muse, 14:22) | SHA(s) the audit cites (a fix, or for open rows the repro/note it cites) → origin branch holding it | Fix branches pushed since the audit (tip) | On origin/main? | Checked by the architect | Verified by the relaying agent |
|---|---|---|---|---|---|---|
| MUSE-F-001 | open | none named | `arch/f001-roles-and-links` @`984478d2` | no | architect: fail-first 0/3 → 3/3; gate node 2276/205 → 2279/202, no new failure; architect 1264/0, edge 892/0 | not reported to this session |
| MUSE-F-002 | open | none named | `arch/f002-batch-status` @`15057d56` | no | architect: fail-first base 1 pass / 4 fail → fix 5/0; node fail set identical; architect 1264/0, edge 892/0 | not reported to this session |
| MUSE-F-003 | open | `332cad20` → `muse/2026-10-20-link-liveness` | `wo/f003-served-link-liveness-20261022` @`7e1443cd` | no | unchecked | not reported to this session |
| MUSE-F-004 | open | none named | `wo/f004-mock-goal-handoff-20261022` @`94f91453` | no | unchecked | not reported to this session |
| MUSE-F-005 | open | `ea986344` → `muse/2026-10-21-queue-feed` | `wo/f005-targeted-executor-read-20261022` @`233d834d` | no | unchecked | not reported to this session |
| MUSE-F-006 | open | `583cc918` → `muse/2026-10-21-discovery-quality` | `arch/f006-band-and-wrong-zero` @`87bd108c`; `wo/f006-seniority-morphology-20261022` @`5b18a3c3` | no | architect: fail-first 0/5 → 5/5; matrix 15/30 → 30/30; node 2276/207 → 2281/202, no new failure | not reported to this session |
| MUSE-F-007 | open | none named | `(already in 348c2d4a) 774f24b0` @`774f24b0`; `wo/f007-saved-answer-consumption-20261022` @`1a05690e` | no | architect: answer-map suite 8/4 before → 12/0 at 348c2d4a, re-run 2026-10-22 | not reported to this session |
| MUSE-F-008 | open | none named | `wo/f008-alert-delivery-budget-20261022` @`aa4a54e2` | no | unchecked | not reported to this session |
| MUSE-F-009 | open | none named | `wo/f009-owned-quiet-hours-20261022` @`6e6b0e34`; `wo/regression-ledger-20261022` @`48fa277e` | no | unchecked | not reported to this session |
| MUSE-F-010 | open | `60f750dd` → `muse/2026-10-21-discovery-quality` | `wo/f010-posting-url-wiring-20261022` @`6be9c223` | no | unchecked | not reported to this session |
| MUSE-F-011 | open | `bc20c5dc` → `muse/2026-10-21-tailor-buffer-fix` | none found | no | unchecked | not reported to this session |
| MUSE-F-012 | open | none named | `wo/f012-chat-profile-deletion-20261022` @`73b2cbc9` | no | unchecked | not reported to this session |
| MUSE-F-013 | open | `23b566b9` → `muse/2026-10-21-discovery-quality` | `wo/f013-ashby-structured-location-20261022` @`c7721061`; `arch/ashby-location-ask` @`368d4d38` | no | architect branch 2026-10-22 00:12: asks job-country questions when no location; not a fix of the empty-location render | not reported to this session |
| MUSE-F-014 | fixed-verified | `c9fc28f9` → `muse/2026-10-21-ask-on-missing` (+56 more) | none found | no | unchecked | not reported to this session |
| MUSE-F-015 | open | none named | `wo/f015-outreach-edge-encoding-20261022` @`2e559a66` | no | unchecked | not reported to this session |
| MUSE-F-016 | open | none named | `wo/f016-chat-resume-correction-20261022` @`beb83468` | no | unchecked | not reported to this session |
| MUSE-F-017 | fixed-verified | `cea914fe` → `muse/2026-10-21-ask-on-missing` (+55 more) | none found | no | unchecked | not reported to this session |
| MUSE-F-018 | fixed-verified | `f4ab93ff` → `muse/2026-10-21-widget-attach` | none found | no | unchecked | not reported to this session |
| MUSE-F-019 | fixed-verified | `f4ab93ff` → `muse/2026-10-21-widget-attach` | none found | no | unchecked | not reported to this session |
| MUSE-F-020 | fixed-verified | `6c1929e3` → `muse/2026-10-21-widget-attach`; `f4ab93ff` → `muse/2026-10-21-widget-attach` | none found | no | unchecked | not reported to this session |
| MUSE-F-021 | fixed-claimed | `df041c34` → `muse/2026-10-21-fdse-mismatch` (+11 more) | none found | no | unchecked | not reported to this session |
| MUSE-F-022 | fixed-claimed | `df041c34` → `muse/2026-10-21-fdse-mismatch` (+11 more) | none found | no | unchecked | not reported to this session |
| MUSE-F-023 | open | none named | `wo/f023-fill-verdict-20261022` @`b2908caa`; `muse/2026-10-22-fix-f023` @`b67e1ae1` | no | unchecked | not reported to this session |
| MUSE-F-024 | open | none named | `wo/f024-lever-disability-decline-20261022` @`2aa00c4d`; `muse/2026-10-22-fix-f024` @`c044c98e` | no | unchecked | not reported to this session |
| MUSE-F-025 | open | none named | `muse/2026-10-22-fix-f025` @`d510bc38` | no | unchecked | not reported to this session |
| MUSE-F-026 | fixed-verified | `cc6aaaab` → `muse/2026-10-21-fdse-question-kind` (+10 more) | none found | no | unchecked | not reported to this session |
| MUSE-F-027 | fixed-verified | `c799d095` → `muse/2026-10-22-bench-60` (+9 more) | none found | no | unchecked | not reported to this session |
| MUSE-F-028 | fixed-verified | `202e38ee` → `muse/2026-10-22-bench-60` (+8 more) | none found | no | unchecked | not reported to this session |
| DECLINE-VOCAB | fixed-verified | `04e24fde` → `muse/2026-10-21-decline-vocab` (+1 more); `485a432b` → `muse/2026-10-22-bench-60` (+7 more) | none found | no | unchecked | not reported to this session |
| MUSE-F-029 | open | `587233c7` → `muse/2026-10-22-f029-gusto-coverage` | `muse/2026-10-22-fix-f029-guard` @`0aa231f2` | no | unchecked | not reported to this session |
| MUSE-F-030 | open | `cb56921a` → `muse/2026-10-22-chat-begin-caller` (+2 more); `52cc70a6`: not on any origin ref | none found | no | unchecked | not reported to this session |
| MUSE-F-031 | fixed-verified | `9f12507f` → `muse/2026-10-22-bench-60` (+5 more); `983c5919` → `muse/2026-10-22-bench-60` (+5 more) | none found | no | unchecked | not reported to this session |
| MUSE-F-032 | fixed-verified | `b8aa4106` → `muse/2026-10-22-bench-60` (+4 more) | none found | no | unchecked | not reported to this session |
| MUSE-F-033 | fixed-verified | `5acd178d` → `muse/2026-10-22-bench-60` (+3 more) | none found | no | unchecked | not reported to this session |
| MUSE-F-034 | open | none named | none found | n/a (no fix) | unchecked | not reported to this session |
| MUSE-F-035 | fixed-verified | `29612cff` → `muse/2026-10-22-bench-60-fix` (+1 more) | none found | no | unchecked | not reported to this session |
| MUSE-F-036 | fixed-verified | `29612cff` → `muse/2026-10-22-bench-60-fix` (+1 more) | none found | no | unchecked | not reported to this session |
| REAP-ON-CRASH | fixed-verified | `29612cff` → `muse/2026-10-22-bench-60-fix` (+1 more) | none found | no | unchecked | not reported to this session |
| MUSE-F-037 | open | none named | none found | n/a (no fix) | unchecked | not reported to this session |
| MUSE-F-038 | open | none named | none found | n/a (no fix) | unchecked | not reported to this session |
| BUG-QA-2026-10-21-01 | fixed-verified | `b8ccec1b` → `muse/2026-10-21-qa-bug-fixes` (+1 more) | none found | no | unchecked | not reported to this session |
| BUG-QA-2026-10-21-02 | fixed-verified | `8473bae4` → `muse/2026-10-21-qa-bug-fixes` (+1 more) | none found | no | unchecked | not reported to this session |
| BUG-QA-2026-10-21-03 | fixed-claimed | `9d551e6b` → `muse/2026-10-21-qa-bug-fixes` (+1 more) | none found | no | unchecked | not reported to this session |
| BUG-QA-2026-10-21-04 | fixed-verified | `40494b2c` → `muse/2026-10-21-qa-bug-fixes` (+1 more); `1ef2a893` → `muse/2026-10-21-qa-bug-fixes` (+1 more) | none found | no | unchecked | not reported to this session |
| BUG-169 | fixed-claimed | `be86307a` → `arch/ashby-location-ask` (+451 more) | none found | no | unchecked | not reported to this session |
| BUG-170 | fixed-claimed | `be86307a` → `arch/ashby-location-ask` (+451 more) | none found | no | unchecked | not reported to this session |
| BUG-171 | fixed-claimed | `be86307a` → `arch/ashby-location-ask` (+451 more) | none found | no | unchecked | not reported to this session |
| BUG-172 | fixed-claimed | `be86307a` → `arch/ashby-location-ask` (+451 more) | none found | no | unchecked | not reported to this session |
| BUG-173 | fixed-claimed | `be86307a` → `arch/ashby-location-ask` (+451 more) | none found | no | unchecked | not reported to this session |
| BUG-174 | fixed-claimed | `be86307a` → `arch/ashby-location-ask` (+451 more) | none found | no | unchecked | not reported to this session |
| BUG-175 | fixed-claimed | `be86307a` → `arch/ashby-location-ask` (+451 more) | none found | no | unchecked | not reported to this session |
| BUG-176 | fixed-claimed | `be86307a` → `arch/ashby-location-ask` (+451 more) | none found | no | unchecked | not reported to this session |
| BUG-177 | fixed-claimed | `be86307a` → `arch/ashby-location-ask` (+451 more) | none found | no | unchecked | not reported to this session |
| BUG-178 | fixed-claimed | `be86307a` → `arch/ashby-location-ask` (+451 more) | none found | no | unchecked | not reported to this session |
| BUG-179 | fixed-claimed | `be86307a` → `arch/ashby-location-ask` (+451 more) | none found | no | unchecked | not reported to this session |
| BUG-180 | fixed-claimed | `be86307a` → `arch/ashby-location-ask` (+451 more) | none found | no | unchecked | not reported to this session |

## Branches I recommend NOT deleting (a list only; deleting is not authorized)

**The count.**
- Branches not merged into `origin/main` at 14:29 CDT: **571** of 574. You said 419; the difference is probably the base used (`origin/main` here, not `trunk`), or branches pushed since your count.
- Of the 571, **360 are the only origin ref holding their tip commit.** Deleting any one of them loses commits that exist nowhere else on origin. I recommend keeping all 360.
- The other 211 have their tips contained in another branch, so deleting them loses no commits. Ten of those are named in the table above as holders of an audit fix. I recommend keeping those ten too, so that the table's names stay valid: `arch/ashby-location-ask`, `muse/2026-10-21-ask-on-missing`, `muse/2026-10-21-decline-vocab`, `muse/2026-10-21-fdse-mismatch`, `muse/2026-10-21-fdse-question-kind`, `muse/2026-10-21-qa-bug-fixes`, `muse/2026-10-22-bench-60`, `muse/2026-10-22-bench-60-fix`, `muse/2026-10-22-chat-begin-caller`, `wo/f003-served-link-liveness-20261022`

**The 360 sole holders, by prefix:**

- **arch/** (11): `arch/cap-inventory`, `arch/card-cloud-bridge-gate`, `arch/chat-approval-card-binding`, `arch/f001-roles-and-links`, `arch/f002-batch-status`, `arch/f006-band-and-wrong-zero`, `arch/grad-year-ask`, `arch/mail-trainee-row`, `arch/networking-real-people`, `arch/nine-gap-specs`, `arch/waiver-counts-sends`
- **architect/** (3): `architect/competitors`, `architect/requirements`, `architect/task-cards`
- **audit/** (1): `audit/memory-capability-20261013`
- **career/** (1): `career/gauntlet-deepdive`
- **ci/** (22): `ci/answer-draft`, `ci/brain-eval`, `ci/brain320-failure-analysis-20261021`, `ci/brain320-higher-20261021`, `ci/brain320-higher-ledger-recover-20261021`, `ci/brain320-recover-20261021`, `ci/brutal-battery`, `ci/card-cloud-browser-baseline-20261022`, `ci/card-cloud-gate-only-20261022`, `ci/card-cloud-pg16-acceptance-20261022`, `ci/card-cloud-pg16-export-20261022`, `ci/form-capture`, `ci/gate-census`, `ci/posting-locations`, `ci/question-capture`, `ci/question-capture-c`, `ci/question-capture-d`, `ci/question-capture-e`, `ci/question-capture-f`, `ci/question-capture-g`, `ci/question-capture-h`, `ci/trainee-tasks`
- **claude/** (4): `claude/k12-settlements`, `claude/k13-vault`, `claude/k8-portals`, `claude/upmore-16-spec-instinct-0qyuqj`
- **codex/** (29): `codex/apply-stack-integration-20261018`, `codex/browser-native-recovery-20261017`, `codex/capability2-review-fixes-20261016`, `codex/career-critical-repairs-20261016`, `codex/career-flexible-grounding-20261016`, `codex/career-model-gateway-20261016`, `codex/case2-greeting-20261020`, `codex/conversation-fixes-20261016`, `codex/conversation-recovery-eval-20261016`, `codex/correction-authority-privacy-20261016`, `codex/correction-current-goal`, `codex/evaluator-live-admission-20261017`, `codex/forward-upgrade-preflight-20261018`, `codex/fresh-profile-owner`, `codex/greenhouse-submit-handoff-20261017`, `codex/greenhouse-vertical-slice-20261017`, `codex/mass-applications-20261017`, `codex/model-gateway-boundary-review-20261016`, `codex/native-browser-integration-20261017`, `codex/native-recovery-20261017`, `codex/privacy-research-conversation-integration-20261016`, `codex/public-research-browser-20261016`, `codex/research-conversation-review-20261016`, `codex/resume-correction-supersession-20261016`, `codex/search-provider-parity`, `codex/spec-b-interview-depth-20261016`, `codex/tracking-row-identity`, `codex/upmore-messaging-native-20261010`, `codex/upmore-production-integration-20261010`
- **depth/** (6): `depth/alerts`, `depth/families`, `depth/integration`, `depth/knowledge`, `depth/memory`, `depth/submissions`
- **discovery/** (5): `discovery/boards-39345730265`, `discovery/boards-39377124463`, `discovery/boards-39380185627`, `discovery/boards-39433413503`, `discovery/label-pool-39345730265`
- **docs/** (7): `docs/backend-audit`, `docs/channel-battery-review`, `docs/owner-trials-drift`, `docs/status-0820`, `docs/submission-process`, `docs/targets-update`, `docs/tonight-test-plan`
- **feat/** (1): `feat/submission-completion-notify`
- **finish/** (2): `finish/answer-bindings`, `finish/apply-readiness`
- **fix/** (27): `fix/alert-delivery-enqueue`, `fix/bug-240-batch-seam`, `fix/career-bundle-compress`, `fix/channel-integrity`, `fix/classify-precision`, `fix/crew-a`, `fix/draft-subject`, `fix/gmail-code-freshness`, `fix/go-live-apply-migrations`, `fix/ingest-clock`, `fix/last-word`, `fix/lf-08-target-firm`, `fix/lf-09-attribution`, `fix/mi123-account-rebase`, `fix/mi124-assertion-capture`, `fix/named-role-capture`, `fix/portal-driver-r3`, `fix/prep-kb-routing`, `fix/probe-d-draft-binding`, `fix/submit-path`, `fix/t1-channel-completeness`, `fix/t2-telegram-presentation`, `fix/t3-stated-facts-extraction`, `fix/v240-live-gaps`, `fix/v241-live-gaps`, `fix/v242-live-gaps`, `fix/worker-resume-upload-live`
- **integration/** (3): `integration/channel-rollout`, `integration/v228-candidate`, `integration/v229-candidate`
- **iterate/** (1): `iterate/named-gaps`
- **muse/** (51): `muse/2026-10-20-batch-trigger-fix`, `muse/2026-10-20-ci-base-repair`, `muse/2026-10-20-failures-backlog`, `muse/2026-10-20-link-liveness`, `muse/2026-10-20-loop-writer`, `muse/2026-10-20-surfacing-status`, `muse/2026-10-20-training-doc`, `muse/2026-10-21-bench-50`, `muse/2026-10-21-board-session`, `muse/2026-10-21-connector-assembly`, `muse/2026-10-21-connector-consent`, `muse/2026-10-21-connector-gate`, `muse/2026-10-21-connector-intro`, `muse/2026-10-21-connector-match`, `muse/2026-10-21-consent-capture`, `muse/2026-10-21-correction-privacy-fix`, `muse/2026-10-21-cost-model`, `muse/2026-10-21-cover-letter`, `muse/2026-10-21-discovery-quality`, `muse/2026-10-21-dropdown-measure`, `muse/2026-10-21-facts-parser`, `muse/2026-10-21-fe-approval-ui`, `muse/2026-10-21-form-inventory`, `muse/2026-10-21-intro-booking`, `muse/2026-10-21-intro-delivery`, `muse/2026-10-21-intro-followup`, `muse/2026-10-21-job-radar`, `muse/2026-10-21-match-host`, `muse/2026-10-21-o5-gate-kit`, `muse/2026-10-21-profile-structurer`, `muse/2026-10-21-queue-feed`, `muse/2026-10-21-reprepare-card`, `muse/2026-10-21-resume-structuring`, `muse/2026-10-21-scale-plan`, `muse/2026-10-21-state-binding`, `muse/2026-10-21-tailor-buffer-fix`, `muse/2026-10-21-throughput`, `muse/2026-10-21-throughput-infra`, `muse/2026-10-21-trusted-fact-reader`, `muse/2026-10-21-widget-attach`, `muse/2026-10-21-worker-drain`, `muse/2026-10-22-f029-gusto-coverage`, `muse/2026-10-22-fix-f023`, `muse/2026-10-22-fix-f024`, `muse/2026-10-22-fix-f025`, `muse/2026-10-22-fix-f029-guard`, `muse/2026-10-22-s1-parallel-drain`, `muse/2026-10-22-scale-s1-repo`, `muse/2026-10-22-scale-s2-host`, `muse/2026-10-22-scale-s3-db`, `muse/2026-10-22-telegram-slice`
- **ops/** (1): `ops/first-send-owner-steps`
- **qa/** (3): `qa/decline-browser-tests`, `qa/worker-recovery-076712eb`, `qa/worker-recovery-fc1ccd31`
- **release/** (2): `release/career-v223`, `release/career-v224`
- **train/** (1): `train/2026-10-21`
- **wo/** (149): `wo/001-green-gate`, `wo/002-agent-brain`, `wo/003-eval-runner`, `wo/004-conversation-simulator`, `wo/006-job-ingestion`, `wo/007a-alert-planner`, `wo/007b-alerts-runner`, `wo/009a-apply-core`, `wo/009b-1-apply-queue`, `wo/009b-2-ci-fixtures`, `wo/009b-2-form-snapshots`, `wo/009b-3-acceptance`, `wo/009b-3-fill-readback`, `wo/009b-3-rendered-readback`, `wo/009b-4-apply-cli`, `wo/009b-4-engine`, `wo/009b-5-worker-pull`, `wo/009b-6-coverage`, `wo/009b-6-question-data`, `wo/009b-6-replicate`, `wo/009b-7-real-forms`, `wo/009b-8-uploads`, `wo/009b-apply-worker`, `wo/013a-channel`, `wo/013b1-delivery`, `wo/013b2-inbound`, `wo/017-board-harvest`, `wo/018-trainee-go-live`, `wo/019-conversations`, `wo/020-meaning`, `wo/020-wire`, `wo/021-approve-first`, `wo/021-receipts`, `wo/021-run-loop`, `wo/021-w2-w3`, `wo/022-card-push`, `wo/023-compare`, `wo/023-memory`, `wo/023-style`, `wo/024-mail-tracking`, `wo/025-mock-interview`, `wo/026-connector`, `wo/027-memory-timeline`, `wo/028-tailor-in-chat`, `wo/029-ask-once`, `wo/030-essay-drafts`, `wo/031-extension`, `wo/032-apply-ops`, `wo/033-outreach`, `wo/034-brief-digest`, `wo/035-voice-mock`, `wo/036-guidance-offer`, `wo/037-discovery`, `wo/038-channels`, `wo/039-cloud-worker`, `wo/040-mail-accuracy`, `wo/041-source-freshness`, `wo/042-sixty-in-thirty`, `wo/043-mail-generalise`, `wo/044-discovery-scale`, `wo/045-mail-interviews`, `wo/046-mail-languages`, `wo/047-answer-bank`, `wo/048-workday`, `wo/048b-workday-r2`, `wo/048c-harness-schema`, `wo/048d-workday-r3`, `wo/049-essay-card`, `wo/049b-hide-draft`, `wo/050-mail-english`, `wo/051-mail-model`, `wo/052-answer-bank`, `wo/053-posting-location`, `wo/054-answer-once`, `wo/055-abroad`, `wo/056-sample-e`, `wo/057-sample-f`, `wo/058-sample-g`, `wo/059-sample-h`, `wo/059-workday-misses`, `wo/060-port-v2`, `wo/061-brain-does-the-task`, `wo/062-deploy-word`, `wo/064-short-drafts`, `wo/066-chat-to-queue`, `wo/067-correction-privacy`, `wo/069-posting-pay`, `wo/070-port-v242-fix`, `wo/072-answer-once-race`, `wo/073-title-search`, `wo/075-resume-pair`, `wo/076-ready-first`, `wo/076-ready-first-build`, `wo/077-claims`, `wo/078-form-links`, `wo/079-tailor-ask`, `wo/081-capability2-grounding`, `wo/081-pasted-text-injection`, `wo/081-portal-families`, `wo/081-repost-stale`, `wo/081-resume-supersession`, `wo/081-site-port`, `wo/082-person-scope`, `wo/083-corrections`, `wo/084-emailed-codes`, `wo/085-ask-stops`, `wo/086-store-package`, `wo/087-brutal-triage`, `wo/088-router-residuals`, `wo/105-apply-nth`, `wo/agent-slice`, `wo/apply-cap-25`, `wo/brain-native-constraints-20261021`, `wo/brain-reliability-20261021`, `wo/brain-reliability-eval-20261021`, `wo/c03-live-assist-guard`, `wo/c04-relevance-floor`, `wo/c1-tailor-edge`, `wo/ci-fail-first-20261022`, `wo/cloud-card-effect-bridge-20261022`, `wo/cloud-preflight-questions-20261021`, `wo/coderabbit-review-smoke-20261022`, `wo/f004-mock-goal-handoff-20261022`, `wo/f005-targeted-executor-read-20261022`, `wo/f006-seniority-morphology-20261022`, `wo/f007-saved-answer-consumption-20261022`, `wo/f008-alert-delivery-budget-20261022`, `wo/f009-owned-quiet-hours-20261022`, `wo/f010-posting-url-wiring-20261022`, `wo/f012-chat-profile-deletion-20261022`, `wo/f013-ashby-structured-location-20261022`, `wo/f015-outreach-edge-encoding-20261022`, `wo/f016-chat-resume-correction-20261022`, `wo/f023-fill-verdict-20261022`, `wo/f024-lever-disability-decline-20261022`, `wo/frs-fifty`, `wo/gate-fix-coverage-20261022`, `wo/goal-correction`, `wo/lane-b-card-browser-20261021`, `wo/lane-b-card-nonce-20261021`, `wo/lane-b-card-render-20261021`, `wo/lever-driver-readiness-20261021`, `wo/mail-erase`, `wo/mini-safe-ledger-20261021`, `wo/paired-safe-ledger-20261021`, `wo/qa-chat-bank-id-20261021`, `wo/regression-ledger-20261022`, `wo/site-preview-repair-20261020`, `wo/typed-field-writer-flow-20261021`
- **work/** (30): `work/channel-bots`, `work/channel-doc-1`, `work/conversation-depth-v2`, `work/depth-154-155`, `work/edge-pdf-renderer`, `work/extension-assist`, `work/extension-on-trunk`, `work/loop-task1`, `work/mi023-tailoring-residual`, `work/mi034-board-tranche2`, `work/mi034-egress-2`, `work/mi098-constellation`, `work/mi099-tally`, `work/mi100-formassembly`, `work/mi101-google-forms`, `work/mi102-neo-bubble`, `work/mi103-thiel`, `work/mi104-bespoke-sites`, `work/mi106-repost-stale`, `work/mi107-polling-efficiency`, `work/mi108-duplicate-check`, `work/mi111-credit-ledger`, `work/mi114-injection`, `work/mi117-alert-fatigue`, `work/mi118-telemetry`, `work/mi121-pasted-email`, `work/serve-link-liveness`, `work/wave1-mock-t3`, `work/worker-wiring`, `work/writing-pattern`

**Method**
- For every unmerged branch, `git branch -r --contains <tip>` was counted; a count of 1 means it is the sole holder.
- Open PRs were not checked: the GitHub tool was unavailable during this pass. A branch with an open PR should also be kept even if redundant.
