# Independent privacy / conversation / research composition — 2026-10-16

**Scoped privacy regression gate: PASS on the combined product bytes. Overall release gate: NOT_READY.** The published owner repair `382b6e37bd03c0d0dd11b03cbc3fe32ad5157052` is composed with review product `2d29c27bee16d3d943840ef87e9e7e95ad25d307` on isolated branch `codex/privacy-research-conversation-integration-20261016`. The baseline includes documentation-only readiness follow-up `c978b75e997b9ed07dc82dfd587e6a1e7b40d600`; its product bytes match 2d29c27b.

Canonical combined source tested: **`e236a129cf9ed979b4faaf3e826964e1f64fdf72`**, mechanical composition `17e16995`. Transcript-enhanced privacy confirmation ran at `8c512894`; final joint-probe confirmation ran at `7fa8d2f31d4bc4e0d1539685f94e55ce144928ce`. The later commits change only test instrumentation/fixtures and documentation; [byte checks](runs/privacy-research-composition-20261016/preserved-source-and-oracles.json) verify the product files are unchanged. Full source/test/log hashes are in the [run index](runs/privacy-research-composition-20261016/results.json).

The shared release remains `f67db048599db308f2691a7be7feada841143da5`. Muse owns merge/deploy. No production migration, paid/provider call, security/credential change, browser execution, purchase, application or external send occurred. **Actual model quality and all 15 genuine browser outcomes remain unverified.**

## Composition scope and preserved expectations

The owner patch removes module 130's process-global correction map, leaves legacy correction replay/export/restore APIs callable but inert, and makes committed owner-scoped profile JSON the authority. [Module 130](../../packages/domain/130-career-onboarding.js) matches the owner's published file byte-for-byte. No repair was independently reimplemented here. Both bundles were regenerated from the merged source and freshness-checked.

There were no source conflicts. Three documentation/evidence conflicts were resolved by retaining both file claims and drift histories and appending the owner's 11 new ledger records without changing previous records. Conversation module 155, router 142, negotiation 128, host/handler, persistence, research worker, application payload forwarding and research SQL remain identical to the reviewed source. The owner's two legacy gauntlet callers and two tests now round-trip the corrected profile JSON rather than reload an older source and rely on the removed cache; their assertions remain unchanged, and the owner explicitly labels this fixture restart as distinct from real SQL persistence.

[Expectations were frozen](../../tests/fixtures/privacy-research-composition/freeze.json) before combined execution. The 10 owner source cases, seven owner SQL cases and synthetic owner fixture remain byte-identical to 382b6e37. Both original conversation oracle hashes and the existing research expectations/assertions are preserved. The baseline is a separate detached c978b75e worktree with only the three frozen owner test/helper files added as untracked evaluation inputs; no baseline product file was changed. Failed baseline and inherited-routing runs remain retained.

## Observed before/after and combined checks

| Check | Prior review baseline | Exact combined source |
| --- | --- | --- |
| Frozen privacy source / staged transport cases | **1/10 pass**, 9 failures retained | **10/10 pass** |
| Frozen privacy cases through staged entry + real PostgreSQL | **1/7 pass**, 6 failures retained | **7/7 pass** |
| Joint correction → research → other-owner recall / restart and post-erase warm/fresh recall | **1/2 pass**; J01 returns 2028 to owner B, whose year is 2031 | **2/2 pass**; J02 also passes as an erasure non-regression |
| Existing real PostgreSQL persistence/alerts contracts | Not repeated on baseline | **30/30 pass** |
| Existing real PostgreSQL task authority, including both SQL lock races | Not repeated on baseline | **21/21 pass** |
| Original conversation oracle | Prior evidence retained | **543/543 checks, 83 turns** |
| Frozen held-out conversation oracle | Prior evidence retained | **426/426 checks, 82 turns** |
| Independent research source / real PostgreSQL contracts | Prior evidence retained | **12/12 and 17/17 pass** |
| Author research source / real PostgreSQL contracts | Prior evidence retained | **12/12 and 7/7 pass**, corrected fixture data and assertions preserved |
| Scoped existing conversation/router/worker/application/staging plus producer regressions | Prior evidence retained | **250/250 pass** |
| Full legacy R2A + R3 gauntlet tests | **26/27 pass** | **26/27 pass**, identical C37 failure |

