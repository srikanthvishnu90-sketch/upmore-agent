# Trainee go-live (owner only)

One command, from the repo on your own machine, on the exact commit you want live. No agent runs it: agents never
deploy, apply migrations to the live project or create credentials (AGENTS.md).

```bash
supabase login                                            # once
bash scripts/launch/trainee-go-live.sh --dry-run          # prints every command, secrets as ***, touches nothing
bash scripts/launch/trainee-go-live.sh                    # the real run (asks for what is not in the environment)
```

Needs `supabase`, `psql`, `node`, `deno`, `git` (`brew install supabase/tap/supabase libpq node deno`). Every value is
read from the environment or asked on a hidden prompt; none is echoed, written to a file or put in the log
(`~/trainee-go-live-<UTC>.log`). The run stops at the first `STEP … FAILED`.

| Flag | Effect |
|---|---|
| `--dry-run` | print the plan, run nothing |
| `--skip-migrations` / `--skip-deploy` | skip step 2 / step 4 |
| `--only-smoke` | only preflight and the smoke checks |
| `--brain agent` | sets `CAREER_BRAIN=agent` (the agent brain answers career turns). Without it the brain is not touched; `--brain router` unsets it |
| `--allow-send` | the smoke also sends `HELP` to `trainee-inbound` as if from `TRAINEE_SMOKE_CONTACT`, and **the help reply is texted to that number**. Use your own |
| `--no-wait` | the smoke does not wait (up to 7 minutes) for each schedule to fire once |

## What you are asked for

