begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000001','payment1@example.com');
insert into public.agent_settings(user_id,buffer) values('00000000-0000-0000-0000-000000000001',50);
insert into public.agent_biller_connections(id,user_id,provider_key,provider_account_id,capabilities) values
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000001','test_biller','resident','{"read_obligations":true}');
insert into public.agent_obligations(id,user_id,source_key,creditor,provider_key,provider_account_id,reference,source_type,status,kind,amount_due_cents,due_on,autopay,funding_account_id)
 values('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000001','invoice','Rent','test_biller','resident','invoice','biller','verified','rent',8500,current_date+1,'off','funding');
insert into public.agent_biller_records(connection_id,user_id,external_id,obligation_id,source_version,source_hash)
 values('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000001','invoice','22222222-2222-2222-2222-222222222222',1,repeat('a',64));
create schema pay;
create function pay.plan() returns jsonb language sql as $$select jsonb_build_object('obligation_id','22222222-2222-2222-2222-222222222222','obligation_revision',1,'state','awaiting_approval',
 'proposal',jsonb_build_object('action','pay_obligation','obligation_id','22222222-2222-2222-2222-222222222222','obligation_revision',1,'amount_cents',8500,'fee_cents',0,'currency','USD','provider_key','test_biller','provider_account_id','resident','reference','invoice','funding_account_id','funding','adapter_id','test_adapter','due_on',current_date+1,'expires_at',now()+interval '15 minutes'))$$;
create table pay.tasks as select public.agent_workflow_store_plan('00000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',1,pay.plan(),repeat('a',64)) as r;
grant usage on schema pay to authenticated;
grant select on pay.tasks to authenticated;
select t.as_user('00000000-0000-0000-0000-000000000001');
set role authenticated;
select public.agent_workflow_approve((select (r->>'id')::uuid from pay.tasks),repeat('a',64));
select t.must_fail($$select public.agent_payment_reserve((select (r->>'id')::uuid from pay.tasks),repeat('a',64))$$,'permission denied','client cannot reserve or submit payments directly');
reset role;
select t.must_fail($$select public.agent_payment_reserve((select (r->>'id')::uuid from pay.tasks),repeat('a',64))$$,'adapter unavailable','approval does not enable an unregistered adapter');
insert into public.agent_payment_adapters(id,verified,providers,funding_providers,currencies,kinds,fee_cents,idempotent,reconciles)
 values('test_adapter',true,array['test_biller'],array['test_bank'],array['USD'],array['rent'],0,true,true);
select t.must_fail($$select public.agent_payment_reserve((select (r->>'id')::uuid from pay.tasks),repeat('a',64))$$,'funding unavailable','read-only bank evidence cannot establish payment funding');
insert into public.agent_payment_funding_accounts(user_id,id,provider_key,provider_account_id,currency,verified,available_cents,observed_at)
 values('00000000-0000-0000-0000-000000000001','funding','test_bank','bank_account','USD',true,20000,now());
