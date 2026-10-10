-- Mark outbound submission before network I/O. LoopMessage has documented
-- status lookup by provider ID, but no documented send idempotency key: a
-- timeout without an ID is uncertain and must not trigger another send.
create unique index if not exists agent_message_provider_receipt on public.agent_message_outbox(provider_message_id)
  where provider_message_id is not null;
create table if not exists public.agent_message_delivery_events (
  id bigint generated always as identity primary key,
  outbox_id uuid not null references public.agent_message_outbox(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null check (state in ('accepted','delivered','unknown','failed')),
  provider_message_id text, created_at timestamptz not null default now(),
  unique(outbox_id,state)
);
alter table public.agent_message_delivery_events enable row level security;
revoke all on public.agent_message_delivery_events from anon,authenticated;
grant select on public.agent_message_delivery_events to authenticated;
grant all on public.agent_message_delivery_events to service_role;
grant usage,select on sequence public.agent_message_delivery_events_id_seq to service_role;
drop policy if exists agent_message_delivery_owner on public.agent_message_delivery_events;
create policy agent_message_delivery_owner on public.agent_message_delivery_events for select using(auth.uid()=user_id);

create or replace function public.agent_message_begin_delivery(p_outbox uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.agent_message_outbox; channel public.agent_message_channels;
begin
  select c.* into channel from public.agent_message_channels c join public.agent_message_outbox o on o.channel_id=c.id
    join public.agent_message_transports t on t.provider=c.provider and t.account_key=c.account_key
    where o.id=p_outbox and c.status='active' and t.enabled for update of c for share of t;
  if not found then return null; end if;
  select * into item from public.agent_message_outbox where id=p_outbox for update;
  if item.state<>'queued' then return null; end if;
  if exists(select 1 from public.agent_message_outbox where inbox_id=item.inbox_id and ordinal<item.ordinal and state not in ('accepted','delivered'))
    then return null; end if;
  update public.agent_message_outbox set state='submitted',submitted_at=now() where id=p_outbox returning * into item;
  return jsonb_build_object('outbox',to_jsonb(item),'channel',to_jsonb(channel));
end;
$$;

create or replace function public.agent_message_delivery_result(p_outbox uuid,p_provider text,p_account text,p_contact text,p_state text,p_message text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.agent_message_outbox; channel public.agent_message_channels;
begin
  -- Original recipient survives disconnect so previously submitted messages
  -- can still be reconciled. A disconnected recipient cannot receive a new send.
  select c.* into channel from public.agent_message_channels c join public.agent_message_outbox o on o.channel_id=c.id
    where o.id=p_outbox for share of c;
  if not found or channel.provider is distinct from p_provider or channel.account_key is distinct from p_account
    or channel.contact is distinct from p_contact then raise exception 'message recipient mismatch'; end if;
  select * into item from public.agent_message_outbox where id=p_outbox for update;
  if item.state in ('queued','cancelled') or item.submitted_at is null then raise exception 'message was not submitted'; end if;
  if p_state is null or p_state not in ('accepted','delivered','unknown','failed') then raise exception 'invalid delivery state'; end if;
  if (p_message is not null and length(p_message) not between 1 and 200) or (p_state in ('accepted','delivered') and p_message is null)
    then raise exception 'provider message receipt required'; end if;
  if item.provider_message_id is not null and item.provider_message_id is distinct from p_message then raise exception 'provider message identity changed'; end if;
  if item.state='failed' and p_state in ('accepted','delivered') then raise exception 'conflicting final delivery receipt'; end if;
  insert into public.agent_message_delivery_events(outbox_id,user_id,state,provider_message_id)
    values(item.id,item.user_id,p_state,p_message) on conflict(outbox_id,state) do nothing;
  -- Delivery is terminal. Retain contradictory late events without erasing
  -- its receipt. Unknown lookup never downgrades a known provider acceptance.
  update public.agent_message_outbox set
    state=case when state='delivered' then state when p_state='unknown' and state in ('accepted','failed') then state else p_state end,
    provider_message_id=coalesce(provider_message_id,p_message),
    delivered_at=case when p_state='delivered' then coalesce(delivered_at,now()) else delivered_at end
    where id=p_outbox returning * into item;
  if p_state='failed' and item.state='failed' then
    update public.agent_message_outbox set state='cancelled' where inbox_id=item.inbox_id and ordinal>item.ordinal and state='queued';
  end if;
  return to_jsonb(item);
end;
$$;
revoke all on function public.agent_message_begin_delivery(uuid),public.agent_message_delivery_result(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.agent_message_begin_delivery(uuid),public.agent_message_delivery_result(uuid,text,text,text,text,text) to service_role;
