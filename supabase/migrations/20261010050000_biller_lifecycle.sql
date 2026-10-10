-- Connection-scoped source revisions and explicit inferred-bill lifecycle.
create table if not exists public.agent_biller_connections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 provider_key text not null check(provider_key ~ '^[a-z0-9_-]{1,100}$'),
 provider_account_id text not null check(length(provider_account_id) between 1 and 160),
 status text not null default 'active' check(status in ('active','revoked','needs_reconnect')),
 capabilities jsonb not null default '{}' check(jsonb_typeof(capabilities)='object'),
 last_synced_at timestamptz, created_at timestamptz not null default now(),
 unique(user_id,provider_key,provider_account_id), unique(id,user_id)
);
create table if not exists public.agent_biller_records (
 connection_id uuid not null, user_id uuid not null, external_id text not null check(length(external_id) between 1 and 160),
 obligation_id uuid not null, source_version bigint not null check(source_version between 1 and 9007199254740991),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 primary key(connection_id,external_id), unique(obligation_id),
 foreign key(connection_id,user_id) references public.agent_biller_connections(id,user_id) on delete cascade,
 foreign key(obligation_id,user_id) references public.agent_obligations(id,user_id) on delete cascade
);
alter table public.agent_biller_connections enable row level security;
alter table public.agent_biller_records enable row level security;
drop policy if exists biller_connections_owner_read on public.agent_biller_connections;
create policy biller_connections_owner_read on public.agent_biller_connections for select using(auth.uid()=user_id);
drop policy if exists biller_records_owner_read on public.agent_biller_records;
create policy biller_records_owner_read on public.agent_biller_records for select using(auth.uid()=user_id);
revoke all on public.agent_biller_connections,public.agent_biller_records from anon,authenticated;
grant select on public.agent_biller_connections,public.agent_biller_records to authenticated;

