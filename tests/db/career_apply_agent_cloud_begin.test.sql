-- F-030 (20261024140000_career_apply_agent_cloud_begin.sql): a begin made in chat for the cloud worker.
-- career_apply_extension_begin_agent_own delegates to career_apply_extension_begin_own, which stamps the row
-- 'extension', already driving, with the beginner's lease -- so career_apply_cloud_claim_at (queued, source
-- null, attempts 0 only) never takes a chat-begun row, and the stamp would have counted toward the family
-- gate's hand tally. The cloud door runs the same WO-102 contract (one helper, both doors), refuses a payload
-- the claim could never take, and only enqueues: the claim stamps the row 'cloud' itself.
-- CHAIN NOTE (2026-10-22, this branch rebased onto arch/pin-landing-candidate-bridge): the card-cloud bridge
-- (20261024130000, design C9: "card is the only cloud authorization route") re-created the refusal and the
-- claim to require a durable cloud-mode Messages card binding for the exact row/approval; a direct enqueue
-- with no card behind it is refused 'not_card_approved' BY DESIGN (the bridge's own matrix names the case:
-- direct_enqueue_not_card_approved). The claim-phase assertions below therefore characterise the chain as
-- it stands: the door, the contract, the gate and the tallies are asserted at full strength, and the claim
-- itself is asserted to refuse the unbound row -- the composition of the chat begin with the card binding
-- is an open design question (F-030's ledger entry), not something this test decides.
begin;
reset role;
-- O is the owner's gate tester (their hand submissions open the lever gate); A is the person applying in chat.
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000001101','f030-owner@example.test'),('00000000-0000-4000-8000-000000001102','f030-a@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000001101'),('00000000-0000-4000-8000-000000001102');
set role service_role;
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000001101','career:account','{"epoch":2,"version":3,"paused":false}'),
 ('00000000-0000-4000-8000-000000001102','career:account','{"epoch":2,"version":3,"paused":false}');
reset role;
-- A's answered question (the contract's rule 6 reads it back).
insert into career_apply_questions(id,user_id,key,kind,label,type,state,answer,answered_at) values
 ('00000000-0000-4000-8000-0000000011a1','00000000-0000-4000-8000-000000001102','fact:full_name','fact','Full name','text','answered','TEST Person',now());
insert into career_cloud_settings(key,value) values
 ('CAREER_AGENT_SUBMIT','on'),('CAREER_CLOUD_APPLY','on'),
 ('owner_user_id','00000000-0000-4000-8000-000000001101'),
 ('gate_user_ids','{00000000-0000-4000-8000-000000001101}');

