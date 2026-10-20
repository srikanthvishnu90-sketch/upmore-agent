-- WO-039 (20261021080000_career_apply_cloud.sql): the cloud worker's gate, opt-in, claim limits, telemetry and throttle.
begin;
reset role;
-- O makes the hand submissions that open the gate; A and B are people who may turn the cloud on.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000a01','cloud-owner@example.test'),
 ('00000000-0000-4000-8000-000000000a02','cloud-a@example.test'),
 ('00000000-0000-4000-8000-000000000a03','cloud-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000a01'),('00000000-0000-4000-8000-000000000a02'),('00000000-0000-4000-8000-000000000a03');
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000000a01','career:account','{"epoch":1,"version":1,"paused":false}'),
 ('00000000-0000-4000-8000-000000000a02','career:account','{"epoch":1,"version":1,"paused":false}'),
 ('00000000-0000-4000-8000-000000000a03','career:account','{"epoch":1,"version":1,"paused":false}');

-- An approved application for the cloud, as the card's yes enqueues it (the engine's approval in the payload).
create function pg_temp.q(u text, job text, company text, url text, extra jsonb default '{}') returns uuid language plpgsql as $$
declare p jsonb; h text;
begin
 p := jsonb_build_object('version',1,'user_id',u,'job_id',job,'company',company,'url',url,'fields','[]'::jsonb,
  'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour','engine_approval',repeat('e',64),
  'resume_sha256',encode(sha256('TEST resume'::bytea),'hex'),'destination',url) || extra;
 h := encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
 return (career_apply_enqueue(p,h,h,50)).id;
end $$;
-- A hand submission by O, confirmed by the employer's email: recorded by O, the mail event WO-024 writes, the upgrade.
create function pg_temp.hand(job text, company text, url text, n int) returns uuid language plpgsql as $$
declare j career_apply_jobs; h text := encode(sha256(convert_to(job,'UTF8')),'hex');
begin
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',true);
 select * into j from career_apply_record_own(job,company,url,'submitted_unconfirmed');
 insert into career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
 values('00000000-0000-4000-8000-000000000a01','job:'||j.id,'received',company,'received: "thank you for applying" from example.test',h,now());
 perform career_apply_confirm_by_mail('00000000-0000-4000-8000-000000000a01',j.id,h);
 return j.id;
end $$;
create function pg_temp.why(id uuid) returns text language sql as $$ select career_apply_cloud_refusal(j,now()) from career_apply_jobs j where j.id=$1 $$;

-- ---------------------------------------------------------------------------------------------- the portal family
select t.ok(career_apply_portal('https://jobs.lever.co/acme/1')='lever' and career_apply_portal('https://job-boards.greenhouse.io/acme/jobs/1')='greenhouse'
 and career_apply_portal('https://jobs.ashbyhq.com/acme/1')='ashby' and career_apply_portal('https://jobs.smartrecruiters.com/acme/1')='smartrecruiters',
 'the portal family comes from the posting host, as the engine reads it');
select t.ok(career_apply_portal('http://jobs.lever.co/acme/1') is null and career_apply_portal('https://evil.example@jobs.lever.co/a') is null
 and career_apply_portal('https://jobs.lever.co.evil.example/a') is null and career_apply_portal('https://www.linkedin.com/jobs/1') is null,
 'plain http, a user part, a look-alike host and LinkedIn are no portal');

-- ---------------------------------------------------------------------------------------------- the gate
insert into career_cloud_settings(key,value) values('CAREER_CLOUD_APPLY','on'),('owner_user_id','00000000-0000-4000-8000-000000000a01');
select career_apply_cloud_optin_as('00000000-0000-4000-8000-000000000a02',true,'TEST terms');
create temp table jobs(name text primary key, id uuid);
insert into jobs values('lever1',pg_temp.q('00000000-0000-4000-8000-000000000a02','TEST-L1','Lever One','https://jobs.lever.co/one/1'));
select t.ok(not career_apply_cloud_open('lever') and pg_temp.why((select id from jobs where name='lever1'))='gate_closed','below 3 confirmed hand submissions the gate is closed');
select t.ok((select count(*)=0 from career_apply_cloud_claim_at(6,now())),'a closed gate claims nothing');
select pg_temp.hand('TEST-H1','Hand One','https://jobs.lever.co/hone/1',1);
select pg_temp.hand('TEST-H2','Hand Two','https://jobs.lever.co/htwo/2',2);
select t.ok(not career_apply_cloud_open('lever'),'2 confirmed hand submissions do not open it');
-- A cloud submission confirmed by email never counts.
do $$declare j career_apply_jobs; begin
 insert into career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash,state,attempts,claimed_at,source)
 values('00000000-0000-4000-8000-000000000a01','TEST-C1','Cloud One','https://jobs.lever.co/cone/1','{}',repeat('c',64),repeat('c',64),'submitted_unconfirmed',1,now(),'cloud')
 returning * into j;
 insert into career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
 values(j.user_id,'job:'||j.id,'received','Cloud One','received: thanks',repeat('9',64),now());
 perform career_apply_confirm_by_mail(j.user_id,j.id,repeat('9',64));