The targeted green suites account for **368 passing test cases**, plus the separate **969 frozen conversation checks**. The legacy gauntlet adds 26 passes and one unchanged failure; this is not an all-green release claim. Diagnostic repeat runs and the C37-only subset are not added again to those totals. No cases were skipped in these final runs.

The real PostgreSQL privacy cases cover rollback at user-message insert, assistant-message insert and snapshot write; an owned committed correction; foreign-thread denial; fresh ESM restart; exact replay without duplicate writes; a losing revision race; failed-save same-key retry; and erase epoch rejection of old receipts/stale commits and profile-identity reuse. They execute the actual staged graph against local PostgreSQL, with explicit synthetic authentication. The transcript preload records only the staged helper's synthetic input/response arguments; it does not inspect headers, credentials or environment values, change test assertions or patch the product graph.

[Combined source privacy transcripts](runs/privacy-research-composition-20261016/combined-privacy-source-recorded/transcripts.jsonl), [combined real-PG privacy transcripts](runs/privacy-research-composition-20261016/combined-privacy-pg-recorded/transcripts.jsonl), their [failing baseline](runs/privacy-research-composition-20261016/baseline-privacy-pg-recorded/transcripts.jsonl), [joint probes](runs/privacy-research-composition-20261016/combined-joint-final-pg/transcripts.jsonl), [original conversation turns](runs/conversation-recovery-20261016/privacy-composition-original/transcripts.jsonl), [held-outs](runs/conversation-recovery-20261016/privacy-composition-heldouts/transcripts.jsonl) and [research turns](runs/research-conversation-review-20261016/privacy-composed-research-pg/transcripts.jsonl) are retained with metadata and SQL dumps. The first successful joint run is also retained; the later J02 fixture explicitly removes name/email so a fresh erased profile reuses the default profile identity. That refinement does not change expected outcomes and is not claimed as a newly failing baseline case.

## The unchanged C37 failure

Both full 27-case runs fail exactly `R2A guard: C37's exact wording still belongs to 141 and still halts with its own reply`: actual handler `142-career-router.handleChat`, expected `141-career-doorstep.handleChat`. [Baseline log](runs/privacy-research-composition-20261016/baseline-gauntlet.log), [combined log](runs/privacy-research-composition-20261016/combined-gauntlet.log) and [normalized comparison](runs/privacy-research-composition-20261016/inherited-c37-comparison.json) preserve the same assertion/operator and routing mismatch. No expectation was weakened or routing fix added. This inherited defect remains for its owner/Muse to resolve before a broad green release gate.

## Remaining execution and release prerequisites

The [small runtime/budget checklist](model-browser-readiness-20261016.md) remains applicable: the current career entry is deterministic, the original shared $5 ledger is absent in this environment, spent/remaining balance is UNKNOWN, and the legacy ledger would initialize zero on a missing-file health/status call. None was invoked; no paid call was made and no new budget is assumed. Actual model-backed career testing needs an identified product route, recovered/reconciled shared ledger, global pre-call budget enforcement and existing access exposed through supported secure configuration.

Normal Chromium sandboxing remains blocked by the recorded incompatible helper ownership; the default bundled executable is absent and the installed platform browser runtime is deferred/not exposed as a usable browser API. No browser launch or security change was attempted during composition. An already-authorized compatible runtime must be made available before the real public read-only task chain is exercised. Fixture/source/SQL success does not establish model quality or a browser outcome.

The correction-cache defect is repaired and passes the frozen combined-source privacy checks. This is not certification of production authentication/RLS, every privacy property or deployed behavior. The inherited C37 failure, model/budget/runtime gaps, 15 unverified browser outcomes, source-only research migration scaffolding and Muse's merge/deploy approval remain separate release gates. The review-owned loopback wire listener and network-none database container were removed after evidence capture.
