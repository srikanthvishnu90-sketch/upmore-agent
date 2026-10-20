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

-- Batches (finding A4): "apply to 10 analyst roles", then "thanks!" cancelled the batch before the worker claimed it (the
-- live probe: 16 cancelled, 0 queued). A batch is minted through the real career_batch_turn_commit_v1, which runs the
-- real career_host_commit and stamps the version that commit creates.
create or replace function pg_temp.batch_turn(p_key text, p_rev bigint, p_av bigint, p_run text) returns text language plpgsql as $$
declare u text:='00000000-0000-4000-8000-000000000921'; th text:='00000000-0000-4000-8000-0000000009a1'; i jsonb;
begin
 i:=jsonb_build_object('version','career_batch_intent/v1','intent_id',encode(sha256(convert_to(p_run,'UTF8')),'hex'),'user_id',u,
  'thread_id',th,'turn_key',p_key,'request_hash',repeat('a',64),'action','prepare','event_id','prepare-'||p_run,'run_id',p_run,
  'family_text','TEST analyst','run',jsonb_build_object('id',p_run,'userId',u,'status','queued_prepare','familyText','TEST analyst'),
  'authority_account_version',p_av+1,'privacy_epoch',0);
 return public.career_batch_turn_commit_v1(jsonb_build_object('p_user',u,'p_thread',th,'p_key',p_key,'p_hash',repeat('a',64),
  'p_revision',p_rev,'p_account_version',p_av,'p_snapshot',jsonb_build_object('scope',jsonb_build_object('userId',u)),'p_patch','{}'::jsonb,
  'p_input','TEST batch '||p_key,'p_response',jsonb_build_object('reply','TEST reply','thread_id',th,
   'batch',jsonb_build_object('intent_id',i->>'intent_id','userId',u,'id',p_run,'bindings',i))),i)->>'error';
end $$;
create or replace function pg_temp.bstate(text) returns text language sql as $$
 select state from public.career_batch_intents_v1 where user_id='00000000-0000-4000-8000-000000000921' and run_id=$1 $$;
create or replace function pg_temp.bid(text) returns text language sql as $$ select encode(sha256(convert_to($1,'UTF8')),'hex') $$;
create or replace function pg_temp.bpending(text) returns boolean language sql as $$
 select exists(select 1 from jsonb_array_elements(public.career_batch_pending_v1()->'intents') x where x->>'intentId'=pg_temp.bid($1)) $$;

select t.ok(pg_temp.batch_turn('k7',6,6,'batch-TEST-fence-a') is null and pg_temp.bstate('batch-TEST-fence-a')='queued',
 'a batch the person asked for is queued');
select t.ok(pg_temp.turn('k8',7,7,'{}') is null,'an ordinary turn after the batch ("thanks!")');
select t.ok(pg_temp.bstate('batch-TEST-fence-a')='queued','the batch is still queued after an ordinary turn');
select t.ok(pg_temp.bpending('batch-TEST-fence-a'),'the worker still sees it pending');
create temp table bclaim as select public.career_batch_claim_v1('00000000-0000-4000-8000-000000000921',pg_temp.bid('batch-TEST-fence-a')) c;
select t.ok((select c->'claimed'='true'::jsonb from bclaim),'the worker still claims it');
select t.ok(pg_temp.turn('k9',8,8,'{}') is null and pg_temp.bstate('batch-TEST-fence-a')='claimed',
 'a running batch stays claimed through another ordinary turn');
select t.ok((public.career_batch_finish_v1('00000000-0000-4000-8000-000000000921',pg_temp.bid('batch-TEST-fence-a'),
 (select (c->>'leaseToken')::uuid from bclaim),'completed','{}'::jsonb))->>'state'='completed','and finishes completed');

-- What a batch depends on still fences it: a stated-facts change cancels a queued batch and marks a running one uncertain.
select t.ok(pg_temp.batch_turn('k10',9,9,'batch-TEST-fence-b') is null and pg_temp.batch_turn('k11',10,10,'batch-TEST-fence-c') is null,
 'two more batches');
