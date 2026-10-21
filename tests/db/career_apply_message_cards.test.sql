-- Lane B: synthetic TEST account only; stored Messages nonce -> exact batch approval -> one use / 24 hours.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000001171','message-card-a@example.test'),
 ('00000000-0000-4000-8000-000000001172','message-card-b@example.test'),
 ('00000000-0000-4000-8000-000000001173','message-card-not-test@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000001171'),('00000000-0000-4000-8000-000000001172'),('00000000-0000-4000-8000-000000001173');
insert into agent_threads(id,user_id,title) values
 ('00000000-0000-4000-8000-00000000117a','00000000-0000-4000-8000-000000001171','Synthetic card A'),
 ('00000000-0000-4000-8000-00000000117b','00000000-0000-4000-8000-000000001172','Synthetic card B'),
 ('00000000-0000-4000-8000-00000000117c','00000000-0000-4000-8000-000000001173','Not TEST');
create function pg_temp.mc_hash(e jsonb) returns text language sql security definer set search_path=public,pg_temp as $$ select encode(sha256(convert_to(public.career_apply_canonical(e),'UTF8')),'hex') $$;
create function pg_temp.mc_entry(job text default 'lever:synthetic:message-card') returns jsonb language sql as $$
 select jsonb_build_object('version',1,'kind','agent-batch','jobId',job,'company','Synthetic card employer','url','https://jobs.lever.co/synthetic/'||job||'/apply',
  'answers',jsonb_build_array(
   jsonb_build_object('name','name','label','Full name','value','TEST Person','shown','TEST Person','kind','text','factId','TEST-NAME','file',null),
   jsonb_build_object('name','resume','label','Resume/CV','value','synthetic.pdf','shown','synthetic.pdf','kind','file','factId','approved-local-resume:'||repeat('a',64),'file',repeat('a',64))),
  'blank',jsonb_build_array('Optional comments'),
  'ledger',jsonb_build_array(
   jsonb_build_object('application_id',job,'field_id','name','question_hash',repeat('1',64),'answer_hash',repeat('2',64),'fact_refs',jsonb_build_array('TEST-NAME'),'source_refs',jsonb_build_array('own synthetic statement'),'confirmation_event_id','synthetic:confirmed:name','derivation_rule','verbatim'),
   jsonb_build_object('application_id',job,'field_id','resume','question_hash',repeat('3',64),'answer_hash',repeat('4',64),'fact_refs',jsonb_build_array('approved-local-resume:'||repeat('a',64)),'source_refs',jsonb_build_array('own synthetic attachment'),'confirmation_event_id','synthetic:confirmed:resume','derivation_rule','attachment')),
  'question_set_hash',repeat('5',64),'manifest_hash',repeat('6',64),'quarantine_version','d007-v1')
$$;
create function pg_temp.mc_items(e jsonb) returns jsonb language sql as $$ select jsonb_build_array(jsonb_build_object('entry',e,'hash',pg_temp.mc_hash(e))) $$;
create temp table mc_state(k text primary key,v jsonb);
grant all on mc_state to authenticated,service_role;
grant select on mc_state to anon;

-- Closed by default; the service must explicitly configure the TEST person.
set role service_role;
select t.must_fail($$select career_apply_message_card_show_as('00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117a',pg_temp.mc_items(pg_temp.mc_entry()))$$,'TEST-only','default-empty allowlist refuses producer');
insert into career_message_approval_private.test_users(user_id) values('00000000-0000-4000-8000-000000001171'),('00000000-0000-4000-8000-000000001172');
select t.must_fail($$select career_apply_message_card_show_as('00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117b',pg_temp.mc_items(pg_temp.mc_entry()))$$,'thread is not yours','producer refuses another person''s thread');
select t.must_fail($$select career_apply_message_card_show_as('00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117a',jsonb_set(pg_temp.mc_items(pg_temp.mc_entry()),'{0,hash}',to_jsonb(repeat('b',64))))$$,'stale message approval entry','producer refuses changed item hash');
select t.must_fail($$select career_apply_message_card_show_as('00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117a',pg_temp.mc_items(pg_temp.mc_entry())||pg_temp.mc_items(pg_temp.mc_entry()))$$,'duplicate posting','one posting cannot be hidden twice');
select t.must_fail($$select career_apply_message_card_show_as('00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117a',pg_temp.mc_items(pg_temp.mc_entry()||'{"hidden_answer":"not shown"}'::jsonb))$$,'stale message approval entry','unknown entry fields cannot carry hidden answers');
select t.must_fail($$select career_apply_message_card_show_as('00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117a',pg_temp.mc_items(jsonb_set(pg_temp.mc_entry(),'{answers,1,file}','"not-a-fingerprint"')))$$,'invalid message approval answer','resume requires its exact fingerprint');
select t.must_fail($$select career_apply_message_card_show_as('00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117a',pg_temp.mc_items(jsonb_set(pg_temp.mc_entry(),'{answers,1,factId}','"TEST-ATTACHMENT"')))$$,'prepared resume','an attachment alone cannot impersonate the prepared resume');
insert into mc_state values('resume-and-attachment',career_apply_message_card_show_as('00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117a',pg_temp.mc_items(
 jsonb_set(pg_temp.mc_entry('lever:synthetic:resume-and-attachment'),'{answers}',(pg_temp.mc_entry('lever:synthetic:resume-and-attachment')->'answers')||jsonb_build_array(jsonb_build_object('name','portfolio','label','Supporting document','value','portfolio.pdf','shown','portfolio.pdf','kind','file','factId','TEST-PORTFOLIO','file',repeat('b',64)))))));
