-- The launch seed and the RLS proof script, run against the local throwaway database exactly as the owner will run them
-- live: idempotent, owner-confirmed source with evidence, visible to the test user only.
begin;
reset role;
insert into auth.users(id,email) values('2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3','gauntlet-test@upmore.test');
\ir ../../scripts/launch/seed-gauntlet-test-user.sql
\ir ../../scripts/launch/seed-gauntlet-test-user.sql
select t.ok((select count(*)=2 from public.saved_recipients where user_id='2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3'),'the seed is idempotent: two rows after two runs');
select t.ok((select bool_and(source='confirmed' and evidence_ref like 'owner-confirmed:%') from public.saved_recipients),'every seeded row carries its evidence');
select t.ok((select count(distinct display_name)=1 and count(distinct rail)=2 from public.saved_recipients),'one Sam, two apps');
select t.as_user('2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3');
set role authenticated;
select t.ok((select count(*)=2 from public.saved_recipients),'the test user reads both rows through RLS');
reset role;
select t.as_user('00000000-0000-0000-0000-00000000dead');
set role authenticated;
select t.ok((select count(*)=0 from public.saved_recipients),'another user reads none');
reset role;
\set account_id 'acct-sandbox-test'
\ir ../../scripts/launch/seed-paper-broker-account.sql
\ir ../../scripts/launch/seed-paper-broker-account.sql
select t.ok((select count(*)=1 from public.brokerage_accounts where user_id='2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3' and kind='bootstrap' and paper and account_id='acct-sandbox-test' and vault_key_ref is null),'the paper sub-account seed is idempotent and stores no key');
select t.as_user('2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3');
set role authenticated;
select t.ok((select count(*)=1 from public.brokerage_accounts),'the test user reads their own paper account through RLS');
reset role;
select t.as_user('00000000-0000-0000-0000-00000000dead');
set role authenticated;
select t.ok((select count(*)=0 from public.brokerage_accounts),'another user reads none of it');
reset role;
rollback;
