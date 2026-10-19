-- WO-022 step 3, from the scheduled run: applications the person prepared on their computer are shown on a card in their
-- texting thread without being asked for. One function does the whole push in one transaction: the card is opened (the
-- same career_apply_card_open_for as "show my applications"), written into the thread as Upmore's last word (so a texted
-- "yes" answers it, and only while nothing was said after it), and queued once in the outbox (kind "card", key
-- "card:<card id>"). Nothing is pushed:
--  - to a person without a texting thread, or who texted STOP;
--  - while a card shown in the last 24 hours is still open (one question at a time);
--  - while the person is mid-conversation (a reply was queued to them in the last 30 minutes): a "yes" meant for that
--    conversation must never land on a card that arrived in between;
--  - when any application is no longer ready (the person's own "show my applications" got there first);
--  - when the text does not carry every card line of every application on it, word for word.
alter table public.career_outbox drop constraint if exists career_outbox_key_check;
alter table public.career_outbox add constraint career_outbox_key_check
  check (key ~ '^(alert|report|reply|receipt|card):.+$' and length(key) <= 310);
alter table public.career_outbox drop constraint if exists career_outbox_kind_check;
alter table public.career_outbox add constraint career_outbox_kind_check check (kind in ('alert', 'report', 'reply', 'receipt', 'card'));
alter table public.career_proactive_runs add column if not exists cards int not null default 0 check (cards >= 0);

create or replace function public.career_apply_card_push_for(p_user uuid, p_ids uuid[], p_text text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare thread uuid; c public.career_apply_cards;
begin
 if p_user is null or p_ids is null or cardinality(p_ids) not between 1 and 8 or p_now is null
  or p_text is null or length(p_text) not between 1 and 4000 then raise exception 'invalid card push'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));
 select thread_id into thread from public.channel_contacts where user_id = p_user and not opted_out and thread_id is not null;
 if thread is null then return null; end if;
 if exists (select from public.career_apply_cards where user_id = p_user and state = 'open' and shown_at >= p_now - interval '24 hours')
  or exists (select from public.career_outbox where user_id = p_user and kind = 'reply' and created_at >= p_now - interval '30 minutes')
  or (select count(*) from public.career_apply_prepared where user_id = p_user and state = 'ready' and id = any(p_ids)) <> cardinality(p_ids)
 then return null; end if;
 if exists (select from public.career_apply_prepared p, unnest(p.card_lines) l
            where p.id = any(p_ids) and position(btrim(regexp_replace(l, '\s+', ' ', 'g')) in p_text) = 0) then
  raise exception 'card text does not carry every line'; end if;
 c := public.career_apply_card_open_for(p_user, p_ids, p_now);
 insert into public.agent_messages (thread_id, role, content, meta)
 values (thread, 'assistant', p_text, jsonb_build_object('career', true, 'intent', 'career_apply_card', 'card_id', c.id, 'proactive', true));
 insert into public.career_outbox (user_id, key, kind, text, deliver_at) values (p_user, 'card:' || c.id, 'card', p_text, p_now);
 return c.id;
end $$;
create or replace function public.career_apply_card_push_as(p_user uuid, p_ids uuid[], p_text text) returns uuid
language sql security definer set search_path = public, pg_temp as $$ select public.career_apply_card_push_for(p_user, p_ids, p_text, clock_timestamp()) $$;

revoke all on function public.career_apply_card_push_for(uuid, uuid[], text, timestamptz), public.career_apply_card_push_as(uuid, uuid[], text)
 from public, anon, authenticated, service_role;
grant execute on function public.career_apply_card_push_as(uuid, uuid[], text) to service_role;
