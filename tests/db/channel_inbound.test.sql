-- Channel inbound (20261019030000_channel_inbound.sql, WO-013b-2): a provider message id is claimed once, ever; a reply
-- is an outbox row like any other, claimable by its key alone; nobody but the service role touches the inbound log.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000d1','in1@example.com');
insert into public.agent_threads(id,user_id,title) values('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','Texts');
set role service_role;
insert into public.channel_inbound(provider_message_id) values('lm-1');
select t.must_fail($$insert into public.channel_inbound(provider_message_id) values('lm-1')$$,'channel_inbound_pkey','a provider message id is claimed once, ever');
insert into public.channel_contacts(contact,user_id,thread_id) values('+15550004444','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1');
insert into public.career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-0000-0000-0000000000d1','reply:lm-1','reply','Here are three data analyst jobs.',now());
select t.must_fail($$insert into public.career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-0000-0000-0000000000d1','reply:lm-1','reply','again',now())$$,'career_outbox_once','a reply is queued once per message');
select t.must_fail($$insert into public.career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-0000-0000-0000000000d1','nudge:1','reply','x',now())$$,'career_outbox_key_check','alert:, report: and reply: are the only keys');
insert into public.career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-0000-0000-0000000000d1','alert:9','alert','an alert',now());
select t.ok((select array_agg(key)=array['reply:lm-1'] from public.career_outbox_claim_key('00000000-0000-0000-0000-0000000000d1','reply:lm-1',now())),'the reply is claimed by its key alone, the alert left for the run');
select t.ok((select count(*)=0 from public.career_outbox_claim_key('00000000-0000-0000-0000-0000000000d1','reply:lm-1',now())),'and only once');
reset role;
select t.as_user('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
select t.must_fail($$select * from public.channel_inbound$$,'permission denied','a person cannot read the inbound log');
select t.must_fail($$select * from public.career_outbox_claim_key('00000000-0000-0000-0000-0000000000d1','alert:9',now())$$,'permission denied','or claim a message');
select t.ok((select thread_id='00000000-0000-0000-0000-0000000000e1' from public.channel_contacts),'a person sees their own texting thread');
reset role;
delete from public.agent_threads where id='00000000-0000-0000-0000-0000000000e1';
select t.ok((select thread_id is null from public.channel_contacts where contact='+15550004444'),'a deleted thread unlinks; the contact stays');
rollback;
