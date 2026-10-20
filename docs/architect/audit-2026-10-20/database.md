# Trainee database layer audit (trunk @ 53db2d55)

**Summary (5 lines)**
1. No cross-user leak at the database layer. All 26 client-callable SECURITY DEFINER functions take the user from `auth.uid()`. Every `*_for`, `*_as` and `*_core` function that takes `p_user` is revoked from `authenticated`. All 53 career, channel and connector tables have RLS on, and every policy is owner-scoped or service_role. The service-role RPCs trust whatever `p_user` the edge code passes.
2. The worst defect: `career_host_commit` bumps `career:account.version` on every chat turn, and `career_apply_current` requires the version an application was prepared under. So one "thanks!" makes every prepared application "stale", and every approved, queued application unclaimable. "show my applications" followed by "yes" can never send. VERIFIED. This is why the approval-mechanics and apply-loop rows marked FIXED-IN-TRUNK are not fixed for a real conversation.
3. "Forget my career profile" and "stop everything" are enforced only inside the chat host. After an erase, alerts keep firing, typed answers (sponsorship, salary) are reused, and the connector keeps matching the person to strangers. After a pause, queued alerts, new cards and approved outreach emails still go out. VERIFIED.
4. Concurrency and lost updates (all VERIFIED):
   - Two texts in quick succession, or a web turn plus a text turn, give `revision_conflict`. The person gets "I couldn't answer that just now"; their message is never retried and is missing from history, but the tools already ran.
   - The 5-minute alert run writes back the prefs it read when it started, which reverts a "stop my alerts".
5. Schema depth:
   - Career state is per thread.
   - The alert table holds one title-only alert per person.
   - An application that failed is barred forever ("you already applied").
   - The two migration runners disagree: the finance `--pending` runner can never succeed on a database where Trainee went live without a ledger.
   - No table has retention.

Method: a throwaway Postgres 16 cluster loaded with `tests/db/stubs.sql` and every migration in file order (all Trainee files from 20261015 apply cleanly, and each replays cleanly a second time). Repro scripts are in
(a throwaway repro outside the repo) (`up.sh` rebuilds the cluster when run as `pgtest`; each `repro_*.sql` runs in a transaction that is rolled back). Nothing was edited in the repo, and no Supabase project was touched.

---

## 1. One chat turn makes every prepared or approved application unsendable (account version bumped per turn)
- **Symptom:**
  - After any chat message, "yes 1 2" on a card answers "not sent: your details changed after it was prepared; prepare it again", although nothing changed.
  - "show my applications" followed by "yes" fails every time.
  - In the extension: "Your account changed since this card was made; review it again" if the person sent any text while reviewing.
  - Worst case: an application already answered "approved; it is sent next" stays `queued` forever and is never sent, if the person sends one more message ("thanks!") before a worker claims it. It still counts toward the daily cap (24 h) and the 30-day company cooldown, and blocks that posting forever (`duplicate_job`).
- **Why-chain:**
  1. Why stale? `career_apply_card_answer_for` maps the enqueue exception `%stale%` to `stale`, then to `expired` (`20261020050000_career_apply_daily_limit.sql:55,58`). The text is at `career_apply_cards.ts:106`.
  2. Why the exception? `career_apply_enqueue` raises 'invalid or stale application approval' when `career_apply_current` is false. `career_apply_current` requires `account.version = payload.account_version` (`20261020000001_career_apply_jobs.sql:32-38,50`).
  3. Why the version moved? `career_host_commit` writes `'version', p_account_version+1` on every commit, even with an empty patch (`20261021050000_career_brief_digest.sql:133`; the same in every earlier definition, for example `20261015020000_career_watch_kv.sql:131`). `career_watch_write` also bumps it (`20261015020000:228`). The extension stamps the version it read at page load (`extension/lib/trainee-core.js:4150-4151`, `background.js:519`).
  4. Why the "show" flow always fails: the card is opened inside a chat turn (`career_apply_cards.ts:143`, called from `handler-career.ts:319-321`). That turn then commits at `handler-career.ts:516` and bumps the version. The "yes" turn compares against the bumped version.
  5. Why queued jobs stick: both worker claims filter `career_apply_current(user_id,payload)` (`20261021080000_career_apply_cloud.sql:79-96` and `:104-110`). No sweep ever expires a stale `queued` row (grep finds none).
  6. Root: `version` serves two purposes: the optimistic-concurrency counter for chat commits, and the authority fence for approvals. Tests never mix them: `tests/db/career_apply_cards.test.sql:8-15` pins version 1 and never commits a turn.
