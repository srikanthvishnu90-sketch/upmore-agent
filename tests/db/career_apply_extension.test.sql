-- WO-031: the browser extension records an application the person approved in it, as a career_apply_jobs row, signed in
-- as them; the hash is the database's own; every queue rule holds; only the owner reads it; it is finished once.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000931','ext-a@example.test'),('00000000-0000-4000-8000-000000000932','ext-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000931'),('00000000-0000-4000-8000-000000000932');
set role service_role;
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000000931','career:account','{"epoch":2,"version":3,"paused":false,"daily_limit":"3"}'),
 ('00000000-0000-4000-8000-000000000932','career:account','{"epoch":0,"version":1,"paused":false}');
reset role;

-- The extension's approval hash (hashApplyPayload over its reviewed payload) and the database's are the same function of
-- the same payload, accents, curly quotes, a backslash and a newline included; tests/architect/wo-031-extension.test.ts
-- pins the same payload and hash on the extension's side.
select t.ok(encode(sha256(convert_to(career_apply_canonical('{"version":1,"source":"extension","user_id":"00000000-0000-4000-8000-000000000931","job_id":"ashby:harvey:977e6184","company":"harvey","url":"https://jobs.ashbyhq.com/harvey/977e6184/application","family":"ashby","fields":[{"name":"_systemfield_name","label":"Legal First and Last Name✱","value":"Test Person","source":"trainee","factId":"text-answer:1","detail":""},{"name":"x","label":"Yes, I’m based in this location — “quotes” \\ back\nline","value":"No, I do not require sponsorship","source":"you","factId":null,"detail":"checked=No"},{"name":"ssn","label":"Social Security Number","value":"[typed by you on the form; never kept by Trainee]","source":"you","factId":null,"detail":""}],"resume_name":"résumé.pdf","resume_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","privacy_epoch":2,"account_version":3,"expires_at":"2026-10-20T12:00:00.000Z"}'::jsonb),'UTF8')),'hex')
 = '135758525121be33e9b3157064d35c75e1f2986056a436d7f3d593a1eaf1b21b', 'the extension''s approval hash is the database''s own');

create temp table ext_p as select jsonb_build_object('version',1,'source','extension','user_id','00000000-0000-4000-8000-000000000931',
 'job_id','lever:testco:11111111-aaaa','company','Test Co','url','https://jobs.lever.co/testco/11111111-aaaa/apply','family','lever',
 'fields',jsonb_build_array(jsonb_build_object('name','name','label','Full name','value','TEST Person','source','trainee','factId','text-answer:1')),
 'resume_name','test.pdf','resume_sha256',repeat('a',64),'privacy_epoch',2,'account_version',3,'expires_at',(now()+interval '2 hours')::text) as p;
