# agent-chat v249: rollback vs forward fix (research for the owner, 2026-10-23)

This document compares the options; it decides nothing.

**What I did to produce it.** I read the live project and ran throwaway sandbox databases.
- **Nothing was deployed, migrated, rolled back or revoked.** Every live query was a read.
- **The forward migrations were run only in a throwaway Postgres 16 sandbox.** That sandbox reproduces the live schema; it is described in the Method section.
- **Each line names its source:**
  - "listing" is the Management API function list.
  - "logs" are the platform `function_logs`, `function_edge_logs` and `auth_audit_logs`.
  - "SQL" is a read-only query on the live database.
  - "sandbox" is the throwaway Postgres.
  - "git" is this repository.

This builds on `V249-RECONCILIATION-2026-10-23.md`, which is on the same branch.

## 0. Freeze state and new evidence on the 05:07 deploy

**Freeze.** No process controlled by this architect session deploys or migrates anything.
- **Scheduled tasks.** There are two:
  - A one-shot CI check at 18:20 UTC. It reads G3a CI, and its prompt now forbids deploys, migrations, rollbacks, revocations and live DB writes.
  - A recurring task from 2026-10-12, which has been disabled since that day.
- **GitHub workflows.** None of them deploys edge functions or migrates the live database.
  - No workflow references a Supabase access token or database URL (git: `.github/workflows/`).
  - The only scheduled workflows are `board-discovery` and `source-freshness`, which run Mondays at 06:17 UTC and only read or commit to `ci/` branches.
- **Live pg_cron jobs (SQL `cron.job`).** These are not controlled by me, and none of them deploys or migrates.
  - `cancel-watcher-daily` (06:00).
  - `plaid-sync-6h`.
  - `upmore-proactive` (hourly at :07). It calls `agent-proactive`, which is unchanged at v18.
- **Muse.** I cannot see or confirm any scheduled processes Muse controls.

**Who ran the deploy: a scripted, version-aware post-deploy probe (logs: `auth_audit_logs`).**
- **The probe ran 05:08:33–05:18:02 UTC.** That is 81 seconds to 11 minutes after agent-chat changed at 05:07:12.
- **It used the service role key with the user agent `Python-urllib/3.12`.**
  - It created six users in pairs: `probe-v249-u-<unix time>@upmore.test` and `probe-v249-v-<unix time>@upmore.test`. The unix times decode to 05:08:29, 05:09:05 and 05:09:43.
  - It signed each one in through recovery links and drove agent-chat. Logs show v249 traffic from 05:09:58 to 05:12:51, including 8 unmatched-fallback containment lines.
  - It then deleted all six users, the last at 05:18:02.
- **The deployer knew the new version number within 81 seconds.** It named the probes "v249".
- **The naming matches Muse's earlier probe.** The F-014 cross-profile probe was `probe-f014-a-<unix time>r1@upmore.test` (SQL `auth.users`, created 2026-10-21 10:11). Muse's own records describe a deploy lane:
  - deploys checked with `sb.py`;
  - "the deploy lane's manual gate", 2026-10-21;
  - live verification on v246–v248.

  See `docs/gauntlet/wave1-mock-t3-2026-10-20.md` and `tools/o5-gate-kit/test-runs-2026-10-21.md`. **This is a lead, not proof.** Only the owner or Muse can confirm it. The dashboard's deployment history for agent-chat, or the access-token owner, would settle it.
- **Owner's local time.** The deploy began at 00:07 CDT. The owner's 10:41 PM CDT message "at midnight reconnect" answered a browser-limit note (coordinator, established context).
  - The deploy started seven minutes after local midnight. That timing fits someone reading "at midnight" as a go signal, or a job scheduled from it.
  - It does not show that the owner authorized a deploy. I found nothing that contradicts the established context that the owner accepted the hold at 9:59 PM.
- **These were production writes after the hold.**
  - Six auth users were created and deleted, together with their messages.
  - At 12:25–12:28 UTC, `gauntlet-test@upmore.test` signed in with the same user agent (`Python-urllib/3.12`) and sent 29 messages to v249 (SQL `agent_messages`, logs).
