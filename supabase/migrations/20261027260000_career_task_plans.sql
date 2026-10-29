-- Task intelligence (P1, TASK-INTELLIGENCE-SPEC-2026-10-27 §3): a multi-step ask is a plan, kept per person (never per
-- thread), so it resumes on any channel and across days.
--   career_plans          one row per plan: the goal, its status and an optimistic revision (two turns never both advance it)
--   career_plan_steps     the plan's steps: one registered capability each, its inputs, its dependencies, its status, the
--                         compact result it produced, when it was verified, and when it next wakes (follow-through)
--   career_plan_asks      what was asked of the person, once per person per need (a signature asked in plan A is never
--                         asked again in plan B)
--   career_plan_effects   every external effect a plan wants: its exact payload, the sha256 of that payload as shown,
--                         the hash the person approved, and its execution status. Exactly once per (person, idem_key).
-- Only the service role reads or writes (the agent-chat handler and the plan workers); no client grants, so nothing here is
-- in the app's export surface. Every table carries user_id and starts with career_, so career_erase_person empties them.
-- No SECURITY DEFINER function (the definer lockdown, 20261026230500, stays exact). NO LIMITS: no volume number anywhere.

create table if not exists public.career_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal text not null check (length(goal) between 1 and 2000),
  status text not null default 'drafting' check (status in ('drafting','waiting_on_person','waiting_on_outside','running','done','stopped','failed')),
  revision int not null default 0,
  origin_channel text, last_channel text,
  card jsonb check (card is null or (jsonb_typeof(card) = 'object' and octet_length(card::text) <= 65536)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A turn reads only the person's open plans (and the newest closed ones): bounded and indexed.
create index if not exists career_plans_open on public.career_plans (user_id, updated_at desc) where status not in ('done','stopped','failed');
create index if not exists career_plans_recent on public.career_plans (user_id, updated_at desc);

create table if not exists public.career_plan_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.career_plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  idx int not null check (idx >= 0),
  capability text not null check (capability ~ '^[a-z_]+\.[a-z_]+$'),
  inputs jsonb not null default '{}'::jsonb check (octet_length(inputs::text) <= 65536),
  depends_on int[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','blocked','needs_person','awaiting_approval','approved','queued','running','done','failed','skipped')),
  blocker jsonb,
  -- Compact output (ids and the few fields a later step reads), never a copy of a capability's rows; bounded.
  output jsonb check (output is null or octet_length(output::text) <= 524288),
  verified_at timestamptz, verify_result jsonb,
  next_check_at timestamptz,
  lease_owner text, lease_until timestamptz,
  attempts int not null default 0,
  updated_at timestamptz not null default now(),
  unique (plan_id, idx)
);
create index if not exists career_plan_steps_plan on public.career_plan_steps (plan_id, idx);
-- The wake queue: due steps, claimed with leases across worker instances (career_plan_claim_due).
create index if not exists career_plan_steps_due on public.career_plan_steps (next_check_at) where next_check_at is not null;

create table if not exists public.career_plan_asks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  ask_key text not null check (ask_key ~ '^[a-z_.:]+$'),
  plan_id uuid references public.career_plans(id) on delete set null,
  channel text,
  asked_at timestamptz not null default now(),
  times int not null default 1,
  answered_at timestamptz,
  primary key (user_id, ask_key)
);

create table if not exists public.career_plan_effects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.career_plans(id) on delete cascade,
  step_id uuid not null references public.career_plan_steps(id) on delete cascade,
  capability text not null,
  idem_key text not null check (length(idem_key) between 1 and 300),
  payload jsonb not null check (octet_length(payload::text) <= 65536),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'shown' check (status in ('shown','approved','declined','executing','done','failed','unknown','changed','refused')),
  card_id uuid, card_n int,
  approved_hash text check (approved_hash is null or approved_hash ~ '^[a-f0-9]{64}$'),
  approved_at timestamptz,
  claimed_by text, claimed_at timestamptz,
  result jsonb check (result is null or octet_length(result::text) <= 65536),
  updated_at timestamptz not null default now(),
  unique (user_id, idem_key)
);
create index if not exists career_plan_effects_step on public.career_plan_effects (step_id);
create index if not exists career_plan_effects_card on public.career_plan_effects (card_id) where card_id is not null;
create index if not exists career_plan_effects_executing on public.career_plan_effects (claimed_at) where status = 'executing';

alter table public.career_plans enable row level security;
alter table public.career_plan_steps enable row level security;
alter table public.career_plan_asks enable row level security;
alter table public.career_plan_effects enable row level security;
revoke all on public.career_plans, public.career_plan_steps, public.career_plan_asks, public.career_plan_effects from public, anon, authenticated;
grant all on public.career_plans, public.career_plan_steps, public.career_plan_asks, public.career_plan_effects to service_role;

-- The one gate for an external effect, in the database: an effect runs only when it was approved, the hash approved is the
-- hash of the payload about to run, and that is the hash shown. Anything else is refused (a changed payload is marked
-- 'changed' and never runs). Atomic: two workers never both run one effect.
create or replace function public.career_plan_effect_claim(p_effect uuid, p_user uuid, p_hash text, p_worker text)
returns text language plpgsql security invoker set search_path = public, pg_temp as $$
declare e public.career_plan_effects;
begin
  select * into e from public.career_plan_effects where id = p_effect and user_id = p_user for update skip locked;
  if not found then
    if exists (select from public.career_plan_effects where id = p_effect and user_id = p_user) then return 'taken'; end if;
    return 'missing';
  end if;
  if e.status <> 'approved' then return case when e.status in ('executing','done','unknown') then 'taken' else 'not_approved' end; end if;
  if e.approved_hash is null or e.approved_hash <> e.payload_hash or p_hash is distinct from e.approved_hash then
    update public.career_plan_effects set status = 'changed', updated_at = now() where id = e.id;
    return 'changed';
  end if;
  update public.career_plan_effects set status = 'executing', claimed_by = p_worker, claimed_at = now(), updated_at = now() where id = e.id;
  return 'ok';
end $$;

-- Due steps for the plan workers, many instances at once: SKIP LOCKED leases, an expired lease reclaimed, and fair across
-- people (each person's oldest due step first, so one person's thousand steps never starve another's one).
create or replace function public.career_plan_claim_due(p_worker text, p_limit int, p_lease_seconds int, p_now timestamptz default now())
returns setof public.career_plan_steps language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_worker is null or p_limit is null or p_limit < 1 or p_lease_seconds is null or p_lease_seconds < 1 then raise exception 'invalid claim'; end if;
  return query
  with due as (
    select s.id, s.user_id, s.next_check_at,
      row_number() over (partition by s.user_id order by s.next_check_at, s.id) as rn
    from public.career_plan_steps s
    where s.next_check_at is not null and s.next_check_at <= p_now
      and (s.lease_until is null or s.lease_until < p_now)
  ), pick as (
    select s.id from public.career_plan_steps s join due d on d.id = s.id
    order by d.rn, d.next_check_at, s.id
    for update of s skip locked
    limit p_limit
  )
  update public.career_plan_steps s set lease_owner = p_worker, lease_until = p_now + make_interval(secs => p_lease_seconds),
    attempts = s.attempts + 1, updated_at = p_now
  from pick where s.id = pick.id
  returning s.*;
end $$;

revoke all on function public.career_plan_effect_claim(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.career_plan_claim_due(text, int, int, timestamptz) from public, anon, authenticated;
grant execute on function public.career_plan_effect_claim(uuid, uuid, text, text) to service_role;
grant execute on function public.career_plan_claim_due(text, int, int, timestamptz) to service_role;
