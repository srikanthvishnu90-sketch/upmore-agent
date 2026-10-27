-- SPLIT-1146 (c), DB half: a sensitive-fact correction fenced the applications built on the old answer.
--
-- The router records its invalidation in doorstepState, which no executor reads. What the executors read is
-- career_apply_current: a queued or prepared payload is handed out only while the account's authority_version
-- has not moved past the version the payload was stamped with, and the account trigger moves authority_version
-- when stated_facts change (20261022150000, refreshed 20261026090009). The router half of the chain — the
-- correction turn's commit patch carries the changed sponsorship fact — is pinned in
-- tests/career-submit-split-1146.test.cjs ("(c) RECORDED"). This file pins the DB half with the real functions:
-- a prepared row approved before the correction is never claimed (cloud or own computer), the sweep closes it
-- as not_submitted, and a prepared row answered after the correction comes back 'stale' and expires.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000001146','fence-correction@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000001146');
insert into agent_threads(id,user_id) values('00000000-0000-4000-8000-000000001147','00000000-0000-4000-8000-000000001146');
create temp table pl(n int, job text, co text);
insert into pl values (1,'TEST-CORRECTION-1','Correction Employer One'),(2,'TEST-CORRECTION-2','Correction Employer Two'),
 (3,'TEST-CORRECTION-3','Correction Employer Three');
grant select on pl to authenticated, service_role;
create or replace function pg_temp.turn(text, bigint, bigint, jsonb) returns text language sql as $$
 select public.career_host_commit('00000000-0000-4000-8000-000000001146','00000000-0000-4000-8000-000000001147',$1,repeat('a',64),$2,$3,
  jsonb_build_object('scope',jsonb_build_object('userId','00000000-0000-4000-8000-000000001146')),$4,'TEST turn '||$1,
  jsonb_build_object('reply','TEST reply','thread_id','00000000-0000-4000-8000-000000001147'))->>'error' $$;
create or replace function pg_temp.payload(int, bigint) returns jsonb language sql as $$
 select jsonb_build_object('version',1,'user_id','00000000-0000-4000-8000-000000001146','job_id',pl.job,'company',pl.co,
  'url','https://jobs.lever.co/test/'||pl.n,'fields','[]'::jsonb,'privacy_epoch',0,'account_version',$2,'expires_at',(now()+interval '1 day')::text)
 from pl where pl.n=$1 $$;
create or replace function pg_temp.version() returns bigint language sql as $$
 select (value->>'version')::bigint from public.career_watch_kv where user_id='00000000-0000-4000-8000-000000001146' and key='career:account' $$;

-- Turn 1 creates the account (version 1); turn 2 records the original sponsorship fact (version 2, authority 2).
-- The patch carries the record in the host's own shape (career_host.js statedFactsRecordForCommit): sponsorship
-- rides the keyed list — the facts array's kind allowlist in career_host_commit does not include it.
select t.ok(pg_temp.turn('k1',0,0,'{}') is null and pg_temp.version()=1,'the first turn creates the account at version 1');
select t.ok(pg_temp.turn('k2',1,1,jsonb_build_object('stated_facts',jsonb_build_object('facts','[]'::jsonb,'keyed',jsonb_build_array(
 jsonb_build_object('kind','sponsorship','value','needs sponsorship','evidence','I will need sponsorship','at','2026-10-20T00:00:00.000Z')),
 'offer',null,'updated_at','2026-10-20T00:00:00.000Z'))) is null
 and pg_temp.version()=2,'a turn records the sponsorship fact the applications are built on');

-- Two applications are prepared against version 2; the first is approved and queued, the second's card stays open.
select t.as_user('00000000-0000-4000-8000-000000001146');set role authenticated;
create temp table prep as select r.* from pl, lateral public.career_apply_prepare_own(pg_temp.payload(pl.n,2),array[pl.co]) r where pl.n in (1,2) order by pl.n;
reset role;
create temp table carda as select * from public.career_apply_card_open_for('00000000-0000-4000-8000-000000001146',
 (select array_agg(id order by job_id) from prep where job_id='TEST-CORRECTION-1'),now());