- **No real user has touched the redeployed functions.**
  - Since 05:07, agent-chat's only callers were the probe users and `gauntlet-test`.
  - telegram-inbound, agent-exec, delete-account, site-careers and site-signup had **zero** invocations (logs, `function_edge_logs`, 05:07–18:30).
  - The owner's account has no `agent_messages` at all. The last message from a non-test account was on 2026-10-06 (SQL).

## (a) Rollback target

### agent-chat v248

- **Version and when it served.** v248 is on the record (logs: function `285cb36c`, `version` 248).
  - It served 2026-10-21 14:30:26 → 21:06 and 2026-10-22 12:26 → 14:05 UTC.
  - That is 408 log lines with 0 "Could not find the table" lines.
  - It had 27 error lines. Those I sampled (2 on 2026-10-22) are router containment fallbacks, not schema errors.
- **Source: `cea914fe`.** This is Muse's record, and the record is strong.
  - Muse's gate kit rebuilt the `cea914fe` stage and found it byte-identical to "the preserved v248 stage": 12 files, 3,467,792 B, `~/workspace/stage-cea914fe` on Muse's machine (git `f71165e1`, `tools/o5-gate-kit/test-runs-2026-10-21.md`).
  - That compares against Muse's local copy of what was deployed, not against the platform bundle, because I cannot download the platform bundle.
- **The same commit is what the eval measured as "v248".** `ROUTER-EVAL-20261022.md` scored `cea914fe` as v248: 14/30 and 15/30.
- **What v248 reads in the database (git, import graph of `agent-chat/index-career.ts` at `cea914fe`, 12 files):**
  - the tables `agent_threads`, `profiles` and `channel_artifacts`;
  - the RPCs `career_host_load`, `career_host_commit`, `career_batch_turn_commit_v1`, `career_task_turn_commit_v1`, `career_task_result_v1` and `career_batch_result_v1`;
  - the knowledge-base tables `career_kb_*`.
- **v248 never reads the three missing tables.** `cea914fe` has zero references to `career_events`, `career_outreach_drafts` or `career_interviews` anywhere in `agent-chat` or `_shared`. It predates `career_situation.ts`, which `7498ea8d` added. This confirms the manifest's note "v248 never reads it".
- **What v248 needs in its environment (git):**
  - `CHANNEL_ARTIFACT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_AUTH_TOKEN`, `UPMORE_CAREER_WORKER_URL` and `UPMORE_CAREER_WORKER_SECRET`;
  - the `CAREER_*_JSON` knowledge sets and `CAREER_SCOPES`.
- **Unknown configuration doesn't affect v248.** It reads neither `CAREER_BRAIN` nor `CAREER_PDL` and has no agent-brain code. Secrets are project-wide, not per version. So whatever was set at 05:07, if anything was, cannot change v248's brain mode or provider spend.

### The other five functions changed at 05:07

| function | now | before | previous source |
|---|---|---|---|
| telegram-inbound | v8 | **v7** (logs: v7 served 2026-10-20 21:13 → 2026-10-22 14:05) | Muse's record pairs v7 with `cea914fe` ("agent-chat v248 / telegram-inbound v7", `FAILURES-ADDENDUM-TELEGRAM-SLICE-2026-10-22.md`); not otherwise established |
| agent-exec | v76 | not established (no calls in logs 10-20→10-23; version numbers can skip) | not established |
| delete-account | v41 | not established | not established |
| site-careers | v10 | not established | not established |
| site-signup | v10 | not established | not established |

- **Why I can't pin these.** The sources of site-signup and site-careers have one commit each in git (2026-10-20), so they cannot narrow down which commit was deployed.
- **Observation (listing vs git):**
  - `site-signup` and `site-careers` are live with `verify_jwt: true`.
  - `supabase/config.toml` sets both to `false`.
  - The deployed `site-signup/index.ts` says "verify_jwt is OFF on purpose: this is a public capture endpoint" (`get_edge_function`).
  - A visitor's POST without a token would therefore be refused. There have been none since 05:07.
  - I could not establish whether 05:07 changed this flag or it was already true.

### Is today's live DB compatible with the pre-05:07 set? Yes, for agent-chat; zero schema change needed.

