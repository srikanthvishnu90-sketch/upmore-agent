-- A dedicated message-turn function bundles the actual chat handler, so an
-- older deployed chat endpoint cannot ignore the idempotency protocol.
alter table public.agent_message_channels add column if not exists thread_id uuid references public.agent_threads(id) on delete set null;
alter table public.agent_message_inbox add column if not exists arrival_sequence bigint generated always as identity;
create table if not exists public.agent_message_turns (
  inbox_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null,
  source_hash text not null,
  lease_token uuid not null,
  state text not null default 'started' check(state in ('started','completed')),
  response jsonb, replies jsonb, http_status integer check(http_status between 200 and 599),
  created_at timestamptz not null default now(), completed_at timestamptz,
  foreign key(inbox_id,channel_id,user_id) references public.agent_message_inbox(id,channel_id,user_id) on delete cascade,
  check((state='started' and response is null and http_status is null) or
    (state='completed' and jsonb_typeof(response)='object' and http_status is not null))
);
alter table public.agent_message_turns enable row level security;
revoke all on public.agent_message_turns from anon,authenticated;
grant select on public.agent_message_turns to authenticated;
grant all on public.agent_message_turns to service_role;
drop policy if exists agent_message_turn_owner on public.agent_message_turns;
create policy agent_message_turn_owner on public.agent_message_turns for select using(auth.uid()=user_id);

create or replace function public.agent_message_source_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  if (to_jsonb(new)-'state'-'lease_token'-'lease_until'-'processed_at') is distinct from
     (to_jsonb(old)-'state'-'lease_token'-'lease_until'-'processed_at') then raise exception 'message source is immutable'; end if;
  return new;
end;
$$;
drop trigger if exists agent_message_source_guard on public.agent_message_inbox;
create trigger agent_message_source_guard before update on public.agent_message_inbox for each row execute function public.agent_message_source_guard();

