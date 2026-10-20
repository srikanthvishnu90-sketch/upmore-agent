# Audit: messaging channels and delivery (trunk @ 53db2d55)

**Summary (5 lines)**
1. The deeper cause is that each layer's duplicate protection was built alone and they do not fit together. The webhook claims the message id *before* the turn, so a turn is run at most once. It never retries, so agent-chat's `turn_key` replay is never used. Every slow, conflicting or 503 turn ends in "I couldn't answer that just now. Try again in a minute." (F2, F3, F6, F9).
2. The worst problem a person sees: the whole-message words "cancel", "end", "quit", "start", "help" and "info" are taken as STOP/START/HELP before the brain sees them. The live router itself tells people "Say cancel" (F1).
3. Delivery is "at most once" per *row*, but a row is several bubbles. A 429 or timeout on bubble 2 or later drops the rest of the message for good. A database error during a run fails every row the run claimed but never sent. Rows with no reachable contact sit in the queue forever, then flood out weeks late (F4, F5, F7).
4. Trunk has two channel stacks. Documents, typing, HTML and buttons exist only on the test bridge (`telegram-inbound`, one test user). The production stack (`trainee-*`) ignores `artifacts`, so no channel on trunk can deliver a tailored-resume file (F8: BL-349…362, BL-672).
5. 10 of the 11 findings are reproduced by throwaway tests (`audit-repro/channels_repro.test.ts`, 10/10 pass, which means the bug is present). Sound: duplicate webhooks never run a second turn on trunk, the head-start never double-sends with the every-minute run, and part order is guarded in SQL.

