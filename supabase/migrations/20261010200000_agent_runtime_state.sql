-- Notification budget / pause memory only. This store contains no financial
-- consent, approvals, proposals or execution authority.
create table if not exists public.agent_runtime_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  version integer not null check(version between 1 and 2147483647),
  state jsonb not null check(jsonb_typeof(state)='object' and octet_length(state::text)<=8192),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(user_id,thread_id),
  unique(thread_id)
);
alter table public.agent_runtime_states enable row level security;
revoke all on public.agent_runtime_states from public,anon,authenticated,service_role;
grant select on public.agent_runtime_states to authenticated;
drop policy if exists agent_runtime_state_owner on public.agent_runtime_states;
create policy agent_runtime_state_owner on public.agent_runtime_states for select to authenticated using(auth.uid()=user_id);

-- Called only by the two restricted RPCs. SET ROLE is supplied by PostgREST,
-- not by JSON, a model, or a JWT subject interpreted as a worker override.
-- Lock order matches message begin/finish/revoke: channel, transport, inbox,
-- turn, then thread. Holding those locks closes queued-revocation races.
create or replace function public.agent_runtime_state_owner(p_thread uuid,p_inbox uuid,p_lease uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare caller text:=current_setting('role',true); owner uuid;
  channel public.agent_message_channels; item public.agent_message_inbox; turn public.agent_message_turns;
begin
  if p_thread is null then raise exception 'runtime thread required'; end if;
  if caller='authenticated' then
    if p_inbox is not null or p_lease is not null then raise exception 'runtime worker context forbidden'; end if;
    owner:=auth.uid();
    if owner is null then raise exception 'runtime authentication required'; end if;
  elsif caller='service_role' then
    if p_inbox is null or p_lease is null then raise exception 'runtime worker context required'; end if;
    select c.* into channel from public.agent_message_channels c
      join public.agent_message_inbox i on i.channel_id=c.id
      join public.agent_message_transports t on t.provider=c.provider and t.account_key=c.account_key
      where i.id=p_inbox and c.status='active' and t.enabled
      for update of c for share of t;
    if not found then raise exception 'runtime channel unavailable'; end if;
    select * into item from public.agent_message_inbox where id=p_inbox for update;
    if item.state<>'processing' or item.lease_token is distinct from p_lease or item.lease_until is null
      or item.lease_until<=clock_timestamp() or item.user_id<>channel.user_id
      then raise exception 'runtime lease unavailable'; end if;
    select * into turn from public.agent_message_turns where inbox_id=p_inbox for update;
    if not found or turn.state<>'started' or turn.lease_token is distinct from p_lease
      or turn.source_hash is distinct from item.source_hash or turn.user_id<>item.user_id or turn.channel_id<>channel.id
      then raise exception 'runtime turn unavailable'; end if;
    if channel.thread_id is not null and channel.thread_id<>p_thread then raise exception 'runtime conversation changed'; end if;
    owner:=item.user_id;
  else
    raise exception 'runtime authentication required';
  end if;
  -- Serialize both first-save CAS and later updates, even without a state row.
  perform 1 from public.agent_threads where id=p_thread and user_id=owner for update;
  if not found then raise exception 'runtime conversation owner mismatch'; end if;
  -- Lock waits must not let an expired processing lease cross the boundary.
  if caller='service_role' and item.lease_until<=clock_timestamp() then raise exception 'runtime lease unavailable'; end if;
  return owner;
end;
$$;
revoke all on function public.agent_runtime_state_owner(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.agent_runtime_state_read(p_thread uuid,p_inbox uuid default null,p_lease uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner uuid; stored public.agent_runtime_states;
begin
  owner:=public.agent_runtime_state_owner(p_thread,p_inbox,p_lease);
  select * into stored from public.agent_runtime_states where user_id=owner and thread_id=p_thread;
  return jsonb_build_object('user_id',owner,'thread_id',p_thread,'version',coalesce(stored.version,0),
    'state',coalesce(stored.state,'{"paused":false,"sent":[]}'::jsonb));
end;
$$;

create or replace function public.agent_runtime_state_save(p_thread uuid,p_expected_version integer,p_state jsonb,p_inbox uuid default null,p_lease uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner uuid; stored public.agent_runtime_states; stamp jsonb; epoch numeric; previous numeric:=-1;
begin
  if p_expected_version is null or p_expected_version not between 0 and 2147483646 then raise exception 'invalid runtime version'; end if;
  if jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text)>8192 then raise exception 'invalid runtime state'; end if;
  if (select count(*) from jsonb_object_keys(p_state))<>2
    or jsonb_typeof(p_state->'paused') is distinct from 'boolean'
    or jsonb_typeof(p_state->'sent') is distinct from 'array' then raise exception 'invalid runtime state'; end if;
  if jsonb_array_length(p_state->'sent')>32 then raise exception 'invalid runtime sent history'; end if;
  for stamp in select value from jsonb_array_elements(p_state->'sent') loop
    if jsonb_typeof(stamp) is distinct from 'number' then raise exception 'invalid runtime sent history'; end if;
    epoch:=(stamp#>>'{}')::numeric;
    if epoch<0 or epoch<previous or epoch>extract(epoch from clock_timestamp())*1000 then raise exception 'invalid runtime sent history'; end if;
    previous:=epoch;
  end loop;
  owner:=public.agent_runtime_state_owner(p_thread,p_inbox,p_lease);
  select * into stored from public.agent_runtime_states where user_id=owner and thread_id=p_thread;
  if coalesce(stored.version,0)<>p_expected_version then raise exception 'runtime state changed'; end if;
  insert into public.agent_runtime_states(user_id,thread_id,version,state)
    values(owner,p_thread,p_expected_version+1,p_state)
    on conflict(user_id,thread_id) do update set version=excluded.version,state=excluded.state,updated_at=clock_timestamp();
  return jsonb_build_object('user_id',owner,'thread_id',p_thread,'version',p_expected_version+1,'state',p_state);
end;
$$;
revoke all on function public.agent_runtime_state_read(uuid,uuid,uuid),public.agent_runtime_state_save(uuid,integer,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.agent_runtime_state_read(uuid,uuid,uuid),public.agent_runtime_state_save(uuid,integer,jsonb,uuid,uuid) to authenticated,service_role;
