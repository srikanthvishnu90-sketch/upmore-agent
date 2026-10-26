-- FEATURE 14 (D-024, G6): the receipt each finished application gets, written by the database when the row finishes,
-- with the pictures the worker sent under its lease, kept only when they are the bound proof's own. Never anyone else's.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000001401','rcpt-a@example.test'),('00000000-0000-4000-8000-000000001402','rcpt-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000001401'),('00000000-0000-4000-8000-000000001402');
set role service_role;
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000001401','career:account','{"epoch":1,"version":1,"paused":false}'),
 ('00000000-0000-4000-8000-000000001402','career:account','{"epoch":1,"version":1,"paused":false}');
do $$declare p jsonb;h text;u text;begin
 foreach u in array array['00000000-0000-4000-8000-000000001401','00000000-0000-4000-8000-000000001402'] loop
  p:=jsonb_build_object('version',1,'user_id',u,'job_id','TEST-RCPT-'||right(u,4),'company','Receipt Employer '||right(u,4),
   'url','https://jobs.lever.co/test/receipt','resume_sha256',repeat('c',64),'engine_approval',repeat('e',64),
   'fields',jsonb_build_array(
     jsonb_build_object('name','first_name','label','First name','value','Rae','factId','TEST-FACT-1','provenance','owner stated (TEST)','source',jsonb_build_object('table','facts','key','first_name','value','Rae')),
     jsonb_build_object('name','email','label','Email','value','rae@example.test','factId','TEST-FACT-2','provenance','owner stated (TEST)'),
     jsonb_build_object('name','resume','label','Resume','value',repeat('c',64),'factId','resume')),
   'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour');
  h:=encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
  perform career_apply_enqueue(p,h,h,15);
 end loop;
end $$;
reset role;

