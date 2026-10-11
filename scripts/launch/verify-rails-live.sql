-- Read-only proof that the rail tables are live and that RLS gives the test user exactly their own recipients and
-- brokerage accounts (never the vault reference).
-- Everything runs in a transaction that is rolled back.
\set ON_ERROR_STOP 1
begin;
select 'tables' as check, to_regclass('public.agent_flow_state') is not null as flow_state, to_regclass('public.saved_recipients') is not null as saved_recipients,
       (select relrowsecurity from pg_class where oid = 'public.saved_recipients'::regclass) as rls_on;
select 'brokerage accounts' as check, (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'brokerage_accounts' and column_name in ('account_id', 'kind')) = 2 as per_user_columns,
       exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'brokerage_accounts' and policyname = 'brokerage_accounts_owner_read') as owner_policy,
       exists (select 1 from pg_constraint where conname = 'brokerage_accounts_paper_only') as paper_only,
       to_regprocedure('public.broker_token_read(uuid,uuid)') is not null as token_rpc;
-- As the test user, through RLS, the way agent-chat's caller-scoped client reads.
set local role authenticated;
select set_config('request.jwt.claim.sub', '2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3', true), set_config('request.jwt.claims', '{"sub":"2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3","role":"authenticated"}', true);
select 'as test user' as check, display_name, handle, rail, source, evidence_ref from public.saved_recipients order by rail;
select 'as test user: brokerage' as check, provider, kind, label, paper, account_id from public.brokerage_accounts order by kind;
-- As someone else: nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000dead', true), set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dead","role":"authenticated"}', true);
select 'as another user' as check, count(*) as visible_rows from public.saved_recipients;
select 'as another user: brokerage' as check, count(*) as visible_rows from public.brokerage_accounts;
rollback;