end $$;
select t.ok((select state='confirmed' and email_confirmed_at is not null from career_apply_jobs where job_id='TEST-C1'),'the cloud submission is confirmed by its email');
select t.ok(not career_apply_cloud_open('lever'),'a cloud submission confirmed by email does not count toward the gate');
select t.must_fail($$update career_apply_jobs set source='own_computer' where job_id='TEST-C1'$$,'source_fixed','a cloud submission cannot be relabelled as a hand one');
-- Confirmed on the page only, without the employer's email, does not count either.
do $$begin
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',true);
 perform career_apply_record_own('TEST-P1','Page One','https://jobs.lever.co/pone/1','confirmed');
end $$;
select t.ok(not career_apply_cloud_open('lever'),'a page confirmation without the employer''s email does not count');
-- Only a "received" mail for that application, for that person, confirms it.
do $$declare id uuid := (select id from career_apply_jobs where job_id='TEST-P1'); begin
 insert into career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
 values('00000000-0000-4000-8000-000000000a01','job:'||id,'rejection','Page One','rejection: not moving forward',repeat('8',64),now());
 perform t.must_fail(format('select career_apply_confirm_by_mail(%L,%L,%L)','00000000-0000-4000-8000-000000000a01',id,repeat('8',64)),'no_confirmation_mail','a rejection is not a confirmation');
 perform t.must_fail(format('select career_apply_confirm_by_mail(%L,%L,%L)','00000000-0000-4000-8000-000000000a02',id,repeat('8',64)),'no_confirmation_mail','another person''s mail confirms nothing');
end $$;
select pg_temp.hand('TEST-H3','Hand Three','https://jobs.lever.co/hthree/3',3);
select t.ok(career_apply_cloud_open('lever') and not career_apply_cloud_open('greenhouse') and not career_apply_cloud_open('ashby')
 and not career_apply_cloud_open('smartrecruiters'),'3 confirmed hand submissions open that family only, never SmartRecruiters');
select t.must_fail($$update career_apply_jobs set email_confirmed_at=now()-interval '1 day' where job_id='TEST-H3'$$,'mail_confirmation_fixed','an email confirmation is set once');
-- Deleting the mail event the confirmation names closes the gate again: the proof must still be there.
create temp table saved_mail as select * from career_mail_events where application_ref='job:'||(select id from career_apply_jobs where job_id='TEST-H3');
delete from career_mail_events where application_ref='job:'||(select id from career_apply_jobs where job_id='TEST-H3');
select t.ok(not career_apply_cloud_open('lever'),'the gate counts only confirmations whose email is still on record');
insert into career_mail_events select * from saved_mail;
select t.ok(career_apply_cloud_open('lever'),'the gate opens again with the email back');

-- ---------------------------------------------------------------------------------------------- the claim at 3
update career_cloud_settings set value='off' where key='CAREER_CLOUD_APPLY';
select t.ok((select count(*)=0 from career_apply_cloud_claim_at(6,now())),'the kill switch off claims nothing');
update career_cloud_settings set value='on' where key='CAREER_CLOUD_APPLY';
create temp table claimed as select * from career_apply_cloud_claim_at(6,now());
select t.ok((select count(*)=1 and bool_and(job_id='TEST-L1' and source='cloud' and state='driving') from claimed),'at 3 the gate-open job is claimed, tagged cloud');
select t.ok((select count(*)=0 from career_apply_cloud_claim_at(6,now())),'a claimed job is not claimed again');

