-- Found 2026-10-12: a deleted account left its Gmail refresh token in the Vault (user_oauth_connections cascaded away;
-- the Vault has no cascade and delete-account never purged oauth_* secrets), and the owner could delete or rewrite their
-- own row directly. Now any delete takes the token with it, by a name derived from the row's owner, and only the
-- service role writes the rows (20261012060000_oauth_vault_cascade.sql).
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000f1','gmailgone@example.com'),('00000000-0000-0000-0000-0000000000f2','gmailkeep@example.com');
set role service_role;
select public.oauth_vault_store('oauth_gmail_00000000-0000-0000-0000-0000000000f1','{"refresh_token":"rt-f1"}');
select public.oauth_vault_store('oauth_gmail_00000000-0000-0000-0000-0000000000f2','{"refresh_token":"rt-f2"}');
insert into public.user_oauth_connections(user_id,provider,vault_name,email) values
  ('00000000-0000-0000-0000-0000000000f1','gmail','oauth_gmail_00000000-0000-0000-0000-0000000000f1','f1@example.com'),
  ('00000000-0000-0000-0000-0000000000f2','gmail','oauth_gmail_00000000-0000-0000-0000-0000000000f2','f2@example.com');
select t.ok(true,'the service role connects Gmail under each person''s own name');
select t.must_fail($$insert into public.user_oauth_connections(user_id,provider,vault_name) values('00000000-0000-0000-0000-0000000000f1','outlook','oauth_gmail_00000000-0000-0000-0000-0000000000f2')$$,'must match owner and provider','a row can never name another person''s token');
select t.must_fail($$update public.user_oauth_connections set vault_name='oauth_gmail_00000000-0000-0000-0000-0000000000f2' where user_id='00000000-0000-0000-0000-0000000000f1'$$,'must match owner and provider','nor be rewritten to');
reset role;
select t.ok((select count(*)=2 from vault.secrets where secret like '%rt-f%'),'two Gmail tokens in the Vault before');
select t.as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select t.ok((select count(*)=1 and bool_and(email='f1@example.com') from public.user_oauth_connections),'a person reads only their own connection');
select t.must_fail($$delete from public.user_oauth_connections$$,'permission denied','a person cannot delete the row directly (disconnect goes through gmail-oauth)');
select t.must_fail($$update public.user_oauth_connections set email='x@example.com'$$,'permission denied','nor rewrite it');
select t.must_fail($$insert into public.user_oauth_connections(user_id,provider,vault_name) values('00000000-0000-0000-0000-0000000000f1','gmail2','oauth_gmail2_00000000-0000-0000-0000-0000000000f1')$$,'permission denied','nor add one');
reset role;
select t.as_user('');
delete from auth.users where id='00000000-0000-0000-0000-0000000000f1';
select t.ok((select count(*)=0 from vault.secrets where secret like '%rt-f1%'),'deleting the account removes its Gmail token from the Vault');
select t.ok((select count(*)=1 from vault.secrets where secret like '%rt-f2%'),'another person''s token stays');
set role service_role;
delete from public.user_oauth_connections where user_id='00000000-0000-0000-0000-0000000000f2';
reset role;
select t.ok((select count(*)=0 from vault.secrets where secret like '%rt-f2%'),'a disconnect that deletes the row removes the token too');
rollback;
