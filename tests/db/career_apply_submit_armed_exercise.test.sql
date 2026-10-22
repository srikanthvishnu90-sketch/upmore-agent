-- Chunk 100% (night plan 2026-10-22, submit path ARMED): the dry exercise. A synthetic approved batch is walked
-- through approval -> begin -> card tap -> claim -> worker pickup -> finish -> employer confirmation in this
-- disposable database only, with the board boundary STUBBED: no board is driven and no submit click exists
-- anywhere in this file; the stub records the payload hash a real drive would have submitted, and the walk
-- asserts it equals the approved payload's hash. The schema is the branch's final one (tests/db/run.sh order:
-- the card-cloud bridge 20261024130000 and the F-030 cloud begin 20261024140000 are applied at the end). The
-- live database has NEITHER of those two migrations tonight; where the branch's rules are stricter than the
-- live ones, the assertions below say so. Four legs:
--   LEG 0  the live posture, exactly as production stands tonight: no settings rows, every switch off, every
--          gate closed. An approval exists and the begin is still refused; the claim takes nothing.
--   LEG 1  the begin door that IS live (career_apply_extension_begin_agent_own, disposable flag on): the
--          approval is consumed and one row is born claimed (state 'driving', attempts 1, source 'extension').
--          The walk then STOPS at the cloud-claim hop, on purpose and by design: the claim only takes 'queued'
--          rows, so a born-claimed row can never be claimed by the cloud worker.
--   LEG 2  the cloud path through its designed producer on this line: the card-cloud bridge. A cloud card is
--          shown for the applicant (service role), the applicant taps it (career_apply_message_card_approve_own
--          routes the cloud card to the bridge's tap), the tap mints the batch approval with entry = the cloud
--          payload, enqueues the row and binds it (cloud_bound_jobs), and only then does the claim take it:
--          claim -> lease-bound resume read -> stubbed submit (payload hash equality) -> cloud finish ->
--          employer-email confirmation. A bare career_apply_enqueue row, the pre-bridge producer, is refused
--          'not_card_approved' by the claim's own refusal (the bridge's C9) and is asserted as a control.
--   LEG 3  the kill switches at the armed posture: cloud switch off stops new claims, a portal pause refuses
--          a bound queued job, the agent switch off refuses a begin, a revoked approval refuses a begin.
-- Synthetic identities only; the file runs inside one transaction and rolls back.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000e01','armed-gate@example.test'),
 ('00000000-0000-4000-8000-000000000e02','armed-a@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000e01'),('00000000-0000-4000-8000-000000000e02');
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000000e01','career:account','{"epoch":1,"version":1,"paused":false}'),
 ('00000000-0000-4000-8000-000000000e02','career:account','{"epoch":1,"version":1,"paused":false}');
insert into career_apply_questions(id,user_id,key,kind,label,type,state,answer,answered_at) values
 ('00000000-0000-4000-8000-000000000ea1','00000000-0000-4000-8000-000000000e02','fact:full_name','fact','Full name','text','answered','TEST Person',now());

-- The approved entry + payload builders, the contract test's idiom (WO-102): two answers, complete ledger rows,
-- the manifest bound in both, quarantine version d007-v1.
create function pg_temp.ent(job text) returns jsonb language sql as $$
 select jsonb_build_object('version',1,'kind','agent-batch','jobId',job,'company','Test Co','url','https://jobs.lever.co/testco/'||job||'/apply',
  'answers',jsonb_build_array(
    jsonb_build_object('name','email','label','Email','value','test@example.test','shown','test@example.test','kind','text','factId','F-012','file',null),
    jsonb_build_object('name','name','label','Full name','value','TEST Person','shown','TEST Person','kind','text','factId','text-answer:00000000-0000-4000-8000-000000000ea1','file',null)),
  'blank',jsonb_build_array('Anything else?'),
  'ledger',jsonb_build_array(
    jsonb_build_object('application_id',job,'field_id','email','question_hash',repeat('1',64),'answer_hash',repeat('2',64),
      'fact_refs',jsonb_build_array('F-012'),'source_refs',jsonb_build_array('owner stated this in chat'),'confirmation_event_id','chat:event-12','derivation_rule','verbatim'),
    jsonb_build_object('application_id',job,'field_id','name','question_hash',repeat('3',64),'answer_hash',repeat('4',64),
      'fact_refs',jsonb_build_array('text-answer:00000000-0000-4000-8000-000000000ea1'),'source_refs',jsonb_build_array('owner answered this question (text-answer:00000000-0000-4000-8000-000000000ea1)'),
      'confirmation_event_id','text-answer:00000000-0000-4000-8000-000000000ea1','derivation_rule','verbatim')),
  'question_set_hash',repeat('5',64),'manifest_hash',repeat('6',64),'quarantine_version','d007-v1')
