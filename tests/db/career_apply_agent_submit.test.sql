-- WO-101 (A6): the agent submits only what the person approved in a batch, and only while the owner's kill switch is on.
-- The batch approval is stored by the person's own tap under the database's own hash of the exact entry; "Stop applying"
-- revokes every approval not yet used; the start of an agent-approved application is refused while CAREER_AGENT_SUBMIT
-- is anything but 'on', and without a live approval of that posting, which it uses up.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000001011','agent-a@example.test'),('00000000-0000-4000-8000-000000001012','agent-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000001011'),('00000000-0000-4000-8000-000000001012');
set role service_role;
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000001011','career:account','{"epoch":2,"version":3,"paused":false,"daily_limit":"5"}');
reset role;
delete from career_cloud_settings where key = 'CAREER_AGENT_SUBMIT';

-- The extension's batchHash (tests/architect/wo-101-agent-submits.test.ts's batchHash, same canonical SHA-256) and the
-- database's are the same function of the same entry, accents and curly quotes included.
create temp table ag_e as select '{"version":1,"kind":"agent-batch","jobId":"lever:testco:11111111-aaaa","company":"Test Co","url":"https://jobs.lever.co/testco/11111111-aaaa/apply","answers":[{"name":"name","label":"Full name","value":"TEST Person","shown":"TEST Person","kind":"text","factId":"text-answer:1","file":null},{"name":"resume","label":"Resume/CV","value":"résumé.pdf","shown":"résumé.pdf","kind":"file","factId":"f3","file":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"blank":["Anything “else”?"]}'::jsonb as e;
create temp table ag_bh as select encode(sha256(convert_to(career_apply_canonical(e),'UTF8')),'hex') as h from ag_e;
select t.ok((select h from ag_bh) = 'cadc875ee2f82dcdeb5c5f06c6cf95018908a117e47496f4de78f29c4d8092f1', 'the extension''s batch hash is the database''s own');

-- The application payload the extension records for that posting, and its hash.
create temp table ag_p as select jsonb_build_object('version',1,'source','extension','user_id','00000000-0000-4000-8000-000000001011',
 'job_id','lever:testco:11111111-aaaa','company','Test Co','url','https://jobs.lever.co/testco/11111111-aaaa/apply','family','lever',
 'fields',jsonb_build_array(jsonb_build_object('name','name','label','Full name','value','TEST Person','source','trainee','factId','text-answer:1')),
 'resume_name','résumé.pdf','resume_sha256',repeat('a',64),'privacy_epoch',2,'account_version',3,'expires_at',(now()+interval '2 hours')::text) as p;
create temp table ag_h as select encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex') as h from ag_p;
grant select on ag_e, ag_bh, ag_p, ag_h to authenticated, anon;

-- The tap: refused for anon and for a hash that is not the entry's; stored for the person.
set role anon;
select t.must_fail($$select career_apply_batch_approve_own(jsonb_build_array(jsonb_build_object('entry',(select e from ag_e),'hash',(select h from ag_bh))))$$,'permission denied','anon cannot approve a batch');
reset role;
select t.as_user('00000000-0000-4000-8000-000000001011');set role authenticated;
select t.must_fail($$select career_apply_batch_approve_own(jsonb_build_array(jsonb_build_object('entry',(select e from ag_e),'hash',repeat('b',64))))$$,'invalid or stale batch approval','an approval of another entry is refused');
select t.must_fail($$select career_apply_batch_approve_own(jsonb_build_array(jsonb_build_object('entry',(select e||'{"kind":"x"}' from ag_e),'hash',(select h from ag_bh))))$$,'invalid batch entry','only an agent-batch entry');
select t.must_fail($$select career_apply_batch_approve_own(jsonb_build_array(jsonb_build_object('entry',(select e||'{"url":"http://x.test/a"}' from ag_e),'hash',(select h from ag_bh))))$$,'invalid batch entry','only an https posting');
select t.ok(career_apply_batch_approve_own(jsonb_build_array(jsonb_build_object('entry',(select e from ag_e),'hash',(select h from ag_bh))))=1,'the person''s tap stores the approval');
select t.ok((select count(*)=1 and bool_and(revoked_at is null and used_at is null and batch_hash=(select h from ag_bh)) from career_apply_batch_approvals),'A reads A''s one live approval');

