-- WO-038: WhatsApp and Telegram beside iMessage, every Trainee feature on all three. Additive and idempotent; every
-- existing row stays an iMessage row and every existing function keeps its signature.
--
-- channel_contacts: a person may have one contact per channel (it was one contact, ever). The contact key stays the
-- primary key: the phone or email for iMessage (unchanged), "wa:<wa_id or business-scoped id>", "tg:<chat id>"; channel
-- and address are derived from it by a trigger, so they can never disagree. last_inbound_at is the person's last message
-- on that channel (WhatsApp's 24-hour window, and the most recent channel is the home channel unless the person set one
-- with home); nudged_at is the last "updates are waiting" template; alias is WhatsApp's other id for the same sender; phone
-- is the number when the platform gives it (never for Telegram), used only to ask, never to merge.
alter table public.channel_contacts
  add column if not exists channel text not null default 'imessage',
  add column if not exists address text,
  add column if not exists alias text,
  add column if not exists phone text,
  add column if not exists home boolean not null default false,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists nudged_at timestamptz;

create or replace function public.channel_contacts_derive() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.channel := case when new.contact like 'wa:%' then 'whatsapp' when new.contact like 'tg:%' then 'telegram' else 'imessage' end;
  new.address := case when new.channel = 'imessage' then new.contact else substr(new.contact, 4) end;
  if new.channel = 'imessage' and new.contact like '+%' then new.phone := new.contact; end if;
  if new.channel = 'telegram' then new.phone := null; end if;
  return new;
end $$;
drop trigger if exists channel_contacts_derive on public.channel_contacts;
create trigger channel_contacts_derive before insert or update of contact, channel, address, phone on public.channel_contacts
  for each row execute function public.channel_contacts_derive();
update public.channel_contacts set address = contact where address is null;

alter table public.channel_contacts drop constraint if exists channel_contacts_contact_check;
alter table public.channel_contacts add constraint channel_contacts_contact_check
  check (contact ~ '^(\+[0-9]{8,15}|[^@\s]+@[^@\s]+|wa:[A-Za-z0-9._-]{1,128}|tg:[1-9][0-9]{0,19})$');
alter table public.channel_contacts drop constraint if exists channel_contacts_shape;
alter table public.channel_contacts add constraint channel_contacts_shape check (
  channel in ('imessage', 'whatsapp', 'telegram') and address is not null
  and (alias is null or alias ~ '^[A-Za-z0-9._-]{1,128}$') and (phone is null or phone ~ '^\+[0-9]{8,15}$'));
