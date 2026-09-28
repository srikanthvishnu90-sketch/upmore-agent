-- Agent AI usage tracking for margin verification (2026-09-27).
-- Logs tokens per model call so we can verify the 30-60% margin math on $10/mo.
create table if not exists public.agent_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid references public.agent_threads(id) on delete set null,
  model text not null default 'claude-haiku-4-5-20251001',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists agent_usage_user_month_idx
  on public.agent_usage (user_id, created_at desc);
alter table public.agent_usage enable row level security;
-- Users see only their own usage; service_role bypasses for the edge function.
drop policy if exists "users read own usage" on public.agent_usage;
create policy "users read own usage" on public.agent_usage
  for select using (auth.uid() = user_id);
