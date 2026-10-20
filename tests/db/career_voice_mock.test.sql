-- WO-035 (20261021020000_career_voice_mock.sql): the voice mock's session. A session belongs to the person's own thread;
-- at most 5 a day; its link starts one call, within 10 minutes; the debrief is posted once, into the thread as Upmore's
-- last word and once into the outbox when that thread is the texting thread; the text mock replaces it once; only the
-- service role runs any of it; nothing about audio or a transcript is stored; deleting the account removes it.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000351','voice-a@example.test'),('00000000-0000-4000-8000-000000000352','voice-b@example.test');
insert into profiles(id) select id from auth.users where email like 'voice-%@example.test';
insert into agent_threads(id,user_id,title) values
 ('00000000-0000-4000-8000-0000000003b1','00000000-0000-4000-8000-000000000351','Texts'),
 ('00000000-0000-4000-8000-0000000003b2','00000000-0000-4000-8000-000000000352','Texts');
insert into channel_contacts(contact,user_id,thread_id,opted_out) values
 ('+15550003501','00000000-0000-4000-8000-000000000351','00000000-0000-4000-8000-0000000003b1',false);
create temp table vs(name text primary key, id uuid);
grant all on vs to service_role;

-- Created by the service role, for the person's own thread only.
set role service_role;
insert into vs select 'a1', career_voice_create('00000000-0000-4000-8000-000000000351','00000000-0000-4000-8000-0000000003b1',
 '{"v":1,"role":"IB","company":"Goldman Sachs","minutes":20,"questions":[],"answers":[],"status":"running"}','2026-10-21T15:00:00Z');
select t.must_fail($$select career_voice_create('00000000-0000-4000-8000-000000000351','00000000-0000-4000-8000-0000000003b2','{}','2026-10-21T15:00:00Z')$$,'thread not owned','a session only for the person''s own thread');
select t.must_fail($$select career_voice_create('00000000-0000-4000-8000-000000000351','00000000-0000-4000-8000-0000000003b1','[]','2026-10-21T15:00:00Z')$$,'invalid voice session','the plan is an object');
reset role;
select t.ok((select id is not null from vs where name='a1'),'a session is created');
select t.ok((select key='career:voice:'||(select id from vs where name='a1') and value->>'link_expires_at' is not null and (value->>'link_expires_at')::timestamptz='2026-10-21T15:10:00Z'
 from career_watch_kv where user_id='00000000-0000-4000-8000-000000000351' and key like 'career:voice:%'),'kept in career_watch_kv, its link good for 10 minutes');
select t.ok((select not exists (select from career_watch_kv, jsonb_object_keys(value) k where key like 'career:voice:%' and k ~* 'audio|transcript|recording')),'no audio or transcript field in the session');
select t.ok((select not exists (select from information_schema.columns where table_schema='public' and column_name ~* 'audio')),'no audio column anywhere');

-- Five a day.
insert into vs select 'a'||n, career_voice_create('00000000-0000-4000-8000-000000000351','00000000-0000-4000-8000-0000000003b1','{"v":1}','2026-10-21T15:0'||n||':00Z') from generate_series(2,5) n;
select t.ok((select career_voice_create('00000000-0000-4000-8000-000000000351','00000000-0000-4000-8000-0000000003b1','{"v":1}','2026-10-21T15:30:00Z') is null),'a sixth in a day is refused (null)');
select t.ok((select career_voice_create('00000000-0000-4000-8000-000000000351','00000000-0000-4000-8000-0000000003b1','{"v":1}','2026-10-22T15:30:00Z') is not null),'a day later, a new one');

-- The link's one use, within 10 minutes, by its owner only.
select t.ok((select career_voice_start('00000000-0000-4000-8000-000000000352',(select id from vs where name='a1'),'2026-10-21T15:01:00Z',35) is null),'another person never starts it');
select t.ok((select career_voice_start('00000000-0000-4000-8000-000000000351',(select id from vs where name='a1'),'2026-10-21T15:01:00Z',35)->>'role'='IB'),'the first start returns the plan');
select t.ok((select career_voice_start('00000000-0000-4000-8000-000000000351',(select id from vs where name='a1'),'2026-10-21T15:02:00Z',35) is null),'a reused link is refused');
select t.ok((select career_voice_start('00000000-0000-4000-8000-000000000351',(select id from vs where name='a2'),'2026-10-21T15:12:01Z',35) is null),'an expired link is refused');
select t.must_fail($$select career_voice_start('00000000-0000-4000-8000-000000000351',(select id from vs where name='a3'),'2026-10-21T15:04:00Z',90)$$,'invalid voice start','a call window over an hour is refused');