select * from public.career_apply_card_answer_for('00000000-0000-4000-8000-000000001146',(select id from carda),array[1],now());
-- Opening a card closes older ones, so the second card opens only after the first is answered; it stays open.
create temp table cardb as select * from public.career_apply_card_open_for('00000000-0000-4000-8000-000000001146',
 (select array_agg(id order by job_id) from prep where job_id='TEST-CORRECTION-2'),now());
select t.ok((select count(*) from public.career_apply_jobs where user_id='00000000-0000-4000-8000-000000001146' and state='queued')=1,
 'the first application is queued on the old answer');
select t.ok(public.career_apply_current('00000000-0000-4000-8000-000000001146',pg_temp.payload(1,2)),
 'and its approval is current before the correction');

-- The correction: a host commit whose stated_facts patch carries the corrected sponsorship fact — the same
-- patch the correction turn produces (career_host.js write-back; the router half is the (c) RECORDED test).
select t.ok(pg_temp.turn('k3',2,2,jsonb_build_object('stated_facts',jsonb_build_object('facts','[]'::jsonb,'keyed',jsonb_build_array(
 jsonb_build_object('kind','sponsorship','value','does not need sponsorship','evidence','I no longer need sponsorship','at','2026-10-25T16:46:00.000Z')),
 'offer',null,'updated_at','2026-10-25T16:46:00.000Z'))) is null
 and pg_temp.version()=3,'the correction turn commits the changed stated fact');
select t.ok(not public.career_apply_current('00000000-0000-4000-8000-000000001146',pg_temp.payload(1,2)),
 'an approval stamped before the correction is no longer current');

-- Neither claim hands the queued row out: not the cloud claim, not the person's own computer.
select t.ok((select count(*) from public.career_apply_claim(now(),10) where user_id='00000000-0000-4000-8000-000000001146')=0,
 'the cloud claim does not hand out the application built on the old answer');
select t.as_user('00000000-0000-4000-8000-000000001146');set role authenticated;
select t.ok((select count(*) from public.career_apply_claim_own(10,'own_computer') where user_id='00000000-0000-4000-8000-000000001146')=0,
 'nor does the claim from the person''s own computer');
reset role;

-- The sweep closes it as not sent, with the reason.
select t.ok(public.career_apply_sweep_stale()>=1,'the sweep finds the queued application whose approval lapsed');
select t.ok((select state='not_submitted' and evidence->>'reason'='approval no longer current'
 from public.career_apply_jobs where job_id='TEST-CORRECTION-1'),
 'it becomes not_submitted: the application built on the old answer does not go out');

-- The still-open card, answered after the correction: the item comes back stale and the prepared row expires.
create temp table ansb as select public.career_apply_card_answer_for('00000000-0000-4000-8000-000000001146',(select id from cardb),array[1],now()) as res;
select t.ok((select (value->>'result')='stale' from ansb, lateral jsonb_array_elements(ansb.res) value),
 'answering the second card after the correction returns stale for its item');
select t.ok((select state='expired' from public.career_apply_prepared where job_id='TEST-CORRECTION-2'),
 'its prepared row expires instead of queueing');
select t.ok((select count(*) from public.career_apply_jobs where user_id='00000000-0000-4000-8000-000000001146' and job_id='TEST-CORRECTION-2')=0,
 'nothing was queued from the stale card');

-- Control: work prepared and approved after the correction, stamped at the new version, flows normally.
select t.as_user('00000000-0000-4000-8000-000000001146');set role authenticated;
create temp table prep3 as select r.* from pl, lateral public.career_apply_prepare_own(pg_temp.payload(pl.n,3),array[pl.co]) r where pl.n=3;
reset role;
create temp table cardc as select * from public.career_apply_card_open_for('00000000-0000-4000-8000-000000001146',
 (select array_agg(id) from prep3),now());
select * from public.career_apply_card_answer_for('00000000-0000-4000-8000-000000001146',(select id from cardc),array[1],now());
select t.ok((select count(*) from public.career_apply_jobs where user_id='00000000-0000-4000-8000-000000001146' and job_id='TEST-CORRECTION-3' and state='queued')=1,
 'an application prepared on the corrected answer queues as normal');
rollback;