select t.must_fail($$select public.agent_payment_reserve((select (r->>'id')::uuid from pay.tasks),repeat('a',64))$$,'coverage incomplete','unknown other bills cannot become zero');
insert into public.agent_payment_coverage(user_id,complete,observed_at) values('00000000-0000-0000-0000-000000000001',true,now());
select t.must_fail($$select public.agent_payment_reserve((select (r->>'id')::uuid from pay.tasks),repeat('b',64))$$,'hash mismatch','reservation requires exact reviewed snapshot');
create table pay.attempts as select public.agent_payment_reserve((select (r->>'id')::uuid from pay.tasks),repeat('a',64)) as r;
select public.agent_payment_reserve((select (r->>'id')::uuid from pay.tasks),repeat('a',64));
select t.ok((select count(*)=1 from public.agent_payment_attempts),'reservation retry reuses one attempt and idempotency key');
create table pay.leases as select public.agent_payment_claim((select (r->>'id')::uuid from pay.attempts),45) as r;
select t.ok(public.agent_payment_claim((select (r->>'id')::uuid from pay.attempts),45) is null,'one worker holds a live lease');
update public.agent_payment_funding_accounts set available_cents=100;
select t.must_fail($$select public.agent_payment_begin_submission((select (r->>'id')::uuid from pay.attempts),(select (r->>'lease_token')::uuid from pay.leases))$$,'breach cash buffer','funds are rechecked immediately before submission');
select public.agent_payment_cancel_reserved((select (r->>'id')::uuid from pay.attempts),(select (r->>'lease_token')::uuid from pay.leases));
select t.ok((select status='cancelled' and submission_started_at is null from public.agent_payment_attempts),'failed preflight cancels without claiming a submission');
update public.agent_payment_funding_accounts set available_cents=20000;
update pay.tasks set r=public.agent_workflow_store_plan('00000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',1,pay.plan(),repeat('b',64));
select t.ok((select (r->>'generation')::integer=2 from pay.tasks),'new review creates a distinct approval round on the same bill revision');
set role authenticated;
select public.agent_workflow_approve((select (r->>'id')::uuid from pay.tasks),repeat('b',64));
reset role;
update pay.attempts set r=public.agent_payment_reserve((select (r->>'id')::uuid from pay.tasks),repeat('b',64));
update pay.leases set r=public.agent_payment_claim((select (r->>'id')::uuid from pay.attempts),45);
select public.agent_payment_begin_submission((select (r->>'id')::uuid from pay.attempts),(select (r->>'lease_token')::uuid from pay.leases));
select t.ok((select status='submitted' and submission_started_at is not null from public.agent_payment_attempts where id=(select (r->>'id')::uuid from pay.attempts)),'submission marker is durable before provider call');
select t.must_fail($$select public.agent_payment_begin_submission((select (r->>'id')::uuid from pay.attempts),(select (r->>'lease_token')::uuid from pay.leases))$$,'already started','same approval cannot submit twice');
select public.agent_payment_uncertain((select (r->>'id')::uuid from pay.attempts),(select (r->>'lease_token')::uuid from pay.leases));
select t.ok((select status='unknown' from public.agent_payment_attempts where id=(select (r->>'id')::uuid from pay.attempts)),'timeout retains an open uncertain attempt');
create function pay.event(eid text,state text) returns jsonb language sql as $$select jsonb_build_object('provider_event_id',eid,'provider_payment_id','payment-1','idempotency_key',(select r->>'idempotency_key' from pay.attempts),'reference','invoice','provider_account_id','resident','currency','USD','amount_cents',8500,'status',state,'applied_reference',case when state='applied' then 'allocation-1' else null end)$$;
select t.must_fail($$select public.agent_payment_record_event((select (r->>'id')::uuid from pay.attempts),'test_adapter',jsonb_set(pay.event('wrong','settled'),'{provider_account_id}','"someone-else"'))$$,'unmatched','wrong loan or resident event cannot settle a payment');
select public.agent_payment_record_event((select (r->>'id')::uuid from pay.attempts),'test_adapter',pay.event('settled','settled'));
select t.ok((select status='verified' and amount_due_cents=8500 from public.agent_obligations),'bank settlement alone does not mark bill paid');
select t.ok((public.agent_payment_record_event((select (r->>'id')::uuid from pay.attempts),'test_adapter',pay.event('settled','settled'))->>'duplicate')::boolean,'provider event replay is idempotent');
select t.must_fail($$select public.agent_payment_record_event((select (r->>'id')::uuid from pay.attempts),'test_adapter',pay.event('settled','processing'))$$,'conflicting','event ID reuse with different facts fails');
select t.ok((public.agent_payment_record_event((select (r->>'id')::uuid from pay.attempts),'test_adapter',pay.event('old','processing'))->>'ignored_late')::boolean,'late processing cannot regress settlement');
select public.agent_payment_record_event((select (r->>'id')::uuid from pay.attempts),'test_adapter',pay.event('applied','applied'));
select t.ok((select status='settled' and amount_due_cents=0 from public.agent_obligations),'matched creditor allocation closes the bill');
select t.ok((select state='resolved' and revoked_at is null from public.agent_workflow_tasks where id=(select (r->>'id')::uuid from pay.tasks)),'receipt resolves task instead of self-cancelling');
select t.ok((select observed_at is null from public.agent_payment_funding_accounts),'after payment, funds require fresh evidence before another spend');
select public.agent_payment_record_event((select (r->>'id')::uuid from pay.attempts),'test_adapter',pay.event('returned','returned'));
select t.ok((select status='asserted' and amount_due_cents is null and evidence->>'refresh_required'='true' from public.agent_obligations),'returned payment reopens bill for authoritative refresh without inventing a new amount');
select t.ok((select status='returned' from public.agent_payment_attempts where id=(select (r->>'id')::uuid from pay.attempts)),'return remains in payment history');
select t.ok((select state='resolved' from public.agent_workflow_tasks where id=(select (r->>'id')::uuid from pay.tasks)),'return retains the historical receipt task');
rollback;
