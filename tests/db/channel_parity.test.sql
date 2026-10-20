-- WO-038 (20261021070000_channel_parity.sql): a contact per channel per person, derived and checked; dedupe per provider;
-- a row goes to its own channel or the home channel; held rows wait for the person's next message and come back whole;
-- STOP is the person's; Telegram link tokens are single-use, hashed and short-lived; the same number on a second channel
-- links only on the yes of the first; a card is not pushed into a closed WhatsApp window; nobody but the service role runs
-- any of it; an account's deletion leaves nothing behind.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000003801','par1@example.test'),('00000000-0000-4000-8000-000000003802','par2@example.test'),
 ('00000000-0000-4000-8000-000000003803','par3@example.test');
insert into profiles(id) select id from auth.users where email like 'par%@example.test';
insert into agent_threads(id,user_id,title) values('00000000-0000-4000-8000-0000000038a1','00000000-0000-4000-8000-000000003801','Texts');
set role service_role;

-- Contacts: the key decides channel and address; one per channel per person.
insert into channel_contacts(contact,user_id,thread_id,last_inbound_at,created_at) values
 ('+15550003801','00000000-0000-4000-8000-000000003801','00000000-0000-4000-8000-0000000038a1',now() - interval '3 hours',now() - interval '2 days'),
 ('tg:3801','00000000-0000-4000-8000-000000003801','00000000-0000-4000-8000-0000000038a1',now() - interval '1 hour',now() - interval '1 day'),
 ('wa:15550003801','00000000-0000-4000-8000-000000003801','00000000-0000-4000-8000-0000000038a1',now() - interval '25 hours',now() - interval '1 day');
select t.ok((select array_agg(channel||'|'||address||'|'||coalesce(phone,'-') order by contact) = array['imessage|+15550003801|+15550003801','telegram|3801|-','whatsapp|15550003801|-']
 from channel_contacts where user_id='00000000-0000-4000-8000-000000003801'),'channel and address come from the key; iMessage keeps its number, Telegram never has one');
select t.must_fail($$insert into channel_contacts(contact,user_id) values('tg:3809','00000000-0000-4000-8000-000000003801')$$,'channel_contacts_user_id_key','one Telegram chat per person');
select t.must_fail($$insert into channel_contacts(contact) values('tg:-1001234567890')$$,'channel_contacts_contact_check','a group chat is not a contact');
select t.must_fail($$insert into channel_contacts(contact) values('wa:has space')$$,'channel_contacts_contact_check','a WhatsApp id has no spaces');
update channel_contacts set channel='telegram' where contact='+15550003801';
select t.ok((select channel='imessage' from channel_contacts where contact='+15550003801'),'the channel cannot be set apart from the key');

-- Dedupe per provider.
insert into channel_inbound(provider,provider_message_id) values('telegram','5'),('loopmessage','5'),('whatsapp','wamid.5');
select t.must_fail($$insert into channel_inbound(provider,provider_message_id) values('telegram','5')$$,'channel_inbound_pkey','a provider''s id is claimed once');
select t.must_fail($$insert into channel_inbound(provider,provider_message_id) values('sms','6')$$,'channel_inbound_provider_check','only the three providers');

-- Where a row goes: its own channel, else home (the set one, else the most recent).
insert into career_outbox(user_id,key,kind,text,deliver_at,channel) values
 ('00000000-0000-4000-8000-000000003801','reply:wa:x1','reply','an answer on WhatsApp',now() - interval '1 minute','whatsapp'),
 ('00000000-0000-4000-8000-000000003801','alert:3801','alert','an alert',now() - interval '1 minute',null);
create temp table c1 as select * from career_outbox_claim(now(), 20);
select t.ok((select array_agg(key||'>'||contact order by key) = array['alert:3801>tg:3801','reply:wa:x1>wa:15550003801'] from c1),'a reply goes where it came from; an alert to the most recent channel');
update career_outbox set status='queued', claimed_at=null, contact=null where user_id='00000000-0000-4000-8000-000000003801';
update channel_contacts set home=true where contact='+15550003801';
select t.ok((select contact='+15550003801' from career_outbox_claim_key('00000000-0000-4000-8000-000000003801','alert:3801',now())),'the home channel the person set wins');
update channel_contacts set home=false where contact='+15550003801';

