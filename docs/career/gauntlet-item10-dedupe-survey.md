# ITEM-10 dedupe survey — read-only map (no code changed)

Survey lane for owner queue item 10: "dedupe 132/apply3, 135/138, the doubled 130 into single sources."
This document is analysis only. No module, test, script, or bundle was modified.

- Survey base: `b7d9f83` ("gauntlet: merge held-out variants (80)")
- Survey branch: `career/gauntlet-item10-survey` (this doc + its commit are the branch's only contents)
- Survey date: 2026-10-13 ~14:00 CDT
- Authority sources consulted: `scripts/build-router-core.py` (its `names`/`exports` lists), the generated bundle `supabase/functions/_shared/router_core.js`, `scripts/career/gauntlet/pilot-lib.cjs` (the staging chat chain), `supabase/functions/agent-chat/handler.ts` + `_shared/`, `packages/domain/141-career-doorstep.js`, `packages/domain/142-career-router.js`, `git fetch origin` + all 85 remote branches (recency table below).

## How "live" is decided in this survey

There is **no production career surface** (live agent-chat is the finance product; ledger item 7 unwired). So "authoritative" here means: which copy the *staging chat chain* uses, which copies the router bundle contains, and which copies the scenario/test corpus actually executes.

- **Staging chat chain** (`pilot-lib.cjs` lines 154–159): `CareerAccess.handleChat` (120) → `CareerOnboarding.handleChat` (130) → `CareerRouter.handleChat` (142) → `CareerDoorstep.handleChat` (141). `pilot-lib.cjs` line 58 requires `packages/domain/130-career-onboarding.js` directly.
- **Router bundle** (`scripts/build-router-core.py` `names` list; `--check` verified CURRENT at survey time): contains `132-career-apply.js` (as `CareerApply`), `132-career-apply3.js` (as `CareerApply3`), `135-career-graph.js` (as `CareerGraph`), `138-career-graphcore.js` (as `CareerGraphCore`), `130-career-w11-ext.js` (as `CareerW11Ext`), `142-career-router.js`. It does **NOT** contain `130-career-onboarding.js`, `141-career-doorstep.js`, or `143-career-containment.js` — verified: `grep -c "const CareerOnboarding"` on the bundle = **0**; `CareerW11Ext` = 1.
- **Production handler** (`supabase/functions/agent-chat/handler.ts`): imports only `StyleCorpus, STYLE_CORPUS_JSON, ScamCheck` from the bundle. No career module is handler-imported. Neither 141/142 nor any apply/graph module is production-reachable today.

---

## Pair (a): 132 `132-career-apply.js` vs "apply3" `132-career-apply3.js`

**Verdict: NOT a duplication of one implementation. "apply3" is the deliberately-complementary "third block," built to own pieces the first 132 deliberately does not.** The owner's description ("a second apply implementation") is wrong on the code, right on the data: the real duplication risk sits in the *application-log shapes*, not the functions.

### The two modules

| | `132-career-apply.js` (F03) | `132-career-apply3.js` (W06) |
|---|---|---|
| Lines | 337 | 173 |
| Global | `CareerApply` | `CareerApply3` |
| Built | 2026-10-12, branch `career/sc-f03` (commit `5175337`): "APPE-005/007/008 apply rail" | W06/F02 lane (commit `d44d58f`: "W06 Apply-3 (canonical SC-101..120)"; recovered into pivot via `0d6f6c1` after its original worktree files were found uncommitted) |
| Job, in its own header's words | Guardrails + submission seams: sensitive-answer confirmation, salary honesty, knockout honesty, 15/day cap, duplicate + current-employer guards, batch card, audit records, referral stacking; W04 added assessment-invite handler, inbox reconciliation, cooldown sentinel, autopilot rules, nightly summary, window sweep | "Pieces the earlier modules deliberately do not own": injectable application-log + inbox seam (126-shaped), statusAnswer, rejectionAutopsy, salary-band parsing/filter, date-anomaly repair, variant registry + guardAttach, deadlineRadar, triageLinks, eligibilityJudge |
| Exports | DAILY_CAP, createLog, buildAuditRecord, findApplications, getAuditRecord, checkDuplicate, profileEmployers, checkCurrentEmployer, applicationsOn, enforceDailyCap, attemptRaiseCap, classifyQuestion, savedSponsorshipAnswer, savedAnswerFor, confirmSensitive, salaryQuestion, yearsForSkill, checkKnockout, checkReferral, triageBatch, batchCard, displayCompany, handleAssessmentInvite, parseInboxConfirmations, reconcileInbox, checkCooldown, createRule, evaluateRule, nightlySummary, checkWindows (30) | statusAnswer, rejectionAutopsy, parseSalaryBand, salaryFilter, detectDateAnomalies, guardAttach, deadlineRadar, parseDates, triageLinks, eligibilityJudge (10) |
| Shared exports | **none** — zero exact-name overlap | |

### Callers (grep-proven, by-path requires; neither is called by the chat chain)

- `CareerApply` (132): `tests/career-apply.test.cjs`, `tests/career-finisher-f.test.cjs`, `scripts/career/scenarios/_f03-lib.cjs` (feeds legacy-f03 `SC-041..SC-060`, ~20 runners, + `_w04-lib.cjs` for the W04/SC-061..080 extension), `scripts/career/scenarios/SC-120.cjs` (direct require). **Not** required by 141, 142, pilot-lib, or the handler.
- `CareerApply3`: `scripts/career/scenarios/lib.cjs` (feeds `SC-103..SC-120`, 18 runners), `tests/career-apply3.test.cjs`, `tests/career-finisher-f.test.cjs`. **Not** required by 141, 142, pilot-lib, or the handler.
- Bundle: both are in `names` and `exports`; neither is imported by any `_shared/*.ts` or the handler. Bundle-live but chat-dead.

### Behavioral overlaps that LOOK like duplication but aren't

- **Duplicate detection:** 132 `checkDuplicate` (company+role vs its own `{records:[]}` log; BUG-033 fixed jobId-null records) vs apply3 `triageLinks` duplicate class (link identity vs postings; BUG-039 fixed query-string stripping). Different inputs, different keys, both pinned by replay tests. Not mergeable without changing key semantics.
- **Salary:** 132 `salaryQuestion`/`confirmSensitive` (never invent a number; user-approved numbers only) vs apply3 `parseSalaryBand`/`salaryFilter` (parse *posting* bands, filter postings by floor). Complementary legs of one rule; dropping either loses a pinned behavior.
- **Eligibility/knockout:** 132 `checkKnockout` (posting requirement vs profile, stops unless explicit user override) vs apply3 `eligibilityJudge` (delegates to 121 hard filters + proven-skill coverage; verdict submit|skip with reasons). Closest conceptual overlap; different verdict semantics (override allowed vs submit|skip) and different call sites (doorstep-adjacent vs corpus triage).
- **Inbox proof:** 132 `parseInboxConfirmations`/`reconcileInbox` vs apply3 `statusAnswer` (log stage cross-checked against inbox with message-id proof). Both do "inbox vs log," but over **incompatible log shapes** — which is the actual duplication.

### The REAL duplication: three application-log shapes

- 132: injected `{ records: [], _seq }`, records carry `applicationId: "APP-###"`.
- apply3: injected `{ applications: [] }`, rows carry `app_id: "TEST-APP-..."`, with `events[]`, `variant_id`, `bucket_at_apply`, `fit_score_at_apply` — deliberately shaped to mirror 126.
- 126-career-track (the tracker, a third module): `{ rows: [...] }` / array, rows carry `app_id` with 13-stage lifecycle and events.
- apply3's own header says its seam "mirrors 121 job ids and the 126 tracker's patterns... when 126 lands, this seam is the shape it should consume." 126 *has* landed, but the unification never happened. No code path converts between `APP-###` records and `app_id` rows.

### Tests pinning each copy

- 132: `tests/career-apply.test.cjs` (APPE-005 sponsorship/salary, duplicate protection incl. BUG-033 replay, caps, batch card), `tests/career-finisher-f.test.cjs` (batch-card rendering, sponsorship prompt wording), scenario families F03 (`SC-041..060` via `_f03-lib`), W04 (`SC-061..080` via `_w04-lib`).
- apply3: `tests/career-apply3.test.cjs` (SC-115 statusAnswer, SC-116 autopsy, SC-118 salary parser, SC-103/SC-104 replay tests incl. BUG-006), `tests/career-finisher-f.test.cjs` (deadlineRadar), scenario family W06 (`SC-103..120` via `lib.cjs`).
- All seven suites in scope were re-run at survey time: **74/74 pass** (`career-apply`, `career-apply3`, `career-graph`, `career-graph-w08`, `career-onboarding`, `career-w11-ext`, `router-bundle`).

### Recommendation — keep both files; consolidate the LOG, not the code

Authoritative candidates: **both survive** — they are different jobs, both bundled, both scenario-live, neither chat-live. There is nothing to delete.

Consolidation steps for the build lane:
1. Canonicalize ONE application-log shape: adopt the 126/apply3 `app_id` row shape (13-stage lifecycle, events with evidence) as the canonical log; keep 132's richer *audit record* (answers + confirmation state + referral, per-application `APP-###` ids) as a second layer keyed by the same `app_id`, or rewrite `buildAuditRecord` onto `app_id` ids.
2. Add explicit adapters (132→126 row, apply3→126 row) in ONE place — not in both modules — and route all three through `126-career-track`'s `rowsOf` store convention.
3. Consider renaming the file only for clarity (`132-career-apply3.js` → keep; the name is fine — it is genuinely a third block of the apply family, not a rival). Do NOT rename the exported global `CareerApply3` without updating `build-router-core.py` exports, the bundle, `lib.cjs`, `career-finisher-f.test.cjs`, and the 18 scenario scripts.
4. Regenerate the bundle (`python3 scripts/build-router-core.py`); re-run `node --test tests/career-apply.test.cjs tests/career-apply3.test.cjs tests/career-track.test.cjs tests/career-finisher-f.test.cjs tests/router-bundle.test.cjs` plus scenario runners SC-041..080 and SC-103..120.
5. Do not fold 132 into apply3 or vice versa: their export sets are disjoint and both scenario families run green today.

Merge-risk: **LOW** for the code (nothing to merge — disjoint by design). **MEDIUM** for the log-shape unification (three shapes, inbox-reconciliation keying, and `APP-###` vs `app_id` id spaces must be migrated with the BUG-033 replay test still passing).

Cross-reference: 132 and 130 both export a function named `confirmSensitive` with **different signatures** (132: `(profile, question, opts)` classifying a question string; 130: `(profile, field, opts)` with `SENSITIVE_FIELDS` lookup). Same name, different jobs, different callers. Worth a rename at dedupe time to avoid the next reader's confusion; behavior must be preserved.

---

## Pair (b): 135 `135-career-graph.js` vs 138 `138-career-graphcore.js`

**Verdict: REAL duplication — two warm-path graph engines, same job, incompatible person/store schemas.** Born of a branch numbering collision, fossilized by a merge that renamed one file but missed its scenario glue.

### Origin (commit-proven)

- `dfb22fc` (branch `career/sc-w08`): built a "graph engine 135" (T-07/T-26/T-27/T-98, Referrals SC-146..175 slice, SC-141..160 runners).
- `5bda977` (branch `career/sc-w09`): independently built a *different* `135-career-graph` (REF-001..010, SC-161..175 slice).
- `c2b2c03` (merge of sc-w08 into pivot/career): conflict on `packages/domain/135-career-graph.js` — resolution **kept w09's 135** and added w08's engine as **`138-career-graphcore.js`** (234 lines), with `tests/career-graph-w08.test.cjs` repointed at 138. The merge's own stat shows the rename; the follow-on Integration 8 (`373218e`) then UMD-wrapped 135.
- **The merge missed `scripts/career/scenarios/w08-common.cjs`**: it still does `require(.../135-career-graph.js)` but calls `G.createGraph(...)` / `G.importRecords(...)` — **138's API, not 135's** (135 exports `makeGraphStore`/`importGraph`; `createGraph` is undefined on it). Verified live: `node scripts/career/scenarios/SC-147.cjs` → `TypeError: G.createGraph is not a function`. All 20 SC-141..160 runners through `w08-common.cjs` are broken at survey base.

### Overlap, function by function

Exact-name export overlap is only two functions — but both differ:

- `forwardableBlurb`: 135 `(profile, facts)` → three lines from *usable profile facts* with per-line `fact_id`, word count; 138 `(graph, profile122Profile)` → three lines from *confirmed 122 facts*, returns `fact_ids` array. Same name, different signatures, different return shapes.
- `relationshipMemory`: 135 `(store, name)` matches by normalized `full_name`, returns `{name, found, person, last, history, summary}`; 138 `(graph, name)` matches via `byName`, returns `{found, name, company, stage, chats, last_contact_at, last_summary, history}`. Same name, different keys.

Functional (same job, different shape) overlap across the rest:

| Job | 135 (CareerGraph) | 138 (CareerGraphCore) |
|---|---|---|
| Store | `makeGraphStore()` → `{people, interactions, referrals}` | `createGraph(user)` → `{user, people, interactions, referrals, snapshots, _seq}` |
| Person schema | `full_name, current_firm, work_email, linkedin, schools[], clubs[], at_company...` | `name, company, email, school (singular), clubs[], stage...` |
| Identity merge | `identityKeys` (email/linkedin/name+firm/name+school) + `mergeIdentities` → `{people, merges...}` | `samePerson` + `importRecords` mutates graph, `person_id: "P-###"` |
| Warmth | `rankWarmth(person, profile, opts)` numeric score; cross-city alumni **discounted −15 and disclosed** | `WARMTH` tiers alumni 50 > club 40 > major 30 > hometown 20; `warmthOf`/`rankPaths(graph, company)`; canonical order asserted by test |
| Path finding | `findPaths`, `pickStrongerPath`, `departedNextPath` | `rankPaths`, `topWarmPathSweep`, `secondDegreeMap` |
| Referral asks | `draftReferralAsk` (kinds: professor/family_friend/recruiter/practitioner), `askKindFor`, `createReferral`, `approveReferral`, `thankYouReferralCombo`, `dormantRevival`, `referralTiming` | `planReferralAsk` (SC-151 law: held chat before any referral ask), `draftIntroRequest`, `recordReferralSignal` |
| Referral → application link | `markReferralSubmitted` writes onto **126 tracker rows** | `linkReferralToApplication` (graph-internal link) |
| Conversion | `conversionByContact` | `conversionTracking` |
| Keep-warm | `keepWarm` | `keepWarmSuggestions` + `draftUpdateTouch` |
| Memory/interactions | `relationshipMemory`, `logInteraction` | `relationshipMemory`, `recordInteraction` |

Only in 135: `exclusionFor` (current-employer + departed exclusions), `referralBonusIntel` (BUG-122: honestly reports no bonus amounts), `miniCampaign`, `adaptCirForPrep`, `normalizePerson`/`mergeInto` internals.
Only in 138: `STAGES` CRM pipeline + forward-only `setStage`, `publicSourceLookup`, `mentorMap`, `snapshot`/`newHireRadar`, `importLinkedInCsv` (via 122's parser), second-degree mapping.

### Callers (grep-proven)

- 135: `tests/career-graph.test.cjs`; `scripts/career/scenarios/w09-common.cjs` → **SC-161..200-canonical (40 runners) + `gapfill-prep.cjs`**; `scripts/career/scenarios/SC-284-canonical.cjs`; `scripts/career/scenarios/w08-common.cjs` → SC-141..160 (broken, see above).
- 138: **only** `tests/career-graph-w08.test.cjs` and the bundle (`scripts/build-router-core.py` names + exports). No scenario runner successfully executes it; its intended 20-runner family points at the wrong file.
- Bundle: both present and exported as `CareerGraph` / `CareerGraphCore`; neither imported by any `_shared/*.ts`, the handler, 141, or 142.

### Authoritative candidate: **135**

135 is authoritative by every usage axis: its 40-runner scenario family executes, its test suite passes, it owns the 126 tracker seam (`markReferralSubmitted`), and w09's family doc + `finisher-t-audit` T-10/T-08 reference it. 138 is test-live but scenario-dead; nothing in the chat chain or handler touches either.

### Recommendation — merge into 135's schema, retire 138

1. Survivor: `135-career-graph.js` (global `CareerGraph`), keeping its store/person schema (`full_name`/`current_firm`) because 40+ scenario runners, `tests/career-graph.test.cjs`, and the 126 seam depend on it.
2. Port into 135 the 138-only capabilities with no 135 equivalent, adapted to 135's schema: CRM `STAGES` + `setStage` semantics, `secondDegreeMap`, `publicSourceLookup`, `mentorMap`, `snapshot`/`newHireRadar`, `importLinkedInCsv` (122-backed), and the SC-151 held-chat-before-ask law from `planReferralAsk` (check against 135's `referralTiming` so the laws don't contradict).
3. Do NOT port by keeping both schemas: pick one person shape. If a 138-schema behavior is genuinely needed, write an import adapter (138-shaped record → 135 `normalizePerson`), not a second store.
4. Repoint `w08-common.cjs` at the merged module and repair its 20 runners to the merged API (they were written against 138's API — this is the repair the missed merge left behind), or repoint them runner-by-runner to 135 equivalents.
5. Delete `138-career-graphcore.js`, remove it from `scripts/build-router-core.py` names+exports, regenerate the bundle, delete/merge `tests/career-graph-w08.test.cjs` into `tests/career-graph.test.cjs`.
6. Tests to run: `tests/career-graph.test.cjs`, the merged w08 test content, `tests/career-outreach.test.cjs` (124's warmPaths adjacency), `tests/router-bundle.test.cjs`, scenario runners SC-141..160 and SC-161..200, and `node --test tests/*.cjs` for the mutation-coverage doc references (`docs/depth/MUTATION-COVERAGE.md` lines 1688/1690 list both files).

Merge-risk: **HIGH**. Two person schemas, two fixture shapes (`test-graph-sources.json` is 138-shaped with `name`/`company`; 135's tests use persona-style profiles), two warmth models (numeric-with-discount vs canonical tiers — the SC-147 canonical-order assertion and the 135 cross-city-discount assertion must both be re-decided, not silently merged), and 20 currently-broken runners that must be repaired, not just repointed. Also note the pre-existing broken reference must be fixed *before or with* the merge — landing a dedupe on top of a broken family hides regressions.

---

## Pair (c): "the doubled 130"

**Verdict: number collision, not code duplication.** Two unrelated files share the number 130; they do not implement the same job, share zero exports, and neither is dead. The genuinely doubled thing inside 130's *lineage* is the profile-write path — which is split three ways and half-absent from the bundle.

### The two files

| | `130-career-onboarding.js` | `130-career-w11-ext.js` |
|---|---|---|
| Global | `CareerOnboarding` | `CareerW11Ext` |
| Lines | 344 | 313 |
| Built | F01, commit `6b4af6e`: onboarding interview, ask-once memory, sensitive-confirm, profile export, honest capability status, re-auth dedupe | sc-w11, commit `6351dec`: "**NEW file by design**" — W11 prep-tail/negotiation gap functions + BUG-141 CIR adapter, because vendored 127/128 must stay byte-identical |
| Exports | STEPS, stepAnswered, nextQuestion, startInterview, answerCurrent, factVersion, bumpFactVersion, answerFromProfile, SENSITIVE_FIELDS, sensitiveAnswerPrompt, confirmSensitive, profileExport, capabilityStatus, createReauthLog, planReauthSends, applyProfileCorrection, applyPersistedCorrections, exportCorrectionStore, restoreCorrectionStore, _resetCorrectionStore, handleChat | adaptCir, researchTalkPrep, teachingDemoPrep, portfolioWalkthrough, hiringManagerBrief, barRaiserPrep, belowFloorAnalysis, equityScenarios, signingBonusPivot, returnOfferConversion, compExpectationAnswer, pressurePlan, leverageScript, referralOut, DISCLAIMER |
| Shared exports | **none** | |

Callers: onboarding — `pilot-lib.cjs` (live in staging chain), `run-deepdive-sh.cjs`, `run-pilot.cjs`, `_f01-lib.cjs` → legacy-f01 SC-008..020, `SC-301/303/305`, 141 + 142 (guarded), and six test files. w11-ext — `w11-lib.cjs` → SC-201..220 (20 runners), `tests/career-w11-ext.test.cjs`, bundle only. There is no duplicated onboarding/profile-write *module* to delete; renumbering is a hygiene fix, not a dedupe.

### The real 130 problem: one write path, three owners, half-missing from the bundle

1. **Bundle asymmetry.** `130-career-w11-ext.js` is bundled and exported; `130-career-onboarding.js` is not (also missing: 141, 143 — ledger item 7's remaining work, Codex's lane per the division of labor). In the Deno bundle, 142's line-47 guard (`typeof CareerOnboarding !== "undefined" ? ... : req("./130-career-onboarding.js")`) resolves to `null` (no `require` in the bundle), and 141's line-111 guard does the same. Both modules then run their fallbacks.
2. **142 re-implements the sensitive-fact write.** `writeSensitiveCorrection` (142, ~lines 711–740) calls `Onboarding.answerCurrent(...)` when available (Node/staging), but then **overwrites `cons.workAuthorization`/`cons.needsSponsorship` directly anyway** — because, per its own comment, 130's regex derivation cannot express "no longer need" (it reads the embedded "need sponsorship" as a need). Divergences a dedupe must handle:
   - 130's `answerCurrent` **bumps `profile.fact_version`** (R2B, commit `0dd1ef0`); 142's direct write does **not** call `bumpFactVersion`. 141's stale-packet seam reads `factVersion` (when 130 loads) *and* a fact-hash — so in the bundle, where 130 is absent, a 142 sponsorship correction invalidates packets via the hash path only, with no version bump on record.
   - Both push entries onto the same `profile.profile_corrections` array in **different shapes** (130: `{at, instruction, source:"resume-new.txt", precedence, changes, outcome}`; 142: `{at, instruction, source:"chat correction", precedence, changes, outcome, via}`), and 142's `dependent_state` invalidation copy (`invalidated_by: "sensitive fact correction..."`) duplicates the invalidation 130's correction store performs.
   - In staging (pilot-lib) the 130 write runs and the audit says "130-career-onboarding visa write (answerCurrent)"; in the bundle the fallback note says "direct field write (130 not loaded in this bundle)" — same user-visible sentence, different audit provenance. A grader comparing audit trails across environments will see two different stories.
3. **130's recall gating is a separate known defect, not duplication:** `handleChat` only routes recall on a `what's my` prefix (run-deepdive-sh SH02 notes the natural "what roles am I looking for?" misses `answerFromProfile`, which would have matched). Logged FOR-CODEX (queue item 8's recall semantics) — this lane must not "fix" it under a dedupe banner.

### Which copy is live

- In the **chat chain (pilot-lib)**: onboarding is live (second handler tried, line 156–157); w11-ext is not in the chain.
- In the **router bundle**: w11-ext is live (exported); onboarding is absent.
- **Neither is dead.** Killing either breaks a green test suite and a green scenario family.

### Recommendation — renumber w11-ext; consolidate the write path on 130's exports

Authoritative: onboarding keeps `130`; w11-ext is the one to renumber (it is the later arrival and its number is the accident).

Consolidation steps for the build lane:
1. Rename `130-career-w11-ext.js` → a free number with a descriptive name (e.g. `144-career-prep-negotiation-ext.js`), keeping the global `CareerW11Ext` if churn is a concern — or rename the global too and update all three reference sites (`w11-lib.cjs`, `career-w11-ext.test.cjs`, `build-router-core.py` + regenerated bundle). The rename is mechanical; the 20 SC-201..220 runners must be re-run, not just repointed, because `w11-lib.cjs` is their only loader.
2. **Do not touch** onboarding's correction-store surface (`CORRECTION_STORE`, `exportCorrectionStore`/`restoreCorrectionStore`, `applyPersistedCorrections`) in the dedupe: durable owner-scoped persistence for 130 is **Codex's lane** (ledger division of labor, queue item 8). See collision report — no Codex branch exists yet, but the lane is assigned; a dedupe that refactors those exports collides with the persistence work by design, not by accident.
3. Consolidate the sensitive-fact write on 130's exports: teach 130's visa/sponsorship path to represent explicit "no longer need" (the reason 142 forked the write), then make 142's `writeSensitiveCorrection` call through it unconditionally and drop the direct-write fallback — keeping the `via` provenance note so the bundle-vs-staging audit story is identical. Preserve both audit shapes' fields or explicitly migrate one; keep `bumpFactVersion` on every write so 141's seam behaves the same in both environments.
4. Do not bundle onboarding yet as part of item 10: wiring 130/141/143 into the bundle and handler is ledger items 7–8 (Codex's lane, grade-only for this program). The dedupe build should regenerate the bundle with the *same membership* minus the retired module, nothing more.
5. Tests to run: `tests/career-onboarding.test.cjs`, `tests/career-w11-ext.test.cjs`, `tests/career-gauntlet-r2*.test.cjs`, `tests/career-gauntlet-r3.test.cjs`, `tests/career-finisher-f.test.cjs`, `tests/router-bundle.test.cjs`, SC-201..220, SC-301/303/305, and the SH02/SH03 deep-dive legs that exercise `applyPersistedCorrections`.

Merge-risk: **LOW** for the renumber alone. **HIGH** if combined with 130 persistence changes (Codex-owned) or with premature bundling of 130/141/143 (item 7/8 territory).

---

## Collision report — remote branches vs the dedupe surface

Method: `git fetch origin` (2026-10-13 ~14:00 CDT), then for each of 85 remote branches, `git rev-list --count b7d9f83..$branch` for unique commits and `git diff merge-base..branch` restricted to `packages/domain/130-career-onboarding.js`, `130-career-w11-ext.js`, `132-career-apply.js`, `132-career-apply3.js`, `135-career-graph.js`, `138-career-graphcore.js`, `scripts/build-router-core.py`.

Result: **no remote branch with unique commits modifies any of the six domain files.** The dedupe build does not collide with any in-flight module work on 130/132/135/138.

- **Codex branches** (the lanes that matter per the division of labor): `origin/codex/upmore-production-integration-20261010` (tip `bb3250e`, 2026-10-10 19:22 CDT, 3 unique commits) and `origin/codex/upmore-messaging-native-20261010` (tip `9efb158`, 2026-10-11 20:20 CDT, 2 unique commits). Both predate the career modules entirely; **zero target-file changes** on either. **No Codex career/persistence branch exists on origin as of this fetch** — the expected Codex work on 130's correction-store persistence and the 130/141/143 handler wiring (ledger items 7/8) has not landed anywhere fetchable. The dedupe build should still treat 130's `exportCorrectionStore`/`restoreCorrectionStore`/`applyPersistedCorrections` and any 141/143/handler wiring as Codex-owned and expect a future branch there; that is an *assigned-lane* collision risk, not a *code* collision.
- **`scripts/build-router-core.py` is touched by three unmerged finance branches**, all from 2026-10-13 ~03:33–03:52 UTC (`origin/claude/k8-portals` 4 unique, `k12-settlements` 5, `k13-vault` 6): each appends one finance module to the tail of `names`/`exports` (e.g. k13 adds `118-vault-docs.js` / `VaultDocs`). Their bases predate the career block, so their diffs anchor on lines the dedupe build also edits (the `names`/`exports` tails). Merging after a dedupe edit will produce a **mechanical, resolvable conflict** on those two lines — keep both additions. Flagged so the merge isn't mistaken for a semantic collision.
- `origin/career/sc-w11` and `origin/pivot/career`: 0 unique commits vs `b7d9f83` — fully contained. (sc-w11 is w11-ext's own origin lane, merged via `2c4a3f5`; its content is already in the base. Its tip date 2026-10-13 05:54 UTC is just the last commit on that lane, not new work.)
- Local note: survey base `b7d9f83` is 2 commits ahead of `origin/pivot/career` (unpushed at fetch time); the survey worktree branch is off that local base.

---

## One-paragraph honest note

The owner's three descriptions are, in order: wrong, half-right, and wrong in a useful way. "132 vs apply3" is not two apply implementations — apply3 is a deliberately complementary third block with zero shared exports, and merging them would destroy pinned behavior; the actual duplication is three incompatible application-log shapes (132's `{records}`, apply3's `{applications}`, 126's `{rows}`) that no code path converts between. "135 vs 138" is the only true like-for-like duplication — two warm-path graph engines with the same job and incompatible schemas, fossilized by a merge that renamed w08's engine to 138 but forgot `w08-common.cjs`, leaving all 20 SC-141..160 runners crashing today with `TypeError: G.createGraph is not a function` (reproduced); the sharpest dedupe fact isn't the overlap, it's that 138's scenario family is dead on arrival while its unit tests pass. "The doubled 130" is a number collision between two unrelated modules (onboarding vs the W11 prep/negotiation ext), not duplicated code — the genuinely doubled thing is 130's *write path*: 142 re-implements the sponsorship write with its own audit shape and no `fact_version` bump, while 130 itself is simultaneously live in the staging chat chain and absent from the router bundle (bundle grep count for `const CareerOnboarding` = 0). Dedupe accordingly: keep both 132s, merge the graphs into 135's schema, renumber w11-ext, and keep hands off 130's correction-store persistence — that's Codex's assigned lane even though no Codex branch exists on origin yet.

---

## BUILD ADDENDUM — item-10 dedupe build (2026-10-13, branch `career/gauntlet-item10-build`, base 44ba9a7)

Built by the dedupe build lane per the scope in the ledger. Commits: `af3dcc6` (graph consolidation) + `f9eea90` (w11-ext renumber) + this addendum.

### (b) 138 → 135 consolidation — DONE

- **Survivor:** `135-career-graph.js` (global `CareerGraph`), its store/person schema (`full_name`/`current_firm`/`schools[]`) unchanged for the w09 family.
- **Ported from 138, adapted to 135's schema (no second store kept):** `createGraph(user)`, `importRecords` (with an adapter converting 138-shaped records — `name/company/school/email/position/connectedVia/publicLinks` — into 135 persons; person records also carry alias fields `name/company/email/position/school/sources/publicLinks/connectedVia/lastContactAt` synced from the canonical fields), `importLinkedInCsv` (122 parser), `STAGES` + `setStage`, `recordInteraction`, `sharedFacts`/`warmthOf`, `rankPaths`, `topWarmPathSweep`, `secondDegreeMap`, `publicSourceLookup`, `mentorMap`, `planReferralAsk` (the SC-151 held-chat-before-ask law, checked against `referralTiming` — no contradiction: planReferralAsk gates on a held chat, referralTiming decides wait-vs-apply by deadline), `recordReferralSignal`, `linkReferralToApplication`, `conversionTracking`, `keepWarmSuggestions`, `draftUpdateTouch`, `draftIntroRequest`, `snapshot`/`newHireRadar`, `byName`/`atCompany`/`samePerson`.
- **Dual-shape returns kept deliberately (both pinned by tests):** `relationshipMemory` returns the union of 135's fields (`person/last/summary`) and 138's (`company/stage/chats/last_contact_at/last_summary`); `forwardableBlurb` dispatches on its first argument — `(profile, facts)` = 135 shape (lines as `{text, fact_id}` objects), `(graphStore, profile122Profile)` = ported 138 shape (lines as strings + `fact_ids` array).
- **Warmth models — what was preserved / dropped:** 135's `rankWarmth` (additive numeric score; cross-city alumni −15, disclosed) is **preserved unchanged** and remains the scoring for `findPaths`/`pickStrongerPath`/`miniCampaign`. The ported `rankPaths`/`warmthOf` **preserve 138's canonical tier precedence** (alumni 50 > club 40 > major 30 > hometown 20 > cold) because SC-147 pins that exact order and 135's additive points (major 10 < hometown 15) would invert major/hometown in a tier ranking. The models coexist by surface — numeric score on `rankWarmth` rows, canonical tier on `rankPaths` rows, never mixed in one row. This is also documented in the merged module's header. Dropped from 138: its parallel person/store schema and its standalone `norm` export (135's internal `norm` covers it). Nothing else was dropped.
- **w08 repair:** `scripts/career/scenarios/w08-common.cjs` needed **no edit** — it already required 135; the merged API now exists there (this is the repair the missed merge left behind, done on the module side). `tests/career-graph-w08.test.cjs` repointed from 138 to 135 (survey step 5's merge-into-graph-test option was not taken; the w08 suite stays a separate file, now against the survivor).
- **Fail-first proof:** at base 44ba9a7, SC-147 reproduces `TypeError: G.createGraph is not a function` at `w08-common.cjs:14`. Full family at base: **15 of 20 runners crash** (SC-146..160, all graph callers); SC-141..145 (season/outreach only, never call `graph()`) already executed — the survey's "all 20 crash" was imprecise. After consolidation: **20/20 execute, zero TypeErrors; 19 COMPLETE + 1 FAIL on scenario merits** (SC-158: reply-oracle `fact-id` downgrade — its card render surfaces "Fact id: F-003" in user-visible text; the draft itself builds correctly. A composer/card-render issue, not a graph issue; recorded, not fixed here).
- **138 deleted** (`git rm`), removed from `scripts/build-router-core.py` names+exports, bundle regenerated (CareerGraphCore count in bundle = 0). Final caller grep: zero code references to `138-career-graphcore` / `CareerGraphCore` outside the historical header comments inside 135 itself. Note: `docs/depth/MUTATION-COVERAGE.md` still lists `138-career-graphcore.js` — that file is a generated report (`scripts/build-mutation-report.cjs`), already stale at base; its test pair fails identically before/after (see below), and regenerating it is outside this lane's scope.

### (c) w11-ext renumber — DONE: **145**

- `130-career-w11-ext.js` → **`145-career-w11-ext.js`** (git mv; module content byte-identical). 145 is the next free domain number: 144 is taken by `144-career-guidance.js`; the full listing was checked (119 and 137 are also free, but 145 continues the career-block sequence past guidance).
- Global `CareerW11Ext` kept (not number-bearing; survey allowed keeping it). Updated: `scripts/build-router-core.py` names list, `scripts/career/scenarios/w11-lib.cjs`, `tests/career-w11-ext.test.cjs`, and the `docs/depth/MUTATION-COVERAGE.md` inventory line. Bundle rebuilt (content byte-identical, as expected for a pure rename). Final grep: zero references to `130-career-w11-ext` in code; `145-career-w11-ext` referenced by exactly the build script, w11-lib, and the w11-ext test.
- SC-201..220 runners re-run (not just repointed): **20/20 execute**, no load errors; verdicts unchanged in kind (COMPLETE ×13, FAIL ×7 — all reply-oracle downgrades on scenario merits, e.g. SC-203 finance-leak; the rename cannot change behavior, the module is byte-identical).
- `130-career-onboarding.js` NOT renamed; its persistence functions (`exportCorrectionStore`/`restoreCorrectionStore`/`applyPersistedCorrections`) untouched — Codex's lane, as scoped.

### (a) 132/apply3 — untouched, as scoped

No code changed. The application-log shape unification remains **deferred, recorded** in the survey (MEDIUM risk; three shapes, BUG-033 replay constraint).

### Test totals (build tip)

- In-scope suites at base: 103/103 (graph, graph-w08, w11-ext, onboarding, apply, apply3, outreach, router-bundle).
- After step 1: graph + graph-w08 **27/27**; graph + w08 + outreach + bundle **58/58**. After step 2: w11-ext + onboarding + bundle **23/23**.
- Final: full career suite `node --test tests/career-*.test.cjs tests/router-bundle.test.cjs` = **488/488 pass** (includes the gauntlet lane tests).
- Known pre-existing pair: `tests/mutation-report.test.cjs` fails **2/2 identically at base 44ba9a7 and at build tip**, with identical assertion messages ("MUTATION-COVERAGE.md is stale" + "140-career-reply.js must be exactly one of covered or gap"). No other reds.

### Survey corrections found by the build

1. "All 20 SC-141..160 runners crash" — actually 15 crash (SC-146..160); SC-141..145 never call the graph API and already ran.
2. Survey step (b)5 suggested deleting/merging `career-graph-w08.test.cjs` into `career-graph.test.cjs` — the build instead repointed it at 135 and kept it separate (less churn, same coverage); the ledger's scope ("repair w08-common … those runners must EXECUTE") is met either way.
3. 138's `setStage` is described in the survey as "forward-only" — the 138 code enforces no forward-only check (it sets any valid stage and logs the change); the port preserves the code's actual semantics.
