-- TEST-only Messages approvals. The card is a stored nonce over the exact modern batch entries;
-- rendering it and receiving a plain-text reply do not mint an application approval.
-- The TEST allowlist starts empty. Only the operator's service role may configure it.
create schema if not exists career_message_approval_private;
revoke all on schema career_message_approval_private from public, anon, authenticated;
grant usage on schema career_message_approval_private to service_role;
create table if not exists career_message_approval_private.test_users (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default true
);
alter table career_message_approval_private.test_users enable row level security;
revoke all on career_message_approval_private.test_users from public, anon, authenticated;
grant all on career_message_approval_private.test_users to service_role;

create table if not exists public.career_apply_message_cards (
 id uuid primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 thread_id uuid not null references public.agent_threads(id) on delete cascade,
 message_id bigint not null unique references public.agent_messages(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 1048576),
 payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
 shown_at timestamptz not null,
 expires_at timestamptz not null,
 approved_at timestamptz,
 approval_expires_at timestamptz,
 check (expires_at = shown_at + interval '24 hours'),
 check ((approved_at is null) = (approval_expires_at is null)),
 check (approval_expires_at is null or approval_expires_at = approved_at + interval '24 hours')
);
alter table public.career_apply_message_cards enable row level security;
revoke all on public.career_apply_message_cards from public, anon, authenticated;
grant select on public.career_apply_message_cards to authenticated;
grant all on public.career_apply_message_cards to service_role;

create or replace function public.career_apply_message_card_test_enabled_own() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select auth.uid() is not null and exists (
  select 1 from career_message_approval_private.test_users where user_id = auth.uid() and enabled
 )
$$;
revoke all on function public.career_apply_message_card_test_enabled_own() from public, anon, authenticated, service_role;
grant execute on function public.career_apply_message_card_test_enabled_own() to authenticated;
drop policy if exists career_apply_message_cards_owner_read on public.career_apply_message_cards;
create policy career_apply_message_cards_owner_read on public.career_apply_message_cards for select to authenticated
 using ((select auth.uid()) = user_id and (select public.career_apply_message_card_test_enabled_own()));

-- A shown payload cannot be replaced, even through the service writer. A changed application needs a new card.
create or replace function career_message_approval_private.immutable_card() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
 if row(new.id,new.user_id,new.thread_id,new.message_id,new.payload,new.payload_hash,new.shown_at,new.expires_at)
    is distinct from row(old.id,old.user_id,old.thread_id,old.message_id,old.payload,old.payload_hash,old.shown_at,old.expires_at)
  or old.approved_at is not null then raise exception 'message approval card is immutable'; end if;
 return new;
end $$;
revoke all on function career_message_approval_private.immutable_card() from public, anon, authenticated, service_role;
drop trigger if exists career_apply_message_cards_immutable on public.career_apply_message_cards;
create trigger career_apply_message_cards_immutable before update on public.career_apply_message_cards
 for each row execute function career_message_approval_private.immutable_card();

