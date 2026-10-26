-- FEATURE 16 (20261026210016_career_resume_required.sql): OWNER RULE 2026-10-26, "never submit applications without a
-- real resume". A payload with no resume hash is never queued, never claimed, never prepared and never carded; a row
-- queued before the rule is closed as not sent; the resume on file counts only entries whose confirmation event is
-- recorded; a resume file's upload is erased with the account.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000001601','rr-a@example.test'),('00000000-0000-4000-8000-000000001602','rr-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000001601'),('00000000-0000-4000-8000-000000001602');
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000001601','career:account','{"epoch":1,"version":1,"paused":false}'),
 ('00000000-0000-4000-8000-000000001602','career:account','{"epoch":1,"version":1,"paused":false}');
create temp table rr_p as select u, jsonb_build_object('version',1,'user_id',u,'job_id','TEST-RR-'||right(u,1)||'-'||k,'company','RR Employer '||right(u,1)||k,
   'url','https://jobs.lever.co/test/rr'||k,'fields','[]'::jsonb,'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour')
   || case when k = 'with' then jsonb_build_object('resume_sha256',repeat('a',64)) else '{}'::jsonb end as p, k
 from (values ('00000000-0000-4000-8000-000000001601'), ('00000000-0000-4000-8000-000000001602')) v(u), (values ('with'), ('none')) w(k);
grant select on rr_p to service_role, authenticated;

-- 1. approve-to-queue
set role service_role;
select t.must_fail($$select career_apply_enqueue(p, career_apply_payload_hash(p), career_apply_payload_hash(p), 15) from rr_p where k = 'none' and u = '00000000-0000-4000-8000-000000001601'$$,
 'no_resume', 'a payload with no resume hash is refused at approve-to-queue');
select t.ok((select (career_apply_enqueue(p, career_apply_payload_hash(p), career_apply_payload_hash(p), 15)).state = 'queued' from rr_p where k = 'with' and u = '00000000-0000-4000-8000-000000001601'),
 'a payload that binds a resume is queued');
select t.must_fail($$select career_apply_enqueue(jsonb_set(p, '{resume_sha256}', '"not-a-hash"'), career_apply_payload_hash(jsonb_set(p, '{resume_sha256}', '"not-a-hash"')), career_apply_payload_hash(jsonb_set(p, '{resume_sha256}', '"not-a-hash"')), 15) from rr_p where k = 'with' and u = '00000000-0000-4000-8000-000000001602'$$,
 'no_resume', 'a malformed resume hash is no resume');
reset role;

-- 2. the claim: a resume-less row written past the approve guard (as a restore could) is never handed to a drive.
set session_replication_role = replica;
insert into career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash)
 select u::uuid, p->>'job_id', p->>'company', p->>'url', p, career_apply_payload_hash(p), career_apply_payload_hash(p) from rr_p where k = 'none' and u = '00000000-0000-4000-8000-000000001602';
set session_replication_role = origin;
select t.as_user('00000000-0000-4000-8000-000000001602');set role authenticated;
create temp table rr_claim as select * from career_apply_claim_own(6, 'own_computer');
reset role;
select t.ok((select count(*) = 0 from rr_claim), 'the person''s computer is handed no resume-less application');
select t.ok((select state = 'queued' and attempts = 0 from career_apply_jobs where job_id = 'TEST-RR-2-none'), 'it was never driven');
select t.as_user('00000000-0000-4000-8000-000000001601');set role authenticated;
create temp table rr_claim_a as select * from career_apply_claim_own(6, 'own_computer');
reset role;
select t.ok((select count(*) = 1 and bool_and(job_id = 'TEST-RR-1-with') from rr_claim_a), 'the application with its resume is claimed as before');
select t.ok((select count(*) = 0 from career_apply_claim(now(), 6) x where x.user_id = '00000000-0000-4000-8000-000000001602'), 'the queue claim hands it out to no one either');
select t.ok((select state = 'queued' and attempts = 0 from career_apply_jobs where job_id = 'TEST-RR-2-none'), 'still never driven');
-- Applied again (idempotent), the migration closes the stranded row as not sent.
\getenv upmore_root UPMORE_ROOT
\i :upmore_root/supabase/migrations/20261026210016_career_resume_required.sql
select t.ok((select state = 'not_submitted' and reason like 'not sent: no resume%' from career_apply_jobs where job_id = 'TEST-RR-2-none'), 'a resume-less row queued before the rule is closed as not sent');

