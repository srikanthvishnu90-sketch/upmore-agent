begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000a1','rec1@example.com'),('00000000-0000-0000-0000-0000000000a2','rec2@example.com');
select t.as_user('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref,last_used_at)
  values('00000000-0000-0000-0000-0000000000a1','@sarah_m','Sarah M','sms','completed_send','venmo','txn:v-1001',now());
insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref)
  values('00000000-0000-0000-0000-0000000000a1','@marcus-t','Marcus T','imessage','confirmed','venmo','readback:confirm-7');
select t.ok((select count(*)=2 from public.saved_recipients),'the owner saves after a completed send and after a confirmed save');
update public.saved_recipients set last_used_at=now() where handle='@marcus-t';
select t.ok((select last_used_at is not null from public.saved_recipients where handle='@marcus-t'),'the owner touches last_used_at');
select t.must_fail($$insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref) values('00000000-0000-0000-0000-0000000000a1','@dana','Dana','sms','mention','venmo','msg:1')$$,'check constraint','a mention is not a source: only completed_send or confirmed');
select t.must_fail($$insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref) values('00000000-0000-0000-0000-0000000000a1','@dana','Dana','sms','confirmed','venmo','  ')$$,'check constraint','a save with no evidence is refused');
select t.must_fail($$insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref) values('00000000-0000-0000-0000-0000000000a1','@dana','Dana','fax','confirmed','venmo','readback:1')$$,'check constraint','channel is one of imessage, sms, whatsapp, in-app');
select t.must_fail($$insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref) values('00000000-0000-0000-0000-0000000000a1','4111111111111111','Card','sms','confirmed','zelle','readback:2')$$,'check constraint','a card number is refused as a handle');
select t.must_fail($$insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref) values('00000000-0000-0000-0000-0000000000a1','@SARAH_M','Sarah again','sms','confirmed','venmo','readback:3')$$,'unique','the same handle on the same rail is one row, whatever its case');
insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref)
  values('00000000-0000-0000-0000-0000000000a1','@sarah_m','Sarah (Cash App)','sms','confirmed','cash_app','readback:4');
select t.ok((select count(*)=3 from public.saved_recipients),'the same handle on another rail is another person');
select t.must_fail($$insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref) values('00000000-0000-0000-0000-0000000000a2','@x','X','sms','confirmed','venmo','readback:5')$$,'row-level security','a user cannot save a recipient for another owner');
reset role;
select t.as_user('00000000-0000-0000-0000-0000000000a2');
set role authenticated;
select t.ok((select count(*)=0 from public.saved_recipients),'another owner cannot read the recipients');
update public.saved_recipients set display_name='hijacked' where handle='@sarah_m';
delete from public.saved_recipients where handle='@marcus-t';
reset role;
select t.ok((select count(*)=3 and bool_and(display_name<>'hijacked') from public.saved_recipients),'another owner cannot change or delete them either');
select t.as_user('');
set role anon;
select t.must_fail($$select * from public.saved_recipients$$,'permission denied','anonymous callers cannot read recipients');
reset role;
set role service_role;
insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref)
  values('00000000-0000-0000-0000-0000000000a2','@pat','Pat','whatsapp','completed_send','venmo','txn:v-2002');
select t.ok((select count(*)=4 from public.saved_recipients),'the bridge (service_role) reads and writes for any user');
reset role;
delete from auth.users where id='00000000-0000-0000-0000-0000000000a1';
select t.ok((select count(*)=1 from public.saved_recipients),'deleting the user deletes their recipients');
rollback;
