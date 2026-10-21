-- REVIEW-1 TESTS ONLY. No migration is applied by this file. Not wired into run.sh yet.
-- WRITTEN / NOT_RUN under the owner's no-apply instruction. All UUIDs/facts are synthetic.
-- First two assertions exercise existing 01401cb4 APIs, not absence of a future function.
-- Their baseline failure must be captured on an authorized disposable DB, never inferred as a runtime result.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-00000000cb01','card-cloud-a@example.test'),
 ('00000000-0000-4000-8000-00000000cb02','card-cloud-b@example.test');
insert into profiles(id) values
 ('00000000-0000-4000-8000-00000000cb01'),('00000000-0000-4000-8000-00000000cb02');
insert into agent_threads(id,user_id,title) values
 ('00000000-0000-4000-8000-00000000cba1','00000000-0000-4000-8000-00000000cb01','Synthetic cloud A'),
 ('00000000-0000-4000-8000-00000000cbb2','00000000-0000-4000-8000-00000000cb02','Synthetic cloud B');
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-00000000cb01','career:account','{"epoch":1,"version":1,"paused":false}'),
 ('00000000-0000-4000-8000-00000000cb02','career:account','{"epoch":1,"version":1,"paused":false}');
-- Local transaction fixtures only. These statements are NOT operator instructions and are not executed now.
delete from career_cloud_settings where key in ('CAREER_CLOUD_APPLY','CAREER_AGENT_SUBMIT','gate_user_ids','owner_user_id');
insert into career_cloud_settings(key,value) values('CAREER_CLOUD_APPLY','off'),('CAREER_AGENT_SUBMIT','off');
select career_apply_cloud_optin_as('00000000-0000-4000-8000-00000000cb01',true,'SYNTHETIC fixture terms');
insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note)
 values('00000000-0000-4000-8000-00000000cb01','lever',5,now()+interval '1 day','SYNTHETIC bridge fixture');

create function pg_temp.cc_hash(p jsonb) returns text language sql as $$
 select encode(sha256(convert_to(public.career_apply_canonical(p),'UTF8')),'hex')
$$;
-- These are SQL boundary fixtures, not evidence of engine eligibility; the worker tests independently run the
-- real planner/manifest/prepare on the captured Veeva form. Never reuse this synthetic He for an employer drive.
create function pg_temp.cc_payload(job text,company text default 'Synthetic cloud employer') returns jsonb
language sql as $$ select jsonb_build_object(
 'version',1,'user_id','00000000-0000-4000-8000-00000000cb01','job_id',job,'company',company,
 'url','https://jobs.lever.co/synthetic/'||job||'/apply',
 'destination','https://jobs.lever.co/synthetic/'||job||'/apply',
 'engine_approval',repeat('e',64),'schema_hash',repeat('d',64),
 'resume_sha256',encode(sha256(convert_to('SYNTHETIC resume','UTF8')),'hex'),
 'fields',jsonb_build_array(jsonb_build_object('name','name','label','Full name','value','Synthetic Person',
  'factId','TEST-NAME','provenance','own synthetic statement','confirmation_event_id','evt-test-name',
  'source',jsonb_build_object('table','answers','key','full_name','value','Synthetic Person'))),
 'page_field_names','[]'::jsonb,'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour',
 'manifest_hash',repeat('c',64),'quarantine_version','d007-v1','replay_sources','[]'::jsonb)
$$;
create function pg_temp.cc_item(p jsonb) returns jsonb language sql as $$
 select jsonb_build_object('payload',p,'hash',pg_temp.cc_hash(p),'readback',jsonb_build_object(
 'answers',p->'fields','resume_name','synthetic.pdf','resume_sha256',p->>'resume_sha256',
 'destination',p->>'destination','blank','[]'::jsonb,'employer_fields','[]'::jsonb))
$$;
create temp table cc_state(k text primary key,v jsonb);
grant all on cc_state to authenticated,service_role;

-- NEW REGRESSION C9a: direct enqueue must not become permission to send.
insert into cc_state values('direct',to_jsonb(career_apply_enqueue(pg_temp.cc_payload('direct'),
 pg_temp.cc_hash(pg_temp.cc_payload('direct')),pg_temp.cc_hash(pg_temp.cc_payload('direct')),25)));
select t.ok((select career_apply_cloud_refusal(j,clock_timestamp())='not_card_approved'
 from career_apply_jobs j where id=(select (v->>'id')::uuid from cc_state where k='direct')),
 'NEW REGRESSION direct_enqueue_not_card_approved: old waiver refusal has no card-binding check');

