-- WO-091c: the person's control state at the outreach send, and the one predicate the scheduled layer reads
-- (20261022120000_career_control_state.sql). career_user_quiet is true while the account is paused ("stop everything",
-- STOP to the career host, and every erase, which pauses) or any of the person's texting contacts is opted out (STOP on
-- a channel). career_outreach_claim refuses an approval older than 7 days ('expired') and a quiet account ('paused'),
-- and otherwise claims exactly as before. Only the service role reads either. The run log keeps every rail's error.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000911','ctl-live@example.test'),('00000000-0000-4000-8000-000000000912','ctl-paused@example.test'),
 ('00000000-0000-4000-8000-000000000913','ctl-stopped@example.test'),('00000000-0000-4000-8000-000000000914','ctl-resumed@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000911'),('00000000-0000-4000-8000-000000000912'),
 ('00000000-0000-4000-8000-000000000913'),('00000000-0000-4000-8000-000000000914');
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000000912','career:account','{"version":3,"epoch":1,"paused":true}'),
 ('00000000-0000-4000-8000-000000000914','career:account','{"version":4,"epoch":1,"paused":false}');
insert into channel_contacts(contact,user_id,opted_out) values ('tg:913001','00000000-0000-4000-8000-000000000913',true),
 ('tg:911001','00000000-0000-4000-8000-000000000911',false);
set role service_role;
-- One approved draft each; the 9th for the live person was approved 8 days before the claim.
insert into career_outreach_drafts(user_id,batch_id,n,recipient,recipient_email,subject,body,footer,hash,status,approved_hash,approved_at,created_at)
 select u::uuid, gen_random_uuid(), 1, '{"name":"Synthetic"}', e, 'Subject', 'Body', 'Sam', repeat(h,64), 'approved', repeat(h,64), a::timestamptz, a::timestamptz
 from (values ('00000000-0000-4000-8000-000000000911','fresh@example.test','1','2026-10-19T13:00:00Z'),
              ('00000000-0000-4000-8000-000000000911','stale@example.test','2','2026-10-12T12:59:00Z'),
              ('00000000-0000-4000-8000-000000000912','paused@example.test','3','2026-10-19T13:00:00Z'),
              ('00000000-0000-4000-8000-000000000913','stopped@example.test','4','2026-10-19T13:00:00Z'),
              ('00000000-0000-4000-8000-000000000914','resumed@example.test','5','2026-10-19T13:00:00Z')) v(u,e,h,a);
create or replace function pg_temp.claim(u text, e text, h text) returns text language sql as $$
 select career_outreach_claim(u::uuid,(select id from career_outreach_drafts where recipient_email=e),repeat(h,64),'2026-10-20T13:00:00Z','2026-10-20T04:00:00Z') $$;

select t.ok(career_user_quiet('00000000-0000-4000-8000-000000000912'),'a paused account is quiet');
select t.ok(career_user_quiet('00000000-0000-4000-8000-000000000913'),'a person who texted STOP on any channel is quiet');
select t.ok(not career_user_quiet('00000000-0000-4000-8000-000000000911'),'a person with no pause and no STOP is not');
select t.ok(not career_user_quiet('00000000-0000-4000-8000-000000000914'),'a resumed account is not');
select t.ok((select array_agg(user_id order by user_id) from career_quiet_users(array['00000000-0000-4000-8000-000000000911','00000000-0000-4000-8000-000000000912','00000000-0000-4000-8000-000000000913','00000000-0000-4000-8000-000000000914']::uuid[]))
 = array['00000000-0000-4000-8000-000000000912','00000000-0000-4000-8000-000000000913']::uuid[],'career_quiet_users names exactly the quiet ones');

select t.ok(pg_temp.claim('00000000-0000-4000-8000-000000000911','stale@example.test','2')='expired','an approval more than 7 days old is refused');
select t.ok((select status from career_outreach_drafts where recipient_email='stale@example.test')='approved','the refusal itself changes nothing (the run drops it)');
select t.ok(pg_temp.claim('00000000-0000-4000-8000-000000000912','paused@example.test','3')='paused','a paused account sends nothing');
select t.ok(pg_temp.claim('00000000-0000-4000-8000-000000000913','stopped@example.test','4')='paused','an opted-out account sends nothing');
select t.ok((select count(*)=0 from career_outreach_drafts where status='sending'),'nothing was claimed by a refusal');
select t.ok(pg_temp.claim('00000000-0000-4000-8000-000000000911','fresh@example.test','1')='ok','a day-old approval on a live account is claimed as before');
select t.ok(pg_temp.claim('00000000-0000-4000-8000-000000000914','resumed@example.test','5')='ok','a resumed account sends again');
select t.ok(pg_temp.claim('00000000-0000-4000-8000-000000000911','fresh@example.test','f')='not_approved','the earlier refusals still hold (a claimed row is no longer approved)');

-- An erase pauses the account (career_host_commit writes paused with the new epoch): the same predicate covers it.
reset role;
update career_watch_kv set value='{"version":5,"epoch":2,"paused":true}' where user_id='00000000-0000-4000-8000-000000000914' and key='career:account';
select t.ok(career_user_quiet('00000000-0000-4000-8000-000000000914'),'after an erase the account is quiet');

select t.ok(exists (select 1 from information_schema.columns where table_name='career_proactive_runs' and column_name='errors'),'the run log has a column for each rail''s error');

select t.as_user('00000000-0000-4000-8000-000000000911');set role authenticated;
select t.must_fail($$select career_user_quiet('00000000-0000-4000-8000-000000000912')$$,'permission denied','a person cannot read another person''s control state');
select t.must_fail($$select * from career_quiet_users(array['00000000-0000-4000-8000-000000000912']::uuid[])$$,'permission denied','nor list who is quiet');
reset role;
rollback;
