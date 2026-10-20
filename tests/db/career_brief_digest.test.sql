-- WO-034: interview invites and the weekly digest (20261021050000_career_brief_digest.sql). The person reads only their own
-- rows; only the service role writes; a start time is only ever a stated one; the outbox takes briefs and digests once
-- per key and still takes every earlier kind; a draft may belong to a pasted invite; an erase through career_host_commit
-- deletes the person's interviews and digest settings and nobody else's; deleting the account removes them.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000a71','brief-a@example.test'),('00000000-0000-4000-8000-000000000a72','brief-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000a71'),('00000000-0000-4000-8000-000000000a72');
set role service_role;
insert into career_interviews(user_id,invite_key,source,application_ref,company,role,when_said,interview_date,interview_time,zone,starts_at,format,interviewers,mail_at,seen_at,brief_at,brief_ms) values
 ('00000000-0000-4000-8000-000000000a71',repeat('a',64),'mail','track:app-jpm-1','JPMorgan Chase & Co.','Investment Banking Summer Analyst','["Thursday, October 22","10:00 AM"]','2026-10-22','10:00','America/New_York','2026-10-22T14:00:00Z','video','[{"name":"Priya Shah","title":"Vice President"}]','2026-10-20T14:56:00Z','2026-10-20T15:00:00Z','2026-10-20T15:00:00Z',240000),
 ('00000000-0000-4000-8000-000000000a72',repeat('b',64),'chat',null,'Datadog',null,'[]',null,null,null,null,null,'[]',null,'2026-10-20T15:00:00Z',null,null);
select t.must_fail($$insert into career_interviews(user_id,invite_key,source,seen_at) values('00000000-0000-4000-8000-000000000a71',repeat('a',64),'mail',now())$$,'career_interviews_once','one row per invite, ever');
select t.must_fail($$insert into career_interviews(user_id,invite_key,source,seen_at,starts_at) values('00000000-0000-4000-8000-000000000a71',repeat('c',64),'chat',now(),now())$$,'career_interviews_start_stated','a start time needs its stated date, time and zone');
select t.must_fail($$insert into career_interviews(user_id,invite_key,source,seen_at,interview_time) values('00000000-0000-4000-8000-000000000a71',repeat('d',64),'chat',now(),'9am')$$,'career_interviews_interview_time_check','a time is HH:MM');
select t.must_fail($$insert into career_interviews(user_id,invite_key,source,seen_at) values('00000000-0000-4000-8000-000000000a71','not-a-hash','chat',now())$$,'career_interviews_invite_key_check','the key is a hash');
select t.must_fail($$insert into career_interviews(user_id,invite_key,source,seen_at,interviewers) values('00000000-0000-4000-8000-000000000a71',repeat('e',64),'chat',now(),'[1,2,3,4,5,6,7]')$$,'career_interviews_interviewers_check','at most six interviewers');
insert into career_digest_prefs(user_id,enabled,day,hour,tz) values('00000000-0000-4000-8000-000000000a71',false,5,9,'America/Chicago'),('00000000-0000-4000-8000-000000000a72',true,0,18,null);
select t.must_fail($$update career_digest_prefs set hour=24 where user_id='00000000-0000-4000-8000-000000000a71'$$,'career_digest_prefs_hour_check','an hour is 0 to 23');
select t.must_fail($$update career_digest_prefs set day=7 where user_id='00000000-0000-4000-8000-000000000a71'$$,'career_digest_prefs_day_check','a day is 0 to 6');

-- The outbox: briefs and digests once per key, every earlier kind still allowed.
insert into career_outbox(user_id,key,kind,text,deliver_at) values
 ('00000000-0000-4000-8000-000000000a71','brief:'||repeat('a',64)||':1','brief','Interview brief: JPMorganChase.',now()),
 ('00000000-0000-4000-8000-000000000a71','digest:2026-W43','digest','Your weekly job search digest.',now()),
 ('00000000-0000-4000-8000-000000000a71','status:'||repeat('f',64),'status','Stripe said no.',now()),
 ('00000000-0000-4000-8000-000000000a71','followup:thank_you:invite:abc:after:2026-10-22','followup','I drafted a thank-you.',now()),
 ('00000000-0000-4000-8000-000000000a71','mock:1','mock','Mock.',now());