-- ---------------------------------------------------------------------------------------------- opt-in
insert into jobs values('bjob',pg_temp.q('00000000-0000-4000-8000-000000000a03','TEST-B1','Bee Corp','https://jobs.lever.co/bee/1'));
select t.ok(pg_temp.why((select id from jobs where name='bjob'))='not_opted_in','a person who never turned it on is never claimed');
select t.must_fail($$select career_apply_cloud_optin_as('00000000-0000-4000-8000-000000000a03',true,'  ')$$,'invalid cloud opt-in','turning it on needs the terms the person saw');
select career_apply_cloud_optin_as('00000000-0000-4000-8000-000000000a03',true,'TEST terms B');
select t.ok(pg_temp.why((select id from jobs where name='bjob')) is null,'after their yes the job may be claimed');
select t.ok((career_apply_cloud_optin_get('00000000-0000-4000-8000-000000000a03')->>'daily')::int=25,'the opt-in carries their own daily limit (25 by default)');
select career_apply_cloud_optin_as('00000000-0000-4000-8000-000000000a03',false,null);
select t.ok(pg_temp.why((select id from jobs where name='bjob'))='not_opted_in','one message turns it off');
select career_apply_cloud_optin_as('00000000-0000-4000-8000-000000000a03',true,'TEST terms B');
update career_watch_kv set value='{"epoch":2,"version":2,"paused":false}' where user_id='00000000-0000-4000-8000-000000000a03';
insert into career_apply_cloud_resumes(user_id,sha256,filename,bytes,privacy_epoch) values('00000000-0000-4000-8000-000000000a03',repeat('1',64),'b.pdf','x',1);
select count(*) from career_apply_cloud_claim_at(6,now());
select t.ok((select not enabled from career_apply_cloud_optin where user_id='00000000-0000-4000-8000-000000000a03')
 and not exists(select from career_apply_cloud_resumes where user_id='00000000-0000-4000-8000-000000000a03'),'an erase ends the opt-in and removes the kept resume');
select t.ok(pg_temp.why((select id from jobs where name='bjob'))='stale','an approval from before the erase is never claimed');
update career_watch_kv set value='{"epoch":1,"version":1,"paused":false}' where user_id='00000000-0000-4000-8000-000000000a03';

-- ---------------------------------------------------------------------------------------------- the claim refuses each limit
insert into jobs values('gh',pg_temp.q('00000000-0000-4000-8000-000000000a02','TEST-G1','Green Co','https://job-boards.greenhouse.io/green/jobs/1'));
select t.ok(pg_temp.why((select id from jobs where name='gh'))='gate_closed','a family whose gate is closed is refused');
insert into jobs values('sr',pg_temp.q('00000000-0000-4000-8000-000000000a02','TEST-S1','Smart Co','https://jobs.smartrecruiters.com/smart/1'));
select t.ok(pg_temp.why((select id from jobs where name='sr'))='portal_not_cloud','SmartRecruiters is never the cloud''s');
insert into jobs values('noeng',pg_temp.q('00000000-0000-4000-8000-000000000a02','TEST-N1','No Engine Co','https://jobs.lever.co/noeng/1','{"engine_approval":null}'));
select t.ok(pg_temp.why((select id from jobs where name='noeng'))='not_approved','a payload without the engine''s approval hash is refused');
insert into jobs values('ps',pg_temp.q('00000000-0000-4000-8000-000000000a02','TEST-PS1','Press Co','https://jobs.lever.co/press/1','{"destination":"the person''s own Submit, one request to https://jobs.lever.co"}'));
select t.ok(pg_temp.why((select id from jobs where name='ps'))='person_submits','a form only the person can submit is never the cloud''s');
insert into jobs values('l2',pg_temp.q('00000000-0000-4000-8000-000000000a02','TEST-L2','Lever Two','https://jobs.lever.co/two/2'));
update career_watch_kv set value='{"epoch":1,"version":1,"paused":true}' where user_id='00000000-0000-4000-8000-000000000a02';
select t.ok(pg_temp.why((select id from jobs where name='l2'))='stale','a paused account is refused');
update career_watch_kv set value='{"epoch":1,"version":1,"paused":false}' where user_id='00000000-0000-4000-8000-000000000a02';
-- Their daily limit: the one they agreed to and their current one, whichever is smaller (one already claimed today).
update career_watch_kv set value='{"epoch":1,"version":1,"paused":false,"daily_limit":"1"}' where user_id='00000000-0000-4000-8000-000000000a02';
select t.ok(pg_temp.why((select id from jobs where name='l2'))='daily_limit','their daily limit is refused at claim time');
update career_watch_kv set value='{"epoch":1,"version":1,"paused":false}' where user_id='00000000-0000-4000-8000-000000000a02';
select t.ok(pg_temp.why((select id from jobs where name='l2')) is null,'under the limit it may be claimed');
-- One per company per 30 days, whoever sent the other one.
insert into career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash,state,attempts,claimed_at,source)
values('00000000-0000-4000-8000-000000000a02','TEST-L2-EXT','Lever Two, Inc.','https://jobs.lever.co/two/9','{}',repeat('d',64),repeat('d',64),'submitted_unconfirmed',1,now()-interval '3 days','extension');
select t.ok(pg_temp.why((select id from jobs where name='l2'))='company_cooldown','one per company per 30 days, even when the other went by the extension');
delete from career_apply_jobs where job_id='TEST-L2-EXT';
insert into career_apply_cloud_pauses(scope,user_id,reason,until) values('person','00000000-0000-4000-8000-000000000a02','TEST pause',now()+interval '1 hour');
select t.ok(pg_temp.why((select id from jobs where name='l2'))='person_paused','a paused person is refused');
delete from career_apply_cloud_pauses;
insert into career_apply_cloud_pauses(scope,portal,reason,until) values('portal','lever','TEST pause',now()+interval '1 hour');
select t.ok(pg_temp.why((select id from jobs where name='l2'))='portal_paused','a paused portal is refused');
delete from career_apply_cloud_pauses;

