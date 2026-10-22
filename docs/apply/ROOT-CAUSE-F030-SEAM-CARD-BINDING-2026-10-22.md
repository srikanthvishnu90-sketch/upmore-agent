# Root cause — F-030 seam (the half migration 20261024140000 did not close): a chat begin can never mint the binding the cloud claim demands

Companion to `ROOT-CAUSE-F030-BEGIN-CLAIM-2026-10-22.md`, which covered
the begin side (a begun row was born `driving`/`extension`). Migration
20261024140000 fixed that half: `career_apply_cloud_begin_agent_own`
now enqueues a claim-shaped row (queued, source null, attempts 0, no
lease — measured in the E2E skeleton's stage 2). The row is still never
claimed. This note is the remaining half, read from the sources on this
lineage (130000 = `20261024130000_career_apply_card_cloud_bridge.sql`,
140000 = `20261024140000_career_apply_agent_cloud_begin.sql`).

## Why — three facts that cannot compose

**1. The claim's first check is the card binding, and only a card tap
mints it.** `career_apply_cloud_refusal` (130000) opens with
`career_message_approval_private.cloud_bound_refusal(j, p_now, true)`
and returns its reason before any other predicate. `cloud_bound_refusal`
(130000, line ~216) requires, for the job row `j`:

- a `cloud_bound_jobs` row with `job_row_id = j.id` — absent →
  `return 'not_card_approved'` (line 221);
- its `cloud_bound_approvals` row and the `career_apply_batch_approvals`
  row it points at, all user-matched, with `p.entry` identical to
  `j.payload`, `a.payload_hash = p.batch_hash = j.payload_hash =
  j.approval_hash`, `p.used_at` set, and — line ~232 —
  `j.agent_batch_hash is null`, else `'not_card_approved'`.

The only writer of `cloud_bound_jobs` is the queue trigger
`guard_queue` → `cloud_guard`, firing on the enqueue inside
`cloud_tap` (130000, line ~169), which is reached only from
`career_apply_message_card_approve_own` — a person's tap on a Messages
cloud card shown by `career_apply_message_cloud_card_show_as`. No other
code path in the tree inserts the binding.

**2. The agent cloud begin stamps the one value the binding check
forbids.** 140000's `career_apply_cloud_begin_agent_own` ends with
`update public.career_apply_jobs set agent_batch_hash = p_batch_hash`
(the batch binding the WO-102 contract needs). So a chat-begun row
fails `cloud_bound_refusal` twice over: no `cloud_bound_jobs` row, and
`agent_batch_hash is not null`. Either alone returns
`not_card_approved`; the skeleton's stage 2 measures the refusal on the
real schema.

**3. Begin-then-tap cannot rescue it.** `career_apply_enqueue` raises
`duplicate_job` when any row exists for `(user_id, job_id)` (and the
table has `unique(user_id, job_id)`), so a card tap for a posting the
begin already enqueued raises inside `cloud_tap` and the tap fails.
The two enqueue routes are mutually exclusive per posting, by design.

## The fix — composition (A), in the chat caller, not in the claim

The composition was already decided on this line (C9): **the chat card
mints the binding through the bridge's machinery; the claim enforces
it.** Nothing in the claim, the refusal, or either begin door changes —
their strictness is the safety property (a direct enqueue is not an
authorization route; that is exactly what makes the bare-begin control
in stage 2 keep refusing).

What was missing is the chat-side caller that runs the composition:
module 176 (`packages/domain/176-career-agent-begin.js`) gained
`beginCloudCardPostings(input, deps)`:

- consumes the same approval record the other 176 entries consume
  (module 155's mint: kind `batch_approval_record`, `approvedByUser`),
  with the same flag discipline (OFF refuses locally, the DB's words,
  before any RPC);
- runs the local contract mirror + the cloud-door mirror per entry
  (the DB's exact messages) before anything is shown;
- takes the engine-prepared card items as INPUT (`input.cardItems`,
  the `{payload, hash, readback}` items the preparing engine produces —
  `workers/career-cloud/prepare.ts` builds them from the live form)
  and verifies each one binds to its approved entry: the payload hash
  recomputes, `job_id`/`user_id`/`manifest_hash` match the entry, the
  destination is the one the person approved, and every field's
  factId is its ledger row's first fact ref with the approved value
  (contract check 5 across the two payload dialects). A missing or
  non-binding item refuses that posting by name; a card with any
  refused posting is never shown (a batch is shown whole or not at
  all — the card discipline `prepare.ts` already states);
- calls `career_apply_message_cloud_card_show_as` ONCE through
  `deps.cardRpc` (the host's service-role client — the producer is
  service-role-only, as in `prepare.ts`'s own invocation) and verifies
  the returned card (hash recomputes over the returned payload, owner,
  thread, version 2, `execution_mode: 'cloud'`);
- NEVER calls `career_apply_message_card_approve_own`: the tap is the
  person's own act, and the binding it mints is what the claim then
  enforces. The caller's job ends at showing the card.

Proof: `tests/career-agent-begin-card.test.cjs` (the caller, recording
stubs) and the E2E skeleton — stage 2 (the bare-begin control: still
refused `not_card_approved`) + stage 2b (the composed route for the
same chat user: card shown, tapped, bound, `career_apply_cloud_claim_at`
takes the row). No migration was needed and none was written: every
object the composition uses already exists in 130000/140000.
