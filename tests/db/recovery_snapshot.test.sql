begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000181','recovery-owner@example.com'),
 ('00000000-0000-0000-0000-000000000182','recovery-foreign@example.com'),
 ('00000000-0000-0000-0000-000000000183','recovery-cap@example.com'),
 ('00000000-0000-0000-0000-000000000184','recovery-empty@example.com'),
 ('00000000-0000-0000-0000-000000000185','recovery-account-cap@example.com');
insert into public.agent_financial_accounts(user_id,account_id,provider,provider_account_id,name,currency,fetched_at)
 values
 ('00000000-0000-0000-0000-000000000181','shared','simplefin','a','Checking','USD',now()),
 ('00000000-0000-0000-0000-000000000181','savings','simplefin','b','Savings','USD',now()),
 ('00000000-0000-0000-0000-000000000182','shared','simplefin','a','Foreign private account','USD',now()),
 ('00000000-0000-0000-0000-000000000182','foreign-only','simplefin','b','Foreign only','USD',now()),
 ('00000000-0000-0000-0000-000000000183','many-transactions','simplefin','a','Cap fixture','USD',now());
insert into public.agent_financial_transactions(user_id,account_id,provider_transaction_id,currency,amount_cents,posted_on,merchant_raw,merchant_key,is_pending,fetched_at)
 values
 ('00000000-0000-0000-0000-000000000181','shared','posted','USD',-3500,current_date,'Monthly maintenance fee','fee',false,now()),
 ('00000000-0000-0000-0000-000000000181','shared','undated-hold','USD',-1000,null,'Hold','hold',true,now()),
 ('00000000-0000-0000-0000-000000000181','savings','credit','USD',3500,current_date,'Credit','credit',false,now()),
 ('00000000-0000-0000-0000-000000000182','shared','posted','USD',-9999,current_date,'Foreign private merchant','foreign',false,now());
insert into public.agent_financial_syncs(user_id,provider,fetched_at,requested_start,requested_end,errors,status)
 values ('00000000-0000-0000-0000-000000000181','simplefin',now(),current_date-90,current_date,'["private-provider-error"]','error'),
 ('00000000-0000-0000-0000-000000000182','simplefin',now(),current_date-90,current_date,'[]','active');
create schema recovery_fixture;
select t.as_user('00000000-0000-0000-0000-000000000181');
create table recovery_fixture.before as select public.agent_recovery_snapshot(null) as snapshot,
 (select count(*) from public.agent_transaction_revisions where user_id=auth.uid()) as revisions,
 (select count(*) from public.agent_transaction_reviews where user_id=auth.uid()) as reviews;
grant usage on schema recovery_fixture to authenticated;
grant select on recovery_fixture.before to authenticated;
set role authenticated;
select t.ok((public.agent_recovery_snapshot()->>'owner_id')=auth.uid()::text,'recovery snapshot resolves owner from authenticated identity');
select t.ok(jsonb_array_length(public.agent_recovery_snapshot()->'transactions')=3 and jsonb_array_length(public.agent_recovery_snapshot()->'accounts')=2,'null account returns complete bounded owned retained snapshot');
select t.ok(jsonb_array_length(public.agent_recovery_snapshot('shared')->'transactions')=2 and jsonb_array_length(public.agent_recovery_snapshot('shared')->'accounts')=1,'selected account scopes transactions and account labels together');
select t.ok(not exists(select 1 from jsonb_array_elements(public.agent_recovery_snapshot()->'transactions') x where x->>'user_id'<>auth.uid()::text),'same account and provider IDs cannot disclose foreign transactions');
select t.ok(not exists(select 1 from jsonb_array_elements(public.agent_recovery_snapshot()->'accounts') x where x->>'user_id'<>auth.uid()::text),'all returned account metadata belongs to authenticated owner');
select t.ok(jsonb_array_length(public.agent_recovery_snapshot()->'syncs')=1 and public.agent_recovery_snapshot()->'syncs'->0->>'user_id'=auth.uid()::text,'sync metadata cannot disclose another owner');
select t.ok(public.agent_recovery_snapshot()->'syncs'->0->>'error_count'='1' and not(public.agent_recovery_snapshot()->'syncs'->0 ? 'errors'),'sync errors expose a count rather than private provider messages');
select t.ok(exists(select 1 from jsonb_array_elements(public.agent_recovery_snapshot()->'transactions') x where x->>'provider_transaction_id'='undated-hold' and x->'posted_on'='null'::jsonb and x->>'is_pending'='true'),'undated pending evidence remains explicitly unknown');
select t.ok(not exists(select 1 from jsonb_array_elements(public.agent_recovery_snapshot()->'transactions') x where x->>'fact_hash' !~ '^[a-f0-9]{64}$' or (x->>'revision')::integer<1),'snapshot carries current fact hashes and revisions');
select t.ok(not exists(select 1 from jsonb_array_elements(public.agent_recovery_snapshot()->'transactions') x where x ? 'raw_amount') and not exists(select 1 from jsonb_array_elements(public.agent_recovery_snapshot()->'accounts') x where x ? 'raw_balance' or x ? 'provider_account_id'),'projection excludes unneeded raw and upstream account fields');
select t.must_fail($$select public.agent_recovery_snapshot('foreign-only')$$,'account unavailable','foreign account request cannot fall back to a global scan');
select t.must_fail($$select public.agent_recovery_snapshot('missing')$$,'account unavailable','unknown account request cannot fall back to a global scan');
select t.must_fail($$select public.agent_recovery_snapshot('')$$,'invalid recovery account','empty account does not mean all accounts');
select t.must_fail($$select public.agent_recovery_snapshot('   ')$$,'invalid recovery account','blank account is rejected');
select t.must_fail($$select public.agent_recovery_snapshot(' shared ')$$,'invalid recovery account','trimmed alias cannot change exact account scope');
select t.must_fail($$select public.agent_recovery_snapshot(repeat('a',201))$$,'invalid recovery account','oversized account identifiers are rejected');
select t.must_fail($$select public.agent_recovery_snapshot(E'shared\n')$$,'invalid recovery account','control characters are rejected');
select t.ok(public.agent_recovery_snapshot()=(select snapshot from recovery_fixture.before) and
 (select count(*) from public.agent_transaction_revisions where user_id=auth.uid())=(select revisions from recovery_fixture.before) and
 (select count(*) from public.agent_transaction_reviews where user_id=auth.uid())=(select reviews from recovery_fixture.before),'repeated recovery reads never write facts reviews or revisions');
