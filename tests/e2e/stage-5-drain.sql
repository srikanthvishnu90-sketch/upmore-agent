-- E2E skeleton, stage 5 — the drain's row: a second card-bound QUEUED
-- row for the fixture user (fixture tag 'atomic-last'), produced by
-- the same card machinery as stage 3 but deliberately NOT claimed
-- here: claiming and finishing it is the drain process's job (the
-- skeleton test spawns workers/career-cloud/drain.ts's runDrain over
-- the PG queue against this cluster). Stage 3's row is untouched.
\set ON_ERROR_STOP on
\ir ../fixtures/card-cloud-db-20261021/fixture.sql
begin;
select pg_temp.cc_seed_sources();
set role service_role;
create temp table dr_card as
 select career_apply_message_cloud_card_show_as(
   '00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-00000000cba1',
   jsonb_build_array(pg_temp.cc_full_item('atomic-last'))) as card;
reset role;
insert into public.e2e_skeleton_state
 select 'drain_card', jsonb_build_object('id', card->>'id', 'hash', card->>'hash') from dr_card;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000cb01',false);
set role authenticated;
create temp table dr_receipt as
 select career_apply_message_card_approve_own(
   (select (v->>'id')::uuid from public.e2e_skeleton_state where k='drain_card'),
   (select v->>'hash' from public.e2e_skeleton_state where k='drain_card')) as receipt;
reset role;
insert into public.e2e_skeleton_state select 'drain_receipt', receipt from dr_receipt;
commit;
select 'DRAIN_JOB_QUEUED', state || '/' || coalesce(source,'null') || '/' || attempts::text
  from career_apply_jobs where job_id='lever:veeva:synthetic-atomic-last';
select 'DRAIN_JOB_ID', id::text from career_apply_jobs where job_id='lever:veeva:synthetic-atomic-last';
