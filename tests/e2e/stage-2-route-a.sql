-- E2E skeleton, stage 2 — ROUTE A: the chat begin (module 176's cloud door,
-- career_apply_cloud_begin_agent_own, migration 20261024140000) composed
-- with the cloud claim. Expected from the record (F-030 / C9): the begin
-- enqueues, but the claim refuses the row 'not_card_approved' — a chat
-- begin carries no Messages-card binding, and the card is the only cloud
-- authorization route. Shapes copied from
-- tests/db/career_apply_agent_cloud_begin.test.sql (the F-030 SQL leg).
\set ON_ERROR_STOP on
begin;
-- The chat-begin user's answered question (the WO-102 contract reads it back).
insert into career_apply_questions(id,user_id,key,kind,label,type,state,answer,answered_at) values
 ('00000000-0000-4000-8000-00000000e2a1','00000000-0000-4000-8000-00000000e202',
  'fact:full_name','fact','Full name','text','answered','TEST Person',now());
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
create function pg_temp.paycloud(job text, co text, u text, q text) returns jsonb language sql as $$
 select jsonb_build_object('manifest_hash',repeat('6',64),'quarantine_version','d007-v1','version',1,'source','cloud','user_id',u,
  'job_id',job,'company',co,'url','https://jobs.lever.co/testco/'||job||'/apply','family','lever',
  'fields',jsonb_build_array(
    jsonb_build_object('name','email','label','Email','value','test@example.test','source','trainee','factId','F-012','detail',''),
    jsonb_build_object('name','name','label','Full name','value','TEST Person','source','trainee','factId','text-answer:'||q,'detail','')),
  'resume_name',null,'resume_sha256',null,'privacy_epoch',2,'account_version',3,'expires_at',(now()+interval '2 hours')::text,
  'destination','https://jobs.lever.co/testco/'||job||'/apply','engine_approval',repeat('e',64))
$$;
create temp table ra as
 select pg_temp.ent('e2e-routea','RouteA Co','00000000-0000-4000-8000-00000000e2a1') as e,
        pg_temp.paycloud('e2e-routea','RouteA Co','00000000-0000-4000-8000-00000000e202','00000000-0000-4000-8000-00000000e2a1') as p;
create temp table ra_h as select e, p,
 encode(sha256(convert_to(career_apply_canonical(e),'UTF8')),'hex') as bh,
 encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex') as h from ra;
grant select on ra_h to authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000e202',false);
set role authenticated;
select career_apply_batch_approve_own((select jsonb_agg(jsonb_build_object('entry',e,'hash',bh)) from ra_h)) as approved_count;
create temp table ra_begin as select career_apply_cloud_begin_agent_own(p,h,bh) as r from ra_h;
reset role;
insert into public.e2e_skeleton_state values('routea_begin', (select r from ra_begin));
commit;
select 'ROUTE_A_BEGIN_ID', ((select (r->>'id') is not null from public.e2e_skeleton_state s, lateral (select s.v as r) x where k='routea_begin'))::text;
select 'ROUTE_A_BEGIN_LEASE_NULL', ((select (r->>'lease') is null from public.e2e_skeleton_state s, lateral (select s.v as r) x where k='routea_begin'))::text;
select 'ROUTE_A_ROW', state || '/' || coalesce(source,'null') || '/' || attempts::text
  from career_apply_jobs where job_id='e2e-routea';
select 'ROUTE_A_REFUSAL', career_apply_cloud_refusal(j, now()) from career_apply_jobs j where job_id='e2e-routea';
select 'ROUTE_A_CLAIMED', count(*)::text from career_apply_cloud_claim_at(6, now()) c where c.job_id='e2e-routea';
