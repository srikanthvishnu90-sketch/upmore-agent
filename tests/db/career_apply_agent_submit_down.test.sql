-- The rollback of 20261024090000_career_apply_agent_submit.sql (supabase/rollbacks/...down.sql): up, down, down again,
-- up again, each in one transaction as the owner runs them (psql --single-transaction), every step checked, on rows like
-- live ones (a switch row, a batch approval, a job carrying its batch hash, the cloud switch). The database ends "up".
-- run.sh's loop over *.test.sql meets this file before 20261024090000 is applied there, so it skips itself then; run.sh
-- runs it again at the end, after that migration and career_apply_agent_submit.test.sql.
\set ON_ERROR_STOP on
select to_regclass('public.career_apply_batch_approvals') is not null as agent_submit_up \gset
\if :agent_submit_up
reset role;
-- Rows like live ones, committed, so the down meets them.
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000001091','down-a@example.test') on conflict do nothing;
insert into profiles(id) values('00000000-0000-4000-8000-000000001091') on conflict do nothing;
delete from career_apply_jobs where user_id = '00000000-0000-4000-8000-000000001091';
delete from career_cloud_settings where key in ('CAREER_AGENT_SUBMIT', 'CAREER_CLOUD_APPLY');
insert into career_cloud_settings(key,value) values ('CAREER_AGENT_SUBMIT','on'), ('CAREER_CLOUD_APPLY','off');
insert into career_apply_batch_approvals(user_id,job_id,batch_hash,entry)
 values ('00000000-0000-4000-8000-000000001091','lever:testco:down-1',repeat('c',64),'{"kind":"agent-batch"}');
insert into career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash,agent_batch_hash)
 values ('00000000-0000-4000-8000-000000001091','lever:testco:down-1','Test Co','https://jobs.lever.co/testco/down-1/apply','{}',repeat('a',64),repeat('a',64),repeat('c',64));
select t.ok(career_apply_agent_submit_enabled(), 'up: the switch row reads on before the rollback');

-- ------------------------------------------------------------------------------------------------------------ down
begin;
set local client_min_messages = warning;
\ir ../../supabase/rollbacks/20261024090000_career_apply_agent_submit.down.sql
commit;
select t.ok(to_regclass('public.career_apply_batch_approvals') is null, 'down: the batch approvals table is gone');
select t.ok(not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in
 ('career_apply_agent_submit_enabled','career_apply_batch_approve_own','career_apply_batch_revoke_own','career_apply_extension_begin_agent_own')),
 'down: the switch reader and the three RPCs are gone');
select t.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'career_apply_jobs' and column_name = 'agent_batch_hash'),
 'down: career_apply_jobs.agent_batch_hash is gone');
select t.ok(not exists (select 1 from pg_constraint where conname = 'career_apply_jobs_agent_batch_hash_check'), 'down: its check is gone');
select t.ok((select pg_get_constraintdef(oid) from pg_constraint where conname = 'career_cloud_settings_key_check')
 = $$CHECK ((key = ANY (ARRAY['CAREER_CLOUD_APPLY'::text, 'owner_user_id'::text, 'gate_user_ids'::text])))$$,
 'down: the settings key check is the prior list exactly');
select t.ok(not exists (select 1 from career_cloud_settings where key = 'CAREER_AGENT_SUBMIT'), 'down: the CAREER_AGENT_SUBMIT row is deleted');
select t.must_fail($$insert into career_cloud_settings(key,value) values ('CAREER_AGENT_SUBMIT','on')$$, 'career_cloud_settings_key_check',
 'down: CAREER_AGENT_SUBMIT cannot be set again');
select t.ok((select value from career_cloud_settings where key = 'CAREER_CLOUD_APPLY') = 'off', 'down: the cloud switch row is kept as it was');
select t.ok(exists (select 1 from career_apply_jobs where user_id = '00000000-0000-4000-8000-000000001091' and job_id = 'lever:testco:down-1'),
 'down: the job row is kept (only its column went)');
select t.ok(exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'career_apply_extension_begin_own')
 and exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'career_apply_cloud_enabled'),
 'down: the person''s own begin and the cloud switch reader stay');

-- ------------------------------------------------------------------------------------------------- down again: no-op
begin;
set local client_min_messages = warning;
\ir ../../supabase/rollbacks/20261024090000_career_apply_agent_submit.down.sql
commit;
select t.ok(to_regclass('public.career_apply_batch_approvals') is null
 and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'career_cloud_settings_key_check') not like '%CAREER_AGENT_SUBMIT%',
 'down twice: clean, the same state');

-- ------------------------------------------------------------------------------------------------------- up again
begin;
set local client_min_messages = warning;
\ir ../../supabase/migrations/20261024090000_career_apply_agent_submit.sql
commit;
select t.ok(to_regclass('public.career_apply_batch_approvals') is not null, 'up again: the batch approvals table is back');
select t.ok((select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
 ('career_apply_agent_submit_enabled','career_apply_batch_approve_own','career_apply_batch_revoke_own','career_apply_extension_begin_agent_own')) = 4,
 'up again: the switch reader and the three RPCs are back');
select t.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'career_apply_jobs' and column_name = 'agent_batch_hash')
 and exists (select 1 from pg_constraint where conname = 'career_apply_jobs_agent_batch_hash_check'), 'up again: the column and its check are back');
select t.ok((select agent_batch_hash from career_apply_jobs where job_id = 'lever:testco:down-1') is null, 'up again: the old job''s batch hash is not restored (the rollback lost it)');
select t.ok((select pg_get_constraintdef(oid) from pg_constraint where conname = 'career_cloud_settings_key_check') like '%CAREER_AGENT_SUBMIT%',
 'up again: the settings key check takes CAREER_AGENT_SUBMIT');
select t.ok(not career_apply_agent_submit_enabled(), 'up again: the switch is off (no row)');
select t.ok(exists (select 1 from pg_policies where tablename = 'career_apply_batch_approvals' and policyname = 'career_apply_batch_approvals_owner_read')
 and (select relrowsecurity from pg_class where oid = 'public.career_apply_batch_approvals'::regclass), 'up again: row-level security and the owner-read policy');
select t.ok(has_function_privilege('authenticated', 'public.career_apply_extension_begin_agent_own(jsonb,text,text)', 'execute')
 and not has_function_privilege('anon', 'public.career_apply_extension_begin_agent_own(jsonb,text,text)', 'execute')
 and not has_function_privilege('authenticated', 'public.career_apply_agent_submit_enabled()', 'execute'),
 'up again: the grants are the migration''s (signed-in callers only; the switch reader is not callable)');

-- Leave nothing behind.
delete from career_apply_jobs where user_id = '00000000-0000-4000-8000-000000001091';
delete from career_cloud_settings where key = 'CAREER_CLOUD_APPLY';
delete from profiles where id = '00000000-0000-4000-8000-000000001091';
delete from auth.users where id = '00000000-0000-4000-8000-000000001091';
\else
\echo '  skip   20261024090000 is not applied yet here; run.sh runs this file again at the end'
\endif
