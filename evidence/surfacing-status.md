# Evidence — surfacing + natural-language batch status ("Fix 3", PARTIAL)

## The failures this addresses, from the live bot

MUSE-F-001 (apply reply surfaces no roles/links) and MUSE-F-002 (batch status unanswerable) — both quoted verbatim in `evidence/failures-backlog.md` (package `muse/2026-10-20-failures-backlog`). The words, from the iteration-0 baseline (Telegram, 2026-10-20 19:23 CDT):

```
[19:23:25] BOT: I've handed this batch to the browser worker to prepare: it will find 15 software engineering intern roles, screen out the ones that don't fit, tailor each application, and bring the batch back here at the final review screen. Nothing has been filled or submitted yet — ask me for the batch status and I'll read back exactly where it stands.
[19:23:36] USER: what's the batch status
[19:23:39] BOT: I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.
[19:23:52] USER: where is my batch
[19:23:56] BOT: I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.
```

Iteration 1 (after the trigger fix) reproduced the identical chat behavior — claim, then fallback for both the status question and "show me the roles in my batch with their links" — because nothing in this package was wired or deployed. The discovery surface has the same disease: `handleDiscovery`'s reply renders names with no links anywhere, and even the structured shortlist payload omits `url` (link audit, MUSE-F-003; the one-line fix request for that handler is in HANDOFF.md on the candidate).

## What is actually in this branch — and what is not

**In the branch (verified at packaging):**

- `packages/domain/132-career-apply.js` — `batchCard` items gain `url: i.url || null` (one line).
- `packages/domain/142-career-router.js` — `handleBatchStatus(text, c)` defined (the file's only Fix 3 hunk, split cleanly from the writer package's hunks). It resolves `c.batchRunRecord` → speaks the run's true summary + card; falls back to `c.batchApplyState`; answers honestly when no batch exists; and is designed to stand down on "Approve batch …" (the structured path owns approvals). **Packaging check: `handleBatchStatus` occurs exactly once in this branch's 142 — the definition. It is NOT WIRED.**

**Riding in the loop-writer package instead** (entangled with that package's summary fields — cross-referenced, not duplicated): 155's card composition passing `url: a.url`, and speakSummary's additions — the family shelf line, **the selection listing** (`The N selected:` then per application `- <company> — <role> — <url> (<stage word>)`, including "ready — waiting on your certification" and submitted-with-confirmation-id), and the awaiting-approval attestation line. On the base code those lines can never print, because the run record's summary never carried the selection to the reply.

## NOT done — the remaining steps, exactly as the fixer left them

1. **Dispatch wiring (142):** insert `const batchStatus = handleBatchStatus(text, c); if (batchStatus) return batchStatus;` immediately after the `handleBatchApply` call in `dispatchChat`.
2. **`supabase/functions/_shared/career_host.js`** (untouched): in `createTurnCtx`, near the batchDeps block, add `if (o.batchRunRecord) ctx.batchRunRecord = o.batchRunRecord;` (runtime-only, not a STATE_KEY).
3. **`supabase/functions/agent-chat/handler-career.ts`** (untouched): after `persistence.load`, derive the runId from `loaded.snapshot?.stores?.batchApplyState?.id`; when present, `await persistence.readBatchRun({ userId: user.id, runId })` and pass `batchRunRecord` into the `createTurnCtx` opts.
4. **Guard not written:** `tests/career-batch-status-route.test.cjs` — spec exists in the fixer inventory (recorded words "what's the batch status" / "where is my batch" against an injected prepared record → roles with links + true status; queued-skeleton case; honest no-batch case; second-persona case).
5. Bundle rebuild + `--check`, neighbor suites, full sweep — not run for this change. Bug-ledger PENDING-ALLOCATION rows for the status-route/surfacing defects — not yet filed.

**Deploy state: NOT deployed, NOT wired.** MUSE-F-001 and MUSE-F-002 remain OPEN; they close only on a fresh live run where the bot names the roles with links and reads the batch status back truthfully.
