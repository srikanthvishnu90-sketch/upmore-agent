-- Agent learning-from-mistakes loop (2026-09-28).
--
-- agent_lessons is the agent's memory of its own failures. Every terminal
-- execution outcome (agent-exec) and every caught chat mistake (agent-chat)
-- is categorized and stored here; before the next similar task the agent
-- retrieves the relevant lessons and applies them. Repeated identical
-- failures escalate (needs_reverification) instead of burning more runs;
-- a later success resolves the open lesson — the loop visibly closes.
--
-- user_id NULL = global lesson (learned once, applies to every user).
-- user_id set  = learned from one user's session, applies to them.

create table if not exists public.agent_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('exec_failure','chat_caught','user_correction')),
  scope text not null check (scope <> ''),
  category text not null check (category <> ''),
  title text not null check (title <> ''),
  what_happened text not null,
  what_to_do_instead text not null,
  signal text null,
  times_seen integer not null default 1 check (times_seen >= 1),
  times_applied integer not null default 0 check (times_applied >= 0),
  needs_reverification boolean not null default false,
  resolved boolean not null default false,
  resolved_note text null,
  source_run_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_lessons_scope_idx
  on public.agent_lessons (scope, resolved, times_seen desc);
create index if not exists agent_lessons_user_idx
  on public.agent_lessons (user_id, resolved)
  where user_id is not null;

alter table public.agent_lessons enable row level security;

-- Users read global lessons plus their own; they never see other users'
-- lessons. Service_role (agent-exec) bypasses RLS for global writes.
drop policy if exists agent_lessons_select on public.agent_lessons;
create policy agent_lessons_select on public.agent_lessons
  for select using (user_id is null or user_id = auth.uid());

-- Users may record lessons from their own sessions only (chat-caught
-- mistakes, their own corrections). Global lessons are written by the
-- service_role executor, never by a user client.
drop policy if exists agent_lessons_insert_own on public.agent_lessons;
create policy agent_lessons_insert_own on public.agent_lessons
  for insert with check (user_id = auth.uid());

-- Users may never update or delete lessons (prevents gaming the memory).
-- Resolution happens service-side after a verified success.
drop policy if exists agent_lessons_no_update on public.agent_lessons;
drop policy if exists agent_lessons_no_delete on public.agent_lessons;

-- Atomic counter bump for "lesson applied" (service_role only; no RLS
-- policy grants users execute, so user clients cannot call it).
create or replace function public.agent_lessons_bump_applied(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.agent_lessons
     set times_applied = times_applied + 1,
         updated_at = now()
   where id = any (p_ids);
$$;
revoke all on function public.agent_lessons_bump_applied(uuid[]) from public, anon, authenticated;

-- Same bump for the chat client: only lessons the caller can already see
-- (global or their own), unresolved ones only. Lets the app honestly count
-- applications without granting users any other write access.
create or replace function public.agent_lessons_note_applied(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agent_lessons l
     set times_applied = times_applied + 1,
         updated_at = now()
   where l.id = any (p_ids)
     and l.resolved = false
     and (l.user_id is null or l.user_id = auth.uid());
end;
$$;
revoke all on function public.agent_lessons_note_applied(uuid[]) from public, anon;
grant execute on function public.agent_lessons_note_applied(uuid[]) to authenticated;
