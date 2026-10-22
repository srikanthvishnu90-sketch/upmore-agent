-- D-010 as changed by the owner (20261024120000): the cloud gate may be waived for one named person, one portal family,
-- a set number of sends, until a set time — and nothing else changes: the kill switch, the person's own approval of the
-- exact payload, the opt-in, pauses, the daily limit and the 30-day company rule all still decide every waived job.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000c01','waiver-w@example.test'),
 ('00000000-0000-4000-8000-000000000c02','waiver-x@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000c01'),('00000000-0000-4000-8000-000000000c02');
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000000c01','career:account','{"epoch":1,"version":1,"paused":false}'),
 ('00000000-0000-4000-8000-000000000c02','career:account','{"epoch":1,"version":1,"paused":false}');
delete from career_cloud_settings where key in ('CAREER_CLOUD_APPLY','gate_user_ids','owner_user_id');
insert into career_cloud_settings(key,value) values('CAREER_CLOUD_APPLY','on');
select career_apply_cloud_optin_as('00000000-0000-4000-8000-000000000c01',true,'TEST terms');
select career_apply_cloud_optin_as('00000000-0000-4000-8000-000000000c02',true,'TEST terms');
create function pg_temp.q(u text, job text, company text, url text) returns uuid language plpgsql as $$
declare p jsonb; h text;
begin
 p := jsonb_build_object('version',1,'user_id',u,'job_id',job,'company',company,'url',url,'fields','[]'::jsonb,
  'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour','engine_approval',repeat('e',64),
  'resume_sha256',encode(sha256('TEST resume'::bytea),'hex'),'destination',url);
 h := encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
 return (career_apply_enqueue(p,h,h,50)).id;
end $$;
create function pg_temp.why(id uuid) returns text language sql as $$ select career_apply_cloud_refusal(j,now()) from career_apply_jobs j where j.id=$1 $$;
create temp table jobs(name text primary key, id uuid);
insert into jobs values
 ('w1',pg_temp.q('00000000-0000-4000-8000-000000000c01','TEST-W1','Waiver One','https://jobs.lever.co/waiverone/1')),
 ('w2',pg_temp.q('00000000-0000-4000-8000-000000000c01','TEST-W2','Waiver Two','https://jobs.lever.co/waivertwo/2')),
 ('g1',pg_temp.q('00000000-0000-4000-8000-000000000c01','TEST-G1','Waiver Green','https://job-boards.greenhouse.io/waivergreen/jobs/1')),
 ('x1',pg_temp.q('00000000-0000-4000-8000-000000000c02','TEST-X1','Other Lever','https://jobs.lever.co/otherlever/1'));
-- One transaction gives every job the same created_at, and the claim then orders by id (random): W1 is made the oldest
-- so "the oldest of W's Lever jobs" is W1 on every run.
update career_apply_jobs set created_at = created_at - interval '1 minute' where id = (select id from jobs where name='w1');

-- No waiver: the gate as before.
select t.ok(not career_apply_cloud_open('lever') and pg_temp.why((select id from jobs where name='w1'))='gate_closed','no waiver: a closed gate refuses');
select t.ok((select count(*)=0 from career_apply_cloud_claim_at(6,now())),'no waiver: nothing is claimed');
select t.ok(career_apply_cloud_waiver_left('00000000-0000-4000-8000-000000000c01','lever',now())=0,'no waiver: no sends left');

