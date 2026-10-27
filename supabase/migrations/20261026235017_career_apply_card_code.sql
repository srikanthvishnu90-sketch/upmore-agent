-- One approval model on every channel (2026-10-26, three-channel readiness E-3 / E-5): a card is approved only by a
-- gesture bound to that exact card, and through it to the exact payload hash of every application the card shows.
--
-- A button (Telegram's inline keyboard, WhatsApp's reply buttons, the app's tap) carries the card's id and a digest of
-- its items (channel_card_tap.ts). A channel with no buttons (iMessage through LoopMessage; WhatsApp or Telegram when the
-- person types instead) has no way to carry that, and a bare "yes" names no card: it may have been typed for another
-- question, before a newer card arrived, or in a thread where no reply id exists. So every card now carries a short
-- approval code, shown in its last line ("Reply YES 4821 to send it"). The code:
--   - is drawn when the card is opened (career_apply_cards insert trigger), 4 digits from gen_random_uuid's random bits,
--     never equal to the code of another card the person was shown in the last 24 hours, so an old code can never
--     approve a newer card;
--   - approves only the card that carries it, only for the person it was shown to (looked up by p_user), only while the
--     card is open (single use: answering closes it), only within the card's 10-minute yes window, and only when every
--     item's prepared payload still hashes, recomputed here, to the hash the card showed: a payload changed since the card
--     was shown refuses the whole card and approves nothing;
--   - stops working after 5 wrong codes typed while the card is open (the card must be shown again, with a new code).
-- Every outcome is returned as a status, never raised, so a wrong code's count is kept.
--
-- The scheduled push (career_apply_card_push_for) renders its text before the card exists: the text carries the
-- placeholder [[APPROVE-CODE]] and the database puts the card's code in its place, so the text that goes out and the
-- card it opened always agree.
--
-- Inspect links (the owner's iMessage experience spec, section 7.1: "links to inspect the exact content before
-- deciding"; 7.2: the receipt links to exactly what was sent). Every card also gets an unguessable inspect token (128
-- bits from gen_random_uuid). career_apply_inspect_for(token) returns exactly what the card's application would send
-- (the prepared payload) and, once approved, exactly what the queue holds (career_apply_jobs.payload), each with a
-- verdict computed here: the payload, hashed again, equals the hash the card showed. trainee-inspect renders it; the
-- [[INSPECT-TOKEN]] placeholder of a pushed text is filled as the code's is.
-- NOT APPLIED: the owner applies migrations. After 20261026220016.

alter table public.career_apply_cards add column if not exists approve_code text;
alter table public.career_apply_cards add column if not exists code_misses int not null default 0;
alter table public.career_apply_cards add column if not exists inspect_token text;
create unique index if not exists career_apply_cards_inspect_token on public.career_apply_cards (inspect_token) where inspect_token is not null;
do $$ begin
 if not exists (select from pg_constraint where conname = 'career_apply_cards_approve_code_shape') then
  alter table public.career_apply_cards add constraint career_apply_cards_approve_code_shape check (approve_code is null or approve_code ~ '^[0-9]{4}$');
 end if;
end $$;
create index if not exists career_apply_cards_code on public.career_apply_cards (user_id, approve_code) where approve_code is not null;

-- The code of a new card: 4 digits, not the code of another card this person saw in the last 24 hours.
create or replace function public.career_apply_card_code_new() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare c text; i int := 0;
begin
 loop
  c := lpad(((('x' || lpad(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 16, '0'))::bit(64)::bigint) % 10000)::text, 4, '0');
  exit when not exists (select from public.career_apply_cards where user_id = new.user_id and approve_code = c and shown_at >= coalesce(new.shown_at, now()) - interval '24 hours');
  i := i + 1;
  if i >= 50 then raise exception 'no free approval code'; end if;
 end loop;
 new.approve_code := c;
 new.code_misses := 0;
 new.inspect_token := substr(encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'), 1, 32);
 return new;
end $$;
revoke all on function public.career_apply_card_code_new() from public, anon, authenticated, service_role;
drop trigger if exists career_apply_card_code_new on public.career_apply_cards;
create trigger career_apply_card_code_new before insert on public.career_apply_cards
 for each row execute function public.career_apply_card_code_new();

-- The answer by code. p_except: the card's numbers to leave out ("YES 4821 but not 2"); p_decline: "no" with the code.
-- Returns {status, ...}: answered (with results, as career_apply_card_answer_for gives them), no_card, wrong_code (with
-- misses), locked, outdated (a newer card closed it), answered_before, stale (shown more than 10 minutes ago, for an
-- approval), expired (more than 24 hours), not_on_card (with count), changed.
create or replace function public.career_apply_card_answer_code_for(p_user uuid, p_code text, p_except int[], p_decline boolean, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare c public.career_apply_cards; o public.career_apply_cards; it jsonb; p public.career_apply_prepared; approve int[]; res jsonb; misses int;
begin
 if p_user is null or p_now is null then raise exception 'invalid card code'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));
 select * into o from public.career_apply_cards where user_id = p_user and state = 'open' order by shown_at desc limit 1 for update;
 if coalesce(p_code, '') ~ '^[0-9]{4}$' then
  select * into c from public.career_apply_cards where user_id = p_user and approve_code = p_code and shown_at >= p_now - interval '24 hours'
   order by shown_at desc limit 1 for update;
 end if;
 if c.id is null then
  if o.id is null then return jsonb_build_object('status', 'no_card'); end if;
  update public.career_apply_cards set code_misses = code_misses + 1 where id = o.id returning code_misses into misses;
  return jsonb_build_object('status', case when misses >= 5 then 'locked' else 'wrong_code' end, 'misses', misses);
 end if;
 if c.state <> 'open' then
  return jsonb_build_object('status', case when c.answer ? 'closed' then 'outdated' else 'answered_before' end);
 end if;
 if c.code_misses >= 5 then return jsonb_build_object('status', 'locked', 'misses', c.code_misses); end if;
 if c.shown_at < p_now - interval '24 hours' then return jsonb_build_object('status', 'expired'); end if;
 if exists (select from unnest(coalesce(p_except, '{}')) a where a not between 1 and jsonb_array_length(c.items)) then
  return jsonb_build_object('status', 'not_on_card', 'count', jsonb_array_length(c.items));
 end if;
 select coalesce(array_agg((x->>'n')::int order by (x->>'n')::int), '{}') into approve from jsonb_array_elements(c.items) x
  where not coalesce(p_decline, false) and not ((x->>'n')::int = any(coalesce(p_except, '{}')));
 if cardinality(approve) > 0 and c.shown_at < p_now - interval '10 minutes' then return jsonb_build_object('status', 'stale'); end if;
 -- Every item exactly as shown: the stored hash and the hash of the stored payload, recomputed, are the card's.
 for it in select * from jsonb_array_elements(c.items) loop
  select * into p from public.career_apply_prepared where id = (it->>'prepared_id')::uuid and user_id = p_user for update;
  if p.id is null or p.payload_hash is distinct from it->>'payload_hash'
     or public.career_apply_payload_hash(p.payload) is distinct from it->>'payload_hash' then
   return jsonb_build_object('status', 'changed');
  end if;
 end loop;
 res := public.career_apply_card_answer_for(p_user, c.id, approve, p_now);
 update public.career_apply_cards set answer = coalesce(answer, '{}'::jsonb) || jsonb_build_object('via', 'code') where id = c.id;
 return jsonb_build_object('status', 'answered', 'card_id', c.id, 'results', res);
end $$;

create or replace function public.career_apply_card_answer_code_as(p_user uuid, p_code text, p_except int[], p_decline boolean)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
 select public.career_apply_card_answer_code_for(p_user, p_code, p_except, p_decline, clock_timestamp()) $$;
create or replace function public.career_apply_card_answer_code_own(p_code text, p_except int[], p_decline boolean)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
 select public.career_apply_card_answer_code_for(auth.uid(), p_code, p_except, p_decline, clock_timestamp()) $$;

-- The scheduled push, 20261025180000's text, with the card's code put in place of [[APPROVE-CODE]].
create or replace function public.career_apply_card_push_for(p_user uuid, p_ids uuid[], p_text text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare thread uuid; c public.career_apply_cards; home_contact text; seen timestamptz; body text;
begin
 if p_user is null or p_ids is null or cardinality(p_ids) not between 1 and 8 or p_now is null
  or p_text is null or length(p_text) not between 1 and 4000 then raise exception 'invalid card push'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));
 if exists (select from public.channel_contacts where user_id = p_user and opted_out) then return null; end if;
 select thread_id into thread from public.channel_contacts where user_id = p_user and thread_id is not null order by last_inbound_at desc nulls last, created_at limit 1;
 if thread is null then return null; end if;
 home_contact := public.channel_target(p_user, null);
 if home_contact like 'wa:%' then
  select last_inbound_at into seen from public.channel_contacts where contact = home_contact;
  if seen is null or seen < p_now - interval '23 hours' then return null; end if;
 end if;
 if exists (select from public.career_apply_cards where user_id = p_user and state = 'open' and shown_at >= p_now - interval '24 hours')
  or exists (select from public.career_outbox where user_id = p_user and kind = 'reply' and created_at >= p_now - interval '30 minutes')
  or coalesce((select m.meta->>'intent' in ('career_apply_questions', 'career_apply_confirm_which', 'career_apply_email')
                and m.created_at >= p_now - interval '24 hours'
               from public.agent_messages m where m.thread_id = thread and m.role = 'assistant' order by m.id desc limit 1), false)
  or (select count(*) from public.career_apply_prepared where user_id = p_user and state = 'ready' and id = any(p_ids)) <> cardinality(p_ids)
 then return null; end if;
 if exists (select from public.career_apply_prepared p, unnest(p.card_lines) l
            where p.id = any(p_ids) and position(btrim(regexp_replace(l, '\s+', ' ', 'g')) in p_text) = 0) then
  raise exception 'card text does not carry every line'; end if;
 c := public.career_apply_card_open_for(p_user, p_ids, p_now);
 body := replace(replace(p_text, '[[APPROVE-CODE]]', coalesce(c.approve_code, '')), '[[INSPECT-TOKEN]]', coalesce(c.inspect_token, ''));
 insert into public.agent_messages (thread_id, role, content, meta)
 values (thread, 'assistant', body, jsonb_build_object('career', true, 'intent', 'career_apply_card', 'card_id', c.id, 'proactive', true));
 insert into public.career_outbox (user_id, key, kind, text, deliver_at, card_id) values (p_user, 'card:' || c.id, 'card', body, p_now, c.id);
 return c.id;
