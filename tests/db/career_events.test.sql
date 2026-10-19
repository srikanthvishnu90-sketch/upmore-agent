-- WO-027: the account's timeline (20261020120000_career_events.sql) and its erase (20261020120100_career_events_erase.sql).
-- The person reads only their own events (directly and through career_recall_own); only the service role writes; a
-- prepared application is on the timeline from its insert, and a failed event write never fails that insert; an erase
-- through career_host_commit deletes the person's events and nobody else's, keeping every other erase behavior; deleting
-- the account removes them.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000971','events-a@example.test'),('00000000-0000-4000-8000-000000000972','events-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000971'),('00000000-0000-4000-8000-000000000972');
set role service_role;
insert into career_events(user_id,at,kind,subject,detail,source) values
 ('00000000-0000-4000-8000-000000000971','2026-10-03T14:00:00Z','outreach_sent','Dana Lee','{"company":"JPMorgan Chase","role":"Banker"}','chat'),
 ('00000000-0000-4000-8000-000000000971','2026-10-09T14:00:00Z','intro_made','Sam Ortiz','{"company":"JPMorgan Chase"}','chat'),
 ('00000000-0000-4000-8000-000000000971','2026-09-20T14:00:00Z','outreach_sent','Ari Cohen','{"company":"Goldman Sachs","role":"Banker"}','chat'),
 ('00000000-0000-4000-8000-000000000971','2026-10-12T14:00:00Z','alert_set','data analyst','{}','chat'),
 ('00000000-0000-4000-8000-000000000972','2026-10-05T14:00:00Z','outreach_sent','Other Person','{"company":"JPMorgan Chase"}','chat');
select t.must_fail($$insert into career_events(user_id,kind) values('00000000-0000-4000-8000-000000000971','sent_money')$$,'career_events_kind_check','an unknown kind is refused');
select t.must_fail($$insert into career_events(user_id,kind,subject) values('00000000-0000-4000-8000-000000000971','note',repeat('x',201))$$,'career_events_subject_check','a subject over 200 characters is refused');
select t.must_fail($$insert into career_events(user_id,kind,detail) values('00000000-0000-4000-8000-000000000971','note',jsonb_build_object('x',repeat('x',4100)))$$,'career_events_detail_check','detail over 4 KB is refused');
select t.must_fail($$insert into career_events(user_id,kind,detail) values('00000000-0000-4000-8000-000000000971','note','[1]')$$,'career_events_detail_check','detail is an object');
select t.must_fail($$insert into career_events(user_id,kind) values('00000000-0000-4000-8000-000000000979','note')$$,'foreign key','an event belongs to a profile');

-- The person's own reads.
reset role;
select t.as_user('00000000-0000-4000-8000-000000000971');set role authenticated;
select t.ok((select count(*)=4 from career_events),'the owner reads their own events, never another person''s');
select t.must_fail($$insert into career_events(user_id,kind) values('00000000-0000-4000-8000-000000000971','note')$$,'permission denied','the person cannot write an event');
select t.must_fail($$update career_events set subject='changed'$$,'permission denied','or change one');
select t.must_fail($$delete from career_events$$,'permission denied','or delete one');
select t.ok((select array_agg(subject order by at desc)=array['Sam Ortiz','Dana Lee'] from career_recall_own(null,'JPM','2026-10-01T04:00:00Z','2026-11-01T04:00:00Z',50)),'recall: a subject in the detail, inside the window, newest first');
select t.ok((select array_agg(subject)=array['Dana Lee'] from career_recall_own(array['outreach_sent'],'banker','2026-10-01T04:00:00Z','2026-11-01T04:00:00Z',50)),'recall: by kind, subject and October');
select t.ok((select count(*)=1 from career_recall_own(null,null,null,null,1)),'the limit holds');
select t.ok((select count(*)=0 from career_recall_own(null,'%',null,null,50)),'a LIKE wildcard is taken literally');
select t.must_fail($$select * from career_recall_own(array['sent_money'],null,null,null,10)$$,'unknown event kind','an unknown kind is refused');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000972');set role authenticated;
select t.ok((select count(*)=1 from career_recall_own(null,'JPM',null,null,50)),'another person recalls only their own');
reset role;
select t.as_user('');set role authenticated;
select t.must_fail($$select * from career_recall_own(null,null,null,null,10)$$,'not signed in','nobody signed in reads nothing');
reset role;set role anon;
select t.must_fail($$select * from career_recall_own(null,null,null,null,10)$$,'permission denied','anon cannot call it');
select t.must_fail($$select * from career_events$$,'permission denied','anon cannot read the table');
reset role;

-- A prepared application is on the timeline from its insert; a failure to write the event never fails the preparation.
set role service_role;
insert into career_apply_prepared(user_id,job_id,company,url,payload,payload_hash,card_lines)
 values('00000000-0000-4000-8000-000000000971','TEST-EV-1','Ramp','https://jobs.ashbyhq.com/ramp/TEST-EV-1','{}',repeat('b',64),array['Ramp - Data Analyst']);