- **Class:** BACKEND (state-model defect).
- **Severity:** 1. Likelihood is near certain in normal use. Harm: wrong answer, a lost approved action, and a silent never-sent application that still burns the cap and cooldown.
- **Evidence:** VERIFIED.
  - `repro_stale.sql`: prepare at v1, open card, one chat turn, "yes 1 2" → `[{"result":"stale"},{"result":"stale"}]`, prepared rows `expired`, 0 jobs.
  - `repro_stale_control.sql`: the same without the chat turn → both `queued`.
  - `repro_queued_stuck.sql`: queued, then one turn, then `career_apply_claim_own` and `career_apply_claim` each claim 0 rows; the state stays `queued`.
- **Fix:**
  - A new migration splits the counter. `career_host_commit` bumps `version` only when `p_patch` carries an authority key (`paused`, `erase`, `stated_facts`, `preferred_locations`), and keeps a separate `turn` counter for its own conflict check. Alternatively, redefine `career_apply_current` to fence on `epoch`, `paused` and `expires_at` only; the exact-payload hash already guards what was approved.
  - Add a sweep that moves `queued` rows whose approval is no longer current to `not_submitted` (reason "approval expired"), so they stop counting toward the cap and cooldown.
  - Fail-first test (`tests/db/career_apply_turns.test.sql`):
    - prepare at v, open card, commit an empty-patch turn, answer → `queued`;
    - enqueue, commit an empty-patch turn, `career_apply_claim_own` → 1 row;
    - commit `{"paused":true}`, answer → `stale`.
- **Brutal-list rows:**
  - approval-mechanics BL-340–348 and apply-loop BL-043–054 are all marked FIXED-IN-TRUNK. Their fix holds only when no chat turn falls between preparing and answering, so the verdicts should be reopened.
  - The apply-chat RETEST-BRAIN rows that end in "apply" (BL-001…) will hit the same wall even with a perfect brain.

## 2. "Forget my career profile" leaves alerts running, form answers reused, connector matching and resume bytes
- **Symptom:** the reply says "I removed your saved career profile … cleared account watches" (`career_host.js:215`). Afterwards:
  - Job alerts keep arriving.
  - The next application form is filled with the erased answers ("Yes, I will need H-1B sponsorship", salary 95000).
  - The person stays opted into the connector, so other users can still be proposed an intro with a "why" line built from the erased needs ("they want a referral at …", `career_connector.ts:199-219`).
  - Tailored-resume PDFs (name, email, phone) stay in `channel_artifacts`.
  - After a resume, the brain's system prompt still carries the old alert keywords (`handler-career.ts:428-446`, `known.alerts` from `career_alert_prefs`).
- **Why-chain:**
  1. Why do these survive? The erase in `career_host_commit` deletes only `career_watch_kv` (non-turn rows), `career_events`, `career_interviews` and `career_digest_prefs`, and nulls `career_reminder_outbox` (`20261021050000:122-131`).
  2. The rest is done by one-off triggers on the account row, each added after a review found a miss: mail (`20261021090000:6-19`, "It missed both until now"), outreach (`20261021010000:165-178`), cloud (`20261021080000:258-269`) and task/batch intents.
  3. Why still incomplete? There is no registry of person-keyed tables and no test that checks every table after an erase. Tables added since (`career_alert_prefs`, `career_apply_questions`, `career_apply_jobs`, `career_apply_prepared`, `career_apply_cards`, `career_apply_wanted`, `connector_profiles`, `connector_intros`, `career_outbox`, `channel_artifacts`) were never added to the erase.
  4. Why alerts keep sending: `runAlerts` selects `career_alert_prefs where prefs->>on = 'true'` (`career_alert_store.ts:110`). It never reads the account's `paused` or `epoch` (see finding 3).
  5. Root: erase is opt-in per table, enforced by convention, not by the schema.
