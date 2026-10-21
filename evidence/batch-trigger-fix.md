# Evidence — batch trigger fix (migration 20261020020000, commit 119ab36e → cherry-picked 1c7c838c)

## What was broken, in the live bot's own words

Iteration 0 — formal baseline drive (Telegram, @TraineeCareerBot, test account, Tue 2026-10-20, America/Chicago), recorded verbatim in `~/workspace/your_files/real-world-actions/loop-ledger.md`:

```
[19:23:22] USER: apply to 15 software engineering intern roles
[19:23:25] BOT: I've handed this batch to the browser worker to prepare: it will find 15 software engineering intern roles, screen out the ones that don't fit, tailor each application, and bring the batch back here at the final review screen. Nothing has been filled or submitted yet — ask me for the batch status and I'll read back exactly where it stands.
[19:23:36] USER: what's the batch status
[19:23:39] BOT: I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.
[19:23:52] USER: where is my batch
[19:23:56] BOT: I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.
```

Server-side truth behind that transcript: the intent created by the apply turn was cancelled within seconds. Census of `career_batch_intents_v1` at ~19:30 CDT that evening: 19 cancelled / 4 completed / 3 uncertain / 0 queued. The canceller was migration 20261016010000's `career_batch_control_hook_v1`: it treated divergence of the account row's `version` as revocation — but `version` is `career_host_commit`'s optimistic-concurrency counter, bumped by every committed chat turn, so the very next turn killed the batch the previous turn had created. The same pin in `career_batch_pending_v1` / `career_batch_claim_v1` made any survivor unclaimable ("batch authority revoked").

## The fix's live proof (before this package was cut)

Guard executed against the live database inside a rolled-back transaction (nothing persisted):

- Pre-migration: `a_state=cancelled a_pending=f a_claim=f a_claim_err=batch authority revoked b_state=cancelled c_state=cancelled c_runs=0`
- Post-migration: `a_state=queued a_pending=t a_claim=t b_state=cancelled c_state=cancelled c_runs=0`

(pause and privacy-epoch controls still cancel in both — true revocation acts are unchanged.)

Migration `20261020020000` was APPLIED to the live project on 2026-10-20 under the owner's standing loop deploy approval (2026-10-20 19:22 CDT). This PR is the review unit for that change; it is not a new deploy request.

## Iteration 1 — the fresh real run after the fix (Telegram, same thread)

```
[~20:08 CDT] USER: apply to 3 software engineering intern roles
BOT: I've handed this batch to the browser worker to prepare: it will find 3 software engineering intern roles, screen out the ones that don't fit, tailor each application, and bring the batch back here at the final review screen. Nothing has been filled or submitted yet — ask me for the batch status and I'll read back exactly where it stands.
USER: what's the batch status
BOT: (generic fallback — "I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.")
USER: show me the roles in my batch with their links
BOT: (generic fallback — same string)
```

Database record for that exact drive: intent `7c47684db8186326e2195eb7bf85257948f3aafa4f5fc7fe869d27e6a6d13a7b`, run `batch-fnv1a-631b08`, created 2026-10-21 01:08:13 UTC in state **queued** — it was NOT cancelled. After the worker host was recovered (its systemd units had been wiped by a VM replacement; separate incident, recorded in the loop ledger), the executor claimed it on its first drain and the run reached terminal state **completed** at 2026-10-21 01:13:59 UTC, result `{runStatus: completed, doorstep: 0, submitted: 0}`. Run record: found 600 · duplicatesRemoved 5 · family filter kept 0 of 595 (families ["SWE"], intern=true) · eligible 0 · selected 0 — see MUSE-F-005; the run ended honestly at the family filter, one stage before the stops earlier runs hit. Claim-once holds: later drains return empty.

So this fix's claim is narrow and proven: **a queued batch now survives ordinary account writes and is claimed and run.** The chat still shows no roles/links and cannot answer batch status — those are MUSE-F-001/F-002, addressed (partially, unwired) by the surfacing package, not by this one.

## FAILURES.md entries this package touches

[ID: MUSE-F-002] [Status: OPEN]
Found: 2026-10-20 19:23 CDT, Muse (tester drive, live Telegram)
Area: brain
Input: "what's the batch status" and then "where is my batch" — same thread, immediately after the apply claim in MUSE-F-001 (the claim itself invited the question: "ask me for the batch status and I'll read back exactly where it stands").
Expected: the batch's true state read back from the committed intent/run records (the structured status shape proved exactly this read during the worker-flip smokes, §5.3).
Actual: both wordings received the identical generic fallback: "I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there."
Evidence: same transcript as MUSE-F-001 (loop ledger, Task 1, Iteration 0).
Priority: P0
Fix:
Verified by:

Context note (packaging agent): F-002 stays OPEN. This package fixes the server-side half of the batch's disappearance (silent cancellation — the reason there was never a batch whose status could be read back); the chat-side read-back itself is the surfacing package's unwired handler. The batch half of F-002's root cause is also recorded in the loop ledger's Fix 1 entry and in `docs/bug-ledger.md` / `docs/career/forbidden-rules.md` rows inside this commit (filed PENDING-ALLOCATION per the bug law).

## Guard

`tests/db/career/15-career-batch-hook-semantics.test.sql` + `tests/db/career/run-batch-hook-guard.sh` (in this PR). This VM has no Postgres server binaries, so the executed proof here is the rolled-back live-DB probe quoted above; the SQL guard is the permanent replay.
