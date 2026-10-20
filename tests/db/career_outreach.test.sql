-- WO-033: outreach drafts, the do-not-contact list, the person's settings and the claim (20261021010000_career_outreach.sql).
-- The person reads only their own drafts; only the service role writes; an approval is the exact message's hash; the
-- claim refuses an unapproved, changed or do-not-contact draft, holds 10 a day in the first week, 20 by default after
-- it, the person's own up to 30 and never 31, and 90 seconds between sends; the timeline takes the three new kinds; an
-- erase deletes drafts and settings and keeps the do-not-contact hashes; deleting the account removes everything.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000331','outreach-a@example.test'),('00000000-0000-4000-8000-000000000332','outreach-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000331'),('00000000-0000-4000-8000-000000000332');
set role service_role;
-- 40 approved drafts for A, one each for the cap checks; their hash is the same value as their approval.
insert into career_outreach_drafts(user_id,batch_id,n,recipient,recipient_email,subject,body,footer,hash,status,approved_hash,approved_at)
 select '00000000-0000-4000-8000-000000000331', ('00000000-0000-4000-8000-' || lpad(((g-1)/10)::text,12,'0'))::uuid, ((g-1)%10)+1,
  jsonb_build_object('name','Synthetic '||g,'firm','Goldman Sachs'), 'person'||g||'@example.test', 'Subject '||g, 'Body '||g, 'Synthetic Name',
  repeat(to_hex(g%16),64), 'approved', repeat(to_hex(g%16),64), now()
 from generate_series(1,40) g;
insert into career_outreach_drafts(user_id,batch_id,n,recipient,recipient_email,subject,body,footer,hash,status)
 values('00000000-0000-4000-8000-000000000332','00000000-0000-4000-8000-0000000000b2',1,'{"name":"Other"}','other@example.test','S','B','F',repeat('a',64),'shown');
select t.must_fail($$insert into career_outreach_drafts(user_id,batch_id,n,recipient,recipient_email,subject,body,footer,hash) values('00000000-0000-4000-8000-000000000331',gen_random_uuid(),1,'{}','a@example.test, b@example.test','S','B','F',repeat('a',64))$$,'career_outreach_drafts_recipient_email_check','one plain address, never a list');
select t.must_fail($$insert into career_outreach_drafts(user_id,batch_id,n,recipient,recipient_email,subject,body,footer,hash) values('00000000-0000-4000-8000-000000000331',gen_random_uuid(),1,'{}','Jane <jane@example.test>','S','B','F',repeat('a',64))$$,'career_outreach_drafts_recipient_email_check','no display names or brackets');
select t.must_fail($$insert into career_outreach_drafts(user_id,batch_id,n,recipient,recipient_email,subject,body,footer,hash) values('00000000-0000-4000-8000-000000000331',gen_random_uuid(),1,'{}','a@example.test','S'||chr(10)||'Bcc: x@example.test','B','F',repeat('a',64))$$,'career_outreach_drafts_subject_check','a subject with a line break (a smuggled header) is refused');
select t.must_fail($$insert into career_outreach_drafts(user_id,batch_id,n,recipient,recipient_email,subject,body,footer,hash) values('00000000-0000-4000-8000-000000000331',gen_random_uuid(),11,'{}','a@example.test','S','B','F',repeat('a',64))$$,'career_outreach_drafts_n_check','a batch holds at most 10');
select t.must_fail($$insert into career_outreach_drafts(user_id,batch_id,n,recipient,recipient_email,subject,body,footer,hash,status,approved_hash) values('00000000-0000-4000-8000-000000000331',gen_random_uuid(),1,'{}','a@example.test','S','B','F',repeat('a',64),'approved',repeat('b',64))$$,'career_outreach_approved_is_exact','an approval is the hash of the exact message');
select t.must_fail($$insert into career_outreach_prefs(user_id,daily_cap) values('00000000-0000-4000-8000-000000000331',31)$$,'career_outreach_prefs_daily_cap_check','31 a day is never allowed');
insert into career_events(user_id,kind,subject) values('00000000-0000-4000-8000-000000000331','outreach_approved','A'),('00000000-0000-4000-8000-000000000331','outreach_replied','B'),('00000000-0000-4000-8000-000000000331','outreach_bounced','C');
select t.ok((select count(*)=3 from career_events where kind in ('outreach_approved','outreach_replied','outreach_bounced')),'the timeline takes the three new outreach kinds');
select t.must_fail($$insert into career_events(user_id,kind) values('00000000-0000-4000-8000-000000000331','outreach_blasted')$$,'career_events_kind_check','an unknown kind is still refused');
reset role;

