-- SPLIT-1146 (c), STITCHED: the correction patch that fences the applications is the router's own.
--
-- The two halves of this proof used to stop one seam short of each other. The router half
-- (tests/career-submit-split-1146.test.cjs, "(c) RECORDED") pins that the sensitive-correction turn's
-- commit patch carries the corrected sponsorship fact; the DB half
-- (tests/db/career_apply_correction_fence.test.sql) pins that the authority fence blocks everything
-- stamped before a correction — but it hand-builds the correction patch in the host's shape. This file
-- removes the hand: the correction commit below consumes, verbatim, the patch object captured from the
-- actual correction turn by tests/db/career-stitched-fence-patch.cjs (run by tests/db/run.sh, which
-- passes it as the psql variable stitch_patch). The patch binds to no user in itself — the commit call
-- binds it, exactly as handler-career.ts:815 passes ctx._hostPatch as p_patch to career_host_commit.
--
-- What is still set up by hand, and labelled as such: each user's turns k1/k2, which create the account
-- and record the ORIGINAL sponsorship fact — the pre-state the correction corrects, built the same way
-- the fence test builds it. The artifact under test is only the correction patch (turn k3).
--
-- Fail-first control, first phase: a second synthetic user gets the identical pre-state and approval,
-- and the correction patch is WITHHELD. Its approval must stay current and the cloud claim must hand
-- the row out — without the router's patch, nothing fences anything.
--
-- Runs only via tests/db/run.sh (it supplies -v stitch_patch); on the final schema, beside the fence
-- test: host commit and the authority trigger from 20261026090009, the one-ledger claims.
begin;
reset role;
-- CONTROL user ...1148 (thread ...1149); STITCH user ...1150 (thread ...1151). Synthetic, as everywhere here.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000001148','fence-stitch-control@example.test'),
 ('00000000-0000-4000-8000-000000001150','fence-stitch@example.test');
insert into profiles(id) values
 ('00000000-0000-4000-8000-000000001148'),
 ('00000000-0000-4000-8000-000000001150');
insert into agent_threads(id,user_id) values
 ('00000000-0000-4000-8000-000000001149','00000000-0000-4000-8000-000000001148'),
 ('00000000-0000-4000-8000-000000001151','00000000-0000-4000-8000-000000001150');
create temp table pl(n int, job text, co text);
grant select on pl to authenticated, service_role;
create or replace function pg_temp.turn(uuid, uuid, text, bigint, bigint, jsonb) returns text language sql as $$
 select public.career_host_commit($1,$2,$3,repeat('a',64),$4,$5,
  jsonb_build_object('scope',jsonb_build_object('userId',$1::text)),$6,'TEST turn '||$3,
  jsonb_build_object('reply','TEST reply','thread_id',$2::text))->>'error' $$;
create or replace function pg_temp.payload(uuid, int, bigint) returns jsonb language sql as $$
 select jsonb_build_object('version',1,'user_id',$1::text,'job_id',pl.job,'company',pl.co,
  'url','https://jobs.lever.co/test/'||pl.n,'fields','[]'::jsonb,'privacy_epoch',0,'account_version',$3,'expires_at',(now()+interval '1 day')::text)
 from pl where pl.n=$2 $$;
create or replace function pg_temp.version(uuid) returns bigint language sql as $$
 select (value->>'version')::bigint from public.career_watch_kv where user_id=$1 and key='career:account' $$;
create or replace function pg_temp.authority(uuid) returns bigint language sql as $$
 select (value->>'authority_version')::bigint from public.career_watch_kv where user_id=$1 and key='career:account' $$;
-- SETUP (both phases): the pre-state patch recording the original sponsorship fact, in the host's shape —
-- sponsorship rides the keyed list, as in the fence test. This is the state the correction corrects.
create or replace function pg_temp.old_fact_patch() returns jsonb language sql as $$
 select jsonb_build_object('stated_facts',jsonb_build_object('facts','[]'::jsonb,'keyed',jsonb_build_array(
  jsonb_build_object('kind','sponsorship','value','needs sponsorship','evidence','I will need sponsorship','at','2026-10-20T00:00:00.000Z')),
  'offer',null,'updated_at','2026-10-20T00:00:00.000Z')) $$;