-- The approved entry (batchPlan's BatchPosting, as in career_apply_agent_contract.test.sql) and the two payload
-- dialects: the extension's (reviewPayload) and the cloud's (the same answers, its source, the destination the
-- person approved and the engine's approval hash -- the shapes approve-first.ts puts in its payloads). Each
-- posting its own company, as the queue's one-per-company rule counts them separately.
create function pg_temp.ent(job text, co text, q text) returns jsonb language sql as $$
 select jsonb_build_object('version',1,'kind','agent-batch','jobId',job,'company',co,'url','https://jobs.lever.co/testco/'||job||'/apply',
  'answers',jsonb_build_array(
    jsonb_build_object('name','email','label','Email','value','test@example.test','shown','test@example.test','kind','text','factId','F-012','file',null),
    jsonb_build_object('name','name','label','Full name','value','TEST Person','shown','TEST Person','kind','text','factId','text-answer:'||q,'file',null)),
  'blank',jsonb_build_array(),
  'ledger',jsonb_build_array(
    jsonb_build_object('application_id',job,'field_id','email','question_hash',repeat('1',64),'answer_hash',repeat('2',64),
      'fact_refs',jsonb_build_array('F-012'),'source_refs',jsonb_build_array('owner stated this in chat'),'confirmation_event_id','chat:event-12','derivation_rule','verbatim'),
    jsonb_build_object('application_id',job,'field_id','name','question_hash',repeat('3',64),'answer_hash',repeat('4',64),
      'fact_refs',jsonb_build_array('text-answer:'||q),'source_refs',jsonb_build_array('owner answered this question (text-answer:'||q||')'),
      'confirmation_event_id','text-answer:'||q,'derivation_rule','verbatim')),
  'question_set_hash',repeat('5',64),'manifest_hash',repeat('6',64),'quarantine_version','d007-v1')
$$;
create function pg_temp.payext(job text, co text, u text, q text) returns jsonb language sql as $$
 select jsonb_build_object('manifest_hash',repeat('6',64),'quarantine_version','d007-v1','version',1,'source','extension','user_id',u,
  'job_id',job,'company',co,'url','https://jobs.lever.co/testco/'||job||'/apply','family','lever',
  'fields',jsonb_build_array(
    jsonb_build_object('name','email','label','Email','value','test@example.test','source','trainee','factId','F-012','detail',''),
    jsonb_build_object('name','name','label','Full name','value','TEST Person','source','trainee','factId','text-answer:'||q,'detail','')),
  'resume_name',null,'resume_sha256',null,'privacy_epoch',2,'account_version',3,'expires_at',(now()+interval '2 hours')::text)
$$;
create function pg_temp.paycloud(job text, co text, u text, q text) returns jsonb language sql as $$
 select pg_temp.payext(job,co,u,q) || jsonb_build_object('source','cloud',
  'destination','https://jobs.lever.co/testco/'||job||'/apply','engine_approval',repeat('e',64))
$$;
-- A quarantined fact swapped everywhere it stands (the contract must refuse it at either door).
create function pg_temp.swap_e(e jsonb, f text) returns jsonb language sql as $$
 select jsonb_set(jsonb_set(jsonb_set(e,'{answers,1,factId}',to_jsonb(f)),'{ledger,1,fact_refs}',jsonb_build_array(f)),'{ledger,1,confirmation_event_id}',to_jsonb(f))
$$;
create function pg_temp.swap_p(p jsonb, f text) returns jsonb language sql as $$ select jsonb_set(p,'{fields,1,factId}',to_jsonb(f)) $$;

create temp table bc_k as select '00000000-0000-4000-8000-000000001102'::text a, '00000000-0000-4000-8000-0000000011a1'::text qa;
create temp table bc_c(n text primary key, door text not null, e jsonb not null, p jsonb not null);
insert into bc_c(n,door,e,p) select n, door, e, p from bc_k, lateral (values
 ('clext',    'ext',   pg_temp.ent('clext','Ext Co',qa),       pg_temp.payext('clext','Ext Co',a,qa)),
 ('cld',      'cloud', pg_temp.ent('cld','Cloud Co',qa),       pg_temp.paycloud('cld','Cloud Co',a,qa)),
 ('cldnodest','cloud', pg_temp.ent('cldnodest','Nodest Co',qa), pg_temp.paycloud('cldnodest','Nodest Co',a,qa) - 'destination'),
 ('cldnoeng', 'cloud', pg_temp.ent('cldnoeng','Noeng Co',qa),  pg_temp.paycloud('cldnoeng','Noeng Co',a,qa) - 'engine_approval'),
 ('cldext',   'cloud', pg_temp.ent('cldext','Wrongdoor Co',qa), pg_temp.payext('cldext','Wrongdoor Co',a,qa)),
 ('cldq',     'cloud', pg_temp.swap_e(pg_temp.ent('cldq','Quar Co',qa),'F-027'), pg_temp.swap_p(pg_temp.paycloud('cldq','Quar Co',a,qa),'F-027'))
) v(n, door, e, p);
create temp table bc_ch as select n, door, e, p,
 encode(sha256(convert_to(career_apply_canonical(e),'UTF8')),'hex') as bh,
 encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex') as h from bc_c;
grant select on bc_ch to authenticated;

-- A approves every entry (the tap stores each under the database's own hash).
select t.as_user('00000000-0000-4000-8000-000000001102');set role authenticated;
select t.ok(career_apply_batch_approve_own((select jsonb_agg(jsonb_build_object('entry',e,'hash',bh)) from bc_ch)) = 6,
 'A approves all six entries');
reset role;

-- The extension door is unchanged by the new helper: its begin still claims the row for its beginner.
select t.as_user('00000000-0000-4000-8000-000000001102');set role authenticated;
create temp table bc_ext as select career_apply_extension_begin_agent_own(p,h,bh) as r from bc_ch where n='clext';
reset role;
select t.ok((select (r->>'lease') is not null from bc_ext)
 and (select count(*) = 1 and bool_and(state='driving' and source='extension' and attempts=1 and lease_token is not null
   and agent_batch_hash=(select bh from bc_ch where n='clext')) from career_apply_jobs where job_id='clext'),
 'the extension begin still starts driving, stamped extension, with the beginner''s lease');

-- The cloud door runs the same contract first: a quarantined fact is the contract's refusal, not the door's.
select t.as_user('00000000-0000-4000-8000-000000001102');set role authenticated;
select t.must_fail($$select career_apply_cloud_begin_agent_own(p,h,bh) from bc_ch where n='cldq'$$,
 'agent contract: quarantined fact','the cloud door keeps the WO-102 contract (one helper, both doors)');
-- A payload the claim could never take is refused at the door, in its own words.
select t.must_fail($$select career_apply_cloud_begin_agent_own(p,h,bh) from bc_ch where n='cldnodest'$$,
 'agent cloud: destination','a payload with no destination is refused at the door');
select t.must_fail($$select career_apply_cloud_begin_agent_own(p,h,bh) from bc_ch where n='cldnoeng'$$,
 'agent cloud: engine approval','a payload with no engine approval hash is refused at the door');
select t.must_fail($$select career_apply_cloud_begin_agent_own(p,h,bh) from bc_ch where n='cldext'$$,
 'agent cloud: source','the extension''s payload is not begun at the cloud door');
reset role;
select t.ok((select count(*) from career_apply_jobs where job_id in ('cldq','cldnodest','cldnoeng','cldext')) = 0,
 'a refused cloud begin records nothing');
select t.ok((select count(*) = 4 and bool_and(used_at is null and revoked_at is null) from career_apply_batch_approvals
 where job_id in ('cldq','cldnodest','cldnoeng','cldext')), 'every refused approval stays live');

-- The cloud begin itself: the row is only enqueued -- queued, no source, no attempts, no lease.
select t.as_user('00000000-0000-4000-8000-000000001102');set role authenticated;
create temp table bc_row as select career_apply_cloud_begin_agent_own(p,h,bh) as r from bc_ch where n='cld';
select t.ok((select (r->>'id') is not null and (r->>'lease') is null
  and (r->>'payload_hash') = (select h from bc_ch where n='cld') from bc_row), 'the cloud begin returns its row and hash, no lease');
select t.must_fail($$select career_apply_cloud_begin_agent_own(p,h,bh) from bc_ch where n='cld'$$,
 'no live batch approval for this posting','the cloud begin spends the approval once');
reset role;
select t.ok((select count(*) = 1 and bool_and(state='queued' and source is null and attempts=0 and lease_token is null
  and claimed_at is null and approval_hash=payload_hash
  and agent_batch_hash=(select bh from bc_ch where n='cld')) from career_apply_jobs where job_id='cld'),
 'the begun row waits queued, its provenance unwritten, the batch stamped');
select t.ok((select used_at is not null from career_apply_batch_approvals where job_id='cld'), 'the cloud approval is used up');

-- The gate counts hand submissions; A's tally is the gate's own predicate, read for A alone.
create function pg_temp.hand_tally(who text) returns bigint language sql as $$
 select count(*) from public.career_apply_jobs j
  where j.user_id = who::uuid and j.state = 'confirmed' and j.source in ('own_computer','extension')
   and j.email_confirmed_at is not null and j.confirmation_mail_hash is not null
$$;
select t.ok(pg_temp.hand_tally('00000000-0000-4000-8000-000000001102') = 0, 'A has no hand submissions');

-- With the gate closed the claim takes nothing. The refusal names the missing card binding, not the gate:
-- the bridge's refusal checks the binding before the gate (C9), so for an unbound row 'not_card_approved' is
-- the chain's designed first answer in either gate state; the gate itself is asserted on its own predicate.
select t.ok(not career_apply_cloud_open('lever'), 'the lever gate is closed below 3 hand submissions');
select t.ok((select career_apply_cloud_refusal(j, now()) from career_apply_jobs j where job_id='cld') = 'not_card_approved',
 'an unbound begun row is refused not_card_approved (C9: the card is the only cloud authorization route)');
select t.ok((select count(*) from career_apply_cloud_claim_at(6, now())) = 0, 'a closed gate claims nothing');
select t.ok((select state='queued' and source is null from career_apply_jobs where job_id='cld'), 'the row still waits');

-- A turns the cloud on; the gate tester's 3 hand submissions open the family (the cloud test's own seeding).
select career_apply_cloud_optin_as('00000000-0000-4000-8000-000000001102', true, 'TEST terms');
create function pg_temp.confirm(id uuid, kind text, h text) returns void language plpgsql as $$
declare j career_apply_jobs;
begin
 select * into j from career_apply_jobs where career_apply_jobs.id = confirm.id;
 update career_apply_jobs set state='confirmed', email_confirmed_at=now(), confirmation_mail_hash=h where career_apply_jobs.id = confirm.id;
 insert into career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
 values(j.user_id,'job:'||j.id,kind,j.company,kind||': "thank you for applying" from example.test',h,now());
end $$;
create function pg_temp.hand(who text, job text, company text, url text) returns uuid language plpgsql as $$
declare j career_apply_jobs;
begin
 perform set_config('request.jwt.claim.sub',who,true);
 select * into j from career_apply_record_own(job,company,url,'submitted_unconfirmed');
 perform pg_temp.confirm(j.id,'received',encode(sha256(convert_to(job,'UTF8')),'hex'));
 return j.id;
end $$;
select pg_temp.hand('00000000-0000-4000-8000-000000001101','F030-H1','Hand One','https://jobs.lever.co/hone/1');
select pg_temp.hand('00000000-0000-4000-8000-000000001101','F030-H2','Hand Two','https://jobs.lever.co/htwo/2');
select pg_temp.hand('00000000-0000-4000-8000-000000001101','F030-H3','Hand Three','https://jobs.lever.co/hthree/3');
select t.ok(career_apply_cloud_open('lever'), '3 confirmed hand submissions by the gate tester open lever');

-- Begin -> claim, as the chain stands (C9): with the gate OPEN the claim still takes nothing -- the begun
-- row carries no card binding, and the refusal stays 'not_card_approved'. The row is not swept or stamped:
-- it waits exactly as the door left it, so a future binding (the open design question) finds it intact.
create temp table bc_claimed as select * from career_apply_cloud_claim_at(6, now());
select t.ok((select count(*) from bc_claimed) = 0, 'the claim takes no unbound row, gate open or not (C9)');
select t.ok((select career_apply_cloud_refusal(j, now()) from career_apply_jobs j where job_id='cld') = 'not_card_approved',
 'the refusal is still the missing card binding after the gate opens');
select t.ok((select count(*) = 1 and bool_and(state='queued' and source is null and attempts=0 and lease_token is null
  and agent_batch_hash=(select bh from bc_ch where n='cld')) from career_apply_jobs where job_id='cld'),
 'the begun row waits intact: queued, unstamped, its batch hash on it');
select t.ok((select count(*) = 1 and bool_and(state='driving' and source='extension') from career_apply_jobs where job_id='clext'),
 'the extension-begun row is untouched by the claim');

-- Unclaimed, the begun row counts in no tally: not the hand tally (the F-030 lie, fixed) and not the cloud
-- class (nothing was submitted). The gate stands on the tester's hand submissions alone.
select t.ok(pg_temp.hand_tally('00000000-0000-4000-8000-000000001102') = 0,
 'a chat-begun row is not a hand submission');
select t.ok((select count(*) = 0 from career_apply_jobs where user_id='00000000-0000-4000-8000-000000001102'
  and state='confirmed'),
 'nothing of A''s is confirmed: an unclaimed begin submits nothing');
select t.ok(pg_temp.hand_tally('00000000-0000-4000-8000-000000001101') = 3 and career_apply_cloud_open('lever'),
 'the gate still stands on the tester''s 3 hand submissions alone');
select t.must_fail($$update career_apply_jobs set source='cloud' where job_id='clext'$$,'source_fixed',
 'a row whose source is stamped cannot be relabelled (the chain''s own rule: a null source may be stamped once, from queued -- which is the claim''s move, and nobody else''s in any product path)');

-- Grants: the person's door is the person's; the helper is nobody's.
select t.ok(has_function_privilege('authenticated','public.career_apply_cloud_begin_agent_own(jsonb,text,text)','execute')
 and not has_function_privilege('anon','public.career_apply_cloud_begin_agent_own(jsonb,text,text)','execute')
 and not has_function_privilege('service_role','public.career_apply_cloud_begin_agent_own(jsonb,text,text)','execute'),
 'only signed-in people may call the cloud begin');
select t.ok(not has_function_privilege('authenticated','public.career_apply_agent_contract_approval(jsonb,text)','execute')
 and not has_function_privilege('anon','public.career_apply_agent_contract_approval(jsonb,text)','execute')
 and not has_function_privilege('service_role','public.career_apply_agent_contract_approval(jsonb,text)','execute'),
 'the contract helper is internal: granted to no one');
rollback;
