-- Upmore agent foundation (SPEC.md "The permission model").
-- 2026-09-28. Permission settings, the immutable action ledger, Stop
-- everything, scheduled actions, findings, and cancel confirmation watches.
--
-- Nothing else in the doing layer is safe to build without these three:
--   agent_settings  what the user allows, per capability, with limits
--   agent_ledger    one append-only record per action event, hash-chained
--   agent_stop_everything()  one call that halts everything, atomically
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. agent_settings: one row per user.
-- ---------------------------------------------------------------------------
create table if not exists public.agent_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- capability id -> tier 0..3. A capability with no entry runs at its
  -- default (T2, or lower where the capability cannot reach T2).
  tiers jsonb not null default '{}'::jsonb,
  -- capability id -> dollars. Overrides per_action_cap for that capability.
  cap_overrides jsonb not null default '{}'::jsonb,
  per_action_cap numeric not null default 25
    check (per_action_cap >= 0 and per_action_cap <= 100000),
  monthly_cap numeric not null default 200
    check (monthly_cap >= 0 and monthly_cap <= 1000000),
  match_tolerance numeric not null default 0.10
    check (match_tolerance >= 0 and match_tolerance <= 0.5),
  quiet_enabled boolean not null default true,
  quiet_start smallint not null default 22 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 7 check (quiet_end between 0 and 23),
  buffer numeric not null default 100 check (buffer >= 0 and buffer <= 1000000),
  allow_merchants text[] not null default '{}',
  block_merchants text[] not null default '{}',
  -- IANA zone captured once; quiet hours and the monthly cap use it so a trip
  -- abroad never shifts them.
  home_tz text not null default 'UTC',
  -- Set by agent_stop_everything(). While set, every capability is T0.
  stopped_at timestamptz,
  tiers_before_stop jsonb,
  updated_at timestamptz not null default now()
);

alter table public.agent_settings enable row level security;

drop policy if exists agent_settings_owner_select on public.agent_settings;
create policy agent_settings_owner_select on public.agent_settings
  for select using (auth.uid() = user_id);
drop policy if exists agent_settings_owner_insert on public.agent_settings;
create policy agent_settings_owner_insert on public.agent_settings
  for insert with check (auth.uid() = user_id);
drop policy if exists agent_settings_owner_update on public.agent_settings;
create policy agent_settings_owner_update on public.agent_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- No delete policy: settings leave only with the account (cascade).

-- Tier and cap maps are validated in the database, not just the client: a
-- value outside 0..3 can never be stored.
create or replace function public.agent_settings_guard()
returns trigger
language plpgsql
as $$
declare
  k text;
  v jsonb;
