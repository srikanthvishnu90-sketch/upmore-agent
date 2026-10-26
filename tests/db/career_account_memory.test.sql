-- FEATURE 9 (20261026090009): the person's profile and tracker ride the account record, so what one thread sets another
-- thread reads; an erase forgets them; two threads that loaded the same account version cannot both commit; the shape is
-- bounded; only a change to the confirmed facts moves the approval authority.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000f91','memory@example.test'),('00000000-0000-4000-8000-000000000f92','other@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000f91'),('00000000-0000-4000-8000-000000000f92');
insert into agent_threads(id,user_id) values
 ('00000000-0000-4000-8000-0000000f9a01','00000000-0000-4000-8000-000000000f91'),
 ('00000000-0000-4000-8000-0000000f9b01','00000000-0000-4000-8000-000000000f91'),
 ('00000000-0000-4000-8000-0000000f9c01','00000000-0000-4000-8000-000000000f92');
create or replace function pg_temp.u() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000f91'::uuid $$;
create or replace function pg_temp.th(text) returns uuid language sql as $$ select case $1 when 'A' then '00000000-0000-4000-8000-0000000f9a01'::uuid
 when 'B' then '00000000-0000-4000-8000-0000000f9b01'::uuid else '00000000-0000-4000-8000-0000000f9c01'::uuid end $$;
-- One committed turn in thread $1 (key $2) at thread revision $3 and account version $4 with patch $5; the error or null.
create or replace function pg_temp.turn(text, text, bigint, bigint, jsonb, uuid default '00000000-0000-4000-8000-000000000f91') returns text language sql as $$
 select public.career_host_commit($6,pg_temp.th($1),$2,repeat('a',64),$3,$4,
  jsonb_build_object('scope',jsonb_build_object('userId',$6),'stores',jsonb_build_object('trackStore',jsonb_build_object('_careerThread',jsonb_build_object('lastTopic',$1)))),
  $5,'TEST turn '||$2,jsonb_build_object('reply','TEST reply','thread_id',pg_temp.th($1)))->>'error' $$;
create or replace function pg_temp.load(text, text) returns jsonb language sql as $$ select public.career_host_load(pg_temp.u(),pg_temp.th($1),$2,repeat('b',64)) $$;
create or replace function pg_temp.acct() returns jsonb language sql as $$
 select value from public.career_watch_kv where user_id=pg_temp.u() and key='career:account' $$;
create or replace function pg_temp.mem(text, text, int) returns jsonb language sql as $$
 select jsonb_build_object('v',1,'updated_at','2026-10-26T00:00:00Z',
  'profile',jsonb_build_object('basics',jsonb_build_object('name','TEST Person'),'facts',jsonb_build_array(
    jsonb_build_object('id','F-001','kind','skill','text',$1,'status',$2,'needs_confirmation',$2<>'confirmed',
     'confirmation_event_id',case when $2='confirmed' then '00000000-0000-4000-8000-00000000e001' end))),
  'tracker',jsonb_build_object('rows',(select coalesce(jsonb_agg(jsonb_build_object('app_id','app-test-'||g,'company','TEST Employer '||g,'stage','Submitted')),'[]'::jsonb) from generate_series(1,$3) g))) $$;