reset role;
select t.as_user('00000000-0000-0000-0000-000000000184');
set role authenticated;
select t.ok(public.agent_recovery_snapshot()->'transactions'='[]'::jsonb and public.agent_recovery_snapshot()->'accounts'='[]'::jsonb and public.agent_recovery_snapshot()->'syncs'='[]'::jsonb,'owner with no records receives honest empty arrays');
reset role;
select t.as_user(null);
set role authenticated;
select t.must_fail($$select public.agent_recovery_snapshot(null)$$,'authenticated recovery owner required','missing authenticated subject fails closed');
reset role;
select t.as_user('00000000-0000-0000-0000-000000000181');
set role anon;
select t.must_fail($$select public.agent_recovery_snapshot(null)$$,'permission denied','anonymous role cannot call even with a spoofed owner subject');
reset role;
set role service_role;
select t.must_fail($$select public.agent_recovery_snapshot(null)$$,'permission denied','service role cannot bypass authenticated recovery privacy');
reset role;

insert into public.agent_financial_transactions(user_id,account_id,provider_transaction_id,currency,amount_cents,posted_on,merchant_raw,merchant_key,is_pending,fetched_at)
 select '00000000-0000-0000-0000-000000000183','many-transactions','transaction-'||n,'USD',-1,current_date,'Synthetic','synthetic',false,now() from generate_series(1,10000) n;
select t.as_user('00000000-0000-0000-0000-000000000183');
set role authenticated;
select t.ok(jsonb_array_length(public.agent_recovery_snapshot()->'transactions')=10000,'transaction limit boundary returns every retained record');
reset role;
insert into public.agent_financial_transactions(user_id,account_id,provider_transaction_id,currency,amount_cents,posted_on,merchant_raw,merchant_key,is_pending,fetched_at)
 values('00000000-0000-0000-0000-000000000183','many-transactions','overflow','USD',-1,current_date,'Synthetic','synthetic',false,now());
set role authenticated;
select t.must_fail($$select public.agent_recovery_snapshot(null)$$,'processing limit','transaction overflow raises instead of truncating or pretending complete coverage');
reset role;
insert into public.agent_financial_accounts(user_id,account_id,provider,provider_account_id,name,currency,fetched_at)
 select '00000000-0000-0000-0000-000000000185','account-'||n,'simplefin','provider-'||n,'Synthetic','USD',now() from generate_series(1,1001) n;
select t.as_user('00000000-0000-0000-0000-000000000185');
set role authenticated;
select t.must_fail($$select public.agent_recovery_snapshot(null)$$,'processing limit','account overflow raises instead of silently dropping an account');
select t.ok(jsonb_array_length(public.agent_recovery_snapshot('account-1')->'accounts')=1,'exact account scope remains usable when global history exceeds the limit');
reset role;
rollback;
