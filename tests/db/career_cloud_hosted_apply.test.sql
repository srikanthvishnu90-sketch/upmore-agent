-- FEATURE 17 (20261026230017_career_cloud_hosted_apply.sql): the cloud route for text-card approvals, the hosted
-- preparation requests and the bounded card push for postings the person asked for. Every refusal has a case here,
-- including the adversarial ones: a job nobody approved on a card, another person's, a double claim, a forged lease or
-- hash, an expired approval, an erase, a pause, a spent waiver, a site rate, a missing resume, a card-cloud job.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-00000000f171','hosted-a@example.test'),
 ('00000000-0000-4000-8000-00000000f172','hosted-b@example.test'),
 ('00000000-0000-4000-8000-00000000f173','hosted-c@example.test');
insert into profiles(id) select id from auth.users where id::text like '00000000-0000-4000-8000-00000000f17%';
insert into career_watch_kv(user_id,key,value) select id,'career:account','{"epoch":1,"version":1,"paused":false}'::jsonb from profiles
 where id::text like '00000000-0000-4000-8000-00000000f17%';
delete from career_cloud_settings where key in ('CAREER_CLOUD_APPLY','CAREER_CLOUD_TEXT_CARDS','gate_user_ids','owner_user_id');
delete from career_apply_cloud_pauses;
insert into career_cloud_settings(key,value) values('CAREER_CLOUD_APPLY','on');
-- A and C opted in, B not. A holds an Ashby waiver of 2 sends; C holds none (the gate stays closed: no gate testers).
select career_apply_cloud_optin_as('00000000-0000-4000-8000-00000000f171',true,'TEST terms');
select career_apply_cloud_optin_as('00000000-0000-4000-8000-00000000f173',true,'TEST terms');
insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note)
 values('00000000-0000-4000-8000-00000000f171','ashby',2,now()+interval '1 day','TEST hosted apply');
-- Each person's resume kept for the cloud, as is.
select t.ok(career_apply_cloud_resume_put_for(id,'resume.pdf',encode(convert_to('%PDF-1.4 TEST resume '||id::text,'UTF8'),'base64'))
 = encode(sha256(convert_to('%PDF-1.4 TEST resume '||id::text,'UTF8')),'hex'),'the kept resume is stored by its hash')
 from profiles where id::text like '00000000-0000-4000-8000-00000000f17%';
select t.ok((career_apply_cloud_resume_kept_for('00000000-0000-4000-8000-00000000f171')->>'filename')='resume.pdf','the kept resume reads back for the account');

create function pg_temp.payload(u text, n int, url text, co text default null, dest text default null) returns jsonb language sql as $$
 select jsonb_build_object('version',1,'user_id',u,'job_id','TEST-HOSTED-'||n,'company',coalesce(co,'Hosted Employer '||n),'url',url,
  'fields',jsonb_build_array(jsonb_build_object('name','_systemfield_email','label','Email','value','a@example.test')),
  'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour','engine_approval',repeat('e',64),
  'resume_sha256',encode(sha256(convert_to('%PDF-1.4 TEST resume '||u,'UTF8')),'hex'),'destination',coalesce(dest,url))
$$;
create function pg_temp.prep(u text, n int, url text, co text default null, dest text default null) returns uuid language plpgsql as $$
declare p jsonb := pg_temp.payload(u,n,url,co,dest); r uuid;
begin
 insert into career_apply_prepared(user_id,job_id,company,url,payload,payload_hash,card_lines)
 values(u::uuid,p->>'job_id',p->>'company',url,p,career_apply_payload_hash(p),array[(p->>'company')||': Email: a@example.test'])
 returning id into r;
 return r;
end $$;
-- A card shown a minute ago and answered now (the tap): approve the numbers given.
create function pg_temp.tap(u text, ids uuid[], approve int[]) returns uuid language plpgsql as $$
declare c career_apply_cards;
begin
 c := career_apply_card_open_for(u::uuid, ids, now() - interval '1 minute');
 perform career_apply_card_answer_for(u::uuid, c.id, approve, clock_timestamp());
 return c.id;
end $$;
create function pg_temp.job(u text, n int) returns career_apply_jobs language sql as $$
 select * from career_apply_jobs where user_id=u::uuid and job_id='TEST-HOSTED-'||n $$;
create function pg_temp.why(u text, n int, ppd int default null, psm int default null) returns text language sql as $$
 select career_apply_cloud_text_refusal(pg_temp.job(u,n), clock_timestamp(), 'claim', ppd, psm) $$;

-- A: two postings on one card; 1 approved, 2 declined. Then one approved alone (3).
create temp table c1 as select pg_temp.tap('00000000-0000-4000-8000-00000000f171',
 array[pg_temp.prep('00000000-0000-4000-8000-00000000f171',1,'https://jobs.ashbyhq.com/hosted1/1'),
       pg_temp.prep('00000000-0000-4000-8000-00000000f171',2,'https://jobs.ashbyhq.com/hosted2/2')], '{1}') as card;
