# Evidence — the loop writer (LOOP-INPUT-NO-WRITER, "Fix 2")

## The defect, proven live before this code existed (loop-completion record, 2026-10-20)

The executor builds every application only from the stored profile's `basics / answers / attestations / resume` (`workers/career-browser/production-sources.cjs`). A full seeding journey through the product's own chat path (tailor ask → resume paste → "Yes, that's my resume.") confirmed 15/15 facts — and the stored profile the executor reads still stood at:

```
basics: null · resume: null · answers: NULL · attestations: NULL
```

No product code wrote answers or attestations; module 149's `deriveAnswers` existed with no caller on the executor path. The batch re-run that followed (test account, sandbox boards) prepared a run of 600 found / 591 eligible and stopped all 3 selected applications at `UNCOVERED_QUESTION` with the identical 8 asks:

```
full_name · email · phone · resume · work_authorization · sponsorship · cover_note (draft) · certify_true (attestation)
```

Zero doorsteps, so no approval card could ever exist — the approve→submit leg of the loop was unreachable by construction. The user-visible symptom is the iteration-0 baseline (Telegram, 2026-10-20 19:23 CDT, verbatim):

```
[19:23:22] USER: apply to 15 software engineering intern roles
[19:23:25] BOT: I've handed this batch to the browser worker to prepare: it will find 15 software engineering intern roles, screen out the ones that don't fit, tailor each application, and bring the batch back here at the final review screen. Nothing has been filled or submitted yet — ask me for the batch status and I'll read back exactly where it stands.
```

## What the guard proves (on this packaged tree)

`tests/career-loop-input-writer.test.cjs` replays the record's journey through the real production-sources + executor + sandbox boards:

- **7/7 PASS on this tree** (re-verified by the packaging agent on this branch, 2026-10-20 ~21:1x CDT); **6/7 FAIL on pristine base `0c4291d3`** (the one green is the APPROVAL_SET_CHANGED control — already-correct behavior).
- The 8 uncovered asks shrink to **zero** for the fixture persona: identity from basics, work_authorization/sponsorship from constraints, cover_note from a stored confirmed draft, resume from the record — with `certify_true` pending on the card only, derived solely from the approval act.
- Family screen on a 6-posting mixed pool: familyFound 3, selection exactly the 3 SWE interns, `attestationPending` 3, stops []; approve → **3 submitted with `SBX-####` confirmation ids**.
- Generalization: a second persona derives her own (different) answers from her own facts; a nothing-invented control (no eligibility source) still stops named at UNCOVERED_QUESTION; a stored explicit attestation passes through to doorsteps at prepare.

Neighbor suites measured by the fixer on the preserved tree: 75/77, the 2 fails byte-identical on base (recorded baseline). Full sweep: fixed tree 4,537 tests / 17 fail vs base 4,530 / 9 fail, name-adjudicated to recorded baseline classes (Chromium env-class, pins, coverage pair) — full detail in `evidence/fixer-handoff-inventory.md` (the fixer's complete inventory, carried verbatim).

## The live caveat — this code already ran once, and exposed the next failure

The production executor runs from the candidate worktree, so tonight's iteration-1 batch (run `batch-fnv1a-631b08`) executed **this package's code live**. It never reached the writer's derivation: the run ended one stage earlier, at the family filter this package also introduces — **0 of 595 postings kept** (MUSE-F-005; mechanism: the recency-ordered 600 window holds 246 SWE postings and zero intern-banded ones; ~197 engineering-intern postings sit outside the window; the filter's fixture pool disagreed with the real shelf). F-005 is OPEN and unfixed; it is the first repair inside this code, and its repair shape (targeted family/band shelf read, pool/sources layer) is recorded in HANDOFF.md on the candidate.

## FAILURES.md entries this package touches

MUSE-F-005 (quoted verbatim in `evidence/failures-backlog.md`, package `muse/2026-10-20-failures-backlog`) — this package's 155 family filter is the code that produced it. The writer defect itself (LOOP-INPUT-NO-WRITER) predates FAILURES.md and is recorded in the loop-completion record (`docs/gauntlet/loop-completion-2026-10-20.md` @ `0c4291d3`) and in the loop ledger; its bug-ledger/forbidden-rules PENDING-ALLOCATION rows were **not yet filed** when the fixer stopped (noted in the inventory).

## Packaging notes

- Source: the preserved, uncommitted worktree edits on `work/loop-task1` (fixer lane, stop/preserve 2026-10-20 ~20:05 CDT), copied verbatim. `packages/domain/142-career-router.js` carries only this package's two hunks (resume-of-record write; `batchPortalProfile` delegation) — Fix 3's `handleBatchStatus` hunk was split out to the surfacing package. `packages/domain/155-career-batch-apply.js` is carried **whole**: its Fix 3 hunks (speakSummary selection listing; card `url` pass) are entangled with this package's summary fields and carded-set logic, and are cross-referenced from the surfacing package rather than duplicated.
- **Bundles are NOT rebuilt in this branch.** `router_core.js` / `router_core.career.js` remain the candidate's; the domain sources here are newer, so `tests/router-bundle.test.cjs` freshness will fail until bundles are regenerated at integration — the same staleness the fixer measured on the preserved tree (2/3, staleness only).
- Integration note: `workers/career-browser/production-sources.cjs` is also touched by the link-liveness package (+5 lines of probe wiring at a different site). A merge of both needs a union of the two versions, not a pick.
- **NOT deployed.** The worker on this VM happens to run the worktree these edits came from (that is how F-005 was exposed live); agent-chat does not contain any of this.
