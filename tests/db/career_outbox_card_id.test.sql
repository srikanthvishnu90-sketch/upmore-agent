-- The message that carried a card is recorded against the card (20261025180000_career_outbox_card_id.sql, SERIAL-1462):
-- the push's row carries card_id; existing 'card:' rows are backfilled; a reply row takes a card_id; the delivered
-- provider ids on that row are what a texting reply-to names.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000e5','outboxcard@example.com');
insert into public.profiles(id) values('00000000-0000-0000-0000-0000000000e5') on conflict do nothing;
insert into public.career_watch_kv(user_id,key,value) values ('00000000-0000-0000-0000-0000000000e5','career:account','{"epoch":0,"version":0,"paused":false}');
select t.ok((select count(*)=1 from information_schema.columns where table_schema='public' and table_name='career_outbox' and column_name='card_id' and data_type='uuid'), 'career_outbox.card_id exists');
-- A prepared application, a card opened for it, and the push's row.
insert into public.career_apply_prepared (user_id, job_id, company, url, payload, payload_hash, card_lines)
 values ('00000000-0000-0000-0000-0000000000e5', 'TEST-OC-1', 'OC Employer', 'https://jobs.lever.co/oc/1', '{"version":1}', repeat('a',64), array['OC Employer: Analyst','Name: Test Person']);
create temp table oc as select * from public.career_apply_prepared where user_id='00000000-0000-0000-0000-0000000000e5' and job_id='TEST-OC-1';
insert into public.agent_threads (id, user_id) values ('00000000-0000-0000-0000-00000000e5aa', '00000000-0000-0000-0000-0000000000e5');
insert into public.channel_contacts (contact, user_id, thread_id, last_inbound_at, created_at) values ('+15550009999', '00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-00000000e5aa', now(), now());
create temp table pushed as select public.career_apply_card_push_for('00000000-0000-0000-0000-0000000000e5', (select array_agg(id) from oc), 'OC Employer: Analyst' || E'\n' || 'Name: Test Person', now()) as card;
select t.ok((select card is not null from pushed), 'the push opened a card');
select t.ok((select card_id = (select card from pushed) from public.career_outbox where user_id='00000000-0000-0000-0000-0000000000e5' and kind='card'), 'the push''s outbox row carries the card id');
-- A legacy 'card:' row without card_id is backfilled when the migration runs again (idempotent).
update public.career_outbox set card_id = null where user_id='00000000-0000-0000-0000-0000000000e5' and kind='card';
update public.career_outbox set card_id = substr(key, 6)::uuid
 where card_id is null and kind = 'card' and key ~ '^card:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and exists (select from public.career_apply_cards c where c.id = substr(key, 6)::uuid);
select t.ok((select card_id = (select card from pushed) from public.career_outbox where user_id='00000000-0000-0000-0000-0000000000e5' and kind='card'), 'backfilled from the key');
-- A chat reply that showed a card: its row takes the card id (as trainee-inbound''s store writes it), and the delivered
-- provider ids on it are what a texting reply-to names.
insert into public.career_outbox (user_id, key, kind, text, deliver_at, channel, card_id) values ('00000000-0000-0000-0000-0000000000e5', 'reply:TEST-OC-REPLY', 'reply', 'the card text', now(), 'imessage', (select card from pushed));
update public.career_outbox set status='delivered', delivered_at=now(), provider_id='LM-OUT-1', provider_ids=array['LM-OUT-1','LM-OUT-2'] where key='reply:TEST-OC-REPLY';
select t.ok((select card_id = (select card from pushed) from public.career_outbox where user_id='00000000-0000-0000-0000-0000000000e5' and (provider_id='LM-OUT-2' or provider_ids @> array['LM-OUT-2'])), 'the provider id of the text that carried the card finds the card');
select t.must_fail($$insert into public.career_outbox (user_id, key, kind, text, deliver_at, card_id) values ('00000000-0000-0000-0000-0000000000e5', 'reply:TEST-OC-BAD', 'reply', 'x', now(), gen_random_uuid())$$, 'violates foreign key', 'a card id that is no card is refused');
rollback;
