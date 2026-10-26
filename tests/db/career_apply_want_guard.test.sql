-- FEATURE 1 (20261026100001_career_apply_want_guard.sql): the chat's apply queue write holds the 30-day employer rule in
-- the database; a posting already queued stays as it was; the queue takes what is asked (the pace binds at approval).
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000f1','fg1@example.com'),('00000000-0000-0000-0000-0000000000f2','fg2@example.com');
insert into public.profiles(id) values('00000000-0000-0000-0000-0000000000f1'),('00000000-0000-0000-0000-0000000000f2') on conflict do nothing;
set role service_role;
insert into public.career_watch_kv(user_id,key,value) values
 ('00000000-0000-0000-0000-0000000000f1','career:account','{"epoch":0,"version":0,"paused":false,"daily_limit":"2"}'),
 ('00000000-0000-0000-0000-0000000000f2','career:account','{"epoch":0,"version":0,"paused":false}');
-- f1 applied to Prior Co 10 days ago (the one ledger counts a submitted queue job).
reset role;
insert into public.career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash,state,created_at)
 values('00000000-0000-0000-0000-0000000000f1','greenhouse:prior:1','Prior Co','https://boards.greenhouse.io/prior/jobs/1','{}',repeat('a',64),repeat('a',64),'submitted_unconfirmed',now() - interval '10 days');
set role service_role;
create temp table r1 as select public.career_apply_want_put_for('00000000-0000-0000-0000-0000000000f1',
 '[{"posting_key":"greenhouse:prior:2","url":"https://job-boards.greenhouse.io/prior/jobs/2","company":"Prior Co, Inc.","title":"Analyst"},
   {"posting_key":"greenhouse:a:1","url":"https://job-boards.greenhouse.io/a/jobs/1","company":"A Co","title":"Analyst"},
   {"posting_key":"greenhouse:b:1","url":"https://job-boards.greenhouse.io/b/jobs/1","company":"B Co","title":"Analyst"},
   {"posting_key":"greenhouse:c:1","url":"https://job-boards.greenhouse.io/c/jobs/1","company":"C Co","title":"Analyst"}]'::jsonb) as v;
select t.ok((select v->'added' = '["greenhouse:a:1","greenhouse:b:1","greenhouse:c:1"]'::jsonb from r1), 'the three other employers are added');
select t.ok((select v->'refused' @> '[{"posting_key":"greenhouse:prior:2","reason":"company_cooldown"}]'::jsonb from r1),
 'an employer applied to 10 days ago is refused company_cooldown, its name compared as the ledger compares it');
select t.ok((select jsonb_array_length(v->'refused')=1 from r1), 'only that one is refused');
select t.ok((select count(*)=3 from public.career_apply_wanted where user_id='00000000-0000-0000-0000-0000000000f1'), 'only the three are in the queue');
-- A posting already queued is neither added again nor refused.
create temp table r2 as select public.career_apply_want_put_for('00000000-0000-0000-0000-0000000000f1',
 '[{"posting_key":"greenhouse:a:1","url":"https://job-boards.greenhouse.io/a/jobs/1","company":"A Co","title":"Analyst"}]'::jsonb) as v;
select t.ok((select v->'added' = '[]'::jsonb and v->'refused' = '[]'::jsonb from r2), 'already queued: unchanged, not refused');
-- No product number: thirty in a day are taken.
create temp table r3 as select public.career_apply_want_put_for('00000000-0000-0000-0000-0000000000f2',
 (select jsonb_agg(jsonb_build_object('posting_key','greenhouse:n:'||i,'url','https://job-boards.greenhouse.io/n/jobs/'||i,'company','N'||i||' Co','title','Analyst')) from generate_series(1,30) i)) as v;
select t.ok((select jsonb_array_length(v->'added')=30 and v->'refused' = '[]'::jsonb from r3), 'thirty in a day are all queued');
-- The write approves, prepares and sends nothing.
select t.ok((select count(*)=1 from public.career_apply_jobs) and (select count(*)=0 from public.career_apply_prepared), 'nothing approved or prepared by the queue write');
rollback;