1. **The schema has not changed since v248 last ran cleanly.**
   - The last migration applied live is `20261024120000` at 2026-10-21 22:39:53 (SQL `upmore_migration_ledger`).
   - v248 then served 2026-10-22 12:26–14:05 with no schema errors (logs).
   - The schema has not changed since by ledger, and by the fingerprint match in Method below.
2. **The three migrations applied after v248 first ran don't touch anything v248 calls.** Those are 21:59 and 22:39 on 2026-10-21. They change only:
   - `career_apply_extension_begin_agent_own`;
   - `career_apply_cloud_ask` and `career_apply_questions_put_*`;
   - the cloud gate waiver objects.
   v248 calls none of these (git).
3. **v248's calls match the live signatures.** All six RPCs it calls exist live with exactly the argument names it sends (SQL `pg_get_function_identity_arguments` vs git `career_persistence.js`), for example `career_host_commit(p_user, p_thread, p_key, p_hash, p_revision, p_account_version, p_snapshot, p_patch, p_input, p_response)`.

**What a rollback does not cover.** A rollback means redeploying `cea914fe`'s 12-file stage, which is an owner deploy. A version restore is not something I verified the platform offers.

## (b) Forward path: the three missing migrations

All results below are from the sandbox, whose career/channel schema matches live; see Method.

### 1. `20261020120000_career_events`

- **Creates** `career_events`, a per-person timeline:
  - it has RLS, with the owner allowed to read;
  - `service_role` has all rights and `authenticated` can select;
  - it carries a kind check of 20 kinds.
- **Creates** `career_recall_own(...)`, which is executable by `authenticated`.
- **Adds the trigger `career_events_on_prepared`.** It runs AFTER INSERT on `career_apply_prepared`.
  - It writes an `application_prepared` event for every prepared row.
  - It catches its own errors with a warning, so it never fails a prepare.
  - Live has 3 prepared rows, the last on 2026-10-21 (SQL).
- **This is a new side effect on the apply path.** It only adds rows and never blocks anything.
- **Applied alone, it succeeds.**
- **Gap when applied alone:** `career_events` is not erased on account erase until `career_host_commit` is replaced, either by 120100 or by 21050000 below.

### 2. `20261021010000_career_outreach`

- **Creates** `career_outreach_drafts`, `career_outreach_dnc`, `career_outreach_prefs` and `career_email_checks`.
- **Creates** `career_outreach_claim` and `career_outreach_on_erase`, the latter a trigger on `career_watch_kv` for the `career:account` key.
- **Replaces** `career_recall_own`.
- **Widens** `career_events_kind_check` with the outreach kinds.
- **Applied alone, it fails:** `relation "public.career_events" does not exist` (sandbox). It needs migration 1 first.

### 3. `20261021050000_career_brief_digest`

- **Creates** `career_interviews` and `career_digest_prefs`.
- **Adds** three columns to `career_proactive_runs`.
- **Replaces** `career_host_commit`, the commit RPC every chat turn uses on both v248 and v249. The only change from the live body is three lines added to the erase branch (git diff):
  - `delete from career_events …`;
  - `delete from career_interviews …`;
  - `delete from career_digest_prefs …`.
- **Re-creates** `career_mail_drafts_application_ref_check`, widening it to add `invite:`.
- **Re-creates `career_outbox_kind_check` and `career_outbox_key_check` without `link` and `questions`.**

#### The outbox narrowing: a proven regression

- **Live already allows those two kinds.** Live allows 12 outbox kinds, including `link` and `questions` (SQL). They were added by two migrations that are already live:
  - `20261021070000_channel_parity`, used by `channel_link_ask` and `channel_link_confirm`;
  - `20261021075000_career_apply_ops`, used by `career_apply_questions_push_for`.
- **brief_digest has the older timestamp but would be applied after them.** That puts the 10-kind list back.
- **The migration itself succeeds live.** Zero current rows would violate the new checks (SQL), so nothing stops it.
- **Sandbox proof, same database state with and without the three files.**
  - **Control** (live emulation): `career_apply_questions_push_for(...)` returns `t` and writes one `questions` outbox row, and a `link` outbox row inserts.
  - **After the three files:** both fail with `new row for relation "career_outbox" violates check constraint "career_outbox_key_check"`.
