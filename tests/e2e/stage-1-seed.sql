-- E2E skeleton, stage 1: synthetic actors + switches for the DISPOSABLE
-- cluster only. Identities: the repo's own card-cloud fixture user
-- (cb01 / thread cba1, bound by tests/fixtures/card-cloud-db-20261021),
-- a gate owner (e200), and a separate chat-begin user (e202, stage 2).
-- Every value below is synthetic; the cluster is thrown away after the run.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-00000000cb01','e2e-applicant@example.test'),
 ('00000000-0000-4000-8000-00000000e200','e2e-gate-owner@example.test'),
 ('00000000-0000-4000-8000-00000000e202','e2e-chat-begin@example.test');
insert into profiles(id) values
 ('00000000-0000-4000-8000-00000000cb01'),
 ('00000000-0000-4000-8000-00000000e200'),
 ('00000000-0000-4000-8000-00000000e202');
insert into agent_threads(id,user_id,title) values
 ('00000000-0000-4000-8000-00000000cba1','00000000-0000-4000-8000-00000000cb01','E2E synthetic thread');
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-00000000cb01','career:account','{"epoch":1,"version":1,"paused":false}'),
 ('00000000-0000-4000-8000-00000000e200','career:account','{"epoch":1,"version":1,"paused":false}'),
 ('00000000-0000-4000-8000-00000000e202','career:account','{"epoch":2,"version":3,"paused":false}');
-- Disposable-cluster switches ON so the doors can be exercised; the live
-- project's settings are untouched (this is a local throwaway Postgres).
insert into career_cloud_settings(key,value) values
 ('CAREER_AGENT_SUBMIT','on'),('CAREER_CLOUD_APPLY','on'),
 ('owner_user_id','00000000-0000-4000-8000-00000000e200'),
 ('gate_user_ids','{00000000-0000-4000-8000-00000000e200}');
select career_apply_cloud_optin_as('00000000-0000-4000-8000-00000000cb01', true, 'E2E synthetic terms');
-- The family gate for lever is opened by the bridge's own waiver row (the
-- mechanism the pending card-cloud test uses), NOT by fake hand submissions.
insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note)
 values('00000000-0000-4000-8000-00000000cb01','lever',5,now()+interval '1 day','E2E skeleton synthetic');
insert into career_message_approval_private.test_users(user_id)
 values('00000000-0000-4000-8000-00000000cb01');
create table public.e2e_skeleton_state(k text primary key, v jsonb);
commit;
select 'E2E_SEED_OK' as marker;
