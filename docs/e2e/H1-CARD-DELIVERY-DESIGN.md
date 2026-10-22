# H1 — card delivery to messaging channels (F-037 / F-002): design

Lane: `muse/2026-10-22-e2e-h1-card`, base `muse/2026-10-22-e2e-skeleton`
@ c4136bd9. Implements the fix shape specified in the F-037 addendum
(`docs/apply/FAILURES-ADDENDUM-TELEGRAM-SLICE-2026-10-22.md`, branch
`muse/2026-10-22-telegram-slice`). Repo + tests only; nothing here is
deployed, applied, or sent.

## Root cause (why · exact line · fix)

**Why.** The batch approval card exists only as a field on an agent-chat
RESPONSE: `channel_present.ts` `detectBatchCard(chat)` (line 394) fires
exclusively when `chat.batch.kind === "batch_run" && chat.batch.status
=== "awaiting_approval"`. The only producer of that object is
`career_task_bridge.js` `planCareerBatchIntent`'s status branch, and
that planner runs only when the request body carries a structured
`career_batch` request. A plain channel text turn never carries one, so
after the worker finishes a prepare, NO action available to a Telegram
or WhatsApp user can surface the card — the approval machinery
downstream (`channel_pending_approvals`, `takeApproval`,
`runChannelApproval`) is fully built and unreachable. F-002's symptom
(a status ask answered by the generic fallback, reproduced live
2026-10-22) is the same seam seen from the text side.

**Exact line.** `supabase/functions/_shared/channel_bridge.ts:192`,
inside `runChannelTurnRich` — the one call every inbound text turn on
both channels makes:

```ts
const chat = await callAgentChat(deps, { userId: args.userId, threadId: threadId as string, message: args.text });
```

No `careerBatch` argument. The only caller that ever passes one is
`runChannelApproval` (channel_bridge.ts:248–260, the approve path,
entered from a button/choice that can only exist if a card was already
offered). There is no `runChannelStatus`. `callAgentChat` itself
already supports the field (channel_bridge.ts:104, 122) — the wire
shape is not the gap; the call is.

**Fix.** Three additions, all inside `channel_bridge.ts`:

