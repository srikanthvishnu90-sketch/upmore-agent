-- Brokerage connect: each person connects THEIR OWN brokerage, LIVE ONLY (owner decision 2026-10-11; BUILD-STATUS).
-- No shared trading account and no paper trading anywhere in this flow.
--
-- public.brokerage_accounts exists live (20261008_000004) with no account id, RLS on and no policy. This makes it the
-- per-person connection the chat handler resolves on every request:
--   account_id     the broker's own account id, read from the broker at connect (never typed by anyone)
--   account_mask   the last four of the account number, for the person's own screen
--   vault_key_ref  the Vault secret holding the person's OAuth token, always broker_token_<user_id>_<row id>, so a row can
--                  only ever point at its own person's secret
--   status         active | reconnect (the broker refused the token: revoked or expired) | paused | revoked
--   paper          always false: a constraint, so no paper account can be stored
-- Tokens live only in the Vault. The client reads its own rows, never the vault reference, and cannot write rows: the
-- connect callback links (service role), the person disconnects through broker_disconnect (their own row only).
-- One broker account belongs to exactly one person.
-- broker_oauth_states holds the hash of each connect attempt's nonce, consumed once, so a callback cannot be replayed or
-- redirected to another person.
-- broker_pending_links closes the reversed attack a signed state alone does not: someone starts Connect in their own
-- Upmore login and sends the Alpaca approval link to someone else, who approves it. The callback only STAGES the
-- connection (token in the Vault under a pending name); it becomes a connection only when the person who started it
-- confirms it from their own signed-in app (broker_confirm_link checks auth.uid()). The other person's app, signed in as
-- them, is refused, and the pending link is wiped.

create table if not exists public.brokerage_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'alpaca',
  label text not null default 'main',
  paper boolean not null default true,
  vault_key_ref text,
  status text not null default 'active' check (status in ('active','paused','revoked')),
  created_at timestamptz not null default now(),
  unique (user_id, provider, label)
);

alter table public.brokerage_accounts add column if not exists account_id text;
alter table public.brokerage_accounts add column if not exists account_mask text;
alter table public.brokerage_accounts add column if not exists scope text;
alter table public.brokerage_accounts add column if not exists connected_at timestamptz;
alter table public.brokerage_accounts alter column paper set default false;
alter table public.brokerage_accounts alter column provider set default 'alpaca';

alter table public.brokerage_accounts drop constraint if exists brokerage_accounts_status_check;
alter table public.brokerage_accounts add constraint brokerage_accounts_status_check check (status in ('active','reconnect','paused','revoked'));
alter table public.brokerage_accounts drop constraint if exists brokerage_accounts_live_only;
alter table public.brokerage_accounts add constraint brokerage_accounts_live_only check (paper = false);
-- The token reference names this row's own person and row, and an active connection always has one.
alter table public.brokerage_accounts drop constraint if exists brokerage_accounts_vault_ref_check;
alter table public.brokerage_accounts add constraint brokerage_accounts_vault_ref_check check (
  (vault_key_ref is null or vault_key_ref = 'broker_token_' || user_id::text || '_' || id::text)
  and (status <> 'active' or vault_key_ref is not null));
alter table public.brokerage_accounts drop constraint if exists brokerage_accounts_account_id_check;
alter table public.brokerage_accounts add constraint brokerage_accounts_account_id_check check (
  account_id is null or (length(account_id) between 1 and 64 and account_id !~ '\s'));
alter table public.brokerage_accounts drop constraint if exists brokerage_accounts_mask_check;
alter table public.brokerage_accounts add constraint brokerage_accounts_mask_check check (
  account_mask is null or account_mask ~ '^\*{4}[0-9A-Za-z]{1,4}$');

create unique index if not exists brokerage_accounts_provider_account_uniq
  on public.brokerage_accounts (provider, account_id) where account_id is not null;
create index if not exists brokerage_accounts_user_idx on public.brokerage_accounts (user_id);

alter table public.brokerage_accounts enable row level security;
drop policy if exists brokerage_accounts_owner_read on public.brokerage_accounts;
create policy brokerage_accounts_owner_read on public.brokerage_accounts
  for select to authenticated using (user_id = auth.uid());