create or replace function career_message_approval_private.validate_items(p_items jsonb) returns void
language plpgsql set search_path = public, pg_temp as $$
declare it jsonb; e jsonb; a jsonb; seen text[] := '{}'; resume_count integer; resume_hash text;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then
  raise exception 'invalid message approval items'; end if;
 for it in select value from jsonb_array_elements(p_items) loop
  e := it->'entry';
  if jsonb_typeof(it) is distinct from 'object' or exists (select 1 from jsonb_object_keys(it) k where k not in ('entry','hash'))
   or jsonb_typeof(e) is distinct from 'object' or octet_length(e::text) > 131072
   or e->>'kind' is distinct from 'agent-batch' or e->>'version' is distinct from '1'
   or coalesce(e->>'jobId','') = '' or coalesce(e->>'company','') = ''
   or coalesce(e->>'url','') !~ '^https://' or jsonb_typeof(e->'answers') is distinct from 'array'
   or jsonb_typeof(e->'blank') is distinct from 'array' or jsonb_typeof(e->'ledger') is distinct from 'array'
   or coalesce(e->>'manifest_hash','') !~ '^[0-9a-f]{64}$'
   or coalesce(e->>'question_set_hash','') !~ '^[0-9a-f]{64}$'
   or e->>'quarantine_version' is distinct from 'd007-v1'
   or exists (select 1 from jsonb_object_keys(e) k where k not in
    ('version','kind','jobId','company','url','answers','blank','ledger','question_set_hash','manifest_hash','quarantine_version'))
   or it->>'hash' is distinct from encode(sha256(convert_to(public.career_apply_canonical(e),'UTF8')),'hex')
  then raise exception 'invalid or stale message approval entry'; end if;
  if e->>'jobId' = any(seen) then raise exception 'duplicate posting on message approval card'; end if;
  seen := array_append(seen,e->>'jobId');
  if exists (select 1 from jsonb_array_elements(e->'blank') x where jsonb_typeof(x) <> 'string') then
   raise exception 'invalid message approval blanks'; end if;
  resume_count := 0;
  resume_hash := null;
  for a in select value from jsonb_array_elements(e->'answers') loop
   if jsonb_typeof(a) is distinct from 'object' or coalesce(a->>'name','') = '' or coalesce(a->>'label','') = ''
    or jsonb_typeof(a->'value') is distinct from 'string' or jsonb_typeof(a->'shown') is distinct from 'string'
    or coalesce(a->>'kind','') not in ('text','select','choice','checkbox','file','listed') or coalesce(a->>'factId','') = ''
    or exists (select 1 from jsonb_object_keys(a) k where k not in ('name','label','value','shown','kind','factId','file'))
    or (a->>'kind' = 'file' and coalesce(a->>'file','') !~ '^[0-9a-f]{64}$')
    or (a->>'kind' <> 'file' and a->'file' is distinct from 'null'::jsonb)
   then raise exception 'invalid message approval answer'; end if;
   -- This is the extension's actual prepared-resume identity, not a filename or generic attachment guess.
   if a->>'kind'='file' and a->>'factId'='approved-local-resume:'||(a->>'file') then
    if resume_hash is not null and resume_hash is distinct from a->>'file' then
     raise exception 'message approval requires one prepared resume fingerprint'; end if;
    resume_hash := a->>'file';
    resume_count := resume_count+1;
   end if;
  end loop;
  if resume_count<1 then raise exception 'message approval requires a prepared resume'; end if;
  if (select count(*) from jsonb_array_elements(e->'answers')) <>
     (select count(distinct x->>'name') from jsonb_array_elements(e->'answers') x) then
   raise exception 'duplicate answer on message approval card'; end if;
 end loop;
end $$;
revoke all on function career_message_approval_private.validate_items(jsonb) from public, anon, authenticated, service_role;