-- The owner's kill switch is off (no row): the agent's start is refused, and nothing is recorded or used.
select t.must_fail($$select career_apply_extension_begin_agent_own((select p from ag_p),(select h from ag_h),(select h from ag_bh))$$,'agent submit is off','kill switch absent: refused');
reset role;
insert into career_cloud_settings(key,value) values('CAREER_AGENT_SUBMIT','yes');
select t.as_user('00000000-0000-4000-8000-000000001011');set role authenticated;
select t.must_fail($$select career_apply_extension_begin_agent_own((select p from ag_p),(select h from ag_h),(select h from ag_bh))$$,'agent submit is off','any value but on is off');
select t.ok((select count(*)=0 from career_apply_jobs),'nothing recorded while it is off');
select t.ok((select bool_and(used_at is null) from career_apply_batch_approvals),'and the approval is not used');
-- The person cannot turn it on.
select t.must_fail($$update career_cloud_settings set value='on' where key='CAREER_AGENT_SUBMIT'$$,'permission denied','the person cannot turn the owner''s switch on');
reset role;
update career_cloud_settings set value='on' where key='CAREER_AGENT_SUBMIT';

-- On: B cannot use A's approval; another posting or another batch hash is refused.
select t.as_user('00000000-0000-4000-8000-000000001012');set role authenticated;
select t.must_fail($$select career_apply_extension_begin_agent_own((select p from ag_p),(select h from ag_h),(select h from ag_bh))$$,'no live batch approval','B has no approval of A''s');
select t.ok((select count(*)=0 from career_apply_batch_approvals),'B reads none of A''s approvals');
reset role;
select t.as_user('00000000-0000-4000-8000-000000001011');set role authenticated;
select t.must_fail($$select career_apply_extension_begin_agent_own((select p from ag_p),(select h from ag_h),repeat('c',64))$$,'no live batch approval','another batch hash is refused');
select t.must_fail($$select career_apply_extension_begin_agent_own((select p||'{"job_id":"lever:testco:22222222-bbbb"}' from ag_p),(select h from ag_h),(select h from ag_bh))$$,'no live batch approval','another posting is refused');
-- Every rule of the one-tap start still holds: a payload that is not the approved one's hash is refused, approval kept.
select t.must_fail($$select career_apply_extension_begin_agent_own((select p from ag_p),repeat('d',64),(select h from ag_bh))$$,'invalid or stale application approval','the payload''s own hash still binds');
select t.ok((select bool_and(used_at is null) from career_apply_batch_approvals),'a refused start leaves the approval live');

-- Stop applying: every approval not yet used is revoked; the agent cannot start after it.
select t.ok(career_apply_batch_revoke_own()=1,'Stop applying revokes the live approval');
select t.must_fail($$select career_apply_extension_begin_agent_own((select p from ag_p),(select h from ag_h),(select h from ag_bh))$$,'no live batch approval','after Stop applying nothing starts');

-- Approved again: the start goes once, records the batch hash, and uses the approval up.
select career_apply_batch_approve_own(jsonb_build_array(jsonb_build_object('entry',(select e from ag_e),'hash',(select h from ag_bh))));
create temp table ag_row as select career_apply_extension_begin_agent_own((select p from ag_p),(select h from ag_h),(select h from ag_bh)) as r;
select t.ok((select (r->>'payload_hash')=(select h from ag_h) and (r->>'lease') is not null from ag_row),'the agent''s start returns the row and its lease');
select t.ok((select count(*)=1 and bool_and(state='driving' and source='extension' and agent_batch_hash=(select h from ag_bh)) from career_apply_jobs),'one driving row, marked with the batch it came from');
select t.ok((select count(*)=1 from career_apply_batch_approvals where used_at is not null),'the approval is used up');
select t.must_fail($$select career_apply_extension_begin_agent_own((select p from ag_p),(select h from ag_h),(select h from ag_bh))$$,'no live batch approval','an approval sends at most one application');
reset role;

-- An approval older than 24 hours is not live.
create temp table ag_old as select e||'{"jobId":"lever:testco:33333333-cccc"}' as e, p||'{"job_id":"lever:testco:33333333-cccc"}' as p from ag_e, ag_p;
create temp table ag_oldh as select e, p, encode(sha256(convert_to(career_apply_canonical(e),'UTF8')),'hex') as bh, encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex') as h from ag_old;
grant select on ag_oldh to authenticated;
select t.as_user('00000000-0000-4000-8000-000000001011');set role authenticated;
select career_apply_batch_approve_own(jsonb_build_array(jsonb_build_object('entry',(select e from ag_oldh),'hash',(select bh from ag_oldh))));
reset role;
update career_apply_batch_approvals set approved_at = now() - interval '25 hours' where job_id = 'lever:testco:33333333-cccc';
select t.as_user('00000000-0000-4000-8000-000000001011');set role authenticated;
select t.must_fail($$select career_apply_extension_begin_agent_own(p, h, bh) from ag_oldh$$,'no live batch approval','a day-old approval is not live');
reset role;
rollback;