-- ---------------------------------------------------------------------------------------------- the resume and the finish
insert into career_apply_cloud_resumes(user_id,sha256,filename,bytes,privacy_epoch)
values('00000000-0000-4000-8000-000000000a02',encode(sha256('TEST resume'::bytea),'hex'),'resume.pdf','TEST resume',1);
select t.ok((select career_apply_cloud_resume(id,lease_token)->>'filename'='resume.pdf' from claimed),'the worker reads the approved resume for a job it holds');
select t.must_fail($$select career_apply_cloud_resume(id,gen_random_uuid()) from claimed$$,'invalid apply claim','without the lease it reads nothing');
select t.must_fail($$select career_apply_cloud_finish(id,lease_token,'needs_user','{}','submitted') from claimed$$,'invalid cloud outcome','a hand-back is never reported as submitted');
select t.must_fail($$select career_apply_cloud_finish(id,lease_token,'submitted_unconfirmed','{}','bot_check') from claimed$$,'invalid cloud outcome','a sent application is never a bot check');
select t.must_fail($$select career_apply_cloud_finish(id,lease_token,'submitted_unconfirmed','"x"'::jsonb,'submitted') from claimed$$,'invalid apply evidence','evidence is an object');

-- A bot check at Submit: back to the person, never sent, counted; one failure in the window pauses the portal for 6 hours.
select t.ok((select state='needs_user' from career_apply_cloud_finish((select id from claimed),(select lease_token from claimed),'needs_user',
 '{"reason":"bot_check"}','bot_check','CAPTCHA_AT_SUBMIT')),'a bot check goes back to the person');
select t.ok((select count(*)=1 and bool_and(outcome='bot_check') from career_apply_cloud_events where job_id=(select id from claimed)),'the bot check is in the telemetry');
select t.ok((select count(*)=1 and bool_and(until between now()+interval '5 hours 59 minutes' and clock_timestamp()+interval '6 hours') from career_apply_cloud_pauses
 where scope='portal' and portal='lever'),'2% user-facing failures pause the portal for the cloud for 6 hours');
select t.ok((select count(*)=1 from career_outbox where user_id='00000000-0000-4000-8000-000000000a02' and kind='cloud')
 and (select count(*)=1 from career_outbox where user_id='00000000-0000-4000-8000-000000000a01' and kind='cloud'),'the person and the owner are told, once each');
