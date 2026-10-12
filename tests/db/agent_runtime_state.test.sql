begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000001','runtime1@example.test'),('00000000-0000-0000-0000-000000000002','runtime2@example.test');
insert into public.agent_threads(id,user_id,title) values
 ('aaaaaaaa-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000001','Runtime owner'),
 ('aaaaaaaa-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000002','Foreign owner'),
 ('aaaaaaaa-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000001','Different owned thread');
set role anon;
select t.must_fail($$select public.agent_runtime_state_read('aaaaaaaa-1111-1111-1111-111111111111')$$,'permission denied','anonymous cannot read runtime memory');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',0,'{"paused":false,"sent":[]}')$$,'permission denied','anonymous cannot save runtime memory');
reset role;
select t.as_user('00000000-0000-0000-0000-000000000001');
set role authenticated;
select t.ok(public.agent_runtime_state_read('aaaaaaaa-1111-1111-1111-111111111111')=
 '{"user_id":"00000000-0000-0000-0000-000000000001","thread_id":"aaaaaaaa-1111-1111-1111-111111111111","version":0,"state":{"paused":false,"sent":[]}}'::jsonb,'absent owned memory has explicit version-zero defaults');
select t.ok((select count(*)=0 from public.agent_runtime_states),'reading defaults creates no row');
select t.must_fail($$select public.agent_runtime_state_read('aaaaaaaa-2222-2222-2222-222222222222')$$,'owner mismatch','runtime read rejects foreign thread');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-2222-2222-2222-222222222222',0,'{"paused":false,"sent":[]}')$$,'owner mismatch','runtime save rejects foreign thread');
select t.must_fail($$select public.agent_runtime_state_read(null)$$,'thread required','runtime read rejects null thread');
select t.must_fail($$select public.agent_runtime_state_read('aaaaaaaa-1111-1111-1111-111111111111',gen_random_uuid(),null)$$,'context forbidden','authenticated caller cannot supply worker context');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',0,'{"paused":false,"sent":[]}',null,gen_random_uuid())$$,'context forbidden','authenticated save rejects partial worker context');
select t.must_fail($$select public.agent_runtime_state_owner('aaaaaaaa-1111-1111-1111-111111111111',null,null)$$,'permission denied','private owner helper cannot be called directly');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',null,'{"paused":false,"sent":[]}')$$,'invalid runtime version','null expected version never bypasses CAS');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',-1,'{"paused":false,"sent":[]}')$$,'invalid runtime version','negative expected version rejected');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',2147483647,'{"paused":false,"sent":[]}')$$,'invalid runtime version','version overflow rejected');
do $$declare sample jsonb;
begin
  foreach sample in array array[null::jsonb,'null','[]','{}','{"paused":false}',
    '{"paused":null,"sent":[]}','{"paused":"false","sent":[]}',
    '{"paused":false,"sent":null}','{"paused":false,"sent":[],"approved":true}',
    '{"paused":false,"sent":[],"user_id":"00000000-0000-0000-0000-000000000002"}'] loop
    perform t.must_fail(format('select public.agent_runtime_state_save(%L,0,%L::jsonb)','aaaaaaaa-1111-1111-1111-111111111111',sample::text),
      'invalid runtime state','runtime schema rejects missing fields, wrong types, identity overrides and financial authority');
  end loop;
  foreach sample in array array['{"paused":false,"sent":[null]}'::jsonb,'{"paused":false,"sent":["1"]}',
    '{"paused":false,"sent":[false]}','{"paused":false,"sent":[-1]}',
    '{"paused":false,"sent":[2,1]}','{"paused":false,"sent":[999999999999999]}'] loop
    perform t.must_fail(format('select public.agent_runtime_state_save(%L,0,%L::jsonb)','aaaaaaaa-1111-1111-1111-111111111111',sample::text),
      'invalid runtime sent history','history rejects nulls, strings, booleans, negatives, reversed and future times');
  end loop;
