-- Synthetic Auth-only bill edits; must run after all migrations and t helpers.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000e2','bill-edit@example.com'),
 ('00000000-0000-0000-0000-0000000000e3','bill-edit-other@example.com');
insert into public.agent_settings(user_id) values
 ('00000000-0000-0000-0000-0000000000e2'),('00000000-0000-0000-0000-0000000000e3');
create schema oe;
create function oe.fields(amount bigint default 2500) returns jsonb language sql as $$
 select jsonb_build_object('creditor','Rent revised','kind','rent','direction','payable','currency','USD',
 'amount_due_cents',amount,'due_on',(current_date+2)::text,'autopay','off')
$$;
create table oe.results(label text primary key,result jsonb);
grant usage on schema oe to authenticated,service_role;
grant execute on function oe.fields(bigint) to authenticated,service_role;
grant select,insert on oe.results to authenticated;
insert into public.agent_obligations(id,user_id,source_key,creditor,kind,source_type,status,currency,direction,amount_due_cents,due_on,autopay)
values
 ('00000000-0000-0000-0000-00000000e201','00000000-0000-0000-0000-0000000000e2','edit:base','Rent','rent','user','verified','USD','payable',2000,current_date+1,'off'),
 ('00000000-0000-0000-0000-00000000e202','00000000-0000-0000-0000-0000000000e2','edit:second','Other','rent','user','asserted','USD','payable',2000,current_date+1,'off'),
 ('00000000-0000-0000-0000-00000000e203','00000000-0000-0000-0000-0000000000e2','edit:provider','Provider','rent','biller','verified','USD','payable',2000,current_date+1,'off'),
 ('00000000-0000-0000-0000-00000000e204','00000000-0000-0000-0000-0000000000e2','edit:settled','Settled','rent','user','settled','USD','payable',0,current_date+1,'off'),
 ('00000000-0000-0000-0000-00000000e205','00000000-0000-0000-0000-0000000000e2','edit:waived','Waived','rent','user','waived','USD','payable',2000,current_date+1,'off'),
 ('00000000-0000-0000-0000-00000000e206','00000000-0000-0000-0000-0000000000e2','edit:invalid','Invalid','rent','user','invalid','USD','payable',2000,current_date+1,'off'),
 ('00000000-0000-0000-0000-00000000e207','00000000-0000-0000-0000-0000000000e2','edit:EUR','Euro','rent','user','verified','EUR','payable',2000,current_date+1,'off'),
 ('00000000-0000-0000-0000-00000000e208','00000000-0000-0000-0000-0000000000e2','edit:receivable','Income','rent','user','verified','USD','receivable',2000,current_date+1,'off'),
 ('00000000-0000-0000-0000-00000000e301','00000000-0000-0000-0000-0000000000e3','edit:foreign','Private','rent','user','verified','USD','payable',2000,current_date+1,'off');
insert into oe.results values('task',public.agent_workflow_store_plan('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-00000000e201',1,
 jsonb_build_object('obligation_id','00000000-0000-0000-0000-00000000e201','obligation_revision',1,'state','awaiting_approval','proposal',jsonb_build_object('expires_at',now()+interval '15 minutes','amount_cents',2000)),repeat('e',64)));