select career_apply_cloud_throttle('lever','00000000-0000-4000-8000-000000000a02',clock_timestamp());
select t.ok((select count(*)=2 from career_outbox where kind='cloud') and (select count(*)=1 from career_apply_cloud_pauses where scope='portal'),'told once: a second look while paused adds nothing');
select t.ok((select bool_and(length(text)<=1500 and text !~ '[*_`#]') from career_outbox where kind='cloud'),'the pause texts are plain and short');
select t.ok(pg_temp.why((select id from jobs where name='l2'))='portal_paused','while paused the cloud claims nothing there');
-- Their own computer is not paused.
select t.as_user('00000000-0000-4000-8000-000000000a02');set role authenticated;
select t.ok((select count(*)>=1 and bool_and(source='own_computer') from career_apply_claim_own(6)),'their own computer still sends their approved applications');
reset role;

-- ---------------------------------------------------------------------------------------------- the thresholds
delete from career_apply_cloud_pauses; delete from career_outbox where kind='cloud'; delete from career_apply_cloud_events;
-- 50 clean attempts: no pause. One failure in the last 50 (2%): pause.
insert into career_apply_cloud_events(user_id,portal,outcome,at) select '00000000-0000-4000-8000-000000000a02','ashby','submitted',now()-interval '1 minute' from generate_series(1,60);
select career_apply_cloud_throttle('ashby',null,clock_timestamp());
select t.ok(not exists(select from career_apply_cloud_pauses),'0 failures in the last 50 attempts: no pause');
insert into career_apply_cloud_events(user_id,portal,outcome,error_kind,at) values('00000000-0000-4000-8000-000000000a02','ashby','error','FORM_DID_NOT_SETTLE',now());
select career_apply_cloud_throttle('ashby',null,clock_timestamp());
select t.ok((select count(*)=1 and bool_and(reason like 'failure_rate: 1 of the last 50%') from career_apply_cloud_pauses where portal='ashby'),'1 failure in the last 50 attempts (2%) pauses the portal');
select t.ok(not exists(select from career_outbox where kind='cloud' and user_id='00000000-0000-4000-8000-000000000a02'),'a pause with no one''s job behind it tells only the owner');
-- Not_sent (stopped before sending, by design) is not a user-facing failure.
delete from career_apply_cloud_pauses; delete from career_apply_cloud_events;
insert into career_apply_cloud_events(user_id,portal,outcome,error_kind) select '00000000-0000-4000-8000-000000000a02','greenhouse','not_sent','APPROVED_APPLICATION_CHANGED' from generate_series(1,5);
select career_apply_cloud_throttle('greenhouse',null,clock_timestamp());
select t.ok(not exists(select from career_apply_cloud_pauses),'stopped before sending is not a failure');
-- A bot-check spike: 2 in the last 20 names itself.
insert into career_apply_cloud_events(user_id,portal,outcome) values('00000000-0000-4000-8000-000000000a03','greenhouse','bot_check'),('00000000-0000-4000-8000-000000000a03','greenhouse','bot_check');
select career_apply_cloud_throttle('greenhouse',null,clock_timestamp());
select t.ok((select bool_and(reason like 'bot_check_spike: 2%') from career_apply_cloud_pauses where portal='greenhouse'),'2 bot checks in the last 20 attempts pause the portal, named');
-- Per person: 2 bot checks in a day pause their cloud runs until tomorrow; one yesterday and one today do not.
delete from career_apply_cloud_pauses; delete from career_apply_cloud_events;
insert into career_apply_cloud_events(user_id,portal,outcome,at) values('00000000-0000-4000-8000-000000000a03','lever','bot_check',now()-interval '1 day'),
 ('00000000-0000-4000-8000-000000000a03','ashby','bot_check',now());
