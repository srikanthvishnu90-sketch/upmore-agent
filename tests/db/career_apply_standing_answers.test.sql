-- WO-074: a standing answer is kept like any saved answer, under its class key, by the same two functions the answer-once
-- panel already calls; only the four class keys are new, and every other rule holds.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000b74','standing-a@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000b74');
select t.as_user('00000000-0000-4000-8000-000000000b74');set role authenticated;

-- The four class keys are kept; any other standing key, as any other unknown key, is refused.
select t.ok(career_apply_questions_put_own('lever:x:74', '[{"key":"standing:work_rights","kind":"fact","label":"Where may you work without visa sponsorship?","type":"standing","options":[]}]') = 1, 'the panel records the standing question for the posting that raised it');
select t.ok(career_apply_questions_answer_from_form_own('lever:x:74', '[{"key":"standing:work_rights","kind":"fact","label":"Where may you work without visa sponsorship?","type":"standing","answer":"{\"countries\":[\"United States\"],\"complete\":true,\"sponsorshipElsewhere\":\"yes\"}"}]') = 1, 'and keeps the person''s statement');
select t.ok(career_apply_questions_answer_from_form_own('lever:x:74', '[{"key":"standing:office","kind":"fact","label":"Office","type":"standing","answer":"{\"places\":[\"Chicago, IL\"],\"maxDays\":3}"}]') = 1, 'a statement saved without its question row is created answered');
select t.must_fail($$select career_apply_questions_answer_from_form_own('lever:x:74', '[{"key":"standing:salary","kind":"fact","label":"x","answer":"1"}]')$$, 'invalid answer', 'only the four classes');
select t.must_fail($$select career_apply_questions_put_own('lever:x:74', '[{"key":"standing:anything","kind":"fact","label":"x","type":"standing"}]')$$, 'career_apply_questions_key_check', 'the table keeps only the four classes');
select t.must_fail($$select career_apply_questions_answer_from_form_own('lever:x:74', '[{"key":"ssn","answer":"1"}]')$$, 'invalid answer', 'other keys as before');
-- Read back with every other saved answer; a later form never changes it.
select t.ok((select count(*) = 2 from career_apply_answers_own() where key like 'standing:%'), 'read back by the person''s computer');
select t.ok(career_apply_questions_answer_from_form_own('lever:y:75', '[{"key":"standing:office","kind":"fact","label":"Office","answer":"{\"places\":[\"Austin, TX\"],\"maxDays\":5}"}]') = 0, 'an answered statement is not changed by a later form');
select t.ok((select answer like '%Chicago%' from career_apply_questions where key = 'standing:office'), 'still the person''s first statement');
reset role;
rollback;
