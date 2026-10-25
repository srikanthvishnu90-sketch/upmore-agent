-- The daily application pace. Old contract (20261020050000_career_apply_daily_limit.sql; D-011): 25 a day by default,
-- the person's own up to 50, never more whatever the caller asked. New contract (20261025140000, CAPS-1390; owner
-- 2026-10-22: no cap on applications): Trainee sets no daily number; a pace the person set themselves is theirs, with no
-- maximum; a caller's number (p_daily) is accepted and never a ceiling. The 30-day employer rule is unchanged.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000951','limit-a@example.test'),('00000000-0000-4000-8000-000000000952','limit-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000951'),('00000000-0000-4000-8000-000000000952');
set role service_role;
insert into career_watch_kv(user_id,key,value) values('00000000-0000-4000-8000-000000000951','career:account','{"epoch":1,"version":1,"paused":false}');
select t.ok((select career_apply_daily_limit('00000000-0000-4000-8000-000000000951') is null),'no pace set: no product number (was 25 by default)');
select t.ok((select career_apply_daily_limit('00000000-0000-4000-8000-000000000952') is null),'none with no account stamp at all');
update career_watch_kv set value=value||'{"daily_limit":40}' where user_id='00000000-0000-4000-8000-000000000951';
select t.ok((select career_apply_daily_limit('00000000-0000-4000-8000-000000000951')=40),'the person''s own pace');
update career_watch_kv set value=value||'{"daily_limit":999}' where user_id='00000000-0000-4000-8000-000000000951';
select t.ok((select career_apply_daily_limit('00000000-0000-4000-8000-000000000951')=999),'with no maximum (was clamped to 50)');
update career_watch_kv set value=value||'{"daily_limit":"lots"}' where user_id='00000000-0000-4000-8000-000000000951';
select t.ok((select career_apply_daily_limit('00000000-0000-4000-8000-000000000951') is null),'anything not a number is no pace at all');
update career_watch_kv set value=value||'{"daily_limit":0}' where user_id='00000000-0000-4000-8000-000000000951';
select t.ok((select career_apply_daily_limit('00000000-0000-4000-8000-000000000951') is null),'zero is not a pace');
create temp table lim_input as select jsonb_build_object('version',1,'user_id','00000000-0000-4000-8000-000000000951','job_id','TEST-LIM-1','company','Limit Employer','url','https://jobs.lever.co/test/LIM-1','fields','[]'::jsonb,'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour') p;
select t.ok((select (career_apply_enqueue(p,encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),51)).state='queued' from lim_input),'a caller''s 51 is accepted and is not a ceiling (was refused above 50)');
-- 25 already today: with no pace set the 26th is taken; a person's own 25 refuses it; their own 40 takes it.
insert into career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash)
 select '00000000-0000-4000-8000-000000000951','TEST-LIM-F'||n,'Filler '||n,'https://jobs.lever.co/test/f'||n,'{}'::jsonb,repeat('a',64),repeat('a',64) from generate_series(2,25) n;
update career_watch_kv set value=value-'daily_limit' where user_id='00000000-0000-4000-8000-000000000951';
select t.ok((select count(*)=25 from career_apply_ledger('00000000-0000-4000-8000-000000000951',now()-interval '1 day')),'25 in the ledger today');
select t.ok((select (career_apply_enqueue(p||'{"job_id":"TEST-LIM-26","company":"Next Employer"}',encode(sha256(convert_to(career_apply_canonical(p||'{"job_id":"TEST-LIM-26","company":"Next Employer"}'),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p||'{"job_id":"TEST-LIM-26","company":"Next Employer"}'),'UTF8')),'hex'),25)).state='queued' from lim_input),'the 26th today is taken with no pace set, whatever the caller passes (was refused at the default 25)');
update career_watch_kv set value=value||'{"daily_limit":25}' where user_id='00000000-0000-4000-8000-000000000951';
select t.must_fail($$select career_apply_enqueue(p||'{"job_id":"TEST-LIM-27","company":"Another Employer"}',encode(sha256(convert_to(career_apply_canonical(p||'{"job_id":"TEST-LIM-27","company":"Another Employer"}'),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p||'{"job_id":"TEST-LIM-27","company":"Another Employer"}'),'UTF8')),'hex'),null) from lim_input$$,'daily_cap','a 27th is refused by the person''s own pace of 25');
update career_watch_kv set value=value||'{"daily_limit":40}' where user_id='00000000-0000-4000-8000-000000000951';
select t.ok((select (career_apply_enqueue(p||'{"job_id":"TEST-LIM-27","company":"Another Employer"}',encode(sha256(convert_to(career_apply_canonical(p||'{"job_id":"TEST-LIM-27","company":"Another Employer"}'),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p||'{"job_id":"TEST-LIM-27","company":"Another Employer"}'),'UTF8')),'hex'),career_apply_daily_limit('00000000-0000-4000-8000-000000000951'))).state='queued' from lim_input),'and taken under their own 40');
select t.must_fail($$select career_apply_enqueue(p||'{"job_id":"TEST-LIM-28","company":"Next Employer"}',encode(sha256(convert_to(career_apply_canonical(p||'{"job_id":"TEST-LIM-28","company":"Next Employer"}'),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p||'{"job_id":"TEST-LIM-28","company":"Next Employer"}'),'UTF8')),'hex'),null) from lim_input$$,'company_cooldown','the same employer within 30 days is still refused');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000951');set role authenticated;
select t.must_fail($$select career_apply_daily_limit('00000000-0000-4000-8000-000000000952')$$,'permission denied','a person cannot read another''s limit through it');
reset role;
rollback;