-- Service producer only: it writes the nonce and its Messages reference in one transaction.
create or replace function public.career_apply_message_card_show_as(p_user uuid,p_thread uuid,p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := gen_random_uuid(); stamp bigint := floor(extract(epoch from clock_timestamp())*1000)::bigint;
 body jsonb; h text; message bigint;
begin
 if not exists (select 1 from career_message_approval_private.test_users where user_id=p_user and enabled) then
  raise exception 'message approvals are TEST-only'; end if;
 perform 1 from public.agent_threads where id=p_thread and user_id=p_user for update;
 if not found then raise exception 'message approval thread is not yours'; end if;
 perform career_message_approval_private.validate_items(p_items);
 body := jsonb_build_object('version',1,'kind','career-message-approval','card_id',v_id,'user_id',p_user,'thread_id',p_thread,
  'issued_at',stamp,'expires_at',stamp+86400000,'items',p_items);
 if octet_length(body::text)>1048576 then raise exception 'message approval card is too large'; end if;
 h := encode(sha256(convert_to(public.career_apply_canonical(body),'UTF8')),'hex');
 insert into public.agent_messages(thread_id,role,content,meta) values
  (p_thread,'assistant','Review every answer and resume fingerprint on this card before approving. Nothing has been sent.',
   jsonb_build_object('career',true,'intent','career_message_approval','career_approval_card_id',v_id)) returning agent_messages.id into message;
 insert into public.career_apply_message_cards(id,user_id,thread_id,message_id,payload,payload_hash,shown_at,expires_at)
  values(v_id,p_user,p_thread,message,body,h,to_timestamp(stamp/1000.0),to_timestamp(stamp/1000.0)+interval '24 hours');
 return jsonb_build_object('id',v_id,'payload',body,'hash',h,'state','open','message_id',message);
end $$;

create or replace function public.career_apply_message_card_read_own(p_card uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); c public.career_apply_message_cards;
begin
 if u is null then raise exception 'not signed in'; end if;
 if not public.career_apply_message_card_test_enabled_own() then raise exception 'message approvals are TEST-only'; end if;
 select * into c from public.career_apply_message_cards where id=p_card and user_id=u;
 if c.id is null or not exists(select 1 from public.agent_threads where id=c.thread_id and user_id=u) then
  raise exception 'message approval card is not yours'; end if;
 return jsonb_build_object('id',c.id,'payload',c.payload,'hash',c.payload_hash,'state',
  case when c.approved_at is not null then 'approved' when c.expires_at<=clock_timestamp() then 'expired' else 'open' end);
end $$;

-- The only tap operation. The stored nonce is locked before the existing authenticated batch approval is minted.
create or replace function public.career_apply_message_card_approve_own(p_card uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); c public.career_apply_message_cards; n integer; stamp timestamptz;
begin
 if u is null then raise exception 'not signed in'; end if;
 if not public.career_apply_message_card_test_enabled_own() then raise exception 'message approvals are TEST-only'; end if;
 -- Serialize separate Messages cards for one account too; the underlying batch mint replaces earlier live rows.
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into c from public.career_apply_message_cards where id=p_card and user_id=u for update;
 if c.id is null or not exists(select 1 from public.agent_threads where id=c.thread_id and user_id=u) then
  raise exception 'message approval card is not yours'; end if;
 if c.approved_at is not null then raise exception 'message approval card already used'; end if;
 if c.expires_at<=clock_timestamp() then raise exception 'message approval card expired'; end if;
 if p_hash is distinct from c.payload_hash
  or c.payload_hash is distinct from encode(sha256(convert_to(public.career_apply_canonical(c.payload),'UTF8')),'hex')
  or c.payload->>'card_id' is distinct from c.id::text or c.payload->>'user_id' is distinct from u::text
  or c.payload->>'thread_id' is distinct from c.thread_id::text
  or c.payload->>'kind' is distinct from 'career-message-approval' or c.payload->>'version' is distinct from '1'
 then raise exception 'invalid or stale message approval card'; end if;
 perform career_message_approval_private.validate_items(c.payload->'items');
 -- Resolved at invocation after the WO-101 migration. No alternative enqueue or submission path is introduced.
 stamp := clock_timestamp();
 if stamp>=c.expires_at then raise exception 'message approval card expired'; end if;
 n := public.career_apply_batch_approve_own(c.payload->'items');
 -- The existing mint's default now() is the transaction start. Use the same actual tap stamp for its new rows and
 -- this receipt, so a long transaction cannot shorten the permission or make the card promise a later deadline.
 update public.career_apply_batch_approvals a set approved_at=stamp
  where a.user_id=u and a.revoked_at is null and a.used_at is null
   and exists(select 1 from jsonb_array_elements(c.payload->'items') it
    where a.job_id=it->'entry'->>'jobId' and a.batch_hash=it->>'hash');
 update public.career_apply_message_cards set approved_at=stamp,approval_expires_at=stamp+interval '24 hours' where id=c.id;
 return jsonb_build_object('card_id',c.id,'card_hash',c.payload_hash,'approved_count',n,
  'approved_at',stamp,'approval_expires_at',stamp+interval '24 hours');
end $$;
revoke all on function public.career_apply_message_card_show_as(uuid,uuid,jsonb),public.career_apply_message_card_read_own(uuid),
 public.career_apply_message_card_approve_own(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_message_card_show_as(uuid,uuid,jsonb) to service_role;
grant execute on function public.career_apply_message_card_read_own(uuid),public.career_apply_message_card_approve_own(uuid,text) to authenticated;