select career_apply_cloud_throttle('lever','00000000-0000-4000-8000-000000000a03',clock_timestamp());
select t.ok(not exists(select from career_apply_cloud_pauses where scope='person'),'one bot check today is not a person pause');
insert into career_apply_cloud_events(user_id,portal,outcome,at) values('00000000-0000-4000-8000-000000000a03','greenhouse','bot_check',now());
select career_apply_cloud_throttle('greenhouse','00000000-0000-4000-8000-000000000a03',clock_timestamp());
select t.ok((select count(*)=1 and bool_and(until=(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC') from career_apply_cloud_pauses
 where scope='person' and user_id='00000000-0000-4000-8000-000000000a03'),'2 bot checks in a day pause that person until tomorrow');
select t.ok((select count(*)=1 from career_outbox where user_id='00000000-0000-4000-8000-000000000a03'
 and key='cloud:pause:'||(select id from career_apply_cloud_pauses where scope='person')),'that person is told once');

-- ---------------------------------------------------------------------------------------------- sweep and report
delete from career_apply_cloud_pauses; delete from career_apply_cloud_events;
do $$declare j career_apply_jobs; begin
 insert into career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash,state,attempts,claimed_at,lease_token,source)
 values('00000000-0000-4000-8000-000000000a02','TEST-DEAD','Dead Drive Co','https://jobs.lever.co/dead/1','{}',repeat('f',64),repeat('f',64),'driving',1,now()-interval '20 minutes',gen_random_uuid(),'cloud');
end $$;
select count(*) from career_apply_cloud_claim_at(0,now());
select t.ok((select state='unknown_outcome' from career_apply_jobs where job_id='TEST-DEAD')
 and exists(select from career_apply_cloud_events where outcome='error' and error_kind='unknown_outcome'),'a cloud drive that stopped is unknown, an error in the telemetry, never re-driven');
insert into career_apply_cloud_events(user_id,portal,outcome,at) select '00000000-0000-4000-8000-000000000a02','ashby','submitted',clock_timestamp() from generate_series(1,3);
select t.ok((select (r->'portals'->2->>'portal')='ashby' and (r->'portals'->2->>'window_attempts')::int=3 and (r->'portals'->2->>'window_failures')::int=0
 and (r->'portals'->2->>'window_failure_rate')::numeric=0 and (r->'portals'->2->'counts'->>'submitted')::int=3
 and (r->'portals'->1->'counts'->>'error')::int=1 and (r->'portals'->1->>'paused_until') is not null and (r->'portals'->1->>'gate_open')::boolean
 and jsonb_array_length(r->'people')=1 and (r->>'kill_switch_on')::boolean
 from (select career_apply_cloud_report(7) r) x),'the report gives rates with their counts, per portal and per person');

-- ---------------------------------------------------------------------------------------------- who may call what
set role service_role;
select t.ok((select count(*)>=0 from career_apply_cloud_claim(1)),'the service role claims through the cloud claim');
select t.must_fail($$select * from career_apply_cloud_claim_at(1,now())$$,'permission denied','the clock is the database''s: the timed claim is not granted');
select t.must_fail($$select career_apply_cloud_throttle('lever',null,now())$$,'permission denied','the throttle runs only inside the finish');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000a02');set role authenticated;
select t.must_fail($$select * from career_apply_cloud_claim(1)$$,'permission denied','a person cannot claim for the cloud');
select t.must_fail($$select career_apply_cloud_report(7)$$,'permission denied','a person cannot read the report');
select t.must_fail($$select career_apply_cloud_optin_as('00000000-0000-4000-8000-000000000a02',true,'x')$$,'permission denied','a person turns it on only through their chat');
select t.must_fail($$select * from career_apply_cloud_events$$,'permission denied','the telemetry is not the app''s to read');
select t.must_fail($$select career_apply_record_own('TEST-X','X','https://example.com/x','confirmed')$$,'invalid hand submission','a hand submission must be on a portal family');
select t.must_fail($$select career_apply_record_own('TEST-H9','Hand Nine','https://jobs.lever.co/hnine/1','needs_user')$$,'invalid hand submission','a hand submission records only an application that went');
select career_apply_record_own('TEST-H9','Hand Nine','https://jobs.lever.co/hnine/1','submitted_unconfirmed');
select t.must_fail($$select career_apply_record_own('TEST-H9','Hand Nine','https://jobs.lever.co/hnine/1','submitted_unconfirmed')$$,'duplicate_job','once per posting');
select t.ok((select source='own_computer' and state='submitted_unconfirmed' from career_apply_jobs where job_id='TEST-H9'),'a hand submission is the person''s own computer''s');
reset role;
set role anon;
select t.must_fail($$select career_apply_cloud_open('lever')$$,'permission denied','anon cannot read the gate');
reset role;
rollback;