- **Class:** BACKEND.
- **Severity:** 2. Likelihood: every erase. Harm: privacy. Erased facts are reused in submissions to employers, and connector intros can still expose a slice of the profile to other users. The reply makes a false claim.
- **Evidence:** VERIFIED (`repro_erase.sql`). After a successful erase:
  - `career_alert_prefs` on=true: 1 row;
  - `career_apply_questions` answered: 2 rows, and `career_apply_answers_own()` still returns both answers;
  - `career_apply_jobs`: 1; `connector_profiles` opted_in: 1; `career_outbox`: 1;
  - `agent_messages` keeps "sponsorship".

  READ: `channel_artifacts` has no delete anywhere in `supabase/functions` (grep), and its `user_id` has no foreign key (`20261020000000:18-29`).
- **Fix:** one migration with a single `career_erase_person(p_user)` called from `career_host_commit`'s erase branch (or one trigger on the epoch raise). It:
  - deletes the alert prefs, apply questions, prepared applications, cards, wanted postings and channel artifacts;
  - opts out and deletes the connector profile, and declines open intros;
  - marks `queued`/`held` outbox rows `cancelled`;
  - moves `queued` apply jobs to `not_submitted`.

  Then add `tests/db/career_erase_complete.test.sql`. It enumerates `information_schema.columns where column_name in ('user_id','a_user','b_user')` over `career_%`, `channel_%` and `connector_%` tables, seeds one row each, erases, and fails on any table not in an explicit allowlist (do-not-contact hashes, turn receipts, ledgers). A new table then fails the test until it is listed.
- **Brutal-list rows:** none in the list probes erase. This is a gap in the list, not evidence that erase works.

## 3. "Stop everything" pauses only the chat: queued texts, new cards and approved outreach emails still go out
- **Symptom:** the reply is "Career work is paused. No new action will be started." Then, within a minute:
  - the alert queued just before is texted;
  - the next 5-minute run pushes a new apply card;
  - approved outreach drafts are still claimed for Gmail send.
- **Why-chain:**
  1. Why are they sent? `career_outbox_claim`, `_claim_key` and `_claim_user` select due rows by status and contact only (`20261021070000_channel_parity.sql:100-149`). `career_apply_card_push_for` checks opt-out, the WhatsApp window and an open card, but not the account (`20261021070000:143-170`; `20261021075000` adds the last-word check only). `career_outreach_claim` checks approval, do-not-contact and caps, but not the account (`20261021010000:131-157`).
  2. Why does no caller check? `paused` is written only into `career_watch_kv` `career:account` by `career_host_commit` (`20261021050000:133,135`). Only `career_apply_current` (approvals and claims) and the module-152 reminder RPCs read it. grep of `trainee-deliver`, `channel_*.ts`, `career_proactive_run.ts` and `career_outreach.ts` for "paused" finds nothing.
  3. Root: the pause is a field in a KV blob, not a column every claim path joins, so each new sender had to remember it, and none did.
- **Class:** BACKEND.
- **Severity:** 3. Likelihood: high (people say "stop" when overwhelmed). Harm: wrong external action, including a real email to a third party after "stop".
- **Evidence:** VERIFIED.
  - `repro_pause.sql`: account `paused=true`; `career_outbox_claim` returns `alert:p1` to `+15555550123`; `career_apply_card_push_as` returns a card id while paused.
  - `repro_outreach_pause.sql`: `career_outreach_claim` returns `ok` with the account paused.
- **Fix:** a migration adding `public.career_paused(p_user) returns boolean` (reads `career:account`). Add `and not public.career_paused(o.user_id)` to the three outbox claims, keeping `reply`, `link` and the pause confirmation itself deliverable. Make `card_push_for` and `questions_push_for` return null when paused. Make `career_outreach_claim` return `'paused'`. Make `runAlerts` skip paused users. Fail-first test: pause, then each claim returns nothing or `'paused'`; resume, then they flow again.
- **Brutal-list rows:** pause-control BL-189, 191, 192, 590, 597, 604, 628, 630, 631, 636, 681, 837, 863 (TRIAGE "part 3" names the TS side; the DB claims are the other half).

## 4. Two turns at once: one is refused, the person is told "couldn't answer", but its side effects already happened
- **Symptom:**
  - The person texts "I study economics" and, five seconds later, "and I want investment banking". One reply is "I couldn't answer that just now. Try again in a minute." That message is gone from the thread, and the fact is lost.
  - The same happens when the person chats on the web while a text turn is in flight, because threads conflict with each other through the account version.
  - If the refused turn's tools ran, the alert was saved and the drafts were inserted. A retry duplicates them, and the 409 body says "Nothing new was started".
