-- E2E skeleton, stage 4 — finish -> employer-confirmed, on the Route B row
-- claimed in stage 3. The worker's finish (career_apply_cloud_finish) with
-- page-confirmation evidence records submitted_unconfirmed; the employer's
-- email then confirms it (career_apply_confirm_as, kind 'received'), which
-- is the only state this product may call a real completion.
-- :confno is the mock employer's confirmation number when the board leg
-- ran, else a synthetic marker (the leg composition is reported as such).
\set ON_ERROR_STOP on
begin;
create temp table fin as
 select career_apply_cloud_finish(
   (select (v->>'id')::uuid from public.e2e_skeleton_state where k='routeb_claimed'),
   (select (v->>'lease_token')::uuid from public.e2e_skeleton_state where k='routeb_claimed'),
   'submitted_unconfirmed',
   jsonb_build_object('page_confirmation', true, 'confirmation_number', :'confno',
     'reason', 'the mock employer confirmation page was reached'),
   'submitted', null) as row_after;
select 'FINISH_STATE', (row_after).state from fin;
reset role;
select 'CONFIRM_AS', career_apply_confirm_as(
  '00000000-0000-4000-8000-00000000cb01',
  (select (v->>'id')::uuid from public.e2e_skeleton_state where k='routeb_claimed'),
  encode(sha256(convert_to('e2e-skeleton employer email','UTF8')),'hex'),
  'received', 'received: "thank you for applying" from mock employer (synthetic)', now());
commit;
select 'FINAL_ROW', state || '/' || coalesce(source,'null') ||
  '/email_confirmed=' || (email_confirmed_at is not null)::text ||
  '/mail_hash=' || (confirmation_mail_hash is not null)::text
  from career_apply_jobs where job_id='lever:veeva:synthetic-binding-negative';