Repro: `deno test -A --no-check (a throwaway repro outside the repo). Each test asserts the defective behavior, so a pass means the defect is reproduced. The tests run the real trunk modules over the WO-038 in-memory world (`_shared/channel_memory.ts`, which mirrors the SQL rules) and fake provider fetches.

---

## F1. Ordinary words are taken as STOP/START/HELP; the brain never sees them, and the live router tells people to say one of them
1. **Symptom.** The router answers "Yes — 2 follow-ups to Dana are still queued … Say cancel and I will stop them." The person texts `cancel` and gets back: "You're unsubscribed. Trainee won't message you on its own again, alerts and reports included…"
   - The follow-ups are not cancelled.
   - From then on, alerts, cards, receipts and briefs are silently `skipped_opt_out` on **every** channel.
   - The same thing happens with `end` or `quit` during a mock interview.
   - `start` mid-flow gets "You're back on", and `help` or `info` gets the canned help text. None of these reach the brain.
2. **Why-chain.**
   - Why unsubscribed? `runInbound` acts on `channelCommand(msg.text)` before any turn (`_shared/channel_inbound.ts:123-131`), and `setOptOut(contact, true)` is person-wide (`migrations/20261021070000_channel_parity.sql:161-178`).
   - Why is "cancel" a command? `COMMANDS` maps stop, stopall, unsubscribe, **cancel, end, quit**, start, unstop, help and info, matched against the whole message (`_shared/channel.ts:10-18`). This is the carrier SMS keyword list, written for WO-013 (LoopMessage/SMS compliance).
   - Why does it apply on Telegram and WhatsApp? WO-038 reused it unchanged for every channel. Telegram already has `/stop` (`telegram.ts:190`), and blocking the bot is already read as STOP (`telegram.ts:177-183`).
   - Why is it likely? The product's own copy asks for those words: `_shared/router_core.career.js:18072` (and its copy at `:43593`) says `"Say cancel and I will stop them."`. The mock flow tells people to text "end mock" (`career_mock.ts:363`), and many will shorten that to "end".
   - Root: the command layer is a keyword list with no context. It was never designed for a conversational agent that also asks yes/no and cancel questions.
3. **Class.** DEPTH.
4. **Severity.** High likelihood × wrong external action: proactive messaging stops on all channels, and the cancel the person asked for is not done. **Rank 1.**
5. **Evidence.** VERIFIED (R1). Three texts (`cancel`, `End.`, `quit`) got three STOP replies, zero chat turns, and the contact is opted out.
6. **Fix.**
   - In `channel.ts`, split the list per channel. iMessage keeps STOP, STOPALL and UNSUBSCRIBE as exact words; CANCEL, END and QUIT go to the brain.
   - Telegram uses only its `/stop`, `/start` and `/help` commands and the block event. WhatsApp uses STOP and UNSUBSCRIBE.
   - Treat `start` as a command only while the person is opted out.
   - Files: `_shared/channel.ts`, `_shared/channel_inbound.ts:123`.
   - Fail-first test: `runInbound(tgMsg("cancel"))` calls `chat` once and leaves `optedOut` false. `runInbound(tgMsg("/stop"))` still opts out.
7. **Rows.** None names this directly. It is the side-effect of BL-667's fix ("fixed words", WO-038/P2). It also makes the "Say cancel" step of the follow-up flow (outreach cluster) fail on channels.

## F2. Claiming first throws away agent-chat's replay: a slow or failed turn answers "Try again in a minute", even when the server said not to repeat
1. **Symptom.** The person texts "apply to the Stripe role" and gets "I couldn't answer that just now. Try again in a minute." Three cases lead there:
   - **Storage commit fails.** agent-chat answered 503 with "I could not confirm … do not repeat an uncertain external action". The person never sees that warning.
   - **The turn runs past 120 s.** The turn may still finish and save in agent-chat, so the thread now holds an answer the person never got.
   - **The function is killed past its wall clock after the claim.** The person gets silence.

   Texting it again starts a new turn, so the action may be repeated.
2. **Why-chain.**
   - Why the generic text? `chatThroughAgent` throws on any status that is not ok and not 429, and drops `body.reply` (`_shared/channel_runtime.ts:18-20`). `runInbound` turns any throw into `CHAT_DOWN_REPLY` (`channel_inbound.ts:188-191`, text at `:19`).
   - Why is there no retry? The message id is claimed before the work (`channel_inbound.ts:105`), so a provider retry returns `"duplicate webhook"`. The 500 returned at `:203` is never retried either, because `handleChannelWebhook` always answers 200 (`:220-225`).
   - Why does that matter? `turnKeyFor` exists so that agent-chat's replay guard sees a retry as the same turn (`channel_inbound.ts:92-97`). agent-chat does replay a committed turn by key (`agent-chat/handler-career.ts:284-285`), and its 503 text says "Retry with the same request key" (`:525`). The channel never retries with that key, so the replay path is unreachable.
   - Why is the timeout so tight? There is a 120 s abort on the call (`channel_runtime.ts:14`) inside an Edge function whose wall clock is about 150 s (`trainee-deliver/handler.ts:14`), with nothing that resumes a killed run.
   - Root: idempotency is "at most once per message" when what is needed is "exactly one reply per message". The claim has no state (`channel_inbound` table: id and time only, `migrations/20261019030000_channel_inbound.sql:5-8`). WO-038 lists this as a known gap ("Async turns", `docs/architect/work-orders/WO-038-channels.md:179-180`).
3. **Class.** BACKEND.
4. **Severity.** Medium-high likelihood: every storage blip, every 409 from F3, and every turn over 120 s. Harm: wrong answer or a repeated external action. **Rank 2.**
5. **Evidence.** VERIFIED (R3): an agent-chat 503 that carries the honest reply makes Telegram receive `CHAT_DOWN_REPLY`, and the provider's retry of the same update is ignored as a duplicate. The kill-after-claim case is READ.
6. **Fix.**
   - In `chatThroughAgent`, return `body.reply` when the status is 409 or 503 and the reply is a string.
   - In `runInbound`, when the chat call throws or times out, call it again once or twice with the **same** `turnKey` and backoff. agent-chat then returns the saved reply or runs the turn once.
   - Later: give `channel_inbound` a `state` (claimed or answered). A provider retry of a message that is claimed but unanswered and older than N seconds re-enters with the same `turnKey`.
   - Files: `_shared/channel_runtime.ts`, `_shared/channel_inbound.ts`, a migration on `channel_inbound`.
   - Fail-first test: the fake chat throws first and returns `{reply:"saved answer"}` second. The person reads "saved answer", there is exactly one `turnKey`, and `CHAT_DOWN_REPLY` is never sent.
7. **Rows.** BL-642 (storage-degrade: "a failed commit is HTTP 503 with an honest reply; no client is shown to render a 503 body"). The channel client is the one that discards it. Related to the fault-voice rows BL-352…354.

## F3. Two quick texts run two agent turns at once; the second is likely to lose and be answered "Try again in a minute"
1. **Symptom.** The person sends "find me data roles", then "in Boston", two seconds apart.
   - One reply comes back.
   - The other gets "I couldn't answer that just now. Try again in a minute." Its message is consumed (claimed) and never answered.
   - Or the replies arrive in the opposite order to the questions.
2. **Why-chain.**
   - Why two turns at once? Each webhook POST runs `runInbound`, which calls `d.chat` with no per-person lock or queue (`channel_inbound.ts:181-187`). WhatsApp and iMessage send each message as its own POST. The `pacer` only paces *sends* inside one request (`channel_adapters.ts:328`).
   - Why does one fail? agent-chat uses optimistic concurrency. The commit checks `revision` and `account_version` (`migrations/20261015020000_career_watch_kv.sql:114-116`, repeated in `20261021050000_career_brief_digest.sql:93-95`). The loser gets `revision_conflict`, which becomes HTTP 409 (`agent-chat/handler-career.ts:524-525`). That throws in `channel_runtime.ts:20` and becomes CHAT_DOWN (F2).
   - Why is no message held back? The webhook core was ported from LoopMessage's one-at-a-time model (WO-013b-2), and the brain's state model assumes one turn at a time per account.
   - Root: there is no serialization point per person between the channel and the brain.
   - Hedged (agent layer, READ only): tools the losing turn already ran before its commit failed are not rolled back by the channel.
3. **Class.** BACKEND.
4. **Severity.** High likelihood (people text in bursts) × lost message plus a misleading reply. **Rank 3.**
5. **Evidence.**
   - VERIFIED for the channel side (R6): two concurrent `runInbound` for one person reach a peak of 2 concurrent chat calls.
   - READ for the 409, from the SQL and the handler.
   - Telegram's degree of concurrency depends on the webhook's `max_connections` (ASSUMED, not checked live).
6. **Fix.**
   - Add a per-user turn lease: `channel_turn_begin(user, until)` RPC (insert or update when free or expired, returning ok or busy) and `channel_turn_end`.
   - On busy, wait and poll (up to about 20 s) or append the text to the running turn's follow-up queue.
   - Files: `_shared/channel_inbound.ts`, `trainee-inbound/store.ts`, a new migration.
   - Fail-first test: R6 inverted. With two concurrent messages, the peak is 1 and both get real replies.
7. **Rows.** None directly. It plausibly adds to channel-chat rows BL-668…677 when these were seen live on a channel, but those were triaged as brain issues.

## F4. One provider error on bubble 2 or later drops the rest of a message for good. `retry_after` is ignored, and an approval card can arrive half-shown
1. **Symptom.**
   - A reply listing 4 postings (or a long card) shows the first bubble and nothing more. The rest never arrives and no one is told.
   - On iMessage, cards are cut into bubbles of 700 characters. If bubble 1 lands and bubble 2 fails, the person may answer "yes" to a card they saw only part of.
2. **Why-chain.**
   - Why is the rest never sent? `telegramAdapter.send` marks a 429/502/503 retryable only when `i === 0` (`_shared/telegram.ts:242`). A timeout is never retryable (`:236`). WhatsApp (`_shared/whatsapp.ts:150-152`) and LoopMessage (`_shared/loopmessage.ts:30-35`) do the same. `deliverDue` then marks the row `failed` with no `retry_at` (`_shared/channel.ts:120-122`).
   - Why not retry from bubble 2? Delivery is accounted per outbox **row**, but a row is sent as several **bubbles** (`render` → `packMessages` at 1,500 or 700 characters), and the bubbles already sent are not saved. Resending the row would repeat bubble 1. The comment chooses "final, as LoopMessage" (`whatsapp.ts:147-149`).
   - Why is a 429 likely? The pacer is per process (`channel_adapters.ts:329-342`). The head-start sender (one per webhook request, `channel_runtime.ts:31-38`) and the every-minute run each have their own pacer, so both can send to the same chat in the same second. Telegram's `parameters.retry_after` is never read (`telegram.ts:240-242`).
   - Why can a card be half-shown? A card's text is written to the thread as already shown when it is *pushed*, not when it is *delivered* (`migrations/20261021070000_channel_parity.sql:365-367`). Delivery state is never fed back to approvals. READ only; I did not trace the approval binding further.
   - Root: there is no progress record per bubble, and pacing is not shared across processes.
3. **Class.** BACKEND (and DEPTH for pacing and retry policy).
4. **Severity.** Medium likelihood × lost data. The approval-of-unseen-text case is low likelihood but wrong external action. **Rank 4.**
5. **Evidence.** VERIFIED (R4): Telegram returns 429 on bubble 2 of 4. The row ends `failed` with `retryAt=null` and only 1 bubble was ever sent over 40 simulated minutes. Recorded error: `…429… after 1 of 4 messages went out`.
6. **Fix.**
   - Add `sent_bubbles int` to `career_outbox`. `SendResult` failures carry `sentCount` and `retryAfterMs`.
   - `deliverDue` marks the row retryable from `sentCount`, at the later of the backoff and `retry_after`, and the adapter resumes at that bubble.
   - Move the card's "shown" record (the `agent_messages` insert) to after full delivery, or have the approval refuse a card whose outbox row is not `delivered`.
   - Files: `channel.ts`, `channel_adapters.ts`, `telegram.ts`, `whatsapp.ts`, `loopmessage.ts`, `channel_store.ts`, a migration.
   - Fail-first test: R4 inverted. After `retry_after`, bubbles 2 to 4 go out, bubble 1 is never resent, and the row ends `delivered`.
7. **Rows.** None in the list (it was measured on the router in-app). This is a channel-only failure.

## F5. The outbox never expires and does not check for a channel: queued rows wait forever, then flood out weeks old
1. **Symptom.** A person used the web app for a month with job alerts on. They then tap Connect Telegram, and within a minute receive 20 "New: …" alerts dated weeks ago, then 20 more each minute. Many of those postings are closed. The same happens after a channel was NOT_WIRED for days, or for WhatsApp rows held until the person writes again.
2. **Why-chain.**
   - Why do the rows wait? The claim needs `channel_target(user, channel)` to be non-null (`migrations/20261021070000_channel_parity.sql:105-106`, `:122-123`). A person with no contact never matches, and nothing sweeps those rows: `sweep` only handles `sending` (`_shared/channel_store.ts:133-137`).
   - Why were they queued at all? The alert run enqueues for everyone with alert settings on, without checking for a contact (`_shared/career_proactive_run.ts:51-66`, `_shared/career_alert_store.ts:121-126`). The SQL pushers do the same for cards, questions, status and mock rows (`migrations/20261021075000_career_apply_ops.sql:317`, `:345`, `:406`; `20261021080000_career_apply_cloud.sql:312`).
   - Why are they still sent when stale? Neither the claim nor `deliverDue` has an age limit. Freshness is checked once, at enqueue (`career_proactive_run.ts:61`).
   - Root: the queue has no expiry per kind of message and no rule for "who can receive this".
3. **Class.** BOTH.
4. **Severity.** Medium likelihood (every app-first user with alerts on) × wrong information shown as new, plus an unpleasant flood. **Rank 5.**
5. **Evidence.** VERIFIED (R7): 25 alerts queued 30 to 6 days earlier stay queued with no contact. One minute after the link, the run sends 20, oldest first.
6. **Fix.**
   - Add a TTL per kind of message (alert 48 h, card 24 h, status, brief and digest 7 d, reply 1 h) in the claim functions. Expired rows get a new status, `expired`, from the run's `sweep`.
   - Skip the enqueue when `channel_target(user, null)` is null.
   - Files: a migration (claim functions, status check), `channel_store.ts` (`sweep`), `career_proactive_run.ts`.
   - Fail-first test: R7 inverted. After the link, nothing older than the TTL is sent and those rows read `expired`.
7. **Rows.** BL-706 and BL-870 (alert delivery "needs deploy and a channel"). Once deployed, this is how those alerts would behave.

## F6. Sign-up race: two first messages from a new chat create two accounts, and the first reply sits in the queue forever
1. **Symptom.** A new Telegram user taps Start and types "find me jobs" immediately.
   - Two Supabase accounts are created for the one chat.
   - The answer to one of the two messages never arrives.
   - Whatever that turn saved lives in an orphaned account nobody can reach, and "forget everything" never touches it.
   - On WhatsApp or iMessage, the second `createUser` call fails on the phone number already in use, so the person gets "Try again in a minute".
2. **Why-chain.**
   - Why two accounts? `runInbound` reads `store.person` and then calls `createPerson` with no lock between them (`channel_inbound.ts:110`, `:150`). `createPerson` calls `auth.admin.createUser` and then upserts the contact with `onConflict: "contact"`, so the last writer wins (`trainee-inbound/store.ts:35-46`).
   - Why is a reply stuck? It was enqueued under the losing `userId` (`channel_inbound.ts:196`). `channel_target(loser, 'telegram')` is null (`channel_parity.sql:91-97`), so the claim never matches (`:123`) and the sweep never touches it (F5).
   - Root: the check for an existing person and the account creation are not one atomic step.
3. **Class.** BACKEND.
4. **Severity.** Low-medium likelihood × lost data (an orphaned account and a lost reply). **Rank 6.**
5. **Evidence.** VERIFIED (R2): with two concurrent first messages, outbox rows exist under 2 accounts. After 5 delivery runs, 1 row is still `queued`, and it belongs to the orphaned account.
6. **Fix.**
   - Add an RPC `channel_person_reserve(contact)` that takes `pg_advisory_xact_lock(hashtext(contact))` and inserts a placeholder `channel_contacts` row with `creating_at`. Only the request that wins calls `createUser`; the other polls for `user_id`.
   - Alternatively, run `createPerson` only after a conditional insert (`on conflict do nothing returning`).
   - Files: `trainee-inbound/store.ts`, `channel_inbound.ts`, a migration.
   - Fail-first test: R2 inverted. `createPerson` is called exactly once and both replies are delivered.
7. **Rows.** None.

## F7. One database error mid-run fails every row the run claimed but never sent, as "outcome unknown, not resent"
1. **Symptom.** A brief PostgREST error at row 1 of the every-minute run. Rows 2 to 20 (alerts, receipts, card pushes, replies) never arrive, and the database says `delivery outcome unknown: the run stopped before recording it; not resent`. The same happens to a reply when the head-start sender hits the error.
2. **Why-chain.**
   - Why are rows 2 to 20 lost? `handleDeliver` calls `store.release()` only after `deliverDue` finishes. On an exception it skips the release on purpose (`trainee-deliver/handler.ts:285-299`, comment at `:288-290`). `deliverer` does the same (`channel_runtime.ts:36-37`).
   - Why "not resent"? Ten minutes later `sweep` fails every `sending` row without a retry (`channel_store.ts:133-137`, text at `:51`).
   - Why so broad? `deliverDue` does not track which rows reached `adapter.send` (`channel.ts:87-123`). The at-most-once rule, which is right for the one row being sent, is applied to the whole batch.
   - Root: there is no "attempted" mark per row, and the exception path cannot tell sent rows from rows never touched.
3. **Class.** BACKEND.
4. **Severity.** Low-medium likelihood (transient errors over 1,440 runs a day) × lost data. **Rank 7.**
5. **Evidence.** VERIFIED (R5): `sentTo` throws on row 2. The run answers 500, row 1 is `delivered`, rows 2 and 3 stay `sending`, and Telegram received only 1 send.
6. **Fix.**
   - `deliverDue` keeps a set of `attempted` ids, filled just before `adapter.send`. Errors are wrapped so `release(except attempted)` runs in a `finally`.
   - Files: `channel.ts`, `channel_store.ts`, `trainee-deliver/handler.ts`, `channel_runtime.ts`.
   - Fail-first test: R5 inverted. Rows 2 and 3 are back to `queued` after the failed run.
7. **Rows.** None.

## F8. Two channel stacks: documents, typing, HTML and buttons exist only on the test bridge; the production stack drops `artifacts`
1. **Symptom.** "Send me my tailored resume" on Telegram, WhatsApp or iMessage through `trainee-*` produces a text reply but no PDF. That is true even on the router path, where agent-chat built and stored the file (in `channel_artifacts`, kept 7 days, for nothing). There is no typing indicator during a turn that can take a minute.
2. **Why-chain.**
   - Why no file? `chatThroughAgent` returns only `reply`, `thread_id` and `parts` (`_shared/channel_runtime.ts:18-22`), and `runInbound` has no document path (`channel_inbound.ts:181-199`).
   - `artifacts` is read only by `_shared/telegram_bridge.ts:273-299` (`sendDocument`) and the WhatsApp/Twilio bridge, and those are the **test** bridges. They resolve every sender to `CHANNEL_TEST_USER_ID` (`channel_bridge.ts:44-53`) and have no sign-up, STOP, outbox or proactive messages.
   - Why two stacks? The presentation lane (CHANNEL-DOC-1, `telegram_bridge.ts:11-16`) and WO-038 (`trainee-*`) were built in parallel. Neither was finished to cover the other's features. The deploy packet leaves the choice to the owner ("Two channel stacks … Only one webhook per bot can be live", `docs/launch/DEPLOY-PACKET-2026-10-20.md:48-51`). WO-038 tests even fix the gap in place: Telegram is plain text with no `parse_mode` (WO-038/T2).
   - Separately, the brain path makes no file at all (`handler-career.ts:460`: the agent result has no `result`, per the triage).
   - Root: features were built to bridge depth on one stack and production depth on the other, and there is no single owner of the channel contract.
3. **Class.** DEPTH.
4. **Severity.** High likelihood (every request for a document) × a missing deliverable. **Rank 8.** It ranks lower only because it is a missing feature, not a wrong action.
5. **Evidence.** READ. A grep found `artifacts` in no `trainee-*` path and nowhere in `channel_runtime.ts` or `channel_inbound.ts`.
6. **Fix.**
   - Pass `artifacts` through `chatThroughAgent`.
   - In `runInbound`, enqueue a `doc:<id>` outbox row with `{ref, filename}`.
   - Add `sendDocument(address, {bytes, filename, mime})` to `DeliveryAdapter` (Telegram: port `botApiForm` from `telegram_bridge.ts:97-112`). `deliverDue` resolves the ref through `fetchArtifactBytes` for the row's own user.
   - Add `sendChatAction(typing)` before `d.chat`.
   - Retire the bridges, or keep them only for dry runs.
   - Files: `channel_runtime.ts`, `channel_inbound.ts`, `channel_adapters.ts`, `telegram.ts`, `channel.ts`, a migration (key and kind `doc`).
   - Fail-first test: the fake chat returns `artifacts:[{ref}]`. Telegram receives a multipart `sendDocument` with those bytes, and the row ends `delivered`.
7. **Rows.** BL-349, 350, 351, 355, 356, 357, 358, 359, 361, 362 (with DUP 360) (agent-doc-delivery), and BL-672 (no typing indicator). The triage root (`handler-career.ts:460`) is half of the cause; the channel layer is the other half.

## F9. The deployed bridge (`telegram-inbound`) can run a turn twice and has no `turn_key`
1. **Symptom.** On the line that is live today, this sequence happens:
   - The person sends "I applied to Klaviyo yesterday".
   - The bridge's send fails (or it times out) and it answers 500.
   - Before Telegram retries, the person sends "thanks".
   - Telegram retries the first update. A second full agent turn runs: a second "I applied" record and a second reply.

   In the other order (the retry arrives before any newer message), the retry is ignored as a duplicate and the person never receives that answer.
2. **Why-chain.**
   - Why a second turn? Duplicates are detected only by `row.last_message_id === messageId` (`_shared/channel_bridge.ts:158`). That is a check-then-set on the *latest* id only, not a claim per message (`:171-180`). Once B is stored, a retry of A no longer matches.
   - Why no protection downstream? `runChannelTurnRich` calls agent-chat without `turnKey` (`channel_bridge.ts:185`), so agent-chat makes a random key (`handler-career.ts:187`) and cannot replay.
   - Why does the bridge answer 500 so that Telegram retries? Any send failure after the turn reaches the outer catch and returns 500 (`telegram_bridge.ts:316-318`). The turn's own failure path also answers 500 (`:247-250`).
   - Root: the bridge was a test harness and never got trunk's claim table. It is nonetheless one of the two candidates for the live webhook (F8).
3. **Class.** BACKEND.
4. **Severity.** Low-medium likelihood × duplicated actions or records on the live line. **Rank 9.**
5. **Evidence.** VERIFIED (R8): updates 1, 2, then 1 again lead to 2 agent turns for message A.
6. **Fix.** If the bridge stays live, claim `(telegram, update_id)` through the `channel_inbound` insert, pass `turn_key = turnKeyFor("telegram:"+update_id)`, and answer 200 after the claim. The better fix is F8: retire it.
   - Fail-first test: R8 inverted. A gets exactly one turn.
7. **Rows.** Possibly the live channel-chat rows (BL-668…677) if they were measured over the bridge. I could not confirm this (the evidence files are on the owner's machine).

## F10. If Supabase refuses an account with no phone or email, every Telegram newcomer gets "Try again in a minute" on every message, forever
1. **Symptom.** A new Telegram user (sign-up open, or on the allowlist) texts and gets "I couldn't answer that just now. Try again in a minute." on every message, every day, and never gets an account.
2. **Why-chain.**
   - Why? `createPerson` for a `tg:` contact calls `createUser({ user_metadata })` with no email and no phone (`trainee-inbound/store.ts:40-42`). Whether that is accepted is marked UNKNOWN in the code (`:37-39`) and in the WO (`WO-038-channels.md:184-186`). The live smoke script checks only the secret gate (`scripts/launch/trainee-smoke.cjs:115-119`).
   - Why forever? The WO says the person "is told once". The code tells them every time: the throw lands in the outer catch, `CHAT_DOWN_REPLY` (`channel_inbound.ts:200-203`). There is no "refused before" record like the one the closed-sign-up path has (`:146`).
   - Root: an unverified platform assumption sits at the only entry point for Telegram sign-ups, and the failure is answered with a promise ("try again in a minute") that will never come true.
3. **Class.** DEPTH.
4. **Severity.** Likelihood unknown, but if the assumption is wrong it affects 100% of Telegram sign-ups × the channel is unusable and the person is told something false. **Rank 10.**
5. **Evidence.** VERIFIED for the loop (R9: 4 messages get 4 `CHAT_DOWN_REPLY`). UNVERIFIED for GoTrue's behavior; I did not touch Supabase.
6. **Fix.**
   - Verify the GoTrue behavior in the owner's smoke run.
   - Catch the specific refusal in `createPerson` and answer once with "Telegram-only accounts can't be set up yet; connect Telegram from the app", recorded through `refusedBefore`.
   - Files: `trainee-inbound/store.ts`, `channel_inbound.ts:150`.
   - Fail-first test: R9 inverted. Exactly one specific reply, then silence or a short reminder, never "try again in a minute".
7. **Rows.** None (not live yet).

## F11. Blocking the Telegram bot, or deleting the Telegram account, silently stops alerts and receipts on iMessage and WhatsApp too
1. **Symptom.** Someone who moved to iMessage blocks the old Telegram bot. From then on, alerts, application receipts and cards stop arriving on iMessage. Replies to what they text still work, so they do not notice until they wonder where their receipts went.
2. **Why-chain.**
   - Why does it spread? A 403 "blocked or deactivated" becomes `optOut` (`telegram.ts:241`), then `setOptOut(contact, true)` (`channel.ts:113-118`), and the `my_chat_member` "kicked" event does the same (`channel_inbound.ts:114`).
   - `channel_opted_out` is true while **any** of the person's contacts is opted out (`channel_parity.sql:159-166`). Every non-reply row is then `skipped_opt_out` (`channel.ts:94`), and the card push refuses (`channel_parity.sql:349`).
   - Root: a block on one channel is stored as the same flag as an explicit STOP and is treated as the person's STOP on all channels.
3. **Class.** BOTH.
4. **Severity.** Low-medium likelihood × lost data. Receipts for applications the person approved are dropped (they are `skipped_opt_out`, not held). **Rank 11.**
5. **Evidence.** VERIFIED (R10): a Telegram 403 makes the iMessage alert `skipped_opt_out`.
6. **Fix.**
   - Add a `blocked` column on `channel_contacts`. A block marks that contact only, and `channel_target` skips blocked contacts. Explicit STOP stays person-wide.
   - Files: a migration, `channel.ts:113`, `channel_inbound.ts:114`, `channel_store.ts`.
   - Fail-first test: R10 inverted. The iMessage alert is `delivered` and the Telegram contact is `blocked`.
7. **Rows.** None.

---

## Checked and sound (answers to the owner's questions)
- **Duplicate webhook deliveries on trunk:** no duplicate turn or reply. The `(provider, provider_message_id)` primary key is claimed first (`channel_inbound.ts:105`, `trainee-inbound/store.ts:17-21`, `channel_parity.sql:47-51`). The cost is F2: a lost answer instead of a doubled one.
- **Head-start vs every-minute run:** no double send. Every claim is `for update of o skip locked` plus `status='sending'` (`channel_parity.sql:100-149`), and `mark` updates only where the row is still `sending` (`channel_store.ts:108`).
- **Order of multi-part replies:** a part is not claimed while an earlier part is sending, held, waiting to retry or still queued (`channel_parity.sql:108-109`, `:125-126`). One narrow snapshot race remains (READ): a cron claim taken in the same milliseconds as the head-start's uncommitted claim of part 1 can take part 2. A part that ends in a final failure lets later parts through with no notice (see F4).
- **HTML parse errors:** not possible on trunk (plain text, no `parse_mode`, `telegram.ts:148-150`, `:233`). The bridge falls back to plain text on `/parse|entit/` (`telegram_bridge.ts:128-135`).
- **Message too long:** `packMessages` splits at 1,500 / 700 / WhatsApp's pack size, and a `slice` guards the hard limit (`telegram.ts:233`). Parts over `OUTBOX_CHARS` are split, never cut (`channel_inbound.ts:84-91`). The only cut is beyond 30 parts, and it says so.
- **Link nonces:** redeeming is atomic (`update … where used_at is null … returning`, `channel_parity.sql:252-255`) and runs under a per-user advisory lock. One depth gap (READ): a chat that signed itself up first can never be linked to the person's app account. The answer is "linked_elsewhere" and there is no unlink or merge path (`channel_parity.sql:257-258`).
- **STOP/START mechanics:** STOP is recorded before any account exists, START on any channel clears every contact, and replies still go out after STOP as promised. The defects are in the trigger words (F1) and in how far a block spreads (F11).
- **Rows stuck forever:** yes, any row whose user has no reachable contact (F5, F6). Rows stuck `sending` are swept after 10 minutes (F7).
