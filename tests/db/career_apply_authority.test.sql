-- WO-092: an ordinary chat turn never makes a prepared or approved application stale. Only a change that matters to an
-- approval does: a pause, an erase (privacy epoch), or a change to the facts the application was built from (stated
-- facts, preferred places). The audit's repro (one "what time is it?" turn between the card and
-- "yes" refused every application) is kept here as the guard.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000921','fence@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000921');
insert into agent_threads(id,user_id) values('00000000-0000-4000-8000-0000000009a1','00000000-0000-4000-8000-000000000921');
create temp table pl(n int, job text, co text);
insert into pl values (1,'TEST-FENCE-1','Fence Employer One'),(2,'TEST-FENCE-2','Fence Employer Two'),(3,'TEST-FENCE-3','Fence Employer Three'),
 (4,'TEST-FENCE-4','Fence Employer Four'),(5,'TEST-FENCE-5','Fence Employer Five');
grant select on pl to authenticated, service_role;
create or replace function pg_temp.turn(text, bigint, bigint, jsonb) returns text language sql as $$
 select public.career_host_commit('00000000-0000-4000-8000-000000000921','00000000-0000-4000-8000-0000000009a1',$1,repeat('a',64),$2,$3,
  jsonb_build_object('scope',jsonb_build_object('userId','00000000-0000-4000-8000-000000000921')),$4,'TEST turn '||$1,
  jsonb_build_object('reply','TEST reply','thread_id','00000000-0000-4000-8000-0000000009a1'))->>'error' $$;
create or replace function pg_temp.payload(int, bigint) returns jsonb language sql as $$
 select jsonb_build_object('version',1,'user_id','00000000-0000-4000-8000-000000000921','job_id',pl.job,'company',pl.co,
  'url','https://jobs.lever.co/test/'||pl.n,'fields','[]'::jsonb,'privacy_epoch',0,'account_version',$2,'expires_at',(now()+interval '1 day')::text)
 from pl where pl.n=$1 $$;
create or replace function pg_temp.version() returns bigint language sql as $$
 select (value->>'version')::bigint from public.career_watch_kv where user_id='00000000-0000-4000-8000-000000000921' and key='career:account' $$;

-- Turn 1 creates the account (version 1).
select t.ok(pg_temp.turn('k1',0,0,'{}') is null and pg_temp.version()=1,'the first turn creates the account at version 1');

-- The person's computer prepares two applications against version 1 and the card shows them.
select t.as_user('00000000-0000-4000-8000-000000000921');set role authenticated;
create temp table prep as select r.* from pl, lateral public.career_apply_prepare_own(pg_temp.payload(pl.n,1),array[pl.co]) r where pl.n in (1,2) order by pl.n;
reset role;
create temp table card as select * from public.career_apply_card_open_for('00000000-0000-4000-8000-000000000921',(select array_agg(id order by job_id) from prep),now());

-- An unrelated chat turn (empty patch) moves the version, as every commit does.
select t.ok(pg_temp.turn('k2',1,1,'{}') is null and pg_temp.version()=2,'an ordinary turn commits (version 2)');
select t.ok(public.career_apply_current('00000000-0000-4000-8000-000000000921',pg_temp.payload(1,1)),
 'an approval made before an ordinary chat turn is still current');

-- "yes 1 2" queues both: the turn changed nothing that matters to them.
create temp table ans as select * from public.career_apply_card_answer_for('00000000-0000-4000-8000-000000000921',(select id from card),array[1,2],now());
select t.ok((select count(*) from public.career_apply_jobs where user_id='00000000-0000-4000-8000-000000000921' and state='queued')=2,
 'yes after an ordinary turn queues both applications');

-- Queued, then another ordinary turn: the person's own computer can still claim it (it never sticks at queued).
select t.ok(pg_temp.turn('k3',2,2,'{}') is null,'a third ordinary turn');
select t.as_user('00000000-0000-4000-8000-000000000921');set role authenticated;
select t.ok((select count(*) from public.career_apply_claim_own(1))=1,'a queued application is still claimed after an ordinary turn');
reset role;

-- What matters still fences: a change to the stated facts makes earlier approvals stale; a fresh stamp is current.
select t.ok(pg_temp.turn('k4',3,3,jsonb_build_object('stated_facts',jsonb_build_object('v',1,'facts',jsonb_build_array(
 jsonb_build_object('kind','school','value','TEST University','said','I go to TEST University','at',now()))))) is null,'a turn that records a stated fact');
select t.ok(not public.career_apply_current('00000000-0000-4000-8000-000000000921',pg_temp.payload(3,3)),
 'an approval stamped before the facts changed is stale');
select t.ok(public.career_apply_current('00000000-0000-4000-8000-000000000921',pg_temp.payload(3,4)),
 'an approval stamped after the facts changed is current');

-- A pause makes every approval stale; lifting it does not revive one stamped before the pause.
select t.ok(pg_temp.turn('k5',4,4,'{"paused":true}') is null,'a pause');
select t.ok(not public.career_apply_current('00000000-0000-4000-8000-000000000921',pg_temp.payload(5,5)),'nothing is current while paused');
select t.ok(pg_temp.turn('k6',5,5,'{"paused":false}') is null,'the pause is lifted');
select t.ok(not public.career_apply_current('00000000-0000-4000-8000-000000000921',pg_temp.payload(5,5)),
 'an approval stamped during the pause stays stale after it is lifted');
select t.ok(public.career_apply_current('00000000-0000-4000-8000-000000000921',pg_temp.payload(5,6)),'a fresh stamp after the pause is current');

-- The sweep: a queued application whose approval is no longer current stops counting toward the cap and cooldown.
reset role;
insert into public.career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash,state)
select '00000000-0000-4000-8000-000000000921','TEST-FENCE-SWEEP','Fence Sweep Employer','https://jobs.lever.co/test/sweep',p,
 encode(sha256(convert_to(public.career_apply_canonical(p),'UTF8')),'hex'),encode(sha256(convert_to(public.career_apply_canonical(p),'UTF8')),'hex'),'queued'
from (select jsonb_set(pg_temp.payload(5,1),'{job_id}','"TEST-FENCE-SWEEP"') p) x;
select t.ok(public.career_apply_sweep_stale()>=1,'the sweep finds the queued application whose approval lapsed');
select t.ok((select state='not_submitted' and evidence->>'reason'='approval no longer current' from public.career_apply_jobs where job_id='TEST-FENCE-SWEEP'),
 'it becomes not_submitted with the reason');
select t.ok((select count(*) from public.career_apply_jobs where user_id='00000000-0000-4000-8000-000000000921' and state='queued' and job_id<>'TEST-FENCE-SWEEP')
 =(select count(*) from public.career_apply_jobs where user_id='00000000-0000-4000-8000-000000000921' and state='queued'),'current queued applications are untouched');
select t.as_user('00000000-0000-4000-8000-000000000921');set role authenticated;
select t.must_fail($$select public.career_apply_sweep_stale()$$,'permission denied','only the service runs the sweep');
reset role;
rollback;
