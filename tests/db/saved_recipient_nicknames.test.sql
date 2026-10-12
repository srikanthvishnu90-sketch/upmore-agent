-- Saved nicknames (20261012030000_saved_recipient_nicknames.sql): a nickname is a lowercase word of 2 to 24 letters (never
-- digits, never a handle), means one recipient per person, and stays behind the owner-only policies of saved_recipients.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000b1','nick1@example.com'),('00000000-0000-0000-0000-0000000000b2','nick2@example.com');
select t.as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref,nickname)
  values('00000000-0000-0000-0000-0000000000b1','@anitas','Anita Srikanth','sms','completed_send','venmo','txn:v-3001','mom');
insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref)
  values('00000000-0000-0000-0000-0000000000b1','@mikereyes','Mike Reyes','imessage','completed_send','venmo','txn:v-3002');
select t.ok((select nickname='mom' from public.saved_recipients where handle='@anitas'),'the owner saves a nickname on their own recipient');
select t.ok((select nickname is null from public.saved_recipients where handle='@mikereyes'),'a recipient has no nickname until one is set');
select t.must_fail($$update public.saved_recipients set nickname='mom' where handle='@mikereyes'$$,'unique','one nickname means one recipient for a person');
select t.must_fail($$update public.saved_recipients set nickname='Mom' where handle='@mikereyes'$$,'saved_recipients_nickname_shape','a nickname is stored lowercase');
select t.must_fail($$update public.saved_recipients set nickname='4111111111111111' where handle='@mikereyes'$$,'saved_recipients_nickname_shape','a card number is refused as a nickname');
select t.must_fail($$update public.saved_recipients set nickname='1234' where handle='@mikereyes'$$,'saved_recipients_nickname_shape','a digits-only nickname is refused');
select t.must_fail($$update public.saved_recipients set nickname='dad2' where handle='@mikereyes'$$,'saved_recipients_nickname_shape','no digit anywhere in a nickname');
select t.must_fail($$update public.saved_recipients set nickname='@dad' where handle='@mikereyes'$$,'saved_recipients_nickname_shape','a handle is refused as a nickname');
select t.must_fail($$update public.saved_recipients set nickname='big_bro' where handle='@mikereyes'$$,'saved_recipients_nickname_shape','handle punctuation (underscore) is refused');
select t.must_fail($$update public.saved_recipients set nickname='dad.k' where handle='@mikereyes'$$,'saved_recipients_nickname_shape','handle punctuation (dot) is refused');
select t.must_fail($$update public.saved_recipients set nickname='d' where handle='@mikereyes'$$,'saved_recipients_nickname_shape','one letter is too short');
select t.must_fail($$update public.saved_recipients set nickname=repeat('a',25) where handle='@mikereyes'$$,'saved_recipients_nickname_shape','more than 24 characters is refused');
select t.must_fail($$update public.saved_recipients set nickname='big  sis' where handle='@mikereyes'$$,'saved_recipients_nickname_shape','a doubled space is refused');
select t.must_fail($$update public.saved_recipients set nickname=' dad' where handle='@mikereyes'$$,'saved_recipients_nickname_shape','a leading space is refused');
update public.saved_recipients set nickname='big sis' where handle='@mikereyes';
select t.ok((select nickname='big sis' from public.saved_recipients where handle='@mikereyes'),'a short phrase of letters is a nickname');
-- Moving a nickname to another recipient: off the first row, then onto the second (what the edge function does).
update public.saved_recipients set nickname=null where handle='@anitas';
update public.saved_recipients set nickname='mom' where handle='@mikereyes';
select t.ok((select count(*)=1 and bool_and(handle='@mikereyes') from public.saved_recipients where nickname='mom'),'a nickname moves once the old row lets go of it');
reset role;
-- Another owner has their own "mom", and cannot read or change this owner's.
select t.as_user('00000000-0000-0000-0000-0000000000b2');
set role authenticated;
insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref,nickname)
  values('00000000-0000-0000-0000-0000000000b2','@lenapark','Lena Park','whatsapp','confirmed','venmo','readback:n-1','mom');
select t.ok((select count(*)=1 from public.saved_recipients),'another owner reads only their own recipients');
update public.saved_recipients set nickname='hijack' where handle='@mikereyes';
select t.must_fail($$insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref,nickname) values('00000000-0000-0000-0000-0000000000b1','@x1','X','sms','confirmed','venmo','readback:n-2','sis')$$,'row-level security','a user cannot save a nickname on another owner''s book');
reset role;
select t.ok((select nickname='mom' from public.saved_recipients where handle='@mikereyes'),'another owner cannot change a nickname');
select t.ok((select count(*)=2 from public.saved_recipients where nickname='mom'),'the same nickname under two owners is two different people');
select t.as_user('');
set role anon;
select t.must_fail($$select nickname from public.saved_recipients$$,'permission denied','anonymous callers cannot read nicknames');
reset role;
set role service_role;
select t.must_fail($$insert into public.saved_recipients(user_id,handle,display_name,channel,source,rail,evidence_ref,nickname) values('00000000-0000-0000-0000-0000000000b2','@other','Other','sms','confirmed','venmo','readback:n-3','mom')$$,'unique','the bridge (service_role) is held to one recipient per nickname too');
reset role;
rollback;
