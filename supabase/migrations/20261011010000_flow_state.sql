-- Per-thread state for the message router's flows (buy from a text, cancel, pay a person back). The chat handler is
-- stateless per message, so the live confirmation card, its expiry, its single use and the loop log are saved here
-- after every routed message and restored before the next. The state never holds one-time codes, passwords or card
-- numbers: the flows' snapshots do not contain them by construction, and this table refuses keys that look like them.
create table if not exists public.agent_flow_state (
  thread_id uuid primary key references public.agent_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now(),
  check (pg_column_size(state) < 524288),
  check (not (state::text ~* '"(otp|one_time_code|password|passcode|card_number|pan|cvv|ssn)"\s*:'))
);
-- Ownership of the thread, checked without granting the caller read access to agent_threads.
create or replace function public.agent_thread_owned(p_thread uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agent_threads t where t.id = p_thread and t.user_id = auth.uid());
$$;
revoke all on function public.agent_thread_owned(uuid) from public, anon;
grant execute on function public.agent_thread_owned(uuid) to authenticated, service_role;
alter table public.agent_flow_state enable row level security;
revoke all on public.agent_flow_state from anon, authenticated;
grant select, insert, update on public.agent_flow_state to authenticated;
grant all on public.agent_flow_state to service_role;
drop policy if exists agent_flow_state_owner_read on public.agent_flow_state;
create policy agent_flow_state_owner_read on public.agent_flow_state for select using (auth.uid() = user_id);
drop policy if exists agent_flow_state_owner_insert on public.agent_flow_state;
create policy agent_flow_state_owner_insert on public.agent_flow_state for insert
  with check (auth.uid() = user_id and public.agent_thread_owned(thread_id));
drop policy if exists agent_flow_state_owner_update on public.agent_flow_state;
create policy agent_flow_state_owner_update on public.agent_flow_state for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.agent_thread_owned(thread_id));