select t.ok((public.career_batch_claim_v1('00000000-0000-4000-8000-000000000921',pg_temp.bid('batch-TEST-fence-c'))->>'claimed')='true',
 'the second is claimed');
select t.ok(pg_temp.turn('k12',11,11,jsonb_build_object('stated_facts',jsonb_build_object('v',1,'facts',jsonb_build_array(
 jsonb_build_object('kind','school','value','TEST College','said','I go to TEST College','at',now()))))) is null,'a turn that changes a stated fact');
select t.ok(pg_temp.bstate('batch-TEST-fence-b')='cancelled' and pg_temp.bstate('batch-TEST-fence-c')='uncertain',
 'the stated-facts change cancels the queued batch and marks the running one uncertain');
-- The claim path applies the same rule on its own: a queued intent stamped before the last authority change is refused.
insert into public.career_batch_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,authority_account_version,privacy_epoch,run_id)
values('00000000-0000-4000-8000-000000000921',pg_temp.bid('batch-TEST-fence-old'),'00000000-0000-4000-8000-0000000009a1','k-old',repeat('a',64),
 repeat('b',64),'{}'::jsonb,11,0,'batch-TEST-fence-old');
select t.ok(not pg_temp.bpending('batch-TEST-fence-old'),'an intent stamped before the facts changed is not pending');
select t.must_fail($$select public.career_batch_claim_v1('00000000-0000-4000-8000-000000000921',pg_temp.bid('batch-TEST-fence-old'))$$,
 'batch authority revoked','and is not claimed');
delete from public.career_batch_intents_v1 where run_id='batch-TEST-fence-old';

-- A pause cancels a queued batch.
select t.ok(pg_temp.batch_turn('k13',12,12,'batch-TEST-fence-d') is null and pg_temp.bstate('batch-TEST-fence-d')='queued','a batch before a pause');
select t.ok(pg_temp.turn('k14',13,13,'{"paused":true}') is null and pg_temp.bstate('batch-TEST-fence-d')='cancelled','a pause cancels it');
select t.ok(pg_temp.turn('k15',14,14,'{"paused":false}') is null and pg_temp.bstate('batch-TEST-fence-d')='cancelled','lifting the pause does not revive it');

-- Browser tasks: the same fault and the same fence. A task is minted through the real career_task_turn_commit_v1 (which
-- runs the real career_host_commit) and stamped at the version that commit creates.
create or replace function pg_temp.task_turn(p_key text, p_rev bigint, p_av bigint, p_name text) returns text language plpgsql as $$
declare u text:='00000000-0000-4000-8000-000000000921'; th text:='00000000-0000-4000-8000-0000000009a1'; i jsonb;
 posting jsonb:=jsonb_build_object('canonicalKey','test:fence-task','url','https://jobs.lever.co/test/fence-task');
begin
 i:=jsonb_build_object('version','career_task_intent/v1','intent_id',encode(sha256(convert_to(p_name,'UTF8')),'hex'),'user_id',u,
  'thread_id',th,'turn_key',p_key,'request_hash',repeat('a',64),'action','prepare','task_id',null,'event_id',p_name,
  'artifact_id','test-resume','resume_sha256',repeat('c',64),'destination',posting->>'url','authority_account_version',p_av+1,'privacy_epoch',0);
 return public.career_task_turn_commit_v1(jsonb_build_object('p_user',u,'p_thread',th,'p_key',p_key,'p_hash',repeat('a',64),
  'p_revision',p_rev,'p_account_version',p_av,
  'p_snapshot',jsonb_build_object('scope',jsonb_build_object('userId',u),'stores',jsonb_build_object('posting',posting)),'p_patch','{}'::jsonb,
  'p_input','TEST task '||p_key,'p_response',jsonb_build_object('reply','TEST reply','thread_id',th,
   'task',jsonb_build_object('intent_id',i->>'intent_id','userId',u,'bindings',i))),i)->>'error';
end $$;
create or replace function pg_temp.tstate(text) returns text language sql as $$
 select state from public.career_task_intents_v1 where user_id='00000000-0000-4000-8000-000000000921' and intent_id=pg_temp.bid($1) $$;
