-- Launch readiness R1 (2026-10-26): two texts sent close together are both answered, in the order they arrived.
--
-- Each inbound text runs its own agent-chat turn. Two turns for one person read the same thread revision, and the second
-- to commit got revision_conflict from career_host_commit; chatThroughAgent threw on the 409, and the person read
-- "I couldn't answer that just now" for a message that was already claimed and never retried.
--
-- The fix: a person's turns run one at a time, in the order agent-chat received them. Each turn takes a ticket
-- (career_turn_gate_enter) before it reads the thread, waits until no earlier live ticket of the same person remains
-- (career_turn_gate_ready), and gives its ticket back after it commits (career_turn_gate_leave). A ticket lapses after
-- its lease (a crashed turn never blocks the next one for longer than that). Service role only: agent-chat calls these
-- with its own key for every turn, the person's app never does.
-- Idempotent. Tested by tests/db/career_turn_gate.test.sql and, end to end, tests/architect/launch-readiness-handler.test.ts.
create table if not exists public.career_turn_gate (
  ticket bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  turn_key text not null check (length(turn_key) between 1 and 128),
  entered_at timestamptz not null default now(),
  lease_until timestamptz not null
);
create index if not exists career_turn_gate_user_ticket on public.career_turn_gate (user_id, ticket);
alter table public.career_turn_gate enable row level security;
revoke all on public.career_turn_gate from anon, authenticated;
grant all on public.career_turn_gate to service_role;
grant usage, select on sequence public.career_turn_gate_ticket_seq to service_role;

-- A ticket for this turn; lapsed tickets of the person are cleared on the way in.
create or replace function public.career_turn_gate_enter(p_user uuid, p_turn_key text, p_lease_seconds integer default 90)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare t bigint;
begin
  if p_user is null or p_turn_key is null or p_lease_seconds is null or p_lease_seconds not between 5 and 600 then
    raise exception 'invalid turn gate ticket';
  end if;
  delete from career_turn_gate where user_id = p_user and lease_until < now();
  insert into career_turn_gate(user_id, turn_key, lease_until) values (p_user, p_turn_key, now() + make_interval(secs => p_lease_seconds))
  returning ticket into t;
  return t;
end $$;

-- True when this ticket is the person's oldest live one: the turns before it have committed, or lapsed.
create or replace function public.career_turn_gate_ready(p_user uuid, p_ticket bigint)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (select 1 from career_turn_gate where user_id = p_user and ticket < p_ticket and lease_until >= now())
$$;

create or replace function public.career_turn_gate_leave(p_user uuid, p_ticket bigint)
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from career_turn_gate where user_id = p_user and ticket = p_ticket
$$;

revoke all on function public.career_turn_gate_enter(uuid, text, integer), public.career_turn_gate_ready(uuid, bigint),
  public.career_turn_gate_leave(uuid, bigint) from public, anon, authenticated;
grant execute on function public.career_turn_gate_enter(uuid, text, integer), public.career_turn_gate_ready(uuid, bigint),
  public.career_turn_gate_leave(uuid, bigint) to service_role;