- **Why-chain:**
  1. Why refused? `career_host_commit` returns `revision_conflict` when the account version or thread revision differs from what the turn loaded (`20261021050000:93,95`).
  2. Why are both loads equal? `career_host_load` takes `pg_advisory_xact_lock`, which is released when the load transaction ends (`20261015020000:72`). Nothing serializes a user's turns across the 5–20 s model call.
  3. Why cross-thread? Every commit bumps the account version (finding 1), so a commit on thread B invalidates a turn loaded on thread A.
  4. Why lost? The handler maps the conflict to 409 (`handler-career.ts:523-525`). `chatThroughAgent` throws on non-OK (`channel_runtime.ts:20`). The inbound path sends `CHAT_DOWN_REPLY` (`channel_inbound.ts:186-191`) after the provider message id was already claimed (`:105`), so nothing retries.
  5. Why do side effects persist? The agent's stores write directly through `admin` during the turn: alerts, wants, events, outreach (`handler-career.ts:426-446`). The commit at `:516` carries only the snapshot and messages.
- **Class:** BACKEND.
- **Severity:** 4. Likelihood: high on texting channels (bursts of short messages). Harm: lost user data, a wrong answer, duplicate effects on retry.
- **Evidence:** VERIFIED (`repro_concurrent.sql`): two loads at version 0; turn A commits; turn B on the same thread returns `{"error":"revision_conflict"}`; turn C on another thread returns `{"error":"revision_conflict"}`; only A's 2 messages are kept. The side-effect ordering is READ.
- **Fix:**
  - Fixing finding 1 removes the cross-thread conflicts.
  - For the same thread: a per-user turn lease (a migration adding `career_turn_lease(user_id pk, token, until)`). `career_host_load` returns `{busy}` while a live lease exists, and `career_host_commit` releases it. The inbound path re-queues a busy message (leaves it unclaimed or retries with backoff) instead of claiming it and failing.
  - Change the 409 text so it no longer claims nothing started.
  - Fail-first test: two loads, two commits on one user → the second is `busy` at load, not `revision_conflict` at commit. The inbound test expects that a conflicting second text is answered after the first, not with `CHAT_DOWN_REPLY`.
- **Brutal-list rows:**
  - BL-642 (storage-degrade): the 503/409 body is never rendered by a channel.
  - Any live-battery multi-message row where one bubble came back as "couldn't answer" (for example c01/BL-591, "three things at once" followed by a quick second text).

## 5. The alert run overwrites alert settings changed while it ran ("stop my alerts" reverted)
- **Symptom:** "turn off my job alerts" gets "done", and alerts keep coming, because the 5-minute run wrote the old `on:true` back. Conversely, a chat change resets the run's counters, so the daily cap (`instant_sent_today`) restarts and the person gets more alerts than the cap.
- **Why-chain:**
  1. `runAlerts` reads every active row at its start (`career_proactive_run.ts:37`).
  2. It awaits posting reads and one enqueue per alert, then saves `{...row, counters}` per user (`:72-78`).
  3. `save` is a whole-row upsert including `prefs` and `tz` (`career_alert_store.ts:100-101,106`).
  4. The chat tool does the same read-modify-write from its own read (`career_tools.ts:250-256`, via `startWatching`, `career_alert_store.ts:60-66`).
  5. Root: settings and counters share one row with no version column and no column-scoped update.
