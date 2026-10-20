-- Career alerts (20261019010001_career_alerts.sql, WO-007b): a person reads only their own settings and outbox and
-- writes neither; the outbox holds one row per person and key, ever; the settings shape and caps hold in the database
-- as in code; the run log is the service role's alone.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000f1','al1@example.com'),('00000000-0000-0000-0000-0000000000f2','al2@example.com');
set role service_role;
insert into public.career_alert_prefs(user_id,tz,prefs,last_checked_at) values
 ('00000000-0000-0000-0000-0000000000f1','America/New_York','{"on":true,"keywords":["data analyst"],"locations":[],"remote_ok":true,"report_hour":8,"quiet_start":22,"quiet_end":7,"max_instant_per_day":3}',now()),
 ('00000000-0000-0000-0000-0000000000f2','America/Chicago','{"on":true,"keywords":["nurse"],"locations":["chicago"],"remote_ok":false,"report_hour":9,"quiet_start":22,"quiet_end":7,"max_instant_per_day":10}',now());
select t.ok((select count(*)=2 from public.career_alert_prefs),'the service role saves alert settings');
select t.must_fail($$update public.career_alert_prefs set prefs = prefs || '{"keywords":[]}' where user_id='00000000-0000-0000-0000-0000000000f1'$$,'career_alert_prefs_shape','no keywords is refused (no alerts on everything)');
select t.must_fail($$update public.career_alert_prefs set prefs = prefs || '{"max_instant_per_day":11}' where user_id='00000000-0000-0000-0000-0000000000f1'$$,'career_alert_prefs_shape','more than 10 instant alerts a day is refused');
select t.must_fail($$update public.career_alert_prefs set prefs = prefs || '{"report_hour":24}' where user_id='00000000-0000-0000-0000-0000000000f1'$$,'career_alert_prefs_shape','an hour past 23 is refused');
select t.must_fail($$update public.career_alert_prefs set prefs = prefs - 'on' where user_id='00000000-0000-0000-0000-0000000000f1'$$,'career_alert_prefs_shape','settings without on/off are refused');
select t.must_fail($$update public.career_alert_prefs set prefs = prefs - 'quiet_end' where user_id='00000000-0000-0000-0000-0000000000f1'$$,'career_alert_prefs_shape','settings missing any field are refused (a missing field must not pass as NULL)');
insert into public.career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-0000-0000-0000000000f1','alert:greenhouse:stripe:1','alert','New match: Data Analyst at Stripe.',now());
select t.must_fail($$insert into public.career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-0000-0000-0000000000f1','alert:greenhouse:stripe:1','alert','again',now())$$,'career_outbox_once','the same alert key is never queued twice for a person');
insert into public.career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-0000-0000-0000000000f2','alert:greenhouse:stripe:1','alert','New match for f2.',now());
select t.ok((select count(*)=2 from public.career_outbox),'the same key for another person is their own message');
select t.must_fail($$insert into public.career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-0000-0000-0000000000f1','nudge:1','alert','x',now())$$,'career_outbox_key_check','a key that is not alert: or report: is refused');
select t.must_fail($$insert into public.career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-0000-0000-0000000000f1','report:2026-10-19','report',repeat('x',4001),now())$$,'career_outbox_text_check','a message past 4,000 characters is refused');
insert into public.career_proactive_runs(run_at,users,alerts,held,reports,duplicates,postings,ms) values(now(),2,1,0,0,0,10,120);
reset role;
select t.as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select t.ok((select count(*)=1 from public.career_alert_prefs),'a person reads only their own alert settings');
select t.ok((select count(*)=1 and min(text) like 'New match: Data Analyst%' from public.career_outbox),'and only their own outbox');
select t.must_fail($$update public.career_alert_prefs set prefs = prefs || '{"on":false}'$$,'permission denied','a person cannot write settings directly (the chat tools do, as the service role)');
select t.must_fail($$insert into public.career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-0000-0000-0000000000f1','alert:x','alert','spoof',now())$$,'permission denied','a person cannot queue a message');
select t.must_fail($$select * from public.career_proactive_runs$$,'permission denied','a person cannot read the run log');
reset role;
-- Deleting an account takes its settings and outbox with it.
delete from auth.users where id='00000000-0000-0000-0000-0000000000f2';
select t.ok((select count(*)=0 from public.career_alert_prefs where user_id='00000000-0000-0000-0000-0000000000f2') and (select count(*)=0 from public.career_outbox where user_id='00000000-0000-0000-0000-0000000000f2'),'a deleted account leaves no alert settings or outbox');
rollback;
