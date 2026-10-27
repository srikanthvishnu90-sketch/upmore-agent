-- One approval model on every channel (20261026235017_career_apply_card_code.sql): every card carries a 4-digit code,
-- and "YES <code>" approves exactly that card, for that person, once, inside its 10-minute window, only while every
-- item's payload still hashes to the hash the card showed. Five wrong codes lock the card. The push puts the code in its
-- text. Everything here runs as the database owner, as the edge functions' service path does (the _as door).
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000c1','cardcode-a@example.com'),('00000000-0000-0000-0000-0000000000c2','cardcode-b@example.com');
insert into public.profiles(id) values('00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c2') on conflict do nothing;
insert into public.career_watch_kv(user_id,key,value) values
 ('00000000-0000-0000-0000-0000000000c1','career:account','{"epoch":0,"version":0,"paused":false}'),
 ('00000000-0000-0000-0000-0000000000c2','career:account','{"epoch":0,"version":0,"paused":false}');
-- Both people have a confirmed resume on file (an entry and its fact_confirmed event) and the render their payloads bind
-- (resume_sha256 'b'x64) stored for them: #194's resume rule (career_resume_ok) refuses a prepared row, a card and a
-- queued application without them, and this test is about the code, not about that rule (tests/db/career_resume_required).
insert into public.agent_threads(id,user_id) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c2');
insert into public.agent_flow_state(thread_id,user_id,state) select t, u,
 jsonb_build_object('career', jsonb_build_object('stores', jsonb_build_object('profile', jsonb_build_object('facts', jsonb_build_array(
  jsonb_build_object('id','f1','kind','experience','status','confirmed','needs_confirmation',false,'confirmation_event_id','ev-cc-'||right(u::text,2),'text','CC Intern'))))))
 from (values ('00000000-0000-0000-0000-0000000000d1'::uuid,'00000000-0000-0000-0000-0000000000c1'::uuid),('00000000-0000-0000-0000-0000000000d2'::uuid,'00000000-0000-0000-0000-0000000000c2'::uuid)) v(t,u);
insert into public.career_events(user_id,kind,subject,detail) values
 ('00000000-0000-0000-0000-0000000000c1','fact_confirmed','CC Intern','{"confirmation_event_id":"ev-cc-c1"}'),
 ('00000000-0000-0000-0000-0000000000c2','fact_confirmed','CC Intern','{"confirmation_event_id":"ev-cc-c2"}');
insert into storage.objects(bucket_id,name) select 'career-resumes', u || '/' || repeat('b',64) || '.pdf'
 from (values ('00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c2')) v(u);
select t.ok(public.career_resume_ok('00000000-0000-0000-0000-0000000000c1', jsonb_build_object('resume_sha256', repeat('b',64)))
  and public.career_resume_ok('00000000-0000-0000-0000-0000000000c2', jsonb_build_object('resume_sha256', repeat('b',64))), 'setup: both people pass the resume rule');
create temp table cc (u uuid, n int, p public.career_apply_prepared);
do $$ declare g int; who uuid; r public.career_apply_prepared; pl jsonb; begin
 foreach who in array array['00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2']::uuid[] loop
  for g in 1..6 loop
   pl := jsonb_build_object('version',1,'user_id',who,'job_id','TEST-CC-'||g,'company','CC Employer '||g,'url','https://jobs.lever.co/cc'||g||'/1','fields','[]'::jsonb,
     'privacy_epoch',0,'account_version',0,'expires_at',now()+interval '1 day','resume_sha256',repeat('b',64));
   insert into public.career_apply_prepared (user_id, job_id, company, url, payload, payload_hash, card_lines)
    values (who, 'TEST-CC-'||g, 'CC Employer '||g, 'https://jobs.lever.co/cc'||g||'/1', pl, public.career_apply_payload_hash(pl), array['CC Employer '||g||': Analyst','Name: Test Person']) returning * into r;
   insert into cc values (who, g, r);
  end loop;
 end loop;