-- ============ CONTROL PHASE: identical pre-state, the correction patch withheld ============
insert into pl values (1,'TEST-STITCH-C1','Stitch Control Employer One');
select t.ok(pg_temp.turn('00000000-0000-4000-8000-000000001148','00000000-0000-4000-8000-000000001149','k1',0,0,'{}') is null
 and pg_temp.version('00000000-0000-4000-8000-000000001148')=1,'control: the first turn creates the account at version 1');
select t.ok(pg_temp.turn('00000000-0000-4000-8000-000000001148','00000000-0000-4000-8000-000000001149','k2',1,1,pg_temp.old_fact_patch()) is null
 and pg_temp.version('00000000-0000-4000-8000-000000001148')=2,'control: a turn records the sponsorship fact the application is built on');
select t.as_user('00000000-0000-4000-8000-000000001148');set role authenticated;
create temp table prep_c as select r.* from pl, lateral public.career_apply_prepare_own(
 pg_temp.payload('00000000-0000-4000-8000-000000001148',pl.n,2),array[pl.co]) r where pl.n=1;
reset role;
create temp table card_c as select * from public.career_apply_card_open_for('00000000-0000-4000-8000-000000001148',
 (select array_agg(id order by job_id) from prep_c),now());
select * from public.career_apply_card_answer_for('00000000-0000-4000-8000-000000001148',(select id from card_c),array[1],now());
select t.ok((select count(*) from public.career_apply_jobs where user_id='00000000-0000-4000-8000-000000001148' and state='queued')=1,
 'control: the application is queued on the old answer');
select t.ok(public.career_apply_current('00000000-0000-4000-8000-000000001148',
 pg_temp.payload('00000000-0000-4000-8000-000000001148',1,2)),
 'control: with the correction patch withheld, the approval stays current');
select t.ok((select count(*) from public.career_apply_claim(now(),10) where user_id='00000000-0000-4000-8000-000000001148')=1,
 'control: and the cloud claim hands it out — without the patch, the row stays claimable');

-- ============ STITCH PHASE: the same pre-state, then the router's own patch ============
truncate pl;
insert into pl values (1,'TEST-STITCH-S1','Stitch Employer One'),(2,'TEST-STITCH-S2','Stitch Employer Two'),
 (3,'TEST-STITCH-S3','Stitch Employer Three');
select t.ok(pg_temp.turn('00000000-0000-4000-8000-000000001150','00000000-0000-4000-8000-000000001151','k1',0,0,'{}') is null
 and pg_temp.version('00000000-0000-4000-8000-000000001150')=1,'the first turn creates the account at version 1');
select t.ok(pg_temp.turn('00000000-0000-4000-8000-000000001150','00000000-0000-4000-8000-000000001151','k2',1,1,pg_temp.old_fact_patch()) is null
 and pg_temp.version('00000000-0000-4000-8000-000000001150')=2,'a turn records the sponsorship fact the applications are built on');
select t.as_user('00000000-0000-4000-8000-000000001150');set role authenticated;
create temp table prep_s as select r.* from pl, lateral public.career_apply_prepare_own(
 pg_temp.payload('00000000-0000-4000-8000-000000001150',pl.n,2),array[pl.co]) r where pl.n in (1,2) order by pl.n;
reset role;
create temp table card_sa as select * from public.career_apply_card_open_for('00000000-0000-4000-8000-000000001150',
 (select array_agg(id order by job_id) from prep_s where job_id='TEST-STITCH-S1'),now());
select * from public.career_apply_card_answer_for('00000000-0000-4000-8000-000000001150',(select id from card_sa),array[1],now());
-- Opening a card closes older ones, so the second card opens only after the first is answered; it stays open.
create temp table card_sb as select * from public.career_apply_card_open_for('00000000-0000-4000-8000-000000001150',
 (select array_agg(id order by job_id) from prep_s where job_id='TEST-STITCH-S2'),now());
select t.ok((select count(*) from public.career_apply_jobs where user_id='00000000-0000-4000-8000-000000001150' and state='queued')=1,
 'the first application is queued on the old answer');
select t.ok(public.career_apply_current('00000000-0000-4000-8000-000000001150',
 pg_temp.payload('00000000-0000-4000-8000-000000001150',1,2)),
 'and its approval is current before the correction');