select t.ok((select jsonb_array_length(v->'payload'->'items'->0->'entry'->'answers')=3 from mc_state where k='resume-and-attachment'),'the prepared resume plus another fingerprinted attachment is retained exactly');
select t.must_fail($$select career_apply_message_card_show_as('00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117a',pg_temp.mc_items(
 jsonb_set(pg_temp.mc_entry(),'{answers}',(pg_temp.mc_entry()->'answers')||jsonb_build_array(jsonb_build_object('name','other-resume','label','Other resume','value','other.pdf','shown','other.pdf','kind','file','factId','approved-local-resume:'||repeat('b',64),'file',repeat('b',64))))))$$,'one prepared resume fingerprint','conflicting prepared resume identities are refused');
select t.ok((career_apply_message_card_show_as('00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117a',pg_temp.mc_items(
 jsonb_set(pg_temp.mc_entry(),'{answers}',(pg_temp.mc_entry()->'answers')||jsonb_build_array((pg_temp.mc_entry()->'answers'->1)||'{"name":"same-resume-second-field"}'::jsonb)))))->>'state'='open','the same prepared resume can satisfy two distinct form fields');
insert into mc_state values('card',career_apply_message_card_show_as('00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117a',pg_temp.mc_items(pg_temp.mc_entry())));
reset role;
select t.ok((select c.payload=v->'payload' and c.payload_hash=v->>'hash' and c.payload_hash=pg_temp.mc_hash(c.payload)
 and c.payload->'items'=pg_temp.mc_items(pg_temp.mc_entry()) and c.expires_at=c.shown_at+interval '24 hours'
 from career_apply_message_cards c,mc_state where k='card' and c.id=(v->>'id')::uuid),'stored payload/hash are precisely the disclosed answers and resume');
select t.ok((select m.meta->>'career_approval_card_id'=v->>'id' and m.thread_id='00000000-0000-4000-8000-00000000117a' and m.role='assistant'
 from agent_messages m,mc_state where k='card' and m.id=(v->>'message_id')::bigint),'Messages references the stored owner/thread-bound nonce');
select t.ok((select count(*)=0 from career_apply_batch_approvals),'showing a card mints no approval');

-- Clients cannot mint cards or enroll themselves, and B cannot read or answer A's nonce.
set role anon;
select t.must_fail($$select career_apply_message_card_read_own((select (v->>'id')::uuid from mc_state where k='card'))$$,'permission denied','anonymous card read is denied');
reset role;
select t.as_user('00000000-0000-4000-8000-000000001173');set role authenticated;
select t.must_fail($$insert into career_message_approval_private.test_users(user_id) values(auth.uid())$$,'permission denied','no self-enrollment into TEST');
select t.must_fail($$select career_apply_message_card_read_own((select (v->>'id')::uuid from mc_state where k='card'))$$,'TEST-only','non-TEST actor cannot read');
select t.must_fail($$select career_apply_message_card_approve_own((select (v->>'id')::uuid from mc_state where k='card'),(select v->>'hash' from mc_state where k='card'))$$,'TEST-only','non-TEST actor cannot approve');
reset role;
select t.as_user('00000000-0000-4000-8000-000000001172');set role authenticated;
select t.ok((select count(*)=0 from career_apply_message_cards),'B sees no cards through RLS');
select t.must_fail($$select career_apply_message_card_read_own((select (v->>'id')::uuid from mc_state where k='card'))$$,'not yours','B cannot read A''s exact answers');
select t.must_fail($$select career_apply_message_card_approve_own((select (v->>'id')::uuid from mc_state where k='card'),(select v->>'hash' from mc_state where k='card'))$$,'not yours','B cannot tap A''s approval');
reset role;
select t.as_user('00000000-0000-4000-8000-000000001171');set role authenticated;
select t.must_fail($$select career_apply_message_card_show_as(auth.uid(),'00000000-0000-4000-8000-00000000117a',pg_temp.mc_items(pg_temp.mc_entry()))$$,'permission denied','person cannot use the service producer');
select t.must_fail($$update career_apply_message_cards set approved_at=now(),approval_expires_at=now()+interval '24 hours'$$,'permission denied','person cannot approve by direct table write');
select t.ok((select (career_apply_message_card_read_own((v->>'id')::uuid))->>'state'='open' from mc_state where k='card'),'A reads an open card');
select t.must_fail($$select career_apply_message_card_approve_own((select (v->>'id')::uuid from mc_state where k='card'),repeat('b',64))$$,'stale message approval card','a tap with another card hash is refused');
reset role;
select t.ok((select count(*)=0 from career_apply_batch_approvals),'refused taps mint zero approvals');

