-- Career watch KV (Mega Task 2 alerts product, MI-032 step 3 of 5).
-- Prepared by Crew A (MI-032 step 2, branch work/crewa-mi032-host) for the OWNER to run.
-- NOT applied by any agent lane: migrations to the live project are the owner's step.
-- Proposed reliability extension adds tables/RPCs; existing table definitions are unchanged.
--
-- Purpose: the durable per-user store behind the alerts host wiring
-- (docs/career/alerts-host-wiring.md §1). Modules 151 (watch) and 152 (assign)
-- hold per-user state in an injected {get,set} KV store; the deployed adapter
-- (createSupabaseStore in scripts/career/alerts-host.mjs) targets this table
-- behind that same interface. Watch state is per USER, not per thread, so it
-- does not belong inside agent_flow_state's per-thread rows.
--
-- Module 152 keys are preserved; the host extension also stores account
-- revision/privacy metadata and per-thread request receipts:
--   career:watch-profile:<user_id>                    (152 PROFILE_KEY)
--   career:reminder-queue:<user_id>                   (152 QUEUE_KEY)
--   career:reminder-history:<user_id>                 (152 HISTORY_KEY)
--   career:jobs:snapshot:board:<source>:<token>:<user_id>  (host, 151 scheme + user suffix)
--   career:delivery-ledger:<user_id>                   (confirmed owned inbox records)
--   career:account                                    (owner controls, version, privacy epoch)
--   career:turn:<thread_id>:<request_key>                (idempotent reply receipt)
--
-- RLS has a service-role-only policy and no anon/authenticated policies: only the backend
-- (scheduler/host) reads and writes, with the service role, which bypasses
-- RLS. No client reads in v1 (design note §1).