begin
  if jsonb_typeof(new.tiers) is distinct from 'object' then
    raise exception 'agent_settings.tiers must be a JSON object';
  end if;
  for k, v in select key, value from jsonb_each(new.tiers) loop
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not in (0, 1, 2, 3) then
      raise exception 'agent_settings.tiers[%] must be 0, 1, 2 or 3', k;
    end if;
  end loop;
  if jsonb_typeof(new.cap_overrides) is distinct from 'object' then
    raise exception 'agent_settings.cap_overrides must be a JSON object';
  end if;
  for k, v in select key, value from jsonb_each(new.cap_overrides) loop
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < 0
       or (v #>> '{}')::numeric > 100000 then
      raise exception 'agent_settings.cap_overrides[%] must be between 0 and 100000', k;
    end if;
  end loop;

  if tg_op = 'UPDATE' then
    -- Stop and resume only happen through their functions, which set this
    -- flag for the length of their own transaction. A plain table update can
    -- neither clear a stop nor fake one.
    if new.stopped_at is distinct from old.stopped_at
       and coalesce(current_setting('upmore.agent_stop_rpc', true), '') <> 'on' then
      raise exception 'use agent_stop_everything() or agent_resume() to change stopped_at';
    end if;
    -- While stopped, tiers stay empty: nothing can be raised behind the stop.
    if new.stopped_at is not null and new.tiers <> '{}'::jsonb then
      raise exception 'the agent is stopped; resume it before changing tiers';
    end if;
  elsif new.stopped_at is not null
        and coalesce(current_setting('upmore.agent_stop_rpc', true), '') <> 'on' then
    raise exception 'use agent_stop_everything() to stop the agent';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists agent_settings_guard on public.agent_settings;
create trigger agent_settings_guard
  before insert or update on public.agent_settings
  for each row execute function public.agent_settings_guard();

-- ---------------------------------------------------------------------------
-- 2. agent_ledger: append-only, hash-chained per user.
--    One row per event. Every event for the same action shares action_id.
--    This is the feed the user reads in Profile and the audit file a partner,
--    regulator or lawyer will ask for.
-- ---------------------------------------------------------------------------
create table if not exists public.agent_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null,
  event text not null check (event in (
    'proposed',        -- the agent found something to do
    'prepared',        -- the agent drafted or filled something; nothing left Upmore
    'approved',        -- the user tapped approve
    'declined',        -- the user said no
    'refused',         -- the permission engine or the never list refused it
    'deferred',        -- would run on its own, waiting for quiet hours or a date
    'held',            -- pre-flight failed; waiting on the user
    'started',         -- execution began on the rail
    'succeeded',       -- the rail reported success
    'failed',          -- the rail reported failure; nothing is claimed
    'confirmed',       -- the outcome actually happened (no charge, refund landed)
    'reversed',        -- the outcome did not hold (charged anyway)
    'user_reported',   -- the user says they did it themselves
    'cancelled',       -- a scheduled action was cancelled before it ran
    'settings_changed',
    'stopped',
    'resumed'
  )),
  capability_id text not null,
  what text not null check (length(what) between 1 and 500),
  rail text,
  partner text,
  counterparty text,
  amount numeric,
  currency text not null default 'USD',
  tier smallint check (tier between 0 and 4),
  actor text not null check (actor in ('user', 'agent', 'rule', 'system')),
  -- Who approved it: 'user', or 'rule:<capability id>' for a T3 action that
  -- ran inside limits the user set. Null when nothing was approved.
  approver text,
  outcome text,
  -- What triggered it and what proves it. Never secrets, OTPs or passwords.
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  prev_hash text,
  row_hash text not null
);

create index if not exists agent_ledger_user_time_idx
  on public.agent_ledger (user_id, id desc);
create index if not exists agent_ledger_action_idx
  on public.agent_ledger (action_id, id);

alter table public.agent_ledger enable row level security;

drop policy if exists agent_ledger_owner_select on public.agent_ledger;
create policy agent_ledger_owner_select on public.agent_ledger
  for select using (auth.uid() = user_id);
-- No insert, update or delete policy for users. Users append through
-- agent_ledger_append(); execution events come from the service role.
revoke insert, update, delete, truncate on public.agent_ledger from anon, authenticated;

