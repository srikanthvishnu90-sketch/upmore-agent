# FAILURES ADDENDUM — TELEGRAM SLICE (chunk 90%, 2026-10-22)

Filed by the chunk-90 lane from code at the deployed commit
(cea914fe, agent-chat v248 / telegram-inbound v7) plus read-only live
queries. Evidence: `docs/apply/TELEGRAM-SLICE-2026-10-22.md`.
This entry is the channel-side root under F-002 (batch-status asks
get no readback): F-002 names the symptom at the router; F-037 names
why the CARD can never arrive on a channel even if the router spoke.

## F-037 — the batch card can never reach a messaging channel: the status readback exists only as a structured request the channel bridge never sends

The chain, link by link:

- The channel bridge offers the approval keyboard only off the
  agent-chat RESPONSE object: `_shared/channel_present.ts`
  `detectBatchCard(chat)` fires exclusively when
  `chat.batch.kind === "batch_run" && chat.batch.status ===
  "awaiting_approval"` (candidate tree, line ~392).
- The ONLY producer of a `kind: "batch_run"` batch object is
  `career_task_bridge.js` `planCareerBatchIntent` (status branch,
  cea914fe): it reads the worker's stored run via
  `persistence.readBatchRun` (RPC career_batch_result_v1) and returns
  `{version: "career_batch_run/v1", id, status: record.status, kind:
  "batch_run"}`.
- That planner runs ONLY when the request body carries a structured
  `career_batch` request (handler-career.ts, cea914fe: the
  planCareerBatchIntent call is gated on `careerBatch` being
  present). The other batch object a plain ask produces is
  `planCareerBatchPrepare`'s `{kind: "pending_batch_intent", status:
  "queued"}` — correct at ask time, and detectBatchCard rightly
  ignores it.
- The channel bridge (`_shared/channel_bridge.ts`) puts a
  `career_batch` field in the agent-chat call ONLY when a caller
  passes `args.careerBatch`. The single such caller is
  `runChannelApproval` (the approve path). `runChannelTurnRich` —
  every inbound text turn on Telegram and WhatsApp — never passes
  it. There is no runChannelStatus.
- No other road exists: agent-proactive @cea914fe contains zero
  Telegram references, and the bridge sends only inside a webhook
  invocation, so nothing pushes the card when the worker finishes.

Consequence: after a prepare completes, NO action available to a
Telegram or WhatsApp user can surface the card or its buttons. The
approval machinery downstream (channel_pending_approvals,
takeApproval, the hash-bound runChannelApproval) is fully built and
unreachable — it can only be entered from a card that can never be
offered. The router's own text status handling is beside the point:
even a perfect spoken summary could not carry the `batch` field,
because the handler populates that field only from the plan paths.

Measured tonight (read-only): the Telegram-mapped test user
(2e8cb31d…) has 5 completed prepare runs in
career_batch_runs_v1 and channel_pending_approvals has never held a
row for the Telegram thread; the one Telegram-committed prepare
intent (2026-10-20, run batch-fnv1a-2f164b) predates the worker and
sits `uncertain`. Separately, all 5 runs carry cardSha256 NULL —
none reached awaiting_approval (the F-005/F-006 family-zero wall) —
so tonight the card step is blocked twice; F-037 is the block that
survives even a doorstep-bearing run.

Fix shape (chat-host / channel wiring owner — the seam F-002 was
already assigned to): the bridge remembers the pending run id from
any turn whose response carries `batch.kind ===
"pending_batch_intent"` (persist per (channel, sender_key) — a
channel_pending_approvals-adjacent row or a channel_threads
column), and on a later turn for that thread issues the structured
status request for that run (callAgentChat with career_batch
{action: "status", version, runId}) — as the turn's call when the
user's text is a status ask, or as a readback pre-check whose
response is rendered through the EXISTING detectBatchCard /
offerApproval path, unchanged. The core's semantics do not move:
the card offered is still the worker's stored record at its stored
hash, and the approval still resolves through runChannelApproval.

Guard shape (edge tests, channel lane's suite): (1) a text turn
following a completed prepare whose stored run is awaiting_approval
returns approval_offered with a keyboard token bound to that run's
stored card hash; (2) a stored run at any other status offers
nothing; (3) a run id owned by another user offers nothing and
leaks nothing; (4) no pending run remembered → the turn is a plain
turn, byte-identical to today.

Status: OPEN. Owner: chat-host/channel wiring (Claude's seam, as
F-002). Found by: chunk-90 lane, 2026-10-22 — code read at the
deployed commit + live read-only queries; no live channel drive was
performed by this lane (the tier-1 surface is the owner's signed-in
Telegram Web session, a parent-agent browser task; the drive script
and predicted outcome are in the slice note).