-- NEW REGRESSION C9b: exercise the old text reply path through prepare/open/answer, not a fabricated queue row.
select t.as_user('00000000-0000-4000-8000-00000000cb01');set role authenticated;
insert into cc_state values('old-prepared',to_jsonb(career_apply_prepare_own(pg_temp.cc_payload('text-yes'),
 array['SYNTHETIC text card - not a tap'])));
insert into cc_state values('old-card',to_jsonb(career_apply_card_open_own(
 array[(select (v->>'id')::uuid from cc_state where k='old-prepared')])));
select career_apply_card_answer_own((select (v->>'id')::uuid from cc_state where k='old-card'),array[1]);
reset role;
select t.ok((select count(*)=1 and bool_and(career_apply_cloud_refusal(j,clock_timestamp())='not_card_approved')
 from career_apply_jobs j where job_id='text-yes'),
 'NEW REGRESSION text_yes_not_card_approved: a texted yes cannot authorize any cloud claim');

-- CLOUD contract, first missing behavior is the full payload producer/tap route, not extension key relaxation.
set role service_role;
insert into career_message_approval_private.test_users(user_id) values
 ('00000000-0000-4000-8000-00000000cb01'),('00000000-0000-4000-8000-00000000cb02');
reset role;
insert into career_apply_cloud_resumes(user_id,sha256,filename,bytes,privacy_epoch)
 values('00000000-0000-4000-8000-00000000cb01',
 encode(sha256(convert_to('SYNTHETIC resume','UTF8')),'hex'),'synthetic.pdf',convert_to('SYNTHETIC resume','UTF8'),1);
set role service_role;
insert into cc_state values('cloud-card',career_apply_message_cloud_card_show_as(
 '00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-00000000cba1',
 jsonb_build_array(pg_temp.cc_item(pg_temp.cc_payload('tap-only','Synthetic tap employer')))));
select t.must_fail($$select career_apply_message_cloud_card_show_as(
 '00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-00000000cbb2',
 jsonb_build_array(pg_temp.cc_item(pg_temp.cc_payload('foreign-thread'))))$$,'not yours',
 'CONTROL foreign_thread: producer cannot cross account threads');
reset role;
select t.as_user('00000000-0000-4000-8000-00000000cb02');set role authenticated;
select t.must_fail($$select career_apply_message_card_approve_own(
 (select (v->>'id')::uuid from cc_state where k='cloud-card'),
 (select v->>'hash' from cc_state where k='cloud-card'))$$,'not yours','CONTROL foreign_card: no foreign tap');
reset role;
select t.as_user('00000000-0000-4000-8000-00000000cb01');set role authenticated;
insert into cc_state values('receipt',career_apply_message_card_approve_own(
 (select (v->>'id')::uuid from cc_state where k='cloud-card'),
 (select v->>'hash' from cc_state where k='cloud-card')));
select t.ok((select count(*)=1 from career_apply_jobs where job_id='tap-only'),
 'NEW REGRESSION tap_cloud_queues_exact: tap queues exactly one frozen payload');
insert into cc_state values('replay',career_apply_message_card_approve_own(
 (select (v->>'id')::uuid from cc_state where k='cloud-card'),
 (select v->>'hash' from cc_state where k='cloud-card')));
select t.ok((select v from cc_state where k='receipt')=(select v from cc_state where k='replay')
 and (select count(*)=1 from career_apply_jobs where job_id='tap-only'),
 'NEW REGRESSION replayed_cloud_tap: identical receipt, no second enqueue or renewal');
reset role;
select t.ok((select j.payload=it->'payload' and j.payload_hash=it->>'hash' and j.approval_hash=it->>'hash'
 and pg_temp.cc_hash(j.payload)=it->>'hash' and j.source is null and j.state='queued' and j.attempts=0
 from career_apply_jobs j,cc_state s,jsonb_array_elements(s.v->'payload'->'items')it
 where j.job_id='tap-only' and s.k='cloud-card'),
 'NEW REGRESSION canonical_card_queue_identity: no late serialization, restamping or route marker in payload');
select t.ok((select count(*)=1 and bool_and(a.entry=j.payload and a.batch_hash=j.payload_hash and a.used_at is not null)
 from career_message_approval_private.cloud_bound_jobs b
 join career_apply_batch_approvals a on a.id=b.approval_id join career_apply_jobs j on j.id=b.job_row_id
 where j.job_id='tap-only'),'NEW REGRESSION durable_id_binding: a specific consumed approval owns this job');
select t.ok((select count(*)=0 from career_apply_cloud_claim_at(6,clock_timestamp())),
 'CONTROL switches_off: recording consent does not execute');