-- Nobody but the service can see or write waivers; the window and the count are bounded.
set role authenticated;
select t.must_fail($$select count(*) from career_apply_cloud_gate_waivers$$,'permission denied','a signed-in person cannot read waivers');
select t.must_fail($$insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note) values('00000000-0000-4000-8000-000000000c01','lever',1,now()+interval '1 day','x')$$,'permission denied','a signed-in person cannot write a waiver');
reset role;
set role anon;
select t.must_fail($$select career_apply_cloud_waiver_left('00000000-0000-4000-8000-000000000c01','lever',now())$$,'permission denied','anon cannot read waiver counts');
reset role;
select t.must_fail($$insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note) values('00000000-0000-4000-8000-000000000c01','lever',1,now()+interval '8 days','TEST')$$,'career_apply_cloud_gate_waivers_window','a waiver lasts at most 7 days');
select t.must_fail($$insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note) values('00000000-0000-4000-8000-000000000c01','lever',6,now()+interval '1 day','TEST')$$,'max_sends','a waiver covers at most 5 sends');
select t.must_fail($$insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note) values('00000000-0000-4000-8000-000000000c01','workday',1,now()+interval '1 day','TEST')$$,'portal','only a cloud portal family');

-- The waiver: W, Lever, one send.
insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note)
 values('00000000-0000-4000-8000-000000000c01','lever',1,now()+interval '1 day','TEST first approved batch');
select t.ok(career_apply_cloud_waiver_left('00000000-0000-4000-8000-000000000c01','lever',now())=1,'one send left');
select t.ok(pg_temp.why((select id from jobs where name='w1')) is null,'W''s approved Lever job passes the gate');
select t.ok(pg_temp.why((select id from jobs where name='g1'))='gate_closed','W''s Greenhouse job: another family, still closed');
select t.ok(pg_temp.why((select id from jobs where name='x1'))='gate_closed','another person''s Lever job: still closed');
-- The kill switch still rules.
update career_cloud_settings set value='off' where key='CAREER_CLOUD_APPLY';
select t.ok((select count(*)=0 from career_apply_cloud_claim_at(6,now())),'kill switch off: a waiver claims nothing');
update career_cloud_settings set value='on' where key='CAREER_CLOUD_APPLY';
-- One claim, the oldest of W's Lever jobs; then the waiver is used up.
create temp table claimed as select * from career_apply_cloud_claim_at(6,now());
select t.ok((select count(*)=1 and bool_and(job_id='TEST-W1' and source='cloud' and state='driving') from claimed),'exactly one job is claimed: W''s first Lever job');
select t.ok(career_apply_cloud_waiver_left('00000000-0000-4000-8000-000000000c01','lever',now())=0,'the one send is used');
select t.ok(pg_temp.why((select id from jobs where name='w2'))='gate_closed','W''s next Lever job: the gate is closed again');
select t.ok((select count(*)=0 from career_apply_cloud_claim_at(6,now())),'nothing more is claimed');
select t.ok((select count(*)=0 from career_apply_jobs where job_id in ('TEST-G1','TEST-X1') and state<>'queued'),'the other family and the other person were never touched');

-- The daily limit and the company rule still decide under a waiver.
insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note)
 values('00000000-0000-4000-8000-000000000c01','lever',5,now()+interval '1 day','TEST second waiver');
select t.must_fail($$select pg_temp.q('00000000-0000-4000-8000-000000000c01','TEST-W3','Waiver One','https://jobs.lever.co/waiverone/3')$$,'company_cooldown','a second job at a company applied to in 30 days is refused (waiver or not)');
update career_apply_cloud_optin set daily=1 where user_id='00000000-0000-4000-8000-000000000c01';
select t.ok(pg_temp.why((select id from jobs where name='w2'))='daily_limit','a waived job past the person''s daily limit: refused');
update career_apply_cloud_optin set daily=null where user_id='00000000-0000-4000-8000-000000000c01';
-- Revoked or expired: closed.
update career_apply_cloud_gate_waivers set revoked_at=now() where note='TEST second waiver';
select t.ok(pg_temp.why((select id from jobs where name='w2'))='gate_closed','a revoked waiver: closed');
update career_apply_cloud_gate_waivers set revoked_at=null, created_at=now()-interval '2 days', expires_at=now()-interval '1 day' where note='TEST second waiver';
select t.ok(pg_temp.why((select id from jobs where name='w2'))='gate_closed','an expired waiver: closed');
rollback;