end $$;
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',0,jsonb_build_object('paused',false,'sent',(select jsonb_agg(0) from generate_series(1,33))))$$,'invalid runtime sent history','notification budget history is bounded to thirty-two');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',0,jsonb_build_object('paused',false,'sent',jsonb_build_array(repeat('x',8193))))$$,'invalid runtime state','oversize JSON rejected before history inspection');
select t.ok((public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',0,'{"paused":true,"sent":[0,1,1,2.5]}')->>'version')::integer=1,'first save persists pause and sorted epoch milliseconds with CAS');
select t.ok(public.agent_runtime_state_read('aaaaaaaa-1111-1111-1111-111111111111')->'state'='{"paused":true,"sent":[0,1,1,2.5]}'::jsonb,'restart read returns saved memory');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',0,'{"paused":false,"sent":[]}')$$,'runtime state changed','repeated create cannot overwrite existing state');
select t.ok((public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',1,'{"paused":false,"sent":[3]}')->>'version')::integer=2,'owner save advances exactly one version');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',1,'{"paused":true,"sent":[]}')$$,'runtime state changed','stale tabs cannot overwrite newer state');
select t.must_fail($$update public.agent_runtime_states set state='{"approved":true}'$$,'permission denied','owner cannot write table directly');
select t.must_fail($$insert into public.agent_runtime_states(user_id,thread_id,version,state) values(auth.uid(),'aaaaaaaa-3333-3333-3333-333333333333',1,'{}')$$,'permission denied','owner cannot directly create runtime state');
select t.must_fail($$delete from public.agent_runtime_states$$,'permission denied','owner cannot directly delete runtime state');
reset role;
select t.as_user('00000000-0000-0000-0000-000000000002');
set role authenticated;
select t.ok((select count(*)=0 from public.agent_runtime_states),'runtime table reads are tenant-isolated');
reset role;
select t.as_user('');
set role authenticated;
select t.must_fail($$select public.agent_runtime_state_read('aaaaaaaa-1111-1111-1111-111111111111')$$,'authentication required','authenticated role with no subject is not an owner');
reset role;
insert into public.agent_message_transports(provider,account_key,organization_id,enabled) values('loopmessage','upmore','org',true);
insert into public.agent_message_channels(id,user_id,provider,account_key,contact) values('cccccccc-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000001','loopmessage','upmore','+13125550123');
select set_config('test.runtime_inbox',public.agent_message_ingest('loopmessage','upmore','org','+13125550123','runtime-1',repeat('a',64),'Monitor my money')->>'inbox_id',true);
select set_config('test.runtime_lease',public.agent_message_claim(current_setting('test.runtime_inbox')::uuid,120)->>'lease_token',true);
-- Deliberately unrelated JWT subject: service identity must come from inbox.
select t.as_user('00000000-0000-0000-0000-000000000002');
set role service_role;
select t.must_fail($$select public.agent_runtime_state_read('aaaaaaaa-1111-1111-1111-111111111111')$$,'context required','service has no generic owner read override');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',2,'{"paused":false,"sent":[]}')$$,'context required','service has no generic owner save override');
select t.must_fail($$select public.agent_runtime_state_read('aaaaaaaa-1111-1111-1111-111111111111',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'turn unavailable','unstarted message cannot access state');
select public.agent_message_turn_begin(current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid);
select t.ok(public.agent_runtime_state_read('aaaaaaaa-1111-1111-1111-111111111111',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)->>'user_id'='00000000-0000-0000-0000-000000000001','first unassigned channel derives owner from started inbox, not service JWT');
select t.ok((public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',2,'{"paused":true,"sent":[4]}',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)->>'version')::integer=3,'leased worker can persist minimal memory');
select t.must_fail($$select public.agent_runtime_state_read('aaaaaaaa-2222-2222-2222-222222222222',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'owner mismatch','worker cannot read foreign thread despite JWT subject');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-2222-2222-2222-222222222222',0,'{"paused":false,"sent":[]}',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'owner mismatch','worker cannot save foreign thread');
select t.must_fail($$select public.agent_runtime_state_read('aaaaaaaa-1111-1111-1111-111111111111',current_setting('test.runtime_inbox')::uuid,gen_random_uuid())$$,'lease unavailable','random lease cannot access runtime state');
select t.must_fail($$select * from public.agent_runtime_states$$,'permission denied','service cannot bypass RPC by reading runtime table');
select t.must_fail($$update public.agent_runtime_states set version=99$$,'permission denied','service cannot bypass CAS by direct write');
select t.must_fail($$select public.agent_runtime_state_owner('aaaaaaaa-1111-1111-1111-111111111111',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'permission denied','service cannot call private scope helper');
reset role;
update public.agent_message_channels set thread_id='aaaaaaaa-1111-1111-1111-111111111111' where id='cccccccc-1111-1111-1111-111111111111';
set role service_role;
select t.must_fail($$select public.agent_runtime_state_read('aaaaaaaa-3333-3333-3333-333333333333',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'conversation changed','assigned channel rejects a different thread even if same owner');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-3333-3333-3333-333333333333',0,'{"paused":false,"sent":[]}',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'conversation changed','assigned worker cannot create state in another owned thread');
reset role;
update public.agent_message_transports set enabled=false where account_key='upmore';
set role service_role;
select t.must_fail($$select public.agent_runtime_state_read('aaaaaaaa-1111-1111-1111-111111111111',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'channel unavailable','disabled transport prevents private runtime reads');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',3,'{"paused":false,"sent":[]}',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'channel unavailable','disabled transport prevents queued state writes');
reset role;
update public.agent_message_transports set enabled=true where account_key='upmore';
update public.agent_message_inbox set lease_until=clock_timestamp()-interval '1 second' where id=current_setting('test.runtime_inbox')::uuid;
set role service_role;
select t.must_fail($$select public.agent_runtime_state_read('aaaaaaaa-1111-1111-1111-111111111111',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'lease unavailable','expired worker cannot read runtime memory');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',3,'{"paused":false,"sent":[]}',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'lease unavailable','expired worker cannot save runtime memory');
reset role;
update public.agent_message_inbox set lease_until=clock_timestamp()+interval '120 seconds' where id=current_setting('test.runtime_inbox')::uuid;
set role service_role;
select public.agent_message_turn_finish(current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid,200,'{"thread_id":"aaaaaaaa-1111-1111-1111-111111111111","reply":"Prepared, no external action."}','["Prepared, no external action."]');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',3,'{"paused":false,"sent":[]}',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'lease unavailable','completed turn has no further runtime save authority');
reset role;
select set_config('test.runtime_inbox',public.agent_message_ingest('loopmessage','upmore','org','+13125550123','runtime-2',repeat('b',64),'Another turn')->>'inbox_id',true);
select set_config('test.runtime_lease',public.agent_message_claim(current_setting('test.runtime_inbox')::uuid,120)->>'lease_token',true);
set role service_role;
select public.agent_message_turn_begin(current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid);
reset role;
select t.as_user('00000000-0000-0000-0000-000000000001');
set role authenticated;
select public.agent_message_revoke('cccccccc-1111-1111-1111-111111111111');
set role service_role;
select t.must_fail($$select public.agent_runtime_state_read('aaaaaaaa-1111-1111-1111-111111111111',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'channel unavailable','revoked channel stops an already started runtime read');
select t.must_fail($$select public.agent_runtime_state_save('aaaaaaaa-1111-1111-1111-111111111111',3,'{"paused":false,"sent":[]}',current_setting('test.runtime_inbox')::uuid,current_setting('test.runtime_lease')::uuid)$$,'channel unavailable','revoked channel stops queued runtime save');
reset role;
select t.ok((select version=3 and state='{"paused":true,"sent":[4]}'::jsonb from public.agent_runtime_states),'blocked workers leave last valid memory unchanged');
rollback;
