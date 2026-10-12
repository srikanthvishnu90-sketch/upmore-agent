-- Guided manual connect (20261012010000_manual_connections.sql): a person reads only their own connections and writes
-- none of them; the session lives in Vault under the person's own name, reachable by the service role alone; any delete
-- of a row (disconnect, account deletion) takes the session with it; the signed-out note can be logged once.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000e1','manual1@example.com'),('00000000-0000-0000-0000-0000000000e2','manual2@example.com');
set role service_role;
insert into public.manual_connections(user_id,platform_id,state,consent_version,consent_text,consent_at)
  values('00000000-0000-0000-0000-0000000000e1','fundrise','pending_login','2026-10-11',repeat('Upmore opens Fundrise''s own sign-in page. ',3),now());
insert into public.manual_connections(user_id,platform_id,state,consent_version,consent_text,consent_at)
  values('00000000-0000-0000-0000-0000000000e2','fundrise','pending_login','2026-10-11',repeat('Upmore opens Fundrise''s own sign-in page. ',3),now());
select t.ok(public.manual_vault_store('manual_00000000-0000-0000-0000-0000000000e1_fundrise','{"cookies":[{"name":"sid","value":"cookie-e1"}]}') is not null,'the service role stores a session under the person''s own name');
select public.manual_vault_store('manual_00000000-0000-0000-0000-0000000000e2_fundrise','{"cookies":[{"name":"sid","value":"cookie-e2"}]}');
update public.manual_connections set state='connected',vault_name='manual_00000000-0000-0000-0000-0000000000e1_fundrise',last_checked=now() where user_id='00000000-0000-0000-0000-0000000000e1';
update public.manual_connections set state='connected',vault_name='manual_00000000-0000-0000-0000-0000000000e2_fundrise',last_checked=now() where user_id='00000000-0000-0000-0000-0000000000e2';
select t.ok(public.manual_vault_read('manual_00000000-0000-0000-0000-0000000000e1_fundrise') like '%cookie-e1%','the service role reads it back');
select public.manual_vault_store('manual_00000000-0000-0000-0000-0000000000e1_fundrise','{"cookies":[{"name":"sid","value":"cookie-e1-new"}]}');
-- The Vault table itself is out of the service role's reach (only the security-definer functions touch it): look as the owner.
reset role;
select t.ok((select count(*)=1 from vault.secrets where name='manual_00000000-0000-0000-0000-0000000000e1_fundrise'),'storing again replaces the session, never a second copy');
set role service_role;
select t.must_fail($$select public.manual_vault_store('exec_cred_00000000-0000-0000-0000-0000000000e1_devin','x1')$$,'invalid vault name','another kind of Vault entry is out of reach');
select t.must_fail($$select public.manual_vault_read('upmore_proactive_secret')$$,'invalid vault name','the scheduler secret cannot be read through it');
select t.must_fail($$select public.manual_vault_delete('manual_%')$$,'invalid vault name','no wildcard delete');
select t.must_fail($$update public.manual_connections set vault_name='manual_00000000-0000-0000-0000-0000000000e2_fundrise' where user_id='00000000-0000-0000-0000-0000000000e1'$$,'manual_connections_vault_name_own','a row can only name its own person''s session');
select t.must_fail($$update public.manual_connections set state='revoked' where user_id='00000000-0000-0000-0000-0000000000e1'$$,'manual_connections_revoked_empty','revoked keeps no session');
select t.must_fail($$update public.manual_connections set state='paper' where user_id='00000000-0000-0000-0000-0000000000e1'$$,'check constraint','only the five states');
reset role;
select t.as_user('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
select t.ok((select count(*)=1 and bool_and(platform_id='fundrise' and state='connected') from public.manual_connections),'a person reads their own connection and its state');
select t.must_fail($$update public.manual_connections set state='connected', told_signed_out=false$$,'permission denied','a person cannot write their own row (only the edge function does)');
select t.must_fail($$insert into public.manual_connections(user_id,platform_id,consent_version,consent_text,consent_at) values('00000000-0000-0000-0000-0000000000e1','yieldstreet','x',repeat('x',60),now())$$,'permission denied','nor add one');
select t.must_fail($$select public.manual_vault_read('manual_00000000-0000-0000-0000-0000000000e1_fundrise')$$,'permission denied','a person cannot read the session itself, even their own');
select t.must_fail($$select public.manual_vault_store('manual_00000000-0000-0000-0000-0000000000e1_fundrise','{}')$$,'permission denied','nor store one');
select t.must_fail($$select * from vault.secrets$$,'permission denied','nor reach the Vault table');
reset role;
select t.as_user('');
set role anon;
select t.must_fail($$select * from public.manual_connections$$,'permission denied','anonymous callers read nothing');
reset role;
-- Disconnect: the row moves to revoked with the session deleted; a direct delete and an account deletion take it too.
set role service_role;
select public.manual_vault_delete('manual_00000000-0000-0000-0000-0000000000e1_fundrise');
update public.manual_connections set state='revoked',vault_name=null where user_id='00000000-0000-0000-0000-0000000000e1';
reset role;
select t.ok((select count(*)=0 from vault.secrets where name like 'manual_00000000-0000-0000-0000-0000000000e1%'),'disconnect deletes the session at once');
select t.ok((select count(*)=1 from vault.secrets where secret like '%cookie-e2%'),'another person''s session stays');
delete from auth.users where id='00000000-0000-0000-0000-0000000000e2';
select t.ok((select count(*)=0 from vault.secrets where secret like '%cookie-e2%') and (select count(*)=0 from public.manual_connections where user_id='00000000-0000-0000-0000-0000000000e2'),'deleting the account removes the row and its session from the Vault');
insert into public.agent_proactive_log(user_id,key,kind) values('00000000-0000-0000-0000-0000000000e1','manual:fundrise:signed_out:2026-10-12T15:05:00.000Z','connection');
select t.must_fail($$insert into public.agent_proactive_log(user_id,key,kind) values('00000000-0000-0000-0000-0000000000e1','manual:fundrise:signed_out:2026-10-12T15:05:00.000Z','connection')$$,'duplicate key','the signed-out note is logged once');
rollback;
