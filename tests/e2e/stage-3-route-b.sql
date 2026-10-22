-- E2E skeleton, stage 3 — ROUTE B: the Messages cloud card (the C9 route).
-- Service-role producer shows the card (career_apply_message_cloud_card_
-- show_as, 20261024130000), the user taps approve (career_apply_message_
-- card_approve_own -> cloud_tap: queues exactly one card-bound row), then
-- the timed claim takes it. Payload shapes: the repo's own card-cloud
-- fixture (tag 'binding-negative' -> job lever:veeva:synthetic-binding-
-- negative), as in tests/db/pending/career_apply_card_cloud.test.sql.
\set ON_ERROR_STOP on
\ir ../fixtures/card-cloud-db-20261021/fixture.sql
begin;
select pg_temp.cc_seed_sources();
set role service_role;
create temp table rb_card as
 select career_apply_message_cloud_card_show_as(
   '00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-00000000cba1',
   jsonb_build_array(pg_temp.cc_full_item('binding-negative'))) as card;
reset role;
insert into public.e2e_skeleton_state
 select 'routeb_card', jsonb_build_object('id', card->>'id', 'hash', card->>'hash') from rb_card;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000cb01',false);
set role authenticated;
create temp table rb_receipt as
 select career_apply_message_card_approve_own(
   (select (v->>'id')::uuid from public.e2e_skeleton_state where k='routeb_card'),
   (select v->>'hash' from public.e2e_skeleton_state where k='routeb_card')) as receipt;
reset role;
insert into public.e2e_skeleton_state select 'routeb_receipt', receipt from rb_receipt;
commit;
select 'ROUTE_B_CARD_STATE', (select case when approved_at is not null then 'approved' else 'open' end
  from career_apply_message_cards
  where id=(select (v->>'id')::uuid from public.e2e_skeleton_state where k='routeb_card'));
select 'ROUTE_B_JOB', state || '/' || coalesce(source,'null') || '/' || attempts::text
  from career_apply_jobs where job_id='lever:veeva:synthetic-binding-negative';
select 'ROUTE_B_BOUND', count(*)::text from career_message_approval_private.cloud_bound_jobs b
  join career_apply_jobs j on j.id=b.job_row_id
  where j.job_id='lever:veeva:synthetic-binding-negative';
-- The claim (postgres role: the timed claim is granted to no API role; the
-- worker calls career_apply_cloud_claim, its untimed sibling — same
-- predicates, asserted in tests/db/career_apply_cloud.test.sql).
begin;
create temp table rb_claimed as select * from career_apply_cloud_claim_at(6, clock_timestamp());
insert into public.e2e_skeleton_state
 select 'routeb_claimed', jsonb_build_object('id', id, 'lease_token', lease_token, 'job_id', job_id)
   from rb_claimed where job_id='lever:veeva:synthetic-binding-negative';
commit;
select 'ROUTE_B_CLAIMED', count(*)::text from public.e2e_skeleton_state where k='routeb_claimed';
select 'ROUTE_B_JOB_AFTER_CLAIM', state || '/' || coalesce(source,'null') || '/' || attempts::text
  from career_apply_jobs where job_id='lever:veeva:synthetic-binding-negative';