create or replace function public.agent_message_turn_begin(p_inbox uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.agent_message_inbox; channel public.agent_message_channels; turn public.agent_message_turns;
begin
  select c.* into channel from public.agent_message_channels c join public.agent_message_inbox i on i.channel_id=c.id
    join public.agent_message_transports t on t.provider=c.provider and t.account_key=c.account_key
    where i.id=p_inbox for update of c for share of t;
  if not found then raise exception 'message unavailable'; end if;
  select * into item from public.agent_message_inbox where id=p_inbox for update;
  if p_lease is null or item.lease_token is distinct from p_lease then raise exception 'message lease unavailable'; end if;
  select * into turn from public.agent_message_turns where inbox_id=p_inbox;
  if found then
    if turn.lease_token<>p_lease or turn.source_hash<>item.source_hash then raise exception 'message source changed'; end if;
    return jsonb_build_object('ready',false,'state',turn.state,'response',turn.response,'http_status',turn.http_status);
  end if;
  if item.state<>'processing' or item.lease_until is null or item.lease_until<=now() or channel.status<>'active'
    or not exists(select 1 from public.agent_message_transports where provider=channel.provider and account_key=channel.account_key and enabled)
    then raise exception 'message processing unavailable'; end if;
  if channel.thread_id is not null and not exists(select 1 from public.agent_threads where id=channel.thread_id and user_id=item.user_id)
    then raise exception 'conversation owner mismatch'; end if;
  insert into public.agent_message_turns(inbox_id,user_id,channel_id,source_hash,lease_token)
    values(item.id,item.user_id,item.channel_id,item.source_hash,p_lease);
  return jsonb_build_object('ready',true,'state','started','context',jsonb_build_object(
    'user_id',item.user_id,'text',item.text,'kind',item.kind,'thread_id',channel.thread_id));
end;
$$;

create or replace function public.agent_message_turn_finish(p_inbox uuid,p_lease uuid,p_status integer,p_response jsonb,p_replies jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.agent_message_inbox; channel public.agent_message_channels; turn public.agent_message_turns;
  reply jsonb; n integer:=0; tid uuid; active boolean;
begin
  select c.* into channel from public.agent_message_channels c join public.agent_message_inbox i on i.channel_id=c.id
    join public.agent_message_transports t on t.provider=c.provider and t.account_key=c.account_key
    where i.id=p_inbox for update of c for share of t;
  if not found then raise exception 'message unavailable'; end if;
  select * into item from public.agent_message_inbox where id=p_inbox for update;
  select * into turn from public.agent_message_turns where inbox_id=p_inbox for update;
  if not found or p_lease is null or turn.lease_token is distinct from p_lease or item.lease_token is distinct from p_lease
    or turn.source_hash<>item.source_hash then raise exception 'message turn unavailable'; end if;
  if p_status is null or p_status not between 200 and 599 or jsonb_typeof(p_response) is distinct from 'object'
    or octet_length(p_response::text)>24000 or jsonb_typeof(p_replies) is distinct from 'array' or jsonb_array_length(p_replies) not between 1 and 4
    then raise exception 'invalid turn receipt'; end if;
  if turn.state='completed' then
    if turn.response is distinct from p_response or turn.replies is distinct from p_replies or turn.http_status<>p_status then raise exception 'conflicting turn receipt'; end if;
    return jsonb_build_object('ok',true,'duplicate',true,'state',item.state);
  end if;
  if item.state not in ('processing','uncertain') then raise exception 'message no longer processing'; end if;
  if p_status=200 and (jsonb_typeof(p_response->'reply') is distinct from 'string' or length(p_response->>'reply')=0)
    then raise exception 'reply receipt required'; end if;
  if p_status=200 and item.kind='message' and jsonb_typeof(p_response->'thread_id') is distinct from 'string'
    then raise exception 'conversation receipt required'; end if;
  if p_response->>'thread_id' is not null then
    tid:=(p_response->>'thread_id')::uuid;
    if not exists(select 1 from public.agent_threads where id=tid and user_id=item.user_id)
      then raise exception 'conversation owner mismatch'; end if;
    if channel.thread_id is not null and channel.thread_id<>tid then raise exception 'conversation changed'; end if;
    update public.agent_message_channels set thread_id=tid where id=channel.id;
  end if;
  active:=channel.status='active' and exists(select 1 from public.agent_message_transports where provider=channel.provider and account_key=channel.account_key and enabled);
  for reply in select value from jsonb_array_elements(p_replies) loop
    if jsonb_typeof(reply)<>'string' or length(reply#>>'{}') not between 1 and 4000 then raise exception 'invalid reply'; end if;
    if active then
      insert into public.agent_message_outbox(user_id,channel_id,inbox_id,ordinal,text) values(item.user_id,item.channel_id,item.id,n,reply#>>'{}');
    end if;
    n:=n+1;
  end loop;
  -- This durable receipt permits completion after the original lease expired.
  -- It never starts another brain call or repeats an external action.
  update public.agent_message_turns set state='completed',response=p_response,replies=p_replies,http_status=p_status,completed_at=now() where inbox_id=p_inbox;
  update public.agent_message_inbox set state=case when active then 'completed' else 'cancelled' end,processed_at=now() where id=p_inbox;
  return jsonb_build_object('ok',true,'duplicate',false,'state',case when active then 'completed' else 'cancelled' end);
end;
$$;
revoke all on function public.agent_message_turn_begin(uuid,uuid),public.agent_message_turn_finish(uuid,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.agent_message_turn_begin(uuid,uuid),public.agent_message_turn_finish(uuid,uuid,integer,jsonb,jsonb) to service_role;

-- Renew only when the dedicated endpoint provably never started a brain turn.
-- Its begin RPC locks the same inbox, so a delayed request with the old lease
-- cannot cross this boundary and execute after a new lease was issued.
create or replace function public.agent_message_retry_unstarted(p_inbox uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.agent_message_inbox;
begin
  perform 1 from public.agent_message_channels c join public.agent_message_inbox i on i.channel_id=c.id
    join public.agent_message_transports t on t.provider=c.provider and t.account_key=c.account_key
    where i.id=p_inbox and c.status='active' and t.enabled for update of c for share of t;
  if not found then return null; end if;
  select * into item from public.agent_message_inbox where id=p_inbox for update;
  if item.state not in ('processing','uncertain') or item.lease_until is null or item.lease_until>now()
    or exists(select 1 from public.agent_message_turns where inbox_id=p_inbox) then return null; end if;
  update public.agent_message_inbox set state='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds'
    where id=p_inbox returning * into item;
  return to_jsonb(item);
end;
$$;
create or replace function public.agent_message_queue_heads(p_limit integer default 5)
returns setof public.agent_message_inbox language plpgsql security definer set search_path=public as $$
begin
  if p_limit is null or p_limit not between 1 and 10 then raise exception 'invalid queue limit'; end if;
  return query with heads as (
    select distinct on(i.channel_id) i.* from public.agent_message_inbox i
    join public.agent_message_channels c on c.id=i.channel_id
    join public.agent_message_transports t on t.provider=c.provider and t.account_key=c.account_key
    where i.state in ('queued','processing','uncertain') and c.status='active' and t.enabled
    order by i.channel_id,i.arrival_sequence
  ) select h.* from heads h where h.state='queued' or
    (h.lease_until<=now() and not exists(select 1 from public.agent_message_turns where inbox_id=h.id))
    order by h.arrival_sequence limit p_limit;
end;
$$;
revoke all on function public.agent_message_retry_unstarted(uuid),public.agent_message_queue_heads(integer) from public,anon,authenticated;
grant execute on function public.agent_message_retry_unstarted(uuid),public.agent_message_queue_heads(integer) to service_role;