select t.ok((select count(*)=1 and bool_and(subject='Ramp' and source='prepare' and detail->>'job_id'='TEST-EV-1') from career_events where kind='application_prepared'),'a prepared application is written to the timeline');
reset role;
alter table career_events add constraint test_no_prepared check (kind<>'application_prepared') not valid;
set role service_role;
insert into career_apply_prepared(user_id,job_id,company,url,payload,payload_hash,card_lines)
 values('00000000-0000-4000-8000-000000000971','TEST-EV-2','Plaid','https://jobs.lever.co/plaid/TEST-EV-2','{}',repeat('c',64),array['Plaid - Analyst']);
select t.ok((select count(*)=1 from career_apply_prepared where job_id='TEST-EV-2'),'the preparation is saved when its event cannot be');
select t.ok((select count(*)=1 from career_events where kind='application_prepared'),'and no event was written for it');
reset role;
alter table career_events drop constraint test_no_prepared;

-- An erase through career_host_commit (the host's "forget my career profile") deletes the person's events and nobody
-- else's; a plain turn keeps them; the rest of the erase is unchanged (account rebuilt with a new epoch and paused, the
-- watch state gone, replay text cleared).
-- The stub's chat tables predate its default privileges; in a Supabase project the service role holds these.
grant all on agent_threads, agent_messages to service_role;
grant all on sequence agent_messages_id_seq to service_role;
insert into agent_threads(id,user_id) values('00000000-0000-4000-8000-0000000009a1','00000000-0000-4000-8000-000000000971');
set role service_role;
insert into career_watch_kv(user_id,key,value) values('00000000-0000-4000-8000-000000000971','career:watch-profile:00000000-0000-4000-8000-000000000971','{"user_id":"00000000-0000-4000-8000-000000000971"}');
create temp table commit_out(n int, r jsonb);
insert into commit_out select 1, career_host_commit('00000000-0000-4000-8000-000000000971','00000000-0000-4000-8000-0000000009a1','turn-1',repeat('a',64),0,0,
 '{"v":1,"scope":{"userId":"00000000-0000-4000-8000-000000000971"},"stores":{}}','{}','Synthetic input',
 '{"thread_id":"00000000-0000-4000-8000-0000000009a1","reply":"Synthetic reply"}');
select t.ok((select r ? 'response' from commit_out where n=1),'a plain turn commits');
select t.ok((select count(*)=5 from career_events where user_id='00000000-0000-4000-8000-000000000971'),'a plain turn keeps the timeline');
insert into commit_out select 2, career_host_commit('00000000-0000-4000-8000-000000000971','00000000-0000-4000-8000-0000000009a1','turn-erase',repeat('d',64),1,1,
 '{"v":1,"scope":{"userId":"00000000-0000-4000-8000-000000000971"},"stores":{}}','{"erase":true}','Forget my career profile',
 '{"thread_id":"00000000-0000-4000-8000-0000000009a1","reply":"I removed your saved career profile."}');
select t.ok((select r ? 'response' from commit_out where n=2),'the erase commits');
select t.ok((select count(*)=0 from career_events where user_id='00000000-0000-4000-8000-000000000971'),'an erase deletes the person''s timeline');
select t.ok((select count(*)=1 from career_events where user_id='00000000-0000-4000-8000-000000000972'),'and nobody else''s');
select t.ok((select (value->>'epoch')::int=1 and value->>'paused'='true' and (value->>'version')::int=2 from career_watch_kv where user_id='00000000-0000-4000-8000-000000000971' and key='career:account'),'the account is rebuilt with a new epoch, paused, as before');
select t.ok((select count(*)=0 from career_watch_kv where user_id='00000000-0000-4000-8000-000000000971' and key like 'career:watch-profile:%'),'the watch state is gone, as before');
select t.ok((select bool_and(value->'response'='null'::jsonb) from career_watch_kv where user_id='00000000-0000-4000-8000-000000000971' and key='career:turn:00000000-0000-4000-8000-0000000009a1:turn-1'),'earlier replay text is cleared, as before');
select t.ok((select (career_host_commit('00000000-0000-4000-8000-000000000971','00000000-0000-4000-8000-0000000009a1','turn-1',repeat('a',64),2,2,
 '{"v":1,"scope":{"userId":"00000000-0000-4000-8000-000000000971"},"stores":{}}','{}','Synthetic input',
 '{"thread_id":"00000000-0000-4000-8000-0000000009a1","reply":"Synthetic reply"}'))->>'error'='privacy_epoch_changed'),'a turn from before the erase cannot be replayed, as before');
reset role;

-- Deleting the account removes the rest.
delete from auth.users where id='00000000-0000-4000-8000-000000000972';
select t.ok((select count(*)=0 from career_events where user_id='00000000-0000-4000-8000-000000000972'),'deleting the account deletes its timeline');
rollback;
