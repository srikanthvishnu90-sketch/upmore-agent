-- The message that carried a card, recorded against the card (SERIAL-1462, 2026-10-25). A card's text yes counts only in
-- direct reply to the message that carried the card (career_apply_cards.ts, D-031 / SERIAL-1461); on a texting channel
-- that reply names the provider's id of our outgoing text, which the outbox already records when it delivers
-- (career_outbox.provider_id / provider_ids). What was missing is which card that text carried: card_id. The scheduled
-- push sets it (its row's key is card:<id> too); the chat's reply to "show my applications" sets it from the turn's
-- meta (trainee-inbound store). Existing 'card:' rows are backfilled from their key.
-- NOT APPLIED: the owner applies migrations. After 20261025170000.
alter table public.career_outbox add column if not exists card_id uuid references public.career_apply_cards(id) on delete set null;
create index if not exists career_outbox_card_id on public.career_outbox (card_id) where card_id is not null;
update public.career_outbox set card_id = substr(key, 6)::uuid
 where card_id is null and kind = 'card' and key ~ '^card:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and exists (select from public.career_apply_cards c where c.id = substr(key, 6)::uuid);

-- The scheduled push writes card_id on its row: 20261021075000's text with that one column added.
create or replace function public.career_apply_card_push_for(p_user uuid, p_ids uuid[], p_text text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare thread uuid; c public.career_apply_cards; home_contact text; seen timestamptz;
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
 insert into public.agent_messages (thread_id, role, content, meta)
 values (thread, 'assistant', p_text, jsonb_build_object('career', true, 'intent', 'career_apply_card', 'card_id', c.id, 'proactive', true));
 insert into public.career_outbox (user_id, key, kind, text, deliver_at, card_id) values (p_user, 'card:' || c.id, 'card', p_text, p_now, c.id);
 return c.id;
end $$;