-- Column privileges: the owner reads every column except the vault reference; nobody but the service role writes.
revoke all on public.brokerage_accounts from anon, authenticated;
grant select (id, user_id, provider, label, paper, account_id, account_mask, scope, status, connected_at, created_at) on public.brokerage_accounts to authenticated;
grant all on public.brokerage_accounts to service_role;

-- Connect attempts: the nonce's hash, the person and provider it was issued to, 10 minutes, one use.
create table if not exists public.broker_oauth_states (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists broker_oauth_states_user_idx on public.broker_oauth_states (user_id);
alter table public.broker_oauth_states enable row level security;
revoke all on public.broker_oauth_states from anon, authenticated;
grant all on public.broker_oauth_states to service_role;

create or replace function public.broker_state_create(p_user uuid, p_provider text, p_nonce_hash text, p_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or coalesce(p_provider, '') = '' or p_expires_at is null or p_expires_at > now() + interval '15 minutes' then
    raise exception 'invalid connect attempt';
  end if;
  delete from public.broker_oauth_states where user_id = p_user and (expires_at < now() or used_at is not null);
  insert into public.broker_oauth_states (nonce_hash, user_id, provider, expires_at) values (p_nonce_hash, p_user, p_provider, p_expires_at);
end;
$$;

-- Consumed once, atomically: true only for an unused, unexpired nonce issued to this person for this provider.
create or replace function public.broker_state_consume(p_user uuid, p_provider text, p_nonce_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_hit text;
begin
  update public.broker_oauth_states set used_at = now()
   where nonce_hash = p_nonce_hash and user_id = p_user and provider = p_provider and used_at is null and expires_at > now()
   returning nonce_hash into v_hit;
  return v_hit is not null;
end;
$$;

-- Pending connections: staged by the callback (service role), confirmed by the person who started them (their JWT).
create table if not exists public.broker_pending_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  account_id text not null,
  account_mask text,
  scope text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index if not exists broker_pending_links_user_idx on public.broker_pending_links (user_id);
alter table public.broker_pending_links enable row level security;
revoke all on public.broker_pending_links from anon, authenticated;
grant all on public.broker_pending_links to service_role;

-- Link (or relink) this person's connection and store the token in the Vault. Refuses an account another person holds.
create or replace function public.broker_link(p_user uuid, p_provider text, p_account_id text, p_account_mask text, p_scope text, p_token text)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_id uuid; v_name text;
begin
  if p_user is null or coalesce(p_provider, '') = '' or coalesce(p_account_id, '') = '' or coalesce(p_token, '') = '' then
    raise exception 'missing argument';
  end if;
  if exists (select 1 from public.brokerage_accounts where provider = p_provider and account_id = p_account_id and user_id <> p_user) then
    raise exception 'account_connected_to_another_user';
  end if;
  select id into v_id from public.brokerage_accounts where user_id = p_user and provider = p_provider and label = 'main';
  if v_id is null then
    v_id := gen_random_uuid();
    v_name := 'broker_token_' || p_user::text || '_' || v_id::text;
    delete from vault.secrets where name = v_name;
    perform vault.create_secret(p_token, v_name, 'Upmore brokerage OAuth token');
    insert into public.brokerage_accounts (id, user_id, provider, label, paper, account_id, account_mask, scope, vault_key_ref, status, connected_at)
    values (v_id, p_user, p_provider, 'main', false, p_account_id, p_account_mask, p_scope, v_name, 'active', now());
  else
    v_name := 'broker_token_' || p_user::text || '_' || v_id::text;
    delete from vault.secrets where name = v_name;
    perform vault.create_secret(p_token, v_name, 'Upmore brokerage OAuth token');
    update public.brokerage_accounts
       set account_id = p_account_id, account_mask = p_account_mask, scope = p_scope, vault_key_ref = v_name, status = 'active', paper = false, connected_at = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;

-- The callback stages a connection; nothing can trade with it yet. Refuses an account another person holds.
create or replace function public.broker_stage_link(p_user uuid, p_provider text, p_account_id text, p_account_mask text, p_scope text, p_token text)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_id uuid := gen_random_uuid();
begin
  if p_user is null or coalesce(p_provider, '') = '' or coalesce(p_account_id, '') = '' or coalesce(p_token, '') = '' then
    raise exception 'missing argument';
  end if;
  if exists (select 1 from public.brokerage_accounts where provider = p_provider and account_id = p_account_id and user_id <> p_user) then
    raise exception 'account_connected_to_another_user';
  end if;
  delete from vault.secrets where name in (select 'broker_pending_' || id::text from public.broker_pending_links where expires_at < now());
  delete from public.broker_pending_links where expires_at < now();
  insert into public.broker_pending_links (id, user_id, provider, account_id, account_mask, scope) values (v_id, p_user, p_provider, p_account_id, p_account_mask, p_scope);
  perform vault.create_secret(p_token, 'broker_pending_' || v_id::text, 'Upmore brokerage OAuth token, pending confirmation');
  return v_id;
end;
$$;

-- The signed-in person confirms a connection they started. Anyone else (another login, no login, an expired link) gets
-- false and the pending connection is wiped, token and all. One use.
create or replace function public.broker_confirm_link(p_link uuid)
returns boolean
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_user uuid := auth.uid(); p record; v_token text;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  delete from public.broker_pending_links where id = p_link returning * into p;
  if p.id is null then return false; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'broker_pending_' || p.id::text;
  delete from vault.secrets where name = 'broker_pending_' || p.id::text;
  if p.user_id <> v_user or p.expires_at < now() or v_token is null then return false; end if;
  perform public.broker_link(p.user_id, p.provider, p.account_id, p.account_mask, p.scope, v_token);
  return true;
end;
$$;

-- Read it back for the chat handler, per request. The secret name is recomputed from the caller's id and the row id,
-- never taken from the row, and the row must be that person's active live connection: another person's id gets null.
create or replace function public.broker_token_read(p_user uuid, p_account uuid)
returns text
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_secret text;
begin
  if p_user is null or p_account is null then return null; end if;
  if not exists (select 1 from public.brokerage_accounts
                 where id = p_account and user_id = p_user and status = 'active' and paper = false) then
    return null;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets
   where name = 'broker_token_' || p_user::text || '_' || p_account::text;
  return v_secret;
end;
$$;

-- The broker refused the token (401): wipe it and show Reconnect. Service role (the chat handler), this person's row only.
create or replace function public.broker_mark_reconnect(p_user uuid, p_account uuid)
returns boolean
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_hit uuid;
begin
  update public.brokerage_accounts set status = 'reconnect', vault_key_ref = null
   where id = p_account and user_id = p_user and status = 'active'
   returning id into v_hit;
  if v_hit is null then return false; end if;
  delete from vault.secrets where name = 'broker_token_' || p_user::text || '_' || p_account::text;
  return true;
end;
$$;

-- Disconnect: the signed-in person removes their own connection; the Vault entry is deleted with it.
create or replace function public.broker_disconnect(p_account uuid)
returns boolean
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_user uuid := auth.uid(); v_hit uuid;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  delete from public.brokerage_accounts where id = p_account and user_id = v_user returning id into v_hit;
  if v_hit is null then return false; end if;
  delete from vault.secrets where name = 'broker_token_' || v_user::text || '_' || p_account::text;
  return true;
end;
$$;

revoke all on function public.broker_state_create(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.broker_state_consume(uuid, text, text) from public, anon, authenticated;
revoke all on function public.broker_link(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.broker_stage_link(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.broker_confirm_link(uuid) from public, anon;
revoke all on function public.broker_token_read(uuid, uuid) from public, anon, authenticated;
revoke all on function public.broker_mark_reconnect(uuid, uuid) from public, anon, authenticated;
revoke all on function public.broker_disconnect(uuid) from public, anon;
grant execute on function public.broker_state_create(uuid, text, text, timestamptz) to service_role;
grant execute on function public.broker_state_consume(uuid, text, text) to service_role;
grant execute on function public.broker_link(uuid, text, text, text, text, text) to service_role;
grant execute on function public.broker_stage_link(uuid, text, text, text, text, text) to service_role;
grant execute on function public.broker_confirm_link(uuid) to authenticated;
grant execute on function public.broker_token_read(uuid, uuid) to service_role;
grant execute on function public.broker_mark_reconnect(uuid, uuid) to service_role;
grant execute on function public.broker_disconnect(uuid) to authenticated;
