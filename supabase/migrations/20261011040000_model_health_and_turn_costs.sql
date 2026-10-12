-- Model health and cost per turn (2026-10-11). Live finding: from 19:01 UTC every model call failed (16 calls reserved,
-- 0 recorded in 24 hours) and nothing noticed until a person read the replies. These tables make a dead provider visible
-- in minutes and say what one real turn costs.

-- 1. One row per provider call outcome, written by the server through the model gateway (service role only).
create table if not exists public.agent_provider_events (
  id bigserial primary key,
  provider text not null check (provider in ('openai','anthropic')),
  model text not null check (length(model) between 1 and 100),
  role text not null check (role in ('chat','router','planner','probe')),
  ok boolean not null,
  status integer,
  error_type text check (error_type is null or length(error_type) <= 100),
  detail text check (detail is null or length(detail) <= 300),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  created_at timestamptz not null default now()
);
create index if not exists agent_provider_events_recent on public.agent_provider_events (created_at desc);
alter table public.agent_provider_events enable row level security;
revoke all on public.agent_provider_events from anon, authenticated;
grant all on public.agent_provider_events to service_role;
grant usage, select on sequence public.agent_provider_events_id_seq to service_role;

-- 2. One row per user turn that called a model: calls, tokens and the estimated cost in micro-dollars.
create table if not exists public.agent_turn_costs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.agent_threads(id) on delete set null,
  provider text check (provider is null or provider in ('openai','anthropic')),
  models text[] not null default '{}',
  calls integer not null check (calls between 0 and 100),
  failed integer not null default 0 check (failed between 0 and 100),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cached_tokens bigint not null default 0 check (cached_tokens >= 0),
  usd_micros bigint not null default 0 check (usd_micros >= 0),
  unpriced integer not null default 0 check (unpriced >= 0),
  created_at timestamptz not null default now()
);
create index if not exists agent_turn_costs_user_day on public.agent_turn_costs (user_id, created_at desc);
alter table public.agent_turn_costs enable row level security;
revoke all on public.agent_turn_costs from anon, authenticated;
grant select on public.agent_turn_costs to authenticated;
grant all on public.agent_turn_costs to service_role;
grant usage, select on sequence public.agent_turn_costs_id_seq to service_role;
drop policy if exists agent_turn_costs_owner on public.agent_turn_costs;
create policy agent_turn_costs_owner on public.agent_turn_costs for select using (auth.uid() = user_id);

-- What one person costs per day (the caller's own rows through RLS; the service role sees everyone).
create or replace view public.agent_daily_costs with (security_invoker = true) as
  select user_id, (created_at at time zone 'UTC')::date as day, count(*) as turns, sum(calls) as model_calls,
         sum(failed) as failed_calls, sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
         sum(usd_micros) as usd_micros, round(sum(usd_micros) / 1000000.0, 6) as usd, sum(unpriced) as unpriced_calls
  from public.agent_turn_costs group by user_id, (created_at at time zone 'UTC')::date;
grant select on public.agent_daily_costs to authenticated, service_role;

-- 3. The health verdict over a recent window. down: at least 3 failures and no success; degraded: half or more failed
-- (at least 4 calls); idle: no calls; ok otherwise. Service role only: the model-health function calls it.
create or replace function public.model_health(p_minutes integer default 15)
returns jsonb language sql stable security definer set search_path = public as $$
  with w as (
    select * from public.agent_provider_events
    where created_at > now() - make_interval(mins => greatest(1, least(coalesce(p_minutes, 15), 1440)))
  ), c as (
    select count(*) as total, count(*) filter (where not ok) as errors, count(*) filter (where ok) as oks,
           max(created_at) filter (where ok) as last_ok, max(created_at) filter (where not ok) as last_error
    from w
  ), last_err as (
    select provider, model, role, status, error_type, detail, created_at from w where not ok order by created_at desc limit 1
  )
  select jsonb_build_object(
    'status', case when c.total = 0 then 'idle'
                   when c.errors >= 3 and c.oks = 0 then 'down'
                   when c.total >= 4 and c.errors * 2 >= c.total then 'degraded'
                   else 'ok' end,
    'window_minutes', greatest(1, least(coalesce(p_minutes, 15), 1440)),
    'calls', c.total, 'errors', c.errors, 'last_ok', c.last_ok, 'last_error_at', c.last_error,
    'last_error', (select to_jsonb(last_err) from last_err))
  from c;
$$;
revoke all on function public.model_health(integer) from public, anon, authenticated;
grant execute on function public.model_health(integer) to service_role;
