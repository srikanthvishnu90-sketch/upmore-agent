begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000d0','ledger@example.com'),('00000000-0000-0000-0000-0000000000d1','ledger-other@example.com');
insert into public.simplefin_connections(user_id) values('00000000-0000-0000-0000-0000000000d0');
create schema lr;
create function lr.tx(id text,amount bigint,account text default 'a',pending boolean default false) returns jsonb language sql as $$
select jsonb_build_object('account_id','simplefin:'||account,'provider_transaction_id',id,'currency','USD','amount_cents',amount,
 'raw_amount',amount::text,'posted_on',current_date,'merchant_raw','Synthetic merchant','merchant_key','synthetic','is_pending',pending,'is_transfer',false)
$$;
create function lr.batch(stamp timestamptz,tx jsonb) returns jsonb language sql as $$
select jsonb_build_object('ok',true,'fetched_at',stamp,'errors','[]'::jsonb,'transactions',tx,
 'accounts',jsonb_build_array(
 jsonb_build_object('provider','simplefin','provider_account_id','a','account_id','simplefin:a','name','Checking','currency','USD','account_kind','checking','balance_cents',100000,'available_cents',100000,'balance_as_of',stamp),
 jsonb_build_object('provider','simplefin','provider_account_id','b','account_id','simplefin:b','name','Savings','currency','USD','account_kind','savings','balance_cents',10000,'available_cents',10000,'balance_as_of',stamp)))
$$;
create function lr.review(id text,kind text,linked text default null,account text default 'a',linked_account text default 'a') returns jsonb language sql as $$
 select jsonb_build_object('account_id','simplefin:'||account,'transaction_id',id,'fact_hash',
 (select fact_hash from public.agent_financial_transactions where user_id='00000000-0000-0000-0000-0000000000d0' and account_id='simplefin:'||account and provider_transaction_id=id),'kind',kind)
 ||case when linked is null then '{}'::jsonb else jsonb_build_object('linked_account_id','simplefin:'||linked_account,'linked_transaction_id',linked,
 'linked_fact_hash',(select fact_hash from public.agent_financial_transactions where user_id='00000000-0000-0000-0000-0000000000d0' and account_id='simplefin:'||linked_account and provider_transaction_id=linked)) end
