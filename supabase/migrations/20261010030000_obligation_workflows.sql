-- Server-owned obligations and durable plans. Authenticated users read only
-- their records; writes go through authenticated edge handlers and checked
-- service RPCs. No migration enables a payment rail.
create table if not exists public.agent_obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null check (length(source_key) between 1 and 200),
  creditor text not null check (length(creditor) between 1 and 160),
  provider_key text, provider_account_id text, reference text,
  kind text not null default 'other' check (kind in ('rent','utility','installment','credit','tax','medical','invoice','insurance','informal','other')),
  direction text not null default 'payable' check (direction in ('payable','receivable')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  amount_due_cents bigint check (amount_due_cents between 0 and 9007199254740991),
  minimum_due_cents bigint check (minimum_due_cents between 0 and 9007199254740991),
  balance_cents bigint check (balance_cents between 0 and 9007199254740991),
  due_on date, status text not null default 'asserted'
    check (status in ('asserted','verified','disputed','partially_paid','settled','waived','invalid')),
  source_type text not null default 'user' check (source_type in ('user','biller','document','email','bank')),
  observed_at timestamptz not null default now(), funding_account_id text,
  autopay text not null default 'unknown' check (autopay in ('on','off','unknown')),
  biller_url text, evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 20000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, source_key), unique (id, user_id)
);
create index if not exists agent_obligations_due_idx on public.agent_obligations(user_id, due_on, id);

create table if not exists public.agent_workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  obligation_id uuid not null, obligation_revision integer not null,
  state text not null check (state in ('needs_information','needs_review','needs_sync','needs_connection','blocked','monitoring','resolved','awaiting_approval','authorized','cancelled')),
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  snapshot_hash text,
  approved_snapshot jsonb, approved_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (obligation_id, user_id) references public.agent_obligations(id,user_id) on delete cascade,
  unique (user_id, obligation_id, obligation_revision), unique(id,obligation_id,user_id)
);

create table if not exists public.agent_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  obligation_id uuid not null,
  idempotency_key text not null unique,
  adapter_id text not null, provider_payment_id text,
  amount_cents bigint not null check (amount_cents between 1 and 9007199254740991),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('reserved','submitted','processing','settled','applied','unknown','failed','returned','cancelled')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (obligation_id,user_id) references public.agent_obligations(id,user_id) on delete cascade,
  foreign key (task_id,obligation_id,user_id) references public.agent_workflow_tasks(id,obligation_id,user_id) on delete cascade
);
create unique index if not exists agent_one_open_payment_idx on public.agent_payment_attempts(obligation_id)
  where status in ('reserved','submitted','processing','settled','unknown');

create table if not exists public.agent_workflow_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  obligation_id uuid, task_id uuid, event text not null,
  evidence jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

alter table public.agent_obligations enable row level security;
alter table public.agent_workflow_tasks enable row level security;
alter table public.agent_payment_attempts enable row level security;
alter table public.agent_workflow_events enable row level security;
drop policy if exists agent_obligations_owner_read on public.agent_obligations;
create policy agent_obligations_owner_read on public.agent_obligations for select using (auth.uid() = user_id);
drop policy if exists agent_workflows_owner_read on public.agent_workflow_tasks;
create policy agent_workflows_owner_read on public.agent_workflow_tasks for select using (auth.uid() = user_id);
drop policy if exists agent_attempts_owner_read on public.agent_payment_attempts;
create policy agent_attempts_owner_read on public.agent_payment_attempts for select using (auth.uid() = user_id);
drop policy if exists agent_workflow_events_owner_read on public.agent_workflow_events;
create policy agent_workflow_events_owner_read on public.agent_workflow_events for select using (auth.uid() = user_id);
revoke insert,update,delete on public.agent_obligations, public.agent_workflow_tasks,
  public.agent_payment_attempts,public.agent_workflow_events from anon,authenticated;
grant select on public.agent_obligations, public.agent_workflow_tasks,
  public.agent_payment_attempts,public.agent_workflow_events to authenticated;

create or replace function public.agent_obligation_revision_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.user_id <> old.user_id or new.id <> old.id or new.source_key <> old.source_key then
    raise exception 'obligation identity is immutable';
  end if;
  if (to_jsonb(new) - 'revision' - 'created_at' - 'updated_at') is distinct from
     (to_jsonb(old) - 'revision' - 'created_at' - 'updated_at') then
    new.revision := old.revision + 1;
    update public.agent_workflow_tasks set state = 'cancelled', revoked_at = now(), updated_at = now()
      where obligation_id = old.id and state <> 'cancelled';
  else
    new.revision := old.revision;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists agent_obligation_revision_guard on public.agent_obligations;
create trigger agent_obligation_revision_guard before update on public.agent_obligations
  for each row execute function public.agent_obligation_revision_guard();