select t.ok((select count(*)=1 from career_apply_jobs where user_id='00000000-0000-4000-8000-00000000f171'),'only the approved item was queued');
-- A job queued by a direct enqueue, never on a card (C), with every other condition met.
select (career_apply_enqueue(pg_temp.payload('00000000-0000-4000-8000-00000000f173',4,'https://jobs.ashbyhq.com/hosted4/4'),
 career_apply_payload_hash(pg_temp.payload('00000000-0000-4000-8000-00000000f173',4,'https://jobs.ashbyhq.com/hosted4/4')),
 career_apply_payload_hash(pg_temp.payload('00000000-0000-4000-8000-00000000f173',4,'https://jobs.ashbyhq.com/hosted4/4')),15)).id;

-- The route's own switch is off by default: nothing is claimed, even with the kill switch on.
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f171',1)='cloud_switches_off','route switch off: refused');
select t.ok((select count(*)=0 from career_apply_cloud_dispatch_claim2(10,10,10,15,10)),'route switch off: the dispatcher claims nothing');
insert into career_cloud_settings(key,value) values('CAREER_CLOUD_TEXT_CARDS','on');
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f173',4)='not_card_approved','a job no card approved is refused (directly enqueued)');
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f171',1) is null,'the card-approved job may go');

-- Nobody but the service.
reset role; set role authenticated;
select t.must_fail($$select * from career_apply_cloud_dispatch_claim2(1,1,1,1,1)$$,'permission denied','a signed-in person cannot dispatch');
select t.must_fail($$select career_apply_cloud_text_authorize(gen_random_uuid(),gen_random_uuid(),'x',null)$$,'permission denied','nor authorize');
select t.must_fail($$select career_apply_prepare_request_put('00000000-0000-4000-8000-00000000f171','{x}',5)$$,'permission denied','nor request a preparation');
select t.must_fail($$select career_apply_card_push_requested_for('00000000-0000-4000-8000-00000000f171',gen_random_uuid(),array[gen_random_uuid()],'x',now())$$,'permission denied','nor push a card');
reset role; set role service_role;
select t.must_fail($$select * from career_apply_cloud_text_claim_at(1,now(),'ashby',1,1)$$,'permission denied','the text claim is reached only through the dispatcher');
select t.must_fail($$select * from career_apply_cloud_dispatch_claim2(1,1,1,0,1)$$,'invalid dispatch limits','a zero per-person number is refused');
select t.must_fail($$select * from career_apply_cloud_dispatch_claim2(1,1,1,1,0)$$,'invalid dispatch limits','a zero per-site number is refused');
reset role;
-- The claim: one job, under its lease, with its marker; a second dispatch claims nothing (no double claim).
create temp table d1 as select * from career_apply_cloud_dispatch_claim2(10,10,10,15,10);
select t.ok((select count(*)=1 and bool_and(job_id='TEST-HOSTED-1' and state='driving' and source='cloud' and attempts=1 and lease_token is not null) from d1),
 'the card-approved job is claimed once, by the cloud, under a lease');
select t.ok((select count(*)=1 from career_apply_cloud_text_claims t join d1 on d1.id=t.job_id where t.card_id=(select card from c1) and t.item_n=1 and t.host='jobs.ashbyhq.com'),
 'its marker names the card, the item and the host');
select t.ok((select count(*)=0 from career_apply_cloud_dispatch_claim2(10,10,10,15,10)),'a second dispatch claims nothing');
select t.ok((select state='queued' and source is null from career_apply_jobs where job_id='TEST-HOSTED-4'),'the never-approved job is left alone');

-- The authorization: forged lease, forged hash, then the real one; a pause makes it stale; the route is named.
select t.must_fail(format($$select career_apply_cloud_authorize_any(%L,gen_random_uuid(),%L,null)$$,(select id from d1),(select payload_hash from d1)),'invalid apply claim','a forged lease is refused');
select t.must_fail(format($$select career_apply_cloud_authorize_any(%L,%L,%L,null)$$,(select id from d1),(select lease_token from d1),repeat('0',64)),'invalid apply claim','a forged hash is refused');
select t.ok((career_apply_cloud_authorize_any((select id from d1),(select lease_token from d1),(select payload_hash from d1),null))->>'route'='text_card','authorized, by the text-card route');
update career_watch_kv set value=jsonb_set(value,'{paused}','"true"') where user_id='00000000-0000-4000-8000-00000000f171' and key='career:account';
select t.must_fail(format($$select career_apply_cloud_authorize_any(%L,%L,%L,null)$$,(select id from d1),(select lease_token from d1),(select payload_hash from d1)),'stale','a paused account stops it before the engine or Submit');
update career_watch_kv set value=jsonb_set(value,'{paused}','"false"') where user_id='00000000-0000-4000-8000-00000000f171' and key='career:account';
-- Kill switch off at the authorization: refused.
update career_cloud_settings set value='off' where key='CAREER_CLOUD_APPLY';
select t.must_fail(format($$select career_apply_cloud_authorize_any(%L,%L,%L,null)$$,(select id from d1),(select lease_token from d1),(select payload_hash from d1)),'cloud_switches_off','the kill switch stops it at the authorization');
update career_cloud_settings set value='on' where key='CAREER_CLOUD_APPLY';
select career_apply_cloud_finish((select id from d1),(select lease_token from d1),'submitted_unconfirmed','{"reason":"page said received"}'::jsonb,'submitted',null);
select t.must_fail(format($$select career_apply_cloud_authorize_any(%L,%L,%L,null)$$,(select id from d1),(select lease_token from d1),(select payload_hash from d1)),'invalid apply claim','a finished job is authorized for nothing');
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f171',1)='not_approved','a job that already went is never claimed again (double send)');

