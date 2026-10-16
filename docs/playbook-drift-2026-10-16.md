# Playbook drift — 2026-10-16

## Conversation recovery: portable clock guard

The root command guide says Node domain tests are verified on a clean clone and no per-user paths are allowed. `tests/career-clock-source-guard.test.cjs` instead loaded a missing `$HOME/workspace/your_files/upmore-career-300-scenarios.md`; in the fresh environment it failed before executing its assertions. The loader now uses the repository's checked-in `scripts/career/gauntlet/routing-expectations.json` and requires the two referenced IDs to exist. Existing assertion bodies, expected verdicts and the original frozen conversation oracle are unchanged. The before failure and after test output are retained under `docs/testing/runs/conversation-fixes-20261016/`. No private uploaded scenario text or personal writing corpus is copied into the packet.

The combined release's owned-worker note described only loopback application
portals. It was accurate for that base, but public-browser research still had
no entry action: `career_task_bridge.js` admitted only application preparation,
approval, reconciliation and status. The independent conversation recovery
evaluation therefore recorded the 15 public cases as unsupported/NOT_RUN.

The review branch adds a bounded `research` intent and ordinary chat command,
using the existing atomic outbox/account authority and owned helper. Public
source capture is reported as `evidence_ready` with its objective still requiring
review. It is not counted as a completed research answer or live browser proof.
The original loopback application restrictions and Muse's approval hash fix
remain intact. No deployed capability or acceptance count is raised.

The forward SQL is a proposal because CLI migration scaffolding is blocked in
this executor. The public-research README records the exact failure, integration
step, normal Chromium blocker, supported scope and 15-case acceptance manifest.

An ordinary chat status commit advances the shared account version and can
therefore revoke queued research. The new `research_status` observation avoids
that write and returns `read_only: true`; it creates no turn pair, receipt or
memory update. Existing application status and account authority are unchanged.
Real PostgreSQL entry tests verify repeated early observations keep the intent
claimable, while an actual STOP still revokes it.

## Independent research/conversation composition

The historical minimum-contract document described the missing public route at f67db048. The separate c574352c route now exists in this isolated composition; annotate the historical scope rather than rewrite prior evidence. Original author fixtures treated a ten-byte PNG signature plus two zero bytes, without chunks/pixels, as a successful screenshot and used a fixed capture time. Independent frozen probes reproduced acceptance of malformed/stale captures, encoded restricted paths, unchecked persisted evidence and stranded central publication. Research-only validation now rejects those representations, binds status to immutable SQL intent/effect readback, and retries an immutable publication payload without a second read. Original tests and failed logs remain unchanged; affected positive fixtures must be triaged as invalid, never exempted in production. PNG structure reference: https://www.w3.org/TR/png-3/ (chunks, CRC, scanline framing). Browser and model quality remain unverified.

Two independent harness expectations were over-specific: runPending may return a cancelled observation after STOP while doing no read, and research reports an unconfirmed finish in its returned task instead of throwing. Corrected those assertions to test the frozen revocation/recovery outcomes. Preserve the initial logs and rerun the original source before attributing remaining failures to product code.

Research validation iteration: the first staged PostgreSQL run after hardening exposed that the Node VM fixture omits the Edge atob global. Removed redundant screenshot decoding in status: the persisted canonical capture hash (including exact screenshot bytes) must match the completed SQL effect receipt, while bounded PNG chunk/CRC/inflate validation stays in the worker. Retain that failed run. Added supplemental probes for recomputed forged hashes and a committed finish whose acknowledgement and immediate readback are both lost; the frozen intent/effect invariants are unchanged.

Final independent review source 9aebb8de passes 11 source + 15 PostgreSQL probes, 969 conversation checks and 244 scoped regressions. Original author positive fixtures remain red (one source and one PostgreSQL case) under valid PNG/freshness requirements. Two optional task-authority concurrency cases failed their explicit wire-port prerequisite; 19 passed. The public-research README now distinguishes its historical 228-pass claim from this stricter composition. A fresh normal-sandbox health launch failed at the same incorrectly owned SUID helper before navigation; all 15 live cases stay NOT_RUN. See docs/testing/research-conversation-review-20261016.md for exact evidence and limitations.

Final read-through found the public-address comment promised exclusion of IPv6 tunnelling/special ranges, but compressed 2001:: words parsed as NaN and bypassed the second-word bound. Retained the failing supplementary I10 probe before changing the parser to treat the compressed second word as zero. Expanded and compressed special forms must refuse before any request; a public Google IPv6 address remains accepted. This is the only later product change after 9aebb8de; conversation/handler/SQL/worker bytes are unchanged.

