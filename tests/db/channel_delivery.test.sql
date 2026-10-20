-- Channel delivery (20261019020001_channel_delivery.sql, WO-013b-1): a claim takes only due rows of people with a texting
-- contact and never the same row twice; a failed row is due again only at its retry time; the day's contact count counts
-- people; a person reads only their own contact and runs nothing; a deleted account leaves no contact behind.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000c1','ch1@example.com'),('00000000-0000-0000-0000-0000000000c2','ch2@example.com'),('00000000-0000-0000-0000-0000000000c3','ch3@example.com');
set role service_role;
insert into public.channel_contacts(contact,user_id) values('+15550001111','00000000-0000-0000-0000-0000000000c1'),('+15550002222','00000000-0000-0000-0000-0000000000c2');
insert into public.channel_contacts(contact,opted_out,opted_out_at) values('+15550009999',true,now());
select t.ok((select user_id is null and opted_out from public.channel_contacts where contact='+15550009999'),'a STOP from a number with no account is kept');
select t.must_fail($$insert into public.channel_contacts(contact) values('5550001111')$$,'channel_contacts_contact_check','a contact that is not +digits or an address is refused');
select t.must_fail($$insert into public.channel_contacts(contact,user_id) values('+15550003333','00000000-0000-0000-0000-0000000000c1')$$,'channel_contacts_user_id_key','one texting contact per person');
insert into public.career_outbox(user_id,key,kind,text,deliver_at) values
 ('00000000-0000-0000-0000-0000000000c1','alert:1','alert','one',now() - interval '2 minutes'),
 ('00000000-0000-0000-0000-0000000000c1','alert:2','alert','two',now() + interval '1 hour'),
 ('00000000-0000-0000-0000-0000000000c2','alert:3','alert','three',now() - interval '1 minute'),
 ('00000000-0000-0000-0000-0000000000c3','alert:4','alert','no contact',now() - interval '3 minutes');
select t.ok((select count(*)=4 and bool_and(status='queued' and attempts=0) from public.career_outbox),'existing and new rows start queued');
create temp table claimed as select * from public.career_outbox_claim(now(), 20);
select t.ok((select array_agg(key order by key) = array['alert:1','alert:3'] from claimed),'a claim takes due rows of people with a contact; a future row and a person without a contact wait');
select t.ok((select bool_and(contact is not null and prior_status='queued') from claimed),'with the number it goes to and the status it had');
select t.ok((select count(*)=2 from public.career_outbox where status='sending'),'claimed rows are being sent');
select t.ok((select count(*)=0 from public.career_outbox_claim(now(), 20)),'a second run claims none of them');
update public.career_outbox set status='failed', attempts=1, retry_at=now() + interval '5 minutes', claimed_at=null where key='alert:1';
update public.career_outbox set status='delivered', delivered_at=now(), claimed_at=null where key='alert:3';
select t.ok((select count(*)=0 from public.career_outbox_claim(now(), 20)),'a retry waits for its time');
select t.ok((select array_agg(key)=array['alert:1'] from public.career_outbox_claim(now() + interval '6 minutes', 20)),'and is claimed after it');
select t.must_fail($$update public.career_outbox set status='lost' where key='alert:1'$$,'career_outbox_status','an unknown status is refused');
select t.must_fail($$update public.career_outbox set status='delivered', delivered_at=null where key='alert:2'$$,'career_outbox_status','delivered without a send time is refused');
insert into public.career_outbox(user_id,key,kind,text,deliver_at,status,delivered_at,contact) values('00000000-0000-0000-0000-0000000000c2','report:2026-10-19','report','four',now(),'delivered',now(),'+15550002222');
select t.ok((select public.career_outbox_contacts_on((now() at time zone 'UTC')::date) = 1),'two messages to one person today count as one contact');
select t.ok((select public.career_outbox_contacts_on((now() at time zone 'UTC')::date - 1) = 0),'yesterday counts nobody');
insert into public.channel_delivery_runs(run_at,delivered,failed,retried,skipped_opt_out,capped,swept,ms) values(now(),1,0,1,0,0,0,40);
reset role;
select t.as_user('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select t.ok((select count(*)=1 and min(contact)='+15550001111' from public.channel_contacts),'a person reads only their own contact');
select t.must_fail($$update public.channel_contacts set opted_out=false$$,'permission denied','a person cannot change opt-outs directly (STOP and START do, through the channel)');
select t.must_fail($$select * from public.career_outbox_claim(now(), 20)$$,'permission denied','a person cannot claim messages');
select t.must_fail($$select public.career_outbox_contacts_on(current_date)$$,'permission denied','or count contacts');
select t.must_fail($$select * from public.channel_delivery_runs$$,'permission denied','or read the delivery runs');
reset role;
delete from auth.users where id='00000000-0000-0000-0000-0000000000c2';
select t.ok((select count(*)=0 from public.channel_contacts where contact='+15550002222'),'a deleted account leaves no texting contact');
rollback;