-- The person's own reads; no writes.
select t.as_user('00000000-0000-4000-8000-000000000331');set role authenticated;
select t.ok((select count(*)=40 from career_outreach_drafts),'the owner reads their own drafts, never another person''s');
select t.must_fail($$update career_outreach_drafts set status='approved'$$,'permission denied','the person cannot approve by writing the table');
select t.must_fail($$select * from career_outreach_dnc$$,'permission denied','the do-not-contact list is the service''s');
select t.must_fail($$select * from career_outreach_prefs$$,'permission denied','settings are the service''s');
select t.must_fail($$select career_outreach_claim('00000000-0000-4000-8000-000000000331',gen_random_uuid(),repeat('a',64),now(),now())$$,'permission denied','only the service claims a send');
select t.ok((select count(*)=1 from career_recall_own(array['outreach_bounced'],null,null,null,10)),'recall knows the new kinds');
reset role;set role anon;
select t.must_fail($$select * from career_outreach_drafts$$,'permission denied','anon reads nothing');
reset role;

-- The claim. Day 0 is 2026-10-01 (local midnight 04:00Z); sends are 2 minutes apart.
set role service_role;
create temp table claims(i int, r text);
create or replace function pg_temp.claim(g int, at timestamptz, day_start timestamptz) returns text language sql as $$
 select career_outreach_claim('00000000-0000-4000-8000-000000000331',(select id from career_outreach_drafts where recipient_email='person'||g||'@example.test'),repeat(to_hex(g%16),64),at,day_start) $$;
