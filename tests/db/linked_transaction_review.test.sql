begin;
reset role;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000d2','linked@example.com'),('00000000-0000-0000-0000-0000000000d3','linked-other@example.com');
insert into public.agent_financial_accounts(user_id,account_id,provider,provider_account_id,name,currency,fetched_at)
select u,a,'simplefin',a,'Synthetic '||a,'USD',now() from unnest(array['00000000-0000-0000-0000-0000000000d2'::uuid,'00000000-0000-0000-0000-0000000000d3'::uuid]) u
cross join unnest(array['a','b']) a;
create schema lp;
create function lp.tx(id text,amount bigint,account text default 'a',stamp date default current_date,pending boolean default false) returns void language sql as $$
insert into public.agent_financial_transactions(user_id,account_id,provider_transaction_id,currency,amount_cents,posted_on,merchant_raw,merchant_key,is_pending,fetched_at)
values('00000000-0000-0000-0000-0000000000d2',account,id,'USD',amount,stamp,'Synthetic merchant','synthetic',pending,now())
$$;
select lp.tx('out',-1000),lp.tx('in',1000,'b'),lp.tx('same-account',1000),lp.tx('pending',1000,'b',current_date,true),
 lp.tx('original',-10000,'a',current_date-40),lp.tx('refund',3000),lp.tx('used-refund',2000),lp.tx('too-large-refund',9000),lp.tx('unreviewed',-30000);
select lp.tx('page-'||i,-123) from generate_series(1,55) i;
select lp.tx('candidate-'||i,123,'b') from generate_series(1,21) i;
insert into public.agent_financial_transactions(user_id,account_id,provider_transaction_id,currency,amount_cents,posted_on,merchant_raw,merchant_key,is_pending,fetched_at)
values('00000000-0000-0000-0000-0000000000d3','b','foreign','USD',1000,current_date,'Private merchant','private',false,now());
create function lp.review(id text,kind text,account text default 'a',linked text default null,linked_account text default 'b') returns jsonb language sql as $$
select jsonb_build_object('account_id',account,'transaction_id',id,'kind',kind,'fact_hash',
 (select fact_hash from public.agent_financial_transactions where user_id='00000000-0000-0000-0000-0000000000d2' and account_id=account and provider_transaction_id=id))
 ||case when linked is null then '{}'::jsonb else jsonb_build_object('linked_account_id',linked_account,'linked_transaction_id',linked,'linked_fact_hash',
 (select fact_hash from public.agent_financial_transactions where user_id='00000000-0000-0000-0000-0000000000d2' and account_id=linked_account and provider_transaction_id=linked)) end