$$;
create table lr.batch_value as select lr.batch(now()-interval '2 minutes',jsonb_build_array(lr.tx('expense',-10000),lr.tx('refund',4000),lr.tx('refund-too-much',7000),lr.tx('transfer-a',-5000),lr.tx('transfer-b',5000,'b'),lr.tx('pending',-100,'a',true))) as value;
grant usage on schema lr to authenticated;
grant execute on all functions in schema lr to authenticated;
select public.agent_financial_ingest('00000000-0000-0000-0000-0000000000d0',(select value from lr.batch_value));
select public.agent_financial_ingest('00000000-0000-0000-0000-0000000000d0',(select value from lr.batch_value));
select t.ok((select count(*)=1 from public.agent_financial_ingestions),'replayed normalized batch has one immutable ingestion record');
select t.ok((select count(*)=6 and bool_and(revision=1) from public.agent_transaction_revisions),'each new transaction has a first fact snapshot');
select t.must_fail($$update public.agent_transaction_revisions set snapshot='{}'$$,'immutable','privileged caller cannot rewrite source revisions');
select t.must_fail($$delete from public.agent_financial_ingestions$$,'immutable','privileged caller cannot remove owned ingestion evidence');
select t.as_user('00000000-0000-0000-0000-0000000000d0');
set role authenticated;
select t.must_fail($$select public.agent_financial_ingest_base('00000000-0000-0000-0000-0000000000d0','{}')$$,'permission denied','client cannot bypass the ingestion journal');
select t.must_fail($$select public.agent_transaction_review(gen_random_uuid(),lr.review('pending','expense'))$$,'posted USD','pending evidence cannot be classified as posted spending');
select t.must_fail($$select public.agent_transaction_review(gen_random_uuid(),lr.review('expense','income'))$$,'direction','negative expense cannot be asserted as earned income');
select t.must_fail($$select public.agent_transaction_review(gen_random_uuid(),lr.review('expense','expense')||jsonb_build_object('user_id','00000000-0000-0000-0000-0000000000d1'))$$,'invalid transaction review','review cannot select another owner');
select public.agent_transaction_review('00000000-0000-0000-0000-0000000000e0',lr.review('expense','expense')||'{"category":"Housing"}');
select public.agent_transaction_review('00000000-0000-0000-0000-0000000000e0',lr.review('expense','expense')||'{"category":"Housing"}');
select t.ok((select count(*)=1 from public.agent_transaction_reviews),'same reviewed request is idempotent');
select t.must_fail($$select public.agent_transaction_review('00000000-0000-0000-0000-0000000000e0',lr.review('expense','expense')||'{"category":"Food"}')$$,'request changed','same request cannot acquire different review terms');
select public.agent_transaction_review(gen_random_uuid(),lr.review('refund','refund','expense'));
select t.ok((select category='Housing' from public.agent_transaction_reviews where kind='refund'),'refund inherits the current reviewed expense category');
select t.must_fail($$select public.agent_transaction_review(gen_random_uuid(),lr.review('refund-too-much','refund','expense'))$$,'exceeds original','combined refunds cannot exceed the original cost');
select t.must_fail($$select public.agent_transaction_review(gen_random_uuid(),lr.review('refund','refund','expense')||'{"category":"Other"}')$$,'category must match','refund cannot be moved to a fabricated category');
select t.must_fail($$select public.agent_transaction_review(gen_random_uuid(),lr.review('transfer-a','internal_transfer','refund'))$$,'opposite account legs','matching amount or merchant is insufficient for transfer reconciliation');
select public.agent_transaction_review(gen_random_uuid(),lr.review('transfer-a','internal_transfer','transfer-b','a','b'));
select public.agent_transaction_review(gen_random_uuid(),lr.review('transfer-b','internal_transfer','transfer-a','b','a'));
select t.ok((select count(*)=2 from public.agent_transaction_reviews where kind='internal_transfer'),'both owned opposite transfer legs have explicit reviewed interpretations');
reset role;
grant usage on schema lr to authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
select t.ok((select count(*)=0 from public.agent_transaction_reviews),'another tenant cannot read transaction interpretations');
select t.ok((select count(*)=0 from public.agent_transaction_revisions),'another tenant cannot read source history');
select t.ok((select count(*)=0 from public.agent_financial_ingestions),'another tenant cannot read normalized ingestion payloads');
select t.must_fail($$select public.agent_transaction_review(gen_random_uuid(),'{"account_id":"simplefin:a","transaction_id":"expense","kind":"expense","fact_hash":"x"}')$$,'unavailable','another owner cannot classify the transaction');
reset role;
-- A refresh without changed facts is not a new economic revision.
select public.agent_financial_ingest('00000000-0000-0000-0000-0000000000d0',lr.batch(now()-interval '1 minute',jsonb_build_array(lr.tx('expense',-10000))));
select t.ok((select revision=1 from public.agent_financial_transactions where provider_transaction_id='expense'),'fresh retrieval does not invalidate unchanged economic facts');
select public.agent_financial_ingest('00000000-0000-0000-0000-0000000000d0',lr.batch(now(),jsonb_build_array(lr.tx('expense',-9000))));
select t.ok((select revision=2 from public.agent_financial_transactions where provider_transaction_id='expense'),'provider correction creates a second source revision');
select t.ok((select count(*)=2 and min((snapshot->>'amount_cents')::bigint)=-10000 and max((snapshot->>'amount_cents')::bigint)=-9000 from public.agent_transaction_revisions where provider_transaction_id='expense'),'corrected expense preserves both historical exact amounts');
select t.ok((select r.fact_hash<>t.fact_hash from public.agent_transaction_reviews r join public.agent_financial_transactions t using(user_id,account_id,provider_transaction_id) where r.kind='expense'),'old review remains immutable and visibly stale after correction');
select t.as_user('00000000-0000-0000-0000-0000000000d0');
set role authenticated;
select t.must_fail($$select public.agent_transaction_review(gen_random_uuid(),(select request from public.agent_transaction_reviews where kind='expense'))$$,'facts changed','stale displayed facts require renewed review');
select t.must_fail($$select public.agent_transaction_review(gen_random_uuid(),lr.review('refund','refund','expense'))$$,'current reviewed original','refund cannot silently rely on corrected original expense');
select t.must_fail($$update public.agent_transaction_reviews set kind='income'$$,'permission denied','client cannot rewrite a review record');
reset role;
set role service_role;
select t.must_fail($$select public.agent_transaction_review(gen_random_uuid(),'{}')$$,'permission denied','financial agent service cannot impersonate a user review');
reset role;
delete from auth.users where id='00000000-0000-0000-0000-0000000000d0';
select t.ok((select count(*)=0 from public.agent_transaction_reviews),'account deletion removes owned interpretation history');
select t.ok((select count(*)=0 from public.agent_transaction_revisions),'account deletion removes owned source history');
select t.ok((select count(*)=0 from public.agent_financial_ingestions),'account deletion removes owned ingestion evidence');
rollback;
