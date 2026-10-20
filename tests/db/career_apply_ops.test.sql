-- WO-032 (20261021040000_career_apply_ops.sql): every row says who drove it; only the employer's email confirms one; the
-- PR #16 gate counts email-confirmed hand submissions per portal family; an emailed application goes only for the exact
-- payload shown, under the daily limit; open questions are pushed once, a day at most, as the thread's last word; an
-- ambiguous employer email is asked about once and answered by number.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000961','ops-a@example.test'),('00000000-0000-4000-8000-000000000962','ops-b@example.test'),
 ('00000000-0000-4000-8000-000000000963','ops-c@example.test'),('00000000-0000-4000-8000-000000000964','ops-d@example.test');
insert into profiles(id) select id from auth.users where email like 'ops-%@example.test';
insert into agent_threads(id,user_id,title) values
 ('00000000-0000-4000-8000-0000000009c1','00000000-0000-4000-8000-000000000961','Texts'),
 ('00000000-0000-4000-8000-0000000009c3','00000000-0000-4000-8000-000000000963','Texts'),
 ('00000000-0000-4000-8000-0000000009c4','00000000-0000-4000-8000-000000000964','Texts');
insert into channel_contacts(contact,user_id,thread_id,opted_out) values
 ('+15550009601','00000000-0000-4000-8000-000000000961','00000000-0000-4000-8000-0000000009c1',false),
 ('+15550009603','00000000-0000-4000-8000-000000000963','00000000-0000-4000-8000-0000000009c3',false),
 ('+15550009604','00000000-0000-4000-8000-000000000964','00000000-0000-4000-8000-0000000009c4',false);
insert into career_watch_kv(user_id,key,value) select id,'career:account','{"epoch":1,"version":1,"paused":false}' from auth.users where email like 'ops-%@example.test';

-- Three of A's applications queued: one for the cloud, one for A's computer, one for A's extension.
set role service_role;
do $$declare p jsonb;h text;n int;begin
 for n in 1..3 loop
  p:=jsonb_build_object('version',1,'user_id','00000000-0000-4000-8000-000000000961','job_id','TEST-OPS-'||n,'company','Ops Employer '||n,
   'url',(array['https://job-boards.greenhouse.io/test/jobs/1','https://jobs.lever.co/test/2','https://jobs.ashbyhq.com/test/3'])[n],
   'fields','[]'::jsonb,'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour');
  h:=encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
  perform career_apply_enqueue(p,h,h,25);
 end loop;
end $$;
reset role;
update career_apply_jobs set created_at=now()-interval '10 minutes'*(4-right(job_id,1)::int) where job_id like 'TEST-OPS-%';
set role service_role;
create temp table cloud as select * from career_apply_claim(now(),1);
reset role;
select t.ok((select count(*)=1 and bool_and(source='cloud') from cloud),'the worker pool''s claim is the cloud''s');
select t.as_user('00000000-0000-4000-8000-000000000961');set role authenticated;
create temp table mine as select * from career_apply_claim_own(1);
create temp table ext as select * from career_apply_claim_own(1,'extension');
grant select on mine, ext to service_role;
select t.must_fail($$select * from career_apply_claim_own(1,'cloud')$$,'invalid apply source','the person''s own claim is never the cloud''s');
select t.ok((select bool_and(source='own_computer') from mine) and (select bool_and(source='extension') from ext),'the person''s computer and extension say which they are');
-- The page says "thank you for applying": evidence, not confirmation.
create temp table fin as select * from career_apply_finish_own((select id from mine),(select lease_token from mine),'confirmed','{"reason":"employer confirmation on the page"}');
select t.ok((select state='submitted_unconfirmed' and evidence->>'page_confirmation'='true' from fin),'a page''s confirmation waits for the email');
select career_apply_finish_own((select id from ext),(select lease_token from ext),'submitted_unconfirmed','{}');
reset role;
set role service_role;
select career_apply_finish((select id from cloud),(select lease_token from cloud),'submitted_unconfirmed','{}');
select t.must_fail($$update career_apply_jobs set state='confirmed' where job_id='TEST-OPS-1'$$,'confirmed_only_by_email','no path but the email confirms a row');

