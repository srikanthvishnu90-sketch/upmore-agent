-- WO-102 at the agent's start (20261024100000_career_apply_agent_contract.sql): besides the owner's switch, a live
-- approval and every rule of the one-tap start, career_apply_extension_begin_agent_own sends only an approved entry that
-- keeps the submission-quality contract, read from the entry the person approved (career_apply_batch_approvals.entry):
--   1 quarantine version d007-v1        2 the manifest hash, the payload's the same      3 every ledger row complete
--   4 no quarantined fact or source     5 the payload is exactly the approved answers    6 every text answer still theirs
-- Each refusal has its own message, records nothing and leaves the approval live. The entries' hashes are the
-- database's own (career_apply_canonical), as tests/db/career_apply_agent_submit.test.sql pins them to the extension's.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000001021','contract-a@example.test'),('00000000-0000-4000-8000-000000001022','contract-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000001021'),('00000000-0000-4000-8000-000000001022');
set role service_role;
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000001021','career:account','{"epoch":2,"version":3,"paused":false,"daily_limit":"5"}'),
 ('00000000-0000-4000-8000-000000001022','career:account','{"epoch":2,"version":3,"paused":false,"daily_limit":"5"}');
reset role;
-- A's answered question, A's question not (or no longer) answered, B's answered question.
insert into career_apply_questions(id,user_id,key,kind,label,type,state,answer,answered_at) values
 ('00000000-0000-4000-8000-0000000010a1','00000000-0000-4000-8000-000000001021','fact:full_name','fact','Full name','text','answered','TEST Person',now()),
 ('00000000-0000-4000-8000-0000000010a2','00000000-0000-4000-8000-000000001021','fact:middle_name','fact','Middle name','text','open',null,null),
 ('00000000-0000-4000-8000-0000000010b1','00000000-0000-4000-8000-000000001022','fact:full_name','fact','Full name','text','answered','TEST Other',now());
delete from career_cloud_settings where key = 'CAREER_AGENT_SUBMIT';
insert into career_cloud_settings(key,value) values('CAREER_AGENT_SUBMIT','on');

-- The extension's entry (batchPlan's BatchPosting) and payload (reviewPayload) for one posting: two answers, one from a
-- stated fact (F-012), one from the person's text answer `q`; every ledger row complete; the manifest bound in both.
create function pg_temp.ent(job text, q text) returns jsonb language sql as $$
 select jsonb_build_object('version',1,'kind','agent-batch','jobId',job,'company','Test Co','url','https://jobs.lever.co/testco/'||job||'/apply',
  'answers',jsonb_build_array(
    jsonb_build_object('name','email','label','Email','value','test@example.test','shown','test@example.test','kind','text','factId','F-012','file',null),
    jsonb_build_object('name','name','label','Full name','value','TEST Person','shown','TEST Person','kind','text','factId','text-answer:'||q,'file',null)),
  'blank',jsonb_build_array('Anything else?'),
  'ledger',jsonb_build_array(
    jsonb_build_object('application_id',job,'field_id','email','question_hash',repeat('1',64),'answer_hash',repeat('2',64),
      'fact_refs',jsonb_build_array('F-012'),'source_refs',jsonb_build_array('owner stated this in chat'),'confirmation_event_id','chat:event-12','derivation_rule','verbatim'),
    jsonb_build_object('application_id',job,'field_id','name','question_hash',repeat('3',64),'answer_hash',repeat('4',64),
      'fact_refs',jsonb_build_array('text-answer:'||q),'source_refs',jsonb_build_array('owner answered this question (text-answer:'||q||')'),
      'confirmation_event_id','text-answer:'||q,'derivation_rule','verbatim')),
  'question_set_hash',repeat('5',64),'manifest_hash',repeat('6',64),'quarantine_version','d007-v1')
$$;
create function pg_temp.pay(job text, u text, q text) returns jsonb language sql as $$
 select jsonb_build_object('manifest_hash',repeat('6',64),'quarantine_version','d007-v1','version',1,'source','extension','user_id',u,
  'job_id',job,'company','Test Co','url','https://jobs.lever.co/testco/'||job||'/apply','family','lever',
  'fields',jsonb_build_array(
    jsonb_build_object('name','email','label','Email','value','test@example.test','source','trainee','factId','F-012','detail',''),
    jsonb_build_object('name','name','label','Full name','value','TEST Person','source','trainee','factId','text-answer:'||q,'detail','')),
  'resume_name',null,'resume_sha256',null,'privacy_epoch',2,'account_version',3,'expires_at',(now()+interval '2 hours')::text)
