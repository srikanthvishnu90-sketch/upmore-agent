-- Ask, never guess (20261024110000): a required field the cloud engine has no confirmed fact for becomes an open
-- career_apply_questions row for the job's own person — the row the texting side asks in Messages and the next
-- preparation reads back as their answer. Only the worker holding the job's live lease can raise it, only for that job's
-- person; the person's computer still writes its own rows (career_apply_questions_put_own) through the same writer.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000b01','ask-a@example.test'),('00000000-0000-4000-8000-000000000b02','ask-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000b01'),('00000000-0000-4000-8000-000000000b02');
insert into career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash,state,attempts,claimed_at,lease_token,source)
values('00000000-0000-4000-8000-000000000b01','lever:test-co:ask-1','Test Co','https://jobs.lever.co/test-co/ask-1','{}',repeat('a',64),repeat('a',64),'driving',1,now(),gen_random_uuid(),'cloud');
create temp table ask_job as select * from career_apply_jobs where job_id='lever:test-co:ask-1';
create temp table ask_q as select '[{"key":"fact:sponsorship","kind":"fact","label":"Will you require visa sponsorship?","type":"select","options":["Yes","No"],"company":"Test Co"},{"key":"label:0123456789abcdef","kind":"screen","label":"Years of experience with SQL","type":"input_text","options":[],"company":"Test Co"}]'::jsonb as q;
grant select on ask_job, ask_q to authenticated, anon, service_role;

-- Only the service worker may call it.
set role anon;
select t.must_fail($$select career_apply_cloud_ask((select id from ask_job),(select lease_token from ask_job),(select q from ask_q))$$,'permission denied','anon cannot raise a question');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000b01');set role authenticated;
select t.must_fail($$select career_apply_cloud_ask((select id from ask_job),(select lease_token from ask_job),(select q from ask_q))$$,'permission denied','a signed-in person cannot raise one through the worker''s door');
reset role;
set role service_role;
select t.must_fail($$select career_apply_cloud_ask((select id from ask_job),gen_random_uuid(),(select q from ask_q))$$,'invalid apply claim','a lease that is not the job''s is refused');
select t.must_fail($$select career_apply_cloud_ask((select id from ask_job),(select lease_token from ask_job),'"x"'::jsonb)$$,'invalid questions','questions are an array');
select t.ok(career_apply_cloud_ask((select id from ask_job),(select lease_token from ask_job),(select q from ask_q))=2,'the worker holding the lease raises both questions');
reset role;
select t.ok((select count(*)=2 and bool_and(state='open' and job_ids=array['lever:test-co:ask-1'] and answer is null) from career_apply_questions where user_id='00000000-0000-4000-8000-000000000b01'),'two open questions for the job''s person, tied to the job, no answer filled in');
select t.ok((select count(*)=0 from career_apply_questions where user_id='00000000-0000-4000-8000-000000000b02'),'nobody else gets them');
select t.ok((select options='["Yes","No"]'::jsonb and type='select' and company='Test Co' from career_apply_questions where key='fact:sponsorship'),'the employer''s own choices and type travel with the question');
-- Raised again for the same job (a retry): asked once, not twice.
set role service_role;
select t.ok(career_apply_cloud_ask((select id from ask_job),(select lease_token from ask_job),(select q from ask_q))=2,'raised again');
reset role;
select t.ok((select count(*)=2 from career_apply_questions where user_id='00000000-0000-4000-8000-000000000b01'),'still two questions: asked once');
-- The texting side's answer is the person's own row, and it is what the next preparation reads back.
select t.as_user('00000000-0000-4000-8000-000000000b01');set role authenticated;
select t.ok((select count(*)=0 from career_apply_answers_own()),'nothing answered yet');
reset role;
select career_apply_question_answer_as('00000000-0000-4000-8000-000000000b01',(select id from career_apply_questions where key='fact:sponsorship'),'No');
select t.as_user('00000000-0000-4000-8000-000000000b01');set role authenticated;
select t.ok((select count(*)=1 and bool_and(key='fact:sponsorship' and answer='No' and answered_at is not null) from career_apply_answers_own()),'the answer comes back as the person''s own, with its time');
-- The person's computer still writes its own rows through the same writer.
select t.ok(career_apply_questions_put_own('greenhouse:test-co:2','[{"key":"label:fedcba9876543210","kind":"screen","label":"Preferred name","type":"input_text","options":[]}]')=1,'put_own unchanged');
reset role;
-- A job no longer driving (finished) cannot raise questions.
update career_apply_jobs set state='not_submitted' where job_id='lever:test-co:ask-1';
set role service_role;
select t.must_fail($$select career_apply_cloud_ask((select id from ask_job),(select lease_token from ask_job),(select q from ask_q))$$,'invalid apply claim','a job that is not driving cannot raise questions');
reset role;
rollback;