-- The email confirms: inside the window, once, idempotent; outside the window or a row that never went, never.
select t.ok(career_apply_confirm_as('00000000-0000-4000-8000-000000000961',(select id from mine),repeat('a',64),'received','received: "we received your application" in subject "Thanks" from lever.co',clock_timestamp())='confirmed','the employer''s email confirms the row');
select t.ok((select state='confirmed' and email_confirmed_at is not null and confirmation_mail_hash=repeat('a',64) from career_apply_jobs where id=(select id from mine)),'email_confirmed_at and the message hash are kept (WO-039''s names)');
select t.ok((select application_ref='job:'||(select id from mine) and kind='received' and evidence like 'received:%' from career_mail_events where message_hash=repeat('a',64)),'the evidence line is filed under the application; no body anywhere');
select t.ok(career_apply_confirm_as('00000000-0000-4000-8000-000000000961',(select id from mine),repeat('a',64),'received','received again',clock_timestamp())='already','the same email again changes nothing');
select t.ok(career_apply_confirm_as('00000000-0000-4000-8000-000000000961',(select id from mine),repeat('b',64),'interview','interview later',clock_timestamp())='confirmed_by_another_email','a later email does not rewrite the confirmation');
select t.ok(career_apply_confirm_as('00000000-0000-4000-8000-000000000961',(select id from ext),repeat('c',64),'received','too late',clock_timestamp()+interval '15 days')='outside_window','an email more than 14 days after the submission confirms nothing');
select t.ok(career_apply_confirm_as('00000000-0000-4000-8000-000000000961',(select id from ext),repeat('c',64),'received','too early',now()-interval '1 hour')='outside_window','an email before the submission confirms nothing');
select t.must_fail($$select career_apply_confirm_as('00000000-0000-4000-8000-000000000961',(select id from ext),repeat('c',64),'received','code 123456',clock_timestamp())$$,'invalid confirmation','evidence never holds a long number');
select t.must_fail($$select career_apply_confirm_as('00000000-0000-4000-8000-000000000962',(select id from ext),repeat('c',64),'received','x',clock_timestamp())$$,'not your application','one person''s email never confirms another''s row');
select t.ok(career_apply_confirm_as('00000000-0000-4000-8000-000000000961',(select id from ext),repeat('d',64),'rejection','rejection: "not to move forward"',clock_timestamp())='confirmed','a rejection also confirms receipt');

-- The gate: per family, email-confirmed hand submissions out of 3; the cloud's never count.
select t.ok(career_apply_confirm_as('00000000-0000-4000-8000-000000000961',(select id from cloud),repeat('e',64),'received','received',clock_timestamp())='confirmed','the cloud''s row confirms too');
reset role;
select t.ok((select confirmed=1 and needed=3 and not met from career_apply_gate_status() where family='lever'),'Lever: 1 of 3 (the computer''s)');
select t.ok((select confirmed=0 and awaiting_email=0 from career_apply_gate_status() where family='ashby'),'Ashby: 0 of 3 (the extension''s was confirmed by a rejection, not a confirmation email, as WO-039 counts)');
select t.ok((select confirmed=0 from career_apply_gate_status() where family='greenhouse'),'Greenhouse: 0 of 3 (the cloud''s does not count)');
set role authenticated;
select t.must_fail($$select * from career_apply_gate_status()$$,'permission denied','the gate is read by the owner, not by people');
reset role;

