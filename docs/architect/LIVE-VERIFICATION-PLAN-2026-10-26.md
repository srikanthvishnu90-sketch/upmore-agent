# Live verification plan, 2026-10-26

The owner's bar, in writing: every feature production-ready by October 30, every feature and outcome tested end to
end in real production. "The response and the real outcome both need to be right." Tests and merged code alone do not
count. The same day the owner raised the bar again ("be extremely strict... mimic genuine perfection"): every check
must be able to FAIL, every reply is checked against live state, and a NOT_RUN is not passed. This plan is how that is
measured: one suite that drives the real live channels as a test account and checks both the reply and the live state;
one live check for each BLOCKER and MAJOR of the launch-readiness audit (PR #192), so each fix is proven in production;
and seven checks only the owner can run, each with the SQL that proves it.

- Suite: `scripts/live/verify.ts` (Deno), the feature checks in `scripts/live/checks.ts`, the audit checks in
  `scripts/live/audit.ts`, the guards in `scripts/live/lib.ts`.
- Workflow: `.github/workflows/live-verify.yml`, environment `production`, only on the owner's push to `ci/live-verify`
  or a run he starts by hand. It has no schedule.
- **On hold (owner, 2026-10-26 14:14 CDT):** the launch is on hold. There are no deploys, no pushes to
  `release/production`, no Vercel sandbox use without his approval, and no run of this workflow against production.
  This PR builds and unit-tests the suite only, and nothing here has run against production. The day plan in section 5
  starts when he lifts the hold, and every Vercel step in it (the cloud runner) needs his approval first.
- Owner setup: `scripts/live/test-account.sql`. Owner checks: `scripts/live/owner-checks.sql`.
- Tests: `tests/architect/live-verify-checks.test.ts` and `tests/architect/live-verify-audit.test.ts` run every check
  against a real Postgres with the career schema, seeded first pass-shaped, then fail-shaped (or with the reply
  that should pass and the one that should not). A check that cannot fail is caught there. The first file also runs a
  whole suite against a product that answers HTTP 500 to everything. That run must exit 1, must PASS no check a reply
  decides, must report the erase checks NOT_RUN (an erase that did not run proves nothing), and must call nothing but
  the test account's doors.
- Mutation check: each guard was broken once and a test went red, 14/14 (section 7).

## 1. How a run works

1. **Preflight.** The run signs in as the test account, or uses `UPMORE_TEST_JWT` while that token still has more than
   10 minutes left. It starts only if three things hold: the JWT's user is on `@upmore.test`, that user is flagged
   `trainee_test_account` in `auth.users.raw_app_meta_data`, and the email matches `TRAINEE_VERIFY_EMAIL`. With any
   other account it stops (exit 2) before it sends a single request.
2. **State checks, read only.** Schema presence for each feature, the ingest and its lanes, the schedules, the run
   records, and the production-wide invariants: nothing reached an employer without `approval_hash = payload_hash`,
   and every finished application has a receipt that matches it.
3. **The chat scenario, as the test account.** Every turn goes to the live `agent-chat` endpoint. After each turn
   the suite asserts two things: the reply is the reply the database recorded for that `turn_key`, and the reply
   agrees with the rows the turn wrote.
4. **Waiting on scheduled outcomes.** Alerts and prepare-ahead run on a schedule, so the suite polls for them for up
   to `--wait-min` minutes (20 by default).
5. **Cleanup.** The product's own erase runs ("forget my career profile"), and the suite then checks that it
   actually erased.
6. **Safety checks.** The suite confirms that nothing was approved for the test account, that nothing it was sent
   reached a contact other than the test chat, and that every row in the run's threads belongs to the test account.

**Output.** Each check is tagged with its feature and gets `PASS`, `FAIL` or `NOT_RUN`, always with a reason. The run
writes `live-verify.json` and `live-verify.md` (the matrix), puts the matrix in the job summary, and keeps both as an
artifact for 30 days. The matrix leads with "N/total passed", and counts every FAIL and every NOT_RUN as not passed.
Exit codes: 0 only when every check PASSes; 1 on any FAIL or any NOT_RUN (`--allow-not-run` relaxes only the second);
2 when the run could not start. A production-wide invariant over zero rows (no application has reached an employer
yet) is NOT_RUN, not PASS: 0/0 proves nothing.

### Why it cannot write outside the test account (asserted in code, and tested)

| Lock | Where |
|---|---|
| Every SQL statement must be a single read. `assertReadOnlySql` refuses DML, DDL, `set`, `copy`, `call`, `do`, side-effect functions (`nextval`, `set_config`, `pg_advisory_*`, `dblink`, ...) and any `career_`/`channel_`/`agent_` function not on the read list | `lib.ts` |
| Then each statement runs inside `begin transaction read only`, so Postgres itself refuses a write | `lib.ts readOnlyText` (test: `nextval` sent through it is refused by Postgres) |
| HTTP allows only these: POST to `agent-chat` and `trainee-telegram`, the password sign-in, a CORS preflight to `agent-chat`, GET table reads through PostgREST (never `/rest/v1/rpc/`), the app page, and for this project only the Management API's function list and one count-only edge-log query; and the cloud runner's dispatch with a *wrong* secret and `{"want":0}`. Anything else throws, including PostgREST writes, the card-approve RPC, other functions, other projects and other hosts | `lib.ts guardedFetch` |
| The chat guard: the suite never says "yes" except to confirm its own resume, and never in a thread that has shown a card. It never says "send N" or "approve". As a result no card is ever answered, so no application job is ever created, and nothing reaches an employer | `lib.ts ChatGuard`; checked every run by `SAFETY.never_approved` |
| Telegram is posted only after the test chat is proven linked to the test account | `checks.ts telegramLinked` |
| Outreach contacts are `@example.test`. A draft addressed to anyone else FAILs | `checks.ts outreachDrafted` |

## 2. The matrix: 15 features and 2 paths × check × who runs it

"Auto" means the suite runs the check every time. "Owner" means it is a real-world effect, listed in section 4.

| Feature | Live channel driven | Check (id) | What must be true | Run by |
|---|---|---|---|---|
| F1 chat-to-apply | agent-chat: "find X jobs in Y", then "apply to N" | `F1.schema`, `F1.turn`, `F1.queued_matches_state` | The `k/m queued` line equals the new `career_apply_wanted` rows, each row is the asked posting, and each is open in `career_postings` | Auto |
| F2 Greenhouse submit binding | the cloud worker (no chat path) | `F2.approval_invariant`, `F2.real_greenhouse_submit` | No application in production reached an employer without its approval hash, and a real Greenhouse submit happened within 14 days | Auto + Owner O-6 |
| F3 prepare-ahead | the worker's daily rail, for the test account's watch | `F3.schema`, `F3.rail_ran`, `F3.test_account_prepared_and_carded` | A prepare-ahead day record exists in the last 26 h. The test account's prepared payload hashes to its `payload_hash`, and the card item carries the same hash | Auto (waits) |
| F4 resume rewrite | agent-chat: "tailor my resume for the T role at C" | `F4.turn`, `F4.tailored_for_posting`, `F4.rewrite_on`, `F4.metered` | Tailored for the named posting (never "null at null") with a document attached. "Reworded N" in the reply equals `meta.tailor_rewrite`. A cost row exists | Auto |
| F5 search + judge | agent-chat: "find X jobs in Y" | `F5.turn`, `F5.listed_postings_open`, `F5.judged_and_metered` | Every linked posting exists in `career_postings` and is open, and none comes from the snapshot. The list is judged, and the judge's call is metered | Auto |
| F6 ingest at scale | none (scheduled) | `F6.schema`, `F6.last_run_fresh`, `F6.index_size`, `F6.lanes_cover_directory`, `F6.schedule` | The newest lane run is at most 30 min old. At least 1,000 open postings, with new ones in the last 24 h. Every lane ran within the hour, and at least 90% of boards were read within the hour. Every lane job succeeded within 15 min | Auto |
| F7 alerts | agent-chat: "Watch for X roles in Y", then the schedule | `F7.schema`, `F7.watch_turn`, `F7.watch_saved`, `F7.career_proactive_runs_fresh`, `F7.channel_delivery_runs_fresh`, `F7.alerts_delivered`, `F7.alert_for_new_posting` | The `career_alert_prefs` row is on and holds the words. Both run records are fresh with no error. Alerts were delivered to real people in the last 24 h. An alert outbox row for the test account names an open matching posting | Auto (waits) + Owner O-4 |
| F8 inbox/follow-ups | agent-chat: "check my email now", "what follow-ups are due?" | `F8.schema`, `F8.inbox_reply_matches_state`, `F8.followups_reply_matches_state` | "I read your mail" if and only if a mail cursor moved. "None due" if and only if no drafted follow-up exists | Auto (honesty) + Owner O-2 |
| F9 account memory | agent-chat: a fact in thread A, "what do you know about me?" in thread B | `F9.schema`, `F9.fact_turn`, `F9.fact_used_in_new_thread`, `F9.fact_on_account` | Thread B names the facts. `fact_confirmed` events exist, and the account record holds memory | Auto |
| F10 networking outreach | agent-chat: CSV attachment, "who do I know at X", "email R at X about ..." | `F10.schema`, `F10.contacts_imported`, `F10.who_do_i_know`, `F10.draft_on_approval`, `F10.metered` | "imported 3/3". All 3 names are listed back. "Drafted k/m" equals the draft rows, each to `@example.test`, hash-bound, not approved and not sent. A cost row exists | Auto + Owner O-3 |
| F11 mock interviews | agent-chat: "mock me for the T role at C", then the answers | `F11.bound_to_posting`, `F11.mock_done_recorded` | The mock names the posting. A `mock_done` event is written, and its weak skills equal the debrief's | Auto + Owner O-5 |
| F12 offer benchmark | agent-chat: an offer in plain words | `F12.turn`, `F12.numbers_match_benchmarks` | Each median and n the benchmark data shows (DOL LCA, BLS OEWS, computed from the repo's dataset rows by the product's own `benchmarks()`) appears exactly in the reply | Auto |
| F13 staged brain | agent-chat: an advice question | `F13.turn`, `F13.answered_by_staged_brain`, `F13.metered` | `meta.brain = staged`, and a cost row with at least 1 call for that turn | Auto |
| F14 receipts | agent-chat: "show me my receipts" | `F14.schema`, `F14.receipt_reply_matches_state`, `F14.every_finished_job_has_matching_receipt` | The reply matches `career_apply_receipts`. Across production, every finished job has a receipt with the same state, payload hash and approval hash | Auto + Owner O-1(d) |
| F15 dashboard/approval card | the served app, and PostgREST as the test account | `F15.schema`, `F15.app_is_current_build`, `F15.dashboard_reads_own_rows` | The served `index.html` is this commit's build and carries `careerDash`. The dashboard's tables read through RLS show only the test account's rows. Card hash binding is checked by F3/E2E | Auto + Owner O-1(b) (the tap) |
| E2E chat-submit path | agent-chat: "apply me to this: <ATS link>" | `E2E.turn`, `E2E.link_queued`, `E2E.prepared_card_hash_bound`, `E2E.final_submit` | 1/1 queued for exactly that link. Prepared, hash-bound and on a card. The final send is left to the owner | Auto up to "queued + card hash bound"; Owner O-1 |
| Cloud sender (cloud runner) | `career-cloud-runner/dispatch` (wrong secret only) | `CLOUD.schema`, `CLOUD.door_refuses_wrong_secret`, `CLOUD.sent_only_approved` | Deployed, and its own handler refuses a wrong secret. Every cloud job that reached an employer in 7 days carries its approval hash, and none is stuck | Auto + Owner O-1 |
| Telegram channel | `trainee-telegram` webhook from the linked test chat | `TG.test_chat_linked`, `TG.webhook_answered`, `TG.turn_recorded` | The chat maps to the test account, HTTP 200, and the turn and its reply are recorded | Auto with the optional TG secrets; Owner O-1 (his own chat) |
| Preflight, erase, safety | — | `ACCOUNT.*` (4), `ERASE.*` (3), `SAFETY.*` (4, with `SAFETY.every_reply_recorded`: every reply of the run is the reply recorded for its turn) | Described in section 1 | Auto |

### 2b. The launch-readiness audit (PR #192): one live check per BLOCKER and MAJOR

Each check FAILs while its finding stands, so a PASS in production is the proof the fix landed. Thresholds this plan
sets (not the audit's) are marked "bar", for the owner to confirm.

| Finding | Check (id) | What must be true in production | Read today (19:03 UTC) |
|---|---|---|---|
| B1/SEC1 anon decrypts Vault | `AUDIT.B1.vault_read_not_public` | `exec_vault_read(text)` not executable by anon or authenticated (or gone) | anon cannot execute it: revoked after the audit's 17:45–18:40 read |
| SEC2 anon-callable definers | `AUDIT.SEC2.no_definer_callable_by_anon` | No SECURITY DEFINER function in `public` executable by anon | 0 |
| B2 no card for a phone-only person | `AUDIT.B2.phone_only_person_gets_card` | The test account (no extension, no computer) gets a prepared, hash-bound card from a chat link | — (needs a run) |
| B3/R3 Telegram sign-up | `AUDIT.B3.telegram_signup_creates_account` | At least one `tg:` contact with a real account, none pointing at a missing one | 0 `tg:` contacts |
| B4 no resume rule | `AUDIT.B4.no_application_without_resume` | No application without a resume hash, and a resume-required trigger on `career_apply_jobs` | no trigger |
| B5/O1 production is unknown | `AUDIT.B5.production_is_one_recorded_commit`, `AUDIT.O1.live_versions_match_ledger` | Every live function has a ledger row, all from one commit (the run's when it runs on trunk), and each platform version equals the ledger's | no ledger table |
| B6/Q1 answer quality | `AUDIT.B6.resume_on_file_answered`, `.career_goal_answered`, `.goal_postings_with_links`, `.stop_the_interview` | The audit's live failure phrasings get a plain answer (no catch-all, no internal code) that agrees with state (resume on file iff confirmed events exist; links all open postings) | — |
| B7 web not public | `AUDIT.B7.web_app_public_and_trainee`, `AUDIT.B7.agent_chat_cors_allows_app` | The app answers 200 without SSO, titled Trainee; agent-chat's CORS allows its origin | — (needs `TRAINEE_APP_URL`) |
| S2 erase leaves records | `AUDIT.S2.erase_covers_every_table` | After the erase, every `public` table with a `user_id` column holds 0 rows for the test account (and Storage none), except the 9 named tables that hold no content the person gave | — |
| S3 prompt injection into memory | `AUDIT.S3.posting_text_never_becomes_memory` | A pasted posting carrying an injected instruction saves nothing (`instruction_kept`, `career:standing`) and the reply does not follow it | — |
| S4 extension approvals client-attested | `AUDIT.S4.extension_approval_recorded_server_side` | Each extension application has a server-side `extension_approval` event for its payload hash (the fix's contract: that kind does not exist yet) | 0 extension jobs: NOT_RUN |
| R1 burst loses a text | `AUDIT.R1.two_quick_texts_both_answered` | Two turns sent at once on one thread both answer 200 and both are recorded | — |
| R2 crashed turns dropped | `AUDIT.R2.no_message_left_unanswered` | Every user message from 24 h to 5 min ago has a later reply in its thread | — |
| Q2 apply promises | `AUDIT.Q2.apply_reply_promises_only_what_happens` | If the apply reply promises preparation, a prepared row appears; otherwise it says plainly nothing will be prepared | — |
| Q3 jargon and catch-alls | `AUDIT.Q3.apply_for_me`, `.what_it_costs`, `.are_you_human`, `.rejection_answered_plainly`, `.linkedin_link_refused_plainly`, `.stated_name_remembered` | Plain answers; a LinkedIn link is refused by name and never queued; a name said in chat is known in a new thread | — |
| Q4 slow | `AUDIT.Q4.code_turn_latency` | Turns with no model call: p90 at most 3,000 ms (bar), from the run's own timings | — |
| X1 no invitations | `AUDIT.X1.waitlist_in_project` | The waitlist is in this project (`site_waitlist` > 0 rows) | 0 rows |
| X2 texting capacity | `AUDIT.X2.no_message_held_by_a_daily_cap` | No message held by a daily cap in 24 h (`channel_delivery_runs.capped`) | no delivery runs |
| X3 600 rows a turn | `AUDIT.X3.rows_read_per_turn` | Not measurable from the database: `pg_stat_statements` records a PostgREST read as one row (1,451 reads of `career_kb_postings` recorded as 1,451 rows). NOT_RUN until the fix records rows read per turn | NOT_RUN |
| X4 files in Postgres | `AUDIT.X4.no_files_in_postgres` | No `bytes_b64` column left in `public` | `channel_artifacts.bytes_b64` |
| X5 prepare throughput | `AUDIT.X5.every_queued_application_prepared_in_time` | Every application queued 24 h to 30 min ago was prepared within 30 min (bar) | none queued |
| X6 cloud sends silently dropped | `AUDIT.X6.cloud_sends_confirmed` | At most 20% (bar) of cloud submits older than 24 h still unconfirmed | none |
| X7 no spend cap | `AUDIT.X7.model_spend_within_cap` | Nobody over D-002's $1 this month in `agent_turn_costs` | — |
| O2 no alerts, legacy cron | `AUDIT.O2.legacy_cron_jobs_stopped`, `AUDIT.O2.error_tracking_and_alerts` | The 3 legacy finance jobs are not active; error tracking: NOT_RUN until the owner picks a tracker the check can read | all 3 active |
| SEC3 Gmail broken | `AUDIT.SEC3.gmail_connect_works`, `AUDIT.SEC3.gmail_oauth_callback_reachable` | A `google_career` grant with `gmail.readonly` exists; `gmail-oauth` is deployed with `verify_jwt` off | 0 grants |
| SEC4 secret in URL | `AUDIT.SEC4.inbound_secret_not_in_url` | No `trainee-inbound` request in 24 h carried `secret=` in its URL (a count-only edge-log query; no URL is returned) | — |
| SEC5 service key on the VM | `AUDIT.SEC5.no_service_key_on_prepare_vm` | Not visible to the database or the API: NOT_RUN; proven by B2's fix moving preparation to per-job tokens | NOT_RUN |
| SEC6 extension asks for every site | `AUDIT.SEC6.extension_asks_only_ats_hosts` | The commit's `extension/manifest.json` names hosts, not `<all_urls>` (the store copy is built from it) | `<all_urls>` |

### Counts

113 checks a run: 52 across F1–F15 (F1 3, F2 2, F3 3, F4 4, F5 3, F6 5, F7 7, F8 3, F9 4, F10 5, F11 2, F12 2, F13 3,
F14 3, F15 3), E2E 4, the cloud sender 3, Telegram 3, the audit 40, preflight 4, erase 3, safety 4. Counted from the
JSON of a whole run against a dead product (`tests/architect/live-verify-checks.test.ts`), one row per check id.

**Why no apply check uses a controlled form host.** No form host the owner controls is reachable from the production
cloud runner today. The engine's real-host submit is also off (`UPMORE_SCRIPT_SUBMIT_LIVE`). So the suite stops at
"queued + card hash bound", and the final send is the owner's real Ramp run (O-1). A run in the suite never creates an
application job.

**Not verifiable automatically, and why.** Each of these is a real effect a test account must not cause, or one only
the owner can grant:
- An employer receiving an application (O-1, O-6).
- A brand-new person signing up on Telegram (O-7): it creates a real account the suite must not create.
- Google granting mail access through OAuth consent (O-2).
- An email leaving a real Gmail account (O-3).
- A text arriving on a real phone (O-4).
- Judging whether mock questions are good for the posting (O-5).

## 3. What production looked like today (read-only SELECTs, 2026-10-26)

Expect most checks to FAIL on the first run. That is the point of running it.

- `career_postings` holds 0 rows, and `career_ingest_state.last_run_at` is null: the ingest has never run.
  `career_kb_postings` has 21,688 snapshot rows.
- `cron.job` has only `cancel-watcher-daily`, `plaid-sync-6h` and `upmore-proactive`. No Trainee schedule exists.
- `career_proactive_runs`, `channel_delivery_runs`, `career_outbox` and `career_apply_jobs` are all empty.
- These are absent: `career_ingest_runs`, `career_board_state`, `career_deploy_ledger`,
  `career_apply_message_cards` and `career_apply_receipts`. The migrations from the 2026-10-21/22/25/26 waves are not
  applied, and `career_host_commit` has no `memory` key.
- `agent_turn_costs`: the last row is from 2026-10-14.
- `user_oauth_connections`: 0 rows (no Gmail grant).
- `auth.users`: 4 `@upmore.test` users exist. None is the verification account yet.
- The audit's findings as read at 19:03 UTC are in the last column of section 2b. One changed since the audit: B1
  (anon can no longer execute `exec_vault_read`, and no SECURITY DEFINER function in `public` is anon-executable).

## 4. Owner-only real-world checks

Run each one, then run its block in `scripts/live/owner-checks.sql` with your email. "PASS" there names the rows; "in
the world" names what you see.

**O-1 Your Ramp application via Telegram (proves F1, F15's tap, E2E, the cloud sender and F14).**
1. Point Telegram at `trainee-telegram`: run `setWebhook` (TRAINEE-GO-LIVE.md, Telegram step 3), and check that
   `getWebhookInfo` shows the new URL.
2. In your own Telegram chat with the bot, send `apply me to this: <the Ramp Ashby posting link>`.
3. Answer the questions it asks in one text.
4. Say `show my applications`, read every answer on the card, and tap Approve (or say "yes" while the card is the
   last message).
5. Wait for the executor: the cloud runner, or your own computer.
6. Ask `did my Ramp application go through?`, then `show me the receipt for Ramp`.

SQL: O-1 (a)–(d). In the world: Ramp's confirmation email arrives, and the receipt's pictures match the page.

**O-2 Gmail connect (proves F8 read).**
1. In the app, choose Connect Gmail and allow read (and send, for O-3).
2. Set `CAREER_MAIL_TRACKING=on` on agent-chat and career-proactive.
3. In chat, say `I just connected my Gmail`, then `check my email now`.

SQL: O-2. In the world: the reply names your real recent employer mail (the Ramp confirmation from O-1) and nothing
invented.

**O-3 An outreach email to yourself (proves F10 send and F8 follow-up send).**
1. Set `CAREER_NETWORKING_DRAFT=on` on agent-chat, and `CAREER_OUTREACH_SEND=on` on career-proactive.
2. Paste the CSV row `First Name,Last Name,Email Address,Company` / `Vishnu,Selftest,<your other address>,Selftest Co`.
3. Say `email Vishnu at Selftest Co about testing Trainee outreach`, read the draft, then say `send 1`.

SQL: O-3. In the world: one email arrives, from your Gmail, with exactly the body that was shown.

**O-4 An alert you receive (proves F7 delivered).**
1. On your own account, say `Watch for <a role that posts often> roles in <your city>`.
2. Wait for the next ingest lane and alerts pass (5 minutes each).

SQL: O-4. In the world: the text arrives on your phone, and its link opens an open posting that matches.

**O-5 An interview mock (proves F11).**
1. Say `mock me for the Frontend Engineer Intern role at Ramp`.
2. Answer every question.
3. In a new thread, say `drill my weak spots`.

SQL: O-5. Judged by you: whether the questions are about that posting.

**O-6 A supervised Greenhouse submit (proves F2 on a real employer).**
1. Pick one real Greenhouse posting you want.
2. On the worker host, set `UPMORE_SCRIPT_SUBMIT_LIVE=1` for that one headed, supervised run.
3. Approve the card.
4. Watch the single POST go out.

SQL: O-6. In the world: the employer's confirmation page and email.

**O-7 A new person signs up on Telegram (proves B3).**
1. Add `telegram:<the new chat's id>` to `TRAINEE_ALLOWED_CONTACTS` (or open sign-up), from a Telegram account that has
   never used Trainee.
2. Press Start on the bot, then send `hi`.

SQL: `select c.contact, u.id is not null as has_account, u.created_at from channel_contacts c left join auth.users u on
u.id = c.user_id where c.contact = 'tg:<chat id>'`. PASS: `has_account` true, and the bot answered `hi`. Then
`AUDIT.B3.telegram_signup_creates_account` PASSes on every later run.

## 5. The plan to all PASS (day 0 is the day the owner lifts the hold; October 30 holds only if that is today)

The dependency order is: the schema, then the deploys, then the schedules, then the index filling (about 2.3 h for
the first full coverage), then the flags, then the suite, then the owner checks.

| Day | Who | What | The suite's checks it turns green |
|---|---|---|---|
| Day 0 | Agent | This PR: the suite, the workflow, the tests, this plan | — |
| Day 0 | Owner | Create the test account (`scripts/live/test-account.sql` steps 1–3), add the 4 new environment secrets, and add `ci/live-verify` and `trunk` to the environment's deployment branches | `ACCOUNT.test_account` |
| Day 1 | Owner | Merge, then `trainee-go-live.sh --sha <trunk sha> --dry-run`, then the real run. This applies every migration in its list (receipts, account memory, ingest runs, board state, min_fit, mail sent, want guard, cloud runner, message cards ...), deploys its seven functions, runs the three schedules plus the ingest lanes, and runs the smoke | all `*.schema`, `F6.*` after about 2.3 h, `F7.*_runs_fresh` |
| Day 1 | Owner | Turn the flags on for agent-chat: `CAREER_BRAIN=staged` (`--brain staged`), `CAREER_JUDGE=on`, `CAREER_TAILOR_REWRITE=on`, `CAREER_ACCOUNT_MEMORY=on` (only after its migration), `CAREER_NETWORKING_DRAFT=on`, `CAREER_MAIL_TRACKING=on`. Deploy the rebuilt web app (`index.html`). Push `ci/live-verify` | F4, F5, F9, F10, F12, F13, F14, F15; F1 and E2E up to "queued" |
| Day 2 | Owner | Worker host: `prepare-ahead.ts serve` with `CAREER_PREPARE_AHEAD_URL` and token on agent-chat, plus `prepare-ahead.ts daily` every 15 min with `CAREER_PREPARE_AHEAD=on`. Cloud runner (go-live does not deploy it): Vercel token, snapshot, deploy `career-cloud-runner` with `--no-verify-jwt`, its edge secrets and its pg_cron dispatch (`docs/launch/CLOUD-RUNNER.md`). Telegram `setWebhook` to `trainee-telegram`. Re-run the suite | `F3.*`, `E2E.prepared_card_hash_bound`, `F7.alert_for_new_posting`, `TG.*`, `CLOUD.door_refuses_wrong_secret`, `ACCOUNT.functions_deployed` |
| Day 2 | Agent | Read the matrix. Every FAIL becomes a fix order (file:line) or a flag the owner missed. Re-run until auto checks are all PASS | — |
| Day 3 | Owner | O-1 (Ramp through Telegram), O-2 (Gmail), O-4 (an alert) | `CLOUD.sent_only_approved`, `F7.alerts_delivered`, `F14.every_finished_job_has_matching_receipt` with n ≥ 1 |
| Day 3 | Owner | O-3 (outreach to yourself), O-5 (mock) | Owner rows |
| Day 4 | Owner | O-6 (a supervised Greenhouse submit), then `UPMORE_SCRIPT_SUBMIT_LIVE=1` for real. O-7 (a Telegram sign-up). Final suite run on trunk | `F2.real_greenhouse_submit`, `AUDIT.B3.*` |
| Days 1–4 | Fix agents and owner | The audit's fixes, each closed only when its check in section 2b PASSes live: B4's resume trigger, B3's Telegram account, B7's domain and CORS, S2's full erase, S3, R1, Q2's wording, X4's Storage move, O2's unscheduling, SEC3's `gmail-oauth` deploy, SEC4's header-only secret, SEC6's host list, B5's pipeline run | `AUDIT.*` |
| Day 4 | Agent | Final matrix: every auto check PASS and every owner check's SQL PASS. Anything still red is reported as a fraction with its reason | — |

**Risks to the date.**
- The first ingest coverage takes about 2.3 h on the measured plan, and it was not measured on Edge.
- Vercel sandbox captcha scores are unmeasured (#190), and a silent rejection shows only after 24 h.
- The real Greenhouse request shape is inferred (#184). O-6 is the first capture of it.
- Strict content-word rules in F4 may refuse most rewrites. `F4.rewrite_on` PASSes when the reply's count equals the
  turn's record, including 0, so the acceptance rate has to be read from the record, not from the matrix.
- Not every audit check can PASS by day 4. X1 (invitations), X2 (texting capacity), X5 (prepare throughput), X6
  (cloud confirmations), O2's error tracking, X3 and SEC5 need product work or a measurement that does not exist yet.
  They will show FAIL or NOT_RUN, and neither is a pass.

## 6. Running it by hand

```bash
SUPABASE_PROJECT_REF=<ref> SUPABASE_DB_URL='<session pooler URI>' \
TRAINEE_VERIFY_EMAIL=trainee-live-verify@upmore.test TRAINEE_VERIFY_PASSWORD=... SUPABASE_ANON_KEY=... \
TRAINEE_APP_URL=https://<app> deno run -A scripts/live/verify.ts --out live-verify-out --wait-min 20
```

Options: `--role "software engineer"` and `--place "New York"` set the search, watch and apply targets, and must be
a role that posts often. `--allow-not-run` exits 0 with NOT_RUNs left (they stay "not passed" in the matrix).

## 7. Evidence for this PR

- Tests: `live-verify-checks.test.ts` 8 tests (20 steps) and `live-verify-audit.test.ts` 3 tests (14 steps), run
  locally on Postgres 16 with the career schema: 11/11 pass. On the base (trunk `fe8405586`) both fail to load:
  `scripts/live/*` does not exist there.
- Mutation check, each guard broken once, then the named test run (`--filter`). 14/14 went red:
  - M1, code read-only guard (write words allowed);
  - M2, read-only transaction dropped;
  - M3, GET `/rest/v1/rpc/` allowed;
  - M4, cloud door with any secret;
  - M5, yes in a carded thread;
  - M6, test flag not required;
  - M7, erase checks run without an erase;
  - M8, a 0/0 invariant passes;
  - M9, a closed posting accepted in F5;
  - M10, catch-all detector off;
  - M11, B1 grant ignored;
  - M12, S2 residue ignored;
  - M13, NOT_RUN folded into exit 0;
  - M14, a schedule added back to the workflow.

  The first M13 attempt was not caught: the exit logic checked the same thing twice. It was simplified so each rule
  is one line, and then caught.
- Found by the fail-shaped seeds while building, and fixed:
  - `jsonb_agg(t)` over a subquery aliased `t` aggregated the column named `t`, not the row, which broke three audit
    checks. The alias is now `lv_row`.
  - `career_events` has no `extension_approval` kind. S4's fix must add it, so the test drops the kind check to stand
    in for that migration.
  - An empty erase PASSed on a dead product. The erase checks now NOT_RUN unless the erase turn ran.
- Not run here: the suite against production (by rule), and the read-only shaping queries after 19:05 UTC (the
  Supabase MCP answered "Bad Gateway").
