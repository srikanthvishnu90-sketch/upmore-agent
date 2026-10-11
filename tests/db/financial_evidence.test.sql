begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000e','e@example.com'),
 ('00000000-0000-0000-0000-00000000000f','f@example.com');
insert into public.simplefin_connections(user_id) values('00000000-0000-0000-0000-00000000000e');
create schema f;
create function f.batch(stamp timestamptz, source_stamp timestamptz, amount bigint, tx jsonb default '[]')
returns jsonb language sql as $$select jsonb_build_object('ok',true,'fetched_at',stamp,'errors','[]'::jsonb,
 'accounts',jsonb_build_array(jsonb_build_object('provider','simplefin','provider_account_id','a','account_id','simplefin:a',
 'name','Checking','currency','USD','account_kind','checking','balance_cents',amount,'available_cents',amount,'balance_as_of',source_stamp)),
 'transactions',tx)$$;
create function f.tx(id text, pending boolean, ref text default null) returns jsonb language sql as $$
 select jsonb_build_object('account_id','simplefin:a','provider_transaction_id',id,'currency','USD','amount_cents',-8500,
 'raw_amount','-85','posted_on',current_date,'merchant_raw','Utility','merchant_key','utility','is_pending',pending,
 'is_transfer',false,'pending_provider_id',ref)$$;
