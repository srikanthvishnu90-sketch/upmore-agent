-- WO-101: a signed, single-use connect link bound to the person. Telegram's link token (channel_link_nonces, 20261021070000)
-- generalised by purpose: the service mints a token for the user of the current turn, the link carries it, and the
-- connect page (gmail-oauth GET ?t=) only peeks at it and shows whose account it is; the person's "Continue" (a POST)
-- consumes it once and starts that user's consent. Without it a connect link carries nobody, so a grant would land on
-- whoever is signed in to the page, or on no one.
--
-- A table of its own rather than a purpose column on channel_link_nonces: channel_link_nonce_redeem burns any row by its
-- hash, so a connect token would also redeem as a Telegram link, and the parity migration that defines it is replayed.
-- Here a token is consumed only for the purpose it was minted for.
--
-- 32 base64url characters from two gen_random_uuid() values, stored only as their SHA-256, 15 minutes, burned on first
-- use. At most three live tokens per person and purpose; an older one is burned. Only the service role mints or consumes.
create table if not exists public.connect_link_nonces (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('connect_google_career')),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '15 minutes'));
create index if not exists connect_link_nonces_user on public.connect_link_nonces (user_id, purpose, created_at);

create or replace function public.connect_link_issue(p_user uuid, p_purpose text, p_now timestamptz) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare n text;
begin
  if p_user is null or p_now is null or p_purpose is distinct from 'connect_google_career' then raise exception 'invalid link request'; end if;
  update public.connect_link_nonces set used_at = p_now where nonce_hash in (
    select nonce_hash from public.connect_link_nonces where user_id = p_user and purpose = p_purpose and used_at is null and expires_at > p_now
    order by created_at desc offset 2);
  n := left(translate(encode(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'), 32);
  insert into public.connect_link_nonces(nonce_hash, user_id, purpose, created_at, expires_at)
  values (encode(sha256(convert_to(n, 'UTF8')), 'hex'), p_user, p_purpose, p_now, p_now + interval '15 minutes');
  return n;
end $$;

-- {"user_id"} once; otherwise {"error"}: "used" (already consumed), "expired", or "invalid" (unknown, malformed, or minted
-- for another purpose). The reason is shown to the person on the failure page; it says nothing about whose token it was.
create or replace function public.connect_link_consume(p_nonce text, p_purpose text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.connect_link_nonces;
begin
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{32}$' or p_now is null then return jsonb_build_object('error', 'invalid'); end if;
  select * into r from public.connect_link_nonces where nonce_hash = encode(sha256(convert_to(p_nonce, 'UTF8')), 'hex') for update;
  if r.nonce_hash is null or r.purpose is distinct from p_purpose then return jsonb_build_object('error', 'invalid'); end if;
  if r.used_at is not null then return jsonb_build_object('error', 'used'); end if;
  if r.expires_at <= p_now then return jsonb_build_object('error', 'expired'); end if;
  update public.connect_link_nonces set used_at = p_now where nonce_hash = r.nonce_hash;
  return jsonb_build_object('user_id', r.user_id);
end $$;

-- The link's GET: what a token would do, without using it. Message previews (Telegram, iMessage, WhatsApp) fetch a link
-- the moment it is delivered, so only the person's own POST may consume. {"status": ok|used|expired|invalid}, and with
-- ok a masked hint naming the account the Gmail would join, so a forwarded link shows whose account it is before anyone
-- consents: the last four digits of the person's most recent number, else the first letter and domain of their email,
-- else null. Never the user id, a full number or a full address.
create or replace function public.connect_link_peek(p_nonce text, p_purpose text, p_now timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.connect_link_nonces; ph text; em text; hint text;
begin
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{32}$' or p_now is null then return jsonb_build_object('status', 'invalid'); end if;
  select * into r from public.connect_link_nonces where nonce_hash = encode(sha256(convert_to(p_nonce, 'UTF8')), 'hex');
  if r.nonce_hash is null or r.purpose is distinct from p_purpose then return jsonb_build_object('status', 'invalid'); end if;
  if r.used_at is not null then return jsonb_build_object('status', 'used'); end if;
  if r.expires_at <= p_now then return jsonb_build_object('status', 'expired'); end if;
  select c.phone into ph from public.channel_contacts c where c.user_id = r.user_id and c.phone ~ '^\+[0-9]{8,15}$'
  order by c.last_inbound_at desc nulls last limit 1;
  if ph is not null then hint := '•••' || right(ph, 4);
  else
    select u.email into em from auth.users u where u.id = r.user_id;
    if em ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then hint := left(em, 1) || '•••@' || split_part(em, '@', 2); end if;
  end if;
  return jsonb_build_object('status', 'ok', 'hint', hint);
end $$;

alter table public.connect_link_nonces enable row level security;
revoke all on public.connect_link_nonces from public, anon, authenticated;
revoke all on function public.connect_link_issue(uuid, text, timestamptz), public.connect_link_consume(text, text, timestamptz),
  public.connect_link_peek(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.connect_link_issue(uuid, text, timestamptz), public.connect_link_consume(text, text, timestamptz),
  public.connect_link_peek(text, text, timestamptz)
  to service_role;
