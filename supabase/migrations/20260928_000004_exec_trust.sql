-- Execution trust primitives (2026-09-28).
-- approval_context: evidentiary record of the exact strings shown on the approval screen.
-- otp_expires_at: 30-minute TTL for awaiting_otp runs.
-- cancel_claims: server-side claim records for the billing-cycle watcher.
-- playbook_reports: user mismatch reports driving playbook demotion.
-- action_ledger: append-only enforcement at the database level.

alter table public.exec_approvals
  add column if not exists approval_context jsonb;

alter table public.exec_runs
  add column if not exists otp_expires_at timestamptz;

create table if not exists public.cancel_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null,
  merchant_key text,
  amount numeric,
  expected_billing_date date not null,
  grace_days int not null default 2,
  status text not null default 'open'
    check (status in ('open','confirmed','zombie')),
  run_id uuid references public.exec_runs(id) on delete set null,
  approval_id uuid references public.exec_approvals(id) on delete set null,
  subscription_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists cancel_claims_open_idx
  on public.cancel_claims (status, expected_billing_date)
  where status = 'open';

create table if not exists public.playbook_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  run_id uuid references public.exec_runs(id) on delete set null,
  kind text not null default 'mismatch'
    check (kind in ('mismatch','other')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists playbook_reports_merchant_idx
  on public.playbook_reports (merchant_key, created_at desc);

alter table public.cancel_claims enable row level security;
alter table public.playbook_reports enable row level security;

drop policy if exists cancel_claims_owner on public.cancel_claims;
create policy cancel_claims_owner on public.cancel_claims for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists playbook_reports_owner on public.playbook_reports;
create policy playbook_reports_owner on public.playbook_reports for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- action_ledger is append-only: reversals are offsetting entries, never edits.
create or replace function public.action_ledger_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'action_ledger is append-only: write an offsetting entry instead of updating/deleting';
end $$;

drop trigger if exists action_ledger_no_update on public.action_ledger;
create trigger action_ledger_no_update
  before update or delete on public.action_ledger
  for each row execute function public.action_ledger_immutable();