$$;
create function pg_temp.pay(job text) returns jsonb language sql as $$
 select jsonb_build_object('manifest_hash',repeat('6',64),'quarantine_version','d007-v1','version',1,'source','extension','user_id','00000000-0000-4000-8000-000000000e02',
  'job_id',job,'company','Test Co','url','https://jobs.lever.co/testco/'||job||'/apply','family','lever',
  'fields',jsonb_build_array(
    jsonb_build_object('name','email','label','Email','value','test@example.test','source','trainee','factId','F-012','detail',''),
    jsonb_build_object('name','name','label','Full name','value','TEST Person','source','trainee','factId','text-answer:00000000-0000-4000-8000-000000000ea1','detail','')),
  'resume_name',null,'resume_sha256',null,'privacy_epoch',1,'account_version',1,'expires_at',(now()+interval '2 hours')::text)
$$;
create temp table armed_c(n text primary key, e jsonb not null, p jsonb not null, bh text not null, h text not null);
insert into armed_c select n, pg_temp.ent(n), pg_temp.pay(n),
 encode(sha256(convert_to(career_apply_canonical(pg_temp.ent(n)),'UTF8')),'hex'),
 encode(sha256(convert_to(career_apply_canonical(pg_temp.pay(n)),'UTF8')),'hex')
 from (values('armed-clean'),('armed-clean2'),('armed-clean3')) v(n);
grant select on armed_c to authenticated;
-- The employer's email confirming an application, as the cloud test's stand-in for WO-032's confirmation path.
create function pg_temp.confirm(id uuid, kind text, h text) returns void language plpgsql as $$
declare j career_apply_jobs;
begin
 select * into j from career_apply_jobs where career_apply_jobs.id = confirm.id;
 update career_apply_jobs set state='confirmed', email_confirmed_at=now(), confirmation_mail_hash=h where career_apply_jobs.id = confirm.id;
 insert into career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
 values(j.user_id,'job:'||j.id,kind,j.company,kind||': "thank you for applying" from example.test',h,now());
end $$;
-- The cloud payload + card item builders, the bridge test's idiom (tests/db/pending/career_apply_card_cloud.test.sql):
-- one answered field with its source, the readback the card shows, the resume the worker will read by lease.
create function pg_temp.cp(job text, company text default 'Armed Co') returns jsonb language sql as $$
 select jsonb_build_object('version',1,'user_id','00000000-0000-4000-8000-000000000e02','job_id',job,'company',company,
  'url','https://jobs.lever.co/armed/'||job||'/apply','destination','https://jobs.lever.co/armed/'||job||'/apply',
  'engine_approval',repeat('e',64),'schema_hash',repeat('d',64),
  'resume_sha256',encode(sha256(convert_to('TEST resume','UTF8')),'hex'),
  'fields',jsonb_build_array(jsonb_build_object('name','name','label','Full name','value','TEST Person',
   'factId','TEST-NAME','provenance','own synthetic statement','confirmation_event_id','evt-test-name',
   'source',jsonb_build_object('table','answers','key','full_name','value','TEST Person'))),
  'page_field_names','[]'::jsonb,'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour',
  'manifest_hash',repeat('c',64),'quarantine_version','d007-v1','replay_sources','[]'::jsonb)
$$;
create function pg_temp.ci(job text, company text default 'Armed Co') returns jsonb language sql as $$
 select jsonb_build_object('payload',pg_temp.cp(job,company),
  'hash',encode(sha256(convert_to(career_apply_canonical(pg_temp.cp(job,company)),'UTF8')),'hex'),
  'readback',jsonb_build_object(
   'answers',jsonb_build_array(jsonb_build_object('name','name','label','Full name','value','TEST Person',
    'shown','TEST Person','factId','TEST-NAME','kind','text')),
   'resume_name','armed.pdf','resume_sha256',encode(sha256(convert_to('TEST resume','UTF8')),'hex'),
   'destination','https://jobs.lever.co/armed/'||job||'/apply','blank','[]'::jsonb,'employer_fields','[]'::jsonb))
