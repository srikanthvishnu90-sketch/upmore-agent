-- WO-066: the postings the person asked Trainee to apply to wait in their own queue for the extension; only the chat
-- (service role) writes them, the person reads their own, and the extension marks its own taken.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000661','want-a@example.test'),('00000000-0000-4000-8000-000000000662','want-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000661'),('00000000-0000-4000-8000-000000000662');
set role service_role;
select t.ok((select (career_apply_want_put_for('00000000-0000-4000-8000-000000000661', '[
  {"posting_key":"greenhouse:acme:4000001","url":"https://job-boards.greenhouse.io/acme/jobs/4000001","company":"Acme","title":"Data Analyst"},
  {"posting_key":"lever:acme:0b5c3a1e-1111","url":"https://jobs.lever.co/acme/0b5c3a1e-1111/apply","company":"Acme","title":"Analyst"}]'::jsonb))->'added' = '["greenhouse:acme:4000001","lever:acme:0b5c3a1e-1111"]'::jsonb),'the chat queues two postings for the person');
select t.ok((select (career_apply_want_put_for('00000000-0000-4000-8000-000000000661', '[{"posting_key":"greenhouse:acme:4000001","url":"https://job-boards.greenhouse.io/acme/jobs/4000001"}]'::jsonb))->'added' = '[]'::jsonb),'the same posting is queued once');
select t.must_fail($$select career_apply_want_put_for('00000000-0000-4000-8000-000000000661', '[{"posting_key":"x:y:z","url":"http://insecure.example/1"}]'::jsonb)$$,'violates check constraint','only https links');
reset role;

select t.as_user('00000000-0000-4000-8000-000000000661');set role authenticated;
select t.ok((select count(*)=2 from career_apply_wanted),'the person reads their own two');
select t.must_fail($$select career_apply_want_put_for('00000000-0000-4000-8000-000000000661','[]'::jsonb)$$,'permission denied','the person cannot use the chat''s entry');
select t.must_fail($$insert into career_apply_wanted(user_id,posting_key,url) values('00000000-0000-4000-8000-000000000661','greenhouse:x:1','https://job-boards.greenhouse.io/x/jobs/1')$$,'permission denied','no direct writes');
select t.ok((select career_apply_want_take_own(array['greenhouse:acme:4000001']) = 1),'the extension marks one taken');
select t.ok((select state='taken' and taken_at is not null from career_apply_wanted where posting_key='greenhouse:acme:4000001'),'taken, with the time');
select t.ok((select career_apply_want_take_own(array['greenhouse:acme:4000001']) = 0),'taking it again changes nothing');
reset role;

select t.as_user('00000000-0000-4000-8000-000000000662');set role authenticated;
select t.ok((select count(*)=0 from career_apply_wanted),'another person sees none of them');
select t.ok((select career_apply_want_take_own(array['lever:acme:0b5c3a1e-1111']) = 0),'and cannot take them');
reset role;
select t.ok((select state='waiting' from career_apply_wanted where posting_key='lever:acme:0b5c3a1e-1111'),'still waiting for its owner');

set role anon;
select t.must_fail($$select career_apply_want_take_own(array['x'])$$,'permission denied','anon cannot take');
reset role;
delete from profiles where id='00000000-0000-4000-8000-000000000661';
select t.ok((select count(*)=0 from career_apply_wanted where user_id='00000000-0000-4000-8000-000000000661'),'erased with the person');
rollback;