-- The text that gets hashed. Every column is included and nulls are written
-- as a marker, so no two different rows can produce the same text.
create or replace function public.agent_ledger_canonical(r public.agent_ledger)
returns text
language sql
immutable
as $$
  select concat_ws(E'\x1f',
    coalesce(r.prev_hash, '-'),
    r.user_id::text,
    r.action_id::text,
    r.event,
    r.capability_id,
    r.what,
    coalesce(r.rail, '-'),
    coalesce(r.partner, '-'),
    coalesce(r.counterparty, '-'),
    coalesce(r.amount::text, '-'),
    r.currency,
    coalesce(r.tier::text, '-'),
    r.actor,
    coalesce(r.approver, '-'),
    coalesce(r.outcome, '-'),
    r.evidence::text,
    to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
$$;

create or replace function public.agent_ledger_seal()
returns trigger
language plpgsql
as $$
begin
  -- One writer per user at a time, so the chain can never fork.
  perform pg_advisory_xact_lock(hashtextextended('agent_ledger:' || new.user_id::text, 0));
  -- The clock and the chain are the database's, never the caller's. row_hash
  -- is NOT NULL with no default on purpose: it is always set here, and NOT
  -- NULL is checked after this trigger runs.
  new.created_at := clock_timestamp();
  select l.row_hash into new.prev_hash
    from public.agent_ledger l
   where l.user_id = new.user_id
   order by l.id desc
   limit 1;
  new.row_hash := encode(sha256(convert_to(public.agent_ledger_canonical(new), 'UTF8')), 'hex');
  return new;
end;
$$;

drop trigger if exists agent_ledger_seal on public.agent_ledger;
create trigger agent_ledger_seal
  before insert on public.agent_ledger
  for each row execute function public.agent_ledger_seal();

-- Immutable. The only way a row leaves is with the whole account: a delete
-- that arrives through the foreign-key cascade from auth.users runs at
-- trigger depth 2 (the cascade is itself a trigger). A direct delete, by any
-- role including the service role, runs at depth 1 and is refused.
create or replace function public.agent_ledger_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'agent_ledger is append-only: % is not allowed', tg_op;
end;
$$;

drop trigger if exists agent_ledger_no_update on public.agent_ledger;
create trigger agent_ledger_no_update
  before update on public.agent_ledger
  for each row execute function public.agent_ledger_immutable();
drop trigger if exists agent_ledger_no_delete on public.agent_ledger;
create trigger agent_ledger_no_delete
  before delete on public.agent_ledger
  for each row execute function public.agent_ledger_immutable();
drop trigger if exists agent_ledger_no_truncate on public.agent_ledger;
create trigger agent_ledger_no_truncate
  before truncate on public.agent_ledger
  for each statement execute function public.agent_ledger_immutable();

-- Re-walks the caller's chain. Returns the id of the first row whose hash or
-- link does not match, or null when the whole chain is intact.
create or replace function public.agent_ledger_verify()
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.agent_ledger;
  expected_prev text := null;
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  for r in select * from public.agent_ledger where user_id = uid order by id loop
    if r.prev_hash is distinct from expected_prev then
      return r.id;
    end if;
    if r.row_hash <> encode(sha256(convert_to(public.agent_ledger_canonical(r), 'UTF8')), 'hex') then
      return r.id;
    end if;
    expected_prev := r.row_hash;
  end loop;
  return null;
end;
$$;

-- The only way a signed-in user writes to the ledger. A user can record what
-- a user can know: that something was found, prepared, approved, declined or
-- done by hand. They cannot record that the agent executed something, and
-- they cannot record an autonomous (T3) action. Those come from the
-- execution functions.
create or replace function public.agent_ledger_append(
  p_action_id uuid,
  p_event text,
  p_capability_id text,
  p_what text,
  p_counterparty text default null,
  p_amount numeric default null,
  p_tier smallint default null,
  p_rail text default null,
  p_partner text default null,
  p_outcome text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_actor text;
  v_id bigint;
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  if p_event not in ('proposed', 'prepared', 'approved', 'declined', 'refused',
                     'held', 'user_reported') then
    raise exception 'event % cannot be recorded from the app', p_event;
  end if;
  if p_tier is not null and p_tier > 2 then
    raise exception 'an autonomous action cannot be recorded from the app';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'evidence must be a JSON object';
  end if;
  if pg_column_size(p_evidence) > 16384 then
    raise exception 'evidence is too large';
  end if;
  v_actor := case when p_event in ('approved', 'declined', 'user_reported') then 'user' else 'agent' end;
  insert into public.agent_ledger (
    user_id, action_id, event, capability_id, what, rail, partner, counterparty,
    amount, tier, actor, approver, outcome, evidence)
  values (
    uid, p_action_id, p_event, left(p_capability_id, 120), left(p_what, 500),
    left(p_rail, 120), left(p_partner, 120), left(p_counterparty, 200),
    p_amount, p_tier, v_actor,
    case when p_event = 'approved' then 'user' end,
    left(p_outcome, 500), p_evidence)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.agent_ledger_append(uuid, text, text, text, text, numeric, smallint, text, text, text, jsonb) from public, anon;
grant execute on function public.agent_ledger_append(uuid, text, text, text, text, numeric, smallint, text, text, text, jsonb) to authenticated;
revoke all on function public.agent_ledger_verify() from public, anon;
grant execute on function public.agent_ledger_verify() to authenticated;

-- Every settings change is itself a ledger event, written by the database so
-- it cannot be skipped. Stop and resume write their own richer events.
create or replace function public.agent_settings_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed jsonb := '{}'::jsonb;
begin
  if coalesce(current_setting('upmore.agent_stop_rpc', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    changed := jsonb_build_object('created', to_jsonb(new) - 'user_id' - 'updated_at');
  else
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
      into changed
      from jsonb_each(to_jsonb(new) - 'user_id' - 'updated_at') n
      join jsonb_each(to_jsonb(old) - 'user_id' - 'updated_at') o using (key)
     where n.value is distinct from o.value;
    if changed = '{}'::jsonb then
      return new;
    end if;
  end if;
  insert into public.agent_ledger (
    user_id, action_id, event, capability_id, what, tier, actor, evidence)
  values (
    new.user_id, gen_random_uuid(), 'settings_changed', 'settings',
    'You changed what the agent is allowed to do', 0, 'user', changed);
  return new;
end;
$$;

drop trigger if exists agent_settings_audit on public.agent_settings;
create trigger agent_settings_audit
  after insert or update on public.agent_settings
  for each row execute function public.agent_settings_audit();

-- ---------------------------------------------------------------------------
-- 3. agent_scheduled: actions waiting for a time (quiet hours, a due date).
-- ---------------------------------------------------------------------------
create table if not exists public.agent_scheduled (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null,
  capability_id text not null,
  what text not null,
  run_after timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'done', 'cancelled', 'failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists agent_scheduled_due_idx
  on public.agent_scheduled (status, run_after);
create index if not exists agent_scheduled_user_idx
  on public.agent_scheduled (user_id, created_at desc);

alter table public.agent_scheduled enable row level security;

drop policy if exists agent_scheduled_owner_select on public.agent_scheduled;
create policy agent_scheduled_owner_select on public.agent_scheduled
  for select using (auth.uid() = user_id);
-- A user may cancel their own scheduled action, and nothing else: they cannot
-- schedule one by hand or move one back to 'scheduled'.
drop policy if exists agent_scheduled_owner_cancel on public.agent_scheduled;
create policy agent_scheduled_owner_cancel on public.agent_scheduled
  for update using (auth.uid() = user_id and status = 'scheduled')
  with check (auth.uid() = user_id and status = 'cancelled');
revoke insert, delete on public.agent_scheduled from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. agent_findings: what the monitors noticed. One row per distinct finding;
--    seeing it again updates last_seen_at instead of adding a duplicate.
-- ---------------------------------------------------------------------------
create table if not exists public.agent_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null,
  kind text not null,
  capability_id text not null,
  title text not null,
  detail text,
  counterparty text,
  amount numeric,
  due_on date,
  -- The rows that prove it: transaction ids, dates and amounts.
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    check (status in ('open', 'dismissed', 'acted', 'expired')),
  source text not null default 'nightly' check (source in ('nightly', 'app')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists agent_findings_user_open_idx
  on public.agent_findings (user_id, status, last_seen_at desc);

alter table public.agent_findings enable row level security;

drop policy if exists agent_findings_owner_select on public.agent_findings;
create policy agent_findings_owner_select on public.agent_findings
  for select using (auth.uid() = user_id);
drop policy if exists agent_findings_owner_insert on public.agent_findings;
create policy agent_findings_owner_insert on public.agent_findings
  for insert with check (auth.uid() = user_id and source = 'app');
drop policy if exists agent_findings_owner_update on public.agent_findings;
create policy agent_findings_owner_update on public.agent_findings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. agent_cancel_watches: a cancellation is not "cancelled" until the next billing
--    date passes with no charge. One row per cancellation being watched.
-- ---------------------------------------------------------------------------
create table if not exists public.agent_cancel_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null,
  subscription_id uuid,
  merchant text not null,
  merchant_key text,
  amount numeric,
  billing_interval text,
  expected_billing_date date,
  -- expected_billing_date + 2 days. Nothing is confirmed before this.
  grace_until date,
  source text not null check (source in ('agent', 'user')),
  approval_id uuid references public.exec_approvals(id) on delete set null,
  run_id uuid references public.exec_runs(id) on delete set null,
  status text not null default 'watching'
    check (status in ('watching', 'confirmed', 'charged', 'unknown')),
  -- The charge that broke the claim, when there is one.
  charge_evidence jsonb,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agent_cancel_watches_watch_idx
  on public.agent_cancel_watches (status, grace_until);
create index if not exists agent_cancel_watches_user_idx
  on public.agent_cancel_watches (user_id, created_at desc);

alter table public.agent_cancel_watches enable row level security;

drop policy if exists agent_cancel_watches_owner_select on public.agent_cancel_watches;
create policy agent_cancel_watches_owner_select on public.agent_cancel_watches
  for select using (auth.uid() = user_id);
-- A user can record that they cancelled something by hand. They cannot mark
-- it confirmed: only the watcher can, after the billing date.
drop policy if exists agent_cancel_watches_owner_insert on public.agent_cancel_watches;
create policy agent_cancel_watches_owner_insert on public.agent_cancel_watches
  for insert with check (auth.uid() = user_id and source = 'user' and status = 'watching');
revoke update, delete on public.agent_cancel_watches from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. exec_approvals: keep exactly what the user saw when they approved.
-- ---------------------------------------------------------------------------
alter table public.exec_approvals add column if not exists approval_context jsonb;
alter table public.exec_approvals add column if not exists action_id uuid;

-- ---------------------------------------------------------------------------
-- 7. Stop everything / resume.
--    One transaction: either everything below happens or none of it does.
--    Returns what was stopped so the app can show it on one screen. Browser
--    sessions are killed by the agent-stop edge function using the session
--    ids returned here; the runs themselves are already marked failed, and
--    the executor re-checks the run before every step.
-- ---------------------------------------------------------------------------
create or replace function public.agent_stop_everything()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_was_stopped boolean;
  v_tiers jsonb;
  v_approvals int := 0;
  v_runs int := 0;
  v_sessions text[] := '{}';
  v_scheduled int := 0;
  v_logins text[] := '{}';
  v_login_errors text[] := '{}';
  v_autonomous text[] := '{}';
  r record;
  v_summary jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  perform set_config('upmore.agent_stop_rpc', 'on', true);

  insert into public.agent_settings (user_id) values (uid)
    on conflict (user_id) do nothing;
  select stopped_at is not null, tiers into v_was_stopped, v_tiers
    from public.agent_settings where user_id = uid for update;

  select coalesce(array_agg(key order by key), '{}') into v_autonomous
    from jsonb_each(coalesce(v_tiers, '{}'::jsonb)) where (value #>> '{}')::numeric = 3;

  update public.agent_settings
     set tiers_before_stop = case when v_was_stopped then tiers_before_stop else tiers end,
         tiers = '{}'::jsonb,
         stopped_at = coalesce(stopped_at, v_now)
   where user_id = uid;

  with hit as (
    update public.exec_approvals
       set status = 'cancelled', decided_at = v_now
     where user_id = uid and status in ('pending', 'approved', 'executing')
    returning 1)
  select count(*) into v_approvals from hit;

  with hit as (
    update public.exec_runs
       set status = 'failed', error = 'Stopped by you (Stop everything)', finished_at = v_now
     where user_id = uid and status in ('started', 'awaiting_otp')
    returning browserbase_session_id)
  select count(*), coalesce(array_agg(browserbase_session_id) filter (where browserbase_session_id is not null), '{}')
    into v_runs, v_sessions from hit;

  with hit as (
    update public.agent_scheduled
       set status = 'cancelled', finished_at = v_now
     where user_id = uid and status in ('scheduled', 'running')
    returning 1)
  select count(*) into v_scheduled from hit;

  -- Saved merchant logins are the agent's only way to act as the user.
  -- Read-only data connections (bank, brokerage) are not touched: T0 is See.
  for r in select merchant_key, vault_name, label from public.exec_credential_refs where user_id = uid loop
    begin
      if r.vault_name <> 'exec_cred_' || uid::text || '_' || r.merchant_key then
        raise exception 'saved login namespace does not match owner';
      end if;
      perform public.exec_vault_delete(r.vault_name);
      delete from public.exec_credential_refs where user_id = uid and merchant_key = r.merchant_key;
      v_logins := v_logins || coalesce(r.label, r.merchant_key);
    exception when others then
      v_login_errors := v_login_errors || coalesce(r.label, r.merchant_key);
    end;
  end loop;

  v_summary := jsonb_build_object(
    'stopped_at', (select stopped_at from public.agent_settings where user_id = uid),
    'already_stopped', v_was_stopped,
    'capabilities_set_to_see', true,
    'autonomous_capabilities_turned_off', to_jsonb(v_autonomous),
    'approvals_cancelled', v_approvals,
    'runs_stopped', v_runs,
    'scheduled_cancelled', v_scheduled,
    'logins_deleted', to_jsonb(v_logins),
    'logins_not_deleted', to_jsonb(v_login_errors),
    'ms', round(extract(epoch from (clock_timestamp() - v_now)) * 1000));

  insert into public.agent_ledger (
    user_id, action_id, event, capability_id, what, tier, actor, outcome, evidence)
  values (
    uid, gen_random_uuid(), 'stopped', 'stop_everything',
    'You stopped everything', 0, 'user',
    case when array_length(v_login_errors, 1) > 0
      then 'Stopped. Some saved logins could not be deleted.'
      else 'Stopped. The agent can look, and nothing else.' end,
    v_summary);

  -- Returned to the caller only; never written to the ledger.
  return v_summary || jsonb_build_object('browser_sessions', to_jsonb(v_sessions));
end;
$$;

-- Turning the agent back on never restores autonomy: every capability that
-- was at T3 comes back at T2 and has to be raised again on purpose.
create or replace function public.agent_resume()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_restored jsonb;
begin
  if uid is null then
    raise exception 'sign in required';
  end if;
  perform set_config('upmore.agent_stop_rpc', 'on', true);

  select coalesce(jsonb_object_agg(key, least((value #>> '{}')::numeric, 2)), '{}'::jsonb)
    into v_restored
    from public.agent_settings s, jsonb_each(coalesce(s.tiers_before_stop, '{}'::jsonb))
   where s.user_id = uid and s.stopped_at is not null;

  update public.agent_settings
     set tiers = coalesce(v_restored, '{}'::jsonb), tiers_before_stop = null, stopped_at = null
   where user_id = uid and stopped_at is not null;
  if not found then
    return jsonb_build_object('resumed', false, 'reason', 'The agent was not stopped.');
  end if;

  insert into public.agent_ledger (
    user_id, action_id, event, capability_id, what, tier, actor, outcome, evidence)
  values (
    uid, gen_random_uuid(), 'resumed', 'stop_everything',
    'You turned the agent back on', 2, 'user',
    'Every capability is back at Act on approval or lower. Nothing runs on its own until you turn that on again.',
    jsonb_build_object('tiers', v_restored));
  return jsonb_build_object('resumed', true, 'tiers', v_restored);
end;
$$;

revoke all on function public.agent_stop_everything() from public, anon;
grant execute on function public.agent_stop_everything() to authenticated;
revoke all on function public.agent_resume() from public, anon;
grant execute on function public.agent_resume() to authenticated;