| Input | What it is | Where it ends up |
|---|---|---|
| `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL` | the project (20 letters) and its database URI | nowhere (this process only) |
| `CAREER_INGEST_SECRET`, `CAREER_PROACTIVE_SECRET`, `TRAINEE_DELIVER_SECRET`, `TRAINEE_INBOUND_SECRET` | 32+ characters of `A-Z a-z 0-9 . _ ~ -`; Enter generates 48 (`openssl rand -hex 24`), shown once on the terminal only if you say yes | function secrets; the first three also in Vault for pg_cron; the inbound one in LoopMessage's webhook URL |
| `TRAINEE_ROTATE_INBOUND=1` | only when replacing the inbound secret on purpose | on a re-run, Enter for `TRAINEE_INBOUND_SECRET` stops the run if one is already set (a new one would silently break LoopMessage's webhook URL); give the same value, or set this and paste the new URL into LoopMessage |
| `LOOPMESSAGE_API_KEY`, `OPENAI_API_KEY` | Enter keeps the one already set | function secrets (`MODEL_PROVIDER=openai` with the OpenAI key) |
| `INGEST_CONTACT_EMAIL` | the contact job boards see in the User-Agent; career-ingest answers 503 without it | function secret |
| `TRAINEE_ALLOWED_CONTACTS` | comma-separated numbers allowed to sign up (sign-up is closed by default: `TRAINEE_SIGNUP` is not touched) | function secret |
| `LOOPMESSAGE_DAILY_CONTACTS` | your plan's contacts a day (unset means 300) | function secret |
| `PDL_API_KEY` | optional: People Data Labs key for hired-candidate aggregates (WO-036, D-018); without it Trainee says it has no data | function secret, hidden prompt |
| `UPMORE_TEST_JWT` (optional) | a test user's JWT for the agent-chat "hi" check | nowhere |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (optional) | from @BotFather (section Telegram below). Left empty, Telegram stays `NOT_WIRED` | function secrets |
| `TELEGRAM_WEBHOOK_SECRET` | asked only with a Telegram token; 32-256 of `A-Z a-z 0-9 _ -`; Enter generates 48 | function secret, and the `secret_token` you give `setWebhook` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` (optional) | the permanent system-user token, the phone number **ID**, the Meta app secret (section WhatsApp below). Left empty, WhatsApp stays `NOT_WIRED` | function secrets |
| `WHATSAPP_VERIFY_TOKEN` | asked only with a WhatsApp token; 32+ of `A-Z a-z 0-9 _ -`; Enter generates 48 | function secret, and the verify token in Meta's webhook settings |
| `TRAINEE_ROTATE_CHANNELS=1` | only when replacing a Telegram webhook secret or a WhatsApp verify token on purpose | as with `TRAINEE_ROTATE_INBOUND`: Enter never replaces one already set |
| `WHATSAPP_TEMPLATE_UPDATES`, `WHATSAPP_TEMPLATE_LANGUAGE` | the approved template's name (`trainee_updates`) and language (`en_US`). Unset: outside WhatsApp's 24-hour window nothing is sent; messages wait for the person's next message | function secrets |
| `WHATSAPP_DAILY_TEMPLATES` | your WhatsApp messaging limit, templates a day (unset means 250, a new account's tier) | function secret |

Function secrets are project-wide in Supabase: every function sees every one.

## The steps and what each changes

1. **preflight**: tools, inputs, a clean tree, `deno check` of the seven entry points. Changes nothing.
2. **migrations**: applies, in order and each once, every migration from the Trainee set on (the `MIGRATIONS` list in
   `scripts/launch/trainee-go-live.sh`; `tests/trainee-go-live.test.cjs` fails if a migration file from `20261019` on is
   missing from it). Today: `20261019000001_career_postings.sql`, `20261019010001_career_alerts.sql`,
   `20261019020000_channel_delivery.sql`, `20261019030000_channel_inbound.sql` (postings, alerts, the outbox, delivery
   and inbound), and the apply pipeline `20261020000001_career_apply_jobs.sql`, `20261020010000_career_apply_own_worker.sql`,
   `20261020020000_career_apply_receipts.sql`, `20261020030000_career_apply_cards.sql`,
   `20261020040000_career_apply_card_push.sql`, `20261020050000_career_apply_daily_limit.sql` (the approved-application
   queue, the person's own computer claiming its own applications, receipts, prepared applications and their card, the
   card pushed into the thread, the daily limit), and `20261020060000_career_apply_questions.sql` (the questions only the person can answer, asked once by text), `20261020070000_career_apply_questions_ai_policy.sql` (the employer's own words about AI help, kept with each written question so Trainee reads them before it drafts one, WO-030), `20261020100000_career_mail_tracking.sql` (status changes read from the person's own mail, drafts never sent), `20261020110000_career_connector.sql` (the Connector's profiles, introductions and blocks; nothing is proposed until 500 people opt in), `20261020120000_career_events.sql` and `20261020120100_career_events_erase.sql` (the account's timeline, cleared by an erase), and `20261020130000_career_resume_tailoring.sql` (the private
   `career-resumes` bucket for tailored resumes and the tailored/untailored tag on every application), and `20261021020000_career_voice_mock.sql` (the voice mock's single-use links and its debrief into the thread; the voice itself stays off until you deploy `career-voice` and set `CAREER_VOICE=on`, see WO-035), and `20261021010000_career_outreach.sql` (outreach drafts approved by their exact text, the do-not-contact list, Hunter's cached checks, and the send claim: 10 a day the first week, 20 by default, 30 at most, 90 seconds apart), and `20261021050000_career_brief_digest.sql` (interview invites and their briefs, the weekly digest's settings, both cleared by an erase; turned on with `CAREER_BRIEF_DIGEST=on` on career-proactive after it applies, WO-034), and `20261021070000_channel_parity.sql` (WhatsApp and Telegram beside iMessage: a contact per channel, the home channel, messages held for WhatsApp's window, Telegram link tokens and WhatsApp link questions, WO-038), and `20261021030000_career_hired_backgrounds.sql` (aggregate hired-candidate backgrounds from People Data Labs, never a named person, and the log of every PDL call's credits), and `20261021075000_career_apply_ops.sql` (WO-032: who drove each application, confirmed only by the employer's email, the PR #16 gate count `select * from career_apply_gate_status()`, applying by email from the person's Gmail on their yes, the open questions texted once, and no card pushed while the thread waits on something else), and `20261021080000_career_apply_cloud.sql` (the cloud worker's gate, opt-in, claim, telemetry and throttle; the kill switch `CAREER_CLOUD_APPLY` stays off until the owner turns it on, `docs/launch/CLOUD-WORKER.md`), and `20261021090000_career_mail_erase.sql` (an erase also deletes the mail-tracking events and drafts), and `20261021100000_career_proactive_last_word.sql` (a delivered alert, receipt or other text Trainee starts joins the texting thread, so a later "yes" is never read as the answer to an older prompt). Each runs in one transaction with its row in
   WO-037 adds `20261021110000_career_board_state.sql` (each watched board's read state for the 6-hour sharded refresh, the alert latency report and the weekly alert count).
    WO-031 adds `20261021000000_career_apply_extension.sql` (the browser extension records each application the person approved in it on the same queue, as them), and WO-042 adds `20261021120000_career_apply_form_answers.sql` (an answer the person typed on the form and approved is kept for later forms, so it is asked once; the extension's applications carry source `extension`, so the gate counts them).
   `public.upmore_migration_ledger` (when that ledger is in use; an empty or missing one is left for
   `apply-rails-and-seed.sh --pending` to backfill). A file whose objects are already live is not run again. The earlier
   career migrations (`20261015*`, `20261016*`) are only **checked**: they use plain `create table`, so a missing one stops
   the run and you apply it by hand after looking. Every applied one is additive (new tables, columns, constraints and
   functions; `create ... if not exists` and `create or replace`) and is applied twice in a row by `tests/db/run.sh` to
   prove a second run changes nothing.
3. **secrets**: one `supabase secrets set --env-file` from a 0600 temp file that is removed at once.
4. **deploy**: first downloads the live `agent-chat` to `~/trainee-rollback/agent-chat-<UTC>` (best effort), then deploys
   `agent-chat` from the career-only staged tree (`node scripts/career/stage-career.cjs`: `index-career.ts` as
   `agent-chat/index.ts`, JWT on; deploying it from the repo tree would ship the shelved finance entry), then
   `career-ingest`, `career-proactive`, `trainee-deliver`, `trainee-inbound`, `trainee-telegram`, `trainee-whatsapp`
   with `--no-verify-jwt` (pg_cron, LoopMessage, Telegram and Meta send no JWT; each function checks its own secret).
   The two channel webhooks deploy even when their channel is not wired: they then answer 503 `NOT_WIRED`.
5. **schedules**: runs `schedule-career-ingest.sql` (every 5 min), `schedule-career-proactive.sql` (every 5 min) and
   `schedule-trainee-deliver.sql` (every minute), each with its secret passed by env as the script's header says. Each
   stores the secret in Vault and replaces its pg_cron job. **From here texts go out** to people with a linked contact.
6. **smoke**: `node scripts/launch/trainee-smoke.cjs`: each function refuses a wrong secret and answers the right one
   (503 `NOT_WIRED` or "not configured" is a WARN, never a pass), agent-chat refuses no JWT and answers "hi" for the test
   user, the three pg_cron jobs fired and each run record (`career_ingest_state.last_run_at`, `career_proactive_runs`,
   `channel_delivery_runs`) has a fresh row without an error. The right-secret calls are one extra run of each
   function (an ingest pass, an alerts pass, a delivery pass); the inbound one gets an empty body and runs nothing.
   With Telegram's values: `trainee-telegram` refuses a wrong `X-Telegram-Bot-Api-Secret-Token` and ignores an empty
   update with the right one, and Telegram's `getWebhookInfo` (read only) shows the webhook is this project's. With
   `WHATSAPP_VERIFY_TOKEN`: `trainee-whatsapp` answers Meta's challenge only with the right token and refuses an unsigned
   POST. A channel not given is printed `NOT RUN … NOT_WIRED` and does not fail the run. None of them sends a message.
   Re-run it any time: `SUPABASE_URL=https://<ref>.supabase.co … node scripts/launch/trainee-smoke.cjs` (exit 0 pass,
   1 a FAIL, 2 NOT RUN).

