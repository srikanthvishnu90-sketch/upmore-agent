-- Durable, owner-bound message ingestion. Does not enable a transport or send
-- messages. Only a verified provider webhook may redeem an account-link code.
create table if not exists public.agent_message_transports (
  provider text not null check (provider = 'loopmessage'),
  account_key text not null check (account_key = 'upmore'),
  organization_id text not null check (length(organization_id) between 1 and 200),
  enabled boolean not null default false,
  primary key(provider,account_key)
);
create table if not exists public.agent_message_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null, account_key text not null,
  contact text not null check (length(contact) between 5 and 254),
  status text not null default 'active' check (status in ('active','revoked')),
  verified_at timestamptz not null default now(), revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(provider,account_key) references public.agent_message_transports,
  unique(provider,account_key,contact), unique(id,user_id)
);
create table if not exists public.agent_message_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null, account_key text not null,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null, redeemed_at timestamptz,
  channel_id uuid references public.agent_message_channels(id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key(provider,account_key) references public.agent_message_transports
);
create table if not exists public.agent_message_inbox (
  id uuid primary key default gen_random_uuid(),
  arrival_sequence bigint generated always as identity,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null,
  provider text not null, account_key text not null,
  provider_message_id text not null check (length(provider_message_id) between 1 and 200),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  text text not null check (length(text) between 1 and 4000),
  kind text not null default 'message' check (kind in ('message','account_link')),
  state text not null default 'queued' check (state in ('queued','processing','completed','uncertain','cancelled')),
  lease_token uuid, lease_until timestamptz, processed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(channel_id,user_id) references public.agent_message_channels(id,user_id) on delete cascade,
  unique(provider,account_key,provider_message_id), unique(id,channel_id,user_id)
);
create index if not exists agent_message_inbox_queue on public.agent_message_inbox(state,created_at,id);
create table if not exists public.agent_message_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null, inbox_id uuid not null,
  ordinal integer not null check (ordinal between 0 and 3),
  text text not null check (length(text) between 1 and 4000),
  state text not null default 'queued' check (state in ('queued','submitted','accepted','delivered','unknown','failed','cancelled')),
  provider_message_id text, submitted_at timestamptz, delivered_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(inbox_id,channel_id,user_id) references public.agent_message_inbox(id,channel_id,user_id) on delete cascade,
  unique(inbox_id,ordinal)
);

alter table public.agent_message_transports enable row level security;
alter table public.agent_message_channels enable row level security;
alter table public.agent_message_link_codes enable row level security;
alter table public.agent_message_inbox enable row level security;
alter table public.agent_message_outbox enable row level security;
revoke all on public.agent_message_transports,public.agent_message_link_codes from anon,authenticated;
revoke all on public.agent_message_channels,public.agent_message_inbox,public.agent_message_outbox from anon,authenticated;
grant select on public.agent_message_channels,public.agent_message_inbox,public.agent_message_outbox to authenticated;
grant all on public.agent_message_transports,public.agent_message_link_codes,public.agent_message_channels,
  public.agent_message_inbox,public.agent_message_outbox to service_role;
drop policy if exists agent_message_channels_owner on public.agent_message_channels;
create policy agent_message_channels_owner on public.agent_message_channels for select using (auth.uid()=user_id);
drop policy if exists agent_message_inbox_owner on public.agent_message_inbox;
create policy agent_message_inbox_owner on public.agent_message_inbox for select using (auth.uid()=user_id);
drop policy if exists agent_message_outbox_owner on public.agent_message_outbox;
create policy agent_message_outbox_owner on public.agent_message_outbox for select using (auth.uid()=user_id);

create or replace function public.agent_message_begin_link()
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); code text; link public.agent_message_link_codes;
begin
  if uid is null then raise exception 'sign in required'; end if;
  -- Serialize rate checking and expiry of older codes for this user.
  perform 1 from auth.users where id=uid for update;
  if not exists(select 1 from public.agent_message_transports where provider='loopmessage' and account_key='upmore' and enabled)
    then raise exception 'messaging transport unavailable'; end if;
  if (select count(*) from public.agent_message_link_codes where user_id=uid and created_at>now()-interval '1 hour') >= 5
    then raise exception 'too many link attempts'; end if;
  update public.agent_message_link_codes set expires_at=now() where user_id=uid and redeemed_at is null;
  code:=replace(gen_random_uuid()::text,'-','');
  insert into public.agent_message_link_codes(user_id,provider,account_key,code_hash,expires_at)
    values(uid,'loopmessage','upmore',encode(sha256(convert_to(code,'UTF8')),'hex'),now()+interval '10 minutes') returning * into link;
  return jsonb_build_object('ok',true,'command','CONNECT '||code,'expires_at',link.expires_at);
