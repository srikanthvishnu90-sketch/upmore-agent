-- Found 2026-10-11: deleting a person's account cascaded their brokerage rows away but left the live OAuth token in the
-- Vault (delete-account purges SimpleFIN, Plaid and merchant secrets, not broker_token_*). Any delete of a brokerage row
-- or a pending link, by any path, now takes its Vault entry with it.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000d1','vaultgone@example.com'),('00000000-0000-0000-0000-0000000000d2','vaultkeep@example.com');
set role service_role;
select public.broker_link('00000000-0000-0000-0000-0000000000d1','alpaca','acct-live-d1','****1111','trading data','{"access_token":"tok-d1"}');
select public.broker_link('00000000-0000-0000-0000-0000000000d2','alpaca','acct-live-d2','****2222','trading data','{"access_token":"tok-d2"}');
select public.broker_stage_link('00000000-0000-0000-0000-0000000000d1','alpaca','acct-live-d1b','****3333','trading data','{"access_token":"tok-d1-pending"}');
reset role;
select t.ok((select count(*)=3 from vault.secrets where secret like '%tok-d%'),'three tokens in the Vault before');
delete from auth.users where id='00000000-0000-0000-0000-0000000000d1';
select t.ok((select count(*)=0 from vault.secrets where secret like '%tok-d1%'),'deleting the account removes its live token and its pending token from the Vault');
select t.ok((select count(*)=1 from vault.secrets where secret like '%tok-d2%'),'another person''s token stays');
delete from public.brokerage_accounts where user_id='00000000-0000-0000-0000-0000000000d2';
select t.ok((select count(*)=0 from vault.secrets where secret like '%tok-d2%'),'deleting a brokerage row directly removes its token too');
rollback;