select t.ok(pg_temp.claim(1,'2026-10-01T13:00:00Z','2026-10-01T04:00:00Z')='ok','an approved draft with its exact hash is claimed');
select t.ok(pg_temp.claim(2,'2026-10-01T13:00:30Z','2026-10-01T04:00:00Z')='spacing','a second send 30 seconds later waits: 90 seconds apart');
select t.ok(pg_temp.claim(2,'2026-10-01T13:01:31Z','2026-10-01T04:00:00Z')='ok','91 seconds later it goes');
insert into claims select g, pg_temp.claim(g,'2026-10-01T13:00:00Z'::timestamptz + (g*interval '2 minutes'),'2026-10-01T04:00:00Z') from generate_series(3,11) g;
select t.ok((select array_agg(r order by i)=array['ok','ok','ok','ok','ok','ok','ok','ok','daily_cap'] from claims),'first week, no send history: the 11th send of the day is refused (10 a day)');
truncate claims;
-- Day 8: past the first week, the default is 20.
insert into claims select g, pg_temp.claim(g,'2026-10-09T13:00:00Z'::timestamptz + (g*interval '2 minutes'),'2026-10-09T04:00:00Z') from generate_series(11,31) g;
select t.ok((select count(*) filter (where r='ok')=20 and (array_agg(r order by i))[21]='daily_cap' from claims),'after the first week: 20 a day by default, the 21st refused');
truncate claims;
-- Day 9: the person's own 30; a day's 31st is refused.
insert into career_outreach_prefs(user_id,daily_cap) values('00000000-0000-4000-8000-000000000331',30);
update career_outreach_drafts set status='approved', sent_at=null where user_id='00000000-0000-4000-8000-000000000331' and sent_at >= '2026-10-09T04:00:00Z';
update career_outreach_drafts set status='approved', sent_at=null where user_id='00000000-0000-4000-8000-000000000331' and recipient_email in ('person32@example.test','person33@example.test');
insert into claims select g, pg_temp.claim(g,'2026-10-10T13:00:00Z'::timestamptz + (g*interval '2 minutes'),'2026-10-10T04:00:00Z') from generate_series(11,40) g;
select t.ok((select count(*) filter (where r='ok')=30 from claims),'the person''s own limit: 30 in a day');
update career_outreach_drafts set status='approved', sent_at=null where recipient_email='person1@example.test';
select t.ok(pg_temp.claim(1,'2026-10-10T15:00:00Z','2026-10-10T04:00:00Z')='daily_cap','and the 31st is refused');
reset role;
update career_outreach_prefs set daily_cap=null;
select t.must_fail($$update career_outreach_prefs set daily_cap=50$$,'career_outreach_prefs_daily_cap_check','a limit over 30 cannot be stored');
set role service_role;
-- Changed, not approved, do-not-contact.
update career_outreach_drafts set status='approved', sent_at=null where recipient_email in ('person39@example.test','person38@example.test','person37@example.test');
select t.ok(career_outreach_claim('00000000-0000-4000-8000-000000000331',(select id from career_outreach_drafts where recipient_email='person39@example.test'),repeat('f',64),'2026-10-11T13:00:00Z','2026-10-11T04:00:00Z') in ('changed'),'a message that is not the approved one is refused');
update career_outreach_drafts set status='shown', approved_hash=null where recipient_email='person38@example.test';
select t.ok(pg_temp.claim(38,'2026-10-11T13:00:00Z','2026-10-11T04:00:00Z')='not_approved','an unapproved draft is refused');
insert into career_outreach_dnc(user_id,email_hash) values('00000000-0000-4000-8000-000000000331',encode(sha256(convert_to('person37@example.test','UTF8')),'hex'));
select t.ok(pg_temp.claim(37,'2026-10-11T13:00:00Z','2026-10-11T04:00:00Z')='do_not_contact','someone who asked to stop is never sent to');
select t.must_fail($$select pg_temp.claim(36,'2026-10-11T13:00:00Z','2026-10-09T04:00:00Z')$$,'invalid outreach claim','a day start more than 26 hours back is refused');
select t.ok(career_outreach_claim('00000000-0000-4000-8000-000000000332',(select id from career_outreach_drafts where recipient_email='person36@example.test'),repeat(to_hex(36%16),64),'2026-10-11T13:00:00Z','2026-10-11T04:00:00Z')='not_approved','another person cannot claim A''s draft');
reset role;

-- Hunter's cached answers: keyed by month and a hash, never an address; the service's only.
set role service_role;
insert into career_email_checks(key,status,score) values('2026-10:'||repeat('c',64),'accept_all',70);
select t.must_fail($$insert into career_email_checks(key,status) values('avery@example.test','valid')$$,'career_email_checks_key_check','an address is never a key');
select t.must_fail($$insert into career_email_checks(key,status) values('2026-10:'||repeat('d',64),'deliverable')$$,'career_email_checks_status_check','only Hunter''s own statuses');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000332');set role authenticated;
select t.must_fail($$select * from career_email_checks$$,'permission denied','the cache is the service''s');
reset role;