$$;

-- --------------------------------------------------------------------------------------- LEG 0: the live posture
select t.ok(not career_apply_agent_submit_enabled(),'ARMED-0: with no settings rows the agent submit switch reads off (tonight''s live posture)');
select t.ok(not career_apply_cloud_enabled(),'ARMED-0: the cloud switch reads off');
select t.ok(not career_apply_cloud_open('lever') and not career_apply_cloud_open('greenhouse')
 and not career_apply_cloud_open('ashby') and not career_apply_cloud_open('smartrecruiters'),'ARMED-0: every family gate is closed');
select t.as_user('00000000-0000-4000-8000-000000000e02');set role authenticated;
select t.ok(career_apply_batch_approve_own((select jsonb_agg(jsonb_build_object('entry',e,'hash',bh)) from armed_c)) = 3,
 'ARMED-0: the applicant approves three synthetic entries (the card tap, in the harness)');
select t.must_fail($$select career_apply_extension_begin_agent_own(p,h,bh) from armed_c where n='armed-clean'$$,'agent submit is off',
 'ARMED-0: even a clean approved entry is refused while the switch is off');
reset role;
select t.ok((select count(*)=0 from career_apply_cloud_claim_at(6,now())),'ARMED-0: the claim takes nothing while everything is off');
select t.ok((select count(*)=0 from career_apply_jobs),'ARMED-0: nothing is recorded');

-- --------------------------------------------------------------------------------------- LEG 1: the live begin door
insert into career_cloud_settings(key,value) values('CAREER_AGENT_SUBMIT','on');
select t.as_user('00000000-0000-4000-8000-000000000e02');set role authenticated;
create temp table armed_row as select career_apply_extension_begin_agent_own(p,h,bh) as r from armed_c where n='armed-clean';
select t.ok((select (r->>'payload_hash') = (select h from armed_c where n='armed-clean') and (r->>'lease') is not null from armed_row),
 'ARMED-1: the live begin door starts the clean entry: its row and lease');
reset role;
select t.ok((select count(*) = 1 and bool_and(state='driving' and source='extension' and attempts=1 and agent_batch_hash=(select bh from armed_c where n='armed-clean'))
 from career_apply_jobs where job_id='armed-clean'),'ARMED-1: one row, born claimed (driving, attempts 1), tagged with its batch');
select t.ok((select used_at is not null from career_apply_batch_approvals where job_id='armed-clean'),'ARMED-1: the approval is consumed by the begin');
-- Arm the cloud completely (disposable): the family gate opens on the gate tester's 3 confirmed hand submissions.
insert into career_cloud_settings(key,value) values('CAREER_CLOUD_APPLY','on'),
 ('owner_user_id','00000000-0000-4000-8000-000000000e01'),('gate_user_ids','{00000000-0000-4000-8000-000000000e01}');
do $$declare j career_apply_jobs; n int;
begin
 for n in 1..3 loop
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000e01',true);
  select * into j from career_apply_record_own('ARMED-H'||n,'Hand Co '||n,'https://jobs.lever.co/hand'||n||'/1','submitted_unconfirmed');
  perform pg_temp.confirm(j.id,'received',encode(sha256(convert_to('ARMED-H'||n,'UTF8')),'hex'));
 end loop;
end $$;
select t.ok(career_apply_cloud_open('lever') and not career_apply_cloud_open('greenhouse'),
 'ARMED-1: the disposable family gate opens for lever only, on 3 employer-confirmed hand submissions by the gate tester');
select career_apply_cloud_optin_as('00000000-0000-4000-8000-000000000e02',true,'TEST terms');
select t.ok((select count(*)=0 from career_apply_cloud_claim_at(6,now())),
 'ARMED-1 STOP (named absent hop): with the cloud fully armed the claim still takes nothing - a begin_agent_own row is born claimed and the claim only takes queued rows; the claim-shaped begin for a chat approval is migration 20261024140000, not applied live (tap ii)');

