# Three-channel readiness: Telegram, WhatsApp, iMessage (2026-10-26)

The owner wants to test Trainee tomorrow morning as a brand-new user on Telegram, WhatsApp and iMessage. The bar is
5/5: every link present and outcome-tested on every channel. This is a hostile, read-only reading of the code.

## How this was read

- **Code:** `origin/trunk` at `9d4226fc0` and the open PR heads #191 `9d5a31c`, #194 `8664fbc`, #195 `7bbdd2f`,
  #199 `a36f83e`, #200 `9a85dfc`, #201 `44d9ea4`, #202 `d74ee20` and #206 `cb3a008`, fetched as `pull/N/head`.
  Unless a PR is named, file:line means trunk.
- **Live state:** not read by me. Live facts are quoted from `docs/architect/HANDOFF-2026-10-26.md` (PR #203) and from
  the 2026-10-26 capability map (read-only `list_edge_functions` and SELECTs; architect scratch copy, not on trunk).
  Each is labeled with its source.
- **What I did not do:** run any test, call any provider or model, deploy, or write anything live. "Tested" below
  means a test exists in the repo and CI was green on that head. I did not re-run it.
- **CI on the PR heads (GitHub check-runs, read 2026-10-26):** `gate (core)` is **failing** on #191 and #194. Every
  required job is green on #195, #199, #200, #201, #202 and #206.

**Marks:** PRESENT+TESTED, PRESENT-UNTESTED, MISSING, BROKEN. "Tested" in the in-memory world
(`_shared/channel_memory.ts`) is marked **(mem)**; on a real Postgres 16 it is marked **(pg)**. Only (pg) shows that
the SQL, RLS and RPCs work.

## 0. The verdict, before the detail

**5/5 is not reachable on any of the three channels tomorrow morning.** Even if every open PR merged tonight, the best
reachable result is:

- **Telegram:** a real end-to-end test up to "approved and queued", if #194 (+#206) is merged and deployed tonight.
- **WhatsApp:** a test up to "approved and queued", if the owner has a Meta WhatsApp number and app tonight.
- **iMessage:** a test up to "card shown". **No approval path exists on iMessage** (E-3).

On every channel the last link, sending the approved application, has no production path for a phone-only account
(E-2).

Three facts decide this:

1. **Nothing on the production channel path is deployed.** `trainee-telegram`, `trainee-whatsapp`, `trainee-inbound`
   and `trainee-deliver` are not deployed. agent-chat v251 predates all 15 merged features. The live webhooks point
   at one-user TEST bridges: `telegram-inbound` v10, `whatsapp-inbound` v8 (Twilio) and `imessage-inbound` v37
   (sources: HANDOFF-2026-10-26.md:65 and :75; capability map §1). A test tomorrow needs the owner to lift the launch
   hold for these functions (HANDOFF-2026-10-26.md:31) and run go-live.
2. **A phone-only person cannot get an application sent.**
   - The sender (`workers/career-browser/approve-first.ts:445-462`) claims as the signed-in person
     (`career_apply_claim_own`).
   - A Telegram channel-only account has a synthetic `.invalid` email and no password (#194
     `trainee-inbound/store.ts`, `channelOnlyEmail`).
   - A phone account needs phone sign-in, which is not set up (HANDOFF-2026-10-26.md:169).
   - The cloud route for text-card approvals exists only in #202. It is off behind two switches and the
     3-confirmed-hand-submissions gate, and it needs Vercel Sandbox time, which is on hold (#202
     `20261026230017_career_cloud_hosted_apply.sql:1-30`; HANDOFF-2026-10-26.md:33).
   - #194's end-to-end test only "sends" by impersonating the account at the database level
     (`pg.asPerson(person)`, #194 `tests/architect/flow-telegram-e2e.test.ts:421`). Production cannot do that.
3. **iMessage cannot approve a card.** LoopMessage gives no reply-to id (`_shared/loopmessage_adapter.ts:33`) and has
   no buttons (`:18`). A plain "yes" is refused when there is no reply id (`_shared/career_apply_cards.ts:187`). The
   refusal then tells the person to "tap the card" (`career_apply_cards.ts:141`), and there is nothing to tap.

## A. Channel wiring, link by link

### A.1 Telegram: `trainee-telegram` (trunk) and the test bridge `telegram-inbound`

| Link | Trunk | With open PRs | Evidence |
|---|---|---|---|
| In go-live deploy list | `trainee-telegram`: yes. `telegram-inbound`: no (test bridge) | #194 adds `trainee-telegram-link` (JWT on) | `scripts/launch/trainee-go-live.sh:246,250`; #194 go-live diff `JWT_FNS` |
| Webhook auth | PRESENT+TESTED (mem) | same | Secret header, 32-256 chars, constant-time (`_shared/telegram.ts:84-87`); WO-038/G1 (`tests/architect/wo-038-channels.test.ts:466`); the smoke checks a 403 (`scripts/launch/trainee-smoke.cjs:114-126`) |
| Dedupe of retried updates | PRESENT+TESTED (mem) | (pg) in #194 | `claimMessage(update_id)` (`_shared/channel_inbound.ts:109`); WO-038/D1 (`wo-038-channels.test.ts:398`) |
| New account for a new chat | **BROKEN** | PRESENT+TESTED (pg) in #194 | Trunk calls `createUser` with neither email nor phone (`trainee-inbound/store.ts:39-41`). Its own comment says acceptance is "UNKNOWN", and the connectors audit records "Account creation fails (parallel audit B3)". #194 adds a synthetic `tg-<id>@users.trainee.invalid` plus re-attach, asserted in `flow-telegram-e2e.test.ts:282-283` |
| Identity linking | PRESENT+TESTED (mem) | #194 adds Telegram login (`login_url`) | Covered: `/start <nonce>` single-use for 10 minutes, stored hashed (`channel_inbound.ts:129-134,189-195`; WO-038/L1-L2). D-023 is still "proposed" (`docs/architect/DECISIONS.md:36`). Telegram login needs a web domain plus BotFather `/setdomain` (#194 `docs/architect/TELEGRAM-LIVE-CHECK-2026-10-26.md` step 5); there is no domain yet (HANDOFF-2026-10-26.md §8) |
| Admission gate | Env allow-list only: PRESENT+TESTED (mem) | `trainee_admit` / `trainee_may_act` in #195 (#199 invites): PRESENT-UNTESTED on the channel path | Trunk: `signupAllows` (`channel_inbound.ts:73-82,163`). #195 records `admit(user, true)` after the env check and enforces in DB triggers on the apply tables (#195 `20261026230000_trainee_web_admission.sql:123-150`). The channel `admit` call has no channel test in #195; the DB has a SQL test. Note: `TRAINEE_SIGNUP=open` in the env also records `via='allowlist'`, which bypasses the DB's own `web_signup` mode (E-9) |
| STOP / opt-out | PRESENT+TESTED (mem) | same | STOP/START/HELP and `/stop` (`channel_inbound.ts:135-149`; `_shared/channel.ts:11-29`); a block (`kicked`, or a 403 "blocked") is the person's STOP (`telegram.ts:42-43,105`); WO-038/P2, B1 |
| Rate limits | PRESENT+TESTED (mem) | same | 60 turns an hour per person (`agent-chat/handler-career.ts:178-200`, `agent_rl_bump_as`); a 429 is said plainly (`_shared/channel_runtime.ts:21`); 1 message a second per chat and 30 a second overall (`telegram.ts:68`; WO-038/T1); an unknown chat is refused once (`channel_inbound.ts:164`) |
| Files in (resume) | MISSING, but said honestly | #194 and #201 **both** add it, in two different designs (E-8) | Trunk: a document is `seen` and gets "paste it as text" (`telegram.ts:53`; `channel_inbound.ts:122-125`). A paste is silently cut at 4,000 characters (`channel_inbound.ts:203`) |
| Files out (tailored PDF) | MISSING | #194: `sendDocument` | Trunk `chatThroughAgent` drops `artifacts` (`channel_runtime.ts:11-30`), although agent-chat returns them (`handler-career.ts:814`) |
| Approval card | **BROKEN** | PRESENT+TESTED (pg) in #194: inline Approve and Decline, `callback_query`, tap bound to the card and its hashes | Trunk sends no `reply_markup` (`telegram.ts:97`) and ignores `callback_query` (`telegram.ts:46`). The card footer says "Reply \"yes\"" (`career_apply_cards.ts:88-91`), but a plain yes is refused (`:187`); only a yes sent as a direct reply to the card counts (`:172-195,301-321`). The refusal says "or tap Approve on the card" (`:140`), and no such button exists on trunk |
| Outbound, retries, idempotency | PRESENT+TESTED (mem) | (pg) in #194 | One outbox row per key (`career_outbox_once`); at most once, retried only when certainly not sent, 3 attempts (`channel.ts:59,155`); a timeout is final (`telegram.ts:99-101`); WO-038/M1-M2 |
| Proactive (alerts, receipts) | PRESENT+TESTED (mem) | same | Only to a chat that pressed Start (Telegram's rule); STOP holds what Trainee starts (`channel.ts:113`); the home channel is chosen by `channel_parity` (`20261021070000_channel_parity.sql:89-95`); WO-038/H1 |
| Webhook registration | Doc lacks `callback_query` | #194 adds it | `docs/launch/TRAINEE-GO-LIVE.md:225`; live points at `telegram-inbound` (HANDOFF-2026-10-26.md:75) |

### A.2 WhatsApp: `trainee-whatsapp` (Meta Cloud API, D-019)

The task names `whatsapp-inbound` and `_shared/whatsapp_twilio.ts`. That is the Twilio **sandbox test bridge**: one
allow-listed test user (`CHANNEL_TEST_USER_ID`; `_shared/whatsapp_twilio.ts:1-35,197`). It goes against D-019 ("Meta's
Cloud API directly, no reseller", `DECISIONS.md:32`) and is not in the deploy list. Production is `trainee-whatsapp`.

| Link | Trunk | With open PRs | Evidence |
|---|---|---|---|
| In go-live deploy list | `trainee-whatsapp`: yes. `whatsapp-inbound`: no | same | `trainee-go-live.sh:246` |
| Webhook auth | PRESENT+TESTED (mem) | same | GET verify-token challenge (`_shared/whatsapp.ts:120-126`); HMAC-SHA256 of the raw body with the app secret, checked before parsing (`:128-131`); WO-038/G1. The header's exact form against Meta is NOT verified (`TRAINEE-GO-LIVE.md:291-294`) |
| Dedupe | PRESENT+TESTED (mem) | same | `messages[].id` (`whatsapp.ts:65`); `channel_inbound.ts:109` |
| New account | PRESENT-UNTESTED (no pg, never live) | same | `createUser({ phone })` (`trainee-inbound/store.ts:39-41`). The live project has 0 channel contacts and only email accounts (HANDOFF-2026-10-26.md:73), so an account made from a phone has never been exercised. Whether it needs Supabase phone auth turned on is NOT verified |
| Linking (same phone as iMessage) | PRESENT+TESTED (mem) | same | Never merged on its own: the channel already linked is asked, and only its yes links (`channel_inbound.ts:151-161,182-188`; WO-038/L3) |
| Admission | as Telegram | as Telegram | `redeemInviteByPhone` for WhatsApp/iMessage in #199 (`channel_inbound.ts` #199 diff) |
| STOP | PRESENT+TESTED (mem) | same | WO-038/P2, P9 |
| Rate limits | PRESENT+TESTED (mem) | same | 1 a second per person, 50 a second overall (`whatsapp.ts:96`); throughput codes retried on the first message only (`:36,148`); 60 turns an hour (agent-chat) |
| Files in | MISSING, but said honestly | MISSING (no PR) | A document or image is `seen` and gets "paste it" (`whatsapp.ts:75`; `channel_inbound.ts:122-125`). There is no Graph media download. #201 lifts the paste cap to 65,536 (`CHANNEL_TEXT_MAX`) |
| Files out | MISSING | MISSING | No `sendDocument` on the WhatsApp adapter |
| Approval card | Text yes as a reply to the card: PRESENT-UNTESTED (pg); wording **BROKEN** | same | Reply id = `messages[].context.id` (`whatsapp.ts:67`), matched to the outbox's `provider_id` (`career_apply_cards.ts:314-321`). No buttons are sent (`whatsapp.ts:143`), yet the refusal says "tap Approve on the card" (`career_apply_cards.ts:140`). The card is not put into the thread outside the 24-hour window (`TRAINEE-GO-LIVE.md:245-246`). #194 wires buttons and taps only for Telegram |
| Outbound, retries | PRESENT+TESTED (mem) | same | 131047/131049 hold the row and send it whole on the person's next message, on the send or by a later status (`whatsapp.ts:147`; `channel_inbound.ts:243-246`); WO-038/W4 |
| 24-hour window and templates | PRESENT+TESTED (mem) | same | The window is closed 10 minutes early (`_shared/channel_adapters.ts:132`, `WHATSAPP_WINDOW_MS`); one utility template per silence (`whatsapp.ts:153-160`; WO-038/W1-W3); with no template name nothing is sent, and the rows wait (`_shared/channel_registry.ts:50`; W2). Template approval is the owner's (`TRAINEE-GO-LIVE.md:277-284`) |
| Webhook timing | PRESENT-UNTESTED risk | same | The handler answers Meta only after the whole turn (`channel_inbound.ts:249-253`; agent-chat timeout 120 s, `channel_runtime.ts:15`). Meta's retry and disable behavior on slow answers is NOT verified; dedupe stops a second turn |

### A.3 iMessage: `trainee-inbound` and `trainee-deliver` (LoopMessage)

| Link | Trunk | With open PRs | Evidence |
|---|---|---|---|
| In go-live deploy list | `trainee-inbound` and `trainee-deliver`: yes; `imessage-inbound` (live v37) has no source on trunk | same | `trainee-go-live.sh:243`; capability map §1 |
| Webhook auth | PRESENT+TESTED (mem) | same | A 32+ character secret in `?secret=` or `x-trainee-secret`, constant-time (`trainee-inbound/handler.ts:28-35`; `loopmessage_adapter.ts:24-27`); `tests/edge/channel-inbound.test.ts`. The secret rides in the URL, so it can appear in provider or proxy logs |
| Provider API shape | **NOT VERIFIED** | same | Send host and fields, the inbound fields and the retry rules are all unverified (`_shared/loopmessage.ts:1-11`; `TRAINEE-GO-LIVE.md:192-203`) |
| Dedupe | PRESENT+TESTED (mem) | same | A message with no id runs nothing (`loopmessage_adapter.ts:30`) |
| New account | PRESENT-UNTESTED (no pg, never live) | same | Phone or iMessage email (`trainee-inbound/store.ts:39-41`) |
| STOP | PRESENT+TESTED (mem) | same | `channel.ts:11-29`; WO-038/P2 |
| Daily contact cap | PRESENT+TESTED (mem) | same | 300 a day by default (`channel_registry.ts:6`, `LOOPMESSAGE_DAILY_CONTACTS`); WO-038/G2. LoopMessage forbids cold messaging (`DECISIONS.md:16`) |
| Files in | **BROKEN** (silent) | BROKEN (no PR) | An attachment with no text is dropped in the parser (`loopmessage.ts:58`) before `runInbound`, so the "paste it" answer never goes out (`channel_inbound.ts:122` is never reached). The person gets silence |
| Files out | MISSING | MISSING | `capabilities.documents: false` (`loopmessage_adapter.ts:18`) |
| Approval card | **BROKEN** (no path) | BROKEN (no PR) | No reply id (`loopmessage_adapter.ts:33`) and no buttons (`:18`). A yes is refused (`career_apply_cards.ts:187`) and told "tap the card" (`:141`). The web dashboard tap needs web sign-in of a phone account, and phone auth is not set up (HANDOFF-2026-10-26.md:169) |
| Outbound, retries | PRESENT+TESTED (mem) and (pg) | same | 429/502/503 retried, everything else final (`loopmessage.ts:12,15-43`); 250 ms between bubbles; `tests/architect/f07-alerts-deliver-pg.test.ts` drives `handleDeliver` with a faked LoopMessage send on real Postgres. This is the only (pg) channel test on trunk |
| Proactive | PRESENT+TESTED (mem); alerts (pg) | same | f07 (pg) for alerts; STOP holds (`channel.ts:113`) |
| Webhook timing | PRESENT-UNTESTED risk | same | It answers after the turn (up to about 2 minutes); LoopMessage's timeout and retry are NOT verified (`TRAINEE-GO-LIVE.md:202-203`) |

### A.4 Shared by all three

- **The turn:** every channel runs agent-chat as the person through the service-role bridge (`as_user_id`,
  `handler-career.ts:135-148`) and is channel-blind (`channel_runtime.ts:11-30`). History, erase, pause and the hourly
  limit are agent-chat's own.
- **Delivery:** `trainee-deliver` runs every minute from pg_cron (`trainee-go-live.sh:795`). A channel without its
  secrets is NOT_WIRED: its rows wait (`channel_registry.ts:18-30`; `trainee-deliver/handler.ts:33-42`).
- **Turn failure:** after the message id is claimed, a failure is told to the person once ("I couldn't answer that
  just now"), never silently (`channel_inbound.ts:228-232`). It is never retried, because the provider got a 500 for a
  claimed id.

## B. The first 30 minutes of a brand-new user, per channel

Chain: trigger → ask → connectors/keys → execution → recorded outcome → truthful reply → failure paths →
follow-through.

Scores use the rule "5 = every link present and outcome-tested on every channel", given per channel as
**trunk / with every open PR merged**. None is measured live: nothing on this path is deployed.

| Capability | Telegram | WhatsApp | iMessage | The broken or missing link |
|---|---|---|---|---|
| Onboard (first text → account → first step) | 0 / 4 | 2 / 3 | 2 / 3 | Telegram: account creation (A.1). WhatsApp and iMessage: a phone account never exercised, no (pg) webhook test. All three: admission is env-only on trunk; #195 is untested on the channel path |
| Resume | 1 / 4 | 1 / 2 | 0 / 1 | Trunk cuts a paste at 4,000 characters (`channel_inbound.ts:203`). Files: Telegram only, in two conflicting PRs. iMessage files are silent (`loopmessage.ts:58`). The resume rule is not enforced at every layer until #194/#206 (HANDOFF-2026-10-26.md:19-22) |
| Search | 2 / 2 | 2 / 2 | 2 / 2 | It works through agent-chat on every channel (mem). The pool is the frozen Oct 2026 KB snapshot (`handler-career.ts:283-299`); live `career_postings` is 0 (HANDOFF-2026-10-26.md:73). No (pg) channel test |
| Tailor | 1 / 3 | 1 / 1 | 1 / 1 | The PDF never reaches a channel on trunk (`channel_runtime.ts:11-30`); #194 is Telegram only |
| Apply with approval card | 1 / 3 | 1 / 1 | 0 / 0 | Telegram: buttons only in #194. WhatsApp: false "tap" wording. iMessage: no approval path. All: no sender for phone-only accounts (E-2). With nothing prepared, the reply says "Prepare applications on your computer first" (`career_apply_cards.ts:156`) |
| Track status ("did it go through?") | 2 / 3 | 2 / 2 | 2 / 2 | Answered from `career_apply_jobs`, said as recorded (`handler-career.ts:444-449`). With no sender, the truthful answer is "approved, not sent". Only Telegram has a (pg) channel test, in #194 |
| Reminders and alerts | 2 / 2 | 2 / 2 | 3 / 3 | `career-proactive` → outbox → `trainee-deliver`: (pg) for iMessage only (f07); (mem) for Telegram and WhatsApp. WhatsApp outside 24 hours needs the approved template. Schedules start only when go-live runs (`trainee-go-live.sh:793-795`) |
| Gmail connect | 0 / 2 | 0 / 2 | 0 / 2 | Only in #191 (`gate (core)` red), on top of #196. Google in Testing mode: 100 users, 7-day refresh, "unverified app" (#191 body). An instant confirmation goes to Telegram only (`TELEGRAM_BOT_TOKEN` on `career-connect`); WhatsApp and iMessage NOT verified |
| Mock interview (text) | 2 / 2 | 2 / 2 | 2 / 2 | `mockTurn` is code's and channel-blind (`handler-career.ts:367-369`; `_shared/career_mock.ts:766`); state is in `career_watch_kv` (`:858`). No channel (pg) test |
| Erase ("forget everything") | 2 / 3 | 2 / 3 | 2 / 3 | #200 empties every `career_*`/`channel_*` table, keeping `channel_contacts` so the reply arrives (#200 `20261026230100_career_erase_complete.sql:25-38,86-92`). No channel (pg) test. Erasing the account itself (delete-account) from a channel: NOT verified |

## C. What the owner must do before a live test (names only, never values)

### C.0 Every channel

1. **Lift the hold, in writing, for exactly these functions.** No deploy may happen without it
   (HANDOFF-2026-10-26.md:31).
2. **Merge, in this order, only what is reviewed and green:**
   - #197 → #200 → #195 → #199;
   - #194 + #206, after resolving #194's conflict with #195/#199 in the sign-up block of `channel_inbound.ts`;
   - one of #194 or #201 for files (E-8);
   - #191 and #202, if wanted.
   - #191 and #194 fail `gate (core)` today.
3. **Run go-live from your own shell at the merged commit** (`scripts/launch/trainee-go-live.sh --sha <sha> --brain agent`).
   - Values it asks for:
     - Supabase: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`.
     - Function secrets: `CAREER_INGEST_SECRET`, `CAREER_PROACTIVE_SECRET`, `TRAINEE_DELIVER_SECRET`,
       `TRAINEE_INBOUND_SECRET`.
     - Keys and settings: `OPENAI_API_KEY`, `LOOPMESSAGE_API_KEY`, `LOOPMESSAGE_DAILY_CONTACTS`,
       `TRAINEE_ALLOWED_CONTACTS`.
   - Check the OpenAI key with one real call first: it is "not yet verified by a live call"
     (HANDOFF-2026-10-26.md:78-80).
4. **Admission.** Sign-up is closed by default (`channel_inbound.ts:74`).
   - Put each test contact in `TRAINEE_ALLOWED_CONTACTS`: `+1…` for iMessage and WhatsApp, and `telegram:<chat id>`.
   - A Telegram chat id is only known after the first message. Send `/start` once; it is refused and recorded. Read
     the id (D.2 T0), add it, and set the secret again.
   - Alternatively, use a #199 invite (`/start inv_<token>`).
5. **Sending, if the test is meant to reach an employer.** That is an external effect: approve the exact card, and
   send it to your own test form or a posting you choose. Pick one:
   - **(a)** Link the channel to your web account and run `approve-first.ts run` signed in as you. Telegram linking
     needs D-023 approved, or the Telegram login with a domain.
   - **(b)** Enable the cloud route: #202, `CAREER_CLOUD_APPLY` and `CAREER_CLOUD_TEXT_CARDS` set to on, a waiver or
     the gate, and Sandbox time, which needs your yes.

   Otherwise the expected end state is **approved, queued, not sent**, and the test must assert exactly that.

### C.1 Telegram

1. **BotFather:** the token (`TELEGRAM_BOT_TOKEN`), `TELEGRAM_BOT_USERNAME`, and `/setjoingroups` → Disable
   (`TRAINEE-GO-LIVE.md:214-216`).
2. **go-live:** `TELEGRAM_WEBHOOK_SECRET` (Enter generates it; shown once).
3. **setWebhook to `…/functions/v1/trainee-telegram`** with that `secret_token`.
   - `allowed_updates=["message","callback_query","my_chat_member"]`; `callback_query` matters only with #194.
   - Add `drop_pending_updates=true`.
   - This moves the bot off `telegram-inbound`. To roll back, call setWebhook again with the old URL.
4. **Check with `getWebhookInfo`:** the URL is ours and there is no `last_error_message`. The smoke checks it
   (`trainee-smoke.cjs:128-135`).
5. **With #194's Telegram login only:** set `TELEGRAM_LOGIN_URL` and `TRAINEE_WEB_ORIGIN`, and run BotFather
   `/setdomain`. This needs a domain, and none exists yet.

### C.2 WhatsApp

`TRAINEE-GO-LIVE.md:248-289` gives the full steps.

1. **Meta app:** a business portfolio and an app with the WhatsApp product (the WABA).
2. **A registered number** → `WHATSAPP_PHONE_NUMBER_ID`.
   - Meta's own test number may serve tonight. That is external and NOT verified here.
3. **App secret** → `WHATSAPP_APP_SECRET`.
4. **System-user permanent token** → `WHATSAPP_TOKEN`.
5. **go-live:** `WHATSAPP_VERIFY_TOKEN`.
6. **Webhook:** the URL `…/functions/v1/trainee-whatsapp` plus the verify token; subscribe to `messages`.
7. **Template:** `trainee_updates` (Utility, `en_US`) → `WHATSAPP_TEMPLATE_UPDATES`, `WHATSAPP_TEMPLATE_LANGUAGE`,
   `WHATSAPP_DAILY_TEMPLATES`.
   - It is only needed for messages outside 24 hours. A same-morning test does not need it, but must then not wait
     a day.
8. **Retire the Twilio `whatsapp-inbound` webhook** on the sandbox number, so two bots never answer.
9. **Your number and linking.** If the WhatsApp number is the same phone you use for iMessage, WhatsApp will **not**
   make a new account. It asks on iMessage "Reply yes to link it" (`channel_inbound.ts:22,151-161`). To test WhatsApp as
   a brand-new user, use a different phone number, or test the link flow on purpose.

### C.3 iMessage (LoopMessage)

1. **LoopMessage:** an account and an API key (`LOOPMESSAGE_API_KEY`), and a sender assigned to the account.
   LoopMessage's sender setup and limits are NOT verified here.
2. **Confirm against LoopMessage's own documentation before turning it on:**
   - the send host and fields: `a.loopmessage.com` with `{contact,text}`, or `server.loopmessage.com` with a second
     key and `recipient` (`TRAINEE-GO-LIVE.md:195-198`);
   - the inbound fields: `alert_type`, `message_id`, `recipient`/`from`, `text`;
   - the webhook timeout and retry rules.
3. **Webhook URL:** `…/functions/v1/trainee-inbound?secret=<TRAINEE_INBOUND_SECRET>`. This replaces whatever points
   at `imessage-inbound` today (where it points is NOT verified).
4. **Expect the approval to fail on iMessage** (E-3), and expect a file sent as a resume to get no answer (E-6).

## D. Test strategy

### D.1 Tonight: automated, real Postgres, real webhook payloads

**Already in the repo:**

- (mem) all three channels: `tests/architect/wo-038-channels.test.ts`, which has 20+ cases at `:135-651`;
  `tests/edge/channel-inbound.test.ts`, `channel-delivery.test.ts`, `channel-text-yes.test.ts` and `telegram-*.test.ts`.
- (pg) iMessage delivery only: `tests/architect/f07-alerts-deliver-pg.test.ts`.
- (pg) in PRs: #194 `flow-telegram-e2e.test.ts` (Telegram, the full chain); #191 `flow-connectors-needs.test.ts`
  (Gmail connect, through `handleChat`, not a channel).

**To add tonight.** Each one follows the strict standard: it fails first on the base, with the failure quoted; it
survives a mutation of its guard; it asserts rows, not words. The harness is `bash tests/flow/run-real-flow.sh <file>`
(Postgres 16, the PostgREST double, the real `handleChat`). #194's `tests/flow/postgrest.ts:164` adds the
`/auth/v1/admin/users` POST that account creation needs.

| Test | Drives | Asserts (state, not wording) | Expected on trunk |
|---|---|---|---|
| `flow-whatsapp-e2e.test.ts` | `handleWhatsApp` with HMAC-signed Meta payloads: text, a document, an interactive reply, status `failed` 131047; a fake Graph API | Exactly one `auth.users` row, made from the phone; `channel_contacts` `wa:<id>` with alias and phone; one `channel_inbound` row per message id; `career_outbox` `reply:wa:<id>` delivered with a `wamid` `provider_id`; the card row carries `card_id`; a yes sent as a reply (`context.id` = the card's wamid) answers the card (`career_apply_cards.state='answered'`, one `career_apply_jobs` row whose `approval_hash = payload_hash`); a plain yes changes nothing **and its reply names no button that was not sent**; 131047 → `held`, then sent whole on the next message; a document → the honest reply, no turn | Wording assert **fails** (E-5); the rest should pass |
| `flow-imessage-e2e.test.ts` | `handleInbound` with LoopMessage `message_inbound` bodies through `?secret=`; a fake LoopMessage send | As above, for `+1…`; an attachment-only body → **a reply goes out** | **Fails**: silence (E-6); and the card cannot be approved (E-3). Assert the gap until it is fixed |
| `flow-channel-link-pg.test.ts` | the same phone texts iMessage, then WhatsApp | One auth user; `channel_link_requests` row; nothing linked until "yes" on iMessage; then both contacts share `user_id` and `thread_id` | should pass |
| `flow-channel-stop-pg.test.ts` | STOP on each channel, then a due alert, then a person's text | `channel_contacts.opted_out` true; the alert row `skipped_opt_out`; the reply to the person's text `delivered` | should pass |
| `flow-channel-admit-pg.test.ts` (on #195) | sign-up from an allow-listed `+1…`, an unlisted one, and `TRAINEE_SIGNUP=open` with DB mode `invite` | `trainee_admissions.via='allowlist'` only for the listed contact; the unlisted one refused once, with no account; open-env vs invite-DB recorded truthfully | the open case **fails** (E-9) |
| `flow-channel-erase-pg.test.ts` (on #200) | "forget everything" on each channel, then "hi" | `career_erase_tables()` empty for the person; `channel_contacts` kept; the next reply `delivered` (not "couldn't answer") | not verified |

### D.2 Tomorrow morning: the live script (owner)

Run one channel at a time. Before each step, note the time `:t0`. After each step, run its SQL read-only in the
Supabase SQL editor. `:user` comes from step T1.

#### Telegram (needs #194 + #206 deployed; otherwise stop after T0)

| # | Type exactly | Expected reply (meaning) | Expected state (read-only SQL) |
|---|---|---|---|
| T0 | `/start` (chat not yet allowed) | invite-only, once (`channel_inbound.ts:19`), or the link button with #194 and `TELEGRAM_LOGIN_URL` | `select contact, user_id from channel_contacts where contact like 'tg:%' and created_at > :t0;` → 1 row, `user_id` null. Add `telegram:<id>` to `TRAINEE_ALLOWED_CONTACTS` |
| T1 | `hi` | a welcome that names the first step | `select user_id, thread_id from channel_contacts where contact='tg:<id>';` → `user_id` set; `select email from auth.users where id=:user;` → `tg-<id>@users.trainee.invalid`; `select via from trainee_admissions where user_id=:user;` → `allowlist` (with #195); `select key,status,provider_id from career_outbox where user_id=:user order by id;` → `reply:tg:<update_id>`, `delivered`, `provider_id` not null |
| T2 | send your resume as a PDF | the entries read back, each numbered, nothing confirmed | `select filename, bytes, sha256 from career_resume_uploads where user_id=:user;` → the sha256 equals `shasum -a 256` of the file |
| T3 | `yes, that's my resume` | confirmed | `select count(*) from career_events where user_id=:user and kind='fact_confirmed' and at > :t0;` = the number of entries; `select career_resume_on_file(:user);` → true |
| T4 | `find software engineering internships in Chicago` | real postings with links | no writes required; every link in the reply exists in `career_kb_postings` (spot-check 3) |
| T5 | `apply me to this: <a posting link you chose>` | queued, nothing sent, the one next need | `select posting_key, state from career_apply_wanted where user_id=:user;` → 1 row |
| T6 | `show my applications` | "Nothing is prepared yet…" **unless** prepare-ahead ran | `select count(*) from career_apply_prepared where user_id=:user;` matches the reply (0 → the empty reply) |
| T7 | tap **Approve** (#194); also try a plain `yes` first | plain yes: nothing approved; tap: N approved, nothing sent | after the plain yes: `select count(*) from career_apply_jobs where user_id=:user;` = 0; after the tap: exactly 1 row per item, `approval_hash = payload_hash`, `state='queued'` |
| T8 | `did it go through?` | "approved, not sent yet" (no sender) | the reply's state equals `select state from career_apply_jobs where user_id=:user;` |
| T9 | `mock me for software engineer at Ramp` | the first question | `select count(*) from career_watch_kv where user_id=:user and key like '%mock%';` ≥ 1 (exact key NOT verified) |
| T10 | `STOP`, then `hi` | the unsubscribe text; then an answer | `select opted_out from channel_contacts where contact='tg:<id>';` → true; the reply to `hi` is `delivered` |
| T11 | `START`, then `forget everything` | back on; then erased | `select count(*) from career_apply_wanted where user_id=:user;` = 0; `channel_contacts` row kept |
| T12 | (check) | — | `select provider_message_id from channel_inbound where provider='telegram' and received_at > :t0;` → one per update; `select status, count(*) from career_outbox where user_id=:user group by 1;` → no `failed` and no stuck `sending` |

#### WhatsApp

Run T1-T12 from a phone number not used on iMessage, with these differences:

- **T2:** expect "I can't open files sent here yet…" (`channel_inbound.ts:32`), then paste the text.
- **T6 and T7:** reply **directly to the card** (press and hold → Reply) with `yes`. Expect one `career_apply_jobs`
  row. A plain `yes` must approve nothing. Its reply currently mentions a button that does not exist (E-5): record
  that as a FAIL.
- **Contact keys:** `wa:<wa_id>`. The outbox `provider_id` values start with `wamid`.

#### iMessage

Run T1-T5 and T8-T12, with these differences:

- **T2:** sending a file must get an answer. Silence is a FAIL (E-6).
- **T7 is expected to FAIL:** there is no way to approve (E-3). Record the reply text and that
  `career_apply_jobs` stays at 0.

### D.3 Go / no-go for "5/5 on three channels"

**GO only when every line is true on every channel:**

1. The function is deployed at the merged commit: `trainee-go-live.sh --verify <sha>` exits 0.
2. The provider webhook points at the `trainee-*` function. The smoke is PASS for its door.
3. Steps T1-T12 match their SQL exactly, with no `failed` or `sending` outbox rows and one `channel_inbound` row per
   provider message.
4. A card is approved only by the channel's bound gesture, the same in state on every channel, and every refusal's
   wording names only something that exists on that channel.
5. A file sent as a resume is read, or answered honestly, on every channel. Never silence.
6. An approved application reaches the employer through a sender available to a phone-only account, with a receipt.
   Or the product says plainly, before the card, that sending is not available. The owner decides which is acceptable
   for the test.
7. The D.1 (pg) tests exist for all three channels and are green on the merged commit.

**NO-GO for tomorrow (today's reading):** items 1, 2 and 7 on all three channels; item 4 on iMessage and WhatsApp
(Telegram too without #194); item 5 on iMessage; item 6 on all three.

## E. Top 15 defects and gaps blocking 5/5 across the three channels (ranked)

| # | Defect / gap | Channels | Size | Owner PR | Recommended fix |
|---|---|---|---|---|---|
| 1 | Nothing on the production channel path is deployed. agent-chat v251 predates the features; the webhooks point at one-user test bridges (HANDOFF-2026-10-26.md:65,75; capability map §1) | all | S (owner) | unowned (owner's go-live; hold) | Owner's written yes, then go-live at a merged sha, then repoint each webhook (C) |
| 2 | No sender for a phone-only or channel-only account. `approve-first` claims as the signed-in person (`approve-first.ts:445-462`); the Telegram account has no password; phone sign-in is not set up; the cloud text-card route is only in #202, switched off and needs Sandbox; #194's test sends as `pg.asPerson` (`flow-telegram-e2e.test.ts:421`) | all | L | #202 (partial); the rest unowned | Decide the sender for phone-only users: #202's service-role cloud route behind its gates, or link-to-web plus the person's own runner. Until then, the card and the status reply must say plainly that sending is not available |
| 3 | iMessage has no approval path: no reply id (`loopmessage_adapter.ts:33`), no buttons (`:18`), a yes refused (`career_apply_cards.ts:187`), and "tap the card" (`:141`) is false | iMessage | M | unowned | Verify whether LoopMessage exposes a reply or thread id; if so, read it into `replyToMessageId`. If not, the owner decides a bound alternative, for example a one-time signed approve link to a page that shows the exact payload and hash. Never a looser text yes |
| 4 | Telegram sign-up is broken on trunk: `createUser` with neither email nor phone (`trainee-inbound/store.ts:39-41`) | Telegram | S | #194 | Merge #194 + #206 after the review fixes (zip caps, safe unlink, fail-closed resume check). Its `gate (core)` is red at `8664fbc` |
| 5 | Card wording is false. The footer says reply "yes" (`career_apply_cards.ts:88-91`), but a plain yes is refused (`:187`). `NEEDS_REPLY_CHANNEL` tells WhatsApp (and Telegram on trunk) to "tap Approve on the card", where no button is sent (`:140`; `whatsapp.ts:143`; `telegram.ts:97`) | all | S | unowned (#194 fixes Telegram's buttons only) | Choose the wording by the channel's real capability. The footer says "reply to this message with yes" where a reply id exists. Test each channel's exact text |
| 6 | An iMessage file is silently dropped: the parser returns `ignored` before the core (`loopmessage.ts:58`), so `FILE_NOT_READ_REPLY` never goes out | iMessage | S | unowned | Parse an attachment-only inbound as `kind:"seen", file:true` (the fields must be verified with LoopMessage). Add a (pg) test |
| 7 | No resume file intake on WhatsApp or iMessage: no Graph media download, no LoopMessage attachment fetch | WhatsApp, iMessage | M | unowned | Add `fetchFile` to the WhatsApp adapter (media id → URL → bytes, with a size check before download) on the single intake design chosen in #8 |
| 8 | Two conflicting "FEATURE 16" file-intake designs. #194 uses `resumeFile` and `channel_resume_upload.ts`; #201 uses `msg.upload` plus agent-chat `resume_file`. Both edit `channel_inbound.ts`, `channel_runtime.ts` and `channel_adapters.ts` | Telegram (then all) | M | #194, #201 | The architect picks one (it must keep #194/#206's upload-hash binding of `fact_confirmed`), the other is rebased onto it, and one interface serves all three adapters |
| 9 | The admission core is not on trunk, and it conflicts with #194 in the sign-up block. With #195, `TRAINEE_SIGNUP=open` in the env records `via='allowlist'` and bypasses the DB's `web_signup` mode (#195 `channel_inbound.ts` diff; `trainee_admit`) | all | S | #195, #199 | Pass `listed` = the allow-list match only; let `trainee_admit` decide 'open' from the DB. Add D.1's admit test. Merge #195 → #199 → #194 in order |
| 10 | No real-Postgres webhook-to-delivery test for WhatsApp or iMessage. Every channel test but f07 is in-memory | WhatsApp, iMessage | M | unowned | Add D.1's `flow-whatsapp-e2e` and `flow-imessage-e2e`, fail-first |
| 11 | Documents out (the tailored resume, receipts) never reach a channel on trunk: `chatThroughAgent` drops `artifacts` (`channel_runtime.ts:11-30`) | all | M | #194 (Telegram only); WhatsApp and iMessage unowned | WhatsApp: a `document` message with a signed, expiring link. iMessage: a link (LoopMessage attachments NOT verified) |
| 12 | Provider shapes unverified against official docs: the LoopMessage host, fields and retries (`TRAINEE-GO-LIVE.md:192-203`); the Meta signature, BSUID and `v21.0` (`:291-294`); Telegram field names marked ASSUMED (`telegram.ts:1-18`) | all | S (owner) | unowned | The owner's first live message per channel checks each, recorded in D.2. The smoke only checks the doors |
| 13 | Gmail connect from a channel exists only in #191 (`gate (core)` red). Google is in Testing mode (100 users, 7-day refresh); an instant confirmation goes to Telegram only | all | M | #191, #196 | Fix #191's gate. Queue the callback's confirmation through `career_outbox`, so every channel gets it. Add the owner as a Google test user |
| 14 | A phone-only person is told to "Prepare applications on your computer first" (`career_apply_cards.ts:156`). Hosted preparation is #202, which needs Sandbox | all | S (wording) / L (hosting) | #202 | Say what actually happens (who prepares, and when). Until #202 is live, the owner runs `workers/career-browser/prepare-ahead.ts once` (service role, a dry run with nothing sent) before the test |
| 15 | Every webhook answers the provider only after the full turn, up to 120 s (`channel_inbound.ts:249-253`; `channel_runtime.ts:15`). Meta and LoopMessage retry and disable rules are NOT verified. Also, `cardOfMessage` reads a numeric reply id first as an `agent_messages.id` (`career_apply_cards.ts:306`), which can collide with a Telegram `message_id` | WhatsApp, iMessage (and Telegram) | M | unowned | Claim, answer 200 at once, and run the turn after the response (the runtime's background task). Namespace the reply-id lookup by channel (the outbox `provider_id` first for channel turns) |

## What is not proven here

- Every live fact is quoted from the handoff and the capability map, not re-read.
- No test was run by me. "(mem)" and "(pg)" mean the test exists and CI was green on that head.
- Scores in B are the architect's reading against the rule, not a measurement.
- Not verified:
  - the LoopMessage, Meta and Telegram field names;
  - whether Supabase accepts a phone account without phone auth;
  - Meta's test-number limits;
  - where the LoopMessage webhook points today;
  - the mock state key.
