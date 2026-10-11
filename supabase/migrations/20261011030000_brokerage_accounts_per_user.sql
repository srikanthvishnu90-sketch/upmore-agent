-- Rail 2: per-user brokerage accounts, PAPER ONLY (BUILD-STATUS, Rail 2).
--
-- public.brokerage_accounts exists live (20261008_000004) with no account id, RLS on and no policy. This makes it the
-- per-user account model the chat handler resolves on every request:
--   account_id     the broker's own account id (an Alpaca sub-account id, or the linked account's id)
--   kind           linked (the person's own broker, primary) | bootstrap (an Alpaca sub-account opened for them)
--   vault_key_ref  linked rows only: the Vault secret holding the person's OAuth token, always named
--                  broker_token_<user_id>_<row id>, so a row can only ever point at its own user's secret
-- Tokens live only in the Vault. The client can read its own rows but never the vault reference, and can't write rows;
-- linking happens server-side (service role). One broker account belongs to exactly one user.
-- PAPER ONLY: paper = true is a constraint. Lifting it takes a migration, after the owner confirms live in writing.

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
alter table public.brokerage_accounts add column if not exists kind text not null default 'bootstrap';
alter table public.brokerage_accounts alter column provider set default 'alpaca_broker';

alter table public.brokerage_accounts drop constraint if exists brokerage_accounts_kind_check;
alter table public.brokerage_accounts add constraint brokerage_accounts_kind_check check (kind in ('linked','bootstrap'));
alter table public.brokerage_accounts drop constraint if exists brokerage_accounts_paper_only;
alter table public.brokerage_accounts add constraint brokerage_accounts_paper_only check (paper = true);
-- A linked row carries its own token reference; a bootstrap row uses the firm's keys and carries none.
alter table public.brokerage_accounts drop constraint if exists brokerage_accounts_vault_ref_check;
alter table public.brokerage_accounts add constraint brokerage_accounts_vault_ref_check check (
  (kind = 'linked' and vault_key_ref = 'broker_token_' || user_id::text || '_' || id::text)
  or (kind = 'bootstrap' and vault_key_ref is null));
alter table public.brokerage_accounts drop constraint if exists brokerage_accounts_account_id_check;
alter table public.brokerage_accounts add constraint brokerage_accounts_account_id_check check (
  account_id is null or (length(account_id) between 1 and 64 and account_id !~ '\s'));

create unique index if not exists brokerage_accounts_provider_account_uniq
  on public.brokerage_accounts (provider, account_id) where account_id is not null;
create index if not exists brokerage_accounts_user_idx on public.brokerage_accounts (user_id);

alter table public.brokerage_accounts enable row level security;
drop policy if exists brokerage_accounts_owner_read on public.brokerage_accounts;
create policy brokerage_accounts_owner_read on public.brokerage_accounts
  for select to authenticated using (user_id = auth.uid());

-- Column privileges: the owner reads every column except the vault reference; nobody but the service role writes.
revoke all on public.brokerage_accounts from anon, authenticated;
grant select (id, user_id, provider, kind, label, paper, account_id, status, created_at) on public.brokerage_accounts to authenticated;
grant all on public.brokerage_accounts to service_role;

-- Store a linked account's OAuth token for that user's own row. Service role only.
create or replace function public.broker_token_store(p_user uuid, p_account uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_name text;
begin
  if p_user is null or p_account is null or coalesce(p_token, '') = '' then raise exception 'missing argument'; end if;
  if not exists (select 1 from public.brokerage_accounts where id = p_account and user_id = p_user and kind = 'linked') then
    raise exception 'not this user''s linked account';
  end if;
  v_name := 'broker_token_' || p_user::text || '_' || p_account::text;
  delete from vault.secrets where name = v_name;
  perform vault.create_secret(p_token, v_name, 'Upmore linked brokerage OAuth token');
  update public.brokerage_accounts set vault_key_ref = v_name where id = p_account and user_id = p_user;
end;
$$;

-- Read it back for the chat handler, per request. The secret name is recomputed from the caller's user id and the row id,
-- never taken from the row, and the row must be that user's active linked account: another user's id gets null.
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
                 where id = p_account and user_id = p_user and kind = 'linked' and status = 'active' and paper = true) then
    return null;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets
   where name = 'broker_token_' || p_user::text || '_' || p_account::text;
  return v_secret;
end;
$$;

revoke all on function public.broker_token_store(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.broker_token_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.broker_token_store(uuid, uuid, text) to service_role;
grant execute on function public.broker_token_read(uuid, uuid) to service_role;