create or replace function public.agent_biller_ingest(p_connection uuid,p_records jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.agent_biller_connections; r jsonb; o jsonb; existing public.agent_biller_records;
 oid uuid; stamp timestamptz; applied integer:=0; ignored integer:=0; sourcekey text;
begin
 select * into c from public.agent_biller_connections where id=p_connection for update;
 if not found or c.status<>'active' or c.capabilities->>'read_obligations' is distinct from 'true' then raise exception 'biller connection unavailable'; end if;
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>500 then raise exception 'invalid biller batch'; end if;
 for r in select value from jsonb_array_elements(p_records) loop
  o:=r->'obligation'; stamp:=(o->>'observed_at')::timestamptz;
  if o->>'source_type' is distinct from 'biller' or o->>'provider_key' is distinct from c.provider_key
   or o->>'provider_account_id' is distinct from c.provider_account_id or o->>'reference' is distinct from r->>'external_id'
   or stamp is null or stamp>now() or (r->>'source_version')::bigint<1 or r->>'source_hash' !~ '^[a-f0-9]{64}$' then raise exception 'invalid biller record'; end if;
  if o->>'status' in ('verified','partially_paid') and o->'evidence'->>'unpaid_confirmed' is distinct from 'true' then raise exception 'unpaid evidence required'; end if;
  if o->>'status'='settled' and coalesce(o->'evidence'->>'applied_reference','')='' then raise exception 'creditor application evidence required'; end if;
  select * into existing from public.agent_biller_records where connection_id=c.id and external_id=r->>'external_id';
  if found then
   if (r->>'source_version')::bigint<existing.source_version then ignored:=ignored+1;continue;end if;
   if (r->>'source_version')::bigint=existing.source_version then
    if r->>'source_hash'<>existing.source_hash then raise exception 'conflicting source revision';end if;
    ignored:=ignored+1;continue;
   end if;
   if stamp<(select observed_at from public.agent_obligations where id=existing.obligation_id) then raise exception 'source timestamp regressed';end if;
   oid:=existing.obligation_id;
  else
   sourcekey:='biller:'||encode(sha256(convert_to(c.id::text||':'||(r->>'external_id'),'UTF8')),'hex');
   insert into public.agent_obligations(user_id,source_key,creditor) values(c.user_id,sourcekey,o->>'creditor') returning id into oid;
  end if;
  -- No omission-based settlement. Only explicit source facts alter a bill.
  update public.agent_obligations set creditor=o->>'creditor',provider_key=c.provider_key,provider_account_id=c.provider_account_id,
   reference=r->>'external_id',kind=o->>'kind',direction=o->>'direction',currency=o->>'currency',
   amount_due_cents=(o->>'amount_due_cents')::bigint,minimum_due_cents=(o->>'minimum_due_cents')::bigint,
   balance_cents=(o->>'balance_cents')::bigint,due_on=(o->>'due_on')::date,status=o->>'status',source_type='biller',
   observed_at=stamp,funding_account_id=o->>'funding_account_id',autopay=o->>'autopay',biller_url=o->>'biller_url',evidence=o->'evidence'
   where id=oid;
  insert into public.agent_biller_records(connection_id,user_id,external_id,obligation_id,source_version,source_hash)
   values(c.id,c.user_id,r->>'external_id',oid,(r->>'source_version')::bigint,r->>'source_hash')
   on conflict(connection_id,external_id) do update set source_version=excluded.source_version,source_hash=excluded.source_hash;
  insert into public.agent_workflow_events(user_id,obligation_id,event,evidence)
   values(c.user_id,oid,'biller_refreshed',jsonb_build_object('connection_id',c.id,'source_version',r->'source_version'));
  applied:=applied+1;
 end loop;
 update public.agent_biller_connections set last_synced_at=now() where id=c.id;
 return jsonb_build_object('applied',applied,'ignored',ignored);
end;
$$;
revoke all on function public.agent_biller_ingest(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.agent_biller_ingest(uuid,jsonb) to service_role;

create or replace function public.agent_biller_revoke(p_connection uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.agent_biller_connections;
begin
 select * into c from public.agent_biller_connections where id=p_connection and user_id=auth.uid() for update;
 if not found then raise exception 'biller connection unavailable';end if;
 update public.agent_biller_connections set status='revoked' where id=c.id;
 update public.agent_workflow_tasks set state='cancelled',revoked_at=now(),updated_at=now()
  where state not in ('resolved','cancelled') and obligation_id in(select obligation_id from public.agent_biller_records where connection_id=c.id);
 -- Submitted attempts still need reconciliation; revocation cannot undo them.
 return jsonb_build_object('ok',true,'connection_id',c.id);
end;
$$;
revoke all on function public.agent_biller_revoke(uuid) from public,anon;
grant execute on function public.agent_biller_revoke(uuid) to authenticated;

create or replace function public.agent_obligation_dismiss_candidate(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.agent_obligations;
begin
 select * into o from public.agent_obligations where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'candidate unavailable';end if;
 if o.status='invalid' and o.evidence->>'dismissed_by_user'='true' then return to_jsonb(o);end if;
 if o.source_type<>'bank' or o.status<>'asserted' then raise exception 'only inferred candidates can be dismissed';end if;
 update public.agent_obligations set status='invalid',evidence=evidence||jsonb_build_object('dismissed_by_user',true,'dismissed_at',now())
  where id=o.id returning * into o;
 return to_jsonb(o);
end;
$$;
revoke all on function public.agent_obligation_dismiss_candidate(uuid) from public,anon;
grant execute on function public.agent_obligation_dismiss_candidate(uuid) to authenticated;

create or replace function public.agent_obligation_expire_candidates(p_user uuid,p_today date)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if p_today is null or abs(p_today-current_date)>1 then raise exception 'invalid current day';end if;
 update public.agent_obligations set status='invalid',evidence=evidence||jsonb_build_object('expired_inference',true,'expired_at',now())
  where user_id=p_user and source_type='bank' and status='asserted' and due_on<p_today;
 get diagnostics n=row_count;return n;
end;
$$;
revoke all on function public.agent_obligation_expire_candidates(uuid,date) from public,anon,authenticated;
grant execute on function public.agent_obligation_expire_candidates(uuid,date) to service_role;