-- Refusals, each on its own: approval older than 24 hours; a missing resume; a person not opted in; an erase.
create temp table c3 as select pg_temp.tap('00000000-0000-4000-8000-00000000f171',array[pg_temp.prep('00000000-0000-4000-8000-00000000f171',3,'https://jobs.ashbyhq.com/hosted3/3')],'{1}') card;
update career_apply_cards set answered_at=answered_at-interval '25 hours',shown_at=shown_at-interval '25 hours' where id=(select card from c3);
update career_apply_jobs set created_at=created_at-interval '25 hours' where job_id='TEST-HOSTED-3';
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f171',3)='approval_expired','an approval older than 24 hours is refused');
update career_apply_cards set answered_at=answered_at+interval '25 hours',shown_at=shown_at+interval '25 hours' where id=(select card from c3);
update career_apply_jobs set created_at=created_at+interval '25 hours' where job_id='TEST-HOSTED-3';
delete from career_apply_cloud_resumes where user_id='00000000-0000-4000-8000-00000000f171';
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f171',3)='resume_not_in_cloud','no kept resume: refused');
select career_apply_cloud_resume_put_for('00000000-0000-4000-8000-00000000f171','resume.pdf',encode(convert_to('%PDF-1.4 TEST resume 00000000-0000-4000-8000-00000000f171','UTF8'),'base64'));
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f171',3) is null,'with the resume back, it may go');
-- Per person per day: one already went today, the dispatcher's number is 1.
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f171',3,1)='daily_limit','the per-person number is held');
-- Per site per minute: one Ashby claim this minute, the number is 1.
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f171',3,15,1)='site_rate','the per-site number is held');
select t.ok((select count(*)=0 from career_apply_cloud_dispatch_claim2(10,10,10,15,1)),'the dispatcher with a per-site 1 claims nothing more there this minute');
-- Portal paused, person paused.
insert into career_apply_cloud_pauses(scope,portal,reason,until,created_at) values('portal','ashby','TEST',now()+interval '1 hour',now());
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f171',3)='portal_paused','a paused family is refused');
delete from career_apply_cloud_pauses;
insert into career_apply_cloud_pauses(scope,user_id,reason,until,created_at) values('person','00000000-0000-4000-8000-00000000f171','TEST',now()+interval '1 hour',now());
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f171',3)='person_paused','a paused person is refused');
delete from career_apply_cloud_pauses;
-- The waiver: 2 sends. The second goes; a third is refused because the gate is closed and the waiver spent.
create temp table d2 as select * from career_apply_cloud_dispatch_claim2(10,10,10,15,10);
select t.ok((select count(*)=1 and bool_and(job_id='TEST-HOSTED-3') from d2),'the second waived send is claimed');
create temp table c5 as select pg_temp.tap('00000000-0000-4000-8000-00000000f171',array[pg_temp.prep('00000000-0000-4000-8000-00000000f171',5,'https://jobs.ashbyhq.com/hosted5/5')],'{1}') card;
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f171',5)='gate_closed','the waiver is spent: the gate is closed for a third');
-- C has no waiver: gate closed; B is not opted in.
create temp table c6 as select pg_temp.tap('00000000-0000-4000-8000-00000000f173',array[pg_temp.prep('00000000-0000-4000-8000-00000000f173',6,'https://jobs.ashbyhq.com/hosted6/6')],'{1}') card;
create temp table c7 as select pg_temp.tap('00000000-0000-4000-8000-00000000f172',array[pg_temp.prep('00000000-0000-4000-8000-00000000f172',7,'https://jobs.ashbyhq.com/hosted7/7')],'{1}') card;
insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note) values('00000000-0000-4000-8000-00000000f172','ashby',5,now()+interval '1 day','TEST B');
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f173',6)='gate_closed','no waiver, gate closed: refused');
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f172',7)='not_opted_in','not opted in: refused');
-- An erase (the epoch moves): the opt-in and the kept resume go with it; the job is stale.
insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note) values('00000000-0000-4000-8000-00000000f173','ashby',5,now()+interval '1 day','TEST C');
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f173',6) is null,'C with a waiver may go');
update career_watch_kv set value=jsonb_set(value,'{epoch}','2') where user_id='00000000-0000-4000-8000-00000000f173' and key='career:account';
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f173',6)='stale','after an erase the approval is stale');
select t.ok((select count(*)=0 from career_apply_cloud_resumes where user_id='00000000-0000-4000-8000-00000000f173'),'and the kept resume is gone');
-- Not a cloud portal; a form only the person can submit.
update career_watch_kv set value='{"epoch":1,"version":1,"paused":false}' where user_id='00000000-0000-4000-8000-00000000f172' and key='career:account';
select career_apply_cloud_optin_as('00000000-0000-4000-8000-00000000f172',true,'TEST terms');
select career_apply_cloud_resume_put_for('00000000-0000-4000-8000-00000000f172','resume.pdf',encode(convert_to('%PDF-1.4 TEST resume 00000000-0000-4000-8000-00000000f172','UTF8'),'base64'));
create temp table c8 as select pg_temp.tap('00000000-0000-4000-8000-00000000f172',array[pg_temp.prep('00000000-0000-4000-8000-00000000f172',8,'https://jobs.smartrecruiters.com/x/8')],'{1}') card;
create temp table c9 as select pg_temp.tap('00000000-0000-4000-8000-00000000f172',array[pg_temp.prep('00000000-0000-4000-8000-00000000f172',9,'https://jobs.ashbyhq.com/hosted9/9','Person Submits Co','person-submits')],'{1}') card;
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f172',8)='portal_not_cloud','another portal family is never the cloud''s');
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f172',9)='person_submits','a form only the person can submit is never the cloud''s');
-- The job changed after the tap (payload no longer the prepared one): refused.
alter table career_apply_jobs disable trigger user;
update career_apply_jobs set payload=jsonb_set(payload,'{fields,0,value}','"changed@example.test"') where job_id='TEST-HOSTED-7';
update career_apply_jobs set payload_hash=career_apply_payload_hash(payload),approval_hash=career_apply_payload_hash(payload) where job_id='TEST-HOSTED-7';
alter table career_apply_jobs enable trigger user;
select t.ok(pg_temp.why('00000000-0000-4000-8000-00000000f172',7)='not_card_approved','a job whose payload is not the card''s is refused, even rehashed');
-- The prepared application changed after the tap (its row no longer the job's): refused, though the card's hash still is.
update career_apply_prepared set payload=jsonb_set(payload,'{company}','"Someone Else"') where job_id='TEST-HOSTED-6';
select t.ok(career_apply_cloud_text_refusal((select j from career_apply_jobs j where job_id='TEST-HOSTED-6'),clock_timestamp(),'claim') in ('not_card_approved'),
 'a prepared row changed after the tap binds nothing');
-- A card-cloud (bridge) job is never taken by this route.
do $$ declare j career_apply_jobs; a uuid; begin
 if to_regclass('career_message_approval_private.cloud_bound_jobs') is null then raise notice 'ok   (no bridge here: card-cloud exclusion checked where it is applied)'; return; end if;
 select * into j from career_apply_jobs where job_id='TEST-HOSTED-5';
 insert into career_apply_batch_approvals(user_id,job_id,batch_hash,entry,used_at) values(j.user_id,j.job_id,j.payload_hash,j.payload,now()) returning id into a;
 insert into career_message_approval_private.cloud_bound_approvals(approval_id,user_id,card_id,item_index,payload_hash,approved_at,expires_at)
  values(a,j.user_id,gen_random_uuid(),0,j.payload_hash,now(),now()+interval '1 hour');
 insert into career_message_approval_private.cloud_bound_jobs(job_row_id,approval_id,user_id,card_id,item_index)
  select j.id,a,j.user_id,card_id,0 from career_message_approval_private.cloud_bound_approvals where approval_id=a;
 if career_apply_cloud_text_refusal(j,clock_timestamp(),'claim') is distinct from 'card_cloud_route' then raise exception 'FAIL a card-cloud job was not left to its own route'; end if;
 raise notice 'ok   a card-cloud job is left to the bridge''s own route';
end $$;

-- ------------------------------------------------------------------------------------------ preparation requests
insert into career_apply_wanted(user_id,posting_key,url,company,title) values
 ('00000000-0000-4000-8000-00000000f171','ashby:hostedp:1','https://jobs.ashbyhq.com/hostedp/1','P1 Co','Intern'),
 ('00000000-0000-4000-8000-00000000f171','ashby:hostedp:2','https://jobs.ashbyhq.com/hostedp/2','P2 Co','Intern'),
 ('00000000-0000-4000-8000-00000000f172','greenhouse:hostedq:1','https://job-boards.greenhouse.io/hostedq/jobs/1','Q1 Co','Intern');
select t.must_fail($$select career_apply_prepare_request_put('00000000-0000-4000-8000-00000000f171','{ashby:not-theirs:9}',5)$$,'nothing_to_prepare','a posting not in the person''s queue is not prepared');
select t.must_fail($$select career_apply_prepare_request_put('00000000-0000-4000-8000-00000000f172','{ashby:hostedp:1}',5)$$,'nothing_to_prepare','another person''s queued posting is not theirs to prepare');
create temp table r1 as select career_apply_prepare_request_put('00000000-0000-4000-8000-00000000f171','{ashby:hostedp:1,ashby:hostedp:2,ashby:not-theirs:9}',5) v;
select t.ok((select (v->>'accepted')::boolean from r1),'accepted');
select t.ok((select job_ids='{ashby:hostedp:1,ashby:hostedp:2}' and hosts='{jobs.ashbyhq.com}' from career_apply_prepare_requests where id=(select (v->>'id')::uuid from r1)),
 'only their own queued postings, with the employer host');
select t.ok((select career_apply_prepare_request_put('00000000-0000-4000-8000-00000000f171','{ashby:hostedp:2,ashby:hostedp:1}',5)->>'id')=(select v->>'id' from r1),
 'a second kick for the same postings is the same request (double tap)');
create temp table r2 as select career_apply_prepare_request_put('00000000-0000-4000-8000-00000000f172','{greenhouse:hostedq:1}',5) v;
-- Global 1: one claimed; the scope opens only with its lease; per site 1 a minute.
create temp table p1 as select * from career_apply_prepare_request_claim(10,1,5,10);
select t.ok((select count(*)=1 and bool_and(state='running' and lease_token is not null) from p1),'global 1: one request runs');
select t.ok((select count(*)=0 from career_apply_prepare_request_claim(10,1,5,10)),'global 1: no second while it runs');
select t.ok(career_apply_prepare_request_scope((select id from p1),gen_random_uuid()) is null,'the scope needs the lease');
select t.ok((career_apply_prepare_request_scope((select id from p1),(select lease_token from p1))->>'user_id')=(select user_id::text from p1),'with its lease: the person');
select career_apply_prepare_request_finish((select id from p1),(select lease_token from p1),'done','{"ready":1}'::jsonb,null);
select t.must_fail(format($$select career_apply_prepare_request_finish(%L,%L,'done','{}'::jsonb,null)$$,(select id from p1),(select lease_token from p1)),'invalid prepare lease','finished once');
select t.ok(career_apply_prepare_request_scope((select id from p1),(select lease_token from p1)) is null,'a finished request opens nothing');
-- Per person per day 1: the person whose request ran today waits; the other runs.
create temp table r3 as select career_apply_prepare_request_put((select user_id from p1),(select job_ids from p1),1) v;
select t.ok((select not (v->>'accepted')::boolean and v->>'waiting_for'='per_person_day' from r3),'over today''s number: the chat is told it waits');
create temp table p2 as select * from career_apply_prepare_request_claim(10,10,1,10);
select t.ok((select count(*)=1 and bool_and(user_id<>(select user_id from p1)) from p2),'per person per day 1: only the other person''s request runs');
-- A request running past its lease is expired, never run again.
update career_apply_prepare_requests set claimed_at=now()-interval '16 minutes' where id=(select id from p2);
select t.ok((select count(*)>=0 from career_apply_prepare_request_claim(1,10,5,10)),'a claim runs');
select t.ok((select state='expired' from career_apply_prepare_requests where id=(select id from p2)),'a request past its lease is expired, not re-run');

-- ------------------------------------------------------------------------------------------ the bounded push
insert into agent_threads(id,user_id) values('00000000-0000-4000-8000-0000000f17aa','00000000-0000-4000-8000-00000000f171');
insert into channel_contacts(contact,user_id,thread_id,last_inbound_at,created_at) values('tg:417001','00000000-0000-4000-8000-00000000f171','00000000-0000-4000-8000-0000000f17aa',now(),now());
-- They just texted, and the reply went out: the scheduled push holds back for 30 minutes.
insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-00000000f171','reply:TEST-HOSTED','reply','1/1 queued',now());
create temp table pp as select pg_temp.prep('00000000-0000-4000-8000-00000000f171',11,'https://jobs.ashbyhq.com/hostedp/1','P1 Co') id;
create temp table qq as select pg_temp.prep('00000000-0000-4000-8000-00000000f171',12,'https://jobs.ashbyhq.com/hostedz/1','Z1 Co') id;
select career_apply_prepare_attempt_for('00000000-0000-4000-8000-00000000f171','ashby:hostedp:1','ready',null,(select id from pp),'TEST-HOSTED-11');
select career_apply_prepare_attempt_for('00000000-0000-4000-8000-00000000f171','ashby:other:1','ready',null,(select id from qq),'TEST-HOSTED-12');
select t.ok(career_apply_card_push_for('00000000-0000-4000-8000-00000000f171',array[(select id from pp)],'P1 Co: Email: a@example.test',now()) is null,
 'the scheduled push holds back while the conversation is under way');
select t.must_fail(format($$select career_apply_card_push_requested_for('00000000-0000-4000-8000-00000000f171',%L,array[%L::uuid],'Z1 Co: Email: a@example.test',now())$$,
 (select v->>'id' from r1),(select id from qq)),'not a requested preparation','a prepared row they did not ask for in this request is not pushed this way');
select t.must_fail(format($$select career_apply_card_push_requested_for('00000000-0000-4000-8000-00000000f172',%L,array[%L::uuid],'P1 Co: Email: a@example.test',now())$$,
 (select v->>'id' from r1),(select id from pp)),'not a requested preparation','another person''s request pushes nothing');
select t.must_fail(format($$select career_apply_card_push_requested_for('00000000-0000-4000-8000-00000000f171',%L,array[%L::uuid],'P1 Co only',now())$$,
 (select v->>'id' from r1),(select id from pp)),'does not carry every line','a text missing a card line is refused');
create temp table pushed as select career_apply_card_push_requested_for('00000000-0000-4000-8000-00000000f171',(select (v->>'id')::uuid from r1),
 array[(select id from pp)],'P1 Co: Email: a@example.test',now()) card;
select t.ok((select card is not null from pushed),'the card they asked for is shown now, inside the 30 minutes');
select t.ok((select count(*)=1 from career_outbox where user_id='00000000-0000-4000-8000-00000000f171' and kind='card' and card_id=(select card from pushed) and deliver_at<=now()),
 'one outbox row carries it, due now');
select t.ok((select meta->>'requested'='true' and meta->>'card_id'=(select card::text from pushed) from agent_messages where thread_id='00000000-0000-4000-8000-0000000f17aa' order by id desc limit 1),
 'the thread records the card it showed');
select t.ok(public.channel_target('00000000-0000-4000-8000-00000000f171',null)='tg:417001','it goes to their Telegram chat');
-- Opted out: nothing.
update channel_contacts set opted_out=true where contact='tg:417001';
update career_apply_prepared set state='ready' where id=(select id from pp);
select t.ok(career_apply_card_push_requested_for('00000000-0000-4000-8000-00000000f171',(select (v->>'id')::uuid from r1),array[(select id from pp)],'P1 Co: Email: a@example.test',now()) is null,
 'after STOP, nothing is pushed');
-- ------------------------------------------------------------------------------------------ follow-through
update channel_contacts set opted_out=false where contact='tg:417001';
update career_apply_prepared set state='shown' where id=(select id from pp);
select t.ok((select stage from career_apply_pending_for('00000000-0000-4000-8000-00000000f171') where posting_key='ashby:hostedp:1')='on_card',
 'a posting on an open card reads on_card');
select t.ok((select stage from career_apply_pending_for('00000000-0000-4000-8000-00000000f171') where posting_key='ashby:hostedp:2') in ('preparing','in_queue'),
 'a posting not prepared yet reads preparing or in_queue');
-- Changing their mind: cancel P1 Co. The queue row, the prepared application and its try go; the open card closes; a tap
-- on it then approves nothing; asking again prepares afresh.
create temp table cx as select career_apply_cancel_for('00000000-0000-4000-8000-00000000f171','P1 Co') v;
select t.ok((select (v->>'queued_removed')::int=1 and (v->>'prepared_removed')::int=1 and (v->>'cards_closed')::int=1 from cx),'cancel: queue row, prepared application and its card');
select t.ok(not exists(select from career_apply_wanted where user_id='00000000-0000-4000-8000-00000000f171' and posting_key='ashby:hostedp:1'),'out of the queue');
select t.ok((select state='answered' and answer->>'closed'='cancelled by the person' from career_apply_cards where id=(select card from pushed)),'the card is closed');
select t.must_fail(format($$select career_apply_card_answer_for('00000000-0000-4000-8000-00000000f171',%L,'{1}',clock_timestamp())$$,(select card from pushed)),'card_answered','a tap on the cancelled card approves nothing');
select t.ok(not exists(select from career_apply_prepare_attempts where user_id='00000000-0000-4000-8000-00000000f171' and posting_job_id='ashby:hostedp:1'),'its try is gone, so asking again prepares afresh');
-- An approved application not yet claimed is closed not_submitted; one being sent is left and named; a sent one is named.
create temp table c12 as select pg_temp.tap('00000000-0000-4000-8000-00000000f171',array[pg_temp.prep('00000000-0000-4000-8000-00000000f171',13,'https://jobs.ashbyhq.com/hostedc/13','Cancel Co')],'{1}') card;
create temp table cy as select career_apply_cancel_for('00000000-0000-4000-8000-00000000f171','Cancel Co') v;
select t.ok((select (v->>'approved_cancelled')::int=1 from cy) and (select state='not_submitted' and reason like 'not sent: you cancelled it%' from career_apply_jobs where job_id='TEST-HOSTED-13'),
 'an approved, unclaimed application is not sent');
select t.ok((select (v->>'being_sent')::int=1 from (select career_apply_cancel_for('00000000-0000-4000-8000-00000000f171','Hosted Employer 3') v) x),'one being sent is left as it is and named');
select t.ok((select jsonb_array_length(v->'already_sent')=1 from (select career_apply_cancel_for('00000000-0000-4000-8000-00000000f171','Hosted Employer 1') v) x),'a sent one is named, never undone');
select t.ok((select state='submitted_unconfirmed' from career_apply_jobs where job_id='TEST-HOSTED-1'),'and it is unchanged');
select t.ok((select (v->>'queued_removed')::int=0 and (v->>'prepared_removed')::int=0 from (select career_apply_cancel_for('00000000-0000-4000-8000-00000000f172','P1 Co') v) x),'another person''s cancel touches nothing of theirs');
-- A person on the web chat only: the card goes into their last thread, with no text queued.
insert into auth.users(id,email) values('00000000-0000-4000-8000-00000000f174','hosted-web@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-00000000f174');
insert into career_watch_kv(user_id,key,value) values('00000000-0000-4000-8000-00000000f174','career:account','{"epoch":1,"version":1,"paused":false}');
insert into agent_threads(id,user_id) values('00000000-0000-4000-8000-0000000f17bb','00000000-0000-4000-8000-00000000f174');
insert into agent_messages(thread_id,role,content) values('00000000-0000-4000-8000-0000000f17bb','user','apply me to this');
insert into career_apply_wanted(user_id,posting_key,url,company,title) values('00000000-0000-4000-8000-00000000f174','ashby:hostedw:1','https://jobs.ashbyhq.com/hostedw/1','W1 Co','Intern');
create temp table rw as select career_apply_prepare_request_put('00000000-0000-4000-8000-00000000f174','{ashby:hostedw:1}',5) v;
create temp table pw as select pg_temp.prep('00000000-0000-4000-8000-00000000f174',14,'https://jobs.ashbyhq.com/hostedw/1','W1 Co') id;
select career_apply_prepare_attempt_for('00000000-0000-4000-8000-00000000f174','ashby:hostedw:1','ready',null,(select id from pw),'TEST-HOSTED-14');
create temp table pushedw as select career_apply_card_push_requested_for('00000000-0000-4000-8000-00000000f174',(select (v->>'id')::uuid from rw),array[(select id from pw)],'W1 Co: Email: a@example.test',now()) card;
select t.ok((select card is not null from pushedw),'web only: the card is shown');
select t.ok((select meta->>'card_id'=(select card::text from pushedw) from agent_messages where thread_id='00000000-0000-4000-8000-0000000f17bb' order by id desc limit 1),'in the thread they last talked in');
select t.ok(not exists(select from career_outbox where user_id='00000000-0000-4000-8000-00000000f174'),'no text is queued for a person with no texting contact');
-- An expired request is told, once: queued for more than a day.
update career_apply_prepare_requests set created_at=now()-interval '25 hours' where id=(select (v->>'id')::uuid from rw);
select count(*) from career_apply_prepare_request_claim(0,10,5,10);
select t.ok((select state='expired' from career_apply_prepare_requests where id=(select (v->>'id')::uuid from rw)),'a request not started in a day is expired');
select t.ok((select content like 'I couldn''t start preparing the application you asked for within a day%Nothing was sent%' from agent_messages where meta->>'notice_key'='status:prepare:'||(select v->>'id' from rw)),'and the person (web only) is told in their thread what happened and what to do');
select count(*) from career_apply_prepare_request_claim(0,10,5,10);
select t.ok((select count(*)=1 from agent_messages where meta->>'notice_key'='status:prepare:'||(select v->>'id' from rw)),'told once');
select t.ok(not exists(select from career_outbox where user_id='00000000-0000-4000-8000-00000000f174'),'and no text is queued for them');
-- A texting person whose request ran past its lease is told on their channel.
create temp table rl as select career_apply_prepare_request_put('00000000-0000-4000-8000-00000000f171','{ashby:hostedp:2}',50) v;
select count(*) from career_apply_prepare_request_claim(5,50,50,50);
update career_apply_prepare_requests set claimed_at=now()-interval '16 minutes' where id=(select (v->>'id')::uuid from rl);
select count(*) from career_apply_prepare_request_claim(0,50,50,50);
select t.ok((select text like 'Preparing the application you asked for stopped before it finished%' from career_outbox where key='status:prepare:'||(select v->>'id' from rl)),'a request past its lease is told on their channel');
-- A person who texts by SMS: the same card, queued for their phone number.
insert into agent_threads(id,user_id) values('00000000-0000-4000-8000-0000000f17cc','00000000-0000-4000-8000-00000000f173');
insert into channel_contacts(contact,user_id,thread_id,last_inbound_at,created_at) values('+15550171730','00000000-0000-4000-8000-00000000f173','00000000-0000-4000-8000-0000000f17cc',now(),now());
insert into career_apply_wanted(user_id,posting_key,url,company,title) values('00000000-0000-4000-8000-00000000f173','ashby:hosteds:1','https://jobs.ashbyhq.com/hosteds/1','S1 Co','Intern');
create temp table rs as select career_apply_prepare_request_put('00000000-0000-4000-8000-00000000f173','{ashby:hosteds:1}',5) v;
create temp table ps as select pg_temp.prep('00000000-0000-4000-8000-00000000f173',15,'https://jobs.ashbyhq.com/hosteds/1','S1 Co') id;
update career_apply_prepared set payload=jsonb_set(payload,'{privacy_epoch}','2') where id=(select id from ps);
select career_apply_prepare_attempt_for('00000000-0000-4000-8000-00000000f173','ashby:hosteds:1','ready',null,(select id from ps),'TEST-HOSTED-15');
create temp table pusheds as select career_apply_card_push_requested_for('00000000-0000-4000-8000-00000000f173',(select (v->>'id')::uuid from rs),array[(select id from ps)],'S1 Co: Email: a@example.test',now()) card;
select t.ok((select card is not null from pusheds) and exists(select from career_outbox where user_id='00000000-0000-4000-8000-00000000f173' and card_id=(select card from pusheds)),'SMS: the card is queued for their texts');
select t.ok(public.channel_target('00000000-0000-4000-8000-00000000f173',null)='+15550171730','to their phone number');
-- They change their mind on the SMS one: its only posting leaves, so the request that was to prepare it ends.
create temp table cs as select career_apply_cancel_for('00000000-0000-4000-8000-00000000f173','s1 co') v;
select t.ok((select (v->>'queued_removed')::int=1 from cs)
 and (select state='expired' and outcome->>'reason'='cancelled by the person' from career_apply_prepare_requests where id=(select (v->>'id')::uuid from rs)),
 'cancelling the only posting of a waiting preparation ends it (any case of the name)');
-- Another person's same-named employer is never touched.
insert into career_apply_wanted(user_id,posting_key,url,company,title) values('00000000-0000-4000-8000-00000000f172','ashby:hosteds:9','https://jobs.ashbyhq.com/hosteds/9','S1 Co','Intern');
insert into career_apply_wanted(user_id,posting_key,url,company,title) values('00000000-0000-4000-8000-00000000f173','ashby:hosteds:8','https://jobs.ashbyhq.com/hosteds/8','S1 Co','Intern');
select career_apply_cancel_for('00000000-0000-4000-8000-00000000f173','S1 Co');
select t.ok(exists(select from career_apply_wanted where user_id='00000000-0000-4000-8000-00000000f172' and posting_key='ashby:hosteds:9')
 and not exists(select from career_apply_wanted where user_id='00000000-0000-4000-8000-00000000f173' and posting_key='ashby:hosteds:8'),'a cancel leaves another person''s queue as it was');
-- Status before a card: waiting on their answers, with the count; a posting already an application is said by the
-- applications list, not twice.
insert into career_apply_wanted(user_id,posting_key,url,company,title) values('00000000-0000-4000-8000-00000000f173','ashby:hostedq:1','https://jobs.ashbyhq.com/hostedq/1','Q1 Co','Intern');
select career_apply_prepare_attempt_for('00000000-0000-4000-8000-00000000f173','ashby:hostedq:1','asked','2 questions',null,'TEST-HOSTED-Q');
insert into career_apply_questions(user_id,key,kind,label,type,job_ids) values('00000000-0000-4000-8000-00000000f173','label:00000000000f17a1','screen','What is your graduation date?','date','{TEST-HOSTED-Q}'),
 ('00000000-0000-4000-8000-00000000f173','label:00000000000f17a2','consent','WhatsApp consent','radio','{TEST-HOSTED-Q}');
select t.ok((select stage='waiting_on_you' and open_questions=2 from career_apply_pending_for('00000000-0000-4000-8000-00000000f173') where posting_key='ashby:hostedq:1'),'a posting waiting on their answers reads waiting_on_you, 2');
insert into career_apply_wanted(user_id,posting_key,url,company,title) values('00000000-0000-4000-8000-00000000f171','ashby:hostedr:1','https://jobs.ashbyhq.com/hostedr/1','Hosted Employer 1','Intern');
select career_apply_prepare_attempt_for('00000000-0000-4000-8000-00000000f171','ashby:hostedr:1','error','x',null,'TEST-HOSTED-1');
select t.ok(not exists(select from career_apply_pending_for('00000000-0000-4000-8000-00000000f171') where posting_key='ashby:hostedr:1'),'a posting that is already an application is not listed again');
-- A notice is never sent after STOP, and a thread notice is written once per key.
update channel_contacts set opted_out=true where contact='+15550171730';
select t.ok(not career_apply_prepare_tell('00000000-0000-4000-8000-00000000f173','status:prepare:stop-test','x')
 and not exists(select from career_outbox where key='status:prepare:stop-test'),'after STOP, no notice');
select t.ok(career_apply_prepare_tell('00000000-0000-4000-8000-00000000f174','status:prepare:once-test','x'),'a thread notice is written');
select t.ok(not career_apply_prepare_tell('00000000-0000-4000-8000-00000000f174','status:prepare:once-test','x'),'the same notice again is refused');
select t.ok((select count(*)=1 from agent_messages where meta->>'notice_key'='status:prepare:once-test'),'a thread notice is written once');
rollback;