-- Approval is task-specific, short-lived and bound to the server's snapshot.
-- Serializes with changes to obligation/settings; repeat approval is harmless.
create or replace function public.agent_workflow_approve(p_task uuid, p_snapshot_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); task public.agent_workflow_tasks; rev integer; stopped timestamptz;
begin
  if uid is null then raise exception 'sign in required'; end if;
  select stopped_at into stopped from public.agent_settings where user_id = uid for update;
  if not found or stopped is not null then raise exception 'agent stopped or settings missing'; end if;
  -- Lock order is settings, obligation, task, consistent with planning/stop.
  select o.revision into rev from public.agent_obligations o
    join public.agent_workflow_tasks t on t.obligation_id = o.id
    where t.id = p_task and t.user_id = uid for update of o;
  if not found then raise exception 'task unavailable'; end if;
  select * into task from public.agent_workflow_tasks where id = p_task and user_id = uid for update;
  if task.obligation_revision <> rev or task.revoked_at is not null then raise exception 'proposal changed'; end if;
  if task.state not in ('awaiting_approval','authorized') or task.plan->'proposal' is null
    or task.plan->'proposal' = 'null'::jsonb then raise exception 'task is not executable'; end if;
  if p_snapshot_hash is null or task.snapshot_hash is distinct from p_snapshot_hash then raise exception 'proposal changed'; end if;
  if (task.plan->'proposal'->>'expires_at')::timestamptz <= now() then raise exception 'proposal expired'; end if;
  if task.state = 'authorized' then return jsonb_build_object('ok',true,'task_id',task.id,'state',task.state); end if;
  update public.agent_workflow_tasks set state='authorized', approved_at=now(),
    approved_snapshot=plan->'proposal', updated_at=now() where id=task.id;
  insert into public.agent_workflow_events(user_id,obligation_id,task_id,event,evidence)
    values(uid,task.obligation_id,task.id,'approved',jsonb_build_object('snapshot_hash',task.snapshot_hash));
  return jsonb_build_object('ok',true,'task_id',task.id,'state','authorized');
end;
$$;
revoke all on function public.agent_workflow_approve(uuid,text) from public,anon;
grant execute on function public.agent_workflow_approve(uuid,text) to authenticated;

create or replace function public.agent_workflow_stop_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stopped_at is not null and old.stopped_at is null then
    update public.agent_workflow_tasks set state='cancelled', revoked_at=now(),updated_at=now()
      where user_id=new.user_id and state not in ('resolved','cancelled');
    update public.agent_payment_attempts set status='cancelled',updated_at=now()
      where user_id=new.user_id and status='reserved';
    -- Submitted payments still need reconciliation; never pretend they were canceled.
  end if;
  return new;
end;
$$;
drop trigger if exists agent_workflow_stop_guard on public.agent_settings;
create trigger agent_workflow_stop_guard after update on public.agent_settings
  for each row execute function public.agent_workflow_stop_guard();

create or replace function public.agent_workflow_store_plan(p_user uuid,p_obligation uuid,p_revision integer,p_plan jsonb,p_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rev integer; task public.agent_workflow_tasks; stopped timestamptz;
begin
  select stopped_at into stopped from public.agent_settings where user_id=p_user for update;
  if not found then raise exception 'settings missing'; end if;
  select revision into rev from public.agent_obligations where id=p_obligation and user_id=p_user for update;
  if not found or rev <> p_revision then raise exception 'obligation changed'; end if;
  if p_plan->>'obligation_id' is distinct from p_obligation::text or (p_plan->>'obligation_revision')::integer is distinct from rev then
    raise exception 'plan identity mismatch';
  end if;
  if stopped is not null then
    p_plan := p_plan || jsonb_build_object('state','blocked','code','agent_stopped','message','The agent is stopped.','proposal',null);
    p_hash := null;
  end if;
  select * into task from public.agent_workflow_tasks
    where user_id=p_user and obligation_id=p_obligation and obligation_revision=rev for update;
  if found and task.state in ('authorized','cancelled') then return to_jsonb(task); end if;
  insert into public.agent_workflow_tasks(user_id,obligation_id,obligation_revision,state,plan,snapshot_hash)
    values(p_user,p_obligation,rev,p_plan->>'state',p_plan,p_hash)
    on conflict(user_id,obligation_id,obligation_revision) do update
    set state=excluded.state,plan=excluded.plan,snapshot_hash=excluded.snapshot_hash,updated_at=now()
    returning * into task;
  insert into public.agent_workflow_events(user_id,obligation_id,task_id,event,evidence)
    values(p_user,p_obligation,task.id,'planned',jsonb_build_object('state',task.state,'code',p_plan->>'code'));
  return to_jsonb(task);
end;
$$;
revoke all on function public.agent_workflow_store_plan(uuid,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.agent_workflow_store_plan(uuid,uuid,integer,jsonb,text) to service_role;

create table if not exists public.agent_workflow_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null, requests integer not null check(requests between 1 and 120)
);
alter table public.agent_workflow_rate_limits enable row level security;
revoke all on public.agent_workflow_rate_limits from anon,authenticated;
create or replace function public.agent_workflow_rate_bump()
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); hit uuid; win timestamptz := date_trunc('hour',now());
begin
  if uid is null then raise exception 'sign in required'; end if;
  insert into public.agent_workflow_rate_limits(user_id,window_start,requests) values(uid,win,1)
    on conflict(user_id) do update set window_start=win,
      requests=case when agent_workflow_rate_limits.window_start < win then 1 else agent_workflow_rate_limits.requests+1 end
    where agent_workflow_rate_limits.window_start < win or agent_workflow_rate_limits.requests < 120
    returning user_id into hit;
  return hit is not null;
end;
$$;
revoke all on function public.agent_workflow_rate_bump() from public,anon;
grant execute on function public.agent_workflow_rate_bump() to authenticated;