-- Thread A: the resume's fact (a draft) and one application on the tracker.
select t.ok(pg_temp.turn('A','a1',0,0,jsonb_build_object('memory',pg_temp.mem('Skill: TEST Python','draft',1))) is null,'thread A commits the profile and tracker to the account');
select t.ok(pg_temp.acct()#>>'{memory,tracker,rows,0,company}'='TEST Employer 1','the account holds the tracker');
select t.ok((select state#>'{career,stores,trackStore,_careerThread}' from agent_flow_state where thread_id=pg_temp.th('A'))='{"lastTopic":"A"}','the thread keeps its own frame');

-- Thread B, a new thread: its load carries the profile and the tracker set in thread A.
select t.ok(pg_temp.load('B','b0')#>>'{account,memory,profile,facts,0,text}'='Skill: TEST Python'
 and jsonb_array_length(pg_temp.load('B','b0')#>'{account,memory,tracker,rows}')=1 and pg_temp.load('B','b0')->'snapshot'='null'::jsonb,
 'a new thread loads the facts and tracker set in another thread (and no thread state of its own)');

-- A turn in B that changes nothing about the person keeps the record: the account merge carries it over.
select t.ok(pg_temp.turn('B','b1',0,1,'{}') is null and pg_temp.acct()#>>'{memory,profile,facts,0,text}'='Skill: TEST Python','an ordinary turn keeps the memory');

-- Authority: a draft fact or a tracker row never makes an approval stale; a change to the confirmed facts does.
select t.ok(pg_temp.turn('B','b2',1,2,jsonb_build_object('memory',pg_temp.mem('Skill: TEST Python','draft',2))) is null
 and (pg_temp.acct()->>'authority_version')::bigint<3,'a tracker change does not move the approval authority');
select t.ok(pg_temp.turn('B','b3',2,3,jsonb_build_object('memory',pg_temp.mem('Skill: TEST Python','confirmed',2))) is null
 and (pg_temp.acct()->>'authority_version')::bigint=4,'confirming a fact moves the approval authority to this version');
select t.ok(pg_temp.turn('A','a2',1,4,jsonb_build_object('memory',pg_temp.mem('Skill: TEST Python','confirmed',3))) is null
 and (pg_temp.acct()->>'authority_version')::bigint=4,'with the confirmed facts unchanged, the authority stays');

-- Two threads load the same account version; the first commit wins and the second is refused, the record intact.
select t.ok((pg_temp.load('A','a3')->>'accountVersion')::bigint=5 and (pg_temp.load('B','b4')->>'accountVersion')::bigint=5,'both threads loaded version 5');
select t.ok(pg_temp.turn('A','a3',2,5,jsonb_build_object('memory',pg_temp.mem('Skill: TEST Go','confirmed',3))) is null,'thread A commits first');
select t.ok(pg_temp.turn('B','b4',3,5,jsonb_build_object('memory',pg_temp.mem('Skill: TEST Stale','confirmed',1))) ='revision_conflict','thread B''s commit from the same version is refused');
select t.ok(pg_temp.acct()#>>'{memory,profile,facts,0,text}'='Skill: TEST Go' and jsonb_array_length(pg_temp.acct()#>'{memory,tracker,rows}')=3
 and (select count(*) from agent_messages where thread_id=pg_temp.th('B') and content='TEST turn b4')=0,'the refused commit wrote nothing');

-- The shape is bounded: anything else rolls the whole turn back.
select t.must_fail($$select pg_temp.turn('A','a4',3,6,'{"memory":{"v":1,"secret":"x"}}')$$,'invalid account memory','an unknown memory key is refused');
select t.must_fail($$select pg_temp.turn('A','a4',3,6,'{"memory":{"v":1,"profile":"text"}}')$$,'invalid account memory','a profile that is not an object is refused');
select t.must_fail($$select pg_temp.turn('A','a4',3,6,'{"memory":{"v":1,"tracker":{"rows":[],"_careerThread":{}}}}')$$,'invalid account memory','a thread frame inside the account tracker is refused');
select t.must_fail($$select pg_temp.turn('A','a4',3,6,'{"memory":{"v":1,"profile":{"facts":{}}}}')$$,'invalid account memory','profile facts that are not a list are refused');
select t.must_fail($$select pg_temp.turn('A','a4',3,6,jsonb_build_object('memory',jsonb_build_object('v',1,'profile',jsonb_build_object('basics',jsonb_build_object('note',repeat('x',600000))))))$$,
 'invalid account memory','a memory over 512 KB is refused');
select t.ok(pg_temp.acct()#>>'{memory,profile,facts,0,text}'='Skill: TEST Go','a refused shape changed nothing');

-- Another person's account is untouched by all of it.
select t.ok(pg_temp.turn('C','c1',0,0,'{}','00000000-0000-4000-8000-000000000f92'::uuid) is null
 and (select value->'memory' from career_watch_kv where user_id='00000000-0000-4000-8000-000000000f92' and key='career:account') is null,'another person has no memory of this one');

-- Erase forgets the memory, even one sent with the erase itself; a new thread then loads nothing.
select t.ok(pg_temp.turn('A','a5',3,6,jsonb_build_object('erase',true,'memory',pg_temp.mem('Skill: TEST Resurrected','confirmed',1))) is null,'an erase');
select t.ok(pg_temp.acct()->'memory' is null and (pg_temp.acct()->>'epoch')::bigint=1,'the erase cleared the account memory and moved the privacy epoch');
select t.ok(pg_temp.load('B','b9')#>'{account,memory}' is null
 and pg_temp.load('B','b9')#>'{snapshot,stores,trackStore}' is null and pg_temp.load('B','b9')#>'{snapshot,stores,profile}' is null,
 'after the erase another thread loads no profile, no tracker and no thread copy');
rollback;
