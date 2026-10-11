begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000161','applied-regression@example.com');
insert into public.agent_settings(user_id,buffer) values('00000000-0000-0000-0000-000000000161',50);
insert into public.agent_biller_connections(id,user_id,provider_key,provider_account_id,capabilities) values
 ('00000000-0000-0000-0000-000000000162','00000000-0000-0000-0000-000000000161','applied_biller','resident','{"read_obligations":true}');
insert into public.agent_obligations(id,user_id,source_key,creditor,provider_key,provider_account_id,reference,source_type,status,kind,amount_due_cents,due_on,autopay,funding_account_id)
 values('00000000-0000-0000-0000-000000000163','00000000-0000-0000-0000-000000000161','invoice','Rent','applied_biller','resident','invoice','biller','verified','rent',10000,current_date+1,'off','funding');
insert into public.agent_biller_records(connection_id,user_id,external_id,obligation_id,source_version,source_hash)
 values('00000000-0000-0000-0000-000000000162','00000000-0000-0000-0000-000000000161','invoice','00000000-0000-0000-0000-000000000163',1,repeat('a',64));
insert into public.agent_payment_adapters(id,verified,providers,funding_providers,currencies,kinds,fee_cents,idempotent,reconciles)
 values('applied_adapter',true,array['applied_biller'],array['test_bank'],array['USD'],array['rent'],0,true,true);
insert into public.agent_payment_funding_accounts(user_id,id,provider_key,provider_account_id,currency,verified,available_cents,observed_at)
 values('00000000-0000-0000-0000-000000000161','funding','test_bank','bank_account','USD',true,50000,now());
insert into public.agent_payment_coverage(user_id,complete,observed_at) values('00000000-0000-0000-0000-000000000161',true,now());
create schema applied_regression;
create function applied_regression.plan() returns jsonb language sql as $$
 select jsonb_build_object('obligation_id',o.id,'obligation_revision',o.revision,'state','awaiting_approval',
 'proposal',jsonb_build_object('action','pay_obligation','obligation_id',o.id,'obligation_revision',o.revision,'amount_cents',o.amount_due_cents,
 'fee_cents',0,'currency','USD','provider_key',o.provider_key,'provider_account_id',o.provider_account_id,'reference',o.reference,
 'funding_account_id',o.funding_account_id,'adapter_id','applied_adapter','due_on',o.due_on,'expires_at',now()+interval '15 minutes'))
 from public.agent_obligations o where o.id='00000000-0000-0000-0000-000000000163'
$$;
create table applied_regression.task as select public.agent_workflow_store_plan('00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000163',1,applied_regression.plan(),repeat('a',64)) r;
grant usage on schema applied_regression to authenticated;
grant select on applied_regression.task to authenticated;
select t.as_user('00000000-0000-0000-0000-000000000161');
set role authenticated;
select public.agent_workflow_approve((select (r->>'id')::uuid from applied_regression.task),repeat('a',64));
reset role;
create table applied_regression.attempt as select public.agent_payment_reserve((select (r->>'id')::uuid from applied_regression.task),repeat('a',64)) r;
create table applied_regression.lease as select public.agent_payment_claim((select (r->>'id')::uuid from applied_regression.attempt),45) r;
select public.agent_payment_begin_submission((select (r->>'id')::uuid from applied_regression.attempt),(select (r->>'lease_token')::uuid from applied_regression.lease));

-- Real ingest revises the still-unpaid source before the original creditor
-- allocation receipt arrives. The old authorization is revoked, but its
-- submitted payment must still be reconciled against the original snapshot.
select public.agent_biller_ingest('00000000-0000-0000-0000-000000000162',jsonb_build_array(jsonb_build_object(
 'external_id','invoice','source_version',2,'source_hash',repeat('b',64),
 'obligation',(select to_jsonb(o)||jsonb_build_object('amount_due_cents',10500,'observed_at',now(),'evidence',jsonb_build_object('unpaid_confirmed',true))
 from public.agent_obligations o where id='00000000-0000-0000-0000-000000000163'))));
select public.agent_payment_record_event((select (r->>'id')::uuid from applied_regression.attempt),'applied_adapter',jsonb_build_object(
 'provider_event_id','applied-original','provider_payment_id','payment-original','idempotency_key',(select r->>'idempotency_key' from applied_regression.attempt),
 'reference','invoice','provider_account_id','resident','currency','USD','amount_cents',10000,'status','applied','applied_reference','creditor-allocation-original'));
