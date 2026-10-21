-- Read-only proof that the browser extension's apply path has its schema on a database (docs/apply/DEPLOY-LIVE-APPLY.md).
--   psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -f scripts/launch/verify-apply-schema.sql
-- One row per check: area | check | ok. Then four verdicts:
--   apply path ready     every precondition, RPC, helper, table, column, constraint and grant the extension's apply path
--                        needs (the 16-file closure in DEPLOY-LIVE-APPLY.md), and each of those files' go-live mark
--   full go-live set     all 40 MIGRATION_MARK entries of scripts/launch/trainee-go-live.sh and its 5 EARLIER marks, with
--                        everything above (the recommended option)
--   switches at rest     CAREER_AGENT_SUBMIT and CAREER_CLOUD_APPLY are both not 'on' (anything but 'on' is off)
--   go-live ledger read  public.upmore_migration_ledger exists, so trainee-go-live.sh step 2's first read works (not
--                        needed by the apply path or by the psql loop in DEPLOY-LIVE-APPLY.md)
-- It runs inside a READ ONLY transaction and ends with rollback: it cannot change anything. No secret is read or printed;
-- the switch values are shown, and nothing else from any table.
\set ON_ERROR_STOP on
begin transaction read only;
-- The two switch values, read only when career_cloud_settings exists (on a database without it they read 'no table').
with sw as (
  select k, case when to_regclass('public.career_cloud_settings') is null then 'no table'
    else coalesce((xpath('/table/row/v/text()', query_to_xml(format('select value as v from public.career_cloud_settings where key = %L', k), false, false, '')))[1]::text, 'no row')
    end as v
  from unnest(array['CAREER_AGENT_SUBMIT', 'CAREER_CLOUD_APPLY']) k
),
c(area, req, name, ok) as (values
  -- Preconditions: what the Trainee migrations stand on (go-live's EARLIER list, checked never applied; and the platform).
  ('pre', 'apply', 'auth.users exists', to_regclass('auth.users') is not null),
  ('pre', 'apply', 'public.profiles exists', to_regclass('public.profiles') is not null),
  ('pre', 'apply', 'roles anon, authenticated, service_role exist', (select count(*) = 3 from pg_roles where rolname in ('anon', 'authenticated', 'service_role'))),
  ('pre', 'apply', 'Postgres 14 or later (gen_random_uuid and sha256 built in)', current_setting('server_version_num')::int >= 140000),
  ('pre', 'full',  'EARLIER 20261015010000_career_knowledge_base', to_regclass('public.career_kb_roles') is not null),
  ('pre', 'apply', 'EARLIER 20261015020000_career_watch_kv', to_regclass('public.career_reminder_outbox') is not null),
  ('pre', 'full',  'EARLIER 20261015234000_career_task_intents_v1', to_regclass('public.career_task_intents_v1') is not null),
  ('pre', 'full',  'EARLIER 20261016010000_career_batch_intents_v1', to_regclass('public.career_batch_ledgers_v1') is not null),
  ('pre', 'full',  'EARLIER 20261016120000_career_account_stated_facts', exists (select 1 from pg_proc where proname = 'career_host_commit' and prosrc like '%stated_facts%')),
  ('pre', 'apply', 'career_watch_kv exists (the account the apply RPCs read)', to_regclass('public.career_watch_kv') is not null),
  -- Not the schema's: trainee-go-live.sh step 2's first read names public.upmore_migration_ledger inside a CASE, and
  -- Postgres resolves the name before it runs, so without the table that read fails and the run stops (applying nothing).
  ('pre', 'golive', 'upmore_migration_ledger exists (trainee-go-live.sh step 2 reads it first)', to_regclass('public.upmore_migration_ledger') is not null),

  -- The RPCs the extension calls (extension/background.js): exact signature, security definer, signed-in callers only.
  ('rpc', 'apply', 'career_apply_extension_begin_own(jsonb,text)', to_regprocedure('public.career_apply_extension_begin_own(jsonb,text)') is not null),
  ('rpc', 'apply', 'career_apply_finish_own(uuid,uuid,text,jsonb)', to_regprocedure('public.career_apply_finish_own(uuid,uuid,text,jsonb)') is not null),
  ('rpc', 'apply', 'career_apply_account_own()', to_regprocedure('public.career_apply_account_own()') is not null),
  ('rpc', 'apply', 'career_apply_answers_own()', to_regprocedure('public.career_apply_answers_own()') is not null),
  ('rpc', 'apply', 'career_apply_questions_put_own(text,jsonb)', to_regprocedure('public.career_apply_questions_put_own(text,jsonb)') is not null),
  ('rpc', 'apply', 'career_apply_questions_answer_from_form_own(text,jsonb)', to_regprocedure('public.career_apply_questions_answer_from_form_own(text,jsonb)') is not null),
  ('rpc', 'apply', 'career_apply_batch_approve_own(jsonb)', to_regprocedure('public.career_apply_batch_approve_own(jsonb)') is not null),
  ('rpc', 'apply', 'career_apply_batch_revoke_own()', to_regprocedure('public.career_apply_batch_revoke_own()') is not null),
  ('rpc', 'apply', 'career_apply_extension_begin_agent_own(jsonb,text,text)', to_regprocedure('public.career_apply_extension_begin_agent_own(jsonb,text,text)') is not null),
  ('rpc', 'apply', 'career_apply_want_take_own(text[]) ("Trainee''s picks")', to_regprocedure('public.career_apply_want_take_own(text[])') is not null),
  ('rpc', 'apply', 'every extension RPC is security definer',
    (select count(*) = 10 from pg_proc where prosecdef and oid in (
      to_regprocedure('public.career_apply_extension_begin_own(jsonb,text)'), to_regprocedure('public.career_apply_finish_own(uuid,uuid,text,jsonb)'),
      to_regprocedure('public.career_apply_account_own()'), to_regprocedure('public.career_apply_answers_own()'),
      to_regprocedure('public.career_apply_questions_put_own(text,jsonb)'), to_regprocedure('public.career_apply_questions_answer_from_form_own(text,jsonb)'),
      to_regprocedure('public.career_apply_batch_approve_own(jsonb)'), to_regprocedure('public.career_apply_batch_revoke_own()'),
      to_regprocedure('public.career_apply_extension_begin_agent_own(jsonb,text,text)'), to_regprocedure('public.career_apply_want_take_own(text[])')))),
  ('rpc', 'apply', 'authenticated may execute every extension RPC',
    (select count(*) = 10 from unnest(array[
      to_regprocedure('public.career_apply_extension_begin_own(jsonb,text)'), to_regprocedure('public.career_apply_finish_own(uuid,uuid,text,jsonb)'),
      to_regprocedure('public.career_apply_account_own()'), to_regprocedure('public.career_apply_answers_own()'),
      to_regprocedure('public.career_apply_questions_put_own(text,jsonb)'), to_regprocedure('public.career_apply_questions_answer_from_form_own(text,jsonb)'),
      to_regprocedure('public.career_apply_batch_approve_own(jsonb)'), to_regprocedure('public.career_apply_batch_revoke_own()'),
      to_regprocedure('public.career_apply_extension_begin_agent_own(jsonb,text,text)'), to_regprocedure('public.career_apply_want_take_own(text[])')]) f
     where coalesce(has_function_privilege('authenticated', f::oid, 'execute'), false))),
  ('rpc', 'apply', 'anon may execute none of them',
    not exists (select 1 from unnest(array[
      to_regprocedure('public.career_apply_extension_begin_own(jsonb,text)'), to_regprocedure('public.career_apply_finish_own(uuid,uuid,text,jsonb)'),
      to_regprocedure('public.career_apply_account_own()'), to_regprocedure('public.career_apply_answers_own()'),
      to_regprocedure('public.career_apply_questions_put_own(text,jsonb)'), to_regprocedure('public.career_apply_questions_answer_from_form_own(text,jsonb)'),
      to_regprocedure('public.career_apply_batch_approve_own(jsonb)'), to_regprocedure('public.career_apply_batch_revoke_own()'),
      to_regprocedure('public.career_apply_extension_begin_agent_own(jsonb,text,text)'), to_regprocedure('public.career_apply_want_take_own(text[])')]) f
     where coalesce(has_function_privilege('anon', f::oid, 'execute'), false))),

  -- What those RPCs call inside (each one's latest definition, as the closure found them).
  ('dep', 'apply', 'career_apply_canonical(jsonb) (the shared SHA-256 canonical form)', to_regprocedure('public.career_apply_canonical(jsonb)') is not null),
  ('dep', 'apply', 'career_apply_enqueue(jsonb,text,text,integer)', to_regprocedure('public.career_apply_enqueue(jsonb,text,text,integer)') is not null),
  ('dep', 'apply', 'career_apply_daily_limit(uuid)', to_regprocedure('public.career_apply_daily_limit(uuid)') is not null),
  ('dep', 'apply', 'career_apply_finish(uuid,uuid,text,jsonb)', to_regprocedure('public.career_apply_finish(uuid,uuid,text,jsonb)') is not null),
  ('dep', 'apply', 'career_apply_current(uuid,jsonb) (approval freshness, WO-092)', to_regprocedure('public.career_apply_current(uuid,jsonb)') is not null),
  ('dep', 'apply', 'career_apply_cloud_enabled() (the cloud switch reader)', to_regprocedure('public.career_apply_cloud_enabled()') is not null),
  ('dep', 'apply', 'career_apply_agent_submit_enabled() (the agent switch reader)', to_regprocedure('public.career_apply_agent_submit_enabled()') is not null),
  ('dep', 'apply', 'the switch readers are not callable by clients',
    not coalesce(has_function_privilege('authenticated', to_regprocedure('public.career_apply_agent_submit_enabled()')::oid, 'execute'), false)
    and not coalesce(has_function_privilege('anon', to_regprocedure('public.career_apply_agent_submit_enabled()')::oid, 'execute'), false)),

  -- Tables, row-level security, and the two the extension reads directly over REST (only the person's own rows).
  ('tbl', 'apply', 'career_apply_jobs', to_regclass('public.career_apply_jobs') is not null),
  ('tbl', 'apply', 'career_apply_questions', to_regclass('public.career_apply_questions') is not null),
  ('tbl', 'apply', 'career_cloud_settings', to_regclass('public.career_cloud_settings') is not null),
  ('tbl', 'apply', 'career_apply_batch_approvals', to_regclass('public.career_apply_batch_approvals') is not null),
  ('tbl', 'apply', 'career_apply_wanted', to_regclass('public.career_apply_wanted') is not null),
  ('tbl', 'apply', 'career_outbox', to_regclass('public.career_outbox') is not null),
  ('tbl', 'apply', 'career_postings', to_regclass('public.career_postings') is not null),
  ('tbl', 'apply', 'row-level security on each of those seven',
    (select count(*) = 7 from pg_class where relrowsecurity and oid in (to_regclass('public.career_apply_jobs'), to_regclass('public.career_apply_questions'),
      to_regclass('public.career_cloud_settings'), to_regclass('public.career_apply_batch_approvals'), to_regclass('public.career_apply_wanted'),
      to_regclass('public.career_outbox'), to_regclass('public.career_postings')))),
  ('tbl', 'apply', 'authenticated may select career_outbox and career_apply_wanted (the extension reads them)',
    coalesce(has_table_privilege('authenticated', to_regclass('public.career_outbox')::oid, 'select'), false)
    and coalesce(has_table_privilege('authenticated', to_regclass('public.career_apply_wanted')::oid, 'select'), false)),
  ('tbl', 'apply', 'clients may not read or write career_cloud_settings',
    not coalesce(has_table_privilege('authenticated', to_regclass('public.career_cloud_settings')::oid, 'select,insert,update,delete'), false)
    and not coalesce(has_table_privilege('anon', to_regclass('public.career_cloud_settings')::oid, 'select,insert,update,delete'), false)),
  ('tbl', 'apply', 'clients may only select career_apply_batch_approvals (writes go through the RPCs)',
    not coalesce(has_table_privilege('authenticated', to_regclass('public.career_apply_batch_approvals')::oid, 'insert,update,delete'), false)
    and not coalesce(has_table_privilege('anon', to_regclass('public.career_apply_batch_approvals')::oid, 'select,insert,update,delete'), false)),

  -- Columns and constraints the latest migrations add.
  ('col', 'apply', 'career_apply_jobs.agent_batch_hash (20261024090000)',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'career_apply_jobs' and column_name = 'agent_batch_hash')),
  ('col', 'apply', 'career_apply_jobs.source (20261021075000)',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'career_apply_jobs' and column_name = 'source')),
  ('col', 'apply', 'career_apply_jobs.resume_sha256 (20261020130000)',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'career_apply_jobs' and column_name = 'resume_sha256')),
  ('col', 'apply', 'career_apply_questions.ai_policy (20261020070000)',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'career_apply_questions' and column_name = 'ai_policy')),
  ('con', 'apply', 'career_cloud_settings_key_check takes CAREER_AGENT_SUBMIT',
    exists (select 1 from pg_constraint where conname = 'career_cloud_settings_key_check' and pg_get_constraintdef(oid) like '%CAREER_AGENT_SUBMIT%')),
  ('con', 'apply', 'career_apply_jobs_agent_batch_hash_check', exists (select 1 from pg_constraint where conname = 'career_apply_jobs_agent_batch_hash_check')),
  ('con', 'apply', 'career_outbox_kind_check takes ''questions'' (20261021075000 is the last word on it)',
    exists (select 1 from pg_constraint where conname = 'career_outbox_kind_check' and pg_get_constraintdef(oid) like '%''questions''%')),

  -- The switches, at rest: both off. CAREER_AGENT_SUBMIT is 'on' only for the minutes of an owner-run send.
  ('switch', 'rest', 'CAREER_AGENT_SUBMIT is not on (value: ' || (select v from sw where k = 'CAREER_AGENT_SUBMIT') || ')',
    (select v <> 'on' from sw where k = 'CAREER_AGENT_SUBMIT')),
  ('switch', 'rest', 'CAREER_CLOUD_APPLY is not on (value: ' || (select v from sw where k = 'CAREER_CLOUD_APPLY') || ')',
    (select v <> 'on' from sw where k = 'CAREER_CLOUD_APPLY')),

  -- Every MIGRATION_MARK of scripts/launch/trainee-go-live.sh, in its order ('apply': a file of the apply-path closure).
  ('mark', 'full',  '20261019000000_channel_threads', to_regclass('public.channel_threads') is not null),
  ('mark', 'apply', '20261019000001_career_postings', to_regclass('public.career_ingest_state') is not null),
  ('mark', 'full',  '20261019010000_channel_pending_approvals', to_regclass('public.channel_pending_approvals') is not null),
  ('mark', 'apply', '20261019010001_career_alerts', to_regclass('public.career_proactive_runs') is not null),
  ('mark', 'full',  '20261019020000_channel_delivery', exists (select 1 from pg_proc where proname = 'career_outbox_contacts_on')),
  ('mark', 'full',  '20261019030000_channel_inbound', exists (select 1 from pg_proc where proname = 'career_outbox_claim_key')),
  ('mark', 'full',  '20261020000000_channel_artifacts', to_regclass('public.channel_artifacts') is not null),
  ('mark', 'apply', '20261020000001_career_apply_jobs', to_regclass('public.career_apply_jobs') is not null),
  ('mark', 'apply', '20261020010000_career_apply_own_worker', exists (select 1 from pg_proc where proname = 'career_apply_claim_own')),
  ('mark', 'full',  '20261020020000_career_apply_receipts', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'career_proactive_runs' and column_name = 'receipts')),
  ('mark', 'apply', '20261020030000_career_apply_cards', to_regclass('public.career_apply_cards') is not null),
  ('mark', 'full',  '20261020040000_career_apply_card_push', exists (select 1 from pg_proc where proname = 'career_apply_card_push_for')),
  ('mark', 'apply', '20261020050000_career_apply_daily_limit', exists (select 1 from pg_proc where proname = 'career_apply_daily_limit')),
  ('mark', 'apply', '20261020060000_career_apply_questions', to_regclass('public.career_apply_questions') is not null),
  ('mark', 'apply', '20261020070000_career_apply_questions_ai_policy', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'career_apply_questions' and column_name = 'ai_policy')),
  ('mark', 'apply', '20261020100000_career_mail_tracking', to_regclass('public.career_mail_events') is not null),
  ('mark', 'full',  '20261020110000_career_connector', to_regclass('public.connector_intros') is not null),
  ('mark', 'full',  '20261020120000_career_events', to_regclass('public.career_events') is not null),
  ('mark', 'full',  '20261020120100_career_events_erase', exists (select 1 from pg_proc where proname = 'career_host_commit' and prosrc like '%career_events%')),
  ('mark', 'apply', '20261020130000_career_resume_tailoring', exists (select 1 from pg_proc where proname = 'career_apply_resume_tag')),
  ('mark', 'full',  '20261021000000_career_apply_extension', exists (select 1 from pg_proc where proname = 'career_apply_extension_begin_own')),
  ('mark', 'full',  '20261021010000_career_outreach', exists (select 1 from pg_proc where proname = 'career_outreach_claim')),
  ('mark', 'full',  '20261021020000_career_voice_mock', exists (select 1 from pg_proc where proname = 'career_voice_create')),
  ('mark', 'full',  '20261021030000_career_hired_backgrounds', to_regclass('public.career_pdl_calls') is not null),
  ('mark', 'full',  '20261021050000_career_brief_digest', exists (select 1 from pg_proc where proname = 'career_host_commit' and prosrc like '%career_interviews%')),
  ('mark', 'full',  '20261021070000_channel_parity', exists (select 1 from pg_proc where proname = 'channel_link_nonce_redeem')),
  ('mark', 'apply', '20261021075000_career_apply_ops', exists (select 1 from pg_proc where proname = 'career_apply_gate_status')),
  ('mark', 'apply', '20261021080000_career_apply_cloud', exists (select 1 from pg_proc where proname = 'career_apply_cloud_open')),
  ('mark', 'full',  '20261021090000_career_mail_erase', exists (select 1 from pg_proc where proname = 'career_mail_on_erase')),
  ('mark', 'full',  '20261021100000_career_proactive_last_word', exists (select 1 from pg_proc where proname = 'career_outbox_to_thread')),
  ('mark', 'full',  '20261021110000_career_board_state', to_regclass('public.career_board_state') is not null),
  ('mark', 'apply', '20261021120000_career_apply_form_answers', exists (select 1 from pg_proc where proname = 'career_apply_questions_answer_from_form_own')),
  ('mark', 'full',  '20261021130000_career_mail_model_calls', exists (select 1 from pg_proc where proname = 'career_mail_model_claim')),
  ('mark', 'apply', '20261022100000_career_apply_wanted', to_regclass('public.career_apply_wanted') is not null),
  ('mark', 'full',  '20261022110000_career_postings_pay', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'career_postings' and column_name = 'pay')),
  ('mark', 'full',  '20261022120000_career_control_state', exists (select 1 from pg_proc where proname = 'career_quiet_users')),
  ('mark', 'full',  '20261022120500_career_deploy_ledger', to_regclass('public.career_deploy_ledger') is not null),
  ('mark', 'apply', '20261022150000_career_apply_authority', exists (select 1 from pg_proc where proname = 'career_apply_sweep_stale')),
  ('mark', 'full',  '20261023100000_career_events_apply_queued', exists (select 1 from pg_constraint where conname = 'career_events_kind_check' and pg_get_constraintdef(oid) like '%apply_queued%')),
  ('mark', 'apply', '20261024090000_career_apply_agent_submit', to_regclass('public.career_apply_batch_approvals') is not null)
)
select area, name as check, ok from c
union all select '==', 'apply path ready', bool_and(ok) from c where req = 'apply'
union all select '==', 'full go-live set present (' || count(*) filter (where ok) || ' of ' || count(*) || ' checks)', bool_and(ok) from c where req in ('apply', 'full')
union all select '==', 'switches at rest', bool_and(ok) from c where req = 'rest'
union all select '==', 'trainee-go-live.sh step 2 can read its ledger', bool_and(ok) from c where req = 'golive';
rollback;