-- Every immutable column is tried; payload attacks recompute both hashes, so equality is not enough.
do $$ declare j career_apply_jobs; p jsonb; col text; val text; q text; begin
 select * into j from career_apply_jobs where job_id='tap-only';
 for col,val in select * from (values
 ('user_id','00000000-0000-4000-8000-00000000cb02'),('job_id','different-posting'),
 ('url','https://jobs.lever.co/other/changed/apply'),('company','Changed company'),
 ('agent_batch_hash',null),('payload_hash',repeat('b',64)),('approval_hash',repeat('b',64)))v(c,v) loop
  q:=format('update public.career_apply_jobs set %I=%L where id=%L',col,val,j.id);
  perform t.must_fail(q,'immutable','queue immutable column '||col);
 end loop;
 for col,val in select * from (values ('answer','Changed person'),('resume',repeat('b',64)),
 ('page-url','https://jobs.lever.co/other/post'),('destination','https://jobs.lever.co/other/post'),
 ('company','Changed company'))v(c,v) loop
  p:=case col when 'answer' then jsonb_set(j.payload,'{fields,0,value}',to_jsonb(val))
   when 'resume' then jsonb_set(j.payload,'{resume_sha256}',to_jsonb(val))
   when 'page-url' then jsonb_set(j.payload,'{url}',to_jsonb(val))
   when 'destination' then jsonb_set(j.payload,'{destination}',to_jsonb(val))
   else jsonb_set(j.payload,'{company}',to_jsonb(val)) end;
  perform t.must_fail(format('update public.career_apply_jobs set payload=%L::jsonb,payload_hash=%L,approval_hash=%L where id=%L',
   p,pg_temp.cc_hash(p),pg_temp.cc_hash(p),j.id),'immutable','NEW cloud postapproval bypass '||col||' despite rehash');
 end loop;
end $$;

-- The immutable origin survives deletion of the visible card/message/thread. Permission is not renewed by it.
delete from agent_threads where id='00000000-0000-4000-8000-00000000cba1';
select t.ok((select count(*)=1 from career_message_approval_private.cloud_bound_jobs b
 join career_apply_jobs j on j.id=b.job_row_id where j.job_id='tap-only'),
 'NEW REGRESSION deleted_thread_preserves_origin: deleting review UI cannot erase the binding');
update career_cloud_settings set value='on' where key in ('CAREER_CLOUD_APPLY','CAREER_AGENT_SUBMIT');
create temp table cc_claimed as select * from career_apply_cloud_claim_at(6,clock_timestamp());
grant select on cc_claimed to service_role;
select t.ok((select count(*)=1 and bool_and(job_id='tap-only' and source='cloud' and attempts=1) from cc_claimed),
 'NEW REGRESSION only_tap_claimed: text/direct remain queued even when both switches are on');
select t.ok(career_apply_cloud_waiver_left('00000000-0000-4000-8000-00000000cb01','lever',clock_timestamp())=4,
 'CONTROL waiver_accounting: exactly one claim consumes exactly one send');
select t.ok((select count(*)=0 from career_apply_cloud_claim_at(6,clock_timestamp())),
 'NEW REGRESSION claimed_once: the same job and unbound alternatives cannot be redriven');
set role service_role;
select t.must_fail($$select career_apply_message_cloud_authorize((select id from cc_claimed),gen_random_uuid(),
 (select payload_hash from cc_claimed))$$,'invalid apply claim','NEW REGRESSION stale_lease_authorize');
select t.must_fail($$select career_apply_cloud_ask((select id from cc_claimed),gen_random_uuid(),'[]')$$,
 'invalid apply claim','CONTROL stale_lease_ask');
select t.must_fail($$select career_apply_cloud_finish((select id from cc_claimed),gen_random_uuid(),
 'not_submitted','{}','not_sent',null)$$,'invalid apply claim','CONTROL stale_lease_finish');
reset role;
update career_message_approval_private.test_users set enabled=false;
set role service_role;
select t.must_fail($$select career_apply_message_cloud_authorize((select id from cc_claimed),
 (select lease_token from cc_claimed),(select payload_hash from cc_claimed))$$,'disabled',
 'NEW REGRESSION disabled_at_effect: authority is read after preparation');
select t.ok((career_apply_cloud_finish((select id from cc_claimed),(select lease_token from cc_claimed),
 'not_submitted','{"reason":"permission_disabled"}','not_sent',null)).state='not_submitted',
 'NEW REGRESSION terminal_receipt_after_disable: refusal evidence is still recordable');
reset role;
rollback;
