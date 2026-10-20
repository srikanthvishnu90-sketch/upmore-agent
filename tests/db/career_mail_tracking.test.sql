-- WO-024 (20261020100000_career_mail_tracking.sql): status events from mail, once per message, read only by their owner,
-- written only by the service role, never holding a long number; drafts once per key; the outbox takes "status" and
-- "followup" and keeps every kind it had.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000951','mail-a@example.test'),('00000000-0000-4000-8000-000000000952','mail-b@example.test');
set role service_role;
insert into career_mail_events(user_id,application_ref,kind,company,role,stage,evidence,message_hash,mail_at) values
 ('00000000-0000-4000-8000-000000000951','job:00000000-0000-4000-8000-0000000009f1','rejection','TEST Employer','Analyst','Rejected',
  'rejection: "not to move forward" in subject "Your application" from example.test',repeat('a',64),now()),
 ('00000000-0000-4000-8000-000000000952','mail:test-employer','interview','TEST Employer',null,'Interview rounds',
  'interview: "invite you to interview" in subject "Next steps" from example.test',repeat('a',64),now());
select t.ok((select count(*)=2 from career_mail_events),'the same message hash is kept once per person, for each person');
select t.must_fail($$insert into career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
 values('00000000-0000-4000-8000-000000000951','job:x','offer','TEST Employer','offer: again',repeat('a',64),now())$$,
 'career_mail_events_once','one message is recorded once per person');
select t.must_fail($$insert into career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
 values('00000000-0000-4000-8000-000000000951','job:x','offer','TEST Employer','your code is 482913',repeat('b',64),now())$$,
 'career_mail_events_evidence_check','evidence holding a long number (an emailed code) is refused');
select t.must_fail($$insert into career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
 values('00000000-0000-4000-8000-000000000951','job:x','offer','TEST Employer',repeat('e',301),repeat('c',64),now())$$,
 'career_mail_events_evidence_check','evidence is 300 characters at most');
select t.must_fail($$insert into career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
 values('00000000-0000-4000-8000-000000000951','job:x','offer','TEST Employer','offer','18c2f1a0b3d4',now())$$,
 'career_mail_events_message_hash_check','a raw Gmail message id is refused; only a sha256 hash is stored');
select t.must_fail($$insert into career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
 values('00000000-0000-4000-8000-000000000951','job:x','newsletter','TEST Employer','x',repeat('d',64),now())$$,
 'career_mail_events_kind_check','"other" mail is never recorded');
insert into career_mail_drafts(user_id,draft_key,application_ref,kind,company,text,basis) values
 ('00000000-0000-4000-8000-000000000951','followup:job:00000000-0000-4000-8000-0000000009f1','job:00000000-0000-4000-8000-0000000009f1',
  'followup','TEST Employer','Hello, I applied on Oct 1 and wanted to follow up.','applied Oct 1; no reply in 14 days');
select t.must_fail($$insert into career_mail_drafts(user_id,draft_key,application_ref,kind,company,text,basis)
 values('00000000-0000-4000-8000-000000000951','followup:job:00000000-0000-4000-8000-0000000009f1','job:x','followup','TEST Employer','again','x')$$,
 'career_mail_drafts_once','a follow-up is drafted once per application');
insert into career_mail_cursors(user_id,read_through) values('00000000-0000-4000-8000-000000000951',now());

select t.as_user('00000000-0000-4000-8000-000000000951');
set role authenticated;
select t.ok((select count(*)=1 and bool_and(company='TEST Employer' and kind='rejection') from career_mail_events),'a person reads only their own status events');
select t.ok((select count(*)=1 from career_mail_drafts),'and their own drafts');
select t.must_fail($$insert into career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
 values('00000000-0000-4000-8000-000000000951','job:x','offer','Me','offer',repeat('f',64),now())$$,'permission denied','a person cannot write a status event');
select t.must_fail($$update career_mail_events set kind='offer'$$,'permission denied','or change one');
select t.must_fail($$delete from career_mail_drafts$$,'permission denied','or remove a draft');
select t.must_fail($$select * from career_mail_cursors$$,'permission denied','the read cursor is not the person''s to read');
select t.as_user('00000000-0000-4000-8000-000000000952');
select t.ok((select count(*)=0 from career_mail_drafts) and (select count(*)=1 from career_mail_events where kind='interview'),'the other person sees only theirs');

reset role;
set role service_role;
insert into career_outbox(user_id,key,kind,text,deliver_at) values
 ('00000000-0000-4000-8000-000000000951','status:'||repeat('a',64),'status','TEST Employer said no (Analyst) on Oct 10. Marked Rejected.',now()),
 ('00000000-0000-4000-8000-000000000951','followup:followup:job:00000000-0000-4000-8000-0000000009f1','followup','No reply from TEST Employer. I drafted a follow-up; it is not sent.',now()),
 ('00000000-0000-4000-8000-000000000951','card:TEST-1','card','a card still queues',now()),
 ('00000000-0000-4000-8000-000000000951','receipt:TEST-1','receipt','a receipt still queues',now()),
 ('00000000-0000-4000-8000-000000000951','alert:TEST-1','alert','an alert still queues',now());
select t.ok((select count(*)=5 from career_outbox where user_id='00000000-0000-4000-8000-000000000951'),'status and follow-up texts queue beside every kind the outbox had');
select t.must_fail($$insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000000951','status:'||repeat('a',64),'status','again',now())$$,
 'career_outbox_once','one status text per message, ever');
select t.must_fail($$insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000000951','mail:1','status','x',now())$$,
 'career_outbox_key_check','a key of any other kind is still refused');
select t.must_fail($$insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000000951','status:2','send_email','x',now())$$,
 'career_outbox_kind_check','no kind sends an email');
insert into career_proactive_runs(run_at,users,alerts,held,reports,duplicates,postings,statuses,followups,ms) values(now(),0,0,0,0,0,0,2,1,1);
select t.ok((select statuses=2 and followups=1 from career_proactive_runs order by id desc limit 1),'a run records its status texts and follow-ups');
reset role;
-- Deleting the account removes every row about it.
delete from auth.users where id='00000000-0000-4000-8000-000000000951';
select t.ok((select count(*)=0 from career_mail_events where user_id='00000000-0000-4000-8000-000000000951')
 and (select count(*)=0 from career_mail_drafts where user_id='00000000-0000-4000-8000-000000000951')
 and (select count(*)=0 from career_mail_cursors where user_id='00000000-0000-4000-8000-000000000951'),'an account deleted takes its mail records with it');
rollback;