-- Apply by email: only the exact payload on the card, within a day, under the daily limit, one per posting.
create temp table em as select jsonb_build_object('kind','email','version',1,'user_id','00000000-0000-4000-8000-000000000963','job_id','TEST-MAIL-1',
 'company','Mail Employer','title','Analyst','url','https://mail-employer.example.test/jobs/1','to','jobs@mail-employer.example.test',
 'subject','Application: Analyst','body','Hello Mail Employer hiring team,','attachment',jsonb_build_object('filename','resume.pdf','sha256',repeat('f',64))) p;
alter table em add column h text;
update em set h=encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
grant select on em to service_role;
set role service_role;
select t.must_fail($$select career_apply_email_reserve_as('00000000-0000-4000-8000-000000000963',p,h) from em$$,'changed_since_yes','no card shown: nothing goes');
insert into career_watch_kv(user_id,key,value) select '00000000-0000-4000-8000-000000000963','career:email-card',jsonb_build_object('state','shown','payload_hash',h,'shown_at',now(),'payload',p) from em;
select t.must_fail($$select career_apply_email_reserve_as('00000000-0000-4000-8000-000000000963',p||'{"subject":"Edited after the yes"}',h) from em$$,'invalid email application','a payload that is not the hash approved is refused');
select t.must_fail($$select career_apply_email_reserve_as('00000000-0000-4000-8000-000000000963',p||'{"bcc":"x@example.test"}',encode(sha256(convert_to(career_apply_canonical(p||'{"bcc":"x@example.test"}'),'UTF8')),'hex')) from em$$,'invalid email application','never a BCC');
select t.must_fail($$select career_apply_email_reserve_as('00000000-0000-4000-8000-000000000963',p||'{"to":"a@example.test, b@example.test"}',encode(sha256(convert_to(career_apply_canonical(p||'{"to":"a@example.test, b@example.test"}'),'UTF8')),'hex')) from em$$,'invalid email application','one recipient only');
update career_watch_kv set value=value||'{"payload_hash":"0000000000000000000000000000000000000000000000000000000000000000"}' where user_id='00000000-0000-4000-8000-000000000963' and key='career:email-card';
select t.must_fail($$select career_apply_email_reserve_as('00000000-0000-4000-8000-000000000963',p,h) from em$$,'changed_since_yes','an edit after the yes needs a new yes');
update career_watch_kv set value=value||jsonb_build_object('payload_hash',(select h from em)) where user_id='00000000-0000-4000-8000-000000000963' and key='career:email-card';
update career_watch_kv set value=value||'{"daily_limit":1}' where user_id='00000000-0000-4000-8000-000000000963' and key='career:account';
insert into career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash)
 values('00000000-0000-4000-8000-000000000963','TEST-MAIL-0','Other Employer','https://x.example.test/0','{}',repeat('1',64),repeat('1',64));
select t.must_fail($$select career_apply_email_reserve_as('00000000-0000-4000-8000-000000000963',p,h) from em$$,'daily_cap','an emailed application counts in the daily limit');
update career_watch_kv set value=value||'{"daily_limit":25}' where user_id='00000000-0000-4000-8000-000000000963' and key='career:account';
create temp table res as select * from career_apply_email_reserve_as('00000000-0000-4000-8000-000000000963',(select p from em),(select h from em));
select t.ok((select state='driving' and source='email' and attempts=1 and payload_hash=(select h from em) from res),'the yes reserves one tracked row, source email');
select t.ok((select value->>'state'='sending' from career_watch_kv where user_id='00000000-0000-4000-8000-000000000963' and key='career:email-card'),'the card is spent');
select t.must_fail($$select career_apply_email_reserve_as('00000000-0000-4000-8000-000000000963',p,h) from em$$,'changed_since_yes','one yes, one send');
select t.ok((select state='submitted_unconfirmed' from career_apply_email_finish_as('00000000-0000-4000-8000-000000000963',(select id from res),(select lease_token from res),'submitted_unconfirmed','{"sent":true}')),'the send is recorded; the employer''s reply confirms it');
select t.ok((select value->>'state'='sent' from career_watch_kv where user_id='00000000-0000-4000-8000-000000000963' and key='career:email-card'),'the card says sent');
-- A send Gmail refused (nothing went) may be tried again on a fresh yes to the email shown again: the same tracked
-- application, driving again under a new lease (architect review: it was refused forever as a duplicate).
create temp table em2 as select p||'{"job_id":"TEST-MAIL-2","company":"Mail Employer Two"}'::jsonb p from em;
alter table em2 add column h text;
update em2 set h=encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
update career_watch_kv set value=jsonb_build_object('id','card-2','state','shown','payload_hash',(select h from em2),'shown_at',now(),'payload',(select p from em2))
 where user_id='00000000-0000-4000-8000-000000000963' and key='career:email-card';