end;
$$;

-- Runs only after webhook authentication, provider organization validation and
-- canonical contact normalization in the edge handler. The caller cannot pick
-- a user; the one-time authenticated challenge supplies the owner.
create or replace function public.agent_message_ingest(p_provider text,p_account text,p_organization text,
  p_contact text,p_message text,p_hash text,p_text text,p_link_hash text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare channel public.agent_message_channels; link public.agent_message_link_codes;
  item public.agent_message_inbox; linked boolean:=false;
begin
  perform 1 from public.agent_message_transports where provider=p_provider and account_key=p_account
    and organization_id=p_organization and enabled for share;
  if not found then raise exception 'messaging transport unavailable'; end if;
  if p_contact is null or not (p_contact ~ '^\+[1-9][0-9]{7,14}$' or p_contact ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$')
    or length(p_contact)>254 or p_message is null or length(p_message) not between 1 and 200
    or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_text is null or length(p_text) not between 1 and 4000
    then raise exception 'invalid message'; end if;
  -- Serializes identity creation plus dedupe even for concurrent initial links.
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':'||p_account||':'||p_contact,0));
  select * into item from public.agent_message_inbox where provider=p_provider and account_key=p_account and provider_message_id=p_message;
  if found then
    if item.source_hash<>p_hash or not exists(select 1 from public.agent_message_channels where id=item.channel_id and contact=p_contact)
      then raise exception 'conflicting message identity'; end if;
    return jsonb_build_object('ok',true,'duplicate',true,'inbox_id',item.id,'state',item.state);
  end if;
  select * into channel from public.agent_message_channels where provider=p_provider and account_key=p_account and contact=p_contact for update;
  if p_link_hash is not null then
    select * into link from public.agent_message_link_codes where code_hash=p_link_hash and provider=p_provider and account_key=p_account for update;
    if not found or link.expires_at<=now() or link.redeemed_at is not null then raise exception 'link code unavailable'; end if;
    if channel.id is not null and channel.user_id<>link.user_id then raise exception 'contact already belongs to another account'; end if;
    if channel.id is null then
      insert into public.agent_message_channels(user_id,provider,account_key,contact) values(link.user_id,p_provider,p_account,p_contact) returning * into channel;
    else
      update public.agent_message_channels set status='active',revoked_at=null,verified_at=now() where id=channel.id returning * into channel;
    end if;
    update public.agent_message_link_codes set redeemed_at=now(),channel_id=channel.id where id=link.id;
    linked:=true;
  end if;
  if channel.id is null or channel.status<>'active' then return jsonb_build_object('ok',false,'state','needs_account_link'); end if;
  insert into public.agent_message_inbox(user_id,channel_id,provider,account_key,provider_message_id,source_hash,text,kind)
    values(channel.user_id,channel.id,p_provider,p_account,p_message,p_hash,case when linked then '[Account linked]' else p_text end,case when linked then 'account_link' else 'message' end)
    on conflict(provider,account_key,provider_message_id) do nothing returning * into item;
  if not found then
    select * into item from public.agent_message_inbox where provider=p_provider and account_key=p_account and provider_message_id=p_message;
    if item.source_hash<>p_hash or item.channel_id<>channel.id then raise exception 'conflicting message identity'; end if;
    return jsonb_build_object('ok',true,'duplicate',true,'inbox_id',item.id,'state',item.state);
  end if;
  return jsonb_build_object('ok',true,'duplicate',false,'inbox_id',item.id,'state',item.state,'linked',linked);
end;
$$;

