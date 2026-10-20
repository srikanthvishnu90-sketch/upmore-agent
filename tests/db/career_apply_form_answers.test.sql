-- WO-042: answers the person typed on the employer's form and approved are kept for later forms (ask once), and an
-- application recorded by the extension carries source 'extension' (the gate counts it).
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000a41','form-a@example.test'),('00000000-0000-4000-8000-000000000a42','form-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000a41'),('00000000-0000-4000-8000-000000000a42');
set role service_role;
insert into career_watch_kv(user_id,key,value) values ('00000000-0000-4000-8000-000000000a41','career:account','{"epoch":0,"version":1,"paused":false}');
reset role;

-- Refusals: not signed in, anon, bad shapes.
set role authenticated;
select t.must_fail($$select career_apply_questions_answer_from_form_own('lever:x:1','[]')$$,'not signed in','a browser that is not signed in keeps nothing');
reset role;
set role anon;
select t.must_fail($$select career_apply_questions_answer_from_form_own('lever:x:1','[]')$$,'permission denied','anon cannot call it');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000a41');set role authenticated;
select t.must_fail($$select career_apply_questions_answer_from_form_own('', '[]')$$,'invalid answers','a posting is required');
select t.must_fail($$select career_apply_questions_answer_from_form_own('lever:x:1', '{}')$$,'invalid answers','answers are an array');
select t.must_fail($$select career_apply_questions_answer_from_form_own('lever:x:1', '[{"key":"ssn","answer":"1"}]')$$,'invalid answer','only the ask-once keys');
select t.must_fail($$select career_apply_questions_answer_from_form_own('lever:x:1', '[{"key":"fact:relocation","answer":"   "}]')$$,'invalid answer','an empty answer is not kept');

-- The posting raised three questions (put_own, as the extension does after its fill).
select t.ok(career_apply_questions_put_own('lever:x:1', '[{"key":"fact:relocation","kind":"fact","label":"Willing to relocate?","type":"multi_value_single_select","options":["Yes","No"]},
 {"key":"label:00000000000000aa","kind":"unknown","label":"Favourite colour","type":"input_text"},
 {"key":"job:00000000000000bb","kind":"essay","label":"Why us?","type":"textarea"}]') = 3, 'the posting''s three questions are open');
-- Another posting's open question, and one already answered by text.
select t.ok(career_apply_questions_put_own('lever:y:2', '[{"key":"label:00000000000000cc","kind":"unknown","label":"Shirt size","type":"input_text"}]') = 1, 'another posting''s question');
select t.ok(career_apply_questions_put_own('lever:x:1', '[{"key":"fact:sponsorship","kind":"fact","label":"Need sponsorship?","type":"input_text"}]') = 1, 'one more of this posting');
reset role;
update career_apply_questions set state='answered', answer='No', answered_at=now() where key='fact:sponsorship';
select t.as_user('00000000-0000-4000-8000-000000000a41');set role authenticated;

select t.ok(career_apply_questions_answer_from_form_own('lever:x:1', '[{"key":"fact:relocation","kind":"fact","label":"Willing to relocate?","answer":"Yes"},
 {"key":"label:00000000000000aa","kind":"unknown","label":"Favourite colour","answer":"  blue "},
 {"key":"label:00000000000000cc","kind":"unknown","label":"Shirt size","answer":"M"},
 {"key":"fact:sponsorship","kind":"fact","label":"Need sponsorship?","answer":"Yes"}]') = 2, 'two kept: this posting''s open questions only');
select t.ok((select answer='Yes' and state='answered' and answered_at is not null from career_apply_questions where key='fact:relocation'), 'a fact answered on the form is kept');
select t.ok((select answer='blue' from career_apply_questions where key='label:00000000000000aa'), 'trimmed');
select t.ok((select state='open' and answer is null from career_apply_questions where key='label:00000000000000cc'), 'another posting''s question is not answered from this form');
select t.ok((select answer='No' from career_apply_questions where key='fact:sponsorship'), 'an answer given by text is never replaced');
select t.ok((select state='open' from career_apply_questions where key='job:00000000000000bb'), 'a question the person left alone stays open');
-- The answers read back as confirmed facts for the next form.
select t.ok((select count(*)=3 from career_apply_answers_own()), 'the next form reads three answers back');
-- A question the posting raised that was never stored (its store failed) is kept as answered, under this posting.
select t.ok(career_apply_questions_answer_from_form_own('lever:z:3', '[{"key":"label:00000000000000dd","kind":"unknown","label":"Pronouns","type":"input_text","answer":"they/them"}]') = 1, 'a missing row is created answered');
select t.ok((select state='answered' and 'lever:z:3' = any(job_ids) and label='Pronouns' from career_apply_questions where key='label:00000000000000dd'), 'with its posting and label');
-- Twice is the same as once.
select t.ok(career_apply_questions_answer_from_form_own('lever:x:1', '[{"key":"fact:relocation","kind":"fact","label":"Willing to relocate?","answer":"No"}]') = 0, 'an answered question is not changed by a later form');
select t.ok((select answer='Yes' from career_apply_questions where key='fact:relocation'), 'still the first answer');
reset role;
-- B reads none of A's.
select t.as_user('00000000-0000-4000-8000-000000000a42');set role authenticated;
select t.ok((select count(*)=0 from career_apply_answers_own()), 'B reads none of A''s answers');
select t.ok(career_apply_questions_answer_from_form_own('lever:x:1', '[{"key":"fact:relocation","kind":"fact","label":"Willing to relocate?","answer":"No"}]') = 1, 'B keeps B''s own');
reset role;
select t.ok((select count(*)=2 from career_apply_questions where key='fact:relocation'), 'one row each, A''s untouched');
select t.ok((select answer='Yes' from career_apply_questions where key='fact:relocation' and user_id='00000000-0000-4000-8000-000000000a41'), 'A''s answer is still A''s');

-- The extension's application row carries source 'extension'.
create temp table fx_p as select jsonb_build_object('version',1,'source','extension','user_id','00000000-0000-4000-8000-000000000a41',
 'job_id','lever:testco:33333333-cccc','company','Form Co','url','https://jobs.lever.co/testco/33333333-cccc/apply','family','lever',
 'fields',jsonb_build_array(jsonb_build_object('name','name','label','Full name','value','TEST Person','source','trainee','factId','text-answer:1')),
 'resume_name','test.pdf','resume_sha256',repeat('a',64),'privacy_epoch',0,'account_version',1,'expires_at',(now()+interval '2 hours')::text) as p;
create temp table fx_h as select encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex') as h from fx_p;
grant select on fx_p, fx_h to authenticated;
select t.as_user('00000000-0000-4000-8000-000000000a41');set role authenticated;
select t.ok((select (career_apply_extension_begin_own(p, (select h from fx_h))->>'id') is not null from fx_p), 'begin records the application');
select t.ok((select source='extension' and state='driving' from career_apply_jobs where job_id='lever:testco:33333333-cccc'), 'source extension: the gate counts it once the employer''s email confirms it');
reset role;
rollback;