select t.as_user('00000000-0000-0000-0000-0000000000e2');set role authenticated;
select public.agent_workflow_approve((select (result->>'id')::uuid from oe.results where label='task'),repeat('e',64));
insert into oe.results values('first',public.agent_obligation_edit('00000000-0000-0000-0000-00000000e211','00000000-0000-0000-0000-00000000e201',1,oe.fields()));
select t.ok((select (result->>'replay')::boolean=false and (result->>'superseded')::boolean=false and (result->>'current_revision')::integer=2 from oe.results where label='first'),'first edit returns exact new revision and no replay');
select t.ok((select revision=2 and creditor='Rent revised' and amount_due_cents=2500 and source_type='user' and status='verified' from public.agent_obligations where id='00000000-0000-0000-0000-00000000e201'),'reviewed user facts update exactly once');
select t.ok((select state='cancelled' and revoked_at is not null from public.agent_workflow_tasks where id=(select (result->>'id')::uuid from oe.results where label='task')),'changed bill revokes old payment authorization');
select t.ok((select (before_snapshot->>'amount_due_cents')::bigint=2000 and (after_snapshot->>'amount_due_cents')::bigint=2500 from public.agent_obligation_edits where request_id='00000000-0000-0000-0000-00000000e211'),'immutable edit receipt preserves before and after facts');
insert into oe.results values('retry',public.agent_obligation_edit('00000000-0000-0000-0000-00000000e211','00000000-0000-0000-0000-00000000e201',1,oe.fields()));
select t.ok((select (result->>'replay')::boolean and not (result->>'superseded')::boolean and (result->>'current_revision')::integer=2 from oe.results where label='retry'),'lost response retry returns original receipt without another edit');
select t.ok((select count(*)=1 from public.agent_workflow_events where event='user_bill_edited'),'retry creates no second edit event');
select t.must_fail($$select public.agent_obligation_edit('00000000-0000-0000-0000-00000000e211','00000000-0000-0000-0000-00000000e201',1,oe.fields(2501))$$,'request changed','request UUID cannot discard changed amount');
select t.must_fail($$select public.agent_obligation_edit('00000000-0000-0000-0000-00000000e211','00000000-0000-0000-0000-00000000e202',1,oe.fields())$$,'request changed','request UUID binds exact obligation');
select t.must_fail($$select public.agent_obligation_edit(gen_random_uuid(),'00000000-0000-0000-0000-00000000e201',1,oe.fields(3000))$$,'bill changed','a second stale tab cannot overwrite the newer bill');
insert into oe.results values('second',public.agent_obligation_edit('00000000-0000-0000-0000-00000000e212','00000000-0000-0000-0000-00000000e201',2,oe.fields(3000)));
insert into oe.results values('superseded',public.agent_obligation_edit('00000000-0000-0000-0000-00000000e211','00000000-0000-0000-0000-00000000e201',1,oe.fields()));
select t.ok((select (result->>'replay')::boolean and (result->>'superseded')::boolean and (result->>'current_revision')::integer=3 and (result->'obligation'->>'amount_due_cents')::bigint=2500 from oe.results where label='superseded'),'retry explicitly marks superseded receipt while reporting current revision');
select t.ok((select revision=3 and amount_due_cents=3000 from public.agent_obligations where id='00000000-0000-0000-0000-00000000e201'),'superseded retry cannot undo the later reviewed edit');

-- Null, malformed and extra fields must fail before any receipt/event write.
select t.must_fail($$select public.agent_obligation_edit(null,'00000000-0000-0000-0000-00000000e201',3,oe.fields())$$,'invalid reviewed bill fields','missing request is rejected');
select t.must_fail($$select public.agent_obligation_edit(gen_random_uuid(),null,3,oe.fields())$$,'invalid reviewed bill fields','missing obligation is rejected');
select t.must_fail($$select public.agent_obligation_edit(gen_random_uuid(),'00000000-0000-0000-0000-00000000e201',null,oe.fields())$$,'invalid reviewed bill fields','SQL null expected revision fails closed');
select t.must_fail($$select public.agent_obligation_edit(gen_random_uuid(),'00000000-0000-0000-0000-00000000e201',3,null)$$,'invalid reviewed bill fields','SQL null fields object fails closed');
do $$declare body jsonb;begin
 for body in select value from jsonb_array_elements(jsonb_build_array(
  null,'null'::jsonb,'[]'::jsonb,'1'::jsonb,'"text"'::jsonb,oe.fields()-'autopay',oe.fields()||'{"user_id":"someone-else"}',
  oe.fields()||'{"status":"settled"}',oe.fields()||'{"creditor":null}',oe.fields()||'{"creditor":""}',oe.fields()||'{"creditor":" leading"}',
  oe.fields()||jsonb_build_object('creditor',E'\tHidden\nPayee'),oe.fields()||'{"kind":null}',oe.fields()||'{"kind":"fake"}',
  oe.fields()||'{"direction":"receivable"}',oe.fields()||'{"direction":null}',oe.fields()||'{"currency":"EUR"}',oe.fields()||'{"currency":null}',oe.fields()||'{"amount_due_cents":null}',
  oe.fields()||'{"amount_due_cents":"2500"}',oe.fields()||'{"amount_due_cents":1.5}',oe.fields()||'{"amount_due_cents":-1}',
  oe.fields()||'{"due_on":null}',oe.fields()||'{"due_on":"2026-1-01"}',oe.fields()||'{"autopay":null}',oe.fields()||'{"autopay":"enabled"}'
 )) loop
  perform t.must_fail(format('select public.agent_obligation_edit(gen_random_uuid(),%L::uuid,3,%L::jsonb)','00000000-0000-0000-0000-00000000e201',body::text),'invalid reviewed bill fields','strict reviewed fields reject malformed or authority-bearing JSON');
 end loop;