-- Stored changes cannot replace what was displayed, even for the service writer.
set role service_role;
select t.must_fail($$update career_apply_message_cards set payload=jsonb_set(payload,'{items,0,entry,answers,0,value}','"Changed Person"')$$,'immutable','changed answer cannot replace shown payload');
select t.must_fail($$update career_apply_message_cards set payload=jsonb_set(payload,'{items,0,entry,answers,1,file}',to_jsonb(repeat('b',64)))$$,'immutable','changed resume cannot replace shown payload');
select t.must_fail($$update career_apply_message_cards set thread_id='00000000-0000-4000-8000-00000000117b'$$,'immutable','card cannot move to another thread');
select t.must_fail($$update career_apply_message_cards set expires_at=expires_at+interval '1 day'$$,'immutable','card lifetime cannot be extended');
reset role;

-- One successful tap stores exactly one approval; receipt time is the real authorization time.
select t.as_user('00000000-0000-4000-8000-000000001171');set role authenticated;
insert into mc_state values('receipt',career_apply_message_card_approve_own((select (v->>'id')::uuid from mc_state where k='card'),(select v->>'hash' from mc_state where k='card')));
select t.ok((select (r.v->>'approved_count')::int=1 and r.v->>'card_id'=c.v->>'id' and r.v->>'card_hash'=c.v->>'hash'
 from mc_state r,mc_state c where r.k='receipt' and c.k='card'),'tap receipt binds card/hash and exact approved count');
select t.ok((select count(*)=1 and bool_and(entry=pg_temp.mc_entry() and batch_hash=pg_temp.mc_hash(entry)
 and approved_at=(select (v->>'approved_at')::timestamptz from mc_state where k='receipt')
 and approved_at+interval '24 hours'=(select (v->>'approval_expires_at')::timestamptz from mc_state where k='receipt')
 and used_at is null and revoked_at is null) from career_apply_batch_approvals),'only exact shown entry is authorized, with matching 24h receipt');
select t.ok((select career_apply_message_card_read_own((v->>'id')::uuid)->>'state'='approved' from mc_state where k='card'),'history reads the answered nonce');
select t.must_fail($$select career_apply_message_card_approve_own((select (v->>'id')::uuid from mc_state where k='card'),(select v->>'hash' from mc_state where k='card'))$$,'already used','repeated tap cannot mint a second approval');
reset role;
select t.ok((select count(*)=1 from career_apply_batch_approvals),'replay created zero additional approval rows');
select t.ok((select count(*)=0 from career_apply_jobs),'the tap itself submits nothing');

-- The actual modern consumer exercises this card's approval once. These are invented stated facts / attachment.
set role service_role;
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000001171','career:account','{"epoch":2,"version":3,"paused":false,"daily_limit":"5"}');
reset role;
insert into career_cloud_settings(key,value) values('CAREER_AGENT_SUBMIT','on') on conflict(key) do update set value=excluded.value;
create temp table mc_payload as select jsonb_build_object('version',1,'source','extension','user_id','00000000-0000-4000-8000-000000001171',
 'manifest_hash',repeat('6',64),'quarantine_version','d007-v1','job_id',pg_temp.mc_entry()->>'jobId',
 'company','Synthetic card employer','url',pg_temp.mc_entry()->>'url','family','lever',
 'fields',jsonb_build_array(
  jsonb_build_object('name','name','label','Full name','value','TEST Person','source','trainee','factId','TEST-NAME','detail',''),
  jsonb_build_object('name','resume','label','Resume/CV','value','synthetic.pdf','source','trainee','factId','approved-local-resume:'||repeat('a',64),'detail','')),
 'resume_name','synthetic.pdf','resume_sha256',repeat('a',64),'privacy_epoch',2,'account_version',3,
 'expires_at',(clock_timestamp()+interval '2 hours')::text) p;
