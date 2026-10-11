-- SQL tests for 20261011030000_brokerage_accounts_per_user.sql (Rail 2: per-user accounts, PAPER ONLY, tokens in the Vault).
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000b1','broker1@example.com'),('00000000-0000-0000-0000-0000000000b2','broker2@example.com');
set role service_role;
insert into public.brokerage_accounts(user_id,provider,kind,label,paper,account_id)
  values('00000000-0000-0000-0000-0000000000b1','alpaca_broker','bootstrap','main',true,'acct-b1');
insert into public.brokerage_accounts(id,user_id,provider,kind,label,paper,account_id,vault_key_ref)
  values('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2','alpaca_oauth','linked','main',true,'acct-b2',
         'broker_token_00000000-0000-0000-0000-0000000000b2_00000000-0000-0000-0000-0000000000c2');
select t.ok((select count(*)=2 from public.brokerage_accounts),'the service role links a bootstrap sub-account and a linked account');
select t.must_fail($$insert into public.brokerage_accounts(user_id,provider,kind,label,paper,account_id) values('00000000-0000-0000-0000-0000000000b1','alpaca_broker','bootstrap','live',false,'acct-live')$$,'paper_only','PAPER ONLY: a live account row is refused');
select t.must_fail($$insert into public.brokerage_accounts(user_id,provider,kind,label,paper,account_id) values('00000000-0000-0000-0000-0000000000b2','alpaca_broker','bootstrap','second',true,'acct-b1')$$,'unique','one broker account belongs to exactly one user');
select t.must_fail($$insert into public.brokerage_accounts(id,user_id,provider,kind,label,paper,account_id,vault_key_ref) values('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b1','alpaca_oauth','linked','x',true,'acct-x','broker_token_00000000-0000-0000-0000-0000000000b2_00000000-0000-0000-0000-0000000000c2')$$,'vault_ref','a linked row cannot point at another user''s token');
select t.must_fail($$insert into public.brokerage_accounts(user_id,provider,kind,label,paper,account_id,vault_key_ref) values('00000000-0000-0000-0000-0000000000b1','alpaca_broker','bootstrap','y',true,'acct-y','broker_token_x')$$,'vault_ref','a bootstrap row carries no token reference');
select t.must_fail($$insert into public.brokerage_accounts(user_id,provider,kind,label,paper,account_id) values('00000000-0000-0000-0000-0000000000b1','alpaca_broker','partner','z',true,'acct-z')$$,'kind_check','kind is linked or bootstrap');
select t.must_fail($$update public.brokerage_accounts set user_id='00000000-0000-0000-0000-0000000000b1' where id='00000000-0000-0000-0000-0000000000c2'$$,'vault_ref','a linked account cannot be moved to another user');
select public.broker_token_store('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c2','oauth-token-b2');
reset role;
select t.ok((select count(*)=1 from vault.secrets where name='broker_token_00000000-0000-0000-0000-0000000000b2_00000000-0000-0000-0000-0000000000c2' and secret='oauth-token-b2'),'the token is stored in the Vault under the user''s own name');
select t.ok((select count(*)=0 from public.brokerage_accounts where vault_key_ref like '%oauth-token%'),'no table holds the token itself');
set role service_role;
select t.must_fail($$select public.broker_token_store('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c2','stolen')$$,'not this user','a token cannot be stored on another user''s account');
select t.ok((select public.broker_token_read('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c2')='oauth-token-b2'),'the owner''s request reads the owner''s token');
select t.ok((select public.broker_token_read('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c2') is null),'CROSS-USER: another user''s request gets nothing for that account');
reset role;
select t.as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
select t.ok((select count(*)=1 and min(account_id)='acct-b1' from public.brokerage_accounts),'CROSS-USER: a user reads only their own account row');
select t.must_fail($$select vault_key_ref from public.brokerage_accounts$$,'permission denied','the client never reads the vault reference');
select t.must_fail($$insert into public.brokerage_accounts(user_id,provider,kind,label,paper,account_id) values('00000000-0000-0000-0000-0000000000b1','alpaca_broker','bootstrap','mine',true,'acct-self')$$,'permission denied','the client cannot link an account itself');
select t.must_fail($$update public.brokerage_accounts set account_id='acct-b2'$$,'permission denied','the client cannot repoint its account at someone else''s');
select t.must_fail($$select public.broker_token_read('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c2')$$,'permission denied','the client cannot call the token read');
reset role;
select t.as_user('');
set role anon;
select t.must_fail($$select id from public.brokerage_accounts$$,'permission denied','anonymous callers read nothing');
reset role;
delete from auth.users where id='00000000-0000-0000-0000-0000000000b2';
select t.ok((select count(*)=1 from public.brokerage_accounts),'deleting a user deletes their accounts');
rollback;