-- The debrief, once, within the call window, as the thread's last word and once in the outbox.
select t.ok((select career_voice_finish('00000000-0000-4000-8000-000000000351',(select id from vs where name='a3'),'Debrief','2026-10-21T15:20:00Z') = false),'no debrief for a call that never started');
select t.ok((select career_voice_finish('00000000-0000-4000-8000-000000000352',(select id from vs where name='a1'),'Debrief','2026-10-21T15:20:00Z') = false),'nor for another person');
select t.ok((select career_voice_finish('00000000-0000-4000-8000-000000000351',(select id from vs where name='a1'),'Debrief, IB voice mock for Goldman Sachs: 6 of 6 answered.','2026-10-21T15:22:00Z')),'the debrief is posted');
select t.ok((select content='Debrief, IB voice mock for Goldman Sachs: 6 of 6 answered.' and meta->>'intent'='career_mock_debrief' and meta->>'voice_session'=(select id::text from vs where name='a1')
 from agent_messages where thread_id='00000000-0000-4000-8000-0000000003b1' order by id desc limit 1),'it is the thread''s last word');
select t.ok((select count(*)=1 and min(kind)='mock' and min(text) like 'Debrief, IB voice mock%' from career_outbox where key='mock:'||(select id from vs where name='a1')),'queued once to the texting thread');
select t.ok((select career_voice_finish('00000000-0000-4000-8000-000000000351',(select id from vs where name='a1'),'Debrief again','2026-10-21T15:23:00Z') = false),'a second debrief is refused');
select career_voice_start('00000000-0000-4000-8000-000000000351',(select id from vs where name='a4'),'2026-10-21T15:05:00Z',35);
select t.ok((select career_voice_finish('00000000-0000-4000-8000-000000000351',(select id from vs where name='a4'),'Debrief','2026-10-21T15:41:00Z') = false),'after the call window, nothing is posted');
select t.must_fail($$select career_voice_finish('00000000-0000-4000-8000-000000000351',(select id from vs where name='a4'),'','2026-10-21T15:06:00Z')$$,'invalid voice debrief','an empty debrief is refused');

-- The text mock instead, once: saved as the thread's mock, its first question the last word; the link is then spent.
select t.ok((select career_voice_fallback('00000000-0000-4000-8000-000000000351',(select id from vs where name='a5'),
 '{"v":1,"role":"IB","status":"running"}','Here is the text mock instead.','2026-10-21T15:06:00Z')),'the text mock replaces the call');
select t.ok((select value->>'role'='IB' from career_watch_kv where user_id='00000000-0000-4000-8000-000000000351' and key='career:mock:00000000-0000-4000-8000-0000000003b1'),'saved as the thread''s text mock');
select t.ok((select meta->>'intent'='career_mock' from agent_messages where thread_id='00000000-0000-4000-8000-0000000003b1' order by id desc limit 1),'its question is the last word, so the next text answers it');
select t.ok((select count(*)=1 from career_outbox where key='mock:'||(select id from vs where name='a5')||':text'),'and it is texted once');
select t.ok((select career_voice_fallback('00000000-0000-4000-8000-000000000351',(select id from vs where name='a5'),'{"v":1}','Again','2026-10-21T15:07:00Z') = false),'once');
select t.ok((select career_voice_start('00000000-0000-4000-8000-000000000351',(select id from vs where name='a5'),'2026-10-21T15:07:00Z',35) is null),'a link moved to the text mock no longer starts a call');
select t.ok((select career_voice_fallback('00000000-0000-4000-8000-000000000351',(select id from vs where name='a1'),'{"v":1}','Too late','2026-10-21T15:30:00Z') = false),'no text mock after the debrief');

-- Only the service role.
select t.as_user('00000000-0000-4000-8000-000000000351');set role authenticated;
select t.must_fail($$select career_voice_create('00000000-0000-4000-8000-000000000351','00000000-0000-4000-8000-0000000003b1','{}',now())$$,'permission denied','a person cannot create a session directly');
select t.must_fail($$select career_voice_start('00000000-0000-4000-8000-000000000351',gen_random_uuid(),now(),30)$$,'permission denied','or start one');
select t.must_fail($$select career_voice_finish('00000000-0000-4000-8000-000000000351',gen_random_uuid(),'x',now())$$,'permission denied','or post a debrief');
select t.must_fail($$select * from career_watch_kv$$,'permission denied','or read the sessions');
reset role;
-- The outbox still refuses an unknown kind.
select t.must_fail($$insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000000351','voice:x','voice','x',now())$$,'career_outbox_(key|kind)_check','an unknown outbox kind is refused');
-- Deleting the account removes every session.
delete from auth.users where id='00000000-0000-4000-8000-000000000351';
select t.ok((select not exists (select from career_watch_kv where user_id='00000000-0000-4000-8000-000000000351')),'deleting the account removes the sessions');
rollback;