end $$;

-- What a card's inspect link shows: the card's applications exactly as prepared, and as queued once approved, each with
-- whether it hashes, recomputed here, to the hash the card showed. A token of a card shown more than 30 days ago, or of
-- no card, is null. Read by trainee-inspect only (service role).
create or replace function public.career_apply_inspect_for(p_token text, p_now timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare c public.career_apply_cards; it jsonb; p public.career_apply_prepared; j public.career_apply_jobs; items jsonb := '[]';
begin
 if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' or p_now is null then return null; end if;
 select * into c from public.career_apply_cards where inspect_token = p_token;
 if c.id is null or c.shown_at < p_now - interval '30 days' then return null; end if;
 for it in select * from jsonb_array_elements(c.items) loop
  select * into p from public.career_apply_prepared where id = (it->>'prepared_id')::uuid and user_id = c.user_id;
  select * into j from public.career_apply_jobs where user_id = c.user_id and approval_hash = it->>'payload_hash' order by created_at desc limit 1;
  items := items || jsonb_build_object(
   'n', (it->>'n')::int, 'card_hash', it->>'payload_hash',
   'prepared', case when p.id is null then null else jsonb_build_object('company', p.company, 'url', p.url, 'payload', p.payload,
     'matches', p.payload_hash = it->>'payload_hash' and public.career_apply_payload_hash(p.payload) = it->>'payload_hash') end,
   'sent', case when j.id is null then null else jsonb_build_object('state', j.state, 'payload', j.payload, 'updated_at', j.updated_at,
     'matches', j.approval_hash = it->>'payload_hash' and public.career_apply_payload_hash(j.payload) = it->>'payload_hash') end);
 end loop;
 return jsonb_build_object('card_id', c.id, 'user_id', c.user_id, 'state', c.state, 'shown_at', c.shown_at, 'items', items);
end $$;
-- The inspect token of the card that approved a queued application (its approval hash), for the receipt's link.
create or replace function public.career_apply_inspect_token_for(p_user uuid, p_hash text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
 select c.inspect_token from public.career_apply_cards c
 where c.user_id = p_user and c.inspect_token is not null and c.items @> jsonb_build_array(jsonb_build_object('payload_hash', p_hash))
 order by c.shown_at desc limit 1 $$;

revoke all on function public.career_apply_inspect_for(text, timestamptz), public.career_apply_inspect_token_for(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_inspect_for(text, timestamptz), public.career_apply_inspect_token_for(uuid, text) to service_role;
revoke all on function public.career_apply_card_answer_code_for(uuid, text, int[], boolean, timestamptz),
 public.career_apply_card_answer_code_as(uuid, text, int[], boolean), public.career_apply_card_answer_code_own(text, int[], boolean),
 public.career_apply_card_push_for(uuid, uuid[], text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_card_answer_code_own(text, int[], boolean) to authenticated;
grant execute on function public.career_apply_card_answer_code_as(uuid, text, int[], boolean) to service_role;