## LoopMessage

Webhook URL (inbound messages), in LoopMessage's dashboard:

```
https://<ref>.supabase.co/functions/v1/trainee-inbound?secret=<TRAINEE_INBOUND_SECRET>
```

**Check these against LoopMessage's own documentation before you turn it on**; none was verified there (the docs were
unreachable from the build environment, WO-013). The code uses the shape your test bridge used live, 2026-10-08..11:

- send: `POST https://a.loopmessage.com/api/v1/message/send/`, header `Authorization: <raw API key>`, body
  `{ "contact", "text" }`, one request per bubble (`_shared/loopmessage.ts`). Some LoopMessage documentation describes
  a different host and fields (`server.loopmessage.com`, a second `Loop-Secret-Key` header, `recipient` and
  `sender_name`): confirm which one your account uses.
- retried as "certainly not sent": HTTP 429, 502, 503 and a connection that never opened; anything else is final.
- inbound: the webhook body is read from `alert_type` (`message_inbound`; delivery callbacks are ignored),
  `message_id` (dedupe), `recipient` / `from` / `sender` / `contact` / `phone` (the person's number) and `text`.
- the webhook answers after the chat turn (up to about 2 minutes). If LoopMessage retries sooner, the retry is
  answered "duplicate webhook" and runs nothing; confirm its timeout and retry rules.

## Telegram (Bot API)

Telegram works like iMessage once the person has pressed Start: no window, no cost, 4,096 characters a message (Trainee
sends at most 1,500 and splits longer text on purpose, one message a second to one chat). The bot is never told a phone
number, so a person reaches their account one of two ways: they text **connect telegram** where they already use Trainee
(or tap Connect Telegram in the app, `channel_link_telegram_start()`, once the app has the button) and open the one-time
link it sends; or, if their chat is on the allow list (`TRAINEE_ALLOWED_CONTACTS` entries like `telegram:<chat id>`) or
sign-up is open, pressing Start makes a new account.

1. In Telegram, message **@BotFather**: `/newbot`, a name (`Trainee`), a username ending in `bot`. BotFather shows the
   bot token **once**: keep it for the go-live prompt only, never paste it into a chat. Then `/setjoingroups` → your bot →
   **Disable** (Trainee reads private chats only).
2. Run go-live with `TELEGRAM_BOT_TOKEN` (hidden prompt), `TELEGRAM_BOT_USERNAME` (without `@`), and Enter for
   `TELEGRAM_WEBHOOK_SECRET` (say yes to see it once, then clear the screen).
3. Point Telegram at the webhook. In your own shell (`read -rs` keeps both values off the screen and out of history):
   ```bash
   read -rs TG_TOKEN; read -rs TG_SECRET
   curl -sS "https://api.telegram.org/bot${TG_TOKEN}/setWebhook" \
     --data-urlencode "url=https://<ref>.supabase.co/functions/v1/trainee-telegram" \
     --data-urlencode "secret_token=${TG_SECRET}" \
     --data-urlencode 'allowed_updates=["message","my_chat_member"]' \
     --data-urlencode "drop_pending_updates=true"
   unset TG_TOKEN TG_SECRET
   ```
   The answer is `{"ok":true,"result":true,"description":"Webhook was set"}`. Telegram then sends the secret back on every
   update in `X-Telegram-Bot-Api-Secret-Token`, and `trainee-telegram` refuses any update without it (403).
4. Check: re-run the smoke (step 6) with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` set; `getWebhookInfo` must
   show this project's URL and no `last_error_message`.
5. Try it: text **connect telegram** to Trainee on iMessage, open the link on the phone where you use Telegram, tap
   Start. Telegram answers "Telegram is linked to your Trainee account." Then text Telegram anything.

Not verified against Telegram's own pages (they did not load from the build environment): the field names
`link_preview_options` and `my_chat_member`, and the 403 wording for a blocked bot. The smoke and step 5 check them live.

## WhatsApp (Meta's Cloud API, directly)

Meta's rule makes one difference from iMessage that code cannot remove: Trainee may send free text only within 24 hours
of the person's last WhatsApp message. Outside that window, every message Trainee starts (alert, report, receipt,
approval card, mail status, follow-up) waits in the outbox, and the person gets one short template instead: "Trainee has
3 new update(s) for you. Reply to see them." Their reply opens the window, and everything waiting goes out, whole, before
the answer. One template per silence, and none at all until a template name is set. An approval card is not even put
into the thread while the window is closed (a waiting card could catch a "yes" meant for something else).

1. **Business**: in Meta Business Suite (business.facebook.com) use or create the business portfolio, and start
   **Business verification** (Settings → Security Center). Verification raises the messaging limit and lets the display
   name show.
2. **The app**: developers.facebook.com → My Apps → **Create app** → use case **Connect with customers through
   WhatsApp** (type Business) → attach the business portfolio. In the app, add the **WhatsApp** product; this creates or
   links the **WhatsApp Business Account** (WABA). Note the WABA ID shown on API Setup.
3. **The number**: WhatsApp Manager → Phone numbers → **Add phone number**: a number not in use on the WhatsApp app,
   verified by SMS or call, with the display name (`Trainee`, or the one Meta approves). Then app dashboard → WhatsApp →
   **API Setup**: copy the **Phone number ID** (a long number; not the phone number itself). That is
   `WHATSAPP_PHONE_NUMBER_ID`. If the number shows "pending registration", finish registration there (it asks you to set
   a six-digit two-step PIN; keep it to yourself, Trainee never needs it).
4. **The app secret**: app dashboard → App settings → **Basic** → App secret → Show. That is `WHATSAPP_APP_SECRET`; it
   checks the signature on every webhook.
5. **A permanent token**: Business settings → Users → **System users** → Add (role Admin) → **Assign assets**: the app
   (full control) and the WhatsApp account (full control) → **Generate new token** → the app, permissions
   `whatsapp_business_messaging` and `whatsapp_business_management`, expiry **Never**. Meta shows it once: it goes only
   into the go-live prompt as `WHATSAPP_TOKEN` (hidden), never into a chat, a file or a ticket.
6. **Run go-live** with those four values and Enter for `WHATSAPP_VERIFY_TOKEN` (say yes to see it once).
7. **The webhook**: app dashboard → WhatsApp → **Configuration** → Webhook → Edit: Callback URL
   `https://<ref>.supabase.co/functions/v1/trainee-whatsapp`, Verify token = your `WHATSAPP_VERIFY_TOKEN` → **Verify and
   save** (Meta calls it with a GET; `trainee-whatsapp` echoes the challenge only for the right token). Then **Webhook
   fields → Manage → subscribe to `messages`** (it carries the incoming messages and the status of what Trainee sent; a
   "failed" status for the window, 131047, puts that message back in the queue).
   If messages still do not arrive, subscribe the app to the WABA once (in your shell; `read -rs` keeps the token hidden):
   ```bash
   read -rs WA_TOKEN
   curl -sS -X POST "https://graph.facebook.com/v21.0/<WABA ID>/subscribed_apps" -H "Authorization: Bearer ${WA_TOKEN}"
   unset WA_TOKEN
   ```
8. **The template**: WhatsApp Manager → Account tools → **Message templates** → Create template. Category **Utility**,
   name `trainee_updates`, language **English (US)** (`en_US`), body exactly
   `Trainee has {{1}} new update(s) for you. Reply to see them.` with sample `3`; no header, footer or buttons. Submit.
   The definition is in `docs/launch/whatsapp-templates.json`. When Meta approves it, set the name (not a secret):
   `supabase secrets set --project-ref <ref> WHATSAPP_TEMPLATE_UPDATES=trainee_updates WHATSAPP_TEMPLATE_LANGUAGE=en_US`.
   Meta decides the category: if it approves the template as **Marketing**, per-user marketing limits apply (131049) and
   Trainee simply waits for the person's next message; nothing is lost. Meta charges for each template delivered
   outside the window (rate by country: Meta's pricing page); free text inside the window costs nothing.
9. **The limit**: set `WHATSAPP_DAILY_TEMPLATES` to your number's messaging limit (250 a day for a new account; it grows
   with verification and quality). Past it, messages wait for the person's next message.
10. **Try it** from a phone on the allow list (`TRAINEE_ALLOWED_CONTACTS` takes the number as `+1…`): text the business
    number. If that number already has Trainee on iMessage, nothing is merged: iMessage asks "Someone texted Trainee on
    WhatsApp from your number. Reply yes to link it.", and the link happens only on that yes.

Not verified against Meta's own pages (they did not load from the build environment): the signature header's exact
form, the business-scoped id fields (`user_id`, `from_user_id`, sending with `recipient`), whether 131047 comes back on
the send or only in a status (both are handled), and Graph API `v21.0` (set `WHATSAPP_GRAPH_VERSION` to the version your
app shows). Steps 7 and 10 check them live.

## Rollback

Nothing below drops data. The tables stay (the migrations are additive and nothing old reads them); deleting a table or
its rows is a separate decision of yours, never part of a rollback.

- **Stop every text now**: `supabase secrets unset LOOPMESSAGE_API_KEY TELEGRAM_BOT_TOKEN WHATSAPP_TOKEN --project-ref <ref>`
  (each channel then answers 503 NOT_WIRED and sends nothing; its messages wait in the outbox), and/or remove the webhook
  in LoopMessage, call Telegram's `deleteWebhook`, or unsubscribe `messages` in Meta's webhook settings. One channel
  alone: unset only its token.
- **Stop the schedules**: `psql "$SUPABASE_DB_URL" -c "select cron.unschedule(j) from unnest(array['trainee-deliver','trainee-career-proactive','trainee-career-ingest']) j"`.
  Re-running step 5 brings them back. Their Vault secrets (`trainee_*_secret`) can stay.
- **agent-chat back to the previous version**: `cd ~/trainee-rollback/agent-chat-<UTC> && supabase functions deploy agent-chat --project-ref <ref>`.
  If the download failed: `git checkout <previous commit>`, `node scripts/career/stage-career.cjs /tmp/rb/supabase/functions`,
  write `[functions.agent-chat]` / `verify_jwt = true` to `/tmp/rb/supabase/config.toml`, then
  `cd /tmp/rb && supabase functions deploy agent-chat --project-ref <ref>`.
- **The router brain back**: `supabase secrets unset CAREER_BRAIN --project-ref <ref>`.
- **Remove the new functions** (after unscheduling): `supabase functions delete <name> --project-ref <ref>` for
  `career-ingest`, `career-proactive`, `trainee-deliver`, `trainee-inbound`, `trainee-telegram`, `trainee-whatsapp`.