-- One contact per person per channel (the name is the old one-contact constraint's, so its test still reads it).
alter table public.channel_contacts drop constraint if exists channel_contacts_user_id_key;
create unique index if not exists channel_contacts_user_id_key on public.channel_contacts (user_id, channel);
create unique index if not exists channel_contacts_alias on public.channel_contacts (alias) where alias is not null;
create index if not exists channel_contacts_phone on public.channel_contacts (phone) where phone is not null and user_id is not null;

-- channel_inbound: dedupe per provider (Telegram's update_id, WhatsApp's message id, LoopMessage's message id). A Telegram
-- message_id is only unique inside its chat, so it is never the key.
alter table public.channel_inbound add column if not exists provider text not null default 'loopmessage';
alter table public.channel_inbound drop constraint if exists channel_inbound_provider_check;
alter table public.channel_inbound add constraint channel_inbound_provider_check check (provider in ('loopmessage', 'whatsapp', 'telegram'));
alter table public.channel_inbound drop constraint if exists channel_inbound_pkey;
alter table public.channel_inbound add constraint channel_inbound_pkey primary key (provider, provider_message_id);

-- career_outbox: the channel a row must go out on (a reply: the channel the message came in on; null: the person's home
-- channel when it is delivered); "held" for a WhatsApp row outside the 24-hour window, which the person's next message puts
-- back in the queue; every provider message id a row went out as (a WhatsApp status maps back to its row); link rows
-- (kind "link"). Every kind and key an earlier migration allows stays: 20261020100000's status and followup (mail
-- tracking) and PR #52's mock; each is delivered, held and nudged like any message Trainee starts.
alter table public.career_outbox add column if not exists channel text, add column if not exists provider_ids text[];
-- A reply longer than one row (an outreach batch of drafts, a long card) is several rows reply:<id>:<n>, each whole: part_of
-- is the reply's key and part its place. A part is never claimed while an earlier part of the same reply is waiting on
-- something else (another run is sending it, it waits for a retry, or for WhatsApp's window), so parts arrive in order.
alter table public.career_outbox add column if not exists part_of text, add column if not exists part int;
alter table public.career_outbox drop constraint if exists career_outbox_part;
alter table public.career_outbox add constraint career_outbox_part check (
  (part is null) = (part_of is null) and (part is null or (part between 1 and 50 and part_of ~ '^reply:.+$' and key = part_of || ':' || part)));
create index if not exists career_outbox_parts on public.career_outbox (user_id, part_of, part) where part_of is not null;
alter table public.career_outbox drop constraint if exists career_outbox_channel;
alter table public.career_outbox add constraint career_outbox_channel check (
  (channel is null or channel in ('imessage', 'whatsapp', 'telegram')) and (provider_ids is null or cardinality(provider_ids) <= 10));
alter table public.career_outbox drop constraint if exists career_outbox_status;
alter table public.career_outbox add constraint career_outbox_status check (
  status in ('queued', 'sending', 'delivered', 'failed', 'skipped_opt_out', 'held')
  and attempts between 0 and 10
  and (status <> 'delivered' or delivered_at is not null)
  and (provider_id is null or length(provider_id) <= 200)
  and (error is null or length(error) <= 500));
-- WO-032's 'questions' (20261021040000_career_apply_ops.sql, an earlier file) stays: outbox kinds only grow.
alter table public.career_outbox drop constraint if exists career_outbox_key_check;
alter table public.career_outbox add constraint career_outbox_key_check
  check (key ~ '^(alert|report|reply|receipt|card|status|followup|mock|questions|brief|digest|link):.+$' and length(key) <= 310);
alter table public.career_outbox drop constraint if exists career_outbox_kind_check;
alter table public.career_outbox add constraint career_outbox_kind_check check (kind in ('alert', 'report', 'reply', 'receipt', 'card', 'status', 'followup', 'mock', 'questions', 'brief', 'digest', 'link'));
create index if not exists career_outbox_held on public.career_outbox (user_id) where status = 'held';
create index if not exists career_outbox_provider_ids on public.career_outbox using gin (provider_ids) where provider_ids is not null;
create index if not exists career_outbox_provider_id on public.career_outbox (provider_id) where provider_id is not null;
alter table public.channel_delivery_runs
  add column if not exists held int not null default 0, add column if not exists nudged int not null default 0,
  add column if not exists not_wired int not null default 0;

-- The contact a row goes to: on its channel when it has one, else the home channel (the one the person set, else the one
-- they wrote on last, else the first one linked).
create or replace function public.channel_target(p_user uuid, p_channel text) returns text
language sql stable security definer set search_path = public as $$
  select c.contact from public.channel_contacts c
  where c.user_id = p_user and (p_channel is null or c.channel = p_channel)
  order by c.home desc, c.last_inbound_at desc nulls last, c.created_at, c.contact
  limit 1
$$;

-- The claims of 20261019020000/20261019030000 with the same signatures: the contact is now the row's target.
create or replace function public.career_outbox_claim(p_now timestamptz, p_limit int)
returns table (id bigint, user_id uuid, contact text, key text, text text, deliver_at timestamptz, attempts int, prior_status text)
language sql security definer set search_path = public as $$
  with due as (
    select o.id, t.contact, o.status as prior_status
    from career_outbox o cross join lateral (select public.channel_target(o.user_id, o.channel) as contact) t
    where t.contact is not null and o.deliver_at <= p_now
      and (o.status = 'queued' or (o.status = 'failed' and o.retry_at is not null and o.retry_at <= p_now))
      and (o.part is null or not exists (select 1 from career_outbox e where e.user_id = o.user_id and e.part_of = o.part_of and e.part < o.part
        and (e.status in ('sending', 'held') or (e.status = 'failed' and e.retry_at is not null and e.retry_at > p_now) or (e.status = 'queued' and e.deliver_at > p_now))))
    order by o.deliver_at, o.id
    limit least(greatest(p_limit, 0), 100)
    for update of o skip locked)
  update career_outbox o set status = 'sending', claimed_at = p_now, contact = due.contact
  from due where o.id = due.id
  returning o.id, o.user_id, o.contact, o.key, o.text, o.deliver_at, o.attempts, due.prior_status;
$$;
create or replace function public.career_outbox_claim_key(p_user uuid, p_key text, p_now timestamptz)
returns table (id bigint, user_id uuid, contact text, key text, text text, deliver_at timestamptz, attempts int, prior_status text)
language sql security definer set search_path = public as $$
  with due as (
    select o.id, t.contact, o.status as prior_status
    from career_outbox o cross join lateral (select public.channel_target(o.user_id, o.channel) as contact) t
    where o.user_id = p_user and o.key = p_key and t.contact is not null and o.deliver_at <= p_now
      and (o.status = 'queued' or (o.status = 'failed' and o.retry_at is not null and o.retry_at <= p_now))
      and (o.part is null or not exists (select 1 from career_outbox e where e.user_id = o.user_id and e.part_of = o.part_of and e.part < o.part
        and (e.status in ('sending', 'held') or (e.status = 'failed' and e.retry_at is not null and e.retry_at > p_now) or e.status = 'queued')))
    for update of o skip locked)
  update career_outbox o set status = 'sending', claimed_at = p_now, contact = due.contact
  from due where o.id = due.id
  returning o.id, o.user_id, o.contact, o.key, o.text, o.deliver_at, o.attempts, due.prior_status;
$$;
-- Everything due for one person, oldest first: on a WhatsApp message, what waited for the window goes before the answer.
create or replace function public.career_outbox_claim_user(p_user uuid, p_now timestamptz, p_limit int)
returns table (id bigint, user_id uuid, contact text, key text, text text, deliver_at timestamptz, attempts int, prior_status text)
language sql security definer set search_path = public as $$
  with due as (
    select o.id, t.contact, o.status as prior_status
    from career_outbox o cross join lateral (select public.channel_target(o.user_id, o.channel) as contact) t
    where o.user_id = p_user and t.contact is not null and o.deliver_at <= p_now
      and (o.status = 'queued' or (o.status = 'failed' and o.retry_at is not null and o.retry_at <= p_now))
      and (o.part is null or not exists (select 1 from career_outbox e where e.user_id = o.user_id and e.part_of = o.part_of and e.part < o.part
        and (e.status in ('sending', 'held') or (e.status = 'failed' and e.retry_at is not null and e.retry_at > p_now) or (e.status = 'queued' and e.deliver_at > p_now))))
    order by o.deliver_at, o.id
    limit least(greatest(p_limit, 0), 40)
    for update of o skip locked)
  update career_outbox o set status = 'sending', claimed_at = p_now, contact = due.contact
  from due where o.id = due.id
  returning o.id, o.user_id, o.contact, o.key, o.text, o.deliver_at, o.attempts, due.prior_status;
$$;
-- Distinct contacts sent to on a UTC day on one channel: each provider's cap counts its own.
create or replace function public.career_outbox_contacts_on_channel(p_day date, p_channel text)
returns int language sql stable security definer set search_path = public as $$
  select count(distinct contact)::int from career_outbox
  where status = 'delivered' and delivered_at >= (p_day::timestamp at time zone 'UTC')
    and delivered_at < ((p_day + 1)::timestamp at time zone 'UTC')
    and (case when contact like 'wa:%' then 'whatsapp' when contact like 'tg:%' then 'telegram' else 'imessage' end) = p_channel;
$$;

-- STOP is the person's, whatever channel it came on: a person is opted out while any of their contacts is. START on any
-- channel turns all of them back on. A contact with no account keeps its own STOP.
create or replace function public.channel_opted_out(p_contact text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(bool_or(c.opted_out), false) from public.channel_contacts c
  where c.contact = p_contact
     or c.user_id = (select x.user_id from public.channel_contacts x where x.contact = p_contact and x.user_id is not null)
$$;
create or replace function public.channel_set_opt_out(p_contact text, p_out boolean, p_at timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid;
begin
  insert into public.channel_contacts(contact, opted_out, opted_out_at, created_at, updated_at)
  values (p_contact, p_out, case when p_out then p_at end, p_at, p_at)
  on conflict (contact) do update set opted_out = p_out, opted_out_at = case when p_out then p_at end, updated_at = p_at
  returning user_id into u;
  if not p_out and u is not null then
    update public.channel_contacts set opted_out = false, opted_out_at = null, updated_at = p_at where user_id = u and opted_out;
  end if;
end $$;

-- A message from the person: its time (WhatsApp's window opens; this becomes their most recent channel), WhatsApp's other
-- id and the number when given, and what was held for them goes back in the queue (rows bound to this channel, and rows
-- for the home channel, which this message may just have changed). Returns how many went back.
create or replace function public.channel_inbound_seen(p_contact text, p_at timestamptz, p_alias text, p_phone text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid; ch text; n int;
begin
  update public.channel_contacts c set last_inbound_at = greatest(coalesce(c.last_inbound_at, p_at), p_at), updated_at = p_at,
    alias = case when c.alias is null and p_alias is not null and not exists (select from public.channel_contacts x where x.alias = p_alias) then p_alias else c.alias end,
    phone = case when c.channel = 'whatsapp' and p_phone ~ '^\+[0-9]{8,15}$' then p_phone else c.phone end
  where c.contact = p_contact returning c.user_id, c.channel into u, ch;
  if u is null then return 0; end if;
  update public.career_outbox set status = 'queued', deliver_at = least(deliver_at, p_at), error = null
  where user_id = u and status = 'held' and (channel is null or channel = ch);
  get diagnostics n = row_count;
  return n;
end $$;

-- A WhatsApp message that Meta accepted and then failed for the window (131047) or the per-user limit (131049): it goes
-- back to held, whole, so the person's next message sends it; nothing is lost.
create or replace function public.career_outbox_rehold(p_provider_id text, p_at timestamptz, p_error text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update public.career_outbox set status = 'held', delivered_at = null, error = left(p_error, 500), claimed_at = null
  where status = 'delivered' and (provider_id = p_provider_id or provider_ids @> array[p_provider_id]);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------------------- linking
-- Telegram: a single-use link token for a signed-in account. 32 base64url characters from two gen_random_uuid() values
-- (about 180 random bits; pgcrypto is not assumed), stored only as its SHA-256, 10 minutes, burned on first use. The person
-- never reads or types it: it rides in t.me/<bot>?start=<token> and comes back as "/start <token>" (D-018, proposed).
create table if not exists public.channel_link_nonces (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null default 'telegram' check (channel = 'telegram'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at <= created_at + interval '10 minutes'));
create index if not exists channel_link_nonces_user on public.channel_link_nonces (user_id, created_at);

create or replace function public.channel_link_nonce_issue(p_user uuid, p_now timestamptz) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare n text;
begin
  if p_user is null or p_now is null then raise exception 'invalid link request'; end if;
  -- At most three live links a person; an older one is burned.
  update public.channel_link_nonces set used_at = p_now where nonce_hash in (
    select nonce_hash from public.channel_link_nonces where user_id = p_user and used_at is null and expires_at > p_now
    order by created_at desc offset 2);
  n := left(translate(encode(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'), 32);
  insert into public.channel_link_nonces(nonce_hash, user_id, created_at, expires_at)
  values (encode(sha256(convert_to(n, 'UTF8')), 'hex'), p_user, p_now, p_now + interval '10 minutes');
  return n;
end $$;
-- The app's "Connect Telegram": only for the signed-in person.
create or replace function public.channel_link_telegram_start() returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  return public.channel_link_nonce_issue(auth.uid(), clock_timestamp());
end $$;
-- "/start <token>" from a Telegram chat: binds that chat to the account the token was issued to, once. A chat already
-- linked to someone else is never moved; a person's earlier Telegram chat is unlinked (one per channel).
create or replace function public.channel_link_nonce_redeem(p_nonce text, p_contact text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid; t uuid; other uuid;
begin
  if p_nonce !~ '^[A-Za-z0-9_-]{1,64}$' or p_contact !~ '^tg:[1-9][0-9]{0,19}$' then return jsonb_build_object('error', 'invalid'); end if;
  update public.channel_link_nonces set used_at = p_now
  where nonce_hash = encode(sha256(convert_to(p_nonce, 'UTF8')), 'hex') and used_at is null and expires_at > p_now
  returning user_id into u;
  if u is null then return jsonb_build_object('error', 'invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text, 1));
  select user_id into other from public.channel_contacts where contact = p_contact;
  if other is not null and other <> u then return jsonb_build_object('error', 'linked_elsewhere'); end if;
  select thread_id into t from public.channel_contacts where user_id = u and thread_id is not null order by last_inbound_at desc nulls last limit 1;
  update public.channel_contacts set user_id = null, thread_id = null, home = false, updated_at = p_now where user_id = u and channel = 'telegram' and contact <> p_contact;
  insert into public.channel_contacts(contact, user_id, thread_id, last_inbound_at, created_at, updated_at)
  values (p_contact, u, t, p_now, p_now, p_now)
  on conflict (contact) do update set user_id = u, thread_id = coalesce(excluded.thread_id, public.channel_contacts.thread_id), last_inbound_at = p_now, updated_at = p_now;
  return jsonb_build_object('user_id', u, 'thread_id', t);
end $$;

-- The same phone on a second channel (WhatsApp and iMessage): asked on the channel already linked, linked only on its yes.
create table if not exists public.channel_link_requests (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact text not null check (contact ~ '^(\+[0-9]{8,15}|wa:[A-Za-z0-9._-]{1,128})$'), -- the new contact asking to join
  phone text not null check (phone ~ '^\+[0-9]{8,15}$'),
  asked_on text not null, -- the linked contact the question went to
  created_at timestamptz not null,
  expires_at timestamptz not null,
  answered_at timestamptz);
create index if not exists channel_link_requests_open on public.channel_link_requests (user_id, asked_on) where answered_at is null;

-- The account already on another channel with this number, if any.
create or replace function public.channel_link_candidate(p_phone text, p_except text) returns table (user_id uuid, contact text)
language sql stable security definer set search_path = public as $$
  select c.user_id, c.contact from public.channel_contacts c
  where c.phone = p_phone and c.user_id is not null and c.channel <> p_except and not c.opted_out
  order by c.last_inbound_at desc nulls last limit 1
$$;
-- Opens the question and queues it on the linked channel (kind link, so STOP holds it and the caps count it). Null when
-- the same question is already open.
create or replace function public.channel_link_ask(p_user uuid, p_contact text, p_phone text, p_asked_on text, p_text text, p_now timestamptz) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare rid bigint; ch text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));
  if exists (select from public.channel_link_requests where user_id = p_user and contact = p_contact and answered_at is null and expires_at > p_now) then return null; end if;
  select channel into ch from public.channel_contacts where contact = p_asked_on and user_id = p_user;
  if ch is null then return null; end if;
  -- The new contact's message is recorded (no account yet), so the answer it gets later is inside WhatsApp's window.
  insert into public.channel_contacts(contact, phone, last_inbound_at, created_at, updated_at) values (p_contact, p_phone, p_now, p_now, p_now)
  on conflict (contact) do update set last_inbound_at = greatest(public.channel_contacts.last_inbound_at, p_now),
    phone = coalesce(public.channel_contacts.phone, excluded.phone), updated_at = p_now;
  insert into public.channel_link_requests(user_id, contact, phone, asked_on, created_at, expires_at)
  values (p_user, p_contact, p_phone, p_asked_on, p_now, p_now + interval '1 hour') returning id into rid;
  insert into public.career_outbox(user_id, key, kind, text, deliver_at, channel) values (p_user, 'link:' || rid, 'link', p_text, p_now, ch);
  return 'link:' || rid;
end $$;
-- A yes from the asked contact within the hour: the new contact joins the account (same thread), and it is told so.
-- Returns {contact, key} or null when nothing was waiting for this yes.
create or replace function public.channel_link_confirm(p_user uuid, p_asked_on text, p_notice text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.channel_link_requests; t uuid; other uuid; ch text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));
  select * into r from public.channel_link_requests where user_id = p_user and asked_on = p_asked_on and answered_at is null and expires_at > p_now
  order by created_at desc limit 1 for update;
  if r.id is null then return null; end if;
  update public.channel_link_requests set answered_at = p_now where id = r.id;
  select user_id into other from public.channel_contacts where contact = r.contact;
  if other is not null and other <> p_user then return null; end if;
  select thread_id into t from public.channel_contacts where contact = p_asked_on;
  insert into public.channel_contacts(contact, user_id, thread_id, phone, created_at, updated_at)
  values (r.contact, p_user, t, r.phone, p_now, p_now)
  on conflict (contact) do update set user_id = p_user, thread_id = coalesce(public.channel_contacts.thread_id, excluded.thread_id), updated_at = p_now
  returning channel into ch;
  insert into public.career_outbox(user_id, key, kind, text, deliver_at, channel) values (p_user, 'link:' || r.id || ':done', 'link', p_notice, p_now, ch)
  on conflict do nothing;
  return jsonb_build_object('contact', r.contact, 'key', 'link:' || r.id || ':done');
end $$;
-- The app can set the home channel for messages Trainee starts (one of the person's own contacts).
create or replace function public.channel_set_home(p_channel text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or p_channel not in ('imessage', 'whatsapp', 'telegram') then raise exception 'invalid home channel'; end if;
  if not exists (select from public.channel_contacts where user_id = auth.uid() and channel = p_channel) then return false; end if;
  update public.channel_contacts set home = (channel = p_channel), updated_at = now() where user_id = auth.uid();
  return true;
end $$;

-- ---------------------------------------------------------------------------------------------------------- the card push
-- 20261020040000's push, with the same signature and rules, now for a person with several contacts: the thread is the
-- person's one thread; a STOP on any channel holds it; and it is not pushed while the home channel is WhatsApp with its
-- window closed (23 hours here, an hour of margin): a card that waited unseen while still the thread's last word could
-- take a "yes" meant for something else. It is pushed on the next run after the person writes.
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

-- ---------------------------------------------------------------------------------------------------------- access
-- Only the service role runs the channel; a person reads their own contacts (already granted) and may start a Telegram
-- link or set their home channel. The link tables hold no text a person wrote and are not readable by anyone but the
-- service role; an account's deletion removes its rows (on delete cascade).
alter table public.channel_link_nonces enable row level security;
alter table public.channel_link_requests enable row level security;
revoke all on public.channel_link_nonces, public.channel_link_requests from anon, authenticated;
revoke all on sequence public.channel_link_requests_id_seq from anon, authenticated;
revoke all on function public.channel_target(uuid, text), public.career_outbox_claim_user(uuid, timestamptz, int),
  public.career_outbox_contacts_on_channel(date, text), public.channel_opted_out(text), public.channel_set_opt_out(text, boolean, timestamptz),
  public.channel_inbound_seen(text, timestamptz, text, text), public.career_outbox_rehold(text, timestamptz, text),
  public.channel_link_nonce_issue(uuid, timestamptz), public.channel_link_nonce_redeem(text, text, timestamptz),
  public.channel_link_candidate(text, text), public.channel_link_ask(uuid, text, text, text, text, timestamptz),
  public.channel_link_confirm(uuid, text, text, timestamptz), public.channel_contacts_derive()
  from public, anon, authenticated;
grant execute on function public.career_outbox_claim_user(uuid, timestamptz, int), public.career_outbox_contacts_on_channel(date, text),
  public.channel_opted_out(text), public.channel_set_opt_out(text, boolean, timestamptz), public.channel_inbound_seen(text, timestamptz, text, text),
  public.career_outbox_rehold(text, timestamptz, text), public.channel_link_nonce_issue(uuid, timestamptz),
  public.channel_link_nonce_redeem(text, text, timestamptz), public.channel_link_candidate(text, text),
  public.channel_link_ask(uuid, text, text, text, text, timestamptz), public.channel_link_confirm(uuid, text, text, timestamptz)
  to service_role;
revoke all on function public.channel_link_telegram_start(), public.channel_set_home(text) from public, anon;
grant execute on function public.channel_link_telegram_start(), public.channel_set_home(text) to authenticated;
revoke all on function public.career_apply_card_push_for(uuid, uuid[], text, timestamptz) from public, anon, authenticated, service_role;