-- Held rows: not claimed; a WhatsApp message puts back what waits for WhatsApp or the home channel, not an iMessage-bound row.
update career_outbox set status='held', claimed_at=null, contact=null where user_id='00000000-0000-4000-8000-000000003801';
insert into career_outbox(user_id,key,kind,text,deliver_at,channel,status) values
 ('00000000-0000-4000-8000-000000003801','reply:lm-9','reply','an iMessage answer',now(),'imessage','held'),
 ('00000000-0000-4000-8000-000000003801','status:m1','status','a mail status',now(),null,'held');
select t.ok((select count(*)=0 from career_outbox_claim(now(), 20) where user_id='00000000-0000-4000-8000-000000003801'),'held rows are never claimed');
select t.ok((select channel_inbound_seen('wa:15550003801', now(), 'US.3801', '+15550003801') = 3),'the WhatsApp message puts back the three rows for WhatsApp or home');
select t.ok((select status='held' from career_outbox where key='reply:lm-9'),'an iMessage-bound row keeps waiting');
select t.ok((select alias='US.3801' and phone='+15550003801' and last_inbound_at > now() - interval '1 minute' from channel_contacts where contact='wa:15550003801'),'the time, the other id and the number are recorded');
create temp table c2 as select * from career_outbox_claim_user('00000000-0000-4000-8000-000000003801', now(), 20);
select t.ok((select array_agg(key order by deliver_at, id) = array['reply:wa:x1','alert:3801','status:m1'] from c2),'everything due for the person, oldest first, mail statuses included');
select t.ok((select bool_and(contact='wa:15550003801') from c2 where key<>'reply:wa:x1') ,'and home is now WhatsApp, the channel they just wrote on');