-- 3. prepared and carded
select t.must_fail($$insert into career_apply_prepared(user_id,job_id,company,url,payload,payload_hash,card_lines)
 select u::uuid, p->>'job_id', p->>'company', p->>'url', p, career_apply_payload_hash(p), array['RR line'] from rr_p where k = 'none' and u = '00000000-0000-4000-8000-000000001601'$$,
 'no_resume', 'an application with no resume is never prepared');
insert into career_apply_prepared(user_id,job_id,company,url,payload,payload_hash,card_lines)
 select u::uuid, p->>'job_id', p->>'company', p->>'url', p, career_apply_payload_hash(p), array['RR line'] from rr_p where k = 'with' and u = '00000000-0000-4000-8000-000000001602';
select t.ok((select count(*) = 1 from career_apply_prepared where job_id = 'TEST-RR-2-with'), 'one with its resume is prepared');
select t.ok((select (career_apply_card_open_for('00000000-0000-4000-8000-000000001602', array[(select id from career_apply_prepared where job_id = 'TEST-RR-2-with')], now())).state = 'open'),
 'and carded');
set session_replication_role = replica;
update career_apply_prepared set payload = payload - 'resume_sha256', state = 'ready' where job_id = 'TEST-RR-2-with';
set session_replication_role = origin;
select t.must_fail($$select career_apply_card_open_for('00000000-0000-4000-8000-000000001602', array[(select id from career_apply_prepared where job_id = 'TEST-RR-2-with')], now())$$,
 'no_resume', 'a card never shows an application with no resume');

-- 4. the resume on file: a confirmed entry counts only with its fact_confirmed event recorded.
insert into agent_threads(id,user_id) values ('00000000-0000-4000-8000-0000000016a1','00000000-0000-4000-8000-000000001601');
insert into agent_flow_state(thread_id,user_id,state) values ('00000000-0000-4000-8000-0000000016a1','00000000-0000-4000-8000-000000001601',
 '{"career":{"stores":{"profile":{"facts":[{"id":"f1","kind":"experience","status":"confirmed","needs_confirmation":false,"confirmation_event_id":"ev-rr-1","text":"RR Intern"}]}}}}');
select t.ok((select not career_resume_on_file('00000000-0000-4000-8000-000000001601')), 'a confirmed entry whose event is not on record is no resume');
insert into career_events(user_id,kind,subject,detail) values ('00000000-0000-4000-8000-000000001601','fact_confirmed','RR Intern','{"confirmation_event_id":"ev-rr-1"}');
select t.ok((select career_resume_on_file('00000000-0000-4000-8000-000000001601')), 'with its event recorded, the resume is on file');
select t.ok((select not career_resume_on_file('00000000-0000-4000-8000-000000001602')), 'another person''s event is not theirs');
set role authenticated;
select t.must_fail($$select career_resume_on_file('00000000-0000-4000-8000-000000001601')$$, 'permission denied', 'a signed-in person cannot ask about anyone');
reset role;

-- 5. a resume sent as a file, erased with the account
set role service_role;
select t.ok((select career_resume_upload_record_as('00000000-0000-4000-8000-000000001601','telegram','telegram:AgADrr','resume.pdf','application/pdf',12,repeat('b',64),'JVBERi0xLjQK',repeat('c',64)) is not null),
 'the upload is recorded by its reference and sha256');
select t.ok((select career_resume_upload_record_as('00000000-0000-4000-8000-000000001601','telegram','telegram:AgADrr','resume.pdf','application/pdf',12,repeat('b',64),'JVBERi0xLjQK',repeat('c',64))
  = (select id from career_resume_uploads where sha256 = repeat('b',64))), 'the same upload twice is one row');
reset role;
select t.as_user('00000000-0000-4000-8000-000000001602');set role authenticated;
select t.ok((select count(*) = 0 from career_resume_uploads), 'nobody else reads it');
reset role;
update career_watch_kv set value = jsonb_set(value, '{epoch}', '2') where user_id = '00000000-0000-4000-8000-000000001601' and key = 'career:account';
select t.ok((select count(*) = 0 from career_resume_uploads where user_id = '00000000-0000-4000-8000-000000001601'), 'an erase deletes the resume file');
rollback;
