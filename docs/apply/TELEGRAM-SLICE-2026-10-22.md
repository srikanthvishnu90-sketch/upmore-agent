# TELEGRAM SLICE — chunk 90% (2026-10-22)

The slice under test: a Telegram text → agent-chat (live v248) → batch
prepare machinery → a batch CARD back on Telegram, for the TEST user,
with the transcript saved. This lane MAPPED the live path from code at
the deployed commit (cea914fe) + read-only live queries, and verified
every precondition. The tier-1 drive itself (the owner's signed-in
Telegram Web session) is a parent-agent browser task — see "Drive
handoff" below. No text was sent by this lane; nothing was simulated.

## The path, as v248 + telegram-inbound v7 actually ship it

1. **Inbound.** Telegram webhook POST → `telegram-inbound`
   (`supabase/functions/telegram-inbound/index.ts`, thin wrapper over
   `_shared/telegram.ts handleTelegramWebhook`). Header-only secret
   gate (X-Telegram-Bot-Api-Secret-Token vs TELEGRAM_WEBHOOK_SECRET,
   fail-closed). Update parsed to {chatId, text, messageId}.
2. **Identity.** `channel_bridge.resolveTestUser(env,
   "TELEGRAM_ALLOWED_CHAT_IDS", chatId)` → the user named by
   CHANNEL_TEST_USER_ID when the chat id is allowlisted; anyone else
   gets silence. Live tonight: secrets present by name
   (TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET /
   TELEGRAM_ALLOWED_CHAT_IDS / CHANNEL_TEST_USER_ID) and
   `public.channel_threads` holds telegram / 6836694463 → thread
   `3cddb160-8fb0-4f89-b3a6-b8801a5cf82f`, last_message_id 159,
   updated 2026-10-21 05:29 UTC. **The Telegram path resolves to the
   gauntlet test user 2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3**
   (gauntlet-test@upmore.test, "Alex Testcase") — NOT the doorstep
   user b2625909…, who has no channel mapping.
3. **Turn.** `runChannelTurnRich`: channel_threads mapping (claim
   before work via last_message_id), then agent-chat called with the
   service-role bearer + `as_user_id` + thread_id + message text.
   Replies are cleaned, presented as Telegram HTML, split at 4,096,
   sent via Bot API sendMessage; artifacts ride sendDocument.
4. **Batch ask.** agent-chat v248 (handler-career.ts): delegateBatch
   is TRUE when UPMORE_CAREER_WORKER_URL + UPMORE_CAREER_WORKER_SECRET
   are set — both exist as project secrets tonight. The router's
   delegate seam (router_core.career.js `handleBatchApply`) turns
   "apply to N <family> roles" into a run skeleton
   (status queued_prepare); `career_task_bridge.planCareerBatchPrepare`
   commits a `career_batch_intent/v1` prepare intent transactionally
   with the reply. The reply promises a status readback; the response's
   `batch` field is {kind: "pending_batch_intent", status: "queued"}.
5. **Worker.** The batch executor on this VM (systemd oneshot, 20 s
   timer — ACTIVE tonight, last drain seconds before this read)
   claims the intent, runs module 155 prepareRun in its own process,
   writes the `career_batch_run/v1` record to
   `public.career_batch_runs_v1`. A run with doorstep applications
   lands at status `awaiting_approval` with `run.cardSha256` set.
6. **Card.** The bridge offers the inline Approve/Decline keyboard
   only when a turn's agent-chat response carries
   `batch: {kind: "batch_run", status: "awaiting_approval", id}`
   (`channel_present.detectBatchCard`). A tap resolves through
   `takeApproval` → `runChannelApproval` → the hash-bound approve —
   identical semantics to the app client. **Step 6 is where the slice
   stops on v248: see F-037.**

## Per-step verdicts (evidence, 2026-10-22 ~06:2x CDT, read-only)

- **Text received → identity resolved: PROVEN.** Mapping row above;
  the 2026-10-20 live battery (Telegram Web, tier 1) ran on this same
  mapping and its turns persisted.
- **Intent understood → batch intent committed: PROVEN on the live
  Telegram surface** (2026-10-20 turn 6: the bot's handoff reply at
  15:33:44 CDT matches intent 7c5c5b4e… committed 20:33:44.195 UTC on
  this thread, binding {action: "prepare", count: 3, family_text:
  "data analyst", run_id: "batch-fnv1a-2f164b"}). Caveat from the same
  record: that intent still sits `uncertain` with NO run record — the
  worker flip was landing that evening and it was never picked up.
- **Prepares run → run record written: PROVEN as machinery** (5
  completed prepare runs with records for this user, 2026-10-20/21;
  executor timer active tonight). **But 0 of 5 ever reached
  awaiting_approval — cardSha256 is NULL on all 5.** The latest
  (batch-fnv1a-631b08) summary: requested 3 "software engineering
  intern", found 600, familyFound 0, selected 0, doorstep 0 → the
  family-zero wall (F-005/F-006) means this profile's prepares
  currently produce no doorstep, hence no card exists to deliver.
- **Card delivered back on Telegram: NOT REACHABLE on v248 — F-037.**
  The only producer of the response object detectBatchCard accepts is
  the STRUCTURED career_batch status request
  (planCareerBatchIntent); the channel bridge issues a structured
  career_batch body ONLY for approvals (runChannelApproval), never
  for a status readback, and plain-text turns cannot carry it. No
  proactive push exists (agent-proactive @cea914fe: zero Telegram
  references). Even with a doorstep-bearing run, no Telegram action
  by the user could surface the card tonight.
- **Transcript saved: NOT APPLICABLE for this lane** — no drive was
  performed (see handoff). The session record is
  `~/workspace/your_files/channel-tests/2026-10-22-telegram.md`.

## Drive handoff (for the parent agent's browser delegation)

Surface: Telegram Web, the owner's signed-in session (chat id
6836694463), ONE window, bot @TraineeCareerBot — the established
tier-1 route of every prior Telegram battery. Script:

1. `Apply to 3 data analyst roles for me.` — expect the handoff reply
   ("I've handed this batch to the browser worker to prepare…") and
   verify a NEW prepare intent for user 2e8cb31d… commits at the
   turn's timestamp (career_batch_intents_v1).
2. Wait ≥2 executor cycles (~1 min), then check the run record
   (career_batch_runs_v1) for the run's status/outcomes.
3. `What's the batch status?` — per F-037 + F-002, expect NO card and
   no run readback on v248; record the reply verbatim, whatever it is.
4. Record every turn verbatim per the channel protocol
   (`~/workspace/your_files/channel-tests/README-protocol.md`) into
   `2026-10-22-telegram.md`, with the product-side cross-check
   (channel_threads + intents + runs) appended.

Predicted outcome on current code: steps 1–2 land (intent + a
completed run, most likely doorstep 0 per the family-zero evidence);
step 3 stops at F-002/F-037. A doorstep-bearing run additionally
needs the F-005/F-006 family fix or a family the classifier serves
for this profile.

## Read-backs (live, read-only, this lane)

career_cloud_settings = 0 rows · career_apply_jobs total 0 /
submitted 0 · flag OFF · zero submits · TEST user only.
Real completions: 0.