create temp table res2 as select * from career_apply_email_reserve_as('00000000-0000-4000-8000-000000000963',(select p from em2),(select h from em2));
select career_apply_email_finish_as('00000000-0000-4000-8000-000000000963',(select id from res2),(select lease_token from res2),'not_submitted','{"reason":"send: HTTP 400"}');
update career_watch_kv set value=value||'{"id":"card-3","state":"shown"}' where user_id='00000000-0000-4000-8000-000000000963' and key='career:email-card';
create temp table res3 as select * from career_apply_email_reserve_as('00000000-0000-4000-8000-000000000963',(select p from em2),(select h from em2));
select t.ok((select r3.id=r2.id and r3.state='driving' and r3.lease_token<>r2.lease_token from res3 r3, res2 r2),'a refused send is tried again on a fresh yes: the same application, a new lease');
select t.ok((select count(*)=1 from career_apply_jobs where job_id='TEST-MAIL-2'),'still one application per posting');
select career_apply_email_finish_as('00000000-0000-4000-8000-000000000963',(select id from res3),(select lease_token from res3),'submitted_unconfirmed','{"sent":true}');
reset role;

-- Questions pushed: once, a day at most, open ones never pushed before, as the thread's last word.
insert into career_apply_questions(user_id,key,kind,label,type) values
 ('00000000-0000-4000-8000-000000000961','fact:sponsorship','fact','Will you require sponsorship?','select'),
 ('00000000-0000-4000-8000-000000000961','fact:start_date','fact','When can you start?','input_text'),
 ('00000000-0000-4000-8000-000000000961','fact:relocation','fact','Are you open to relocation?','select');
update career_apply_questions set state='answered',answer='No' where key='fact:relocation' and user_id='00000000-0000-4000-8000-000000000961';
create temp table qs as select array_agg(id order by key desc) filter (where state='open') open_ids, array_agg(id) filter (where state='answered') done from career_apply_questions where user_id='00000000-0000-4000-8000-000000000961';
grant select on qs to service_role;
set role service_role;
select t.ok(not career_apply_questions_push_as('00000000-0000-4000-8000-000000000961',(select done from qs),'1. Are you open to relocation?'),'an answered question is never pushed');
select t.ok(not career_apply_questions_push_as('00000000-0000-4000-8000-000000000961',(select open_ids from qs),'1. Will you require sponsorship?'),'a text that does not carry every question pushes nothing (and never fails the run)');
select t.ok(career_apply_questions_push_as('00000000-0000-4000-8000-000000000961',(select open_ids from qs),E'2 questions\n1. Will you require sponsorship?\n2. When can you start?'),'open questions are pushed');
reset role;
select t.ok((select meta->>'intent'='career_apply_questions' from agent_messages where thread_id='00000000-0000-4000-8000-0000000009c1' order by id desc limit 1),'the push is the thread''s last word, with the questions intent');
select t.ok((select value->>'thread'='00000000-0000-4000-8000-0000000009c1' and jsonb_array_length(value->'ids')=2 from career_watch_kv where user_id='00000000-0000-4000-8000-000000000961' and key='career:questions-shown'),'the questions shown are recorded, so the numbered answers route');
select t.ok((select count(*)=1 from career_outbox where user_id='00000000-0000-4000-8000-000000000961' and kind='questions'),'one text');
-- Even with the questions never pushed and the thread moved on, a second questions text the same day is refused.
update career_apply_questions set pushed_at=null where user_id='00000000-0000-4000-8000-000000000961';
insert into agent_messages(thread_id,role,content,meta) values('00000000-0000-4000-8000-0000000009c1','assistant','Here are three jobs.','{"intent":"agent"}');
set role service_role;
select t.ok(not career_apply_questions_push_as('00000000-0000-4000-8000-000000000961',(select open_ids from qs),E'1. Will you require sponsorship?\n2. When can you start?'),'at most one questions text a day');
reset role;

