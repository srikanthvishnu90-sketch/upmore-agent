# Surfacing + batch status — the batch becomes visible (partial: handler defined, NOT wired)

Before this change, the apply reply was a promise with nothing behind it: no roles named, no links, and when the user asked the exact question the reply itself invited — "what's the batch status" — the bot answered with the generic fallback, twice, in two wordings. After this change is fully landed, the approval card carries each posting's own URL, the spoken batch summary lists the selected roles with their links and where each one stands (including "ready — waiting on your certification" and, after submission, the employer's confirmation id), and a dedicated handler reads the batch's true state back for natural-language status questions instead of falling back. **What this PR actually contains today is the first slice of that, and it changes nothing live yet:** the card URL passthrough and the status handler's definition — the handler is not dispatched, the host does not yet pass it the run record, and its guard test is unwritten; the three remaining wiring steps are listed below and in the evidence, in the order the fixer left them.

**Contents (packaged from the preserved `work/loop-task1` worktree edits, Fix 3)**

- `packages/domain/132-career-apply.js` — `batchCard` items gain `url: i.url || null`.
- `packages/domain/142-career-router.js` — `handleBatchStatus(text, c)` (one self-contained hunk, split from the writer package's hunks; packaging-verified: exactly one occurrence in the file — the definition — and zero writer code). Resolves `c.batchRunRecord` → run summary + card; `c.batchApplyState` → queued/prepared truth; no batch → honest reply; stands down on "Approve batch …".

**Cross-reference (not duplicated here):** 155's speakSummary selection listing, its family shelf line, its attestation line, and the card composition's `url: a.url` pass are Fix 3 work entangled with the writer package's summary fields; they ride in `muse/2026-10-20-loop-writer` (branch/PR for LOOP-INPUT-NO-WRITER).

**Remaining wiring, in order:** (1) dispatch call in 142's `dispatchChat` after `handleBatchApply`; (2) `career_host.js` `createTurnCtx` passes `o.batchRunRecord` onto ctx; (3) `handler-career.ts` derives the runId from the loaded snapshot's `batchApplyState.id`, reads the run record, and passes it in. Then the guard (`tests/career-batch-status-route.test.cjs`, spec in the fixer inventory), bundle rebuild, and a fresh live run.

**Evidence** — `evidence/surfacing-status.md`: the MUSE-F-001/F-002 transcripts, what is and isn't in the branch, and the remaining steps verbatim. **NOT deployed, NOT wired.** MUSE-F-001 and MUSE-F-002 stay OPEN. Real completions: 0.
