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
| `UPMORE_TEST_JWT` (optional) | a test user's JWT for the agent-chat "hi" check | nowhere |

Function secrets are project-wide in Supabase: every function sees every one.

## The steps and what each changes

1. **preflight**: tools, inputs, a clean tree, `deno check` of the five entry points. Changes nothing.
2. **migrations**: applies, in order and each once, every migration from the Trainee set on (the `MIGRATIONS` list in
   `scripts/launch/trainee-go-live.sh`; `tests/trainee-go-live.test.cjs` fails if a migration file from `20261019` on is
   missing from it). Today: `20261019000000_career_postings.sql`, `20261019010000_career_alerts.sql`,
   `20261019020000_channel_delivery.sql`, `20261019030000_channel_inbound.sql` (postings, alerts, the outbox, delivery
   and inbound), and the apply pipeline `20261020000000_career_apply_jobs.sql`, `20261020010000_career_apply_own_worker.sql`,
   `20261020020000_career_apply_receipts.sql`, `20261020030000_career_apply_cards.sql`,
   `20261020040000_career_apply_card_push.sql`, `20261020050000_career_apply_daily_limit.sql` (the approved-application
   queue, the person's own computer claiming its own applications, receipts, prepared applications and their card, the
   card pushed into the thread, the daily limit), and `20261020060000_career_apply_questions.sql` (the questions only the person can answer, asked once by text), `20261020070000_career_apply_questions_ai_policy.sql` (the employer's own words about AI help, kept with each written question so Trainee reads them before it drafts one, WO-030), `20261020110000_career_connector.sql` (the Connector's profiles, introductions and blocks; nothing is proposed until 500 people opt in). Each runs in one transaction with its row in
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
   `career-ingest`, `career-proactive`, `trainee-deliver`, `trainee-inbound` with `--no-verify-jwt` (pg_cron and
   LoopMessage send no JWT; each function checks its own secret).
5. **schedules**: runs `schedule-career-ingest.sql` (every 5 min), `schedule-career-proactive.sql` (every 5 min) and
   `schedule-trainee-deliver.sql` (every minute), each with its secret passed by env as the script's header says. Each
   stores the secret in Vault and replaces its pg_cron job. **From here texts go out** to people with a linked contact.
6. **smoke**: `node scripts/launch/trainee-smoke.cjs`: each function refuses a wrong secret and answers the right one
   (503 `NOT_WIRED` or "not configured" is a WARN, never a pass), agent-chat refuses no JWT and answers "hi" for the test
   user, the three pg_cron jobs fired and each run record (`career_ingest_state.last_run_at`, `career_proactive_runs`,
   `channel_delivery_runs`) has a fresh row without an error. The right-secret calls are one extra run of each
   function (an ingest pass, an alerts pass, a delivery pass); the inbound one gets an empty body and runs nothing.
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

## Rollback

Nothing below drops data. The tables stay (the migrations are additive and nothing old reads them); deleting a table or
its rows is a separate decision of yours, never part of a rollback.

- **Stop every text now**: `supabase secrets unset LOOPMESSAGE_API_KEY --project-ref <ref>` (trainee-deliver and
  trainee-inbound answer 503 NOT_WIRED and send nothing), and/or remove the webhook in LoopMessage.
- **Stop the schedules**: `psql "$SUPABASE_DB_URL" -c "select cron.unschedule(j) from unnest(array['trainee-deliver','trainee-career-proactive','trainee-career-ingest']) j"`.
  Re-running step 5 brings them back. Their Vault secrets (`trainee_*_secret`) can stay.
- **agent-chat back to the previous version**: `cd ~/trainee-rollback/agent-chat-<UTC> && supabase functions deploy agent-chat --project-ref <ref>`.
  If the download failed: `git checkout <previous commit>`, `node scripts/career/stage-career.cjs /tmp/rb/supabase/functions`,
  write `[functions.agent-chat]` / `verify_jwt = true` to `/tmp/rb/supabase/config.toml`, then
  `cd /tmp/rb && supabase functions deploy agent-chat --project-ref <ref>`.
- **The router brain back**: `supabase secrets unset CAREER_BRAIN --project-ref <ref>`.
- **Remove the new functions** (after unscheduling): `supabase functions delete <name> --project-ref <ref>` for
  `career-ingest`, `career-proactive`, `trainee-deliver`, `trainee-inbound`.