end $$;
select t.must_fail($$select public.agent_obligation_edit(gen_random_uuid(),'00000000-0000-0000-0000-00000000e201',0,oe.fields())$$,'invalid reviewed bill fields','zero revision cannot pass optimistic concurrency');
select t.must_fail($$select public.agent_obligation_edit(gen_random_uuid(),'00000000-0000-0000-0000-00000000e201',2147483647,oe.fields())$$,'invalid reviewed bill fields','revision overflow boundary rejected');
select t.must_fail($$select public.agent_obligation_edit(gen_random_uuid(),'00000000-0000-0000-0000-00000000e201',3,oe.fields(0))$$,'invalid reviewed bill amount','zero amount cannot imply debt forgiveness');
select t.must_fail($$select public.agent_obligation_edit(gen_random_uuid(),'00000000-0000-0000-0000-00000000e201',3,oe.fields(9007199254740992))$$,'invalid reviewed bill amount','unsafe integer cents cannot reach financial state');
select t.must_fail($$select public.agent_obligation_edit(gen_random_uuid(),'00000000-0000-0000-0000-00000000e201',3,oe.fields()||'{"due_on":"2026-02-30"}')$$,'out of range|invalid reviewed bill date','invalid calendar date cannot normalize silently');
do $$declare id uuid;begin
 for id in select unnest(array['00000000-0000-0000-0000-00000000e203'::uuid,'00000000-0000-0000-0000-00000000e204'::uuid,'00000000-0000-0000-0000-00000000e205'::uuid,'00000000-0000-0000-0000-00000000e206'::uuid,'00000000-0000-0000-0000-00000000e207'::uuid,'00000000-0000-0000-0000-00000000e208'::uuid]) loop
  perform t.must_fail(format('select public.agent_obligation_edit(gen_random_uuid(),%L::uuid,1,oe.fields())',id),'not editable here','provider/final/non-USD/receivable bill cannot be rewritten by user edit');
 end loop;
end $$;
select t.must_fail($$insert into public.agent_obligation_edits(user_id,request_id,obligation_id,request,before_snapshot,after_snapshot) values('00000000-0000-0000-0000-0000000000e2',gen_random_uuid(),'00000000-0000-0000-0000-00000000e201','{}','{}','{}')$$,'permission denied','Auth cannot forge edit receipts');
select t.must_fail($$update public.agent_obligation_edits set after_snapshot='{}'$$,'permission denied','Auth cannot rewrite edit receipts');
select t.must_fail($$delete from public.agent_obligation_edits$$,'permission denied','Auth cannot erase edit receipts');
select t.ok((select count(*)=2 from public.agent_obligation_edits),'failed edits leave no receipts');
select t.ok((select count(*)=2 from public.agent_workflow_events where event='user_bill_edited'),'failed edits leave no success events');