select t.ok((select status='verified' and amount_due_cents=10500 and revision>1 from public.agent_obligations where id='00000000-0000-0000-0000-000000000163'),'revised creditor amount remains unresolved after original payment application');
select t.ok((select status='applied' and amount_cents=10000 and provider_payment_id='payment-original' and evidence->>'applied_reference'='creditor-allocation-original' from public.agent_payment_attempts where id=(select (r->>'id')::uuid from applied_regression.attempt)),'original applied amount and exact provider allocation remain preserved');
update public.agent_payment_funding_accounts set observed_at=now() where user_id='00000000-0000-0000-0000-000000000161';
select t.must_fail($$select public.agent_workflow_store_plan('00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000163',(select revision from public.agent_obligations where id='00000000-0000-0000-0000-000000000163'),applied_regression.plan(),repeat('b',64))$$,'remaining debt reconciliation','direct service planning cannot authorize a second full revised payment');
select t.ok((select count(*)=1 from public.agent_workflow_tasks where user_id='00000000-0000-0000-0000-000000000161'),'blocked proposal leaves no second task or approval');

-- Even another source version observed after the receipt cannot prove that
-- the debt amount incorporates it. Arbitrary evidence booleans do not clear
-- the hold; a separate typed reconciliation protocol is required.
select public.agent_biller_ingest('00000000-0000-0000-0000-000000000162',jsonb_build_array(jsonb_build_object(
 'external_id','invoice','source_version',3,'source_hash',repeat('c',64),
 'obligation',(select to_jsonb(o)||jsonb_build_object('observed_at',now(),'evidence',jsonb_build_object('unpaid_confirmed',true,'payment_reconciled',true,'remaining_due_confirmed',true))
 from public.agent_obligations o where id='00000000-0000-0000-0000-000000000163'))));
select t.must_fail($$select public.agent_workflow_store_plan('00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000163',(select revision from public.agent_obligations where id='00000000-0000-0000-0000-000000000163'),applied_regression.plan(),repeat('b',64))$$,'remaining debt reconciliation','later source revision and evidence flags cannot clear applied history');

-- Simulate a legacy already-authorized task with privileged fixture insertion.
-- The final execution boundary must independently stop it, not rely on UI or
-- on callers going through the planner.
insert into public.agent_workflow_tasks(id,user_id,obligation_id,obligation_revision,generation,state,plan,snapshot_hash,approved_snapshot,approved_at)
 select '00000000-0000-0000-0000-000000000164',user_id,id,revision,1,'authorized',applied_regression.plan(),repeat('b',64),applied_regression.plan()->'proposal',now()
 from public.agent_obligations where id='00000000-0000-0000-0000-000000000163';
select t.must_fail($$select public.agent_payment_preflight('00000000-0000-0000-0000-000000000164')$$,'remaining debt reconciliation','preflight independently rejects a legacy second authorization');
select t.must_fail($$select public.agent_payment_reserve('00000000-0000-0000-0000-000000000164',repeat('b',64))$$,'remaining debt reconciliation','no second reservation can bypass applied-payment reconciliation');
select t.ok((select count(*)=1 from public.agent_payment_attempts where user_id='00000000-0000-0000-0000-000000000161'),'only the original payment attempt exists');

select t.ok((public.agent_workflow_store_plan('00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000163',
 (select revision from public.agent_obligations where id='00000000-0000-0000-0000-000000000163'),
 applied_regression.plan()||jsonb_build_object('state','needs_sync','code','applied_payment_reconciliation_required','proposal',null),null)->>'state')='needs_sync',
 'read-only applied reconciliation assessment supersedes legacy unsubmitted authority');
select t.ok((select state='cancelled' and revoked_at is not null from public.agent_workflow_tasks where id='00000000-0000-0000-0000-000000000164'),
 'legacy unsubmitted authorization is revoked before persisting the hold');
select t.ok((select status='applied' and provider_payment_id='payment-original' from public.agent_payment_attempts where id=(select (r->>'id')::uuid from applied_regression.attempt)),
 'persisting the hold never cancels or overwrites the original submitted effect');

set role service_role;
select t.must_fail($$select public.agent_payment_preflight_before_applied_guard('00000000-0000-0000-0000-000000000164')$$,'permission denied','service cannot bypass the applied guard through internal preflight');
select t.must_fail($$select public.agent_workflow_store_plan_before_applied_guard(null,null,1,'{}',null)$$,'permission denied','service cannot bypass the applied guard through internal planning');
reset role;
rollback;