select t.ok(pg_temp.authority('00000000-0000-4000-8000-000000001150')=2,
 'before the patch, the account authority stands at the version the applications were stamped with');

-- THE STITCH: turn k3's patch is :'stitch_patch' — the actual object the router correction turn emitted,
-- captured by career-stitched-fence-patch.cjs. Nothing about it was re-typed or hand-shaped here.
select t.ok(pg_temp.turn('00000000-0000-4000-8000-000000001150','00000000-0000-4000-8000-000000001151','k3',2,2,:'stitch_patch'::jsonb) is null
 and pg_temp.version('00000000-0000-4000-8000-000000001150')=3,
 'the router''s own patch, committed through career_host_commit, lands the correction (account version 2 to 3)');
select t.ok(exists(select 1 from public.career_watch_kv w
  cross join lateral jsonb_array_elements(coalesce(w.value->'stated_facts'->'keyed','[]'::jsonb)) e
  where w.user_id='00000000-0000-4000-8000-000000001150' and w.key='career:account'
   and e->>'kind'='sponsorship' and e->>'value'='does not need sponsorship'),
 'the account record now carries the patch''s corrected sponsorship fact, in its keyed list');
select t.ok(pg_temp.authority('00000000-0000-4000-8000-000000001150')=3,
 'and the commit moved the account''s authority_version with it — the bump is the patch''s doing');
select t.ok(not public.career_apply_current('00000000-0000-4000-8000-000000001150',
 pg_temp.payload('00000000-0000-4000-8000-000000001150',1,2)),
 'an approval stamped before the router patch is no longer current');

-- Neither claim hands the queued row out: not the cloud claim, not the person's own computer.
select t.ok((select count(*) from public.career_apply_claim(now(),10) where user_id='00000000-0000-4000-8000-000000001150')=0,
 'the cloud claim does not hand out the application built on the old answer');
select t.as_user('00000000-0000-4000-8000-000000001150');set role authenticated;
select t.ok((select count(*) from public.career_apply_claim_own(10,'own_computer') where user_id='00000000-0000-4000-8000-000000001150')=0,
 'nor does the claim from the person''s own computer');
reset role;

-- The sweep closes it as not sent, with the reason.
select t.ok(public.career_apply_sweep_stale()>=1,'the sweep finds the queued application whose approval lapsed');
select t.ok((select state='not_submitted' and evidence->>'reason'='approval no longer current'
 from public.career_apply_jobs where job_id='TEST-STITCH-S1'),
 'it becomes not_submitted: the application built on the old answer does not go out');

-- The still-open card, answered after the correction: the item comes back stale and the prepared row expires.
create temp table ans_sb as select public.career_apply_card_answer_for('00000000-0000-4000-8000-000000001150',(select id from card_sb),array[1],now()) as res;
select t.ok((select (value->>'result')='stale' from ans_sb, lateral jsonb_array_elements(ans_sb.res) value),
 'answering the second card after the correction returns stale for its item');
select t.ok((select state='expired' from public.career_apply_prepared where job_id='TEST-STITCH-S2'),
 'its prepared row expires instead of queueing');
select t.ok((select count(*) from public.career_apply_jobs where user_id='00000000-0000-4000-8000-000000001150' and job_id='TEST-STITCH-S2')=0,
 'nothing was queued from the stale card');

-- Post-correction control: work prepared and approved after the patch, stamped at the new version, flows normally.
select t.as_user('00000000-0000-4000-8000-000000001150');set role authenticated;
create temp table prep_s3 as select r.* from pl, lateral public.career_apply_prepare_own(
 pg_temp.payload('00000000-0000-4000-8000-000000001150',pl.n,3),array[pl.co]) r where pl.n=3;
reset role;
create temp table card_sc as select * from public.career_apply_card_open_for('00000000-0000-4000-8000-000000001150',
 (select array_agg(id) from prep_s3),now());
select * from public.career_apply_card_answer_for('00000000-0000-4000-8000-000000001150',(select id from card_sc),array[1],now());
select t.ok((select count(*) from public.career_apply_jobs where user_id='00000000-0000-4000-8000-000000001150' and job_id='TEST-STITCH-S3' and state='queued')=1,
 'an application prepared on the corrected answer queues as normal');
rollback;
