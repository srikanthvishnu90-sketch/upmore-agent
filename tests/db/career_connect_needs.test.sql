-- FEATURE NEEDS (20261026160000_career_connect_needs.sql): the connect link is stored only as its hash, peeks without being
-- used, opens once, finishes once within 15 minutes of the open, is the person's own, and only the service role reaches
-- it; an offered need is recorded once.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000c1','pat@example.com'),('00000000-0000-0000-0000-0000000000c2','sam@example.com');
insert into public.agent_threads(id,user_id) values('00000000-0000-0000-0000-00000000a0c1','00000000-0000-0000-0000-0000000000c1');
set role service_role;
create temp table l1 as select public.career_connect_link_issue('00000000-0000-0000-0000-0000000000c1','telegram','00000000-0000-0000-0000-00000000a0c1',
  array['https://www.googleapis.com/auth/gmail.readonly','openid','email'], now()) as tok;
select t.ok((select length(tok)=32 from l1), 'a 32-character token');
select t.ok((select connector = 'google' and purpose = 'connect' from public.career_connect_links where nonce_hash = encode(sha256(convert_to((select tok from l1),'UTF8')),'hex')), 'the connector and purpose default to google and connect');
do $$ begin
  perform public.career_connect_link_issue('00000000-0000-0000-0000-0000000000c1','web',null,array['email'], now(), 'microsoft', 'connect');
  raise exception 'an unbuilt connector was accepted';
exception when check_violation then null; end $$;
select t.ok(true, 'a connector that is not built is refused');
select t.ok((select count(*)=1 from public.career_connect_links where nonce_hash = encode(sha256(convert_to((select tok from l1),'UTF8')),'hex')), 'stored only as its hash');
select t.ok((select count(*)=0 from public.career_connect_links where nonce_hash = (select tok from l1)), 'never the token itself');
select t.ok((select public.career_connect_link_peek((select tok from l1), now())->>'status' = 'ok'), 'a peek sees it');
select t.ok((select public.career_connect_link_peek((select tok from l1), now())->>'hint' = 'p•••@example.com'), 'the hint is masked');
select t.ok((select public.career_connect_link_peek((select tok from l1), now())->>'status' = 'ok'), 'a peek never uses it');
create temp table o1 as select public.career_connect_link_open((select tok from l1), now()) as v;
select t.ok((select v ? 'link_id' from o1), 'the tap opens it');
select t.ok((select public.career_connect_link_open((select tok from l1), now())->>'error' = 'used'), 'and only once');
select t.ok((select public.career_connect_link_peek((select tok from l1), now())->>'status' = 'used'), 'a used link peeks as used');
select t.ok((select (public.career_connect_link_finish((select (v->>'link_id')::uuid from o1),'connected',now())->>'user_id') = '00000000-0000-0000-0000-0000000000c1' from o1), 'the callback finishes it for its person');
select t.ok((select public.career_connect_link_finish((select (v->>'link_id')::uuid from o1),'connected',now())->>'error' = 'used'), 'the callback lands once');
-- Expiry: a link past its 15 minutes, and a callback 15 minutes after the open.
create temp table l2 as select public.career_connect_link_issue('00000000-0000-0000-0000-0000000000c1','web',null,array['email'], now() - interval '20 minutes') as tok;
select t.ok((select public.career_connect_link_open((select tok from l2), now())->>'error' = 'expired'), 'an expired link does not open');
create temp table l3 as select public.career_connect_link_issue('00000000-0000-0000-0000-0000000000c1','web',null,array['email'], now() - interval '14 minutes') as tok;
create temp table o3 as select public.career_connect_link_open((select tok from l3), now() - interval '14 minutes') as v;
select t.ok((select public.career_connect_link_finish((select (v->>'link_id')::uuid from o3),'connected',now() + interval '2 minutes')->>'error' = 'expired' from o3), 'a late callback is refused');
-- Another person's thread is never bound; scopes beyond Gmail read, send, openid and email are refused.
create temp table l4 as select public.career_connect_link_issue('00000000-0000-0000-0000-0000000000c2','web','00000000-0000-0000-0000-00000000a0c1',array['email'], now()) as tok;
select t.ok((select thread_id is null from public.career_connect_links where nonce_hash = encode(sha256(convert_to((select tok from l4),'UTF8')),'hex')), 'Sam''s link never carries Pat''s thread');
do $$ begin
  perform public.career_connect_link_issue('00000000-0000-0000-0000-0000000000c2','web',null,array['https://www.googleapis.com/auth/calendar.events'], now());
  raise exception 'a calendar scope was accepted';
exception when check_violation then null; end $$;
select t.ok(true, 'a scope beyond the Gmail ones is refused');
-- Burn: every live link of a person, none of another's.
select t.ok((select public.career_connect_links_burn('00000000-0000-0000-0000-0000000000c2', now()) = 1), 'Sam''s live link burned');
select t.ok((select count(*) = 0 from public.career_connect_links where user_id = '00000000-0000-0000-0000-0000000000c2' and finished_at is null), 'none of Sam''s works');
-- A Google grant deleted (any disconnect path): the person's live links die with it; a reconnect (upsert) burns nothing.
create temp table l5 as select public.career_connect_link_issue('00000000-0000-0000-0000-0000000000c1','telegram',null,array['email'], now()) as tok;
insert into public.user_oauth_connections (user_id, provider, vault_name, email, scopes) values ('00000000-0000-0000-0000-0000000000c1', 'google_career', 'oauth_google_career_00000000-0000-0000-0000-0000000000c1', 'p@g.test', 'openid email');
update public.user_oauth_connections set scopes = 'openid email https://www.googleapis.com/auth/gmail.readonly' where user_id = '00000000-0000-0000-0000-0000000000c1';
select t.ok((select finished_at is null from public.career_connect_links where nonce_hash = encode(sha256(convert_to((select tok from l5),'UTF8')),'hex')), 'a reconnect burns no link');
delete from public.user_oauth_connections where user_id = '00000000-0000-0000-0000-0000000000c1';
select t.ok((select finished_at is not null and outcome = 'error' from public.career_connect_links where nonce_hash = encode(sha256(convert_to((select tok from l5),'UTF8')),'hex')), 'a disconnect burns every live link of the person');
select t.ok((select public.career_connect_link_open((select tok from l5), now())->>'error' = 'used'), 'so a link sent before it never opens');
-- An offered need, once.
select t.ok(public.career_needs_mark('00000000-0000-0000-0000-0000000000c1','gmail_read:email_code',now()), 'offered the first time');
select t.ok(not public.career_needs_mark('00000000-0000-0000-0000-0000000000c1','gmail_read:email_code',now()), 'never twice');
select t.ok((select count(*)=1 from public.career_needs_asked), 'one row');
-- The person's own session reaches none of it.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
do $$ begin
  perform public.career_connect_link_issue('00000000-0000-0000-0000-0000000000c1','web',null,array['email'], now());
  raise exception 'authenticated minted a link';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform count(*) from public.career_connect_links;
  raise exception 'authenticated read the links';
exception when insufficient_privilege then null; end $$;
select t.ok(true, 'the person''s session can neither mint nor read links');
reset role;
rollback;