-- Two pictures (a 1x1 PNG, and the same with one more byte), and a text that is not a PNG.
create temp table pic as select
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='::text as a_b64,
  encode(decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64')||'\x00'::bytea,'base64') as b_b64;
alter table pic add column a_sha text, add column b_sha text;
update pic set a_sha=encode(sha256(decode(a_b64,'base64')),'hex'), b_sha=encode(sha256(decode(b_b64,'base64')),'hex');
grant select on pic to authenticated;

select t.ok((select count(*)=0 from pg_policies where tablename in ('career_apply_receipts','career_apply_receipt_files')) and
  not has_table_privilege('authenticated','public.career_apply_receipts','select') and not has_table_privilege('anon','public.career_apply_receipt_files','select'),
  'a person''s session and anon read no receipt and no picture directly (the service role reads them for the person''s own turn)');

-- A claims A's drive.
select t.as_user('00000000-0000-4000-8000-000000001401');set role authenticated;
create temp table a_drive as select id,lease_token from career_apply_claim_own(6);
reset role;
grant select on a_drive to authenticated;
select t.ok((select count(*)=1 from a_drive),'A holds one drive');

-- The pictures go up under the lease, checked; B can attach nothing to A's drive.
select t.as_user('00000000-0000-4000-8000-000000001401');set role authenticated;
select t.must_fail($$select career_apply_receipt_attach_own(d.id,d.lease_token,'before-click',p.a_sha,'aGVsbG8=') from a_drive d, pic p$$,'not a PNG','a file that is not a PNG is refused');
select t.must_fail($$select career_apply_receipt_attach_own(d.id,d.lease_token,'before-click',p.b_sha,p.a_b64) from a_drive d, pic p$$,'not the picture the hash names','bytes that are not the named picture are refused');
select t.must_fail($$select career_apply_receipt_attach_own(d.id,gen_random_uuid(),'before-click',p.a_sha,p.a_b64) from a_drive d, pic p$$,'invalid apply claim','without the lease nothing is attached');
select t.must_fail($$select career_apply_receipt_attach_own(d.id,d.lease_token,'screen',p.a_sha,p.a_b64) from a_drive d, pic p$$,'unknown kind','only the before and after pictures are kept');
select t.ok((select (career_apply_receipt_attach_own(d.id,d.lease_token,'before-click',p.a_sha,p.a_b64))->>'sha256'=p.a_sha from a_drive d, pic p),'the before picture is attached');
select t.ok((select (career_apply_receipt_attach_own(d.id,d.lease_token,'after-submit',p.b_sha,p.b_b64))->>'sha256'=p.b_sha from a_drive d, pic p),'the after picture is attached');
select t.must_fail($$select career_apply_receipt_attach(d.id,d.lease_token,'before-click',p.a_sha,p.a_b64) from a_drive d, pic p$$,'permission denied','the lease-only attach is service-only');
reset role;
select t.as_user('00000000-0000-4000-8000-000000001402');set role authenticated;
select t.must_fail($$select career_apply_receipt_attach_own(d.id,d.lease_token,'before-click',p.a_sha,p.a_b64) from a_drive d, pic p$$,'invalid apply claim','B cannot attach a picture to A''s drive, even with A''s lease');
reset role;

-- A finishes with a proof bound to this application and approval; the after picture's hash in the proof is not the one
-- that was sent, so only the before picture is kept.
select t.as_user('00000000-0000-4000-8000-000000001401');set role authenticated;
select career_apply_finish_own(d.id,d.lease_token,'confirmed',jsonb_build_object(
  'reason','employer confirmation on the page','confirmation_id','TEST-RC-1','confirmation_text',E'Thank you   for applying.\nConfirmation TEST-RC-1',
  'proof',jsonb_build_object('run_id','run-1','application_id',d.id,'approval_hash',repeat('e',64),'final_url','https://jobs.lever.co/test/receipt/thanks',
    'before_click',jsonb_build_object('file','proof-1-before-click.png','sha256',p.a_sha,'seq',1,'at',1761400000000),
    'click',jsonb_build_object('seq',2,'at',1761400001000),
    'after_submit',jsonb_build_object('file','proof-3-after-submit.png','sha256',repeat('0',64),'seq',3,'at',1761400002000)))) from a_drive d, pic p;
reset role;
select t.ok((select count(*)=1 from career_apply_receipts where user_id='00000000-0000-4000-8000-000000001401'),'the finish wrote one receipt');
select t.ok((select state='submitted_unconfirmed' and reached_employer='yes' and company='Receipt Employer 1401' and url='https://jobs.lever.co/test/receipt'
  and final_url='https://jobs.lever.co/test/receipt/thanks' and confirmation_id='TEST-RC-1' and confirmation_text='Thank you for applying. Confirmation TEST-RC-1'
  and resume_sha256=repeat('c',64) and engine_approval=repeat('e',64) and payload_hash ~ '^[a-f0-9]{64}$' and approval_hash=payload_hash
  and clicked_at=to_timestamp(1761400001) and finished_at is not null and approved_at is not null
  and pictures_keep_until > now() + interval '89 days' from career_apply_receipts where user_id='00000000-0000-4000-8000-000000001401'),
  'where, when, the hashes, the confirmation and the period are on the receipt');
select t.ok((select answers=jsonb_build_array(
    jsonb_build_object('name','first_name','label','First name','answer','Rae','fact_id','TEST-FACT-1','provenance','owner stated (TEST)','source',jsonb_build_object('table','facts','key','first_name')),
    jsonb_build_object('name','email','label','Email','answer','rae@example.test','fact_id','TEST-FACT-2','provenance','owner stated (TEST)'))
  from career_apply_receipts where user_id='00000000-0000-4000-8000-000000001401'),'each answer sent with its source fact, in order; the resume is named by its hash, not as an answer');
select t.ok((select proof->'before_click'->>'sha256'=(select a_sha from pic) and proof->>'run_id'='run-1' and not (proof->'before_click' ? 'file')
  from career_apply_receipts where user_id='00000000-0000-4000-8000-000000001401'),'the proof''s hashes are kept, not the device''s file names');
select t.ok((select array_agg(kind order by kind)=array['before-click'] and bool_and(bound) and bool_and(keep_until>now()+interval '89 days')
  from career_apply_receipt_files where user_id='00000000-0000-4000-8000-000000001401'),'only the picture the bound proof names is kept; the other is removed');

-- The employer's email confirms it later: the receipt's state follows; what was sent does not change.
update career_apply_jobs set state='confirmed',email_confirmed_at=now(),confirmation_mail_hash=repeat('d',64) where user_id='00000000-0000-4000-8000-000000001401';
select t.ok((select state='confirmed' and jsonb_array_length(answers)=2 from career_apply_receipts where user_id='00000000-0000-4000-8000-000000001401'),'a later confirmation updates the state only');

-- B's drive: a proof for another application keeps no picture and no proof; the receipt still says what was approved.
select t.as_user('00000000-0000-4000-8000-000000001402');set role authenticated;
create temp table b_drive as select id,lease_token from career_apply_claim_own(6);
select career_apply_receipt_attach_own(d.id,d.lease_token,'before-click',p.a_sha,p.a_b64) from b_drive d, pic p;
select career_apply_finish_own(d.id,d.lease_token,'unknown_outcome',jsonb_build_object('reason','the engine gave no result after it started; not retried',
  'proof',jsonb_build_object('run_id','run-2','application_id',gen_random_uuid(),'approval_hash',repeat('e',64),'before_click',jsonb_build_object('sha256',p.a_sha)))) from b_drive d, pic p;
reset role;
select t.ok((select reached_employer='unknown' and proof='{}'::jsonb and clicked_at is null and final_url is null from career_apply_receipts where user_id='00000000-0000-4000-8000-000000001402'),
  'a proof of another application is not this one''s: no proof on the receipt, said as unknown');
select t.ok((select count(*)=0 from career_apply_receipt_files where user_id='00000000-0000-4000-8000-000000001402'),'and no picture is kept');
select t.must_fail($$select career_apply_receipt_attach(id,lease_token,'before-click',(select a_sha from pic),(select a_b64 from pic)) from career_apply_jobs where user_id='00000000-0000-4000-8000-000000001402'$$,
  'invalid apply claim|not being driven','a finished drive takes no more pictures');

-- Retention: past the period the pictures go, the receipt stays.
set role service_role;
select t.ok((select career_apply_receipt_files_expire(now()+interval '30 days')=0),'nothing goes before its period');
select t.ok((select career_apply_receipt_files_expire(now()+interval '91 days')=1),'the picture goes after it');
reset role;
select t.ok((select count(*)=2 from career_apply_receipts),'the receipts stay');

-- Erasing the application erases its receipt.
delete from career_apply_jobs where user_id='00000000-0000-4000-8000-000000001402';
select t.ok((select count(*)=0 from career_apply_receipts where user_id='00000000-0000-4000-8000-000000001402'),'an erased application leaves no receipt');
rollback;