-- A WhatsApp message that failed for the window after it was accepted goes back to held.
update career_outbox set status='delivered', delivered_at=now(), provider_id='wamid.A', provider_ids=array['wamid.A','wamid.B'], claimed_at=null where key='alert:3801';
select t.ok((select career_outbox_rehold('wamid.B', now(), 'WhatsApp 131047: Re-engagement message') = 1),'a status for its second message finds the row');
select t.ok((select status='held' and delivered_at is null from career_outbox where key='alert:3801'),'held again, never lost');
select t.must_fail($$update career_outbox set provider_ids=array['1','2','3','4','5','6','7','8','9','10','11'] where key='alert:3801'$$,'career_outbox_channel','at most ten ids a row');
select t.must_fail($$update career_outbox set channel='sms' where key='alert:3801'$$,'career_outbox_channel','only the three channels');
select t.must_fail($$insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000003801','nudge:1','reply','x',now())$$,'career_outbox_key_check','unknown key prefixes stay refused');
insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000003801','followup:d1','followup','a follow-up',now()),('00000000-0000-4000-8000-000000003801','mock:k1','mock','a mock turn',now());
select t.ok(true,'every earlier kind stays allowed (status, followup, mock)');

-- STOP is the person's: on any channel it holds all; START on any channel turns all back on.
select channel_set_opt_out('tg:3801', true, now());
select t.ok((select channel_opted_out('+15550003801') and channel_opted_out('wa:15550003801')),'STOP on Telegram holds iMessage and WhatsApp');
select channel_set_opt_out('+15550003801', false, now());
select t.ok((select not bool_or(opted_out) from channel_contacts where user_id='00000000-0000-4000-8000-000000003801'),'START on iMessage turns them all back on');
select channel_set_opt_out('tg:3899', true, now());
select t.ok((select opted_out and user_id is null from channel_contacts where contact='tg:3899'),'a STOP from a chat with no account is kept');

-- Per-channel contact counts.
update career_outbox set status='delivered', delivered_at=now(), contact='tg:3801' where key='followup:d1';
update career_outbox set status='delivered', delivered_at=now(), contact='+15550003801' where key='mock:k1';
select t.ok((select career_outbox_contacts_on_channel((now() at time zone 'UTC')::date,'telegram')=1 and career_outbox_contacts_on_channel((now() at time zone 'UTC')::date,'whatsapp')=0),'each provider counts its own contacts');

-- A reply in parts goes in order: a part waits while an earlier one waits for its retry; each part's key is its own.
insert into career_outbox(user_id,key,kind,text,deliver_at,channel,part_of,part) values
 ('00000000-0000-4000-8000-000000003801','reply:lm-p:1','reply','part one',now(),'imessage','reply:lm-p',1),
 ('00000000-0000-4000-8000-000000003801','reply:lm-p:2','reply','part two',now(),'imessage','reply:lm-p',2),
 ('00000000-0000-4000-8000-000000003801','reply:lm-p:3','reply','part three',now(),'imessage','reply:lm-p',3);
select t.ok((select count(*)=0 from career_outbox_claim_key('00000000-0000-4000-8000-000000003801','reply:lm-p:2',now())),'part two alone waits for part one');
update career_outbox set status='failed', attempts=1, retry_at=now() + interval '5 minutes' where key='reply:lm-p:1';
select t.ok((select count(*)=0 from career_outbox_claim(now(), 20) where key like 'reply:lm-p:%'),'while part one waits for its retry, nothing after it goes');
update career_outbox set status='delivered', delivered_at=now(), retry_at=null where key='reply:lm-p:1';
select t.ok((select array_agg(key order by deliver_at, id)=array['reply:lm-p:2','reply:lm-p:3'] from career_outbox_claim(now(), 20) where key like 'reply:lm-p:%'),'then the rest, in order, in one run');
select t.must_fail($$insert into career_outbox(user_id,key,kind,text,deliver_at,part_of,part) values('00000000-0000-4000-8000-000000003801','reply:lm-q:2','reply','x',now(),'reply:lm-q',1)$$,'career_outbox_part','a part''s key is its reply''s key and its number');

-- Telegram link tokens.
create temp table n1 as select channel_link_nonce_issue('00000000-0000-4000-8000-000000003802', now()) as n;
select t.ok((select n ~ '^[A-Za-z0-9_-]{32}$' from n1),'32 base64url characters');
select t.ok((select count(*)=1 and bool_and(nonce_hash=encode(sha256(convert_to((select n from n1),'UTF8')),'hex') and nonce_hash<>(select n from n1)) from channel_link_nonces where user_id='00000000-0000-4000-8000-000000003802'),'stored only as its hash');
select t.ok((select channel_link_nonce_redeem((select n from n1),'tg:3802',now())->>'user_id'='00000000-0000-4000-8000-000000003802'),'redeemed, the chat joins the account');
select t.ok((select user_id='00000000-0000-4000-8000-000000003802' from channel_contacts where contact='tg:3802'),'linked');
select t.ok((select channel_link_nonce_redeem((select n from n1),'tg:3803',now())->>'error'='invalid'),'once only');
create temp table n2 as select channel_link_nonce_issue('00000000-0000-4000-8000-000000003803', now() - interval '11 minutes') as n;
select t.ok((select channel_link_nonce_redeem((select n from n2),'tg:3804',now())->>'error'='invalid'),'expired after 10 minutes');
create temp table n3 as select channel_link_nonce_issue('00000000-0000-4000-8000-000000003803', now()) as n;
select t.ok((select channel_link_nonce_redeem((select n from n3),'tg:3802',now())->>'error'='linked_elsewhere'),'a chat linked to someone else never moves');
select t.ok((select channel_link_nonce_redeem('A','tg:3805',now())->>'error'='invalid' and channel_link_nonce_redeem(repeat('A',32),'tg:3805',now())->>'error'='invalid'),'made-up tokens do nothing');
select t.ok((select count(*)=0 from channel_contacts where contact='tg:3805'),'and leave nothing behind');

-- The same number on WhatsApp: asked on iMessage, linked only on its yes.
insert into channel_contacts(contact,user_id) values('+15550003803','00000000-0000-4000-8000-000000003803');
select t.ok((select user_id='00000000-0000-4000-8000-000000003803' and contact='+15550003803' from channel_link_candidate('+15550003803','whatsapp')),'the account already on iMessage with the number');
select t.ok((select channel_link_ask('00000000-0000-4000-8000-000000003803','wa:15550003803','+15550003803','+15550003803','Someone texted Trainee on WhatsApp from your number. Reply yes to link it.',now()) like 'link:%'),'asked');
select t.ok((select kind='link' and channel='imessage' and text like 'Someone texted Trainee on WhatsApp%' from career_outbox where user_id='00000000-0000-4000-8000-000000003803' and key like 'link:%'),'the question waits for iMessage, as a link row');
select t.ok((select user_id is null and last_inbound_at is not null from channel_contacts where contact='wa:15550003803'),'the WhatsApp contact is recorded, not linked');
select t.ok((select channel_link_ask('00000000-0000-4000-8000-000000003803','wa:15550003803','+15550003803','+15550003803','again',now()) is null),'asked once');
select t.ok((select channel_link_confirm('00000000-0000-4000-8000-000000003803','tg:3802','x',now()) is null),'a yes from another contact links nothing');
select t.ok((select channel_link_confirm('00000000-0000-4000-8000-000000003803','+15550003803','This chat is linked to your Trainee account now. Text here any time.',now())->>'contact'='wa:15550003803'),'the yes from iMessage links it');
select t.ok((select user_id='00000000-0000-4000-8000-000000003803' from channel_contacts where contact='wa:15550003803'),'linked');
select t.ok((select channel='whatsapp' from career_outbox where key like 'link:%:done' and user_id='00000000-0000-4000-8000-000000003803'),'and told on WhatsApp');
select t.ok((select channel_link_confirm('00000000-0000-4000-8000-000000003803','+15550003803','x',now()) is null),'a second yes links nothing more');

-- A card is not pushed into a closed WhatsApp window (home WhatsApp, last message 25 hours ago); it is once they write.
reset role;
insert into agent_threads(id,user_id,title) values('00000000-0000-4000-8000-0000000038a2','00000000-0000-4000-8000-000000003802','Texts');
update channel_contacts set thread_id='00000000-0000-4000-8000-0000000038a2' where user_id='00000000-0000-4000-8000-000000003802';
insert into channel_contacts(contact,user_id,thread_id,last_inbound_at) values('wa:15550003802','00000000-0000-4000-8000-000000003802','00000000-0000-4000-8000-0000000038a2',now() - interval '25 hours');
update channel_contacts set home=true where contact='wa:15550003802';
insert into career_apply_prepared(user_id,job_id,company,url,payload,payload_hash,card_lines)
 values('00000000-0000-4000-8000-000000003802','TEST-PAR-1','Parity Employer','https://jobs.lever.co/test/par1','{}'::jsonb,repeat('a',64),array['Parity Employer','Sends to https://jobs.lever.co/test/par1']);
create temp table pid as select array_agg(id) as ids from career_apply_prepared where job_id='TEST-PAR-1';
grant select on pid to service_role;
set role service_role;
select t.ok((select career_apply_card_push_as('00000000-0000-4000-8000-000000003802',(select ids from pid),'Parity Employer'||E'\n'||'Sends to https://jobs.lever.co/test/par1') is null),'the window is closed: no card');
select channel_inbound_seen('wa:15550003802', now(), null, null);
select t.ok((select career_apply_card_push_as('00000000-0000-4000-8000-000000003802',(select ids from pid),'Parity Employer'||E'\n'||'Sends to https://jobs.lever.co/test/par1') is not null),'after their message: the card');

-- Access.
reset role;
select t.as_user('00000000-0000-4000-8000-000000003801');
set role authenticated;
select t.ok((select count(*)=3 from channel_contacts),'a person reads their own contacts, every channel');
select t.ok((select channel_link_telegram_start() ~ '^[A-Za-z0-9_-]{32}$'),'and can start a Telegram link for themselves');
select t.ok((select channel_set_home('telegram')),'and set their home channel');
select t.must_fail($$select channel_set_home('sms')$$,'invalid home channel','only the three channels');
select t.must_fail($$select * from channel_link_nonces$$,'permission denied','but never read link tokens');
select t.must_fail($$select * from channel_link_requests$$,'permission denied','or link questions');
select t.must_fail($$select channel_link_nonce_issue('00000000-0000-4000-8000-000000003802', now())$$,'permission denied','or make a link for someone else');
select t.must_fail($$select channel_link_nonce_redeem('x','tg:1',now())$$,'permission denied','or redeem one');
select t.must_fail($$select * from career_outbox_claim_user('00000000-0000-4000-8000-000000003801', now(), 5)$$,'permission denied','or claim messages');
select t.must_fail($$select channel_inbound_seen('tg:3801', now(), null, null)$$,'permission denied','or mark a message seen');
select t.must_fail($$select channel_set_opt_out('tg:3801', false, now())$$,'permission denied','or change an opt-out directly');
reset role;
select t.as_user('');
set role anon;
select t.must_fail($$select channel_link_telegram_start()$$,'permission denied','nobody signed out starts a link');
reset role;

-- An account's deletion leaves no contact, token or question behind.
delete from auth.users where id in ('00000000-0000-4000-8000-000000003802','00000000-0000-4000-8000-000000003803');
select t.ok((select count(*)=0 from channel_contacts where user_id in ('00000000-0000-4000-8000-000000003802','00000000-0000-4000-8000-000000003803')),'no contacts');
select t.ok((select count(*)=0 from channel_link_nonces where user_id in ('00000000-0000-4000-8000-000000003802','00000000-0000-4000-8000-000000003803')),'no link tokens');
select t.ok((select count(*)=0 from channel_link_requests where user_id='00000000-0000-4000-8000-000000003803'),'no link questions');
rollback;