Fixture-closure continuation: explicit owner instruction authorizes correcting the two author fixture producers while preserving original source/log evidence and every assertion body. Valid PNG/MIME/current correlated times restore the unit success case. The PostgreSQL case then exposes a real worker-publication receipt mismatch (returned revision 8 versus persisted 6); an independent exact-readback probe reproduces it before any product correction. Original bad-fixture rejection remains independently tested. A local TCP/stdio prototype admitted both SQL races but its PID-based close coincided with a backend signal/recovery; retain those infra failures and replace it with signal-free Perl IO::Select forwarding. No production database or browser changed.

The newly exposed receipt mismatch is fixed by retaining the confirmed immutable publication receipt separately from local checkpoint revisions and returning that exact receipt on worker read/replay. An epoch change also clears that copy. Independent exact worker/central/chat equality and post-erase copy removal probes accompany the original assertions, which remain unchanged. Normal local wire access now uses signal-free IO::Select forwarding into the same network-none PostgreSQL container.

Fixture closure on source 1b413229: original author 12+7, independent 12+17, producer-fault 6, authority 21 and scoped 244 tests all pass (319 total). Both unmodified SQL lock races ran using loopback-only IO::Select transport into the network-none container; earlier wire precondition is resolved. README links the new closure report and preserves historical failed reports. Read-only audit of 132 published heads finds no new module-130 owner repair; owner branch module blob remains identical to release. All 15 live browser outcomes and actual model quality remain unverified.

Execution-readiness inspection at 2d29c27b: current career deploy entry is deterministic and excludes the provider gateway; archived paid memory-audit evidence is a different historical full-handler route, not present-day career-model quality. Shared campaign ledger and local audit summaries are absent in this fresh environment; its historical status/health path would create a zero-spend ledger if called, so none was invoked. Product model governor limits monthly calls, not the owner shared $5. Browser runtime candidate is deferred and not exposed; installed Chromium helper ownership is still incompatible, and default bundled Chromium is absent. Added a small non-secret readiness checklist identifying exact owner/platform prerequisites; no tests rerun or execution/security/credential setup performed.


# Playbook drift — 2026-10-16

## Module 130 correction persistence

The old module comment claimed corrections should also live in an identity-keyed
process store, and the C03/SH03 harness restart setup discarded the saved profile
then depended on that store. This confused a stale source import with committed
profile persistence and allowed one user's correction to enter another user's
profile, even after a rolled-back save.

Source of truth: the existing `handler-career.ts` and `career_persistence.js`
commit the corrected profile JSON and reply atomically through
`career_host_commit`. New staged HTTP tests against real local PostgreSQL prove
that path, including SQL rollback, exact replay, revision races and erase epochs.
Module 130 now keeps no global correction authority; compatibility APIs are inert.
C03/SH03 restart setups round-trip saved profile JSON and explicitly label that
simulation. Historical reports of correction-store replay are evidence of the
old behavior, not a supported current persistence contract.

See `docs/career/correction-authority-privacy-20261016.md` and the failed baseline
and final logs under `docs/testing/runs/correction-authority-privacy-20261016/`.
No new persistence infrastructure or production migration is part of this fix.


Independent privacy composition: preserve both dated drift histories. Owner repair is published at 382b6e37 and merged here without a module-130 conflict; combined privacy/conversation/research verification remains pending.

Joint-probe fixture refinement: J01 uses colliding names plus default profile/fact IDs; J02 now explicitly uses the default profile ID with no name/email so an erased fresh profile reuses the exact old cache key on the negative-control baseline. Expected outcomes stay unchanged; preserve the first combined joint run and add baseline/combined runs of this stronger erasure fixture. No product implementation changed.

Independent combined evidence: source e236a129 (same product bytes at later transcript/joint confirmations) improves the review baseline from privacy 1/10 + PostgreSQL 1/7 to 10/10 + 7/7, with existing PostgreSQL 30/30, authority 21/21, joint 2/2, conversation 969/969 and research suites green. Full legacy gauntlet remains 26/27 with the exact same C37 handler mismatch; not an all-green release. Public research README now links the combined privacy result instead of describing the previously unpublished repair as unavailable. Historical availability snapshots/reports stay unchanged at their dated sources. No paid/provider/browser/production action.
