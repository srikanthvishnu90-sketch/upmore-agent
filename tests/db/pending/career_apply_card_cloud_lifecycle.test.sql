-- TESTS ONLY / WRITTEN / NOT_RUN. Not discovered by run.sh. No migration application here.
-- Requires reviewed bridge implementation and explicit disposable-database authorization.
\if :{?card_cloud_tests_authorized}
\else
 \echo 'NOT_RUN: pass explicit card_cloud_tests_authorized=true on an authorized disposable DB'
 \quit 3
\endif
\if :card_cloud_tests_authorized
\else
 \quit 3
\endif
\set ON_ERROR_STOP on
begin;
reset role;
\ir ../../fixtures/card-cloud-db-20261021/fixture.sql
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-00000000cb01','lifecycle-a@example.test'),
 ('00000000-0000-4000-8000-00000000cb02','lifecycle-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-00000000cb01'),('00000000-0000-4000-8000-00000000cb02');
insert into agent_threads(id,user_id,title) values
 ('00000000-0000-4000-8000-00000000cba1','00000000-0000-4000-8000-00000000cb01','Synthetic lifecycle');
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-00000000cb01','career:account','{"epoch":1,"version":1,"paused":false}');
insert into career_message_approval_private.test_users(user_id) values('00000000-0000-4000-8000-00000000cb01');
insert into career_apply_cloud_resumes(user_id,sha256,filename,bytes,privacy_epoch)
 values('00000000-0000-4000-8000-00000000cb01',encode(sha256(convert_to('%PDF-1.4 SYNTHETIC TEST RESUME','UTF8')),'hex'),
 'synthetic.pdf',convert_to('%PDF-1.4 SYNTHETIC TEST RESUME','UTF8'),1);
create temp table cc_state(k text primary key,v jsonb);
grant all on cc_state to authenticated,service_role;
create function pg_temp.cc_hash(p jsonb) returns text language sql as $$
 select encode(sha256(convert_to(public.career_apply_canonical(p),'UTF8')),'hex') $$;
create function pg_temp.cc_show(tag text) returns jsonb language sql as $$
 select public.career_apply_message_cloud_card_show_as('00000000-0000-4000-8000-00000000cb01',
 '00000000-0000-4000-8000-00000000cba1',jsonb_build_array(pg_temp.cc_full_item(tag))) $$;

-- Atomic batch: a real last-item duplicate must undo the first enqueue and all permission consumption.
insert into cc_state values('duplicate-item',pg_temp.cc_full_item('atomic-last'));
select career_apply_enqueue((select v->'payload' from cc_state where k='duplicate-item'),
 (select v->>'hash' from cc_state where k='duplicate-item'),(select v->>'hash' from cc_state where k='duplicate-item'),25);
insert into cc_state values('atomic-card',career_apply_message_cloud_card_show_as(
 '00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-00000000cba1',
 jsonb_build_array(pg_temp.cc_full_item('atomic-first'),(select v from cc_state where k='duplicate-item'))));
select t.as_user('00000000-0000-4000-8000-00000000cb01');set role authenticated;
select t.must_fail($$select career_apply_message_card_approve_own(
 (select (v->>'id')::uuid from cc_state where k='atomic-card'),(select v->>'hash' from cc_state where k='atomic-card'))$$,
 'duplicate','atomic_last_failure: duplicate final posting rolls back entire tap');
reset role;
select t.ok(not exists(select 1 from career_apply_jobs where job_id='lever:veeva:synthetic-atomic-first')
 and (select count(*)=1 from career_apply_jobs where job_id='lever:veeva:synthetic-atomic-last'),
 'atomic_no_partial_jobs: original duplicate alone survives');
select t.ok((select approved_at is null from career_apply_message_cards where id=(select (v->>'id')::uuid from cc_state where k='atomic-card'))
 and not exists(select 1 from career_message_approval_private.cloud_bound_jobs where card_id=(select (v->>'id')::uuid from cc_state where k='atomic-card'))
 and not exists(select 1 from career_message_approval_private.cloud_bound_approvals where card_id=(select (v->>'id')::uuid from cc_state where k='atomic-card')),
 'atomic_card_open_no_used_permission: failed tap leaves no binding or consumed approval');

-- Unknown-key attacks consistently rehash P; exact producer shape, not caller hash, is decisive.
do $$ declare item jsonb;p jsonb;kind text;begin
 for kind in select unnest(array['top','field']) loop
  item:=pg_temp.cc_full_item('unknown-'||kind);p:=item->'payload';
  if kind='top' then p:=p||'{"unexpected_authority":"yes"}'::jsonb;
  else p:=jsonb_set(p,'{fields,0,unexpected_authority}','"yes"');end if;
  item:=jsonb_set(jsonb_set(item,'{payload}',p),'{hash}',to_jsonb(pg_temp.cc_hash(p)));
  perform t.must_fail(format('select career_apply_message_cloud_card_show_as(%L,%L,%L::jsonb)',
   '00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-00000000cba1',jsonb_build_array(item)),
   'unknown|unexpected|invalid','unknown_'||kind||'_key_refused_even_rehashed');
 end loop;
end $$;

-- Explicit BANK factId is quarantined. Raw chat id:F-033 is a separate fixture/control, never relabelled bank proof.
do $$ declare item jsonb;p jsonb;begin
 item:=pg_temp.cc_full_item('bank-quarantined');p:=jsonb_set(item->'payload','{fields,0,factId}','"F-033"');
 item:=jsonb_set(jsonb_set(item,'{payload}',p),'{hash}',to_jsonb(pg_temp.cc_hash(p)));
 perform t.must_fail(format('select career_apply_message_cloud_card_show_as(%L,%L,%L::jsonb)',
  '00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-00000000cba1',jsonb_build_array(item)),
  'quarantin|contract|manifest','bank_factId_F033_refused');