create or replace function pg_temp.tpending(text) returns boolean language sql as $$
 select exists(select 1 from jsonb_array_elements(public.career_task_pending_v1()->'intents') x where x->>'intentId'=pg_temp.bid($1)) $$;
create or replace function pg_temp.tclaim(text) returns jsonb language sql as $$
 select public.career_task_claim_v1('00000000-0000-4000-8000-000000000921',pg_temp.bid($1),md5($1),null) $$;
create or replace function pg_temp.tbegin(text, uuid) returns jsonb language sql as $$
 select public.career_task_begin_effect_v1('00000000-0000-4000-8000-000000000921',pg_temp.bid($1),$2,md5($1),'open',
  encode(sha256(convert_to('effect:'||$1,'UTF8')),'hex'),
  (select binding from public.career_task_intents_v1 where user_id='00000000-0000-4000-8000-000000000921' and intent_id=pg_temp.bid($1))) $$;
create temp table tg(name text primary key, lease uuid, token uuid);

select t.ok(pg_temp.task_turn('k16',15,15,'task-TEST-fence-a') is null and pg_temp.tstate('task-TEST-fence-a')='queued','a browser task is queued');
select t.ok(pg_temp.turn('k17',16,16,'{}') is null,'an ordinary turn after the task');
select t.ok(pg_temp.tstate('task-TEST-fence-a')='queued','the task is still queued after an ordinary turn');
select t.ok(pg_temp.tpending('task-TEST-fence-a'),'the worker still sees the task pending');
insert into tg(name,lease) select 'a',(pg_temp.tclaim('task-TEST-fence-a')->>'leaseToken')::uuid;
select t.ok((select lease is not null from tg where name='a'),'the worker still claims the task');
select t.ok(pg_temp.turn('k18',17,17,'{}') is null and pg_temp.tstate('task-TEST-fence-a')='claimed','a running task stays claimed through an ordinary turn');
update tg set token=(pg_temp.tbegin('task-TEST-fence-a',lease)->>'token')::uuid where name='a';
select t.ok((select token is not null from tg where name='a'),'and can still begin an effect');
select t.ok(pg_temp.turn('k19',18,18,'{}') is null,'another ordinary turn between reserve and execution');
select t.ok((public.career_task_consume_effect_v1('00000000-0000-4000-8000-000000000921',(select token from tg where name='a'))->>'consumed')='true',
 'the reserved effect is still consumable');
select public.career_task_settle_effect_v1('00000000-0000-4000-8000-000000000921',(select token from tg where name='a'),'completed',null,null);
select t.ok((public.career_task_finish_v1('00000000-0000-4000-8000-000000000921',pg_temp.bid('task-TEST-fence-a'),(select lease from tg where name='a'),
 jsonb_build_object('version','career_task/v1','id',md5('task-TEST-fence-a'),'userId','00000000-0000-4000-8000-000000000921','status','review_ready')))->>'state'='completed',
 'and the task finishes completed');

-- A stated-facts change still revokes: a running task with a started effect becomes uncertain, a queued one is cancelled,
-- and every task function refuses a claim stamped before the change.
select t.ok(pg_temp.task_turn('k20',19,19,'task-TEST-fence-b') is null,'a second task');
insert into tg(name,lease) select 'b',(pg_temp.tclaim('task-TEST-fence-b')->>'leaseToken')::uuid;
update tg set token=(pg_temp.tbegin('task-TEST-fence-b',lease)->>'token')::uuid where name='b';
select public.career_task_consume_effect_v1('00000000-0000-4000-8000-000000000921',(select token from tg where name='b'));
select t.ok(pg_temp.task_turn('k21',20,20,'task-TEST-fence-c') is null and pg_temp.tstate('task-TEST-fence-c')='queued','a third task, queued');
select t.ok(pg_temp.turn('k22',21,21,jsonb_build_object('stated_facts',jsonb_build_object('v',1,'facts',jsonb_build_array(
 jsonb_build_object('kind','school','value','TEST Institute','said','I go to TEST Institute','at',now()))))) is null,'a turn that changes a stated fact');