end $$;
create temp table a1 as select * from public.career_apply_card_open_for('00000000-0000-0000-0000-0000000000c1', (select array_agg((p).id order by n) from cc where u='00000000-0000-0000-0000-0000000000c1' and n <= 2), now());
create temp table b1 as select * from public.career_apply_card_open_for('00000000-0000-0000-0000-0000000000c2', (select array_agg((p).id order by n) from cc where u='00000000-0000-0000-0000-0000000000c2' and n <= 2), now());
select t.ok((select approve_code ~ '^[0-9]{4}$' and code_misses = 0 from a1), 'a new card carries a 4-digit code');
-- The other person's code, typed by A: refused, counted on A's own open card, nothing approved for anyone.
select t.ok((select case when (select approve_code from a1) = (select approve_code from b1) then true else
  (public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', (select approve_code from b1), null, false, now())->>'status') = 'wrong_code' end), 'another person''s code approves nothing (wrong_code)');
select t.ok((select count(*) = 0 from public.career_apply_jobs where user_id in ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2')), 'nothing queued for anyone');
select t.ok((select state = 'open' from public.career_apply_cards where id = (select id from b1)), 'B''s card is untouched');
-- A wrong code: refused and counted.
select t.ok((public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', lpad(((((select approve_code from a1)::int) + 1) % 10000)::text, 4, '0'), null, false, now())->>'status') = 'wrong_code', 'a wrong code: wrong_code');
select t.ok((select code_misses >= 1 from public.career_apply_cards where id = (select id from a1)), 'the miss is kept (a status, not a raise)');
-- Not a code at all: a miss too.
select t.ok((public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', '12', null, false, now())->>'status') = 'wrong_code', 'a 2-digit code: wrong_code');
-- A number not on the card.
select t.ok((public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', (select approve_code from a1), array[3], false, now())->>'status') = 'not_on_card', 'leaving out a number the card does not have: not_on_card');
-- The payload changed after the card was shown (the stored payload, not only its hash column): the whole card refused.
update public.career_apply_prepared set payload = jsonb_set(payload, '{company}', '"CC Employer CHANGED"') where id = (select (p).id from cc where u='00000000-0000-0000-0000-0000000000c1' and n = 2);
select t.ok((public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', (select approve_code from a1), null, false, now())->>'status') = 'changed', 'a payload changed since the card: changed');
select t.ok((select count(*) = 0 from public.career_apply_jobs where user_id = '00000000-0000-0000-0000-0000000000c1'), 'nothing queued from a changed card');
update public.career_apply_prepared set payload = (select (p).payload from cc where u='00000000-0000-0000-0000-0000000000c1' and n = 2) where id = (select (p).id from cc where u='00000000-0000-0000-0000-0000000000c1' and n = 2);
-- Shown 11 minutes ago: stale for an approval; the card stays open.
update public.career_apply_cards set shown_at = now() - interval '11 minutes' where id = (select id from a1);
select t.ok((public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', (select approve_code from a1), null, false, now())->>'status') = 'stale', 'an approval 11 minutes after the card: stale');
update public.career_apply_cards set shown_at = now() where id = (select id from a1);
-- The right code, "but not 2": exactly item 1 queued, bound to its shown hash; the card answered, by code.
create temp table ans as select public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', (select approve_code from a1), array[2], false, now()) as r;
select t.ok((select r->>'status' = 'answered' and r->'results'->0->>'result' = 'queued' and r->'results'->1->>'result' = 'declined' from ans), 'YES <code> but not 2: 1 queued, 2 declined');
select t.ok((select count(*) = 1 from public.career_apply_jobs j where user_id = '00000000-0000-0000-0000-0000000000c1' and state = 'queued'
  and approval_hash = (select (p).payload_hash from cc where u='00000000-0000-0000-0000-0000000000c1' and n = 1) and payload_hash = approval_hash), 'one queue row, its approval hash the hash the card showed');
select t.ok((select state = 'answered' and answer->>'via' = 'code' from public.career_apply_cards where id = (select id from a1)), 'the card is answered, by code');
-- Single use: the same code again.
select t.ok((public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', (select approve_code from a1), null, false, now())->>'status') = 'answered_before', 'the same code twice: answered_before');
select t.ok((select count(*) = 1 from public.career_apply_jobs where user_id = '00000000-0000-0000-0000-0000000000c1'), 'still one row');
-- A newer card closes the older one: the older card's code is outdated, never the new card's; the codes differ.
create temp table a2 as select * from public.career_apply_card_open_for('00000000-0000-0000-0000-0000000000c1', (select array_agg((p).id order by n) from cc where u='00000000-0000-0000-0000-0000000000c1' and n = 3), now());
create temp table a3 as select * from public.career_apply_card_open_for('00000000-0000-0000-0000-0000000000c1', (select array_agg((p).id order by n) from cc where u='00000000-0000-0000-0000-0000000000c1' and n = 4), now());
select t.ok((select count(distinct approve_code) = 3 from public.career_apply_cards where user_id = '00000000-0000-0000-0000-0000000000c1'), 'no two cards of one person in 24 hours share a code');
select t.ok((public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', (select approve_code from a2), null, false, now())->>'status') = 'outdated', 'the code of a card a newer one closed: outdated');
select t.ok((select state = 'open' from public.career_apply_cards where id = (select id from a3)), 'the newer card is untouched by the older code');
-- A decline by code: nothing queued, the card answered.
select t.ok((public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', (select approve_code from a3), null, true, now())->'results'->0->>'result') = 'declined', 'NO <code>: declined');
select t.ok((select count(*) = 1 from public.career_apply_jobs where user_id = '00000000-0000-0000-0000-0000000000c1'), 'nothing more queued');
-- No open card: no_card, nothing counted anywhere.
select t.ok((public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', '0000', null, false, now())->>'status') in ('no_card', 'answered_before', 'outdated'), 'no open card: nothing approved');
-- Five wrong codes lock the open card: the right code then approves nothing.
create temp table a4 as select * from public.career_apply_card_open_for('00000000-0000-0000-0000-0000000000c1', (select array_agg((p).id order by n) from cc where u='00000000-0000-0000-0000-0000000000c1' and n = 5), now());
do $$ declare i int; w text; begin
 for i in 1..5 loop
  w := lpad(((((select approve_code from a4)::int) + 5000 + i) % 10000)::text, 4, '0');
  if exists (select from public.career_apply_cards where user_id = '00000000-0000-0000-0000-0000000000c1' and approve_code = w) then w := 'x'; end if;
  perform public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', w, null, false, now());
 end loop;
end $$;
select t.ok((public.career_apply_card_answer_code_for('00000000-0000-0000-0000-0000000000c1', (select approve_code from a4), null, false, now())->>'status') = 'locked', 'after five wrong codes the right one is locked');
select t.ok((select count(*) = 1 from public.career_apply_jobs where user_id = '00000000-0000-0000-0000-0000000000c1'), 'nothing queued by a locked card');
-- The push puts the code in the text it sends and records.
insert into public.agent_threads (id, user_id) values ('00000000-0000-0000-0000-0000000c2aaa', '00000000-0000-0000-0000-0000000000c2');
insert into public.channel_contacts (contact, user_id, thread_id, last_inbound_at, created_at) values ('+15550008888', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000c2aaa', now() - interval '2 hours', now());
update public.career_apply_cards set state = 'answered', answer = '{"closed":"test"}' where user_id = '00000000-0000-0000-0000-0000000000c2';
create temp table pushed as select public.career_apply_card_push_for('00000000-0000-0000-0000-0000000000c2', (select array_agg((p).id) from cc where u='00000000-0000-0000-0000-0000000000c2' and n = 6),
  'CC Employer 6: Analyst' || E'\n' || 'Name: Test Person' || E'\n\n' || 'Review: https://x.test/i?t=[[INSPECT-TOKEN]]' || E'\n\n' || 'Reply "YES [[APPROVE-CODE]]" to send it, or "no".', now()) as card;
select t.ok((select card is not null from pushed), 'the push opened a card');
select t.ok((select o.text = 'CC Employer 6: Analyst' || E'\n' || 'Name: Test Person' || E'\n\n' || 'Review: https://x.test/i?t=' || c.inspect_token || E'\n\n' || 'Reply "YES ' || c.approve_code || '" to send it, or "no".'
  from public.career_outbox o join public.career_apply_cards c on c.id = o.card_id where o.card_id = (select card from pushed)), 'the pushed text carries the card''s own code, no placeholder');
select t.ok((select position('[[APPROVE-CODE]]' in m.content) = 0 and position('[[INSPECT-TOKEN]]' in m.content) = 0 and position(c.approve_code in m.content) > 0
  from public.agent_messages m join public.career_apply_cards c on c.id = (m.meta->>'card_id')::uuid where m.meta->>'card_id' = (select card from pushed)::text), 'the thread''s copy too');
-- Inspect links: every card has its own 128-bit token; the page's data says whether each payload hashes to the card's hash.
select t.ok((select bool_and(inspect_token ~ '^[0-9a-f]{32}$') and count(distinct inspect_token) = count(*) from public.career_apply_cards where user_id in ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2')), 'every card has its own 32-hex inspect token');
select t.ok((select (public.career_apply_inspect_for((select inspect_token from a1), now())->'items'->0->'sent'->>'matches')::boolean
  and (public.career_apply_inspect_for((select inspect_token from a1), now())->'items'->0->'prepared'->>'matches')::boolean), 'the approved card: what was queued hashes to the card''s hash');
select t.ok((select public.career_apply_inspect_for((select inspect_token from a1), now())->'items'->1->'sent' = 'null'::jsonb), 'the left-out item: nothing sent');
update public.career_apply_prepared set payload = jsonb_set(payload, '{company}', '"CC changed"') where id = (select (p).id from cc where u='00000000-0000-0000-0000-0000000000c1' and n = 5);
select t.ok((select (public.career_apply_inspect_for((select inspect_token from a4), now())->'items'->0->'prepared'->>'matches')::boolean = false), 'a payload changed after the card: the page says it does not match');
select t.ok(public.career_apply_inspect_for(repeat('0', 32), now()) is null and public.career_apply_inspect_for('nope', now()) is null, 'an unknown or malformed token shows nothing');
select t.ok(public.career_apply_inspect_for((select inspect_token from a1), now() + interval '31 days') is null, 'a card older than 30 days shows nothing');
select t.ok(public.career_apply_inspect_token_for('00000000-0000-0000-0000-0000000000c1', (select (p).payload_hash from cc where u='00000000-0000-0000-0000-0000000000c1' and n = 1)) = (select inspect_token from a1), 'the receipt finds the approving card''s token by the approval hash');
select t.ok(public.career_apply_inspect_token_for('00000000-0000-0000-0000-0000000000c2', (select (p).payload_hash from cc where u='00000000-0000-0000-0000-0000000000c1' and n = 1)) is null, 'not for another person');
select t.ok(not has_function_privilege('authenticated', 'public.career_apply_inspect_for(text, timestamptz)', 'execute') and not has_function_privilege('anon', 'public.career_apply_inspect_for(text, timestamptz)', 'execute'), 'inspect data: service role only');
-- The service door and the person's door exist with the right grants; anon has neither.
select t.ok(has_function_privilege('service_role', 'public.career_apply_card_answer_code_as(uuid, text, int[], boolean)', 'execute'), 'service_role: _as');
select t.ok(not has_function_privilege('authenticated', 'public.career_apply_card_answer_code_as(uuid, text, int[], boolean)', 'execute'), 'authenticated: not _as');
select t.ok(has_function_privilege('authenticated', 'public.career_apply_card_answer_code_own(text, int[], boolean)', 'execute'), 'authenticated: _own');
select t.ok(not has_function_privilege('anon', 'public.career_apply_card_answer_code_own(text, int[], boolean)', 'execute'), 'anon: nothing');
select t.ok(not has_function_privilege('authenticated', 'public.career_apply_card_answer_code_for(uuid, text, int[], boolean, timestamptz)', 'execute'), 'the inner function is nobody''s');
-- No two of one person's cards in 24 hours share a code, even over 300 cards (with codes drawn independently, a repeat
-- among 300 of 10,000 is all but certain: the chance of none is about 1%).
do $$ declare i int; begin
 for i in 1..300 loop
  perform public.career_apply_card_open_for('00000000-0000-0000-0000-0000000000c1', array[(select (p).id from cc where u='00000000-0000-0000-0000-0000000000c1' and n = 6)], now());
 end loop;
end $$;
select t.ok((select count(*) = count(distinct approve_code) and count(*) >= 300 from public.career_apply_cards where user_id = '00000000-0000-0000-0000-0000000000c1' and shown_at >= now() - interval '24 hours'), 'every card of one person in 24 hours has its own code');
rollback;
