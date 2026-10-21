# Loop writer — the worker can finally be fed (LOOP-INPUT-NO-WRITER)

Before this change, every batch the worker prepared stopped at the same 8 uncovered questions — full name, email, phone, resume, work authorization, sponsorship, cover note, certification — because the executor fills applications only from a stored profile's basics, answers, attestations, and resume, and no product code ever wrote them; zero doorsteps meant the approval step could never exist. After this change, the executor derives its inputs from the user's own confirmed fact bank as a real pipeline stage: identity and links from basics, screening answers derived by module 149 with the saved-answers seam, the resume from the record with its hash, and certification derived **only** from the user's approval tap on the batch card — never silently. In the guard journey that replays the recorded failure through the real executor and sandbox boards, the 8 uncovered questions drop to zero, the batch selects exactly the 3 intern roles it should, and approval produces 3 sandbox submissions with confirmation ids (7/7 on this tree, 6/7 failing on the base).

**Contents (packaged verbatim from the preserved `work/loop-task1` worktree edits)**

- `packages/domain/149-career-portal-apply.js` — new exported `portalInputsFromBank(bank, opts)`: the derivation stage (basics → deriveAnswers → stored answers → constraints/defaults seam → attestations, with `certify_true` only from `opts.approvalAct`).
- `packages/domain/155-career-batch-apply.js` — family filter in prepareRun; attestation-deferred prepare (`awaiting_attestation` instead of a stop); `completeAttestations(run, deps)`; completion-aware `approveRun`. **Carried whole** — see the cross-reference note below.
- `packages/domain/122-career-profile.js` — `parseResumeHeader` + fill-nulls basics writer in `ingestResume` (before this, no chat path wrote profile basics at all — every stored master had basics ALL NULL).
- `packages/domain/142-career-router.js` — this package's two hunks only: `batchPortalProfile` delegates to `portalInputsFromBank`; `handleTailor` writes the produced resume as the resume of record.
- `workers/career-browser/production-sources.cjs` — master resolution rewritten (bridge snapshots no longer crowd out the real master) + `profileFor` derives via the writer.
- `workers/career-browser/batch-executor.cjs` — prepare/approve context plumbing; `completeAttestations` driven on approve.
- `tests/career-loop-input-writer.test.cjs` — the guard (7/7 here, re-verified at packaging; 6/7 fail on base).

**Cross-reference:** 155's speakSummary selection listing and the card `url` pass belong to the surfacing change but are entangled with this package's summary fields, so they ride here; package `muse/2026-10-20-surfacing-status` describes them and carries the cleanly separable surfacing hunks (132 card URL, 142 `handleBatchStatus`).

**Live caveat:** this code already ran once in production conditions — the executor works from the worktree — and exposed **MUSE-F-005**: its own family filter kept 0 of 595 postings against the real pool (the 600-posting recency window holds zero intern-banded SWE postings). F-005 is OPEN; its repair shape is in HANDOFF.md. The writer's derivation was never reached in that run.

**Not in this PR:** rebuilt router bundles (the candidate's bundles are stale against these sources; freshness check will fail until regeneration at integration — disclosed, not hidden). **NOT deployed** to agent-chat. Evidence: `evidence/loop-writer.md` + the fixer's complete inventory verbatim at `evidence/fixer-handoff-inventory.md`. Real completions: 0.