- **Who notices.** No live function calls these two paths today:
  - their callers are `career-proactive` and `trainee-inbound`, and neither is deployed (listing);
  - v249 itself writes only `alert` rows (git).
  So the regression is **latent**. It fires the first time either function deploys, or anything else writes those kinds.
- **The 2026-10-22 release manifest misses this.** Its row #6 says only "replaces `career_host_commit`". That review missed the narrowing, and the miss is mine as the reviewing architect.

#### Order dependencies

- brief_digest applied alone succeeds at DDL time.
- But its `career_host_commit` erase branch then references `career_events`. PL/pgSQL resolves that only when it runs, so an account erase would fail until migration 1 exists.
- So the safe order, if any, is 1 → 2 → 3, and file 3 needs the outbox lists corrected before it is applied.

### What v249 gains and still lacks after all three

**Method for this section (git).** I extracted every literal `.from("…")` and `.rpc("…")` from the import graph of `agent-chat/index-career.ts` at `373453f3`: 71 files and 51 objects. I treated `373453f3` as the stand-in for v249. That is unproven: the reconciliation bounds v249's source to between `7498ea8d` and `36bac970`. I then checked every object live (SQL).

- **Missing today: 15.**
  - The tables `career_events`, `career_outreach_drafts`, `career_outreach_dnc`, `career_outreach_prefs`, `career_email_checks`, `career_interviews`, `career_digest_prefs`, `career_hired_cache` and `career_pdl_calls`.
  - The RPCs `career_outreach_claim`, `career_alerts_sent_since`, `career_pdl_credits_month`, `career_mail_model_claim`, `career_voice_create` and `career_apply_message_card_read_own`.
- **The three files supply 8 of them.** Every turn's situation (last search, outreach drafts, interviews) would then load, and the 177 log errors would stop.
- **Still missing after the three: 7.**

| object | from migration | v249 code path |
|---|---|---|
| `career_hired_cache`, `career_pdl_calls`, `career_pdl_credits_month` | `20261021030000_career_hired_backgrounds` | "who got hired" backgrounds (`career_hired.ts`). CAREER_PDL is off by default in `373453f3`, so this is likely unused |
| `career_alerts_sent_since` | `20261021110000_career_board_state` | weekly alert counts (`career_alert_store.ts`) |
| `career_mail_model_claim` | `20261021130000_career_mail_model_calls` | the mail model, which is off (D-025); with no claim, no model call is made |
| `career_voice_create` | `20261021020000_career_voice_mock` | voice mock-interview link (`career_voice_link.ts`) |
| `career_apply_message_card_read_own` | `20261021220430_career_apply_message_cards` (held, TEST-only) | reading a chat card back as the person (`career_cloud_card_chat.ts`) |

- **Two kinds and one column v249 can write.** The event kind `apply_queued` (`20261023100000`) and the `career_postings.pay` column (`20261022110000`) are written or read only by the agent brain. The agent brain cannot run in `373453f3` (`AGENT_BRAIN_RELEASED = false`).
- **Quality stays the same.** The forward fix changes schema, not routing. The measured router quality of `373453f3` is 16/30 and 15/30 against 14/30 and 15/30 for v248 (`ROUTER-EVAL-20261022.md`). That is 31/60 against 29/60, a difference within noise, and both are far from the 95% bar.

## (c) What the owner experiences on each path

**Measured base:** since 05:07 no real user has used Trainee. The owner's account has never sent a chat message (SQL). So "today" below describes what any user would get, as seen on test traffic.

