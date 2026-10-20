-- WO-030 (20261020070000_career_apply_questions_ai_policy.sql): the employer's own words about AI help travel with each
-- written question of that posting, are kept when a later preparation does not carry them, and are read back by the
-- texting path with the rest of the question.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000971','ai-a@example.test'),('00000000-0000-4000-8000-000000000972','ai-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000971'),('00000000-0000-4000-8000-000000000972');

select t.as_user('00000000-0000-4000-8000-000000000971');set role authenticated;
select t.ok((select career_apply_questions_put_own('TEST-AI-1','[
  {"key":"job:00000000000000a1","kind":"essay","label":"Describe any publicly listed company experience.","type":"textarea","options":[],"company":"Policy Employer",
   "ai_policy":"During this application process I agree to use only my own words. I understand that plagiarism, the use of AI or other generated content will disqualify my application."},
  {"key":"job:00000000000000a2","kind":"essay","label":"Why us?","type":"textarea","options":[],"company":"Policy Employer"}
]'::jsonb))=2,'the person''s computer stores two written questions, one carrying the form''s AI statement');
select t.ok((select ai_policy from career_apply_questions where key='job:00000000000000a1') like 'During this application process%','the statement is kept with its question');
select t.ok((select ai_policy is null from career_apply_questions where key='job:00000000000000a2'),'a question sent without one has none');
select t.ok((select career_apply_questions_put_own('TEST-AI-1','[{"key":"job:00000000000000a1","kind":"essay","label":"Describe any publicly listed company experience.","type":"textarea"}]'::jsonb))=1,'the same posting prepared again without the statement');
select t.ok((select ai_policy from career_apply_questions where key='job:00000000000000a1') like 'During this application process%','keeps what was read: a policy is never dropped by a form that failed to show it');
select t.ok((select career_apply_questions_put_own('TEST-AI-1','[{"key":"job:00000000000000a2","kind":"essay","label":"Why us?","type":"textarea","ai_policy":"  "}]'::jsonb))=1,'a blank statement');
select t.ok((select ai_policy is null from career_apply_questions where key='job:00000000000000a2'),'is stored as none');
select t.must_fail($$select career_apply_questions_put_own('TEST-AI-2',jsonb_build_array(jsonb_build_object('key','job:00000000000000a3','kind','essay','label','x','type','textarea','ai_policy',repeat('x',1201))))$$,'career_apply_questions_ai_policy_check','a statement over 1,200 characters is refused');
select t.must_fail($$update career_apply_questions set ai_policy='AI is fine'$$,'permission denied','the person cannot rewrite the statement by editing the table');
reset role;

set role service_role;
select t.ok((select ai_policy from career_apply_questions_open_as('00000000-0000-4000-8000-000000000971',5) where key='job:00000000000000a1') like 'During this application process%','the texting path reads it with the open question');
select t.ok((select count(*) from career_apply_questions where user_id='00000000-0000-4000-8000-000000000971' and job_ids && array['TEST-AI-1'])=2,'and every question of that posting by its job id');
reset role;

select t.as_user('00000000-0000-4000-8000-000000000972');set role authenticated;
select t.ok((select count(*) from career_apply_questions)=0,'another person reads none of it');
reset role;
rollback;