1. **`runChannelStatus`** (new export — the function the addendum
   names as missing): one `callAgentChat` with
   `careerBatch: { action: "status", version: "career_batch_intent/v1",
   runId }` and the user's own message text. The core's status branch
   is read-only (it returns `intent: null` and commits nothing) and
   owner-scoped (`career_batch_result_v1` filters by user; the
   planner's `readBatchRun` re-checks ownership).
2. **Run-id memory, resolved from storage that already exists.** The
   addendum asks the bridge to "remember the pending run id …
   (persist per (channel, sender_key))". That memory already exists in
   the product's own tables: the ask turn's prepare intent is committed
   transactionally with the reply (`career_batch_turn_commit_v1`,
   migration 20261016010000) into `career_batch_intents_v1`, keyed by
   `(user_id, thread_id, run_id)` with `binding.action = 'prepare'`;
   the worker's run record lands in `career_batch_runs_v1`. The bridge
   already maps `(channel, sender_key) → thread_id`
   (`channel_threads`), so `(channel, sender_key) → run_id` resolves
   with one indexed select: the thread's LATEST prepare intent. No new
   write path, no new schema, nothing to keep in sync — a bridge-side
   copy of the run id could only drift from the record that is already
   committed. The stored run's state is then read through the same
   owner-scoped RPC the handler and the presentation layer use
   (`career_batch_result_v1`, validated the way
   `channel_present.readCardHash` validates it: version, userId, runId
   all must match).
3. **Composition inside `runChannelTurnRich`**, after the plain turn
   (and after thread adoption, so the final thread id is used): if the
   plain response does not already carry a `batch_run` card AND the
   remembered run's stored record is at `awaiting_approval`, issue
   `runChannelStatus` for that run and return ITS response as the turn
   outcome. Both channel handlers already render whatever
   `runChannelTurnRich` returns through the EXISTING
   `detectBatchCard` / `offerApproval` path
   (telegram_bridge.ts:349–351, whatsapp_twilio.ts:307–309) — that
   path is not touched, and it re-validates everything itself
   (`detectBatchCard` re-checks kind/status/id shape; `offerApproval`
   re-reads the card hash from the stored run before binding a token).

## Approval-path determination

**This design does NOT edit the approval path.** File by file:

| File / surface | Edited? | Why |
|---|---|---|
| `supabase/functions/_shared/channel_bridge.ts` | **YES** — the only product file | Adds `runChannelStatus`, the remembered-run resolution, and the readback composition in `runChannelTurnRich`. The bridge mints nothing and verifies nothing; it asks the core a read-only question. |
| `supabase/functions/_shared/channel_present.ts` (`detectBatchCard`, `offerApproval`, `takeApproval`, `readCardHash`) | NO | The offer path is used exactly as it stands; it is the rendering/authorization surface this design feeds, unchanged. |
| `runChannelApproval` (channel_bridge.ts:237) | NO | The approve call — exact message + structured approve request + card hash — is byte-identical. The new code never calls it. |
| The card approve RPCs (`career_apply_message_card_approve_own` and the card-cloud bridge functions, migrations 20261024130000/140000) | NO | Not edited, not called by the new code. Those RPCs serve the in-app Messages card; the channel approval continues to resolve through the core's batch planner, as today. |
| The claim predicates (`career_apply_cloud_claim_at`, `career_apply_cloud_refusal`, `cloud_bound_refusal`) | NO | Not edited, not called. The status readback reads run state through `career_batch_result_v1` only. |
| The C9 card binding (approve only against the stored card hash, re-verified by the core) | NO | Untouched and unweakened: the token a user eventually taps is still bound by `offerApproval` to the hash read from the worker's stored run, and the core still refuses a moved card at approve time. This design changes only how the user is SHOWN the card. |
| `supabase/functions/agent-chat/*` (handler-career.ts) | NO | The handler already routes a structured `career_batch` status request to the planner; the bridge simply starts sending one. |
| `supabase/functions/_shared/career_task_bridge.js` (planner, `normalizeCareerBatchRequest`) | NO | The status branch is used as-is. |
| `telegram_bridge.ts`, `whatsapp_twilio.ts`, `telegram-inbound/index.ts`, `whatsapp-inbound/index.ts` | NO | They consume `runChannelTurnRich`'s outcome exactly as today; the card surfaces because the outcome now can carry one. |
| Migrations / schema | **NONE** | Persistence is `career_batch_intents_v1` + `career_batch_runs_v1` (in-tree since 20261016010000, service_role select already granted) read via existing tables/RPC. |

Rejected persistence alternatives, for the record:

- **A `channel_threads` column for the run id** — a new migration, and
  a second copy of state the intents table already holds. Not needed.
- **A `channel_pending_approvals` row as the memory** — impossible
  without corrupting the store: `card_sha256` is NOT NULL and a
  pending prepare has no card hash yet; a synthetic row would be
  indistinguishable from a live offer to `peekApproval`/`takeApproval`
  and could bind a token to a hash that was never carded. Forbidden by
  the store's own invariants.

## Behavior spec

The readback fires only when ALL of these hold, checked in order, all
fail-open to today's plain turn (any error, any doubt → the plain
outcome is returned untouched):

1. The plain turn completed and its response carries no `batch_run`
   batch object already (idempotent if the core ever routes plain asks
   itself).
2. A prepare intent exists for `(user_id, thread_id)` — the
   remembered run id resolves.
3. The stored run record for that id, read owner-scoped, validates
   (version `career_batch_run/v1`, `userId` = this user, `runId` =
   the remembered id) and is at status `awaiting_approval` — the only
   state that has a card.
