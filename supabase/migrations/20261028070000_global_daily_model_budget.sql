-- A hard, global daily budget for every paid model call (owner, 2026-10-28): "a fresh $20 total budget across all testers
-- for the Chicago calendar day. Make sure paid calls can't exceed that total, including concurrent calls and missing cost
-- records."
--
-- One row per America/Chicago calendar date (model_budget_days) holds spent and reserved micro-dollars (1e-6 USD). The
-- limit lives only in a server-side setting row (model_budget_settings.daily_limit_micros, default 20,000,000). Code
-- (_shared/model_budget.ts, called from _shared/model_gateway.ts callModel) works like this around every paid call:
--
--   reserve   model_budget_reserve(worst-case micros): ONE UPDATE ... WHERE spent + reserved + x <= limit RETURNING. Row
--             locks serialize concurrent callers and Postgres re-checks the WHERE after the lock wait, so two callers can
--             never both take the last dollar. No read-then-write. A reservation that does not fit makes no row and no call.
--   settle    model_budget_settle(id, actual): moves the reservation to spent at the proven actual cost. actual NULL (usage
--             missing or unparseable, model unpriced, the call's outcome unknown) keeps the FULL worst-case as spent. A
--             missing record never frees budget.
--   release   model_budget_release(id): only for a proven no-call (the request was never sent, or the provider refused it
--             before generating). Returns the reservation to the day.
--   expire    model_budget_expire(): a reservation still open after the TTL (a crashed worker) becomes spent at its
--             worst-case. Never a refund. Runs at the start of every reserve.
--
-- Every function is SECURITY INVOKER and service_role only: tables are RLS-on with no policy. A function that errors raises;
-- the caller then makes no paid call (fail closed). The first refusal of a day writes one founder_alerts row (unique index).
create table if not exists public.model_budget_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into public.model_budget_settings (key, value) values
  ('daily_limit_micros', '20000000'), ('paused', 'false'), ('reservation_ttl_seconds', '900')
  on conflict (key) do nothing;

create table if not exists public.model_budget_days (
  day date primary key,
  limit_micros bigint not null check (limit_micros >= 0),
  spent_micros bigint not null default 0 check (spent_micros >= 0),
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.model_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  day date not null references public.model_budget_days(day),
  micros bigint not null check (micros > 0),
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released', 'expired')),
  cost_known boolean,
  actual_micros bigint check (actual_micros >= 0),
  model text,
  role text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists model_budget_reservations_open_idx on public.model_budget_reservations (created_at) where status = 'reserved';

alter table public.model_budget_settings enable row level security;
alter table public.model_budget_days enable row level security;
alter table public.model_budget_reservations enable row level security;
revoke all on public.model_budget_settings, public.model_budget_days, public.model_budget_reservations from public, anon, authenticated;
grant select on public.model_budget_settings to service_role;
grant select, insert, update on public.model_budget_days, public.model_budget_reservations to service_role;

-- One alert per kind per Chicago day, whatever the concurrency: the unique index decides.
create unique index if not exists founder_alerts_model_budget_once on public.founder_alerts (kind, (detail ->> 'day'))
  where kind in ('model_budget_exhausted', 'model_budget_paused', 'model_budget_overrun');

-- The Chicago calendar date of an instant. 2026-11-01 (fall back) has 25 hours and one date; the zone rules decide.
create or replace function public.model_budget_day(p_at timestamptz default now()) returns date
language sql stable set search_path = pg_catalog, pg_temp as $$ select (p_at at time zone 'America/Chicago')::date $$;

-- A setting as a non-negative integer; a missing row is the default, a malformed one RAISES (fail closed).
create or replace function public.model_budget_int(p_key text, p_default bigint) returns bigint
language plpgsql stable set search_path = public, pg_temp as $$
declare v text;
begin
  select value into v from public.model_budget_settings where key = p_key;
  if not found then return p_default; end if;
  if v !~ '^[0-9]{1,15}$' then raise exception 'model budget setting % is not a non-negative integer', p_key; end if;
  return v::bigint;
end $$;

-- Stuck reservations become spent at their worst case. One statement; skip-locked so concurrent callers never wait on it.
create or replace function public.model_budget_expire(p_now timestamptz default now()) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare n integer;
begin
  with stale as (
    select id from public.model_budget_reservations
    where status = 'reserved' and created_at < p_now - make_interval(secs => greatest(120, public.model_budget_int('reservation_ttl_seconds', 900)))
    order by id for update skip locked),
  gone as (
    update public.model_budget_reservations r set status = 'expired', cost_known = false, actual_micros = r.micros, closed_at = p_now
    from stale where r.id = stale.id returning r.day, r.micros),
  per_day as (select day, sum(micros) as m from gone group by day),
  moved as (
    update public.model_budget_days d set reserved_micros = d.reserved_micros - p.m, spent_micros = d.spent_micros + p.m, updated_at = p_now
    from per_day p where d.day = p.day returning 1)
  select count(*) into n from gone;
  return n;
end $$;

-- Reserve a worst-case cost. Returns {ok:true, id, day, spent, reserved, limit} or {ok:false, state:'limit'|'paused', ...}.
create or replace function public.model_budget_reserve(p_micros bigint, p_model text default null, p_role text default null, p_now timestamptz default now())
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare lim bigint; d date := public.model_budget_day(p_now); rec record; rid uuid; paused text;
begin
  if p_micros is null or p_micros <= 0 then raise exception 'a reservation must be a positive number of micro-dollars'; end if;
  lim := public.model_budget_int('daily_limit_micros', 20000000);
  select lower(value) into paused from public.model_budget_settings where key = 'paused';
  if paused is not null and paused not in ('true', 'false', '1', '0', 'yes', 'no', 'on', 'off') then raise exception 'model budget setting paused is not true or false'; end if;
  if paused in ('true', '1', 'yes', 'on') then
    insert into public.founder_alerts (kind, user_id, detail) values ('model_budget_paused', null, jsonb_build_object('day', d::text))
      on conflict (kind, (detail ->> 'day')) where kind in ('model_budget_exhausted', 'model_budget_paused', 'model_budget_overrun') do nothing;
    return jsonb_build_object('ok', false, 'state', 'paused', 'day', d);
  end if;
  perform public.model_budget_expire(p_now);
  insert into public.model_budget_days (day, limit_micros, created_at, updated_at) values (d, lim, p_now, p_now) on conflict (day) do nothing;
  -- The one statement that decides. A concurrent caller waits on the row lock, then re-checks the WHERE against the new totals.
  update public.model_budget_days set reserved_micros = reserved_micros + p_micros, limit_micros = lim, updated_at = p_now
    where day = d and spent_micros + reserved_micros + p_micros <= lim
    returning spent_micros, reserved_micros, limit_micros into rec;
  if not found then
    select spent_micros, reserved_micros, limit_micros into rec from public.model_budget_days where day = d;
    insert into public.founder_alerts (kind, user_id, detail)
      values ('model_budget_exhausted', null, jsonb_build_object('day', d::text, 'limit_micros', rec.limit_micros, 'spent_micros', rec.spent_micros, 'reserved_micros', rec.reserved_micros, 'asked_micros', p_micros))
      on conflict (kind, (detail ->> 'day')) where kind in ('model_budget_exhausted', 'model_budget_paused', 'model_budget_overrun') do nothing;
    return jsonb_build_object('ok', false, 'state', 'limit', 'day', d, 'spent', rec.spent_micros, 'reserved', rec.reserved_micros, 'limit', rec.limit_micros);
  end if;
  insert into public.model_budget_reservations (day, micros, model, role, created_at) values (d, p_micros, p_model, p_role, p_now) returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid, 'day', d, 'spent', rec.spent_micros, 'reserved', rec.reserved_micros, 'limit', rec.limit_micros);
end $$;

-- Settle to the actual cost. NULL actual (not proven) keeps the whole worst case as spent. Idempotent: only an open
-- reservation moves, so a second settle (or one after expiry) changes nothing.
create or replace function public.model_budget_settle(p_id uuid, p_actual_micros bigint default null, p_now timestamptz default now()) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare r record; spend bigint;
begin
  if p_actual_micros is not null and p_actual_micros < 0 then raise exception 'actual cost cannot be negative'; end if;
  update public.model_budget_reservations set status = 'settled', cost_known = (p_actual_micros is not null),
      actual_micros = coalesce(p_actual_micros, micros), closed_at = p_now
    where id = p_id and status = 'reserved' returning day, micros, actual_micros into r;
  if not found then return jsonb_build_object('ok', false, 'state', 'not_open'); end if;
  update public.model_budget_days set reserved_micros = reserved_micros - r.micros, spent_micros = spent_micros + r.actual_micros, updated_at = p_now where day = r.day;
  if r.actual_micros > r.micros then
    insert into public.founder_alerts (kind, user_id, detail) values ('model_budget_overrun', null, jsonb_build_object('day', r.day::text, 'reserved_micros', r.micros, 'actual_micros', r.actual_micros))
      on conflict (kind, (detail ->> 'day')) where kind in ('model_budget_exhausted', 'model_budget_paused', 'model_budget_overrun') do nothing;
  end if;
  return jsonb_build_object('ok', true, 'spent', r.actual_micros);
end $$;

-- Give a reservation back. Only for a proven no-call.
create or replace function public.model_budget_release(p_id uuid, p_now timestamptz default now()) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare r record;
begin
  update public.model_budget_reservations set status = 'released', cost_known = true, actual_micros = 0, closed_at = p_now
    where id = p_id and status = 'reserved' returning day, micros into r;
  if not found then return jsonb_build_object('ok', false, 'state', 'not_open'); end if;
  update public.model_budget_days set reserved_micros = reserved_micros - r.micros, updated_at = p_now where day = r.day;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.model_budget_day(timestamptz), public.model_budget_int(text, bigint), public.model_budget_expire(timestamptz),
  public.model_budget_reserve(bigint, text, text, timestamptz), public.model_budget_settle(uuid, bigint, timestamptz),
  public.model_budget_release(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.model_budget_day(timestamptz), public.model_budget_int(text, bigint), public.model_budget_expire(timestamptz),
  public.model_budget_reserve(bigint, text, text, timestamptz), public.model_budget_settle(uuid, bigint, timestamptz),
  public.model_budget_release(uuid, timestamptz) to service_role;
