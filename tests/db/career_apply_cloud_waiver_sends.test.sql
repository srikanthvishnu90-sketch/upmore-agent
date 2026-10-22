-- Item 16, option B (20261024140000): a waiver's sends are the applications that may have gone. A claim the worker
-- finished as not sent (not_submitted, outcome not_sent) gives its send back; every other end, and a drive in flight,
-- keeps it used. Driven through the real claim and finish, as the worker calls them. Synthetic people only.
begin;
reset role;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000d01','waiver-sends@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000d01');
insert into career_watch_kv(user_id,key,value) values ('00000000-0000-4000-8000-000000000d01','career:account','{"epoch":1,"version":1,"paused":false}');
delete from career_cloud_settings where key in ('CAREER_CLOUD_APPLY','gate_user_ids','owner_user_id');
insert into career_cloud_settings(key,value) values('CAREER_CLOUD_APPLY','on');
select career_apply_cloud_optin_as('00000000-0000-4000-8000-000000000d01',true,'TEST terms');
create function pg_temp.q(job text, company text, url text) returns uuid language plpgsql as $$
declare p jsonb; h text;
begin
 p := jsonb_build_object('version',1,'user_id','00000000-0000-4000-8000-000000000d01','job_id',job,'company',company,'url',url,'fields','[]'::jsonb,
  'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour','engine_approval',repeat('e',64),
  'resume_sha256',encode(sha256('TEST resume'::bytea),'hex'),'destination',url);
 h := encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
 return (career_apply_enqueue(p,h,h,50)).id;
end $$;
create function pg_temp.left_() returns integer language sql as $$ select career_apply_cloud_waiver_left('00000000-0000-4000-8000-000000000d01','lever',now()) $$;
-- Claim the oldest queued job, then finish it as the worker would; returns the job's name. The failure throttle's
-- pause (one error in two tries pauses the portal for 6 hours) is cleared first: this file tests the waiver's count alone.
create temp table jobs(name text primary key, id uuid, made int);
create function pg_temp.drive(p_state text, p_outcome text, p_kind text) returns text language plpgsql as $$
declare c public.career_apply_jobs;
begin
 delete from career_apply_cloud_pauses;
 select * into c from career_apply_cloud_claim_at(1, now()) limit 1;
 if c.id is null then return null; end if;
 if p_state is not null then
  perform career_apply_cloud_finish(c.id, c.lease_token, p_state, jsonb_build_object('reason', coalesce(p_kind, p_state)), p_outcome, p_kind);
 end if;
 return (select name from jobs where id = c.id);
end $$;
insert into jobs values
 ('a',pg_temp.q('TEST-SA','Sends Alpha','https://jobs.lever.co/sendsalpha/1'),1),
 ('b',pg_temp.q('TEST-SB','Sends Bravo','https://jobs.lever.co/sendsbravo/1'),2),
 ('c',pg_temp.q('TEST-SC','Sends Charlie','https://jobs.lever.co/sendscharlie/1'),3),
 ('d',pg_temp.q('TEST-SD','Sends Delta','https://jobs.lever.co/sendsdelta/1'),4),
 ('e',pg_temp.q('TEST-SE','Sends Echo','https://jobs.lever.co/sendsecho/1'),5);
-- Claimed oldest first: a, b, c, d, e.
update career_apply_jobs j set created_at = j.created_at - make_interval(mins => 10 - x.made) from jobs x where x.id = j.id;

insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note)
 values('00000000-0000-4000-8000-000000000d01','lever',2,now()+interval '1 day','TEST two sends');
select t.ok(pg_temp.left_()=2,'two sends left');
-- A: claimed, then stopped by design before the effect (a question the form asks): its send comes back.
select t.ok(pg_temp.drive(null,null,null)='a','A is claimed');
select t.ok(pg_temp.left_()=1,'a drive in flight uses a send');
select t.ok((select (career_apply_cloud_finish(j.id,j.lease_token,'not_submitted','{"reason":"needs_answers"}','not_sent','needs_answers')).state
  from career_apply_jobs j where j.id=(select id from jobs where name='a'))='not_submitted','A finishes not sent');
select t.ok(pg_temp.left_()=2,'a job the worker stopped before the effect gives its send back');
-- B: unknown outcome (the run stopped after the engine started): counts.
select t.ok(pg_temp.drive('unknown_outcome','error','ENGINE_NO_RESULT')='b','B is claimed and ends unknown');
select t.ok(pg_temp.left_()=1,'an unknown outcome uses a send');
-- C: not_submitted but an error, not a by-design stop (DRIVER_ERROR): counts, the worker did not say nothing went.
select t.ok(pg_temp.drive('not_submitted','error','DRIVER_ERROR')='c','C is claimed and ends in an error');
select t.ok(pg_temp.left_()=0,'an error uses a send, even when not_submitted');
select t.ok(pg_temp.drive(null,null,null) is null,'no sends left: nothing more is claimed');
-- One outcome per attempt: a not_sent row cannot be added beside the one the worker recorded (so an unknown or sent job
-- can never be made to look stopped); and the state must agree too.
select t.must_fail($$insert into career_apply_cloud_events(job_id,user_id,portal,source,outcome,error_kind)
 select id,'00000000-0000-4000-8000-000000000d01','lever','cloud','not_sent','FORGED' from jobs where name='b'$$,
 'career_apply_cloud_events_attempt','a second outcome for one attempt is refused');
select t.ok(pg_temp.left_()=0,'still no sends left');
-- A bot check (needs_user) and a page confirmation count: a fresh waiver of 2 is used by D and E.
update career_apply_cloud_gate_waivers set revoked_at=now() where note='TEST two sends';
-- (One transaction has one now(): the earlier claims are moved a minute back, as real time would have them.)
update career_apply_jobs set claimed_at=claimed_at-interval '1 minute' where id in (select id from jobs where name in ('a','b','c'));
insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note)
 values('00000000-0000-4000-8000-000000000d01','lever',2,now()+interval '1 day','TEST next two');
select t.ok(pg_temp.left_()=2,'a new waiver counts only claims since it was made');
select t.ok(pg_temp.drive('needs_user','bot_check','captcha')='d','D ends at a bot check');
select t.ok(pg_temp.drive('confirmed','submitted','CONFIRMED')='e','E is sent (page confirmation)');
select t.ok(pg_temp.left_()=0,'a bot check and a send each use one');
-- Unchanged: who may read it, and the ceiling.
set role authenticated;
select t.must_fail($$select career_apply_cloud_waiver_left('00000000-0000-4000-8000-000000000d01','lever',now())$$,'permission denied','a signed-in person cannot read waiver counts');
reset role;
rollback;
