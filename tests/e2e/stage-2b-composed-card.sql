-- E2E skeleton, stage 2b — ROUTE A COMPOSED (F-030 seam, composition A):
-- the stage-2 chat user (e202) takes the SAME kind of approved
-- application through the bridge's machinery instead of the bare
-- begin: the card is shown (career_apply_message_cloud_card_show_as,
-- service-role producer), the person taps (career_apply_message_card_
-- approve_own -> cloud_tap mints the batch approval + the durable
-- binding + the queue row), and career_apply_cloud_claim_at takes the
-- row. The bare-begin row from stage 2 ('e2e-routea') is untouched and
-- stays refused (stage 2's ROUTE_A_REFUSAL marker is the control).
-- The item below is built from stage 2's own approved answers (email
-- F-012 + the person's answered full_name question e2a1), in the
-- bridge's payload dialect — the shape module 176's
-- beginCloudCardPostings verifies and hands to the producer.
\set ON_ERROR_STOP on
begin;
-- The chat user's card-machinery seeds (stage 1 seeded these only for
-- the fixture user cb01): a thread of his own, cloud eligibility, the
-- opt-in at his account epoch (2), a lever gate waiver (the skeleton's
-- mechanism — never fake hand submissions), and his cloud resume at
-- epoch 2 (the repo fixture's synthetic bytes; sha256 verified).
insert into agent_threads(id,user_id,title) values
 ('00000000-0000-4000-8000-00000000e2a2','00000000-0000-4000-8000-00000000e202','E2E chat thread (composed route)');
insert into career_message_approval_private.test_users(user_id)
 values('00000000-0000-4000-8000-00000000e202');
select career_apply_cloud_optin_as('00000000-0000-4000-8000-00000000e202', true, 'E2E synthetic terms');
insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note)
 values('00000000-0000-4000-8000-00000000e202','lever',5,now()+interval '1 day','E2E skeleton synthetic (composed route)');
insert into career_apply_cloud_resumes(user_id,sha256,filename,bytes,privacy_epoch)
 values('00000000-0000-4000-8000-00000000e202',
        'e55e20f79aab716c8a7614b2461b24d439294066367a3d4315ec6e06b610a3d3',
        'synthetic.pdf', decode('JVBERi0xLjQgU1lOVEhFVElDIFRFU1QgUkVTVU1F','base64'), 2);
commit;

-- The card item: payload + readback + the DB's own hash of the payload.
begin;
create temp table ca_payload as
 select jsonb_build_object(
  'version',1,
  'user_id','00000000-0000-4000-8000-00000000e202',
  'job_id','e2e-routea-card',
  'company','RouteA Card Co',
  'url','https://jobs.lever.co/testco/e2e-routea-card/apply',
  'fields', jsonb_build_array(
    jsonb_build_object('name','email','label','Email','value','test@example.test','factId','F-012',
      'provenance','owner stated this in chat','confirmation_event_id','chat:event-12',
      'source',jsonb_build_object('table','answers','key','email','value','test@example.test')),
    jsonb_build_object('name','name','label','Full name','value','TEST Person',
      'factId','text-answer:00000000-0000-4000-8000-00000000e2a1',
      'provenance','owner answered this question (text-answer:00000000-0000-4000-8000-00000000e2a1)',
      'confirmation_event_id','text-answer:00000000-0000-4000-8000-00000000e2a1',
      'source',jsonb_build_object('table','answers','key','full_name','value','TEST Person')),
    jsonb_build_object('name','resume','label','Resume/CV',
      'value','e55e20f79aab716c8a7614b2461b24d439294066367a3d4315ec6e06b610a3d3',
      'factId','approved-local-resume:e55e20f79aab716c8a7614b2461b24d439294066367a3d4315ec6e06b610a3d3',
      'provenance','owner picked this file in the panel',
      'confirmation_event_id','resume:e55e20f79aab716c8a7614b2461b24d439294066367a3d4315ec6e06b610a3d3',
      'source',jsonb_build_object('table','answers','key','resume',
        'value','e55e20f79aab716c8a7614b2461b24d439294066367a3d4315ec6e06b610a3d3'))),
  'destination','https://jobs.lever.co/testco/e2e-routea-card/apply',
  'resume_sha256','e55e20f79aab716c8a7614b2461b24d439294066367a3d4315ec6e06b610a3d3',
  'page_field_names', jsonb_build_array('email','name','resume'),
  'engine_approval', repeat('e',64),
  'schema_hash', repeat('9',64),
  'privacy_epoch', 2,
  'account_version', 3,
  'expires_at', (now()+interval '2 hours')::text,
  'quarantine_version','d007-v1',
  'manifest_hash', repeat('6',64),
  'replay_sources', jsonb_build_array(
    jsonb_build_object('table','answers','key','email','value','test@example.test','factId','F-012',
      'event','chat:event-12','provenance','owner stated this in chat'),
    jsonb_build_object('table','answers','key','full_name','value','TEST Person',
      'factId','text-answer:00000000-0000-4000-8000-00000000e2a1',
      'event','text-answer:00000000-0000-4000-8000-00000000e2a1','provenance','owner answered this question'),
    jsonb_build_object('table','answers','key','resume',
      'value','e55e20f79aab716c8a7614b2461b24d439294066367a3d4315ec6e06b610a3d3',
      'factId','approved-local-resume:e55e20f79aab716c8a7614b2461b24d439294066367a3d4315ec6e06b610a3d3',
      'event','resume:e55e20f79aab716c8a7614b2461b24d439294066367a3d4315ec6e06b610a3d3',
      'provenance','owner picked this file in the panel'))) as p;
