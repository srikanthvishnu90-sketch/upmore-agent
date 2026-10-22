# H7 — chat-loop closure + receipts: root cause and fix

Lane: `muse/2026-10-22-e2e-h7-receipts` off the integrated E2E branch
(`f0f900f2`). Guards: `tests/edge/channel-loop-receipt.test.ts`.
Skeleton leg: H7 in `tests/e2e/chat-to-confirmation.test.cjs`.

## The gap

After H1–H6, the loop ran chat → card → approval → claim → drive →
finish → employer-confirmed — and then stopped talking. Two breaks,
both measured in the code:

1. **No status answer past the card.** The bridge's readback phase
   (`supabase/functions/_shared/channel_bridge.ts`, `runChannelTurnRich`)
   composed an answer for exactly one stored state,
   `awaiting_approval`. Once the tap landed, the batch record stopped
   advancing on the channel path: in the cloud composition the tap's
   enqueue IS the apply row (`career_apply_jobs`, proven in the H3
   root-cause note), and that row is what walks `queued → driving →
   submitted_unconfirmed → confirmed`. No bridge code read
   `career_apply_jobs` at all, so a status ask at any loop stage fell
   to the plain turn — whose measured live answer is the generic
   fallback. Exact line (base): the readback block in
   `runChannelTurnRich` acted only inside
   `if (status === "awaiting_approval")` and had no other branch.
2. **No chat receipt for a confirmed row.** A receipt path DID exist
   in-tree — `career_apply_receipts.ts` (`receiptText` /
   `planReceipts`), consumed by the proactive scheduler
   (`career_proactive_run.ts`) — so this lane wires it instead of
   building a second one. But its confirmed-with-email text is one
   line ("Applied to {company}: confirmed by {company}'s email on
   {day}. {url}"): no job id, no confirmation number, no payload
   hash, day-granularity only. It cannot serve as the byte-bound
   receipt the loop must hand back in chat, and its exact strings are
   pinned by the architect suites (wo-021/wo-032), so it is extended,
   never edited.

## The fix (composition, no approval-path edits)

- `career_apply_receipts.ts` gains two pure composers over the row:
  - `confirmedReceiptText(row)` — the full chat receipt, or **null**.
    Null unless the row is `confirmed` AND carries
    `email_confirmed_at` (the employer's own email is the product's
    only "confirmed"; a page-confirmed row without the email stamp
    earns no receipt). Every rendered field is the row's recorded
    value, verbatim: company, job id, the employer's confirmation
    number (`confirmation_id`, else the finish evidence's
    `confirmation_id` / `confirmation_number` — the two keys the
    finish paths record it under), the payload hash (rendered only
    whole, exactly as recorded), and `email_confirmed_at`. A field
    the row does not carry is omitted, never invented.
  - `applyLoopText(row)` — the status answer for one loop stage:
    `confirmed` → the receipt (falling back to the pinned
    `receiptText` wording for a page-confirmed row); the other three
    stages name the row's company, job id, and literal recorded state
    word; `submitted_unconfirmed` reuses `receiptText`'s honest
    wording ("their confirmation email is the proof") under a status
    header — page evidence is spoken as page evidence, never as
    confirmation. Null outside the four loop states: a finished row's
    wording stays with the proactive receipt path.
- `channel_bridge.ts` gains `readApplyLoopRow(admin, { userId })`
  (owner-scoped select on `career_apply_jobs`, newest first, the row
  re-validated against the ask) and a loop phase inside the EXISTING
  readback block of `runChannelTurnRich`, under the same discipline
  as the card: it runs only when the thread has a remembered batch
  run, no card surfaced, and the plain response carries no batch
  object of its own (an ask turn's `pending_batch_intent` is never
  replaced by an older effort's row). When it answers, its text
  becomes the turn's `replyText` and renders through the handlers'
  existing `presentReply` path — the same path the H1 card rides.
  Fail-open, like the card readback: any error leaves the plain
  outcome untouched. `runChannelApproval`, the approve RPCs, the
  claim predicates, and C9 are untouched.
- The token is the dedup, exercised end to end in the guards: the
  H1-delivered card → `offerApproval` → `takeApproval` →
  `runChannelApproval` → the REAL `planCareerBatchIntent` commits
  exactly one approve binding; a double tap finds the token spent,
  and even a replayed approval call with the same turn key derives
  the same intent id, so the commit stays one.

Scope note (stated, not hidden): the loop answer is composed
bridge-side from the row, not by issuing a structured core call —
no core planner branch reads `career_apply_jobs` (its status branch
reads batch records only), and the bridge already reads stored state
owner-scoped for this exact phase (the card hash read is the same
pattern). While a thread's effort is in the loop, a batch-less turn
on that thread is answered with the effort's recorded state; a new
ask (which carries its own batch object) is never replaced.

## Measured

- Guards `tests/edge/channel-loop-receipt.test.ts`: base
  (`f0f900f2` + the suite) **2 passed / 6 failed** → with the fix
  **8 passed / 0 failed**. The 2 base passes are pre-existing
  behavior (tap exactly-once discipline; no-remembered-run turns are
  never hijacked).
- Neighbors, with the fix: `channel-card-readback` 5/0 ·
  `channel-present` 9/0 · `channel-artifacts` 5/0 ·
  `wo-021-receipts` 6/0 · `wo-022-cards` 6/0 · `wo-032-apply-ops`
  27/0 · `wo-038-channels` 24/0 · `wo-039-cloud-worker` 12/0 ·
  `career-t1-channel-completeness` 13/0.
- Skeleton: the H7 leg runs the bridge against the Route B row's
  disposable-PG snapshots (stages 3/4 now emit
  `ROUTE_B_ROW_*_JSON`) and asserts the chat answer at all four
  stages equals the recorded row's loop text, with the confirmed
  receipt's fields matching the PG values byte-for-byte.