create table if not exists public.career_watch_kv (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

comment on table public.career_watch_kv is 'MI-032 alerts host wiring: generic per-user KV for the career watch/assign state (152 watch profiles, reminder queues, seat history; 151 per-board snapshots; host delivery ledger). Written/read by scripts/career/alerts-host.mjs createSupabaseStore via the service role. Design: docs/career/alerts-host-wiring.md.';

alter table public.career_watch_kv enable row level security;

-- Proposed host reliability extension. OWNER-RUN; never applied by this lane
-- to production. Keep the existing Muse profile/snapshot format.
revoke all on public.career_watch_kv from public, anon, authenticated;
grant select, insert, update, delete on public.career_watch_kv to service_role;
create policy career_watch_backend on public.career_watch_kv for all to service_role using (true) with check (true);

create table public.career_reminder_outbox (
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_id text not null check(length(reminder_id) between 1 and 200),
  payload jsonb,
  record jsonb,
  status text not null default 'pending' check(status in ('pending','claimed','uncertain','delivered','cancelled')),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  seen_at timestamptz,
  primary key(user_id,reminder_id)
);
alter table public.career_reminder_outbox enable row level security;
revoke all on public.career_reminder_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.career_reminder_outbox to service_role;
create policy career_reminder_backend on public.career_reminder_outbox for all to service_role using(true) with check(true);
create index career_reminder_unseen on public.career_reminder_outbox(user_id,delivered_at) where status='delivered' and seen_at is null;

-- SECURITY INVOKER + explicit service-role-only execute grants below. User
-- identity is supplied by the authenticated backend, never by a client body.
create function public.career_host_load(p_user uuid,p_thread uuid,p_key text,p_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare f jsonb; a jsonb; r jsonb; w jsonb; legacy_count integer; reminders jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_user is null or p_thread is null or p_key is null or p_hash is null or p_key !~ '^[A-Za-z0-9_-]{1,128}$' or p_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','invalid_turn_key');end if;
 if exists(select 1 from agent_flow_state where thread_id=p_thread and user_id is distinct from p_user) or not exists(select 1 from agent_threads where id=p_thread and user_id=p_user) then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 a:=coalesce(a,'{"version":0,"epoch":0}'::jsonb);
 select value into r from career_watch_kv where user_id=p_user and key='career:turn:'||p_thread||':'||p_key;
 if r is not null then
  if r->>'hash'<>p_hash then return jsonb_build_object('error','turn_key_conflict');end if;
  if coalesce((r->>'epoch')::bigint,0)<>coalesce((a->>'epoch')::bigint,0) or r->'response' is null or r->'response'='null'::jsonb then return jsonb_build_object('error','privacy_epoch_changed');end if;
  return jsonb_build_object('replay',r->'response');
 end if;
 select state->'career' into f from agent_flow_state where thread_id=p_thread and user_id=p_user;
 select value into w from career_watch_kv where user_id=p_user and key='career:watch-profile:'||p_user;
 if w is null and coalesce((a->>'epoch')::bigint,0)=0 then
  select count(distinct state#>array['career','stores','alertWatchState','career:watch-profile:'||p_user]) into legacy_count
   from agent_flow_state where user_id=p_user and state#>>array['career','stores','alertWatchState','career:watch-profile:'||p_user,'user_id']=p_user::text;
  if legacy_count>1 then return jsonb_build_object('error','watch_profile_conflict');end if;
  select state#>array['career','stores','alertWatchState','career:watch-profile:'||p_user] into w from agent_flow_state
   where user_id=p_user and state#>>array['career','stores','alertWatchState','career:watch-profile:'||p_user,'user_id']=p_user::text limit 1;
 end if;
 if w is not null and w->>'user_id' is distinct from p_user::text then return jsonb_build_object('error','watch_profile_conflict');end if;
 select coalesce(jsonb_agg(record),'[]'::jsonb) into reminders from (select record from career_reminder_outbox where user_id=p_user and status='delivered' and seen_at is null order by delivered_at,reminder_id limit 5) q;
 return jsonb_build_object('snapshot',f,'revision',coalesce((f->>'revision')::bigint,0),'accountVersion',coalesce((a->>'version')::bigint,0),'account',a,
  'watchState',case when w is null then '{}'::jsonb else jsonb_build_object('career:watch-profile:'||p_user,w) end,'reminders',reminders);
end $$;

create function public.career_host_commit(p_user uuid,p_thread uuid,p_key text,p_hash text,p_revision bigint,p_account_version bigint,p_snapshot jsonb,p_patch jsonb,p_input text,p_response jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb; old_snapshot jsonb; receipt jsonb; wp jsonb; epoch bigint; next_snapshot jsonb; patch_key text;
begin
 if p_user is null or p_thread is null or p_key is null or p_hash is null or p_key !~ '^[A-Za-z0-9_-]{1,128}$' or p_hash !~ '^[a-f0-9]{64}$' or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or octet_length(p_snapshot::text)>1048576
  or p_input is null or length(p_input)>20000 or p_response is null or jsonb_typeof(p_response->'reply') is distinct from 'string' or octet_length(p_response::text)>1048576 or jsonb_typeof(coalesce(p_patch,'{}'::jsonb))<>'object' or p_snapshot#>>'{scope,userId}' is distinct from p_user::text or jsonb_typeof(p_response)<>'object' or p_response->>'thread_id' is distinct from p_thread::text then raise exception 'invalid host commit';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 perform 1 from agent_threads where id=p_thread and user_id=p_user for update;
 if not found or exists(select 1 from agent_flow_state where thread_id=p_thread and user_id is distinct from p_user) then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';a:=coalesce(a,'{"version":0,"epoch":0}'::jsonb);epoch:=coalesce((a->>'epoch')::bigint,0);
 select value into receipt from career_watch_kv where user_id=p_user and key='career:turn:'||p_thread||':'||p_key;
 if receipt is not null then
  if receipt->>'hash'<>p_hash then return jsonb_build_object('error','turn_key_conflict');end if;
  if coalesce((receipt->>'epoch')::bigint,0)<>epoch or (receipt->'response' is null or receipt->'response'='null'::jsonb) then return jsonb_build_object('error','privacy_epoch_changed');end if;
  return jsonb_build_object('response',receipt->'response','replay',true);
 end if;
 if coalesce((a->>'version')::bigint,0)<>p_account_version then return jsonb_build_object('error','revision_conflict');end if;
 select state->'career' into old_snapshot from agent_flow_state where thread_id=p_thread and user_id=p_user for update;
 if coalesce((old_snapshot->>'revision')::bigint,0)<>p_revision then return jsonb_build_object('error','revision_conflict');end if;
 for patch_key in select jsonb_object_keys(coalesce(p_patch,'{}'::jsonb)) loop
  if patch_key not in ('paused','preferred_locations','erase') then raise exception 'invalid account patch';end if;
 end loop;
 if p_patch ? 'preferred_locations' and (jsonb_typeof(p_patch->'preferred_locations')<>'array' or jsonb_array_length(p_patch->'preferred_locations')<>1 or length(p_patch#>>'{preferred_locations,0}') not between 1 and 100) then raise exception 'invalid location';end if;
 if p_patch ? 'paused' and jsonb_typeof(p_patch->'paused')<>'boolean' then raise exception 'invalid pause';end if;
 if p_patch ? 'erase' and p_patch->'erase'<>'true'::jsonb then raise exception 'invalid erasure';end if;
 if p_patch->'erase'='true'::jsonb then
  epoch:=epoch+1;
  update agent_flow_state set state=jsonb_set(coalesce(state,'{}'::jsonb),'{career}',jsonb_build_object('v',1,'scope',jsonb_build_object('userId',p_user),'revision',coalesce((state#>>'{career,revision}')::bigint,0)+1,'stores',jsonb_build_object('globalPause',jsonb_build_object('set',true,'source','account_control')))),updated_at=now() where user_id=p_user;
  delete from career_watch_kv where user_id=p_user and key not like 'career:turn:%';
  update career_watch_kv set value=jsonb_set(value,'{response}','null'::jsonb),updated_at=now() where user_id=p_user and key like 'career:turn:%';
  update career_reminder_outbox set payload=null,record=null,status='cancelled',updated_at=now() where user_id=p_user;
  a:=jsonb_build_object('epoch',epoch,'paused',true,'version',p_account_version);
 end if;
 a:=a||coalesce(p_patch-'erase','{}'::jsonb)||jsonb_build_object('version',p_account_version+1,'epoch',epoch);
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:account',a)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 if a->'paused'='true'::jsonb then update career_reminder_outbox set status='cancelled',updated_at=now() where user_id=p_user and status in ('pending','claimed','uncertain');end if;
 next_snapshot:=(case when p_patch->'erase'='true'::jsonb then jsonb_build_object('v',1,'scope',jsonb_build_object('userId',p_user),'stores',jsonb_build_object('globalPause',jsonb_build_object('set',true,'source','account_control'))) else p_snapshot end)||jsonb_build_object('revision',p_revision+1,'privacy_epoch',epoch);
 wp:=next_snapshot#>array['stores','alertWatchState','career:watch-profile:'||p_user];
 if wp is not null then
  if wp->>'user_id' is distinct from p_user::text then raise exception 'watch owner mismatch';end if;
  insert into career_watch_kv(user_id,key,value)values(p_user,'career:watch-profile:'||p_user,wp)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 end if;
 insert into agent_flow_state(thread_id,user_id,state,updated_at)values(p_thread,p_user,jsonb_build_object('career',next_snapshot),now())
 on conflict(thread_id)do update set state=jsonb_set(coalesce(agent_flow_state.state,'{}'::jsonb),'{career}',next_snapshot),updated_at=now() where agent_flow_state.user_id=p_user;
 insert into agent_messages(thread_id,role,content)values(p_thread,'user',p_input);
 insert into agent_messages(thread_id,role,content,meta)values(p_thread,'assistant',p_response->>'reply',coalesce(p_response->'meta','{}'::jsonb)||jsonb_build_object('career',true,'career_turn_key',p_key));
 update career_reminder_outbox set seen_at=now() where user_id=p_user and status='delivered' and reminder_id in(select x->>'reminder_id' from jsonb_array_elements(coalesce(p_response->'reminders','[]'::jsonb))x);
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:turn:'||p_thread||':'||p_key,jsonb_build_object('hash',p_hash,'epoch',epoch,'response',p_response));
 return jsonb_build_object('response',p_response);
end $$;

-- Eligibility is rechecked under the same owner lock at enqueue/claim/ack.
-- Paused/deleted interests cannot leak an older queued reminder afterward.
create function public.career_reminder_allowed(p_user uuid,p_reminder jsonb) returns boolean language sql security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from career_watch_kv w where user_id=p_user and key='career:watch-profile:'||p_user
 and w.value->>'user_id'=p_user::text and coalesce(w.value#>'{opt_out,global}','false'::jsonb)<>'true'::jsonb
 and exists(select 1 from jsonb_array_elements(coalesce(w.value->'interests','[]'::jsonb)) i where i->>'interest_id'=p_reminder->>'interest_id')
 and not exists(select 1 from jsonb_array_elements_text(coalesce(w.value#>'{opt_out,companies}','[]'::jsonb)) c where lower(c)=lower(p_reminder->>'company')));
$$;
revoke all on function public.career_reminder_allowed(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.career_reminder_allowed(uuid,jsonb) to service_role;

create function public.career_reminder_enqueue(p_user uuid,p_reminder jsonb,p_version bigint,p_epoch bigint) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if coalesce((a->>'version')::bigint,0) is distinct from p_version or coalesce((a->>'epoch')::bigint,0) is distinct from p_epoch or a->'paused'='true'::jsonb then raise exception 'stale or paused career worker';end if;
 if p_user is null or p_reminder is null or jsonb_typeof(p_reminder)<>'object' or p_reminder->>'user_id' is distinct from p_user::text or coalesce(length(p_reminder->>'reminder_id'),0) not between 1 and 200 or octet_length(p_reminder::text)>100000 then raise exception 'invalid reminder owner';end if;
 if exists(select 1 from career_reminder_outbox where user_id=p_user and reminder_id=p_reminder->>'reminder_id') then return jsonb_build_object('stored',true);end if;
 if not career_reminder_allowed(p_user,p_reminder) then raise exception 'inactive reminder interest';end if;
 insert into career_reminder_outbox(user_id,reminder_id,payload)values(p_user,p_reminder->>'reminder_id',p_reminder)on conflict(user_id,reminder_id)do nothing;
 return jsonb_build_object('stored',true);
end $$;
create function public.career_reminder_claim(p_user uuid,p_id text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r career_reminder_outbox; a jsonb; token uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select * into r from career_reminder_outbox where user_id=p_user and reminder_id=p_id for update;
 if not found then return jsonb_build_object('status','missing','claimed',false);end if;
 if (a->'paused'='true'::jsonb or not career_reminder_allowed(p_user,r.payload)) and r.status in ('pending','claimed','uncertain') then update career_reminder_outbox set status='cancelled',updated_at=now() where user_id=p_user and reminder_id=p_id;return jsonb_build_object('status','cancelled','claimed',false);end if;
 if r.status='claimed' and r.lease_until<now() then update career_reminder_outbox set status='uncertain',updated_at=now() where user_id=p_user and reminder_id=p_id;return jsonb_build_object('status','uncertain','claimed',false);end if;
 if r.status<>'pending' then return jsonb_build_object('status',r.status,'claimed',false,'record',r.record);end if;
 token:=gen_random_uuid();update career_reminder_outbox set status='claimed',lease_token=token,lease_until=now()+interval '1 minute',attempts=attempts+1,updated_at=now() where user_id=p_user and reminder_id=p_id;
 return jsonb_build_object('status','claimed','claimed',true,'leaseToken',token,'reminder',r.payload);
end $$;
create function public.career_reminder_ack(p_user uuid,p_id text,p_lease uuid,p_record jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r career_reminder_outbox; a jsonb; ledger jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select * into r from career_reminder_outbox where user_id=p_user and reminder_id=p_id for update;
 if not found then raise exception 'missing reminder';end if;
 if r.status='delivered' and r.lease_token=p_lease then return jsonb_build_object('status','delivered','record',r.record);end if;
 if r.lease_token is distinct from p_lease or r.status not in ('claimed','uncertain') or a->'paused'='true'::jsonb or not career_reminder_allowed(p_user,r.payload) then raise exception 'reminder acknowledgement unavailable';end if;
 if p_record->>'user_id' is distinct from p_user::text or p_record->>'reminder_id' is distinct from p_id or p_record->>'channel' is distinct from 'product_inbox' or p_record->'deadline' is distinct from r.payload->'deadline' or p_record->>'url' is distinct from r.payload->>'url' or p_record->>'job_id' is distinct from r.payload->>'job_id' or p_record->>'title' is distinct from r.payload->>'title' or p_record->>'company' is distinct from r.payload->>'company' or p_record->'fit_lines' is distinct from coalesce(r.payload#>'{fit,lines}','[]'::jsonb) or p_record->'matched_fact_ids' is distinct from coalesce(r.payload#>'{fit,matched_fact_ids}','[]'::jsonb) then raise exception 'reminder evidence mismatch';end if;
 p_record:=p_record||jsonb_build_object('provenance',jsonb_build_object('kind','career_reminder_outbox','version',1,'payload_sha256',encode(sha256(convert_to(r.payload::text,'UTF8')),'hex')));
 update career_reminder_outbox set status='delivered',record=p_record,delivered_at=now(),updated_at=now() where user_id=p_user and reminder_id=p_id;
 select value into ledger from career_watch_kv where user_id=p_user and key='career:delivery-ledger:'||p_user;
 ledger:=coalesce(ledger,jsonb_build_object('user_id',p_user,'delivered_ids','[]'::jsonb,'records','[]'::jsonb));
 ledger:=ledger||jsonb_build_object('delivered_ids',coalesce(ledger->'delivered_ids','[]'::jsonb)||jsonb_build_array(p_id),'records',coalesce(ledger->'records','[]'::jsonb)||jsonb_build_array(p_record));
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:delivery-ledger:'||p_user,ledger)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 return jsonb_build_object('status','delivered','record',p_record);
end $$;
create function public.career_reminder_status(p_user uuid,p_id text) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('status',status,'record',record,'leaseToken',lease_token,'reminder',payload) from career_reminder_outbox where user_id=p_user and reminder_id=p_id;
$$;

create function public.career_reminder_list(p_user uuid) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('reminders',coalesce(jsonb_agg(payload),'[]'::jsonb)) from (select payload from career_reminder_outbox where user_id=p_user and status in ('pending','claimed','uncertain') and payload is not null order by created_at,reminder_id limit 100) q;
$$;
revoke all on function public.career_reminder_list(uuid) from public,anon,authenticated;
grant execute on function public.career_reminder_list(uuid) to service_role;
revoke all on function public.career_host_load(uuid,uuid,text,text),public.career_host_commit(uuid,uuid,text,text,bigint,bigint,jsonb,jsonb,text,jsonb),public.career_reminder_enqueue(uuid,jsonb,bigint,bigint),public.career_reminder_claim(uuid,text),public.career_reminder_ack(uuid,text,uuid,jsonb),public.career_reminder_status(uuid,text) from public,anon,authenticated;
grant execute on function public.career_host_load(uuid,uuid,text,text),public.career_host_commit(uuid,uuid,text,text,bigint,bigint,jsonb,jsonb,text,jsonb),public.career_reminder_enqueue(uuid,jsonb,bigint,bigint),public.career_reminder_claim(uuid,text),public.career_reminder_ack(uuid,text,uuid,jsonb),public.career_reminder_status(uuid,text) to service_role;

create function public.career_watch_read(p_user uuid,p_key text) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('value',(select value from career_watch_kv where user_id=p_user and key=p_key),'version',coalesce((a.value->>'version')::bigint,0),'epoch',coalesce((a.value->>'epoch')::bigint,0),'paused',coalesce((a.value->>'paused')::boolean,false))
 from (select (select value from career_watch_kv where user_id=p_user and key='career:account') value) a;
$$;
create function public.career_watch_write(p_user uuid,p_key text,p_value jsonb,p_version bigint,p_epoch bigint) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';a:=coalesce(a,'{"version":0,"epoch":0}'::jsonb);
 if (a->>'version')::bigint is distinct from p_version or (a->>'epoch')::bigint is distinct from p_epoch or a->'paused'='true'::jsonb then raise exception 'stale or paused career worker';end if;
 if p_user is null or p_key is null or not (p_key in ('career:watch-profile:'||p_user,'career:reminder-queue:'||p_user,'career:reminder-history:'||p_user) or (p_key like 'career:jobs:snapshot:board:%' and right(p_key,37)=':'||p_user)) or p_value is null or octet_length(p_value::text)>1048576 then raise exception 'invalid watch state';end if;
 if p_key='career:watch-profile:'||p_user and p_value->>'user_id' is distinct from p_user::text then raise exception 'watch owner mismatch';end if;
 insert into career_watch_kv(user_id,key,value) values(p_user,p_key,p_value) on conflict(user_id,key) do update set value=excluded.value,updated_at=now();
 a:=a||jsonb_build_object('version',p_version+1);
 insert into career_watch_kv(user_id,key,value) values(p_user,'career:account',a) on conflict(user_id,key) do update set value=excluded.value,updated_at=now();
 return jsonb_build_object('version',p_version+1,'epoch',p_epoch);
end $$;
revoke all on function public.career_watch_read(uuid,text),public.career_watch_write(uuid,text,jsonb,bigint,bigint) from public,anon,authenticated;
grant execute on function public.career_watch_read(uuid,text),public.career_watch_write(uuid,text,jsonb,bigint,bigint) to service_role;

-- The complete scheduler checkpoint commits board snapshots, seat history,
-- queue removal and durable outbox transfer together; no pre-assign loss gap.
create function public.career_watch_cycle_commit(p_user uuid,p_version bigint,p_epoch bigint,p_writes jsonb,p_reminders jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb; entry record; reminder jsonb; saved jsonb; version bigint:=p_version;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if coalesce((a->>'version')::bigint,0) is distinct from p_version or coalesce((a->>'epoch')::bigint,0) is distinct from p_epoch or a->'paused'='true'::jsonb then raise exception 'stale or paused career worker';end if;
 if p_writes is null or jsonb_typeof(p_writes)<>'object' or p_reminders is null or jsonb_typeof(p_reminders)<>'array' or octet_length(p_writes::text)>4194304 or jsonb_array_length(p_reminders)>1000 then raise exception 'invalid career cycle';end if;
 for entry in select key,value from jsonb_each(p_writes) loop
  saved:=career_watch_write(p_user,entry.key,entry.value,version,p_epoch);version:=(saved->>'version')::bigint;
 end loop;
 for reminder in select value from jsonb_array_elements(p_reminders) loop perform career_reminder_enqueue(p_user,reminder,version,p_epoch);end loop;
 return jsonb_build_object('version',version,'epoch',p_epoch);
end $$;
revoke all on function public.career_watch_cycle_commit(uuid,bigint,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.career_watch_cycle_commit(uuid,bigint,bigint,jsonb,jsonb) to service_role;