grant select on mc_payload to authenticated;
select t.as_user('00000000-0000-4000-8000-000000001171');set role authenticated;
insert into mc_state select 'consumer',career_apply_extension_begin_agent_own(p,pg_temp.mc_hash(p),pg_temp.mc_hash(pg_temp.mc_entry())) from mc_payload;
select t.ok((select (v->>'id') is not null and (v->>'lease') is not null from mc_state where k='consumer'),'the actual consumer accepts the exact card-authorized payload');
select t.ok((select count(*)=1 and bool_and(used_at is not null) from career_apply_batch_approvals),'the actual consumer marks the card-minted authorization used');
select t.must_fail($$select career_apply_extension_begin_agent_own(p,pg_temp.mc_hash(p),pg_temp.mc_hash(pg_temp.mc_entry())) from mc_payload$$,'no live batch approval','actual consumer cannot exercise the approval twice');
select t.must_fail($$select career_apply_message_card_approve_own((select (v->>'id')::uuid from mc_state where k='card'),(select v->>'hash' from mc_state where k='card'))$$,'already used','card cannot remint after its authorization was consumed');
reset role;
select t.ok((select count(*)=1 from career_apply_jobs),'the actual consumer created exactly one application record');

-- A separately approved Messages entry is refused by the consumer once its authorization reaches 24 hours.
set role service_role;
insert into mc_state values('permission-expiry-card',career_apply_message_card_show_as('00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117a',pg_temp.mc_items(pg_temp.mc_entry('lever:synthetic:expired-permission'))));
reset role;
select t.as_user('00000000-0000-4000-8000-000000001171');set role authenticated;
insert into mc_state values('permission-expiry-receipt',career_apply_message_card_approve_own((select (v->>'id')::uuid from mc_state where k='permission-expiry-card'),(select v->>'hash' from mc_state where k='permission-expiry-card')));
reset role;
update career_apply_batch_approvals set approved_at=clock_timestamp()-interval '24 hours' where job_id='lever:synthetic:expired-permission';
select t.as_user('00000000-0000-4000-8000-000000001171');set role authenticated;
select t.must_fail($$select career_apply_extension_begin_agent_own(p||'{"job_id":"lever:synthetic:expired-permission"}'::jsonb,pg_temp.mc_hash(p||'{"job_id":"lever:synthetic:expired-permission"}'::jsonb),pg_temp.mc_hash(pg_temp.mc_entry('lever:synthetic:expired-permission'))) from mc_payload$$,'no live batch approval','actual consumer refuses a card authorization at 24 hours');
reset role;
select t.ok((select count(*)=1 from career_apply_jobs),'expired authorization created no second application');

-- Synthetic expired nonce: at the deadline or later it is not open, and minting is refused.
create temp table mc_expired as select gen_random_uuid() id,floor(extract(epoch from clock_timestamp())*1000)::bigint-86400000 issued;
insert into agent_messages(thread_id,role,content,meta) select '00000000-0000-4000-8000-00000000117a','assistant','Synthetic expired card',jsonb_build_object('career_approval_card_id',id) from mc_expired;
insert into career_apply_message_cards(id,user_id,thread_id,message_id,payload,payload_hash,shown_at,expires_at)
 select x.id,'00000000-0000-4000-8000-000000001171','00000000-0000-4000-8000-00000000117a',m.id,b.body,pg_temp.mc_hash(b.body),to_timestamp(x.issued/1000.0),to_timestamp(x.issued/1000.0)+interval '24 hours'
 from mc_expired x join agent_messages m on m.meta->>'career_approval_card_id'=x.id::text,
 lateral(select (select v->'payload' from mc_state where k='card')||jsonb_build_object('card_id',x.id,'issued_at',x.issued,'expires_at',x.issued+86400000) body)b;
grant select on mc_expired to authenticated;
select t.as_user('00000000-0000-4000-8000-000000001171');set role authenticated;
select t.ok((select career_apply_message_card_read_own(id)->>'state'='expired' from mc_expired),'expired card is rendered as expired');
select t.must_fail($$select career_apply_message_card_approve_own(id,pg_temp.mc_hash((career_apply_message_card_read_own(id))->'payload')) from mc_expired$$,'card expired','24h-old card mints nothing');
reset role;
select t.ok((select count(*)=2 from career_apply_batch_approvals),'expired tap preserves approval count');
-- Disabling the TEST account immediately closes its remaining access.
update career_message_approval_private.test_users set enabled=false where user_id='00000000-0000-4000-8000-000000001171';
select t.as_user('00000000-0000-4000-8000-000000001171');set role authenticated;
select t.ok((select count(*)=0 from career_apply_message_cards),'TEST removal closes direct reads');
select t.must_fail($$select career_apply_message_card_read_own((select (v->>'id')::uuid from mc_state where k='card'))$$,'TEST-only','TEST removal closes RPC reads');
reset role;
rollback;