create temp table ext_h as select encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex') as h from ext_p;
-- Variants of the same application, each with its own hash (computed here: the canonical form is not the person's to call).
create temp table ext_v as select name, q as p, encode(sha256(convert_to(career_apply_canonical(q),'UTF8')),'hex') as h from (
 select 'stale' as name, p||'{"privacy_epoch":1}' as q from ext_p union all
 select 'same_company', p||'{"job_id":"lever:testco:22222222-bbbb"}' from ext_p union all
 select 'other', p||'{"job_id":"greenhouse:other:1","company":"Other Co"}' from ext_p union all
 select 'third', p||'{"job_id":"ashby:third:1","company":"Third Co"}' from ext_p union all
 select 'fourth', p||'{"job_id":"ashby:fourth:1","company":"Fourth Co"}' from ext_p union all
 select 'fifth', p||'{"job_id":"ashby:fifth:1","company":"Fifth Co"}' from ext_p union all
 select 'sixth', p||'{"job_id":"ashby:sixth:1","company":"Sixth Co"}' from ext_p) x;
grant select on ext_p, ext_h, ext_v to authenticated, anon;

-- Refusals: not signed in, anon, someone else's payload, a hash that is not this payload's, not from the extension.
set role authenticated;
select t.must_fail($$select career_apply_extension_begin_own((select p from ext_p),(select h from ext_h))$$,'not signed in','a browser that is not signed in records nothing');
reset role;
set role anon;
select t.must_fail($$select career_apply_extension_begin_own((select p from ext_p),(select h from ext_h))$$,'permission denied','anon cannot call it');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000932');set role authenticated;
select t.must_fail($$select career_apply_extension_begin_own((select p from ext_p),(select h from ext_h))$$,'not your application','B cannot record A''s application');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000931');set role authenticated;
select t.must_fail($$select career_apply_extension_begin_own((select p from ext_p),repeat('b',64))$$,'invalid or stale application approval','an approval of another payload is refused');
select t.must_fail($$select career_apply_extension_begin_own((select p||'{"source":"desktop"}' from ext_p),(select h from ext_h))$$,'invalid extension application','only the extension''s own payload');
select t.must_fail($$select career_apply_extension_begin_own((select p||'{"url":"http://jobs.lever.co/x"}' from ext_p),(select h from ext_h))$$,'invalid extension application','only https postings');
-- A stale account (the privacy epoch moved) is refused by the queue's own rule.
select t.must_fail($$select career_apply_extension_begin_own(p, h) from ext_v where name='stale'$$,'stale','a card made before the account changed is refused');

-- The approved application: one row, already a claimed drive, the database's hash, readable by A only.
create temp table ext_row as select career_apply_extension_begin_own((select p from ext_p),(select h from ext_h)) as r;
select t.ok((select (r->>'payload_hash')=(select h from ext_h) and (r->>'id') is not null and (r->>'lease') is not null from ext_row),'begin returns the row, its lease and the database''s own hash');
select t.ok((select count(*)=1 and bool_and(state='driving' and attempts=1 and payload_hash=approval_hash) from career_apply_jobs),'A reads one driving row of A''s');
select t.must_fail($$select career_apply_extension_begin_own((select p from ext_p),(select h from ext_h))$$,'duplicate_job','the same posting twice is refused');
select t.ok((select count(*)=0 from career_apply_claim_own(6)),'no worker claims the extension''s drive');
reset role;
grant select on ext_row to authenticated;
select t.as_user('00000000-0000-4000-8000-000000000932');set role authenticated;
select t.ok((select count(*)=0 from career_apply_jobs),'B reads none of A''s rows');
select t.must_fail($$select career_apply_finish_own((r->>'id')::uuid,(r->>'lease')::uuid,'confirmed','{}') from ext_row$$,'invalid apply claim','B cannot finish A''s drive');
reset role;

-- A records the employer's answer, once.
select t.as_user('00000000-0000-4000-8000-000000000931');set role authenticated;
select t.ok((select state='confirmed' and confirmation_id='TEST-12345' from career_apply_finish_own((select (r->>'id')::uuid from ext_row),(select (r->>'lease')::uuid from ext_row),'confirmed',
 '{"reason":"employer confirmation on the page","confirmation_id":"TEST-12345","source":"extension","screenshot_sha256":"00"}')),'A records the employer''s confirmation and the evidence');
select t.must_fail($$select career_apply_finish_own((r->>'id')::uuid,(r->>'lease')::uuid,'failed','{}') from ext_row$$,'invalid apply transition','a finished application cannot be rewritten');
-- One per company per 30 days, through the same queue rule.
select t.must_fail($$select career_apply_extension_begin_own(p, h) from ext_v where name='same_company'$$,'company_cooldown','the same company again within 30 days is refused');
reset role;

-- Only an attempt stopped BEFORE the click can be tried again (WO-031 review: a posting reached an employer twice). A row
-- that passed the click is never replaced, whatever its state: failed, or not_submitted for any other reason.
select t.as_user('00000000-0000-4000-8000-000000000931');set role authenticated;
create temp table ext_two as select career_apply_extension_begin_own(p, h) as r from ext_v where name='other';
select career_apply_finish_own((r->>'id')::uuid,(r->>'lease')::uuid,'not_submitted','{"reason":"stopped before the click"}') from ext_two;
create temp table ext_two_again as select career_apply_extension_begin_own(p, h) as r from ext_v where name='other';
select t.ok((select (r->>'id') is not null from ext_two_again),'an attempt stopped before the click can be approved again');
select t.ok((select count(*)=1 from career_apply_jobs where job_id='greenhouse:other:1'),'and replaces the stopped one');
select career_apply_finish_own((r->>'id')::uuid,(r->>'lease')::uuid,'failed','{"reason":"the form showed an error after the click"}') from ext_two_again;
select t.must_fail($$select career_apply_extension_begin_own(p, h) from ext_v where name='other'$$,'duplicate_job','a failed attempt passed the click: never sent again');
create temp table ext_three as select career_apply_extension_begin_own(p, h) as r from ext_v where name='third';
select career_apply_finish_own((r->>'id')::uuid,(r->>'lease')::uuid,'not_submitted','{"reason":"nothing changed on the page"}') from ext_three;
select t.must_fail($$select career_apply_extension_begin_own(p, h) from ext_v where name='third'$$,'duplicate_job','a not_submitted without the before-click reason is never retried');
-- The person's own daily limit (3 here): Test Co (confirmed), Fourth and Fifth (driving); Sixth is refused.
select career_apply_extension_begin_own(p, h) from ext_v where name='fourth';
select career_apply_extension_begin_own(p, h) from ext_v where name='fifth';
select t.must_fail($$select career_apply_extension_begin_own(p, h) from ext_v where name='sixth'$$,'daily_cap','the person''s own daily limit holds');
reset role;

-- A drive the extension never finished is unknown at the next own claim, never re-driven.
update career_apply_jobs set claimed_at=now()-interval '16 minutes' where job_id='ashby:fourth:1';
select t.as_user('00000000-0000-4000-8000-000000000931');set role authenticated;
select t.ok((select count(*)=0 from career_apply_claim_own(6)),'nothing is re-driven');
reset role;
select t.ok((select state='unknown_outcome' from career_apply_jobs where job_id='ashby:fourth:1'),'an unfinished extension drive is unknown, never resent');
rollback;