-- --------------------------------------------------------------------------------------- LEG 2: the card-bound cloud walk
-- Eligibility on this line is the bridge's: a TEST user (the production shape is a first-real-card-cloud
-- enrollment row, service-role written). The applicant's thread, TEST flag and kept resume are seeded first.
insert into agent_threads(id,user_id,title) values
 ('00000000-0000-4000-8000-000000000e71','00000000-0000-4000-8000-000000000e02','Synthetic armed thread');
insert into career_message_approval_private.test_users(user_id) values('00000000-0000-4000-8000-000000000e02');
insert into career_apply_cloud_resumes(user_id,sha256,filename,bytes,privacy_epoch)
values('00000000-0000-4000-8000-000000000e02',encode(sha256(convert_to('TEST resume','UTF8')),'hex'),'armed.pdf',convert_to('TEST resume','UTF8'),1);
set role service_role;
create temp table armed_card as select career_apply_message_cloud_card_show_as(
 '00000000-0000-4000-8000-000000000e02','00000000-0000-4000-8000-000000000e71',
 jsonb_build_array(pg_temp.ci('ARMED-C1'))) as c;
reset role;
grant select on armed_card to authenticated;
select t.as_user('00000000-0000-4000-8000-000000000e02');set role authenticated;
create temp table armed_receipt as select career_apply_message_card_approve_own(
 (select (c->>'id')::uuid from armed_card),(select c->>'hash' from armed_card)) as r;
select t.ok((select (r->>'approved_count')::int=1 and jsonb_array_length(r->'jobs')=1 from armed_receipt),
 'ARMED-2: the applicant''s tap on the cloud card approves exactly one item and queues exactly one job');
reset role;
create temp table armed_job as select (r->'jobs'->0->>'id')::uuid as id, (r->'jobs'->0->>'payload_hash') as ph from armed_receipt;
select t.ok((select state='queued' and source is null and attempts=0 and payload=pg_temp.cp('ARMED-C1')
 and payload_hash=(select ph from armed_job) and approval_hash=(select ph from armed_job)
 from career_apply_jobs where id=(select id from armed_job)),
 'ARMED-2: the queued row is the approved payload itself, both hashes the tap''s hash');
select t.ok((select count(*)=1 from career_message_approval_private.cloud_bound_jobs b
 join career_apply_batch_approvals a on a.id=b.approval_id
 where b.job_row_id=(select id from armed_job) and a.entry=pg_temp.cp('ARMED-C1') and a.used_at is not null),
 'ARMED-2: the tap''s binding is durable: a consumed batch approval whose entry is the payload owns the row');
set role service_role;
create temp table armed_claim as select * from career_apply_cloud_claim(1);
reset role;
select t.ok((select count(*)=1 and bool_and(id=(select id from armed_job) and state='driving' and source='cloud' and lease_token is not null
 and payload_hash=(select ph from armed_job) and approval_hash=(select ph from armed_job)) from armed_claim),
 'ARMED-2: the service-role claim takes exactly that row, lease-bound, both hashes the approved hash');
select t.ok((select career_apply_cloud_resume(id,lease_token)->>'filename'='armed.pdf' from armed_claim),
 'ARMED-2: the worker reads the approved resume for the job it holds');
-- THE STUB: the board boundary. A real drive ends here with one submit click carrying this row's payload; the stub
-- fires nothing and records the would-be submit payload hash for the equality assertion below.
do $$declare c career_apply_jobs; begin
 select * into c from career_apply_jobs where id=(select id from armed_job);
 raise notice 'SUBMIT_ARMED_STUB would_submit job_id=% payload_hash=% approval_hash=% (board boundary stubbed: no drive, no click)', c.job_id, c.payload_hash, c.approval_hash;
end $$;
select t.ok((select payload_hash = approval_hash and payload_hash = (select ph from armed_job) from career_apply_jobs where id=(select id from armed_job)),
 'ARMED-2: the would-be submit payload hash equals the approved payload hash, exactly');
select t.ok((select state='submitted_unconfirmed' from career_apply_cloud_finish((select id from armed_claim),(select lease_token from armed_claim),
 'submitted_unconfirmed','{"via":"armed-exercise stub"}'::jsonb,'submitted')),
 'ARMED-2: the finish records the sent application, waiting for the employer''s email');
