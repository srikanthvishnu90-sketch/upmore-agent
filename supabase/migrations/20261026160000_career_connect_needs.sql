-- FEATURE NEEDS (2026-10-26): connectors from any channel, and what Trainee needs asked once.
--
-- 1. career_connect_links: the one-time link "connect gmail" (or Trainee's offer) sends in the chat. It is bound to the
--    person of the turn, the channel the turn came on (web, telegram, imessage, whatsapp; home when a channel turn's thread
--    has no contact row) and that thread, so the callback can answer in the same place; to the connector (google today;
--    Microsoft is planned and is one more value here) and the purpose it was asked for (so the answer says how to carry
--    on); and to the scopes the need asked for, never more. The scope list is Google verification's (google_scopes.ts:
--    openid, email, gmail.readonly) plus gmail.send, deferred: it can be asked only once the owner names it approved
--    (GOOGLE_APPROVED_EXTRA_SCOPES). A unit test keeps this list equal to connectors/google.ts allScopes(). The token is stored only as its SHA-256, lives 15 minutes, and at most three are live per
--    person (an older one is burned).
--      career_connect_link_issue(user, channel, thread, scopes, now, connector, purpose) -> the token (service role only)
--      career_connect_link_peek(token, now)   -> {status: ok|used|expired|invalid, scopes, channel, connector, hint}; never uses it.
--                                                Message previews (Telegram, iMessage, WhatsApp) fetch a link as soon as it
--                                                is delivered, so a GET only peeks; the person's own POST opens it.
--      career_connect_link_open(token, now)   -> {link_id, scopes} once (the token is burned), else {error}
--      career_connect_link_finish(link, outcome, now) -> {user_id, channel, thread_id, scopes, connector, purpose} once, within 15 minutes of
--                                                the open, else {error}: Google's callback lands here exactly once.
--      career_connect_links_burn(user, now)   -> every live link of the person burned (on "disconnect gmail")
--    A table of its own, not channel_link_nonces: channel_link_nonce_redeem burns any row by hash and links a Telegram chat,
--    so a connect token must never be redeemable there.
-- 2. career_needs_asked: a need Trainee offered without being asked (the Gmail offer for an employer's emailed code) is
--    offered once per person, in any thread or channel; career_needs_mark(user, need, now) is true only the first time.
-- Additive and idempotent. Nothing is granted to anon or authenticated.

create table if not exists public.career_connect_links (
  id uuid primary key default gen_random_uuid(),
  nonce_hash text not null unique check (nonce_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('web', 'telegram', 'imessage', 'whatsapp', 'home')),
  connector text not null default 'google' check (connector in ('google')),
  purpose text not null default 'connect' check (purpose in ('connect', 'email_code', 'track_replies', 'outreach', 'send_email')),
  thread_id uuid references public.agent_threads(id) on delete set null,
  scopes text[] not null check (cardinality(scopes) between 1 and 4 and scopes <@ array[
    'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send', 'openid', 'email']::text[]),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  opened_at timestamptz,
  finished_at timestamptz,
  outcome text check (outcome is null or outcome in ('connected', 'declined', 'error')),
  check (expires_at > created_at and expires_at <= created_at + interval '15 minutes'),
  check (finished_at is null or opened_at is not null));
create index if not exists career_connect_links_user on public.career_connect_links (user_id, created_at);

create or replace function public.career_connect_link_issue(p_user uuid, p_channel text, p_thread uuid, p_scopes text[], p_now timestamptz,
  p_connector text default 'google', p_purpose text default 'connect')
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare n text;
begin
  if p_user is null or p_now is null then raise exception 'invalid link request'; end if;
  -- At most three live links a person; an older one is burned.
  update public.career_connect_links set opened_at = p_now, finished_at = p_now, outcome = 'error' where id in (
    select id from public.career_connect_links where user_id = p_user and opened_at is null and expires_at > p_now
    order by created_at desc offset 2);
  n := left(translate(encode(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'), 32);
  insert into public.career_connect_links (nonce_hash, user_id, channel, thread_id, scopes, connector, purpose, created_at, expires_at)
  values (encode(sha256(convert_to(n, 'UTF8')), 'hex'), p_user, p_channel,
    (select t.id from public.agent_threads t where t.id = p_thread and t.user_id = p_user), p_scopes, p_connector, p_purpose, p_now, p_now + interval '15 minutes');
  return n;
end $$;

create or replace function public.career_connect_link_peek(p_nonce text, p_now timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.career_connect_links; em text; hint text;
begin
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{32}$' or p_now is null then return jsonb_build_object('status', 'invalid'); end if;
  select * into r from public.career_connect_links where nonce_hash = encode(sha256(convert_to(p_nonce, 'UTF8')), 'hex');
  if r.id is null then return jsonb_build_object('status', 'invalid'); end if;
  if r.opened_at is not null then return jsonb_build_object('status', 'used'); end if;
  if r.expires_at <= p_now then return jsonb_build_object('status', 'expired'); end if;
  -- Whose Trainee account this joins, masked: the first letter and domain of its email. Never an id or a full address.
  select u.email into em from auth.users u where u.id = r.user_id;
  if em ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then hint := left(em, 1) || '•••@' || split_part(em, '@', 2); end if;
  return jsonb_build_object('status', 'ok', 'scopes', to_jsonb(r.scopes), 'channel', r.channel, 'connector', r.connector, 'hint', hint);
end $$;

create or replace function public.career_connect_link_open(p_nonce text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.career_connect_links;
begin
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{32}$' or p_now is null then return jsonb_build_object('error', 'invalid'); end if;
  select * into r from public.career_connect_links where nonce_hash = encode(sha256(convert_to(p_nonce, 'UTF8')), 'hex') for update;
  if r.id is null then return jsonb_build_object('error', 'invalid'); end if;
  if r.opened_at is not null then return jsonb_build_object('error', 'used'); end if;
  if r.expires_at <= p_now then return jsonb_build_object('error', 'expired'); end if;
  update public.career_connect_links set opened_at = p_now where id = r.id;
  return jsonb_build_object('link_id', r.id, 'scopes', to_jsonb(r.scopes));
end $$;

create or replace function public.career_connect_link_finish(p_link uuid, p_outcome text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.career_connect_links;
begin
  if p_link is null or p_now is null or p_outcome not in ('connected', 'declined', 'error') then return jsonb_build_object('error', 'invalid'); end if;
  select * into r from public.career_connect_links where id = p_link for update;
  if r.id is null or r.opened_at is null then return jsonb_build_object('error', 'invalid'); end if;
  if r.finished_at is not null then return jsonb_build_object('error', 'used'); end if;
  if r.opened_at + interval '15 minutes' <= p_now then
    update public.career_connect_links set finished_at = p_now, outcome = 'error' where id = r.id;
    return jsonb_build_object('error', 'expired');
  end if;
  update public.career_connect_links set finished_at = p_now, outcome = p_outcome where id = r.id;
  return jsonb_build_object('user_id', r.user_id, 'channel', r.channel, 'thread_id', r.thread_id, 'scopes', to_jsonb(r.scopes), 'connector', r.connector, 'purpose', r.purpose);
end $$;

create or replace function public.career_connect_links_burn(p_user uuid, p_now timestamptz) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update public.career_connect_links set opened_at = coalesce(opened_at, p_now), finished_at = p_now, outcome = coalesce(outcome, 'error')
  where user_id = p_user and finished_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- A Google grant deleted, by any path ("disconnect gmail" in the chat: google_disconnect.ts; gmail-oauth's disconnect; an
-- account erase): every live connect link of the person dies with it, so a link sent before the disconnect can never
-- connect again. A reconnect is an upsert, never a delete, so it burns nothing.
create or replace function public.career_connect_links_burn_on_disconnect() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.career_connect_links_burn(old.user_id, now());
  return old;
end $$;
drop trigger if exists career_connect_links_burn_on_disconnect on public.user_oauth_connections;
create trigger career_connect_links_burn_on_disconnect after delete on public.user_oauth_connections
  for each row when (old.provider in ('google_career', 'gmail')) execute function public.career_connect_links_burn_on_disconnect();
revoke all on function public.career_connect_links_burn_on_disconnect() from public, anon, authenticated;

create table if not exists public.career_needs_asked (
  user_id uuid not null references auth.users(id) on delete cascade,
  need text not null check (need ~ '^[a-z_]{1,40}(:[A-Za-z0-9:._-]{1,200})?$'),
  asked_at timestamptz not null,
  primary key (user_id, need));

create or replace function public.career_needs_mark(p_user uuid, p_need text, p_now timestamptz) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  insert into public.career_needs_asked (user_id, need, asked_at) values (p_user, p_need, p_now) on conflict (user_id, need) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

alter table public.career_connect_links enable row level security;
alter table public.career_needs_asked enable row level security;
revoke all on public.career_connect_links, public.career_needs_asked from public, anon, authenticated;
grant select, insert, update, delete on public.career_connect_links, public.career_needs_asked to service_role;
revoke all on function public.career_connect_link_issue(uuid, text, uuid, text[], timestamptz, text, text), public.career_connect_link_peek(text, timestamptz),
  public.career_connect_link_open(text, timestamptz), public.career_connect_link_finish(uuid, text, timestamptz),
  public.career_connect_links_burn(uuid, timestamptz), public.career_needs_mark(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.career_connect_link_issue(uuid, text, uuid, text[], timestamptz, text, text), public.career_connect_link_peek(text, timestamptz),
  public.career_connect_link_open(text, timestamptz), public.career_connect_link_finish(uuid, text, timestamptz),
  public.career_connect_links_burn(uuid, timestamptz), public.career_needs_mark(uuid, text, timestamptz) to service_role;