- **Class:** BACKEND.
- **Severity:** 5. Likelihood: medium (the run's window grows with users and postings). Harm: wrong external action (alerts after stop).
- **Evidence:** VERIFIED (`repro_alert_race.ts`, run with deno against trunk's `runAlerts` and `memoryAlertStore`, which has the same whole-row semantics): "after chat turn, on = false" → "after the alert run, on = true".
- **Fix:** a migration adding RPC `career_alert_counters_save(p_user, p_last_checked_at, p_sent_today, p_sent_on, p_held, p_last_report_on)` that updates only counter columns, used by `runAlerts`. The chat tool updates only `prefs` and `tz` (or adds an `updated_at` compare-and-set). Fail-first test: the repro above, expecting `on = false`.
- **Brutal-list rows:** none directly. It sits under alert-content and pause-control, where users "stop alerts".

## 6. An application that failed or needed the person can never be queued again ("you already applied")
- **Symptom:** a portal error marks an application `failed`, or a form that needed the person marks it `needs_user` (or it was stuck as in finding 1). Asking Trainee to apply again answers "not sent: you already applied to this posting" (`career_apply_cards.ts:105`; the extension says "You already applied to this posting.", `background.js:619`). Nothing was ever sent.
- **Why-chain:**
  1. `career_apply_enqueue` raises `duplicate_job` if any row exists for (user, job_id), in any state (`20261020050000_career_apply_daily_limit.sql:24`, the same in `20261020000001:51`). `career_apply_prepare_own` refuses at prepare time too.
  2. The table has `unique(user_id, job_id)` (`career_apply_jobs_user_id_job_id_key`).
  3. Retries were patched per path, not at the root:
     - the extension deletes only `not_submitted` rows with reason "stopped before the click" (`20261021120000`, `extension_begin_own`);
     - the email path allows only `not_submitted` with source `email` (`20261021075000:203-204`).
  4. `failed`, `needs_user` and stale `queued` rows have no path back.
- **Class:** BOTH (shallow retry model, plus a constraint).
- **Severity:** 6. Likelihood: every portal failure. Harm: a wrong answer and a blocked action.
- **Evidence:** VERIFIED (`repro_failed_retry.sql`): enqueue → claim → finish `failed` → enqueue again → `ERROR: duplicate_job`.
- **Fix:** a migration with one rule in `career_apply_enqueue` and `prepare_own`. A prior row blocks only in states that may have reached the employer (`driving`, `submitted_unconfirmed`, `confirmed`, `unknown_outcome`). A prior `failed`, `not_submitted`, `needs_user` or never-claimed `queued` row is archived into the new row's evidence and replaced (as the email path already does). Fail-first test: the repro, expecting `queued`.
- **Brutal-list rows:** none named. It is adjacent to apply-dedupe BL-729 (the inverse: a manual application is not deduped).

## 7. Career memory lives per thread: a new conversation starts blank
- **Symptom:** "add my Goldman application to the tracker" on Telegram. Then, on the web, "what's its status?" gets nothing; Trainee doesn't know. Profile facts saved by the router or the agent snapshot behave the same way.
- **Why-chain:**
  1. `career_host_load` reads `state->'career'` from `agent_flow_state where thread_id = p_thread` only (`20261015020000:83`).
  2. `agent_flow_state` is keyed by `thread_id` (`20261011010000_flow_state.sql:6`), and `STATE_KEYS` (profile, trackStore, statedFacts…) ride that snapshot (`career_host.js:35-60`).
  3. Only `stated_facts`, `paused` and `preferred_locations` are lifted to the per-user account (`20261021050000:97,133`).
  4. Root: the module-era store was per conversation, and the per-user tables built since (`career_events`, `career_apply_jobs`) are not what `list_applications` or the tracker read.
- **Class:** BOTH.
- **Severity:** 7. Likelihood: every multi-surface user. Harm: a wrong answer ("I don't have that").
- **Evidence:** VERIFIED (`repro_thread.sql`): commit trackStore and profile on thread 1; load on thread 1 returns them; load on thread 2 → `snapshot: null`.
- **Fix:** move tracker and profile stores to a per-user `career:profile` and `career:track` row in `career_watch_kv` (or real tables), loaded by `career_host_load` and written by `career_host_commit` under the same account fence. Merge on first load from the newest thread snapshot. Fail-first test: the repro, expecting the thread-2 load to carry trackStore.
- **Brutal-list rows:** per-thread-state BL-737, 860, 923; BL-669 (TG "what firm did I say…"); part of the memory cluster BL-310–339.

## 8. The two migration runners disagree: after a Trainee go-live, the finance `--pending` runner can never apply anything
- **Symptom:**
  - The owner runs `scripts/launch/go-live.sh` or `apply-rails-and-seed.sh --pending` after `trainee-go-live.sh`. It fails with `policy "career_watch_backend" … already exists` and applies nothing, every time.
  - A fix edited into an already-applied migration is silently skipped by both runners.
- **Why-chain:**
  1. `trainee-go-live.sh` never writes ledger rows for the five EARLIER files (`:331-335`, checked only). It writes no ledger at all when the ledger is missing or empty (`:326-329,345,348`).
  2. `apply-rails-and-seed.sh --pending` backfills only up to `20261011030000` (`:30-39`). It then treats every later file without a ledger row as pending and replays them in one transaction (`:41-47`), including `20261015020000_career_watch_kv.sql`, whose plain `create policy`, `create table` and `create function` are not replayable.
  3. Both runners store `sha256` and never compare it (`trainee-go-live.sh:340-351`; `apply-rails:45`).
  4. Root: two ledgers of truth (the ledger table vs "a mark on the live schema") with no reconciliation.
- **Class:** BACKEND (ops).
- **Severity:** 8. A deploy blocker for every later migration. No data harm: the transaction rolls back.
- **Evidence:** VERIFIED. `apply-rails-and-seed.sh --pending` against the throwaway DB, which has all migrations and no ledger, gives `ledger backfilled up to 20261011030000…`, then `ERROR: policy "career_watch_backend" for table "career_watch_kv" already exists`.
  - All 40 go-live marks evaluate true on the fully migrated DB.
  - Every Trainee file from 20261019 replays cleanly.
  - No function lineage regresses (see "Checked, not found").
- **Fix:**
  - `trainee-go-live.sh` creates the ledger if missing, then records EARLIER files and mark-detected files with their sha.
  - Both runners refuse to proceed (exit with a list) when a ledger row's sha differs from the file's.
  - Test: extend the ledger block of `tests/db/run.sh` to run trainee-go-live's migration step, then `apply-rails --pending`, and expect "no pending migrations".
- **Brutal-list rows:** none (ops).

## 9. No retention anywhere; resume bytes and per-turn receipts kept forever
- **Symptom:** none yet, but it grows without bound. Tailored-resume PDFs (base64) stay in `channel_artifacts` long after `expires_at`. Every chat turn leaves a `career:turn:<thread>:<key>` row holding the full response. `channel_inbound` keeps every message id. `career_outbox` keeps every text, plus rows for people with no channel contact that stay `queued` forever and are re-examined by every minute's claim (`channel_target` lateral, `20261021070000:105-106`). `channel_delivery_runs` gains 1,440 rows a day, and closed postings are never deleted.
- **Why-chain:**
  1. No delete or purge exists for these tables in migrations or functions (grep).
  2. `expires_at` on artifacts is enforced only at read (`20261020000000:14-15`).
  3. Turn receipts are kept even through erase, with the response nulled (`20261021050000:126`).
  4. Side costs:
     - `career_alerts_sent_since` counts every `kind='alert'` row by `deliver_at`, whatever its status, so undelivered alerts eat the weekly cap. It has no index on (kind, deliver_at) (`20261021110000:78-82`).
     - `agent_flow_state` has no `user_id` index, so `career_host_load`'s legacy watch-profile path seq-scans every user's flow state on each turn of anyone without a KV watch profile (`20261015020000:85-90`). This is cheap today (0.5 ms per 9k rows), but it runs on every turn.
- **Class:** BACKEND.
- **Severity:** 9. Low now, rising. Privacy for artifacts.
- **Evidence:** READ, plus VERIFIED EXPLAIN (`repro_loadscan.sql`: `Seq Scan on agent_flow_state … Rows Removed by Filter: 9000`).
- **Fix:** a migration with a nightly `pg_cron` purge:
  - artifacts past `expires_at`;
  - `channel_inbound` older than 30 days;
  - delivery and proactive run rows older than 30 days;
  - outbox rows older than 90 days that are delivered or skipped;
  - outbox rows queued with no contact after 7 days;
  - turn receipts older than 30 days.

  Also `create index on agent_flow_state(user_id)`, and count only `status in ('queued','sending','delivered')` in `career_alerts_sent_since`. Test: seed old rows, run the purge, assert counts.
- **Brutal-list rows:** none.

## 10. The alert schema is one title-only alert per person (DB root of alerts-company-scope)
- **Symptom:** "watch Junior SWE at Quietline" and "also data analyst in Chicago": the first becomes a title watch, and the second replaces it. "Anything at Stripe" cannot be saved at all.
- **Why-chain:**
  1. `career_alert_prefs.user_id` is the primary key (`20261019010001:7`).
  2. The shape check requires 1–10 `keywords` and has no company field (`:17-26`).
  3. The matcher reads title words only (`career_alerts.ts:49-51`).
  4. A richer per-user watch model already exists (module-152 `career:watch-profile` with interests and company opt-outs, plus `career_reminder_outbox`, `20261015020000:45-213`), but only `scripts/career/alerts-host.mjs` drives it. No deployed function calls `career_watch_cycle_commit` or the reminder RPCs (grep), and the host labels it NOT_WIRED (`career_host.js:30`).
  5. Root: two alert schemas, and the shallow one is live.
- **Class:** DEPTH.
- **Severity:** 10. Likelihood: high for targeted users. Harm: a missing feature, honestly limited.
- **Evidence:** VERIFIED (`repro_alert_shape.sql`): `keywords:[]` with `companies` gives a `career_alert_prefs_shape` violation; a second alert gives a `career_alert_prefs_pkey` violation.
- **Fix:** a migration adding `career_alert_watches(id, user_id, keywords[], companies[], locations[], remote_ok, on)` with many rows per user, and backfilling one watch per prefs row. Keep `career_alert_prefs` for tz, quiet hours and counters. Retire or wire the module-152 store, not both. Test: a Stripe-only watch alerts on a Stripe posting and never on another company's same title.
- **Brutal-list rows:** alerts-company-scope BL-088–107 (097*, 102*, 104*, 106*) and BL-495.

## 11. "Today" means three different days
- **Symptom:**
  - "not sent: today's daily limit is already used" at 9 am, for applications made at 11 pm the night before.
  - "stopped … until tomorrow" for a cloud pause that lifts at 5 pm Pacific the same day.
- **Why-chain:**
  1. The apply cap is a rolling 24 h window (`20261020050000:28`, `20261021075000:209`), but the text says "today" (`career_apply_cards.ts:104`).
  2. The cloud person-pause runs until the next UTC midnight (`20261021080000:351-361`).
  3. Provider caps count per UTC day (`20261021070000:151-157`).
  4. Alert counters use the person's local day (`career_proactive_run.ts:49`).
  5. Root: no shared "person's day" helper in SQL; `tz` lives only on `career_alert_prefs`, which defaults to America/New_York (`20261019010001:8`).
- **Class:** BOTH.
- **Severity:** 11. A low-harm wrong answer.
- **Evidence:** READ.
- **Fix:** a SQL helper `career_local_day_start(p_user, p_now)` reading the person's tz. Use it for the apply cap and the person pause. Leave provider caps on UTC, since the provider defines that day. Test: a user in America/Los_Angeles with 25 applications at 23:00 local can apply at 09:00 local.
- **Brutal-list rows:** none named.

---

## Checked, not found (so they need not be re-audited)
- **Cross-user access:**
  - Every function executable by `authenticated` was dumped from `pg_proc` and read (`own_fns.sql`, `core_fns.sql`). Each derives the user from `auth.uid()` or delegates to a `*_for` or `*_core` function that filters `user_id = p_user` or `p_user in (a_user, b_user)`.
  - No `*_for`, `*_as`, `*_core` or service function is executable by anon or authenticated.
  - RLS is on for all career, channel and connector tables. Tables with grants but no policy (`career_kb_*`, `channel_threads`, `channel_pending_approvals`, `channel_artifacts`) deny all rows.
  - The storage policy is scoped to the owner's folder. `connector_view` reveals `other_user` only after both say yes.
  - Residual risk is outside this layer: service-role RPCs trust `p_user` from the edge code (contact-to-user mapping in `channel_inbound.ts`).
- **Later CREATE OR REPLACE dropping a fix:** I diffed the redefinitions of `career_host_commit` (4 definitions), `career_apply_card_push_for`, `career_apply_enqueue`, `career_apply_finish`, `career_apply_claim_own` (both overloads) and `career_apply_extension_begin_own`. Each later definition is a superset of the one before it; nothing was removed.
- **Re-runnability:** every Trainee migration from 20261019 replays cleanly on top of the full set, and all go-live marks are true after a full apply. The five 20261015/16 files are not replayable (see finding 8).
- **Constraints that reject real data:** the ones checked have caller-side guards:
  - mail evidence digits are scrubbed (`career_mail.ts:588`);
  - outreach emails are lowercased (`career_outreach.ts:605`);
  - the stated-facts patch is pre-filtered (`career_host.js:150-166`);
  - tz is validated in TypeScript (`career_alert_store.ts:53-55`).

  Remaining minor ones:
  - `career_apply_wanted` title and company are capped at 200 characters, while `career_postings` allows 500 and 300, so a queue insert can fail on a long title.
  - `agent_flow_state` rejects `pg_column_size >= 512KB` while `career_host_commit` admits snapshots up to 1 MB of text.
  - The `agent_flow_state` key filter rejects any JSON key named `password`, `pan`, `ssn` or `otp` (`20261011010000:10-11`); not traced to a real career store key.