select t.must_fail($$insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000000a71','digest:2026-W43','digest','Again.',now())$$,'career_outbox_once','a digest once a week');
select t.must_fail($$insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000000a71','nudge:1','nudge','x',now())$$,'career_outbox_key_check','an unknown key is refused');
-- A thank-you for a pasted invite that matched no application.
insert into career_mail_drafts(user_id,draft_key,application_ref,kind,company,text,basis) values('00000000-0000-4000-8000-000000000a71','thank_you:invite:abc:after:2026-10-22','invite:abc','thank_you','Datadog','Hello, thank you.','interview Oct 22, from the invite');
select t.ok((select count(*)=1 from career_mail_drafts where application_ref='invite:abc'),'a draft may belong to a pasted invite');
select t.must_fail($$insert into career_mail_drafts(user_id,draft_key,application_ref,kind,company,text,basis) values('00000000-0000-4000-8000-000000000a71','thank_you:x','other:abc','thank_you','X','t','b')$$,'career_mail_drafts_application_ref_check','an unknown reference is refused');
select t.ok((select count(*)=1 from information_schema.columns where table_name='career_proactive_runs' and column_name in ('briefs')) and (select count(*)=1 from information_schema.columns where table_name='career_proactive_runs' and column_name='digests'),'the run records briefs and digests');

-- The person's own reads.
reset role;
select t.as_user('00000000-0000-4000-8000-000000000a71');set role authenticated;
select t.ok((select count(*)=1 and bool_and(company='JPMorgan Chase & Co.') from career_interviews),'the owner reads their own interviews, never another person''s');
select t.ok((select count(*)=1 and bool_and(not enabled and day=5) from career_digest_prefs),'and their own digest settings');
select t.must_fail($$insert into career_interviews(user_id,invite_key,source,seen_at) values('00000000-0000-4000-8000-000000000a71',repeat('9',64),'chat',now())$$,'permission denied','the person cannot write an interview');
select t.must_fail($$update career_digest_prefs set enabled=true$$,'permission denied','or change the digest outside the chat');
reset role;set role anon;
select t.must_fail($$select * from career_interviews$$,'permission denied','anon reads nothing');
select t.must_fail($$select * from career_digest_prefs$$,'permission denied','anon reads no settings');
reset role;

-- An erase deletes the person's interviews and digest settings and nobody else's.
grant all on agent_threads, agent_messages to service_role;
grant all on sequence agent_messages_id_seq to service_role;
insert into agent_threads(id,user_id) values('00000000-0000-4000-8000-000000000aa1','00000000-0000-4000-8000-000000000a71');
set role service_role;
create temp table commit_out(n int, r jsonb);
insert into commit_out select 1, career_host_commit('00000000-0000-4000-8000-000000000a71','00000000-0000-4000-8000-000000000aa1','turn-1',repeat('a',64),0,0,
 '{"v":1,"scope":{"userId":"00000000-0000-4000-8000-000000000a71"},"stores":{}}','{}','Synthetic input',
 '{"thread_id":"00000000-0000-4000-8000-000000000aa1","reply":"Synthetic reply"}');
select t.ok((select count(*)=1 from career_interviews where user_id='00000000-0000-4000-8000-000000000a71'),'a plain turn keeps the interviews');
insert into commit_out select 2, career_host_commit('00000000-0000-4000-8000-000000000a71','00000000-0000-4000-8000-000000000aa1','turn-erase',repeat('d',64),1,1,
 '{"v":1,"scope":{"userId":"00000000-0000-4000-8000-000000000a71"},"stores":{}}','{"erase":true}','Forget my career profile',
 '{"thread_id":"00000000-0000-4000-8000-000000000aa1","reply":"I removed your saved career profile."}');
select t.ok((select r ? 'response' from commit_out where n=2),'the erase commits');
select t.ok((select count(*)=0 from career_interviews where user_id='00000000-0000-4000-8000-000000000a71'),'an erase deletes the person''s interviews');
select t.ok((select count(*)=0 from career_digest_prefs where user_id='00000000-0000-4000-8000-000000000a71'),'and their digest settings');
select t.ok((select count(*)=1 from career_interviews where user_id='00000000-0000-4000-8000-000000000a72') and (select count(*)=1 from career_digest_prefs where user_id='00000000-0000-4000-8000-000000000a72'),'and nobody else''s');
reset role;

-- Deleting the account removes the rest.
delete from auth.users where id='00000000-0000-4000-8000-000000000a72';
select t.ok((select count(*)=0 from career_interviews where user_id='00000000-0000-4000-8000-000000000a72') and (select count(*)=0 from career_digest_prefs where user_id='00000000-0000-4000-8000-000000000a72'),'deleting the account deletes its interviews and settings');
rollback;
