-- The daily application limit (20261020050000_career_apply_daily_limit.sql; owner 2026-10-19, D-011): 25 a day by
-- default, the person's own up to 50, never more whatever the caller asks.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000951','limit-a@example.test'),('00000000-0000-4000-8000-000000000952','limit-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000951'),('00000000-0000-4000-8000-000000000952');
set role service_role;
insert into career_watch_kv(user_id,key,value) values('00000000-0000-4000-8000-000000000951','career:account','{"epoch":1,"version":1,"paused":false}');
select t.ok((select career_apply_daily_limit('00000000-0000-4000-8000-000000000951')=25),'25 a day by default');
select t.ok((select career_apply_daily_limit('00000000-0000-4000-8000-000000000952')=25),'25 with no account stamp at all');
update career_watch_kv set value=value||'{"daily_limit":40}' where user_id='00000000-0000-4000-8000-000000000951';
select t.ok((select career_apply_daily_limit('00000000-0000-4000-8000-000000000951')=40),'the person''s own limit');
update career_watch_kv set value=value||'{"daily_limit":999}' where user_id='00000000-0000-4000-8000-000000000951';
select t.ok((select career_apply_daily_limit('00000000-0000-4000-8000-000000000951')=50),'never past 50');
update career_watch_kv set value=value||'{"daily_limit":"lots"}' where user_id='00000000-0000-4000-8000-000000000951';
select t.ok((select career_apply_daily_limit('00000000-0000-4000-8000-000000000951')=25),'anything not a number is the default');
create temp table lim_input as select jsonb_build_object('version',1,'user_id','00000000-0000-4000-8000-000000000951','job_id','TEST-LIM-1','company','Limit Employer','url','https://jobs.lever.co/test/LIM-1','fields','[]'::jsonb,'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour') p;
select t.must_fail($$select career_apply_enqueue(p,encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),51) from lim_input$$,'invalid or stale','the queue refuses a limit above 50');
select t.ok((select (career_apply_enqueue(p,encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),50)).state='queued' from lim_input),'and takes 50');
-- 25 already today: the default refuses the next, a person's own 40 takes it.
insert into career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash)
 select '00000000-0000-4000-8000-000000000951','TEST-LIM-F'||n,'Filler '||n,'https://jobs.lever.co/test/f'||n,'{}'::jsonb,repeat('a',64),repeat('a',64) from generate_series(2,25) n;
update career_watch_kv set value=value-'daily_limit' where user_id='00000000-0000-4000-8000-000000000951';
select t.must_fail($$select career_apply_enqueue(p||'{"job_id":"TEST-LIM-26","company":"Next Employer"}',encode(sha256(convert_to(career_apply_canonical(p||'{"job_id":"TEST-LIM-26","company":"Next Employer"}'),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p||'{"job_id":"TEST-LIM-26","company":"Next Employer"}'),'UTF8')),'hex'),career_apply_daily_limit('00000000-0000-4000-8000-000000000951')) from lim_input$$,'daily_cap','the 26th today is refused at the default');
update career_watch_kv set value=value||'{"daily_limit":40}' where user_id='00000000-0000-4000-8000-000000000951';
select t.ok((select (career_apply_enqueue(p||'{"job_id":"TEST-LIM-26","company":"Next Employer"}',encode(sha256(convert_to(career_apply_canonical(p||'{"job_id":"TEST-LIM-26","company":"Next Employer"}'),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p||'{"job_id":"TEST-LIM-26","company":"Next Employer"}'),'UTF8')),'hex'),career_apply_daily_limit('00000000-0000-4000-8000-000000000951'))).state='queued' from lim_input),'and taken under the person''s own 40');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000951');set role authenticated;
select t.must_fail($$select career_apply_daily_limit('00000000-0000-4000-8000-000000000952')$$,'permission denied','a person cannot read another''s limit through it');
reset role;
rollback;