create temp table ca_item as
 select jsonb_build_object(
   'payload', p,
   'hash', encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),
   'readback', jsonb_build_object(
     'answers', jsonb_build_array(
       jsonb_build_object('name','email','label','Email','value','test@example.test','shown','test@example.test','factId','F-012','kind','text'),
       jsonb_build_object('name','name','label','Full name','value','TEST Person','shown','TEST Person',
         'factId','text-answer:00000000-0000-4000-8000-00000000e2a1','kind','text'),
       jsonb_build_object('name','resume','label','Resume/CV',
         'value','e55e20f79aab716c8a7614b2461b24d439294066367a3d4315ec6e06b610a3d3','shown','synthetic.pdf',
         'factId','approved-local-resume:e55e20f79aab716c8a7614b2461b24d439294066367a3d4315ec6e06b610a3d3','kind','file')),
     'resume_name','synthetic.pdf',
     'resume_sha256','e55e20f79aab716c8a7614b2461b24d439294066367a3d4315ec6e06b610a3d3',
     'destination','https://jobs.lever.co/testco/e2e-routea-card/apply',
     'blank','[]'::jsonb,
     'employer_fields', jsonb_build_array('email','name','resume'))) as item from ca_payload;
insert into public.e2e_skeleton_state
 select 'routea_item_hash', jsonb_build_object('hash', item->>'hash') from ca_item;
-- Temp tables are session-local and ungranted: the role blocks below
-- read them under set role (stage 3 creates its temp tables inside
-- its role blocks instead; here the item must exist before the show).
grant select on ca_item to service_role, authenticated;
-- The producer shows the card (service role, as in stage 3).
set role service_role;
create temp table ca_card as
 select career_apply_message_cloud_card_show_as(
   '00000000-0000-4000-8000-00000000e202','00000000-0000-4000-8000-00000000e2a2',
   jsonb_build_array((select item from ca_item))) as card;
reset role;
insert into public.e2e_skeleton_state
 select 'routea_card', jsonb_build_object('id', card->>'id', 'hash', card->>'hash') from ca_card;
-- The person's own tap (authenticated as e202): mints the approval,
-- the durable binding, and the queue row.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000e202',false);
set role authenticated;
create temp table ca_receipt as
 select career_apply_message_card_approve_own(
   (select (v->>'id')::uuid from public.e2e_skeleton_state where k='routea_card'),
   (select v->>'hash' from public.e2e_skeleton_state where k='routea_card')) as receipt;
reset role;
insert into public.e2e_skeleton_state select 'routea_receipt', receipt from ca_receipt;
commit;

select 'COMPOSED_CARD_STATE', (select case when approved_at is not null then 'approved' else 'open' end
  from career_apply_message_cards
  where id=(select (v->>'id')::uuid from public.e2e_skeleton_state where k='routea_card'));
select 'COMPOSED_JOB', state || '/' || coalesce(source,'null') || '/' || attempts::text
  from career_apply_jobs where job_id='e2e-routea-card';
select 'COMPOSED_BOUND', count(*)::text from career_message_approval_private.cloud_bound_jobs b
  join career_apply_jobs j on j.id=b.job_row_id
  where j.job_id='e2e-routea-card';
select 'COMPOSED_HASH_BINDING', (payload_hash = (select v->>'hash' from public.e2e_skeleton_state where k='routea_item_hash')
  and approval_hash = payload_hash)::text
  from career_apply_jobs where job_id='e2e-routea-card';
select 'COMPOSED_REFUSAL', coalesce(career_apply_cloud_refusal(j, now()), 'none')
  from career_apply_jobs j where job_id='e2e-routea-card';
-- The timed claim takes the composed row (postgres role, as in stage 3).
begin;
create temp table ca_claimed as select * from career_apply_cloud_claim_at(6, clock_timestamp());
insert into public.e2e_skeleton_state
 select 'routea_claimed', jsonb_build_object('id', id, 'lease_token', lease_token, 'job_id', job_id)
   from ca_claimed where job_id='e2e-routea-card';
commit;
select 'COMPOSED_CLAIMED', count(*)::text from public.e2e_skeleton_state where k='routea_claimed';
select 'COMPOSED_JOB_AFTER_CLAIM', state || '/' || coalesce(source,'null') || '/' || attempts::text
  from career_apply_jobs where job_id='e2e-routea-card';