$$;
grant usage on schema lp to authenticated;
grant execute on function lp.review(text,text,text,text,text) to authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000d2');
set role authenticated;
select public.agent_transaction_review(gen_random_uuid(),lp.review('original','expense')||'{"category":"Home"}');
select public.agent_transaction_review(gen_random_uuid(),lp.review('used-refund','refund','a','original','a'));
select t.ok(jsonb_array_length(public.agent_transaction_link_candidates(lp.review('refund','refund'))->'rows')=1,'refund search requires a current reviewed original, including outside report dates');
select t.ok((public.agent_transaction_link_candidates(lp.review('refund','refund'))->'rows'->0->>'remaining_refundable_cents')::bigint=8000,'refund search subtracts already reviewed current refunds');
select t.ok(jsonb_array_length(public.agent_transaction_link_candidates(lp.review('too-large-refund','refund'))->'rows')=0,'insufficient remaining refundable value is not offered');
select t.ok(jsonb_array_length(public.agent_transaction_link_candidates(lp.review('out','internal_transfer'))->'rows')=1,'transfer candidates exclude same account, pending and another owner');
select t.ok(jsonb_array_length(public.agent_transaction_link_candidates(lp.review('page-1','internal_transfer'))->'rows')=20,'possible matches have a twenty-record page limit');
select t.ok((public.agent_transaction_link_candidates(lp.review('page-1','internal_transfer'))->>'next_offset')::int=20,'candidate search probes an additional page');
select t.ok(jsonb_array_length(public.agent_transaction_link_candidates(lp.review('page-1','internal_transfer'),20)->'rows')=1,'remaining candidate page is not silently dropped');
select t.must_fail($$select public.agent_transaction_link_candidates(lp.review('out','refund'))$$,'posted USD','outflows cannot search refund originals');
select t.must_fail($$select public.agent_transaction_link_candidates(lp.review('out','internal_transfer')||'{"user_id":"other"}')$$,'invalid linked','search cannot specify another owner');
select t.must_fail($$select public.agent_transaction_link_candidates(lp.review('out','internal_transfer')||'{"fact_hash":"stale"}')$$,'facts changed','stale source hash cannot search current linked records');
select t.must_fail($$select public.agent_transaction_link_candidates(lp.review('out','internal_transfer'),-1)$$,'invalid linked','negative search page fails');
select t.ok(jsonb_array_length(public.agent_transaction_review_page(current_date-1,current_date)->'rows')=50,'review page has exactly fifty visible records');
select t.ok((public.agent_transaction_review_page(current_date-1,current_date)->>'next_offset')::int=50,'review page probes a next page');
select t.ok(jsonb_array_length(public.agent_transaction_review_page(current_date-1,current_date,50)->'rows')=33,'last page contains remaining owned posted records');
select t.ok((select bool_and(v->>'user_id'='00000000-0000-0000-0000-0000000000d2') from jsonb_array_elements(public.agent_transaction_review_page(current_date-1,current_date)->'rows') v),'review page excludes foreign records');
select t.ok((select v->'latest_review'->>'category'='Home' from jsonb_array_elements(public.agent_transaction_review_page(current_date-50,current_date,50)->'rows') v where v->>'provider_transaction_id'='original'),'review page includes latest interpretation from the same snapshot');
select public.agent_transaction_review_pair('00000000-0000-0000-0000-0000000000f2',lp.review('out','internal_transfer','a','in'));
select t.ok((select count(*)=2 from public.agent_transaction_reviews where kind='internal_transfer'),'one pair review saves reciprocal interpretations for both legs');
select public.agent_transaction_review_pair('00000000-0000-0000-0000-0000000000f2',lp.review('out','internal_transfer','a','in'));
select t.ok((select count(*)=2 from public.agent_transaction_reviews where kind='internal_transfer'),'retrying a pair request cannot duplicate either leg');
select t.must_fail($$select public.agent_transaction_review_pair('00000000-0000-0000-0000-0000000000f2',lp.review('out','credit_payment','a','in'))$$,'request changed','pair UUID binds classification and both record hashes');
select t.must_fail($$select public.agent_transaction_review_pair(gen_random_uuid(),lp.review('refund','refund','a','original','a'))$$,'transfer pair','pair operation cannot be used for an arbitrary refund');
select t.must_fail($$select public.agent_transaction_review_pair(gen_random_uuid(),lp.review('out','internal_transfer','a','in')||'{"linked_fact_hash":"stale"}')$$,'linked transaction facts changed','a stale linked leg rejects the whole pair');
select t.ok((select count(*)=2 from public.agent_transaction_reviews where kind='internal_transfer'),'failed pair leaves no extra review on either leg');
reset role;
create function lp.fail_second_leg() returns trigger language plpgsql as $$begin raise exception 'synthetic second leg failure';end $$;
create trigger synthetic_second_leg_failure before insert on public.agent_transaction_reviews
for each row when(new.provider_transaction_id='in') execute function lp.fail_second_leg();
set role authenticated;
select t.must_fail($$select public.agent_transaction_review_pair(gen_random_uuid(),lp.review('out','internal_transfer','a','in'))$$,'synthetic second leg failure','fault after the first leg insert rejects the whole transaction');
select t.ok((select count(*)=2 from public.agent_transaction_reviews where kind='internal_transfer'),'a second-leg storage failure rolls back the new first-leg interpretation');
select t.ok((select count(*)=1 from public.agent_transaction_review_pairs),'failed pair cannot leave a successful receipt');
reset role;drop trigger synthetic_second_leg_failure on public.agent_transaction_reviews;set role authenticated;
select t.must_fail($$update public.agent_transaction_review_pairs set result='{}'$$,'permission denied','review owner cannot rewrite pair receipts');
reset role;
select t.must_fail($$update public.agent_transaction_review_pairs set result='{}'$$,'immutable','privileged caller cannot rewrite pair receipts');
select t.must_fail($$truncate public.agent_transaction_review_pairs$$,'immutable','privileged caller cannot truncate pair receipts');
select t.must_fail($$truncate public.agent_transaction_reviews$$,'immutable','privileged caller cannot truncate user interpretations');
select t.as_user('00000000-0000-0000-0000-0000000000d3');set role authenticated;
select t.ok((select count(*)=0 from public.agent_transaction_review_pairs),'another owner cannot read pair receipts');
select t.must_fail($$select public.agent_transaction_link_candidates('{"account_id":"a","transaction_id":"out","kind":"internal_transfer","fact_hash":"anything"}')$$,'unavailable','another owner cannot search source records');
reset role;set role service_role;
select t.must_fail($$select public.agent_transaction_review_pair(gen_random_uuid(),'{}')$$,'permission denied','service-role model cannot approve pair interpretations');
select t.must_fail($$select public.agent_transaction_link_candidates('{}')$$,'permission denied','candidate RPC requires the authenticated user route');
select t.must_fail($$insert into public.agent_transaction_review_pairs(user_id,request_id,request,result) values('00000000-0000-0000-0000-0000000000d2',gen_random_uuid(),'{}','{}')$$,'permission denied','service role cannot forge a pair receipt through a direct table write');
select t.must_fail($$insert into public.agent_transaction_reviews(user_id,account_id,provider_transaction_id,review_revision,request_id,request,fact_hash,kind) values('00000000-0000-0000-0000-0000000000d2','a','out',99,gen_random_uuid(),'{}','forged','internal_transfer')$$,'permission denied','service role cannot forge a user interpretation through a direct table write');
reset role;
delete from auth.users where id='00000000-0000-0000-0000-0000000000d2';
select t.ok((select count(*)=0 from public.agent_transaction_review_pairs),'account deletion removes pair history through the owner cascade');
rollback;