select public.agent_financial_ingest('00000000-0000-0000-0000-00000000000e',f.batch(now()-interval '10 minutes',now()-interval '10 minutes',100000,jsonb_build_array(f.tx('p',true))));
select t.ok((select count(*)=1 from public.agent_financial_accounts),'ingestion creates canonical account');
select public.agent_financial_ingest('00000000-0000-0000-0000-00000000000e',f.batch(now()-interval '9 minutes',now()-interval '20 minutes',200000));
select t.ok((select balance_cents=100000 from public.agent_financial_accounts),'older provider balance cannot overwrite newer source evidence');
select t.ok((select presence='not_seen' from public.agent_financial_transactions where provider_transaction_id='p'),'missing pending transaction becomes unknown, not cancelled');
select public.agent_financial_ingest('00000000-0000-0000-0000-00000000000e',f.batch(now()-interval '8 minutes',null,300000));
select t.ok((select balance_as_of is null and balance_cents=300000 from public.agent_financial_accounts),'unknown source timestamp never borrows prior balance freshness');
select t.ok((public.agent_financial_ingest('00000000-0000-0000-0000-00000000000e',f.batch(now()-interval '10 minutes',now(),400000))->>'ignored_stale_batch')::boolean,'out of order fetch is ignored');
select t.ok((select balance_cents=300000 from public.agent_financial_accounts),'ignored batch does not change balances');
select public.agent_financial_ingest('00000000-0000-0000-0000-00000000000e',f.batch(now()-interval '7 minutes',now()-interval '7 minutes',500000,jsonb_build_array(f.tx('posted',false,'p'))));
select t.ok((select presence='superseded' from public.agent_financial_transactions where provider_transaction_id='p'),'explicit pending reference reconciles within the account');
select public.agent_financial_ingest('00000000-0000-0000-0000-00000000000e',f.batch(now()-interval '6 minutes',now()-interval '6 minutes',500000,jsonb_build_array(f.tx('posted',true))));
select t.ok((select not is_pending from public.agent_financial_transactions where provider_transaction_id='posted'),'late pending response cannot regress posted transaction');
select t.ok((select count(*)=2 from public.agent_financial_transactions),'retries do not duplicate transaction history');
select t.must_fail($$select public.agent_financial_ingest('00000000-0000-0000-0000-00000000000e',jsonb_set(f.batch(now(),now(),1),'{accounts,0,currency}','"EUR"'))$$,'currency changed','currency mutation fails instead of changing existing transaction units');
select t.must_fail($$select public.agent_financial_ingest('00000000-0000-0000-0000-00000000000f',f.batch(now(),now(),1))$$,'connection unavailable','unconnected owner cannot receive financial evidence');
select t.as_user('00000000-0000-0000-0000-00000000000f');
set role authenticated;
select t.ok((select count(*)=0 from public.agent_financial_accounts),'account RLS isolates owners');
select t.ok((select count(*)=0 from public.agent_financial_transactions),'transaction RLS isolates owners');
select t.must_fail($$select public.agent_financial_ingest('00000000-0000-0000-0000-00000000000e','{}')$$,'permission denied','client cannot inject bank batches');
select t.must_fail($$insert into public.agent_account_preferences(user_id,account_id,account_kind) values('00000000-0000-0000-0000-00000000000f','simplefin:a','checking')$$,'permission denied','client cannot directly forge account preferences');
reset role;
create table f.candidates as select jsonb_build_array(jsonb_build_object('source_key','bank-pattern:'||repeat('a',64),'creditor','Utility','currency','USD','direction','payable','status','asserted','source_type','bank','amount_due_cents',8500,'due_on',current_date+1,'observed_at',now(),'funding_account_id','simplefin:a','evidence',jsonb_build_object('confidence','inferred'))) as batch;
select public.agent_financial_store_candidates('00000000-0000-0000-0000-00000000000e',(select batch from f.candidates));
select public.agent_financial_store_candidates('00000000-0000-0000-0000-00000000000e',(select batch from f.candidates));
select t.ok((select count(*)=1 from public.agent_obligations where user_id='00000000-0000-0000-0000-00000000000e'),'candidate retries do not create duplicate bills');
select t.ok((select status='asserted' and provider_key is null and autopay='unknown' from public.agent_obligations where user_id='00000000-0000-0000-0000-00000000000e'),'bank pattern never implies unpaid verified bill or payment connection');
create table f.ids as select id from public.agent_obligations where user_id='00000000-0000-0000-0000-00000000000e';
grant usage on schema f to authenticated;
grant select on f.ids to authenticated;
set role authenticated;
select t.must_fail($$select public.agent_obligation_confirm_candidate((select id from f.ids),'{}')$$,'candidate unavailable','other user cannot confirm a candidate');
reset role;
select t.as_user('00000000-0000-0000-0000-00000000000e');
set role authenticated;
select t.must_fail($$select public.agent_obligation_confirm_candidate((select id from f.ids),'{}')$$,'confirm the current','confirmation requires current amount and due date');
select public.agent_obligation_confirm_candidate((select id from f.ids),jsonb_build_object('confirmed',true,'amount_due_cents',8400,'due_on',current_date+2,'creditor','Utility reviewed','kind','utility','autopay','off'));
select t.ok((select source_type='user' and status='verified' and amount_due_cents=8400 and revision=2 and evidence->>'original_source'='bank' from public.agent_obligations),'review retains inference provenance and changes revision');
select public.agent_obligation_confirm_candidate((select id from f.ids),jsonb_build_object('confirmed',true,'amount_due_cents',8400,'due_on',current_date+2,'creditor','Utility reviewed','kind','utility','autopay','off'));
select t.ok((select revision=2 from public.agent_obligations),'confirmation retry does not change facts again');
select t.must_fail($$select public.agent_obligation_confirm_candidate((select id from f.ids),jsonb_build_object('confirmed',true,'amount_due_cents',9400,'due_on',current_date+2,'creditor','Utility reviewed','kind','utility','autopay','off'))$$,'different bill details','candidate retry cannot silently discard corrected amount');
select t.must_fail($$select public.agent_obligation_confirm_candidate((select id from f.ids),jsonb_build_object('confirmed',true,'amount_due_cents',8400,'due_on',current_date+2,'creditor','Other biller','kind','utility','autopay','off'))$$,'different bill details','candidate retry cannot silently discard corrected creditor');
select t.must_fail($$select public.agent_obligation_confirm_candidate((select id from f.ids),jsonb_build_object('confirmed',true,'amount_due_cents',8400,'due_on',current_date+2,'creditor','Utility reviewed','kind','utility','autopay','off','currency','EUR'))$$,'different bill details','candidate retry cannot ignore substituted currency');
select t.must_fail($$select public.agent_obligation_confirm_candidate((select id from f.ids),'{}')$$,'confirm the current','candidate replay must still contain explicit reviewed current facts');
reset role;
select public.agent_financial_store_candidates('00000000-0000-0000-0000-00000000000e',(select batch from f.candidates));
select t.ok((select amount_due_cents=8400 and status='verified' from public.agent_obligations where id=(select id from f.ids)),'refresh never overwrites user-confirmed bill');
insert into public.agent_settings(user_id) values('00000000-0000-0000-0000-00000000000e');
select public.agent_workflow_store_plan('00000000-0000-0000-0000-00000000000e',(select id from f.ids),2,jsonb_build_object('obligation_id',(select id from f.ids),'obligation_revision',2,'state','needs_connection'),null);
delete from public.simplefin_connections where user_id='00000000-0000-0000-0000-00000000000e';
select t.ok((select status='disconnected' from public.agent_financial_accounts),'disconnect invalidates account availability');
select t.ok((select state='cancelled' from public.agent_workflow_tasks where user_id='00000000-0000-0000-0000-00000000000e'),'disconnect revokes plans tied to connected funding account');
select t.ok((select count(*)=2 from public.agent_financial_transactions),'disconnect retains searchable financial history');
select t.must_fail($$select public.agent_financial_store_candidates('00000000-0000-0000-0000-00000000000e',(select batch from f.candidates))$$,'connection unavailable','disconnect prevents new inferred writes');
select t.ok((select coverage_complete=false from public.agent_financial_syncs),'sync never claims comprehensive bill coverage');

rollback;