-- A label with a no-break space (U+00A0) is matched as the formatter writes it (one plain space), so it is pushed.
reset role;
insert into career_apply_questions(user_id,key,kind,label,type) values
 ('00000000-0000-4000-8000-000000000964','fact:over_18','fact','Are you 18'||chr(160)||'or older?','select');
set role service_role;
select t.ok(career_apply_questions_push_as('00000000-0000-4000-8000-000000000964',(select array_agg(id) from career_apply_questions where user_id='00000000-0000-4000-8000-000000000964'),E'One question\n1. Are you 18 or older? (Yes / No)'),'a label with a no-break space is pushed (SQL and the formatter normalize spaces the same way)');
reset role;

-- An ambiguous email: asked once, answered by number.
insert into career_watch_kv(user_id,key,value) values('00000000-0000-4000-8000-000000000963','career:confirm-ask:'||repeat('9',64),
 jsonb_build_object('state','pending','ids',jsonb_build_array((select id from res)),'kind','received','evidence','received: "we received"','mail_at',clock_timestamp()+interval '1 second','company','Mail Employer'));
update career_outbox set created_at=now()-interval '2 hours' where user_id='00000000-0000-4000-8000-000000000963';
set role service_role;
select t.ok(career_apply_confirm_ask_push_as('00000000-0000-4000-8000-000000000963',repeat('9',64),'Which one? 1. Analyst'),'the ask is texted');
select t.ok(not career_apply_confirm_ask_push_as('00000000-0000-4000-8000-000000000963',repeat('9',64),'Which one? 1. Analyst'),'and only once');
select t.must_fail($$select career_apply_confirm_answer_as('00000000-0000-4000-8000-000000000963',repeat('9',64),2)$$,'not_on_list','a number not on the list');
select t.ok((select career_apply_confirm_answer_as('00000000-0000-4000-8000-000000000963',repeat('9',64),1)->>'result')='confirmed','the number confirms that application');
select t.must_fail($$select career_apply_confirm_answer_as('00000000-0000-4000-8000-000000000963',repeat('9',64),1)$$,'no_open_ask','answered once');
reset role;
select t.ok((select meta->>'intent'='career_apply_confirm_which' from agent_messages where thread_id='00000000-0000-4000-8000-0000000009c3' order by id desc limit 1),'the ask is the thread''s last word');
-- One contact per channel (WO-038): a STOP on any of the person's channels stops every push.
insert into channel_contacts(contact,user_id,thread_id,opted_out) values ('tg:96401','00000000-0000-4000-8000-000000000964','00000000-0000-4000-8000-0000000009c4',true);
insert into career_watch_kv(user_id,key,value) values('00000000-0000-4000-8000-000000000964','career:confirm-ask:'||repeat('8',64),
 jsonb_build_object('state','pending','ids','[]'::jsonb,'kind','received','evidence','received','mail_at',now(),'company','X'));
insert into agent_messages(thread_id,role,content,meta) values('00000000-0000-4000-8000-0000000009c4','assistant','ok','{"intent":"agent"}');
set role service_role;
select t.ok(not career_apply_confirm_ask_push_as('00000000-0000-4000-8000-000000000964',repeat('8',64),'Which one?'),'a STOP on another channel stops the push');
reset role;
rollback;