create or replace function public.agent_message_revoke(p_channel uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'sign in required'; end if;
  perform 1 from public.agent_message_channels where id=p_channel and user_id=uid for update;
  if not found then raise exception 'channel unavailable'; end if;
  update public.agent_message_channels set status='revoked',revoked_at=coalesce(revoked_at,now()) where id=p_channel;
  update public.agent_message_inbox set state=case when state='queued' then 'cancelled' else 'uncertain' end
    where channel_id=p_channel and state in ('queued','processing');
  update public.agent_message_outbox set state='cancelled' where channel_id=p_channel and state='queued';
  -- Submitted messages retain their delivery state; revocation cannot unsend.
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.agent_message_claim(p_inbox uuid,p_seconds integer default 45)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.agent_message_inbox;
begin
  if p_seconds is null or p_seconds not between 5 and 120 then raise exception 'invalid lease duration'; end if;
  perform 1 from public.agent_message_channels c join public.agent_message_inbox i on i.channel_id=c.id
    join public.agent_message_transports t on t.provider=c.provider and t.account_key=c.account_key
    where i.id=p_inbox and c.status='active' and t.enabled for update of c for share of t;
  if not found then return null; end if;
  select * into item from public.agent_message_inbox where id=p_inbox for update;
  if item.state='processing' and item.lease_until<=now() then
    -- Without an idempotent brain, re-running a crashed financial turn is not
    -- safe. Retain it for recovery instead of issuing the action twice.
    update public.agent_message_inbox set state='uncertain' where id=p_inbox;
    return null;
  end if;
  if item.state<>'queued' then return null; end if;
  if exists(select 1 from public.agent_message_inbox where channel_id=item.channel_id and id<>item.id and state in ('processing','uncertain')) then return null; end if;
  if exists(select 1 from public.agent_message_inbox where channel_id=item.channel_id and state='queued' and arrival_sequence<item.arrival_sequence) then return null; end if;
  update public.agent_message_inbox set state='processing',lease_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>p_seconds)
    where id=p_inbox returning * into item;
  return to_jsonb(item);
end;
$$;

create or replace function public.agent_message_complete(p_inbox uuid,p_lease uuid,p_replies jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.agent_message_inbox; reply jsonb; n integer:=0;
begin
  perform 1 from public.agent_message_channels c join public.agent_message_inbox i on i.channel_id=c.id
    join public.agent_message_transports t on t.provider=c.provider and t.account_key=c.account_key
    where i.id=p_inbox and c.status='active' and t.enabled for share of c,t;
  if not found then raise exception 'channel unavailable'; end if;
  select * into item from public.agent_message_inbox where id=p_inbox for update;
  if not found or p_lease is null or item.lease_token is distinct from p_lease then raise exception 'message lease unavailable'; end if;
  if jsonb_typeof(p_replies) is distinct from 'array' or jsonb_array_length(p_replies) not between 1 and 4 then raise exception 'invalid replies'; end if;
  if item.state='completed' then
    if (select jsonb_agg(text order by ordinal) from public.agent_message_outbox where inbox_id=p_inbox) is distinct from p_replies
      then raise exception 'conflicting replies'; end if;
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;
  if item.state<>'processing' or item.lease_until<=now() then raise exception 'message lease unavailable'; end if;
  for reply in select value from jsonb_array_elements(p_replies) loop
    if jsonb_typeof(reply)<>'string' or length(reply#>>'{}') not between 1 and 4000 then raise exception 'invalid reply'; end if;
    insert into public.agent_message_outbox(user_id,channel_id,inbox_id,ordinal,text) values(item.user_id,item.channel_id,item.id,n,reply#>>'{}');
    n:=n+1;
  end loop;
  update public.agent_message_inbox set state='completed',processed_at=now() where id=p_inbox;
  return jsonb_build_object('ok',true,'duplicate',false,'replies',n);
end;
$$;

revoke all on function public.agent_message_begin_link(),public.agent_message_revoke(uuid) from public,anon;
grant execute on function public.agent_message_begin_link(),public.agent_message_revoke(uuid) to authenticated;
revoke all on function public.agent_message_ingest(text,text,text,text,text,text,text,text),
  public.agent_message_claim(uuid,integer),public.agent_message_complete(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.agent_message_ingest(text,text,text,text,text,text,text,text),
  public.agent_message_claim(uuid,integer),public.agent_message_complete(uuid,uuid,jsonb) to service_role;
