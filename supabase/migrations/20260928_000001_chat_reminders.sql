-- Upmore Chat + Reminders tabs: data model (2026-09-28).
-- reminders: things the user needs to do (bills, trials, renewals, claims...).
-- agent_tasks / agent_steps: the agent feed's task runs, streamed via realtime.
-- action_ledger: immutable, insert-only record of every completed action.

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  amount numeric null,
  direction text check (direction in ('owed_by_user', 'owed_to_user')),
  due_at timestamptz,
  timezone text,
  evidence jsonb not null default '[]'::jsonb,
  source_id uuid,
  confidence numeric,
  state text not null default 'open'
    check (state in ('open', 'agent_working', 'done', 'dismissed', 'expired')),
  dismissed_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_id uuid references public.reminders(id) on delete set null,
  title text not null,
  status text not null default 'running'
    check (status in ('running', 'needs_user', 'done', 'failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  position int not null,
  label text not null,
  status text not null default 'pending'
    check (status in ('pending', 'working', 'done', 'failed')),
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.action_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.agent_tasks(id) on delete set null,
  action text not null,
  rail text,
  partner text,
  amount numeric,
  tier text check (tier in ('T0', 'T1', 'T2', 'T3')),
  approved_by text check (approved_by in ('user', 'rule')),
  evidence jsonb not null default '{}'::jsonb,
  outcome text,
  created_at timestamptz not null default now()
);

alter table public.reminders enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.agent_steps enable row level security;
alter table public.action_ledger enable row level security;

create policy "reminders_owner"
  on public.reminders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "agent_tasks_owner"
  on public.agent_tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Steps are written by the edge function (service role); clients read.
create policy "agent_steps_owner_read"
  on public.agent_steps for select
  using (
    task_id in (select id from public.agent_tasks where user_id = auth.uid())
  );

-- Ledger is immutable: clients may insert and read, never update or delete.
create policy "action_ledger_owner_read"
  on public.action_ledger for select
  using (auth.uid() = user_id);

create policy "action_ledger_owner_insert"
  on public.action_ledger for insert
  with check (auth.uid() = user_id);

create index if not exists reminders_user_state_due_idx
  on public.reminders (user_id, state, due_at);
create index if not exists agent_steps_task_pos_idx
  on public.agent_steps (task_id, position);
create index if not exists action_ledger_user_created_idx
  on public.action_ledger (user_id, created_at desc);

-- Realtime: the agent feed streams step updates as they complete.
alter publication supabase_realtime add table public.agent_steps;