end $$;
-- Actual raw id:F033 -> engine_input normalization is Claude-owned and NOT_RUN; see fixture evidence.
-- This positive proves only that a full canonical P without bank factId F033 is structurally admitted.
insert into cc_state values('own-chat-card',pg_temp.cc_show('own-chat-f033'));
select t.ok((select v->>'id' is not null from cc_state where k='own-chat-card'),'canonical_own_source_positive');

-- A P already expired before display is not offered as valid permission.
do $$ declare item jsonb;p jsonb;deadline jsonb;begin
 item:=pg_temp.cc_full_item('expired');deadline:=to_jsonb((clock_timestamp()-interval '1 second')::text);
 p:=jsonb_set(jsonb_set(item->'payload','{expires_at}',deadline),'{approved_snapshot,original,expires_at}',deadline);
 item:=jsonb_set(jsonb_set(item,'{payload}',p),'{hash}',to_jsonb(pg_temp.cc_hash(p)));
 perform t.must_fail(format('select career_apply_message_cloud_card_show_as(%L,%L,%L::jsonb)',
  '00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-00000000cba1',jsonb_build_array(item)),
  'expired|stale','expired_before_display_refused');
end $$;

-- Exact same P on a later card cannot renew the old queued job or create a replacement approval.
insert into cc_state values('renew-item',pg_temp.cc_full_item('renewal'));
insert into cc_state values('renew-card',career_apply_message_cloud_card_show_as(
 '00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-00000000cba1',
 jsonb_build_array((select v from cc_state where k='renew-item'))));
select t.as_user('00000000-0000-4000-8000-00000000cb01');set role authenticated;
insert into cc_state values('renew-receipt',career_apply_message_card_approve_own(
 (select (v->>'id')::uuid from cc_state where k='renew-card'),(select v->>'hash' from cc_state where k='renew-card')));
reset role;
create temp table cc_original as select b.job_row_id,b.approval_id,a.approved_at,a.expires_at from
 career_message_approval_private.cloud_bound_jobs b join career_message_approval_private.cloud_bound_approvals a on a.approval_id=b.approval_id
 where b.card_id=(select (v->>'id')::uuid from cc_state where k='renew-card');
insert into cc_state values('later-card',career_apply_message_cloud_card_show_as(
 '00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-00000000cba1',
 jsonb_build_array((select v from cc_state where k='renew-item'))));
select t.as_user('00000000-0000-4000-8000-00000000cb01');set role authenticated;
select t.must_fail($$select career_apply_message_card_approve_own(
 (select (v->>'id')::uuid from cc_state where k='later-card'),(select v->>'hash' from cc_state where k='later-card'))$$,
 'duplicate','later_same_entry_cannot_renew_original');
reset role;
select t.ok((select count(*)=1 and bool_and(b.approval_id=o.approval_id and a.expires_at=o.expires_at and a.approved_at=o.approved_at)
 from cc_original o join career_message_approval_private.cloud_bound_jobs b on b.job_row_id=o.job_row_id
 join career_message_approval_private.cloud_bound_approvals a on a.approval_id=b.approval_id),'original_approval_id_and_deadline_unchanged');

-- Ordinary account grant is intentionally separate from TEST eligibility. Proposed columns must match reviewed migration.
delete from career_message_approval_private.test_users where user_id='00000000-0000-4000-8000-00000000cb01';
select t.must_fail($$select pg_temp.cc_show('ordinary')$$,'enroll|eligible|disabled|TEST','ordinary_without_grant_refused');
insert into career_message_approval_private.cloud_card_enrollments(user_id,purpose,created_at,expires_at,approval_ref)
 values('00000000-0000-4000-8000-00000000cb01','first-real-card-cloud',clock_timestamp(),clock_timestamp()+interval '1 hour','SYNTHETIC operator approval');
insert into cc_state values('ordinary-card',pg_temp.cc_show('ordinary'));
select t.as_user('00000000-0000-4000-8000-00000000cb01');set role authenticated;
select t.ok(not career_apply_message_card_test_enabled_own(),'ordinary_enrollment_does_not_enable_v1_TEST_mode');
select t.ok((career_apply_message_card_read_own((select (v->>'id')::uuid from cc_state where k='ordinary-card')))->>'id' is not null,
 'ordinary_exact_grant_reads_cloud_card');
reset role;
update career_message_approval_private.cloud_card_enrollments set revoked_at=clock_timestamp()
 where user_id='00000000-0000-4000-8000-00000000cb01';
select t.must_fail($$select pg_temp.cc_show('ordinary-revoked')$$,'revok|eligible|disabled|enroll','revoked_ordinary_grant_refused');
update career_message_approval_private.cloud_card_enrollments set revoked_at=null,created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour'
 where user_id='00000000-0000-4000-8000-00000000cb01';
select t.must_fail($$select pg_temp.cc_show('ordinary-expired')$$,'expired|eligible|disabled|enroll','expired_ordinary_grant_refused');
set role authenticated;
select t.must_fail($$insert into career_message_approval_private.cloud_card_enrollments(user_id,purpose,created_at,expires_at,approval_ref)
 values('00000000-0000-4000-8000-00000000cb02','first-real-card-cloud',clock_timestamp(),clock_timestamp()+interval '1 hour','fake client')$$,
 'permission denied','client_cannot_self_enroll');
reset role;
rollback;