select t.ok(pg_temp.tstate('task-TEST-fence-b')='uncertain' and pg_temp.tstate('task-TEST-fence-c')='cancelled',
 'the facts change makes the running task uncertain and cancels the queued one');
-- An intent stamped before the change, still claimed and holding a reserved effect (as if the hook had not run).
insert into public.career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,authority_account_version,privacy_epoch,state,task_id,lease_token)
values('00000000-0000-4000-8000-000000000921',pg_temp.bid('task-TEST-fence-old'),'00000000-0000-4000-8000-0000000009a1','k-task-old',repeat('a',64),
 repeat('d',64),jsonb_build_object('action','prepare'),21,0,'claimed',md5('task-TEST-fence-old'),'00000000-0000-4000-8000-00000000f0a1');
insert into public.career_task_effects_v1(user_id,intent_id,effect_key,task_id,operation,state,token)
values('00000000-0000-4000-8000-000000000921',pg_temp.bid('task-TEST-fence-old'),repeat('e',64),md5('task-TEST-fence-old'),'open','reserved','00000000-0000-4000-8000-00000000f0a2');
select t.must_fail($$select pg_temp.tclaim('task-TEST-fence-old')$$,'task authority revoked','a task stamped before the facts changed is not claimed');
select t.must_fail($$select pg_temp.tbegin('task-TEST-fence-old','00000000-0000-4000-8000-00000000f0a1')$$,'task authority revoked','nor begins an effect');
select t.must_fail($$select public.career_task_consume_effect_v1('00000000-0000-4000-8000-000000000921','00000000-0000-4000-8000-00000000f0a2')$$,
 'task effect revoked','nor consumes one');
select t.ok((public.career_task_finish_v1('00000000-0000-4000-8000-000000000921',pg_temp.bid('task-TEST-fence-old'),'00000000-0000-4000-8000-00000000f0a1',
 jsonb_build_object('version','career_task/v1','id',md5('task-TEST-fence-old'),'userId','00000000-0000-4000-8000-000000000921')))->>'state'='revoked','nor finishes');
update public.career_task_intents_v1 set state='queued',lease_token=null where intent_id=pg_temp.bid('task-TEST-fence-old');
select t.ok(not pg_temp.tpending('task-TEST-fence-old'),'nor is pending');
delete from public.career_task_effects_v1 where intent_id=pg_temp.bid('task-TEST-fence-old');
delete from public.career_task_intents_v1 where intent_id=pg_temp.bid('task-TEST-fence-old');

-- A pause cancels a queued task.
select t.ok(pg_temp.task_turn('k23',22,22,'task-TEST-fence-d') is null and pg_temp.tstate('task-TEST-fence-d')='queued','a task before a pause');
select t.ok(pg_temp.turn('k24',23,23,'{"paused":true}') is null and pg_temp.tstate('task-TEST-fence-d')='cancelled','a pause cancels the task');
select t.ok(pg_temp.turn('k25',24,24,'{"paused":false}') is null and pg_temp.tstate('task-TEST-fence-d')='cancelled','lifting the pause does not revive it');

-- An erase cancels a queued batch and a queued task, and drops what they carried.
select t.ok(pg_temp.batch_turn('k26',25,25,'batch-TEST-fence-e') is null and pg_temp.bstate('batch-TEST-fence-e')='queued','a batch before an erase');
select t.ok(pg_temp.task_turn('k27',26,26,'task-TEST-fence-e') is null and pg_temp.tstate('task-TEST-fence-e')='queued'
 and pg_temp.bstate('batch-TEST-fence-e')='queued','a task before an erase (the batch still queued)');
select t.ok(pg_temp.turn('k28',27,27,'{"erase":true}') is null,'an erase');
select t.ok((select state='cancelled' and private_input is null from public.career_batch_intents_v1 where run_id='batch-TEST-fence-e'),
 'the erase cancels the batch and drops its request');
select t.ok((select state='cancelled' and private_input is null from public.career_task_intents_v1 where intent_id=pg_temp.bid('task-TEST-fence-e')),
 'the erase cancels the task and drops its request');
rollback;
