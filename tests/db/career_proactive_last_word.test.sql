-- A delivered alert, report, receipt, status, follow-up, brief or digest is written to the person's texting thread as
-- an assistant message, so it is the thread's last word; queued or held texts are not; kinds that write their own
-- message (card, reply) are not written twice; a person with no texting thread is left alone
-- (20261021100000_career_proactive_last_word.sql).
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000004101','lw1@example.test'),('00000000-0000-4000-8000-000000004102','lw2@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000004101'),('00000000-0000-4000-8000-000000004102');
insert into agent_threads(id,user_id,title) values('00000000-0000-4000-8000-0000000041a1','00000000-0000-4000-8000-000000004101','Texts');
insert into agent_messages(thread_id,role,content,meta) values('00000000-0000-4000-8000-0000000041a1','assistant','Here are the cloud terms. Reply yes to turn it on.','{"intent":"career_cloud_terms"}');
set role service_role;
insert into channel_contacts(contact,user_id,thread_id,last_inbound_at,created_at) values('+15550004101','00000000-0000-4000-8000-000000004101','00000000-0000-4000-8000-0000000041a1',now(),now());
insert into career_outbox(user_id,key,kind,text,deliver_at) values
 ('00000000-0000-4000-8000-000000004101','receipt:job-1','receipt','Sent: Analyst at Acme. Confirmed by Acme''s email.',now()),
 ('00000000-0000-4000-8000-000000004101','alert:job-2','alert','New match: Analyst at Beta.',now()),
 ('00000000-0000-4000-8000-000000004101','reply:msg-3','reply','An answer to a message.',now()),
 ('00000000-0000-4000-8000-000000004102','alert:job-4','alert','New match for someone with no thread.',now());
reset role;
select t.ok((select meta->>'intent' from agent_messages where thread_id='00000000-0000-4000-8000-0000000041a1' order by id desc limit 1)='career_cloud_terms','a queued text is not in the thread yet');
set role service_role;
update career_outbox set status='held' where key='alert:job-2' and user_id='00000000-0000-4000-8000-000000004101';
reset role;
select t.ok((select count(*)=1 from agent_messages where thread_id='00000000-0000-4000-8000-0000000041a1'),'a held text is not in the thread');
set role service_role;
update career_outbox set status='delivered',delivered_at=now() where key='receipt:job-1' and user_id='00000000-0000-4000-8000-000000004101';
reset role;
select t.ok((select meta->>'intent'='career_proactive' and meta->>'kind'='receipt' and content like 'Sent: Analyst at Acme%' from agent_messages where thread_id='00000000-0000-4000-8000-0000000041a1' order by id desc limit 1),'a delivered receipt is now the thread''s last word, so a later "ok" is not read as a yes to the terms');
set role service_role;
update career_outbox set status='delivered',delivered_at=now() where key='receipt:job-1' and user_id='00000000-0000-4000-8000-000000004101';
reset role;
select t.ok((select count(*)=2 from agent_messages where thread_id='00000000-0000-4000-8000-0000000041a1'),'a second write of the same delivered row adds nothing');
set role service_role;
update career_outbox set status='delivered',delivered_at=now() where key='reply:msg-3';
reset role;
select t.ok((select count(*)=2 from agent_messages where thread_id='00000000-0000-4000-8000-0000000041a1'),'a reply is not written again: its chat turn already is');
set role service_role;
update career_outbox set status='delivered',delivered_at=now() where key='alert:job-2' and user_id='00000000-0000-4000-8000-000000004101';
reset role;
select t.ok((select count(*)=3 and max(case when meta->>'kind'='alert' then 1 else 0 end)=1 from agent_messages where thread_id='00000000-0000-4000-8000-0000000041a1'),'a held alert enters the thread when it is delivered');
set role service_role;
update career_outbox set status='delivered',delivered_at=now() where key='alert:job-4';
reset role;
select t.ok((select count(*)=1 from career_outbox where key='alert:job-4' and status='delivered'),'a person with no texting thread still gets the delivery recorded');
set role service_role;
reset role;
select t.ok(not has_function_privilege('authenticated','public.career_outbox_to_thread()','execute'),'nobody signed in can call it');
rollback;
