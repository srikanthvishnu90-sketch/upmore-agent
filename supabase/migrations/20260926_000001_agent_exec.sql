-- Upmore real-world execution agent: approvals, runs, credential refs.
-- 2026-09-26. Users approve per-action; agent executes; every run is audited.

create table if not exists public.exec_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null,
  merchant_key text not null,
  plan_name text,
  amount numeric,
  currency text default 'USD',
  billing_date text,
  action text not null default 'cancel_subscription'
    check (action in ('cancel_subscription')),
  status text not null default 'pending'
    check (status in ('pending','approved','executing','done','failed','cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.exec_runs (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.exec_approvals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'started'
    check (status in ('started','done','failed')),
  evidence jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Registry: which vault secret holds this user's credential for a merchant.
-- The secret itself lives in Supabase Vault; this table only maps to it.
create table if not exists public.exec_credential_refs (
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  vault_name text not null,
  label text,
  created_at timestamptz not null default now(),
  primary key (user_id, merchant_key)
);

alter table public.exec_approvals enable row level security;
alter table public.exec_runs enable row level security;
alter table public.exec_credential_refs enable row level security;

-- Users manage their own rows. Status may only move forward via the edge
-- function (service role); clients can insert pending approvals and cancel
-- their own pending ones.
create policy "exec_approvals_owner"
  on public.exec_approvals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "exec_runs_owner_read"
  on public.exec_runs for select
  using (auth.uid() = user_id);

create policy "exec_cred_refs_owner"
  on public.exec_credential_refs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists exec_approvals_user_idx
  on public.exec_approvals (user_id, created_at desc);
create index if not exists exec_runs_approval_idx
  on public.exec_runs (approval_id);

-- Vault write wrappers (service_role only). Secrets are namespaced
-- exec_cred_* so a caller can never touch other vault entries.
create or replace function public.exec_vault_store(p_name text, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_id uuid;
begin
  if p_name is null or p_name not like 'exec\_cred\_%' then
    raise exception 'invalid vault name';
  end if;
  delete from vault.secrets where name = p_name;
  select vault.create_secret(p_secret, p_name, 'Upmore merchant credential') into v_id;
  return v_id;
end;
$$;

create or replace function public.exec_vault_delete(p_name text)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  if p_name is null or p_name not like 'exec\_cred\_%' then
    raise exception 'invalid vault name';
  end if;
  delete from vault.secrets where name = p_name;
end;
$$;

revoke all on function public.exec_vault_store(text, text) from public, anon, authenticated;
revoke all on function public.exec_vault_delete(text) from public, anon, authenticated;
grant execute on function public.exec_vault_store(text, text) to service_role;
grant execute on function public.exec_vault_delete(text) to service_role;
