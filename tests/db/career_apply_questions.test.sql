-- Ask once (20261020060000_career_apply_questions.sql): the questions that stopped a preparation, stored by the person's
-- own computer, answered by text through the service role acting for that person, read back by their computer. One row
-- per meaning; an answered question comes back open only when a new form's options do not fit it.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000961','ask-a@example.test'),('00000000-0000-4000-8000-000000000962','ask-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000961'),('00000000-0000-4000-8000-000000000962');

select t.as_user('00000000-0000-4000-8000-000000000961');set role authenticated;
select t.ok((select career_apply_questions_put_own('TEST-ASK-1','[
  {"key":"fact:sponsorship","kind":"fact","label":"Will you require sponsorship?","type":"select","options":["Yes","No"],"company":"Ask Employer"},
  {"key":"job:0123456789abcdef","kind":"essay","label":"Why do you want to work here?","type":"textarea","options":[],"company":"Ask Employer"}
]'::jsonb))=2,'the person''s computer stores the questions that stopped a preparation');
select t.ok((select career_apply_questions_put_own('TEST-ASK-2','[{"key":"fact:sponsorship","kind":"fact","label":"Do you need a visa?","type":"select","options":["Yes","No"]}]'::jsonb))=1,'the same meaning from another posting');
select t.ok((select count(*) from career_apply_questions)=2,'is one row, not two');
select t.ok((select job_ids from career_apply_questions where key='fact:sponsorship')=array['TEST-ASK-1','TEST-ASK-2'],'with both postings it holds up');
select t.ok((select label from career_apply_questions where key='fact:sponsorship')='Will you require sponsorship?','and the first wording kept');
select t.must_fail($$select career_apply_questions_put_own('TEST-ASK-3','[{"key":"label:not-a-hash","kind":"unknown","label":"x","type":"text"}]'::jsonb)$$,'career_apply_questions_key_check','a key that is not a fact name or a hash is refused');
select t.must_fail($$select career_apply_questions_put_own('TEST-ASK-3','[{"key":"fact:x","kind":"guess","label":"x","type":"text"}]'::jsonb)$$,'career_apply_questions_kind_check','a kind outside the schema is refused');
select t.must_fail($$select career_apply_questions_put_own('','[]'::jsonb)$$,'invalid questions','a question without a posting is refused');
select t.must_fail($$insert into career_apply_questions(user_id,key,kind,label,type) values('00000000-0000-4000-8000-000000000961','fact:x','fact','x','text')$$,'permission denied','the person cannot write rows directly');
select t.must_fail($$update career_apply_questions set state='answered', answer='No'$$,'permission denied','or answer by editing the table');
select t.ok((select count(*) from career_apply_answers_own())=0,'nothing answered yet');
select t.must_fail($$select career_apply_questions_open_as('00000000-0000-4000-8000-000000000961',5)$$,'permission denied','the texting path is not the person''s to call');
reset role;

-- The texting path, acting for the person who texted.
set role service_role;
select t.ok((select count(*) from career_apply_questions_open_as('00000000-0000-4000-8000-000000000961',5))=2,'the texting path reads their open questions');
select t.ok((select count(*) from career_apply_questions_open_as('00000000-0000-4000-8000-000000000962',5))=0,'and nobody else''s');
select t.must_fail($$select career_apply_question_answer_as('00000000-0000-4000-8000-000000000962',(select id from career_apply_questions where key='fact:sponsorship'),'No')$$,'not your question','an answer for another person''s question is refused');
select t.must_fail($$select career_apply_question_answer_as('00000000-0000-4000-8000-000000000961',(select id from career_apply_questions where key='fact:sponsorship'),'   ')$$,'invalid answer','an empty answer is refused');
select t.ok((select (career_apply_question_answer_as('00000000-0000-4000-8000-000000000961',(select id from career_apply_questions where key='fact:sponsorship'),' No ')).answer='No'),'an answer is saved, trimmed');
select t.ok((select count(*) from career_apply_questions_open_as('00000000-0000-4000-8000-000000000961',5))=1,'and is no longer asked');
reset role;

select t.as_user('00000000-0000-4000-8000-000000000961');set role authenticated;
select t.ok((select array_agg(key) from career_apply_answers_own())=array['fact:sponsorship'],'the person''s computer reads the answer back');
select t.ok((select career_apply_questions_put_own('TEST-ASK-4','[{"key":"fact:sponsorship","kind":"fact","label":"Will you require sponsorship?","type":"select","options":["Yes","No"]}]'::jsonb))=1,'an answered question seen again on a form it fits');
select t.ok((select state from career_apply_questions where key='fact:sponsorship')='answered','stays answered: never asked twice');
select t.ok((select career_apply_questions_put_own('TEST-ASK-5','[{"key":"fact:sponsorship","kind":"fact","label":"Visa status","type":"select","options":["Citizen","Green card","H-1B"],"misfit":true}]'::jsonb))=1,'a form whose options do not fit the answer');
select t.ok((select state='open' and misfit and answer='No' and options='["Citizen","Green card","H-1B"]'::jsonb from career_apply_questions where key='fact:sponsorship'),'reopens it with the new options, the earlier answer kept for the person to see');
select t.ok((select (career_apply_question_answer_own((select id from career_apply_questions where key='fact:sponsorship'),'Citizen')).state='answered'),'the person can answer their own question in the app');
select t.ok((select not misfit from career_apply_questions where key='fact:sponsorship'),'and the misfit clears');
reset role;

select set_config('t.qid',(select id::text from career_apply_questions where key='fact:sponsorship'),false);
select t.as_user('00000000-0000-4000-8000-000000000962');set role authenticated;
select t.ok((select count(*) from career_apply_questions)=0,'another person reads none of these rows');
select t.ok((select count(*) from career_apply_answers_own())=0,'and none of these answers');
select t.must_fail($$select career_apply_question_answer_own(current_setting('t.qid')::uuid,'x')$$,'not your question','nor answers them');
reset role;

-- At most 500 a person.
set role service_role;
insert into career_apply_questions(user_id,key,kind,label,type)
 select '00000000-0000-4000-8000-000000000962','label:'||lpad(to_hex(n),16,'0'),'unknown','Filler '||n,'input_text' from generate_series(1,500) n;
reset role;
select t.as_user('00000000-0000-4000-8000-000000000962');set role authenticated;
select t.must_fail($$select career_apply_questions_put_own('TEST-ASK-6','[{"key":"fact:over_18","kind":"fact","label":"Are you 18?","type":"select"}]'::jsonb)$$,'too many questions','a 501st question is refused');
select t.ok((select career_apply_questions_put_own('TEST-ASK-6','[{"key":"label:0000000000000001","kind":"unknown","label":"Filler 1","type":"input_text"}]'::jsonb))=1,'one already held still updates');
reset role;
rollback;
