# Port or retire: every side branch (WO-1 of the 2026-10-20 operating brief)

Trunk is the only line (D-026). Branches were audited against `origin/trunk` and `origin/integration/v2-candidate`. The
deployed line is now ported (WO-060, PR #89, merged as a53face5). The architect's verdicts on the branches of the brief
come first; the full audit of the 66 other branches follows.

## The brief's branches

| Branch | Verdict | Why |
|---|---|---|
| `integration/v2-candidate` (4b4e7981, agent-chat v242) | **PORTED** (WO-060, #89) | The deployed line is on trunk; migrations re-versioned; gate green |
| `fix/v242-live-gaps` (9143889e) | **PORT** (WO-070, #92) | The live resume-confirm defect, with its fail-first guard; bundle regenerated on trunk; the guard respawns with VM modules so the gate runs it |
| `codex/correction-authority-privacy-20261016` | **PORT** (WO-067, #90) | A cross-person privacy defect live on v242, reproduced on 4b4e7981 |
| `work/extension-on-trunk`: the Lane C spike (`packages/extension/`, 0c118d65, 9240da1a) | **RETIRE** | Trunk's extension (`extension/`) already covers Greenhouse, Lever, Ashby and Workday. It reads saved answers from the server, records the employer's confirmation in the tracker, and has 86 browser tests and live fills of 17 real pages (99.4% right). The spike is Greenhouse only, with a fixture bank and a proof report marked NOT_WIRED. The one lesson (MV3 `storage.session` access) does not apply: trunk's content script never writes session storage |
| `work/extension-on-trunk`: the saved-answers sync (f8b2520c, `extension-sync` + `extension_submission_reports`) | **RETIRE** | It is a second backend for the spike, duplicating trunk's `career_apply_answers_own` and `career_apply_extension_begin_own` / `career_apply_finish_own`. Its migration `20261020010000_extension_submission_reports.sql` collides by version with trunk's `20261020010000_career_apply_own_worker.sql` |
| `main` (site, `site-signup`, `site-careers`, `20261019020000_site_capture.sql`) | **PORT, with re-versioning** | Said to be live in production. **Version collision:** trunk has `20261019020000_channel_delivery.sql`. If production applied `site_capture` as version 20261019020000, a version-based push would skip trunk's channel migration. The port must re-version one of them (WO-071); the deploy packet checks the live schema by table, not by version |

## The full audit (66 branches)

Audited 2026-10-20 against `origin/trunk` @ 14803c01 and `origin/integration/v2-candidate` @ ab94e44e. Trunk moved to b095b0aa during the audit (PR #88, wo/059 only). None of the audited branches touch the files that PR changed. Nothing was modified, committed or pushed.

**Method.** For each branch I took the commits in `origin/trunk..B ^origin/integration/v2-candidate`, excluding merges. I collected every added line that still exists at the tip and is new against the merge base. A line counts as distinctive at 20 characters or more with a word in it. I then checked each line against the full file trees of both lines, first at the same path and then anywhere (to catch renames). The ratio **found/total** in the table counts distinctive lines in substantive files only: code, tests, migrations, SQL and fixtures. It leaves out docs, evidence logs, `tests-archival/`, the generated bundles (`router_core*.js`, `index.html`, `upmore-app.html`, `agent_runtime.js`) and eval result JSON. "same-path" means the line is in the same file on that line. Where it mattered, I ran the branch's own guard tests against trunk's modules (worktree `tf`, from the scratchpad, read-only) to see whether the bug still exists on trunk. Each of the 16 big codex/* branches is an ancestor of `forward-upgrade-preflight` or `evaluator-live-admission`. I sampled their top code files by line count, listed every commit that touches a live router module, and ran three guard tests.

## Summary

| Verdict | Count |
|---|---|
| PORT | 10 rows, 8 separate ports (`work/mi114-injection` goes in through `work/mi121-pasted-email`, and `wo/site-preview-repair-20261020` through `main`) |
| RETIRE-SUPERSEDED | 49 |
| RETIRE-CONTAINED | 3 |
| RETIRE-ARCHIVE | 4 |
| UNSURE | 0 |
| **Total audited** | **66** |

No audited branch has any substantive content in v2-candidate (best case: 2 same-path lines). So nothing here is "covered by WO-060". Everything that was ported came from trunk itself (WO-001, the WO-006 board data and the WO-009b-1 queue).

**PORT list, ordered by value to a career agent that mass-applies (apply, answers and facts first):**
1. **`codex/correction-authority-privacy-20261016`** (privacy, answers). Module 130 keeps a process-global correction store keyed by profile email, name or default id. On trunk, account B recalls account A's corrected graduation date. The branch's own test fails 9 of 10 on trunk's modules. Those are the facts that feed application answers. About 230 lines: `packages/domain/130-career-onboarding.js` (+15/−37), `tests/correction-authority-privacy.test.cjs`, `tests/correction-authority-postgres.test.cjs`, `tests/helpers/correction-privacy-fixture.cjs`, plus regenerated bundles.
2. **`work/mi121-pasted-email`** (includes `work/mi114-injection`; apply integrity). Text pasted into chat (a posting or an email) can write application records and rejections. A failure page can mint a submission. Homoglyph company names dodge the per-company cap and opt-outs. 16 of 33 of the branch's guards fail on trunk. About 870 lines across 121/126/142/149/150/152 and `career_host.js`, plus `tests/career-prompt-injection.test.cjs` and `packages/career-data/fixtures/injection-corpus.cjs`.
3. **`codex/resume-correction-supersession-20261016`** (answers). Take commit 567389b8 and its tests (3704008e, 879417bf) only. An explicit newer resume cannot supersede a confirmed date. The branch's test fails 12 of 12 on trunk. About 230 lines in 130 plus `tests/resume-supersession*.test.cjs`. Land it after #1, which it builds on.
4. **`wo/009b-3-acceptance`** (apply answers; open PR #28, C-01, first in the NOW queue at 2026-10-20 02:00). Module 150 precision for contact and education answers, plus a captured-form harness. About 1,190 lines: 150 (+48), `tests/career-apply-forms.test.cjs` (+672), `tests/fixtures/portal-fixture-server.cjs` (+436), `tests/fixtures/apply-profile.json`. Module 150 is the old stack under D-014, so the architect decides whether to merge or close.
5. **`wo/c03-live-assist-guard`** (C-03, D-015; still queued). The rewritten `liveAssistGuard` in 127, `evals/prep/live-assist-prompts.json`, `tests/career-live-assist-guard.test.cjs`, and one line in `agent/prompt.ts`. About 184 lines.
6. **`codex/capability2-review-fixes-20261016`** (grounding of recommendations, router 154). The fixes are about what counts as evidence: "zero experience" and "scheduled interviews with Python engineers" must not count as a skill. 26 of the frozen holdouts fail on trunk. About 370 lines, plus a 737-line holdout fixture. The branch notes one blocker (H20) is still open.
7. **`main`** (production site). `site/index.html` (newest version, with the #chat and WhatsApp section), `supabase/functions/site-signup`, `supabase/functions/site-careers`, and `supabase/migrations/20261019020000_site_capture.sql`. The commit says this was live-verified in production. If so, the production schema has a migration that is in neither line. About 2,000 lines. **`wo/site-preview-repair-20261020`** (open PR #52) is an older copy of the same site taken from main @ 4359e6bc. Port main's version and close #52.
8. **`work/depth-154-155`**, the CAREER-WRITING half only (tests). `tests/depth-CAREER-WRITING.test.cjs`, `evals/depth/CAREER-WRITING.mutations.cjs` and the results. It passes 28 of 28 against trunk's 154, which `essay_draft.ts` uses. About 420 lines. Drop the CAREER-BATCH half: module 155 is being retired (D-014).

**Ideas from retired branches that trunk lacks** (re-specify them; the code itself does not port): checking for duplicates against applications the person made by hand and that mail tracking picked up (mi108; trunk only deduplicates against its own queue); a "possibly stale" flag for postings first seen more than 60 days after they went up (mi106); a per-user Hunter credit ceiling (mi111; trunk caps only PDL credits).

## Table

| branch | last commit | unique commits | verdict | evidence | port files (if PORT) |
|---|---|---|---|---|---|
| codex/correction-authority-privacy-20261016 | 2026-10-16 | 3 | **PORT** | 14/211 anywhere, 0 same-path on either line. On trunk, `CORRECTION_STORE` is still in 130 (6 hits on both lines). The branch's test fails 9/10 on trunk: "B must recall B2031, never A2028" | `packages/domain/130-career-onboarding.js`, `tests/correction-authority-privacy.test.cjs`, `tests/correction-authority-postgres.test.cjs`, `tests/helpers/correction-privacy-fixture.cjs` (+ rebuilt bundles); ~230 lines |
| work/mi121-pasted-email | 2026-10-16 | 2 | **PORT** | 53/865 anywhere, 1 same-path in v2. Injection suite fails 16/33 on trunk's modules (HOLE-1..4, PE-1..9) | `packages/domain/{121,126,142,149,150,152}-*.js`, `supabase/functions/_shared/career_host.js`, `tests/career-prompt-injection.test.cjs`, `packages/career-data/fixtures/injection-corpus.cjs`; ~870 lines |
| work/mi114-injection | 2026-10-16 | 1 | **PORT** (via mi121, which contains it) | 48/571; ancestor of mi121 | see mi121 |
| codex/resume-correction-supersession-20261016 | 2026-10-16 | 32 | **PORT** (567389b8 + its tests only) | Unique work is 4 commits: a 130 fix (+99/−35) and tests. Branch tests fail 12/12 on trunk. The other 28 commits are the codex stack (see below) | `packages/domain/130-career-onboarding.js`, `tests/resume-supersession.test.cjs`, `tests/resume-supersession-entry.test.cjs`, `tests/helpers/resume-supersession-fixture.cjs`, `tests/fixtures/resume-supersession/freeze.json`; ~230 lines |
| wo/009b-3-acceptance | 2026-10-19 | 11 | **PORT** (open PR #28) | 26/596. Not on trunk. C-01 is first in NOW (2026-10-20 02:00) with two review blockers; the PR body says both are addressed. Caveat: 150 is the old stack (D-014), and trunk's floor is now `tests/career-apply-real-forms.test.cjs` (17/17) | `packages/domain/150-career-portal-browser.js`, `tests/career-apply-forms.test.cjs`, `tests/fixtures/portal-fixture-server.cjs`, `tests/fixtures/apply-profile.json`; ~1,190 lines |
| wo/c03-live-assist-guard | 2026-10-19 | 1 | **PORT** | 2/155. Card C-03 is still queued. Trunk's guard and prompt are unchanged (D-015: 5/10 wrong) | `packages/domain/127-career-prep.js`, `evals/prep/live-assist-prompts.json`, `tests/career-live-assist-guard.test.cjs`, `supabase/functions/_shared/agent/prompt.ts` (+bundle); ~184 lines |
| codex/capability2-review-fixes-20261016 | 2026-10-16 | 2 | **PORT** (low) | 36/471. 154 edits absent from both lines (v2's last change to 154 is Depth Lane A). Branch tests fail on trunk: H01–H04, H08, H09, H11, H15, H17, H18 and D01–D04 | `packages/domain/154-career-recommendations.js`, `142` (1 line), `tests/capability2-*.test.cjs`, `tests/helpers/capability2-staged-entry.cjs`, `tests/fixtures/capability2-independent/*`; ~370 + 737 fixture lines |
| main | 2026-10-19 | 10 | **PORT** (site + capture backend) | 56/238 (the found lines are finance gauntlet JSON). `site/`, `site-signup`, `site-careers` and `site_capture` are on neither line (0 grep hits). The commit says "live-verified". 2 old finance commits ride along (archive) | `site/index.html`, `supabase/functions/site-signup/index.ts`, `supabase/functions/site-careers/index.ts`, `supabase/migrations/20261019020000_site_capture.sql`, `supabase/config.toml` (9 lines); ~2,000 lines |
| wo/site-preview-repair-20261020 | 2026-10-20 | 1 | **PORT** (via main; open PR #52) | 4/1,321. A copy of main's `site/` @ 4359e6bc. Main's tip is newer (the #chat and WhatsApp section, +19 lines) | take `site/` from main instead; close #52 |
| work/depth-154-155 | 2026-10-17 | 1 | **PORT** (low; WRITING half only) | 103/641. The CAREER-WRITING depth test passes 28/28 against trunk's 154 (used by `essay_draft.ts`). The CAREER-BATCH half targets 155 (retiring, D-014) | `tests/depth-CAREER-WRITING.test.cjs`, `evals/depth/CAREER-WRITING.mutations.cjs`, `evals/depth/results/CAREER-WRITING.json`; ~420 lines |
| codex/forward-upgrade-preflight-20261018 | 2026-10-18 | 222 | RETIRE-SUPERSEDED (sampled) | Stack tip. 302/11,458 anywhere (2.6%), 2 same-path in trunk, 0 in v2. Top files sampled: `scripts/career/forward-upgrade/reference-catalog.json` 0/331, `packages/domain/interview-journey/index.js` 0/243, `155-career-conversation.js` 0/200, `workers/career-browser/service.cjs` 0/190, five `supabase/sql/proposals/*.sql` (proposals, never migrations) ≤8 each, `career_model_reply.ts` 0/121, `career_interview_entry.ts` 0/119, `career_model_grounded.ts` 0/107, `greenhouse-native.cjs` 0/104 (verified only on "modeled loopback"). Never deployed. Trunk rebuilt each feature: apply via `career_apply.ts`, `scripts/apply.ts`, the extension and `workers/career-cloud` (D-014, D-017, D-022); the gateway via `model_gateway.ts` (D-002); interviews via `career_mock.ts` and `career_voice.ts` (WO-025, WO-035); batch approval via WO-021 and WO-022. D-001 froze the line. Salvage: PORT rows 1 and 3 | — |
| codex/mass-applications-20261017 | 2026-10-17 | 217 | RETIRE-SUPERSEDED | Ancestor of forward-upgrade. 298/10,875; same evidence | — |
| codex/native-browser-integration-20261017 | 2026-10-17 | 189 | RETIRE-SUPERSEDED | Ancestor of forward-upgrade. 279/9,246 | — |
| codex/native-recovery-20261017 | 2026-10-17 | 155 | RETIRE-SUPERSEDED | Ancestor of forward-upgrade. 226/6,915 | — |
| codex/career-critical-repairs-20261016 | 2026-10-17 | 151 | RETIRE-SUPERSEDED | Ancestor of forward-upgrade. 226/6,785; 1,760 evidence files | — |
| codex/evaluator-live-admission-20261017 | 2026-10-17 | 93 | RETIRE-SUPERSEDED (sampled) | Second stack tip. 206/5,094. Its 11 commits beyond forward-upgrade are all evidence and docs | — |
| codex/spec-b-interview-depth-20261016 | 2026-10-17 | 87 | RETIRE-SUPERSEDED | Ancestor of evaluator. 187/4,210. The interview journey was rebuilt on trunk (WO-025, WO-035) | — |
| codex/career-flexible-grounding-20261016 | 2026-10-16 | 65 | RETIRE-SUPERSEDED | Ancestor of both tips. 181/2,868 | — |
| codex/model-gateway-boundary-review-20261016 | 2026-10-16 | 39 | RETIRE-SUPERSEDED | Ancestor. 168/2,160. Trunk has its own gateway | — |
| codex/career-model-gateway-20261016 | 2026-10-16 | 35 | RETIRE-SUPERSEDED | Ancestor. 162/1,953 | — |
| codex/browser-native-recovery-20261017 | 2026-10-17 | 30 | RETIRE-SUPERSEDED | Ancestor. 85/2,380 | — |
| codex/privacy-research-conversation-integration-20261016 | 2026-10-16 | 28 | RETIRE-SUPERSEDED | Ancestor. 158/1,659. Its 130 privacy fix is ported via correction-authority-privacy | — |
| codex/research-conversation-review-20261016 | 2026-10-16 | 21 | RETIRE-SUPERSEDED | Ancestor. 144/1,391 | — |
| codex/greenhouse-vertical-slice-20261017 | 2026-10-17 | 17 | RETIRE-SUPERSEDED | Ancestor. 58/1,381. Loopback-only native Greenhouse; trunk applies via extension and engine | — |
| codex/greenhouse-submit-handoff-20261017 | 2026-10-17 | 8 | RETIRE-SUPERSEDED | Ancestor. 43/647 | — |
| codex/conversation-fixes-20261016 | 2026-10-16 | 5 | RETIRE-SUPERSEDED | Ancestor. 103/847. Router conversation repairs (d112fe5c and others); the agent brain is the path forward (D-008, WO-016, WO-019) | — |
| codex/public-research-browser-20261016 | 2026-10-16 | 5 | RETIRE-SUPERSEDED | Ancestor. 41/324 | — |
| codex/apply-stack-integration-20261018 | 2026-10-18 | 17 | RETIRE-SUPERSEDED | 126/2,171. Contains fix/portal-driver-r3 and finish/answer-bindings (old 149/150 stack, plus the delegated facts F-027..F-079 that D-007 orders deleted), 28k lines of evidence, and 2 guard tests | — |
| codex/upmore-messaging-native-20261010 | 2026-10-11 | 2 | RETIRE-SUPERSEDED | 30/572 (generated `agent_runtime.js` excluded). Finance-era runtime store and service, plus migration `20261010200000_agent_runtime_state.sql` (on neither line). Superseded by WO-013 delivery and the WO-002 agent loop | — |
| codex/upmore-production-integration-20261010 | 2026-10-10 | 3 | RETIRE-SUPERSEDED | 537/13,317 (labeled datasets partly on both lines; the engines 47-save and 48-investing on neither). Finance product shelved (D-004, D-005, WO-011) | — |
| codex/conversation-recovery-eval-20261016 | 2026-10-16 | 5 | RETIRE-ARCHIVE | 11/313. One eval run's scripts plus 81 evidence files | — |
| codex/career-worker-integration-fix-20261015 | 2026-10-15 | 1 | RETIRE-ARCHIVE | No code: 2 docs and 7 evidence files | — |
| audit/memory-capability-20261013 | 2026-10-14 | 8 | RETIRE-SUPERSEDED | 101/846. Finance agent modules (64-send, 68-cancel, 69-router, 70-split) plus a paid memory-audit harness. Finance shelved (WO-011) | — |
| career/gauntlet-deepdive | 2026-10-13 | 1 | RETIRE-ARCHIVE | A gauntlet record plus 16 lines of runner tweak (1/16) | — |
| claude/k12-settlements | 2026-10-13 | 5 | RETIRE-SUPERSEDED | 33/647. Finance (found money, scam triage); shelved | — |
| claude/k13-vault | 2026-10-13 | 6 | RETIRE-SUPERSEDED | 36/656. Finance (vault and documents); shelved | — |
| claude/k8-portals | 2026-10-13 | 4 | RETIRE-SUPERSEDED | 21/978. Finance provider portals; shelved | — |
| finish/answer-bindings | 2026-10-17 | 10 | RETIRE-SUPERSEDED | 0/717. Consumes the delegated facts F-027..F-079 that D-007 orders deleted. Old 149/150 stack. Contained in fix/portal-driver-r3 | — |
| finish/apply-readiness | 2026-10-17 | 3 | RETIRE-SUPERSEDED | 74/613. Trunk rewrote the challenge detector (`page-functions.cjs`, presented-frame check), and `render-form.cjs` waits for `networkidle` (SPA settle). The relay and SPKI Chromium wrapper are Codex-sandbox tooling | — |
| fix/bug-240-batch-seam | 2026-10-16 | 1 | RETIRE-SUPERSEDED | 81/262. A 142 claim for module 155 batch apply; 155 retires (D-014), replaced by WO-022 | — |
| fix/crew-a | 2026-10-19 | 3 | RETIRE-ARCHIVE | A GC pass on the frozen forbidden-rules register plus gauntlet records (D-006); register-coverage guard 2/90 | — |
| fix/portal-driver-r3 | 2026-10-17 | 13 | RETIRE-SUPERSEDED | 116/2,070. Fixes to old 149/150 and to the pre-rewrite helper (trunk binds per field via `form-bind.ts`). Includes D-007-forbidden delegated facts | — |
| release/career-build-20261015-v1 | 2026-10-13 | 2 | RETIRE-SUPERSEDED | 32/93. A finance Roth IRA fact plus a go-live record; also contained in main and audit/memory | — |
| wo/001-green-gate | 2026-10-19 | 10 | RETIRE-CONTAINED | Merged as PR #4 (squash). 116/139 same-path in trunk, 126/139 anywhere. The rest was reworked in later `gate.sh` | — |
| wo/009b-2-form-snapshots | 2026-10-19 | 1 | RETIRE-SUPERSEDED | 5/111. WO-009b-2 retired raw-HTML capture; `tests/fixtures/forms-ci` (20 files) is on trunk | — |
| wo/009b-3-fill-readback | 2026-10-19 | 1 | RETIRE-SUPERSEDED | 3/103. WO-009b: "superseded by this branch; delete it" | — |
| wo/009b-3-rendered-readback | 2026-10-19 | 3 | RETIRE-SUPERSEDED | 3/153. Harness rewritten (reformatted per review) in wo/009b-3-acceptance | — |
| wo/009b-5-worker-pull | 2026-10-19 | 3 | RETIRE-SUPERSEDED | 259/579 (009b-1 queue in trunk: migration 74/87, store 40/40, apply-script test 53/54). `pull.cjs` (2/102) was replaced by WO-039 `workers/career-cloud/worker.ts`. WO-039: "the old 009b-1 pool claim has no caller" | — |
| wo/009b-6-coverage | 2026-10-19 | 2 | RETIRE-SUPERSEDED | 5/341. Redirected: `postings.json` retired. Trunk has `evals/apply/fill-coverage.ts`, ask-once and `questions-ci*` | — |
| wo/009b-apply-worker | 2026-10-19 | 3 | RETIRE-SUPERSEDED | 46/361. An earlier checkpoint (live-view, apply-queue, schema-cache), replaced by trunk's `career_apply_jobs` and WO-039 | — |
| work/mi023-tailoring-residual | 2026-10-17 | 1 | RETIRE-SUPERSEDED | Test only (6/51). The MI-023 owner ruling (50ae5de8, on both lines) counts skills[] as attested, which reverses this guard's premise. It fails 1/3 on trunk by design | — |
| work/mi034-board-tranche2 | 2026-10-17 | 1 | RETIRE-CONTAINED | `board-directory.json` 331/335 in trunk (taken by WO-006); test 52/52. The probe and merge scripts were one-off | — |
| work/mi034-egress-2 | 2026-10-17 | 2 | RETIRE-CONTAINED | `board-directory.json` 432/435; test 59/60. The missing lines are boards WO-006 dropped on purpose | — |
| work/mi098-constellation | 2026-10-17 | 1 | RETIRE-SUPERSEDED | 61/260 (the found lines are shared test boilerplate). A fellowship portal family on 149/150 (old stack, D-014) | — |
| work/mi099-tally | 2026-10-17 | 1 | RETIRE-SUPERSEDED | 54/242. Same as above | — |
| work/mi100-formassembly | 2026-10-17 | 1 | RETIRE-SUPERSEDED | 59/235. Same | — |
| work/mi101-google-forms | 2026-10-17 | 1 | RETIRE-SUPERSEDED | 54/331. Same | — |
| work/mi102-neo-bubble | 2026-10-17 | 1 | RETIRE-SUPERSEDED | 63/259. Same | — |
| work/mi103-thiel | 2026-10-17 | 1 | RETIRE-SUPERSEDED | 54/368. Same | — |
| work/mi104-bespoke-sites | 2026-10-17 | 1 | RETIRE-SUPERSEDED | 65/349. Same | — |
| work/mi106-repost-stale | 2026-10-17 | 1 | RETIRE-SUPERSEDED | 11/313. Repost semantics now live in `career_ingest.ts` (first_seen_at never moves; a reopened posting is not new). Gap: no `possibly_stale` flag | — |
| work/mi107-polling-efficiency | 2026-10-17 | 2 | RETIRE-SUPERSEDED | 29/279. Conditional GETs (If-None-Match / If-Modified-Since, board-state etag) are in `career_ingest.ts` | — |
| work/mi108-duplicate-check | 2026-10-17 | 1 | RETIRE-SUPERSEDED | 47/432. Code is on old-stack 149/126/155. Gap: trunk does not check against applications the person made by hand | — |
| work/mi111-credit-ledger | 2026-10-17 | 2 | RETIRE-SUPERSEDED | 20/387. Trunk's `career_hired.ts` has its own PDL credit budget and log. Gap: no per-user Hunter ceiling | — |
| work/mi117-alert-fatigue | 2026-10-16 | 1 | RETIRE-SUPERSEDED | 24/341. WO-007 `career_alerts.ts` caps alerts and enforces quiet hours | — |
| work/mi118-telemetry | 2026-10-17 | 1 | RETIRE-SUPERSEDED | 39/463. Telemetry in the 149/150/155 run paths; trunk records proof via D-024 (`career_apply_receipts.ts`) | — |