select t.as_user('00000000-0000-0000-0000-0000000000e3');
select t.ok((select count(*)=0 from public.agent_obligation_edits),'other tenant cannot read edit receipt snapshots');
select t.must_fail($$select public.agent_obligation_edit(gen_random_uuid(),'00000000-0000-0000-0000-00000000e201',3,oe.fields())$$,'bill unavailable','other tenant cannot edit guessed bill ID');
select t.must_fail($$select public.agent_obligation_edit('00000000-0000-0000-0000-00000000e211','00000000-0000-0000-0000-00000000e201',1,oe.fields())$$,'bill unavailable','other tenant cannot replay private receipt by guessed request UUID');
select t.as_user('');
select t.must_fail($$select public.agent_obligation_edit(gen_random_uuid(),'00000000-0000-0000-0000-00000000e201',3,oe.fields())$$,'authenticated bill owner required','missing Auth identity cannot edit');
reset role;
select t.must_fail($$update public.agent_obligation_edits set after_snapshot='{}'$$,'immutable','privileged mutation cannot rewrite immutable receipt');
select t.must_fail($$truncate public.agent_obligation_edits$$,'immutable','privileged truncate cannot destroy immutable receipts');
select t.as_user('00000000-0000-0000-0000-0000000000e2');set role service_role;
select t.must_fail($$select public.agent_obligation_edit(gen_random_uuid(),'00000000-0000-0000-0000-00000000e201',3,oe.fields())$$,'permission denied','service JWT cannot impersonate owner approval by supplying Auth UID');
select t.must_fail($$select * from public.agent_obligation_edits$$,'permission denied','service role cannot read private edit snapshots directly');
select t.must_fail($$update public.agent_obligation_edits set request='{}'$$,'permission denied','service role cannot alter receipts directly');
reset role;

-- Every open execution state prevents edits that could misrepresent payment.
insert into public.agent_workflow_tasks(id,user_id,obligation_id,obligation_revision,state,plan)
 values('00000000-0000-0000-0000-00000000e220','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-00000000e202',1,'blocked','{}');
insert into public.agent_payment_attempts(id,user_id,task_id,obligation_id,idempotency_key,adapter_id,amount_cents,currency,status)
 values('00000000-0000-0000-0000-00000000e221','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-00000000e220','00000000-0000-0000-0000-00000000e202','edit:inflight','synthetic',2000,'USD','reserved');
do $$declare state text;begin
 foreach state in array array['reserved','submitted','processing','settled','unknown'] loop
  update public.agent_payment_attempts set status=state where id='00000000-0000-0000-0000-00000000e221';
  perform t.as_user('00000000-0000-0000-0000-0000000000e2');set local role authenticated;
  perform t.must_fail($q$select public.agent_obligation_edit(gen_random_uuid(),'00000000-0000-0000-0000-00000000e202',1,oe.fields())$q$,'payment unresolved','inflight or uncertain payment requires reconciliation before bill edit');
  reset role;
 end loop;
end $$;
select t.ok((select revision=1 and amount_due_cents=2000 from public.agent_obligations where id='00000000-0000-0000-0000-00000000e202'),'unresolved payment rejection leaves original debt facts intact');
insert into public.agent_obligations(id,user_id,source_key,creditor,amount_due_cents,due_on,status,minimum_due_cents,balance_cents,provider_key,provider_account_id,reference,funding_account_id,biller_url)
 values('00000000-0000-0000-0000-00000000e230','00000000-0000-0000-0000-0000000000e2','edit:old-bindings','Old creditor',5000,current_date,'verified',4000,8000,'old-provider','old-payee','old-reference','old-funding','https://example.invalid/old');
select t.as_user('00000000-0000-0000-0000-0000000000e2');set role authenticated;
select public.agent_obligation_edit('00000000-0000-0000-0000-00000000e231','00000000-0000-0000-0000-00000000e230',1,oe.fields(2500));
select t.ok((select minimum_due_cents is null and balance_cents is null and provider_key is null and provider_account_id is null and reference is null and funding_account_id is null and biller_url is null from public.agent_obligations where id='00000000-0000-0000-0000-00000000e230'),'new user facts cannot retain old payee bindings or unreviewed minimum/balance amounts');
select t.ok((select before_snapshot->>'reference'='old-reference' and before_snapshot->>'balance_cents'='8000' from public.agent_obligation_edits where request_id='00000000-0000-0000-0000-00000000e231'),'discarded old bindings remain in the immutable prior evidence');
reset role;
rollback;
