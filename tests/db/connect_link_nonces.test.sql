-- WO-101 (20261023110000_connect_link_nonces.sql): a connect link's token is minted by the service for one person, stored
-- only as its hash, consumed once, refused when expired or minted for another purpose, and neither minted nor consumed by
-- anyone but the service role.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000010101','con1@example.test'),('00000000-0000-4000-8000-000000010102','con2@example.test');
set role service_role;

create temp table k1 as select connect_link_issue('00000000-0000-4000-8000-000000010101', 'connect_google_career', now()) as n;
select t.ok((select n ~ '^[A-Za-z0-9_-]{32}$' from k1),'a 32-character token');
select t.ok((select count(*)=1 and bool_and(nonce_hash=encode(sha256(convert_to((select n from k1),'UTF8')),'hex') and nonce_hash<>(select n from k1))
  from connect_link_nonces where user_id='00000000-0000-4000-8000-000000010101'),'stored only as its hash');
-- Peek (the link's GET, which message previews also fetch): never burns, never names the user, shows a masked hint.
insert into channel_contacts(contact,user_id,last_inbound_at,created_at) values ('+15550010101','00000000-0000-4000-8000-000000010101',now(),now());
select connect_link_peek((select n from k1),'connect_google_career',now()) from generate_series(1,3);
select t.ok((select used_at is null from connect_link_nonces where nonce_hash=encode(sha256(convert_to((select n from k1),'UTF8')),'hex')),
  'three peeks never set used_at');
select t.ok((select connect_link_peek((select n from k1),'connect_google_career',now()) = '{"status":"ok","hint":"•••0101"}'::jsonb),
  'a peek says ok with the last four digits of the person''s number, and nothing else');
select t.ok((select connect_link_peek((select n from k1),'connect_google_career',now())::text !~ '5550010101|00000000-0000-4000-8000-000000010101|con1@'),
  'never the full number, the user or the email');
select t.ok((select connect_link_peek((select n from k1),'link_telegram',now())->>'status'='invalid'),'another purpose peeks invalid');
select t.ok((select connect_link_peek('A','connect_google_career',now())->>'status'='invalid'),'a made-up token peeks invalid');
select t.ok((select connect_link_consume((select n from k1),'connect_google_career',now())->>'user_id'='00000000-0000-4000-8000-000000010101'),
  'minted for A, consumed once after the peeks: it names A');
select t.ok((select connect_link_peek((select n from k1),'connect_google_career',now())->>'status'='used'),'a consumed token peeks used');
select t.ok((select connect_link_consume((select n from k1),'connect_google_career',now())->>'error'='used'),'a second consume is refused');

create temp table k2 as select connect_link_issue('00000000-0000-4000-8000-000000010102', 'connect_google_career', now() - interval '16 minutes') as n;
select t.ok((select connect_link_peek((select n from k2),'connect_google_career',now())->>'status'='expired'),'an expired token peeks expired');
select t.ok((select connect_link_consume((select n from k2),'connect_google_career',now())->>'error'='expired'),'expired after 15 minutes');
select t.ok((select connect_link_consume((select n from k2),'connect_google_career',now())->>'user_id' is null),'and an expired one never names anyone');

create temp table k3 as select connect_link_issue('00000000-0000-4000-8000-000000010102', 'connect_google_career', now()) as n;
select t.ok((select connect_link_peek((select n from k3),'connect_google_career',now()) = '{"status":"ok","hint":"c•••@example.test"}'::jsonb),
  'no number on file: the email, masked');
reset role;
update auth.users set email = null where id = '00000000-0000-4000-8000-000000010102';
set role service_role;
select t.ok((select connect_link_peek((select n from k3),'connect_google_career',now()) = '{"status":"ok","hint":null}'::jsonb),'neither: no hint');
select t.ok((select connect_link_consume((select n from k3),'link_telegram',now())->>'error'='invalid'),'another purpose is refused');
select t.ok((select used_at is null from connect_link_nonces where nonce_hash=encode(sha256(convert_to((select n from k3),'UTF8')),'hex')),
  'and the refusal does not burn the token');
select t.ok((select channel_link_nonce_redeem((select n from k3),'tg:10102',now())->>'error'='invalid'),'nor does it redeem as a Telegram link');
select t.must_fail($$select connect_link_issue('00000000-0000-4000-8000-000000010101', 'link_telegram', now())$$,'invalid link request','only a known purpose is minted');
select t.must_fail($$select connect_link_issue(null, 'connect_google_career', now())$$,'invalid link request','only for a person');
select t.ok((select connect_link_consume('A','connect_google_career',now())->>'error'='invalid' and connect_link_consume(repeat('A',32),'connect_google_career',now())->>'error'='invalid'),
  'made-up tokens do nothing');

-- At most three live tokens per person; the oldest is burned.
select connect_link_issue('00000000-0000-4000-8000-000000010101', 'connect_google_career', now() + (i || ' seconds')::interval) from generate_series(1,4) i;
select t.ok((select count(*)=3 from connect_link_nonces where user_id='00000000-0000-4000-8000-000000010101' and used_at is null),'three live tokens at most');

reset role;
select t.as_user('00000000-0000-4000-8000-000000010101');
set role authenticated;
select t.must_fail($$select * from connect_link_nonces$$,'permission denied','a signed-in person never reads tokens');
select t.must_fail($$select connect_link_issue('00000000-0000-4000-8000-000000010101', 'connect_google_career', now())$$,'permission denied','nor mints one, even for themselves');
select t.must_fail($$select connect_link_consume(repeat('A',32),'connect_google_career',now())$$,'permission denied','nor consumes one');
select t.must_fail($$select connect_link_peek(repeat('A',32),'connect_google_career',now())$$,'permission denied','nor peeks at one');
reset role;
select t.as_user('');
set role anon;
select t.must_fail($$select connect_link_issue('00000000-0000-4000-8000-000000010101', 'connect_google_career', now())$$,'permission denied','anon never mints');
select t.must_fail($$select connect_link_consume(repeat('A',32),'connect_google_career',now())$$,'permission denied','nor consumes');
select t.must_fail($$select connect_link_peek(repeat('A',32),'connect_google_career',now())$$,'permission denied','nor peeks');
reset role;

delete from auth.users where id in ('00000000-0000-4000-8000-000000010101','00000000-0000-4000-8000-000000010102');
select t.ok((select count(*)=0 from connect_link_nonces),'an account''s deletion leaves no token');
rollback;