$$;
-- One fact swapped everywhere it stands (the answer, the ledger row, the payload field): only rule 4 or 6 is broken.
create function pg_temp.swap_e(e jsonb, f text) returns jsonb language sql as $$
 select jsonb_set(jsonb_set(jsonb_set(e,'{answers,1,factId}',to_jsonb(f)),'{ledger,1,fact_refs}',jsonb_build_array(f)),'{ledger,1,confirmation_event_id}',to_jsonb(f))
$$;
create function pg_temp.swap_p(p jsonb, f text) returns jsonb language sql as $$ select jsonb_set(p,'{fields,1,factId}',to_jsonb(f)) $$;

create temp table ag_c(n text primary key, u text not null, e jsonb not null, p jsonb not null, msg text not null);
create temp table ag_k as select '00000000-0000-4000-8000-000000001021'::text a, '00000000-0000-4000-8000-000000001022'::text b,
 '00000000-0000-4000-8000-0000000010a1'::text qa, '00000000-0000-4000-8000-0000000010a2'::text qopen, '00000000-0000-4000-8000-0000000010b1'::text qb;
insert into ag_c(n,u,e,p,msg) select n, u, e, p, msg from ag_k, lateral (values
 ('clean',           a, pg_temp.ent('clean',qa), pg_temp.pay('clean',a,qa), ''),
 -- 1 the quarantine version
 ('qv-old',          a, pg_temp.ent('qv-old',qa)||'{"quarantine_version":"d006-v1"}', pg_temp.pay('qv-old',a,qa), 'agent contract: quarantine version'),
 ('qv-none',         a, pg_temp.ent('qv-none',qa)-'quarantine_version', pg_temp.pay('qv-none',a,qa), 'agent contract: quarantine version'),
 -- 2 the manifest
 ('mf-differs',      a, pg_temp.ent('mf-differs',qa), pg_temp.pay('mf-differs',a,qa)||jsonb_build_object('manifest_hash',repeat('7',64)), 'agent contract: manifest'),
 ('mf-not-hex',      a, pg_temp.ent('mf-not-hex',qa)||'{"manifest_hash":"not-a-hash"}', pg_temp.pay('mf-not-hex',a,qa)||'{"manifest_hash":"not-a-hash"}', 'agent contract: manifest'),
 ('mf-pay-none',     a, pg_temp.ent('mf-pay-none',qa), pg_temp.pay('mf-pay-none',a,qa)-'manifest_hash', 'agent contract: manifest'),
 ('mf-pay-qv',       a, pg_temp.ent('mf-pay-qv',qa), pg_temp.pay('mf-pay-qv',a,qa)||'{"quarantine_version":"d006-v1"}', 'agent contract: manifest'),
 -- 3 the ledger
 ('lg-no-facts',     a, jsonb_set(pg_temp.ent('lg-no-facts',qa),'{ledger,0,fact_refs}','[]'), pg_temp.pay('lg-no-facts',a,qa), 'agent contract: ledger'),
 ('lg-blank-fact',   a, jsonb_set(pg_temp.ent('lg-blank-fact',qa),'{ledger,0,fact_refs}','[" "]'), pg_temp.pay('lg-blank-fact',a,qa), 'agent contract: ledger'),
 ('lg-no-event',     a, jsonb_set(pg_temp.ent('lg-no-event',qa),'{ledger,0,confirmation_event_id}','""'), pg_temp.pay('lg-no-event',a,qa), 'agent contract: ledger'),
 ('lg-no-rule',      a, pg_temp.ent('lg-no-rule',qa) #- '{ledger,0,derivation_rule}', pg_temp.pay('lg-no-rule',a,qa), 'agent contract: ledger'),
 ('lg-bad-rule',     a, jsonb_set(pg_temp.ent('lg-bad-rule',qa),'{ledger,0,derivation_rule}','"paraphrase"'), pg_temp.pay('lg-bad-rule',a,qa), 'agent contract: ledger'),
 ('lg-row-missing',  a, jsonb_set(pg_temp.ent('lg-row-missing',qa),'{ledger}',(pg_temp.ent('lg-row-missing',qa)->'ledger')-0), pg_temp.pay('lg-row-missing',a,qa), 'agent contract: ledger'),
 ('lg-other-post',   a, jsonb_set(pg_temp.ent('lg-other-post',qa),'{ledger,0,application_id}','"lever:testco:other"'), pg_temp.pay('lg-other-post',a,qa), 'agent contract: ledger'),
 ('lg-none',         a, pg_temp.ent('lg-none',qa)-'ledger', pg_temp.pay('lg-none',a,qa), 'agent contract: ledger'),
 -- 4 a quarantined fact (D-007: F-027..F-079, the answer-all delegation)
 ('qf-f027',         a, pg_temp.swap_e(pg_temp.ent('qf-f027',qa),'F-027'), pg_temp.swap_p(pg_temp.pay('qf-f027',a,qa),'F-027'), 'agent contract: quarantined fact'),
 ('qf-f79',          a, pg_temp.swap_e(pg_temp.ent('qf-f79',qa),'F-79'), pg_temp.swap_p(pg_temp.pay('qf-f79',a,qa),'F-79'), 'agent contract: quarantined fact'),
 ('qf-f050',         a, pg_temp.swap_e(pg_temp.ent('qf-f050',qa),'F-050'), pg_temp.swap_p(pg_temp.pay('qf-f050',a,qa),'F-050'), 'agent contract: quarantined fact'),
 ('qf-delegated',    a, jsonb_set(pg_temp.ent('qf-delegated',qa),'{ledger,0,source_refs}','["Owner-Delegated: fill every form"]'), pg_temp.pay('qf-delegated',a,qa), 'agent contract: quarantined fact'),
 ('qf-answer-all',   a, jsonb_set(pg_temp.ent('qf-answer-all',qa),'{ledger,0,source_refs}','["ANSWER-ALL 2026-10-17"]'), pg_temp.pay('qf-answer-all',a,qa), 'agent contract: quarantined fact'),
 -- 5 the payload is the approved answers, and only them
 ('pl-missing',      a, pg_temp.ent('pl-missing',qa), jsonb_set(pg_temp.pay('pl-missing',a,qa),'{fields}',(pg_temp.pay('pl-missing',a,qa)->'fields')-0), 'agent contract: payload not the approved answers'),
 ('pl-extra',        a, pg_temp.ent('pl-extra',qa), jsonb_set(pg_temp.pay('pl-extra',a,qa),'{fields}',(pg_temp.pay('pl-extra',a,qa)->'fields')||'[{"name":"phone","label":"Phone","value":"5550000","source":"trainee","factId":"F-013","detail":""}]'), 'agent contract: payload not the approved answers'),
 ('pl-fact',         a, pg_temp.ent('pl-fact',qa), jsonb_set(pg_temp.pay('pl-fact',a,qa),'{fields,0,factId}','"F-013"'), 'agent contract: payload not the approved answers'),
 ('pl-page',         a, pg_temp.ent('pl-page',qa), jsonb_set(pg_temp.pay('pl-page',a,qa),'{fields}',(pg_temp.pay('pl-page',a,qa)->'fields')||'[{"name":"city","label":"City","value":"Chicago","source":"page","factId":null,"detail":""}]'), 'agent contract: payload not the approved answers'),
 ('pl-you',          a, pg_temp.ent('pl-you',qa), jsonb_set(pg_temp.pay('pl-you',a,qa),'{fields,1,source}','"you"'), 'agent contract: payload not the approved answers'),
 ('pl-drafted',      a, pg_temp.ent('pl-drafted',qa), jsonb_set(pg_temp.pay('pl-drafted',a,qa),'{fields}',(pg_temp.pay('pl-drafted',a,qa)->'fields')||'[{"name":"why","label":"Why us?","value":"x","source":"drafted","factId":null,"detail":""}]'), 'agent contract: payload not the approved answers'),
 -- 6 every text answer is still the person's own, answered
 ('ta-open',         a, pg_temp.swap_e(pg_temp.ent('ta-open',qa),'text-answer:'||qopen), pg_temp.swap_p(pg_temp.pay('ta-open',a,qa),'text-answer:'||qopen), 'agent contract: withdrawn answer'),
 ('ta-not-uuid',     a, pg_temp.swap_e(pg_temp.ent('ta-not-uuid',qa),'text-answer:1'), pg_temp.swap_p(pg_temp.pay('ta-not-uuid',a,qa),'text-answer:1'), 'agent contract: withdrawn answer'),
 ('ta-others',       a, pg_temp.ent('ta-others',qb), pg_temp.pay('ta-others',a,qb), 'agent contract: withdrawn answer'),
 ('ta-b-uses-a',     b, pg_temp.ent('ta-b-uses-a',qa), pg_temp.pay('ta-b-uses-a',b,qa), 'agent contract: withdrawn answer')
) v(n, u, e, p, msg);
create temp table ag_ch as select n, u, e, p, msg,
 encode(sha256(convert_to(career_apply_canonical(e),'UTF8')),'hex') as bh, encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex') as h from ag_c;
grant select on ag_ch to authenticated;

-- Each person approves their own entries (the tap stores each under the database's own hash).
select t.as_user('00000000-0000-4000-8000-000000001021');set role authenticated;
select t.ok(career_apply_batch_approve_own((select jsonb_agg(jsonb_build_object('entry',e,'hash',bh)) from ag_ch where u='00000000-0000-4000-8000-000000001021'))
 = (select count(*) from ag_ch where u='00000000-0000-4000-8000-000000001021'), 'A approves the clean entry and every broken one');
reset role;
select t.as_user('00000000-0000-4000-8000-000000001022');set role authenticated;
select t.ok(career_apply_batch_approve_own((select jsonb_agg(jsonb_build_object('entry',e,'hash',bh)) from ag_ch where u='00000000-0000-4000-8000-000000001022')) = 1,
 'B approves an entry that names A''s answer');
reset role;

-- The owner's switch still comes first.
update career_cloud_settings set value='off' where key='CAREER_AGENT_SUBMIT';
select t.as_user('00000000-0000-4000-8000-000000001021');set role authenticated;
select t.must_fail($$select career_apply_extension_begin_agent_own(p,h,bh) from ag_ch where n='clean'$$,'agent submit is off','switch off: even a clean entry is refused');
reset role;
update career_cloud_settings set value='on' where key='CAREER_AGENT_SUBMIT';

-- Every broken entry is refused with its own message.
select t.as_user('00000000-0000-4000-8000-000000001021');set role authenticated;
select t.must_fail(format('select career_apply_extension_begin_agent_own(p,h,bh) from ag_ch where n=%L', n), msg, 'refused: '||n||' ('||msg||')')
 from ag_ch where u='00000000-0000-4000-8000-000000001021' and n<>'clean' order by n;
reset role;
select t.as_user('00000000-0000-4000-8000-000000001022');set role authenticated;
select t.must_fail($$select career_apply_extension_begin_agent_own(p,h,bh) from ag_ch where n='ta-b-uses-a'$$,'agent contract: withdrawn answer',
 'refused: B''s start on A''s answer (agent contract: withdrawn answer)');
reset role;
select t.ok((select count(*) from career_apply_jobs where user_id in ('00000000-0000-4000-8000-000000001021','00000000-0000-4000-8000-000000001022')) = 0,
 'nothing is recorded by a refused start');
select t.ok((select count(*) = (select count(*) from ag_ch) and bool_and(used_at is null and revoked_at is null) from career_apply_batch_approvals
 where user_id in ('00000000-0000-4000-8000-000000001021','00000000-0000-4000-8000-000000001022')), 'every refused approval stays live');

-- A text answer withdrawn after the approval stops the clean entry; answered again, it goes.
update career_apply_questions set state='open', answer=null, answered_at=null where id='00000000-0000-4000-8000-0000000010a1';
select t.as_user('00000000-0000-4000-8000-000000001021');set role authenticated;
select t.must_fail($$select career_apply_extension_begin_agent_own(p,h,bh) from ag_ch where n='clean'$$,'agent contract: withdrawn answer','an answer withdrawn after the approval stops it');
reset role;
update career_apply_questions set state='answered', answer='TEST Person', answered_at=now() where id='00000000-0000-4000-8000-0000000010a1';

-- The clean entry goes, once.
select t.as_user('00000000-0000-4000-8000-000000001021');set role authenticated;
create temp table ag_row as select career_apply_extension_begin_agent_own(p,h,bh) as r from ag_ch where n='clean';
select t.ok((select (r->>'payload_hash') = (select h from ag_ch where n='clean') and (r->>'lease') is not null from ag_row), 'the clean entry starts: its row and lease');
select t.ok((select count(*) = 1 and bool_and(state='driving' and source='extension' and job_id='clean' and agent_batch_hash=(select bh from ag_ch where n='clean'))
 from career_apply_jobs), 'one driving row, marked with the batch it came from');
select t.ok((select used_at is not null from career_apply_batch_approvals where job_id='clean'), 'the clean approval is used up');
select t.ok((select count(*) = 0 from career_apply_batch_approvals where job_id<>'clean' and used_at is not null), 'no other approval is used');
select t.must_fail($$select career_apply_extension_begin_agent_own(p,h,bh) from ag_ch where n='clean'$$,'no live batch approval','the clean approval sends once');
reset role;

-- Same signature and grants as 20261024090000.
select t.ok(has_function_privilege('authenticated','public.career_apply_extension_begin_agent_own(jsonb,text,text)','execute')
 and not has_function_privilege('anon','public.career_apply_extension_begin_agent_own(jsonb,text,text)','execute')
 and not has_function_privilege('service_role','public.career_apply_extension_begin_agent_own(jsonb,text,text)','execute'),
 'only signed-in people may call the agent start');
rollback;