select pg_temp.confirm((select id from armed_job),'received',repeat('9',64));
select t.ok((select state='confirmed' and email_confirmed_at is not null from career_apply_jobs where id=(select id from armed_job))
 and exists(select from career_mail_events where application_ref='job:'||(select id from armed_job)),
 'ARMED-2: the employer''s email confirms it, and the mail is on record');
select t.ok((select count(*)=1 from career_apply_cloud_events where job_id=(select id from armed_job) and outcome='submitted'),
 'ARMED-2: the submission is in the cloud telemetry once');
-- The control: the pre-bridge producer (a bare enqueue, no card) never becomes a cloud authorization on this line.
create temp table armed_unbound as select (career_apply_enqueue(pg_temp.cp('ARMED-U1','Unbound Co'),
 encode(sha256(convert_to(career_apply_canonical(pg_temp.cp('ARMED-U1','Unbound Co')),'UTF8')),'hex'),
 encode(sha256(convert_to(career_apply_canonical(pg_temp.cp('ARMED-U1','Unbound Co')),'UTF8')),'hex'),25)).id as id;
select t.ok((select career_apply_cloud_refusal(j,now())='not_card_approved' from career_apply_jobs j where id=(select id from armed_unbound)),
 'ARMED-2 CONTROL: a directly enqueued row is refused not_card_approved - on this line the card is the only cloud authorization route (C9)');
select t.ok((select count(*)=0 from career_apply_cloud_claim_at(6,now())) and (select state='queued' from career_apply_jobs where id=(select id from armed_unbound)),
 'ARMED-2 CONTROL: the unbound row is never claimed');

-- --------------------------------------------------------------------------------------- LEG 3: the kill switches, armed
set role service_role;
create temp table armed_card2 as select career_apply_message_cloud_card_show_as(
 '00000000-0000-4000-8000-000000000e02','00000000-0000-4000-8000-000000000e71',
 jsonb_build_array(pg_temp.ci('ARMED-C2','Second Co'))) as c;
reset role;
grant select on armed_card2 to authenticated;
select t.as_user('00000000-0000-4000-8000-000000000e02');set role authenticated;
select career_apply_message_card_approve_own((select (c->>'id')::uuid from armed_card2),(select c->>'hash' from armed_card2));
reset role;
update career_cloud_settings set value='off' where key='CAREER_CLOUD_APPLY';
select t.ok((select count(*)=0 from career_apply_cloud_claim_at(6,now())),'ARMED-3: the cloud kill switch off stops new claims, mid-queue');
update career_cloud_settings set value='on' where key='CAREER_CLOUD_APPLY';
insert into career_apply_cloud_pauses(scope,portal,reason,until) values('portal','lever','TEST pause',now()+interval '1 hour');
select t.ok((select career_apply_cloud_refusal(j,now())='portal_paused' from career_apply_jobs j where job_id='ARMED-C2'),
 'ARMED-3: a portal pause refuses the bound queued job');
delete from career_apply_cloud_pauses;
update career_cloud_settings set value='off' where key='CAREER_AGENT_SUBMIT';
select t.as_user('00000000-0000-4000-8000-000000000e02');set role authenticated;
select t.must_fail($$select career_apply_extension_begin_agent_own(p,h,bh) from armed_c where n='armed-clean2'$$,'agent submit is off',
 'ARMED-3: the agent switch off refuses a begin at the armed posture');
select career_apply_batch_revoke_own();
reset role;
update career_cloud_settings set value='on' where key='CAREER_AGENT_SUBMIT';
select t.as_user('00000000-0000-4000-8000-000000000e02');set role authenticated;
select t.must_fail($$select career_apply_extension_begin_agent_own(p,h,bh) from armed_c where n='armed-clean3'$$,'no live batch approval',
 'ARMED-3: a revoked approval refuses the begin even with the switch on');
reset role;
-- The exercise leaves its disposable world exactly as it found the real one: everything off.
update career_cloud_settings set value='off' where key in ('CAREER_AGENT_SUBMIT','CAREER_CLOUD_APPLY');
select t.ok(not career_apply_agent_submit_enabled() and not career_apply_cloud_enabled(),
 'ARMED-3: the walk ends with both switches off');
rollback;
