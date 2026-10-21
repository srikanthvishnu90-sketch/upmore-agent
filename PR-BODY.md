# Batch trigger fix — a queued batch no longer cancels itself

Before this change, any ordinary account update silently cancelled a user's queued application batch: the chat said "I've handed this batch to the browser worker to prepare," and within seconds the batch was dead — 19 of 26 intents on record stood cancelled, and the worker could never claim what survived. After this change, a queued batch survives account updates and is claimed and run: in tonight's live re-drive, the new batch sat in state `queued`, was claimed on the worker's first drain, and ran to a completed state instead of cancelling. What the user still does not get — and this PR does not claim — is any visible change in the chat: no roles, no links, and batch-status questions still fall back (MUSE-F-001/F-002; the surfacing package carries that work, unwired).

**Contents**

- `supabase/migrations/20261020020000_career_batch_hook_semantics_v2.sql` — replaces `career_batch_control_hook_v1` and removes the account-`version` gates from `career_batch_pending_v1` / `career_batch_claim_v1`. The account `version` is `career_host_commit`'s concurrency counter (bumped by every committed turn), not a revocation signal. Privacy-epoch changes, the user's pause, and account-row deletion still revoke, with the epoch scrub unchanged. Cherry-picked clean from `119ab36e` (branch `work/loop-task1`).
- `tests/db/career/15-career-batch-hook-semantics.test.sql` + `run-batch-hook-guard.sh` — the permanent guard.
- Bug-ledger + forbidden-rules rows (filed PENDING-ALLOCATION per the bug law) and the BUILD-STATUS claim line.

**Evidence** — `evidence/batch-trigger-fix.md`: the iteration-0 baseline transcript verbatim, the rolled-back live-DB probe (pre: `a_state=cancelled … 'batch authority revoked'`; post: `a_state=queued a_pending=t a_claim=t`), and the iteration-1 re-drive transcript with its database record (intent `7c47684d…`, queued → completed 2026-10-21 01:13:59 UTC).

**Deploy state:** the migration was already APPLIED to the live project on 2026-10-20 under the owner's standing loop deploy approval (2026-10-20 19:22 CDT). This PR is the review unit for that live change, not a new deploy request.

**Still open after this PR:** the run that proved the fix ended at MUSE-F-005 (family filter kept 0 of 595 against the real pool — the window-starvation mechanism is in FAILURES.md). Real completions: 0.