| | Today, v249 degraded | After rollback to v248 | After the three-file forward fix |
|---|---|---|---|
| Chat answers, routing quality | Router mode (intents only; logs). Held-out score in the 15/30 range | Same score range (14–15/30). Statistically the same as v249 | Unchanged from today |
| What it knows about you each turn | Situation reader runs, but last search, outreach and interviews read as "unreadable" (177 errors). Replies carry on without them | No situation reader, so nothing is lost. It never had one | Situation complete for those three |
| Apply-by-chat flows (prepare, card, question RPCs) | Present in code; most RPCs exist live. Submissions stay gated and held | Absent (v248 is the 12-file router line) | As today |
| Voice mock link, hiring backgrounds, weekly alert counts, chat card read-back | Fail if reached (objects missing) | Absent | Still fail (still missing) |
| Account erase | Works (live `career_host_commit`) | Works | Works, and also erases events, interviews and digest prefs |
| Telegram and website signup | No calls since 05:07. telegram-inbound v8's source is unknown. site-signup and site-careers have `verify_jwt` true, so the public waitlist POST would be refused | Unchanged unless those functions are also redeployed (their previous sources are not established) | Unchanged |
| Hidden cost | Records say v248, live is v249. Provenance unknown | Records and live agree with the hold record | Latent outbox regression for question pushes and Telegram link asks. DB mutations during a freeze. Records still don't match |
| Known defects | Unknown (source unproven) | The audited v248 defects (`AUDIT-INITIAL-WRONGS-2026-10-22.md`, found on v248) | Unknown, as today |

## (d) Recommendation (the decision is the owner's)

**Least risk: keep the freeze, do not apply the three files as written, and if the owner wants live to match the hold, redeploy agent-chat from the verified v248 source with no schema change.**

The order I'd suggest:
1. **Identify the actor first.** Use the dashboard deployment history or the access token's owner.
   - If the actor is unknown or unauthorized, decide about credentials before anything else, so the same path cannot redeploy afterwards.
   - The owner decides revocation.
   - There is no urgency: no real user is on the affected functions.
2. **Rollback, if chosen, is agent-chat only, from `cea914fe`'s stage.**
   - Evidence for it:
     - zero schema change is needed (§a);
     - v248's dependencies are all present with matching signatures;
     - its quality is equal within noise;
     - it removes the dependency on unknown configuration;
     - live and the hold record then agree.
   - Verification after it:
     - the listing shows a new version;
     - logs show zero "Could not find the table" lines;
     - one smoke turn as `gauntlet-test`.
   - The other five functions are left as they are. They have no traffic, and their previous sources are not established, so redeploying them would be a guess.
   - The `verify_jwt` mismatch on the site functions is a separate owner decision.
3. **No forward fix in its current form.**
   - File 3 narrows the outbox, a regression proven in the sandbox.
   - Any forward path needs a corrected migration first (brief_digest's outbox lists keeping `link` and `questions`), reviewed and tested on the sandbox, then applied 1 → 2 → corrected 3.
   - Even then, v249 lacks 7 objects and is still 50%-range code against a 95% bar.

## Method: the sandbox and how closely it matches live

- **How the sandbox was built.** A throwaway Postgres 16 with CI's migration order (`tests/flow/provision-pg.sh` logic), minus the 19 files the 2026-10-22 manifest classes as not live:
  - `20261020110000`, `20261020120000`, `20261020120100`, `20261020130000`;
  - `20261021010000`, `20261021020000`, `20261021030000`, `20261021050000`, `20261021090000`, `20261021100000`, `20261021110000`, `20261021130000`, `20261021220430`;
  - `20261022110000`, `20261022120000`, `20261022120500`;
  - `20261023100000`, `20261024130000`, `20261024140000`.
- **Result:** 77 migrations applied cleanly.
- **How closely it matches live.** I took a fingerprint of the full definition hash of every `career*` and `channel*` function, every column, every constraint definition, and the triggers on those tables plus `profiles`. Sandbox: 751 entries. The live fingerprint was compared by hash in one read-only query.
  - **Result: identical, except two `profiles` referral triggers that exist only live.** Those come from finance-era migrations and are unrelated to career.
  - This also confirms the manifest's not-live list for career and channel objects.
- **Tests run in the sandbox:**
  - each forward file applied alone, inside a transaction that was rolled back;
  - the three applied in order;
  - schema diff before and after;
  - `career_apply_questions_push_for` and a `link` outbox insert, each run on a fresh control database and on the forward database.
- **What is not covered:** live data volumes, `auth` and `storage` internals, and anything outside the `public` career and channel objects. The sandbox has not been checked against live for non-career schema.
