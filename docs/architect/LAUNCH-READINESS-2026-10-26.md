# Trainee launch readiness, 2026-10-26 (independent audit)

**Verdict: NO-GO.** Seven BLOCKERs, listed in rank order below. One of them, B1, was open on production when this was
written and had to be closed that day, whatever happens to the launch. Its grants have since been revoked live (see B1's
status line); the credentials it exposed are not yet rotated.

**Snapshot.** Every dated or present-tense statement in this document is a snapshot of trunk at `fe8405586` and of the
live project as read on 2026-10-26 between 17:45 and 18:40 UTC. Nothing was re-checked after that except where a status
line says so.

## What was audited and how

- **The bar.** In the owner's words: "launch readiness is a bar in comparison to Instinct, Claude and other high-end agents".
  The owner's quality bar for the brain is D-030: 95% on the held-out set, on the build that is live.
- **Trunk.** Commit `fe8405586`, 2026-10-26 17:50 UTC. It holds:
  - F1 to F15;
  - FEATURE E2E (#186);
  - the deploy pipeline (#187);
  - the CI split (#189);
  - the cloud runner (#190).

  The audit started at `dad74ef86`. #187, #189 and #190 merged while it was running, and I read them again on top.
  The last trunk CI run that finished is 40361667130 at `dad74ef86`, and all four jobs passed. The CI run for `fe8405586`
  was still queued when I wrote this.
- **Live.** Supabase project `mrwngntwmnaqrqhupvlt`, read between 17:45 and 18:40 UTC.
- **What I ran.** I ran SELECT statements only. I also read the security advisors and the edge and function logs, and read
  the source of the deployed functions where the API allowed it. No secret value was read, and nothing was deployed,
  migrated, sent or changed.
- **Probes.** I drove trunk's router with real phrasings through the same `CareerHost` the handler falls through to. I
  called trunk's apply turn directly under Deno. Both probe scripts are throwaway files outside the repo.
- **Labels.** Each claim says how I know it:
  - **[code]**: read in the source at the file and line named;
  - **[live]**: read from the production database or its logs;
  - **[run]**: executed here, with its output;
  - **[repo-doc]**: taken from a document in the repository and not re-verified;
  - **[inferred]**: reasoned from code and outside sources, but never executed or observed failing.

## Scores

| # | Dimension | Score | Why, in one line |
|---|---|---|---|
| 1 | Core journey, end to end | **1 / 5** | Every step exists in code and in tests. But no person can finish the journey on any channel: live, nothing past chat is deployed; on trunk, a phone-only person never gets a card, and Telegram sign-up fails. |
| 2 | Safety and policy | **2 / 5** | Approvals bound to the payload hash and the rule against invented facts are well built. But the owner's resume rule is not enforced, the erase misses records about applications, and prompt injection can reach saved memory. |
| 3 | Reliability | **3 / 5** | Idempotency, single-drive and outbox design are good. Two texts sent close together lose one of them, a turn that crashes is never retried, and the most-used sign-up path has never run against real Auth. |
| 4 | Quality versus top agents | **1 / 5** | What people talk to is a regex router that scores 60.5%. The brain scores 89.5–94.7% on an unsealed set of 38 items and is switched off. Many replies are canned or leak internal jargon. |
| 5 | Scale (98k waitlist, then 1M) | **1 / 5** | Sign-up is an allow-list kept in an environment variable. LoopMessage caps at 300 or 1,000 contacts a day. Every turn reads 600 rows. Screenshots are stored inside Postgres. Preparation runs one at a time on one VM, and there is no cap on model spend. |
| 6 | Operability | **2 / 5** | The go-live script and runbook are good. But production runs a build with no record of its commit, the deploy ledger does not exist live, there are no alerts and no error tracking, and legacy cron jobs are still firing. |
| 7 | Security | **1 / 5** | At audit time the public anon key could read Vault secrets on the production database (B1; grants since revoked, credentials not yet rotated). Webhook authentication and the grants on career functions are otherwise sound. |

## Ranked BLOCKERs

### B1. Secret-reading database functions were executable with the public anon key [live]

- **Status (2026-10-26).** The anon and authenticated EXECUTE grants were revoked live on 2026-10-26 and verified at 0
  anon-executable SECURITY DEFINER functions. The matching repo migration is #197. The two exposed credentials are not
  yet rotated; the owner holds them.
- **Category.** SECURITY DEFINER functions executable by `anon` and `authenticated` (Supabase security advisor lint 0028),
  14 functions in all. One of them returns decrypted Vault secrets without checking the caller; another lets any caller
  overwrite a stored secret; the rest are legacy finance and referral functions plus five trigger functions.
- **Severity.** BLOCKER. This is the same database that will hold every Trainee user's resume, answers and screenshots.
- **Cause.** Production had drifted from the repo, which revokes the grant on the secret-reading function.
- **Details.** Function names, endpoints, key locations and reproduction steps: details withheld until credentials are rotated (owner holds them).
- **Fix:**
  1. One migration that revokes EXECUTE from `public, anon, authenticated` on every affected function, and grants
     `service_role` only where an edge function needs it (done live; repo migration #197).
  2. Rotate the two exposed credentials (owner).
  3. Retire the legacy finance functions.
  4. Add a live check, in `scripts/launch/verify-security-live.cjs` or the gate, that fails on any SECURITY DEFINER function
     where `has_function_privilege('anon', oid, 'EXECUTE')` is true.

### B2. A person with only a phone never gets a card, so nothing can be submitted for them [code, live]

The card only lists `career_apply_prepared` rows (`supabase/functions/_shared/career_apply_cards.ts:259-264`). Those rows
come only from a browser dry run, and none of the three browser paths reaches a phone-only person.

- **The paths that exist:**
  - the extension, through `career_apply_prepare_own`;
  - the desktop runner;
  - `workers/career-browser/prepare-ahead.ts` on a VM. `career-proactive/index.ts:70-72` says an edge function cannot
    prepare.
- **The prepare worker is not deployable as shipped:**
  - go-live does not deploy it (`scripts/launch/trainee-go-live.sh:243-250` lists DEPLOY_FNS);
  - nothing in `docs/` says how to host it or how to set `CAREER_PREPARE_AHEAD_URL`;
  - it holds the service-role key (`prepare-ahead.ts:24-27`);
  - it runs every request one after another (`:314`).
- **The cloud runner (#190) does not close the gap:**
  - go-live does not deploy it;
  - each portal family needs 3 hand submissions confirmed by email, and that cannot happen while Gmail connect is broken
    (M1);
  - the card-cloud bridge that the authorization needs (`20261024130000`, not applied live) allows one enrolled person at
    a time and 15 cloud sends a day (`docs/launch/CLOUD-RUNNER.md`, "What the database still limits today");
  - `career_cloud_settings` has 0 rows live, so cloud apply is off.
- **Meanwhile the chat promises preparation** (Q2).
- **Fix:**
  1. Run preparation on the cloud runner, with per-job tokens instead of the service key, and deploy it from go-live.
  2. Open the gate for each family with the owner's own hand submissions.
  3. Lift the one-enrollment limit.
  4. Until then, the apply reply must say plainly that nothing will be prepared without the extension on a computer.

### B3. A new Telegram user likely cannot get an account [inferred]

- **The call.** `supabase/functions/trainee-inbound/store.ts:39-42` creates the account for a `tg:` contact with
  `auth.admin.createUser({ user_metadata })`, which has neither an email nor a phone. The code marks this "UNKNOWN".
- **Why it would fail (inferred, not run).** I expect Supabase Auth's admin create to reject a user with neither an email
  nor a phone. This was never executed here (see "Not verified"), and the issue first cited for it,
  [supabase/auth#1577](https://github.com/supabase/auth/issues/1577), is about the provider field, so it does not settle
  the question. One smoke run would.
- **It has never run** [live]. Live, 0 of the 54 users have neither field, there are 0 `trainee_channel` users and 0 `channel_contacts`
  rows.
- **What the person sees.** Every first Telegram message would end in "I couldn't answer that just now"
  (`_shared/channel_inbound.ts:20, 228-231`).
- **No second try.** The message is claimed before the turn runs (`:109`), so it is never retried.
- **The in-progress Telegram work** (`feat/telegram-e2e-20261026`, uncommitted) does not touch this.
- **Fix:**
  1. Create the account with a synthetic address that cannot receive mail, bound to the chat id, or use anonymous sign-in
     and link it later.
  2. Add a go-live smoke step that creates and deletes one user shaped like a Telegram contact.

### B4. The owner's rule "never submit applications without a real resume" is not enforced on trunk [code]

- **The extension submits without a resume:**
  - it builds a payload with `resume_sha256: null` (`extension/src/apply_core.ts:341-342`);
  - its review card shows "Resume: none attached" (`:425`);
  - it stops only when the form itself has a file field (`:839`, `:934`).
- **The database accepts it.** `career_apply_extension_begin_own` and `career_apply_enqueue` both take that payload.
- **The chat queues without one.** With the server prepare off, which is how go-live leaves it, the apply turn queues
  postings when no confirmed resume is on file (`_shared/career_apply_chat.ts:243-246`,
  `_shared/career_apply_from_chat.ts:105-108`).
- **A fix exists but is not on trunk.** It sits uncommitted in another agent's worktree:
  `20261026210016_career_resume_required.sql`, with triggers on `career_apply_jobs`, `_prepared` and `_cards`, plus
  matching checks in `approve-first.ts` and the cloud worker. It is not on trunk and not live.
- **Fix:** land it, with fail-first tests on every submit path: extension begin, card answer, cloud claim, and the
  desktop runner.

### B5. Production is not trunk, and nobody can say what it is [live]

- **The running build is unrecorded:**
  - agent-chat is v251, and `get_edge_function` errors on it, so its source cannot be read;
  - `career_deploy_ledger` does not exist live;
  - the last recorded production deploy was itself "unrecorded" (commit `518e31e73`, the v249 reconciliation).
- **The schema is half there.** 33 of go-live's 65 migrations are present; I evaluated each `MIGRATION_MARK` live, and the 32
  missing ones are listed below.
- **Trunk's handler would break on it.** trunk's agent-chat calls 11 RPCs and 5 tables that do not exist live. Two
  examples: `career_apply_pace_state`, which every apply ask reads, and `career_apply_receipts`.
- **Most functions are not deployed.** Of the 8 functions go-live deploys, only agent-chat exists live.
- **The schedules are not there.** No career cron job exists; the 3 jobs that do are legacy finance jobs.
- **A privacy fix cannot be confirmed live.** The cross-profile contamination fix (PR #90) passes 10/10 on trunk
  (`tests/correction-authority-privacy.test.cjs`, [run]), but there is no way to tell whether v251 contains it.
- **Fix:**
  1. Ship one trunk sha through #187's pipeline, after the live-shaped migration rehearsal, and run `--verify`.
  2. Run the core journey on production once per channel with a real application by the owner, and keep the transcript.

### B6. Answer quality is far below the owner's bar [run, live]

- **What people get.** The default brain, live and on trunk, is the regex router, and it scored 23 of 38 (60.5%) in brain-eval run
  40371458562 today. Earlier runs scored 39.5–44.7%.
- **The brain is switched off.** `AGENT_BRAIN_RELEASED = false` (`agent-chat/career_brain.ts:26`).
- **The brain is below the bar anyway:**
  - its five passes on trunk `a56aba2` scored 34, 34, 34, 36 and 35 of 38 (89.5–94.7%, mean 91.1%);
  - no pass reached 95%;
  - Instinct, the second judge D-030 requires, did not score this run;
  - the set is not sealed: the builder wrote all 38 items and saw per-item results for 33
    (`evals/career/heldout-touched.json`).
- **Live failures.** Live transcripts from 2026-10-20 to 2026-10-23 answer these with "I didn't catch that":
  - "do you have my resume on file?"
  - "what's my career goal?"
  - "show me real job postings that match my goal — with the links"
  - "stop the interview"
- **Fix:**
  1. Build a sealed set of 200 or more multi-turn items, written and held by someone who is not the builder, using phrasing
     real people type on each channel.
  2. Release the staged brain only when it reaches 95% on that set with both judges.
  3. Clear the canned and jargon replies (Q3).

### B7. The web app cannot be launched to the public [code, live]

- **It is still the Upmore app:**
  - `index.html` is titled "Upmore" and mentions "Upmore" 9,306 times against 31 for "Trainee";
  - it is a single 8.1 MB HTML file.
- **Nobody outside can reach it.** It is served only on `*.vercel.app` domains, with Vercel SSO protection on every domain
  that is not custom. Neither the `upmore` nor the `trainee` Vercel project has a custom domain.
- **The browser would block its calls.** agent-chat's CORS allows only two upmore origins and localhost
  (`agent-chat/_shared/chat_cors.ts:2-9`).
- **Approval on the web is incomplete:**
  - F15's approval cards render only for a test account or for cards eligible for the cloud;
  - there is no approve for a single item (PR #171, "Not done");
  - the `career_apply_message_card_*` RPCs it calls do not exist live.
- **Fix:**
  1. Put a Trainee production domain in front of it, without SSO, and add that origin to CORS.
  2. Finish the rename (D-005).
  3. Add an approve RPC for each item.
  4. Apply the migrations.

Launching on Telegram alone and saying so is also acceptable.

## What must change for GO

1. **B1.** The anon and authenticated grants were revoked live on 2026-10-26; land the repo migration (#197), rotate the
   two exposed credentials, then add the live grant check.
2. **B4.** Land the resume rule on every submit path, with fail-first tests.
3. **B3, plus M6.** Fix Telegram account creation and read the files people send.
4. **B2.** Make preparation and submission real for a person with only a phone, or launch only to people with the
   extension and say so in the product.
5. **B5.** Ship one trunk sha through the pipeline, with every migration, the ledger and `--verify`. Then run the journey
   live on each channel and attach the transcripts to this document.
6. **B6.** Clear the bar on a sealed, larger set before the staged brain goes live.
7. **B7.** Give the web a public domain, CORS, the rename and per-item approval, or keep the web out of the launch.

Before growing past an invite cohort of about 100, fix M1, M2, M3, M7, M8, M9, M10, M13 and M14.

---

## 1. Core journey, end to end (1/5)

The table follows each step as trunk would run it after `trainee-go-live.sh`, and compares that with what is live today.

| Step | Telegram on trunk, after go-live | Web on trunk | Live today |
|---|---|---|---|
| Sign up | **Fails.** The account has no email or phone (B3). Sign-up is closed unless the contact is in `TRAINEE_ALLOWED_CONTACTS` (`channel_inbound.ts:73-82`). | Supabase Auth in the Upmore app, which only the team can reach (B7). | `telegram-inbound` v10 is a test bridge that maps every sender to `CHANNEL_TEST_USER_ID`. `trainee-telegram` is not deployed. |
| Resume upload and confirm | A file gets "I can't open files sent here yet" (`channel_inbound.ts:32`, `telegram.ts:53`). A pasted resume with section headings becomes 6 drafts, and "yes, that's my resume" confirms them with evidence (`career_router_evidence.ts`). Without headings, or with "looks right", it gets the catch-all [run]. | Text only; PDFs are not parsed (PR #171). | The router does the same. 0 OAuth grants and 0 career events are recorded. |
| Find jobs | Ranked by fit over `career_postings` once ingest runs (F5, F6); otherwise the KB snapshot. | Same. | `career_postings` has 0 rows. Search runs over the frozen 21,688-row KB, and the router says "today it holds no roles at all" when its 600-row window misses [run]. |
| Apply by link | A Greenhouse, Lever or Ashby link is read from the board's API and queued (`career_apply_chat.ts:473-488`). LinkedIn and Indeed fall to the router's "BOARD_NOT_WIRED" text (Q3). | Same turn. | Never queued: `career_apply_wanted` and `career_apply_jobs` have 0 rows. |
| Card | **Never appears**, because nothing prepares it (B2). | The extension prepares it on a computer. The extension is not published, and its page is behind SSO. | 3 prepared rows and 1 card exist (test data). |
| Approve | A text yes counts only as a Telegram reply to the card message, within 10 minutes (`career_apply_cards.ts:174-222`). There are no inline buttons on this path. | Tap in the extension, or tap the chat card in the app. | Not reachable. |
| Submit | Extension or desktop runner only. The cloud runner is not deployed and is gated (B2). | Extension. | 0 submissions ever. |
| Confirmation | The engine reads the employer's page. Email confirmation needs Gmail, which is broken (M1). | Same. | 0 mail events. |
| Read-back | `applicationsTurn`, `standingTurn` and `receiptTurn` read the queue, the mail and the receipts. They need migrations missing live. | Same, plus the F15 tracker. | Not reachable. |

### Live versus trunk

**The schema.** 33 of the 65 migrations in go-live's list are present live. These 32 are missing:

- `20261020110000_career_connector`
- `20261020130000_career_resume_tailoring`
- `20261021020000_career_voice_mock`
- `20261021030000_career_hired_backgrounds`
- `20261021090000_career_mail_erase`
- `20261021100000_career_proactive_last_word`
- `20261021110000_career_board_state`
- `20261021130000_career_mail_model_calls`
- `20261021220430_career_apply_message_cards`
- `20261022110000_career_postings_pay`
- `20261022120000_career_control_state`
- `20261022120500_career_deploy_ledger`
- `20261023100000_career_events_apply_queued`
- `20261024130000_career_apply_card_cloud_bridge`
- `20261024140000_career_batch_approve_exclude`
- `20261025100000_career_apply_one_ledger` through `20261025180000_career_outbox_card_id` (all 9)
- `20261026060006_career_more_providers`
- `20261026060106_career_ingest_runs`
- `20261026070007_career_alert_min_fit`
- `20261026080008_career_mail_drafts_sent`
- `20261026090009_career_account_memory`
- `20261026100000_career_apply_cloud_runner`
- `20261026100001_career_apply_want_guard`
- `20261026140000_career_apply_receipt_store`

`supabase_migrations.schema_migrations` records only 3 rows, and `upmore_migration_ledger` records 74. The rest were
applied by hand. Only the live marks tell the truth.

**What trunk's agent-chat needs that is not live.**

- RPCs:
  - `career_alerts_sent_since`
  - `career_apply_message_card_read_own`
  - `career_apply_pace_set`
  - `career_apply_pace_state`
  - `career_apply_profile_for`
  - `career_apply_question_drafts_as`
  - `career_mail_model_claim`
  - `career_pdl_credits_month`
  - `career_quiet_users`
  - `career_user_quiet`
  - `career_voice_create`
- Tables:
  - `career_apply_prepare_attempts`
  - `career_apply_receipt_files`
  - `career_apply_receipts`
  - `career_hired_cache`
  - `career_pdl_calls`

**Functions** [live]:

- **Live today.** 25 functions are deployed. 16 of them are legacy finance functions that are still ACTIVE.
  `imessage-inbound` (v37) has no source on trunk.
- **Not deployed.** Go-live deploys these 8, and none exist live except agent-chat:
  - `agent-chat`
  - `career-ingest`
  - `career-proactive`
  - `trainee-deliver`
  - `trainee-inbound`
  - `career-voice`
  - `trainee-telegram`
  - `trainee-whatsapp`
- **Called by the product, but not deployed by go-live:**
  - `gmail-oauth`: live is the finance version, v26;
  - `extension-sync`;
  - `career-email-code`;
  - `career-essay-draft`;
  - `career-cloud-runner`, which has manual steps;
  - `delete-account`.

  Open PR #139 ("Go-live deploys every function the product calls") has been open since 2026-10-21.

**verify_jwt** [live]:

| verify_jwt | Functions |
|---|---|
| off | `news-feed`, `plaid-sync`, `imessage-inbound`, `broker-oauth-callback`, `model-health`, `agent-proactive`, `site-signup`, `site-careers`, `telegram-inbound`, `whatsapp-inbound` |
| on | every other function |
| on, and wrong | `gmail-oauth` (M1) and `stripe-webhook`. Neither caller sends a JWT. |

**Environment variables each function reads** [code], from the static import graph on trunk:

- **agent-chat:**
  - Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
  - Models: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_ROUTER_MODEL`, `OPENAI_REASONING_EFFORT`, `MODEL_PROVIDER`,
    `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_ROUTER_MODEL`.
  - Switches: `CAREER_MODEL`, `CAREER_BRAIN`, `CAREER_BRAIN_ROUTER_INTENTS`, `CAREER_ACCOUNT_MEMORY`, `CAREER_APPLY_LINK`,
    `CAREER_BATCH_EXECUTOR`, `CAREER_EMAIL_SEND`, `CAREER_JUDGE`, `CAREER_JUDGE_N`, `CAREER_MAIL_TRACKING`,
    `CAREER_MOCK_JUDGE`, `CAREER_NETWORKING_DRAFT`, `CAREER_PDL`, `CAREER_PREPARE_AHEAD_URL`, `CAREER_PREPARE_AHEAD_TOKEN`,
    `CAREER_TAILOR_REWRITE`, `CAREER_VOICE`.
  - Services: `CHANNEL_ARTIFACT_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `HUNTER_API_KEY`,
    `INGEST_CONTACT_EMAIL`, `PDL_API_KEY`, `PDL_MONTHLY_CREDITS`, `PDL_SEARCH_SIZE`, `TWILIO_AUTH_TOKEN`,
    `UPMORE_CAREER_WORKER_URL`, `UPMORE_CAREER_WORKER_SECRET`, `UPMORE_APP_URL`.
- **career-ingest:** `CAREER_INGEST_SECRET`, `INGEST_CONCURRENCY`, `INGEST_CONTACT_EMAIL`, `INGEST_EVERY_MIN`, `INGEST_LANES`,
  `INGEST_MAX_BOARDS`, `INGEST_POSTING_BUDGET`, `INGEST_WINDOW_HOURS`, `INGEST_WINDOW_MIN`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`.
- **career-proactive:** `CAREER_PROACTIVE_SECRET`, `CAREER_BRIEF_DIGEST`, `CAREER_MAIL_MODEL`, `CAREER_MAIL_TRACKING`,
  `CAREER_MOCK_JUDGE`, `CAREER_MODEL`, `CAREER_OUTREACH_SEND`, `CAREER_PREPARE_AHEAD`, `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, the model variables above, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **trainee-deliver:** `TRAINEE_DELIVER_SECRET`, `TRAINEE_INBOUND_SECRET`, `LOOPMESSAGE_API_KEY`, `LOOPMESSAGE_DAILY_CONTACTS`,
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `WHATSAPP_APP_SECRET`, `WHATSAPP_DAILY_TEMPLATES`,
  `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_LANGUAGE`, `WHATSAPP_TEMPLATE_UPDATES`,
  `WHATSAPP_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **trainee-inbound, trainee-telegram and trainee-whatsapp:** the trainee-deliver set, minus `TRAINEE_DELIVER_SECRET`, plus
  `TRAINEE_ALLOWED_CONTACTS`, `TRAINEE_SIGNUP` and `TELEGRAM_BOT_USERNAME`.
- **career-voice:** `CAREER_VOICE_MODEL`, `CAREER_MOCK_JUDGE`, `CAREER_MODEL`, `TRAINEE_DELIVER_SECRET`,
  `LOOPMESSAGE_API_KEY`, `LOOPMESSAGE_DAILY_CONTACTS`, the model variables, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **career-cloud-runner:** `CLOUD_BRIDGE_URL`, `CLOUD_DISPATCH_SECRET`, `CLOUD_RUNNER_ENABLED`, `CLOUD_RUNNER_SECRET`,
  `CLOUD_SANDBOX_REGION`, `CLOUD_SANDBOX_SNAPSHOT_ID`, `CLOUD_SANDBOX_VCPUS`, `CLOUD_MAX_CONCURRENT`, `CLOUD_MAX_PER_PORTAL`,
  `CLOUD_MAX_STARTS_PER_TICK`, `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`.
  When the limits are unset, the code defaults are 20, 8 and 50 (`career-cloud-runner/index.ts:46`). The runbook says to
  start at 5, 2 and 5.
- **gmail-oauth:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `OAUTH_STATE_SECRET`, `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Live test bridges.**
  - telegram-inbound: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CHANNEL_TEST_USER_ID`, `CHANNEL_APPROVAL_TTL_MIN`,
    `CHANNEL_ARTIFACT_SECRET`, `CHANNEL_UNKNOWN_REPLY`, `TWILIO_AUTH_TOKEN`.
  - imessage-inbound: `IMESSAGE_WEBHOOK_SECRET`, `LOOPMESSAGE_RUWE_API_KEY`, `LOOPMESSAGE_UPMORE_API_KEY`.

Which of these are actually set on the project cannot be read with the tools available here. The owner can check with
`supabase secrets list`.

## 2. Safety and policy (2/5)

### Built well

- **Approvals are bound to the payload hash** [code]:
  - each card item is bound by its own payload hash and the card is used once (`career_apply_card_answer_for`);
  - a text yes counts only as a direct reply, within 10 minutes (D-031);
  - the outreach drafts table checks that the approved text is the exact text (`career_outreach_approved_is_exact`);
  - the send claim holds advisory locks and enforces the recipient cap and the daily cap;
  - an application is driven once, ever. `attempts = 1`, a lease that runs out marks it `unknown_outcome`, and it is never
    re-sent.
- **No invented facts (D-007)** [code]:
  - the fact tools take only the person's own words (`factRefusal`);
  - confirming a fact needs a plain yes to a fact that was shown (`confirmationRefusal`);
  - a resume entry is stamped only if it was shown to the person and traced to their upload (`career_router_evidence.ts`).
- **No LinkedIn or Indeed, no captcha solving** [code]:
  - LinkedIn and Indeed are refused at the queue (`career_apply_want.ts:20`);
  - the engine works from a host allow-list (`scripts/apply.ts:48`);
  - there is no captcha-solving or stealth library anywhere;
  - a detected check ends as `needs_user`.
- **Isolation between people** [live]:
  - RLS is on for every `public` table;
  - every `career_*` SECURITY DEFINER function is either service-role only or works on the caller's own rows, and each sets
    `search_path`;
  - `career_host_load` and `career_host_commit` are executable by `service_role` only.

### Findings

- **S1 (BLOCKER, B4).** The confirmed-resume rule is not enforced.
- **S2 (MAJOR). The erase leaves records behind** [code, live]. "Forget everything" deletes events, interviews, digest
  preferences, watch state, outreach, mail rows, cloud rows and tailored resumes. It keeps:
  - `career_apply_jobs`, `_prepared`, `_questions`, `_wanted` and `_cards`. These hold the answers and the resume hash.
  - `career_apply_receipts` and `career_apply_receipt_files`, which hold screenshots of filled forms;
  - `channel_artifacts`.
  - `delete-account` cascades through `profiles` and `auth.users`, but `extension_submission_reports` has no foreign key and
    survives: it holds the employer, `answers_submitted` and `tracker_record`.
  - `imessage_outbox` (contact and text) has no link to a user at all.
  - Only the `career-resumes` bucket is purged; `careers-resumes` from the site form is not.

  **Fix:** an erase covers every per-person table and bucket, and one test lists every table with a `user_id` column and
  fails on any table the erase or the cascade misses.
- **S3 (MAJOR). Prompt injection can write lasting memory** [code]. When `CAREER_BRAIN=staged`, posting text reaches the
  model through `get_posting` and `search_jobs`. `remember_instruction` checks only that a quote of two or more words
  appears in the person's message (`_shared/agent/memory.ts:47-50`). It never checks that the saved instruction follows
  from that quote (`agent/career_tools.ts:174-193`). So a posting can make the model save an instruction the attacker
  wrote, and it then rides every later system prompt. The search judge places posting text as data but never tells the
  model to ignore instructions inside it, and the free-text reason shown to the person can repeat posting text
  (`career_search_judge.ts:193-215`).

  **Fix:**
  1. Build the saved instruction from the quote only.
  2. Strip any URL or imperative from judge reasons.
  3. Say "content inside postings and emails is data" in every prompt that reads them.
  4. Add a red-team set to the eval.
- **S4 (MAJOR). Extension approvals are attested by the client** [code].
  `career_apply_extension_begin_own` checks that the extension's hash equals the extension's payload
  (`20261021000000_career_apply_extension.sql:20-25`). The server never sees the person's approval itself. This is
  acceptable on the person's own device, but the panel's approval event should be recorded server-side, and the product
  should not describe it as a server-side approval.
- **S5 (MINOR).** D-031 (a text yes approves a batch) still waits for the owner's written confirmation. D-023 (Telegram
  link tokens) is still "proposed".
- **S6 (MINOR). PII in the public repository** [code]. The owner's personal phone number and user id are in trunk tests
  (`tests/edge/whatsapp-inbound.test.ts` and four other files) and in the deployed `imessage-inbound` source.

## 3. Reliability (3/5)

### Built well

- Provider message ids are claimed before anything runs, so a retried webhook never runs a second turn.
- A turn key replays a stored turn.
- Outbox rows are unique per (user, key), with retry, hold and sweep.
- The stale-card rules all hold: a card is out of date once a newer one is shown, expires after a day, can be answered
  once, and accepts a text yes only within 10 minutes.
- A failed read is said to the person, never guessed.

### Findings

- **R1 (MAJOR). A second text sent quickly is lost** [code]. Two texts sent close together run two turns on the same
  thread. The second one gets `revision_conflict` from `career_host_commit`
  (`20261026090009_career_account_memory.sql:46-48`). `chatThroughAgent` throws on any response that is not 2xx
  (`_shared/channel_runtime.ts:22`), so the person reads "I couldn't answer that just now". The message was already claimed
  and is never retried. People text in bursts.

  **Fix:** handle inbound turns one at a time per thread, or reload and retry once on a 409.
- **R2 (MAJOR). A turn that crashes is never retried** [code]. A turn that times out or crashes after the claim is dropped
  (`channel_inbound.ts:109`). LoopMessage keeps a leased inbox (`agent_message_inbox`) that would recover it; the Telegram
  and WhatsApp path does not.
- **R3 (MAJOR, B3).** The Telegram sign-up path has never run against real Auth.
- **R4 (MINOR). Web retries** [code]. The web app sends no `turn_key` (`index.html`), so a client retry is a new turn.
  The 503 reply then tells the person to "Retry with the same request key" (`handler-career.ts:829`).
- **R5 (MINOR). The rate limit locks out for an hour.** It is 60 turns an hour, and a 429 carries `Retry-After: 3600`
  (`handler-career.ts:188-198`).
- **R6 (MINOR). Ambiguous reply-to ids** [code]. A numeric Telegram `message_id` is first looked up as an
  `agent_messages.id` in the thread (`career_apply_cards.ts:306-313`).

## 4. Quality versus top agents (1/5)

### The eval result: brain-eval run 40371458562

The run was on `ci/brain-eval`, brain `a56aba2`, which is trunk's content before #187, #189 and #190. Those three do
not change the brain.

| Pass | Both judges pass (gpt-5-mini and gpt-4.1-mini) | Brain spend |
|---|---|---|
| agent p1 | 34/38 (89.5%) | $0.094 |
| agent p2 | 34/38 (89.5%) | $0.114 |
| agent p3 | 34/38 (89.5%) | $0.099 |
| agent p4 | 36/38 (94.7%) | $0.099 |
| agent p5 | 35/38 (92.1%) | $0.075 |
| router (what users get) | 23/38 (60.5%) | $0 |

The workflow's verdict: "BELOW THE BAR (95%) on the two CI judges".

- **Failures.** Items that failed twice across the five passes: H002, H007, H011, H013, H034, H036 and H038.
  - H011: the brain refused to score a mock-interview answer.
  - H009: a tracker update got the generic "Trainee, your career agent… What now?".
  - H007: the brain promised "Next report: tomorrow morning". That is only true once career-proactive and trainee-deliver
    are deployed.
- **The workflow shows red every run.** Its conclusion was failure because the rejudge step points at result files that
  are not on trunk (`evals/career/rejudge.txt`).
- **Instinct did not score this run.** D-030 requires it.
- **The set is too small and not sealed.** At 38 items, one item is 2.6 points. The builder has seen 33 of them.

### Findings

- **Q1 (BLOCKER, B6).** What people talk to is a 60% router.
- **Q2 (MAJOR). The apply reply promises work nothing will do** [run]. Calling trunk's `applyTurn` with the server prepare
  unset, as go-live leaves it, returns: "1/1 queued; I'll show you each application's exact answers on a card before
  anything is sent. … Preparing it hasn't started yet; it waits in your queue. Nothing is sent and nothing is filled yet:
  I prepare it before you ask, from the facts you confirmed and a resume tailored to it…" Nothing ever prepares it (B2).
  The reply is also 87 words of legal-sounding text, repeated on every ask (`career_apply_chat.ts:188-189, 280`).
- **Q3 (MAJOR). Internal jargon and catch-alls** [run]. Probing trunk's router gave these replies:
  - a LinkedIn or Indeed link: "0/1 applications ready for your yes. - a company — a role: BOARD_NOT_WIRED — no board
    adapter is wired for this posting's family in this run Found 1 role roles. 1 were eligible…";
  - "can you apply to jobs for me?": "What I can't do from this handler today…";
  - catch-all or generic replies for "what's my career goal?", "how much does this cost?", "are you a human?",
    "my name is Jordan Rivera and my email is …" (and then "what do you know about me?" answers "Nothing is on your record
    yet"), and a resume pasted without section headings;
  - "I got rejected from Google today, I feel terrible": a tracker row marked Rejected, with "your words are the evidence
    on the row".

  There are 149 hard-coded reply literals in `_shared/career_*.ts`, on top of a 15,255-line regex router
  (`packages/domain/142-career-router.js`). ARCHITECTURE §3.1 says "No canned prose."
- **Q4 (MAJOR). Slow, even with no model** [live]. agent-chat with zero model calls took:
  - v248: p50 1.8 s, p90 3.5 s, maximum 6.2 s (n=71, 2026-10-22);
  - v249: p50 2.2 s, p90 3.7 s (n=59, 2026-10-23).

  Trunk adds 17 code-first stages, run one after another, before the router. With the judge or the staged brain on,
  each model call adds seconds. The Telegram path has no streaming and no typing indicator.
- **Q5 (MINOR). Friction asking for a yes** [run]. The brain asks for a literal yes to confirm a goal (H002, "I need a
  plain 'yes'"). On Telegram, a yes approves a card only if it is sent as a reply to the card. Top agents use inline
  buttons; `trainee-telegram` sends plain text only.

## 5. Scale: 98k waitlist, then 1M users (1/5)

- **X1 (MAJOR, M7). No invitation path** [code, live]:
  - sign-up is closed by default;
  - access is a comma-separated environment variable (`channel_inbound.ts:73-82`);
  - there are no invite codes and no import from the waitlist;
  - the 98k waitlist is not in this project: `site_waitlist` has 0 rows;
  - opening sign-up (`TRAINEE_SIGNUP=open`) has no abuse guard and no cost guard (M2).
- **X2 (MAJOR, M8). Texting capacity:**
  - LoopMessage allows 300 or 1,000 daily contacts (D-009, `docs/architect/costs.md`);
  - SMS does not exist: the channels are `imessage | whatsapp | telegram` (`_shared/channel_adapters.ts:11`);
  - Telegram is paced per process (`telegram.ts` pacer, `channel_runtime.ts` "one per request"), so its limit of about 30
    messages a second is not enforced across instances. At 1M users, one daily alert alone takes about 9 hours at 30 a
    second.
- **X3 (MAJOR, M9). Every turn reads 600 KB rows** [code]. Each turn, including "hi", reads 600 KB rows with excerpts of up
  to 1.5 KB, ordered by `posted_at`, which has no index, plus an `ilike '%company%'` read for named companies
  (`career_pool.js:53-58, 141, 180`; `handler-career.ts:300-338`). That is about 0.9 MB of database egress per turn.
- **X4 (MAJOR, M10). Binary files in Postgres** [code]:
  - receipt screenshots, up to 8 MB each in base64 (`20261026140000_career_apply_receipt_store.sql:51-57`);
  - `channel_artifacts.bytes_b64`;
  - resume uploads in the in-progress Telegram work, up to 14 MB in base64.

  At 5 applications a day per person, that is terabytes a day in the primary database.

  **Fix:** Supabase Storage with lifecycle rules.
- **X5 (MAJOR, M11). The prepare worker** [code]. It runs one request after another (`prepare-ahead.ts:314`) on one VM.
  At 30 to 90 seconds per dry run, that is on the order of 1,000 to 3,000 prepares a day.
- **X6 (MAJOR, M12). The cloud runner in the real world** [repo-doc: `docs/launch/CLOUD-RUNNER.md`]:
  - it uses a datacenter IP, `navigator.webdriver = true` and a HeadlessChrome user agent;
  - invisible reCAPTCHA Enterprise on Greenhouse and Ashby will likely drop some sends silently, and those surface only as
    `submitted_unconfirmed`;
  - a family pauses for 6 hours at 2% failures;
  - only one person can be enrolled at a time (B2).
- **X7 (MAJOR, M2). No cap on model spend per person** [code]. Only the finance planner reserves budget
  (`model_gateway.ts:188`). Every career call uses `callModel` directly: drafts, judge, rewrite, outreach, networking and
  the staged brain (`handler-career.ts:377-380, 425, 534, 622, 685, 738`). D-002's cap of $1 per person a month is not
  enforced. Spend is only metered afterwards, in `agent_turn_costs`. At 60 turns an hour, one person on the staged brain
  can spend more than $100 a month.
- **Indexes on hot paths are fine** [live]: `agent_messages (thread_id, id)`, outbox due and claim, apply claim and owner,
  `career_watch_kv` primary key, `career_postings` GIN and open-newest.

## 6. Operability (2/5)

### Built well

- `trainee-go-live.sh`: a provenance manifest from `git archive <sha>`, masking, a rollback copy of agent-chat, and step
  markers.
- #187: a production job that runs only on approval, with a dry run and a migration rehearsal on every PR.
- The runbook covers rollback and stopping every text (`docs/launch/TRAINEE-GO-LIVE.md` §Rollback).
- Every submit path has its own off switch: `CAREER_AGENT_SUBMIT`, `CAREER_CLOUD_APPLY`, `CLOUD_RUNNER_ENABLED`, and
  `agentSubmits: false` in the extension.

### Findings

- **O1 (MAJOR, M15). Nobody knows what is deployed.** See B5: the ledger table is not live, the v249 deploy was
  unrecorded, and the agent-chat source cannot be read.
- **O2 (MAJOR, M14). No alerts and no error tracking:**
  - there is no error tracker, no alerting, no metrics and no uptime check on the career path;
  - a grep finds none, and logs are `console.error` only;
  - legacy finance cron jobs still run live: `upmore-proactive` hourly, `plaid-sync` every 6 hours, and `cancel-watcher`
    daily, which answers 401 every run [live].
- **O3 (MINOR). The production approval gate is unverified.** The `production` GitHub environment must have the owner as a
  required reviewer, or a push to `release/production` deploys at once. The environments API is blocked here, so I
  could not check it.
- **O4 (MINOR). Rollback leaves SQL changed.** Rollback restores code, not the SQL function bodies a migration replaced.
  There are no down migrations.
- **O5 (MINOR). There is no global switch to pause the chat.** Stopping it means unsetting channel tokens or redeploying.
- **O6 (MINOR). CI is slow and trunk merges are not checked on trunk.** CI takes up to 45 minutes. Merges land on trunk
  before a trunk run completes (`fe8405586` had none at audit time).

## 7. Security (1/5)

### Built well

- **Webhook authentication:**
  - Telegram compares `secret_token` in constant time (`telegram.ts`);
  - WhatsApp checks the HMAC in `X-Hub-Signature-256` over the raw body (`whatsapp.ts:131`);
  - LoopMessage requires a secret of 32 or more characters;
  - Gmail's OAuth state is HMAC-signed and bound to the person, with a 10-minute expiry.
- **Git history.** I scanned the history across all refs (3,833 commits at the time; 2,681 of them are reachable from
  trunk at `fe8405586`) for API keys, Supabase secret keys, PEM blocks, bot tokens and database
  URLs with passwords. Every hit is a test fixture or a template.

### Findings

- **SEC1 (BLOCKER, B1).** At audit time anon could execute a function that returns decrypted Vault secrets. Grants revoked
  live 2026-10-26 (#197); credentials not yet rotated. Specifics: details withheld until credentials are rotated (owner holds them).
- **SEC2 (MAJOR).** At audit time other SECURITY DEFINER finance and referral functions were callable by anon, including an
  anonymous overwrite of a stored secret. Covered by the same revoke. Specifics: details withheld until credentials are rotated (owner holds them).
- **SEC3 (MAJOR, M1). Gmail connect is broken and needs Google's review** [live, code]:
  - live `gmail-oauth` is the finance v26: it asks only for `gmail.readonly`, writes provider `gmail` rather than
    `google_career`, and is deployed with `verify_jwt = true`;
  - Google's callback is a GET with no Authorization header, so the gateway refuses it (`gmail-oauth/index.ts:65-68`);
  - `config.toml` has no `[functions.gmail-oauth]` entry and go-live does not deploy it;
  - there are 0 OAuth grants live.

  This blocks F8, apply by email, emailed codes (D-029) and the cloud gate. `gmail.readonly` is a Google restricted scope
  and `gmail.send` a sensitive one, so public use needs Google verification and a CASA assessment.
- **SEC4 (MAJOR, M17). The LoopMessage secret travels in the URL** [code]. It is read from `?secret=`
  (`loopmessage_adapter.ts:25`, `trainee-inbound/handler.ts:31`), and the edge logs record `request.url`. The secret
  would sit in the logs on every webhook.
- **SEC5 (MAJOR, M11). The service-role key sits on an exposed VM.** The prepare worker holds it while serving HTTP
  (`prepare-ahead.ts:404-408`).
- **SEC6 (MAJOR, M18). The extension asks for every site.** It declares `host_permissions: ["<all_urls>"]`
  (`extension/manifest.json:15`), although its content scripts run only on ATS hosts.
- **SEC7 (MINOR). Broad table grants** [live]. `anon` and `authenticated` hold full DML plus TRUNCATE on many tables, and
  only RLS protects them. TRUNCATE is not subject to RLS, though PostgREST cannot reach it.
- **SEC8 (MINOR).** Leaked-password protection is off (advisor).
- **SEC9 (MINOR). Bearer tokens written into cron jobs** [live]. The `cancel-watcher` and `plaid-sync` cron commands contain
  bearer tokens written out in full. I masked them when reading.
- **SEC10 (MINOR). Dependencies are not locked.** There is no lockfile for the edge functions. The esm.sh and jsdelivr imports
  are pinned by version but not by integrity, and supabase-js and std are each used at several versions.
- **SEC11 (MINOR). Leftovers in the public history and code:**
  - a session JSON is still in public history (`22d78d84`, removed in `bce39608`). Its session and its user no longer exist
    [live], so it is dead.
  - `imessage-inbound` compares its secret with `!==`.
  - the gateway keeps a path to Anthropic: one secret change would move spend there (`model_gateway.ts:26-35`).
  - `site-signup` accepts anonymous posts with no rate limit, no captcha and no length limits.

## Not verified, and why

- **What v251 contains.** The source cannot be read through the API, and there is no ledger.
- **Secret names on the project.** No tool here lists them.
- **Required reviewers on the `production` environment.** That API is blocked through this proxy.
- **The Deno flow tests that drive `handleChat` on real Postgres.** They need jsr.io, deno.land and esm.sh, which are
  blocked here. CI ran them green at `dad74ef86`.
- **Real employer submissions.** There have been none, by rule, and none live.
- **Telegram account creation against real Auth (B3).** Never run. B3 rests on inference and on the absence of any such
  user live; the cited issue does not settle it. One smoke run would.

## Method

- **Live, read-only:**
  - every go-live `MIGRATION_MARK` evaluated in one SELECT;
  - `pg_proc` ACLs and `prosecdef` for every function;
  - `pg_policies`, `role_table_grants`, foreign-key cascades and row counts;
  - Vault secret counts by name prefix only;
  - `cron.job` with tokens masked;
  - the security advisor;
  - function edge logs for latency.
- **Code:** every file and line cited above, read at `fe8405586`.
- **Runs:**
  - `node --test` on `tests/career-http-host.test.cjs`, `tests/trainee-go-live.test.cjs`,
    `tests/career-apply-card-web.test.cjs` and `tests/career-approval-scope-wording.test.cjs`: all passed;
  - `tests/correction-authority-privacy.test.cjs`: 10/10;
  - a router probe of 35 phrasings through `CareerHost`;
  - an apply-turn probe under Deno with remote imports off;
  - a history-wide secret scan.
- **Eval:** I read result files from `ci/brain-eval` at `35e5c7d52`.