-- An erase (a new account epoch) deletes drafts and settings, keeps the do-not-contact hashes; nobody else's changes.
set role service_role;
insert into career_outreach_prefs(user_id,signature) values('00000000-0000-4000-8000-000000000331','Synthetic Name') on conflict (user_id) do update set signature=excluded.signature;
insert into career_watch_kv(user_id,key,value) values('00000000-0000-4000-8000-000000000331','career:account','{"version":3,"epoch":0}');
select t.ok((select count(*)=40 from career_outreach_drafts where user_id='00000000-0000-4000-8000-000000000331'),'a write that is not an erase keeps the drafts');
update career_watch_kv set value='{"version":4,"epoch":1,"paused":true}' where user_id='00000000-0000-4000-8000-000000000331' and key='career:account';
select t.ok((select count(*)=0 from career_outreach_drafts where user_id='00000000-0000-4000-8000-000000000331'),'an erase deletes the person''s drafts');
select t.ok((select count(*)=0 from career_outreach_prefs where user_id='00000000-0000-4000-8000-000000000331'),'and their settings');
select t.ok((select count(*)=1 from career_outreach_dnc where user_id='00000000-0000-4000-8000-000000000331'),'the do-not-contact hash stays: an erase never re-opens someone who said stop');
select t.ok((select count(*)=1 from career_outreach_drafts where user_id='00000000-0000-4000-8000-000000000332'),'nobody else''s drafts change');
reset role;
delete from auth.users where id='00000000-0000-4000-8000-000000000331';
select t.ok((select count(*)=0 from career_outreach_dnc where user_id='00000000-0000-4000-8000-000000000331'),'deleting the account removes the list too');

-- One recipient, all Trainee users (architect review, 2026-10-20): at most 3 Trainee-drafted emails reach an address in 30
-- days from everyone together, and a "stop" to any user stops every user's drafts to that address.
reset role;
insert into auth.users(id,email) select ('00000000-0000-4000-8000-00000000033'||k)::uuid, 'outreach-'||k||'@example.test' from generate_series(3,6) k;
insert into profiles(id) select ('00000000-0000-4000-8000-00000000033'||k)::uuid from generate_series(3,6) k;
set role service_role;
insert into career_outreach_drafts(user_id,batch_id,n,recipient,recipient_email,subject,body,footer,hash,status,sent_at)
 select u::uuid, gen_random_uuid(), 1, '{"name":"Shared"}', 'shared.banker@example.test', 'S', 'B', 'F', repeat('c',64), 'sent', '2026-10-20T12:00:00Z'::timestamptz - (k*interval '1 day')
 from (values ('00000000-0000-4000-8000-000000000335',1),('00000000-0000-4000-8000-000000000336',2),('00000000-0000-4000-8000-000000000333',3)) v(u,k);
insert into career_outreach_drafts(user_id,batch_id,n,recipient,recipient_email,subject,body,footer,hash,status,approved_hash,approved_at)
 values('00000000-0000-4000-8000-000000000334',gen_random_uuid(),1,'{"name":"Shared"}','shared.banker@example.test','S','B','F',repeat('d',64),'approved',repeat('d',64),now()),
       ('00000000-0000-4000-8000-000000000334',gen_random_uuid(),2,'{"name":"Stopped"}','stopped@example.test','S','B','F',repeat('e',64),'approved',repeat('e',64),now());
select t.ok(career_outreach_claim('00000000-0000-4000-8000-000000000334',(select id from career_outreach_drafts where recipient_email='shared.banker@example.test' and user_id='00000000-0000-4000-8000-000000000334'),repeat('d',64),'2026-10-20T13:00:00Z','2026-10-20T04:00:00Z')='recipient_cap','a fourth Trainee email to the same address in 30 days is refused, whoever sends it');
select t.ok(career_outreach_claim('00000000-0000-4000-8000-000000000334',(select id from career_outreach_drafts where recipient_email='shared.banker@example.test' and user_id='00000000-0000-4000-8000-000000000334'),repeat('d',64),'2026-11-19T13:00:00Z','2026-11-19T04:00:00Z')='ok','once the oldest falls out of the 30 days, one more may go');
insert into career_outreach_dnc(user_id,email_hash) values('00000000-0000-4000-8000-000000000333',encode(sha256(convert_to('stopped@example.test','UTF8')),'hex'));
select t.ok(career_outreach_claim('00000000-0000-4000-8000-000000000334',(select id from career_outreach_drafts where recipient_email='stopped@example.test'),repeat('e',64),'2026-11-19T15:00:00Z','2026-11-19T04:00:00Z')='do_not_contact','a stop given to one Trainee user stops another user''s draft to that address');
reset role;
rollback;