4. The status call's response itself carries `batch.kind ===
   "batch_run" && batch.status === "awaiting_approval"` with the same
   run id (the same predicate `detectBatchCard` applies; the bridge
   checks it only to decide which response is the outcome — the
   presentation layer checks it again before offering).

Consequences per the addendum's guard shapes:

- **(1)** A text turn after a completed prepare whose run is
  `awaiting_approval` returns the status response as the outcome →
  `approval_offered` with a keyboard token bound to the run's stored
  card hash (via the unchanged offer path).
- **(2)** A stored run at any other status: no status call is even
  made (step 3 gates it), nothing is offered; the turn is the plain
  turn.
- **(3)** A run id owned by another user can never be selected: the
  intent query is scoped to this thread AND this user, and the RPC is
  owner-scoped — a foreign record reads as nothing, and nothing about
  it (not even its id) reaches the outcome.
- **(4)** No pending run remembered → no reads, no second call; the
  turn is byte-identical to today (same single agent-chat call, same
  response object returned).

Deliberate scope lines:

- **Latest prepare intent wins.** If the user starts a second batch
  while an earlier card still waits, the newest ask is the
  conversational referent; the earlier run's already-made offer (if
  any) stays live in `channel_pending_approvals` until it expires or
  is superseded by the next offer, exactly as offers behave today.
- **The ask turn itself is never hijacked.** Its response carries
  `pending_batch_intent`; no run record exists yet, so step 3 fails
  and the outcome is the ask response, unchanged.
- **Text status readback for non-card states** ("your batch is still
  preparing") is NOT produced by this change: when no card waits, the
  user's words get the plain turn's answer, as today. That is the
  router-side half of F-002 and stays with its owner; this lane closes
  F-037 (the card) and with it the status-ask → card path for the one
  state that has a card.
- **Cost.** Steady state is two extra reads (intents select + run
  RPC) per turn on a thread that once ran a batch, and ZERO extra
  reads on threads that never did only if the intents select is
  skipped — it is not skipped, it is one indexed select; measured
  cost is a round-trip, not an agent turn. An extra agent-chat call
  (with its rate-limit cost) happens only on turns where a card is
  actually waiting — the exact turns whose plain answer would
  otherwise be discarded by the user anyway. If the status call hits
  the turn limit (429) the readback swallows it and returns the plain
  outcome: a good turn never becomes an error because a readback was
  limited.
- **Failure posture.** The readback fails OPEN to today's behavior
  (worst case = the pre-fix product). Authorization stays fail-closed
  exactly where it already was: `offerApproval` binds only a hash it
  re-read from the stored run; `takeApproval` consumes before
  resolving; the core re-verifies the hash at approve time. This
  design adds no new authorization surface.

## Guards (tests/edge/channel-card-readback.test.ts)

The addendum's four guard shapes, driven against the real
`runChannelTurnRich` + `detectBatchCard` + `offerApproval` composition
with doubles only at the fetch and supabase-js boundaries (the
channel lane's existing fixture pattern):

1. awaiting_approval → approval_offered; token row bound to the
   stored card hash; exactly 2 agent-chat calls, the second carrying
   `career_batch {action:"status", version, runId}`.
2. Stored run at a non-card status → no status call, no offer, plain
   outcome.
3. Foreign-owned run/intents → nothing offered, nothing leaked (the
   foreign run id appears nowhere in the outcome).
4. No remembered run → exactly 1 agent-chat call; outcome identical
   to the plain turn (byte-identical reply and chat).
5. (Supporting) The ask turn itself (response carries
   `pending_batch_intent`, no run record yet) is returned unchanged.

And the E2E skeleton's H1 leg (tests/e2e/chat-to-confirmation.test.cjs)
is re-driven on the fixed composition: plain ask (155 →
`planCareerBatchPrepare` → `pending_batch_intent`) → prepare completes
(a stored `awaiting_approval` run in the product's persistence shape)
→ a status turn THROUGH the bridge → `batch_run` card response →
`offerApproval` binds the stored hash. H1 records PASS; the negative
assertions that still hold (a plain turn still carries no structured
body on its first call; an unreadable run still answers "No batch run
is readable"; a foreign run offers nothing) are kept.
