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

-- A permanent marker, not a second answer store. Resolving the existing approval row by ID keeps the boundary
-- binding even if a displayed card/message/thread is deleted. Profile deletion cascades this metadata too.
-- No FK to the later-created approval table: this migration precedes WO-101 in a clean schema.
create table if not exists career_message_approval_private.bound_approvals (
 approval_id uuid primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 job_id text not null,
 batch_hash text not null check(batch_hash ~ '^[0-9a-f]{64}$'),
 approved_at timestamptz not null,
 expires_at timestamptz not null check(expires_at=approved_at+interval '24 hours')
);
create index if not exists career_message_approval_bound_lookup on career_message_approval_private.bound_approvals(user_id,batch_hash,approved_at desc);
alter table career_message_approval_private.bound_approvals enable row level security;
revoke all on career_message_approval_private.bound_approvals from public,anon,authenticated,service_role;
create table if not exists career_message_approval_private.bound_jobs (
 job_row_id uuid primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 approval_id uuid not null unique references career_message_approval_private.bound_approvals(approval_id)
);
alter table career_message_approval_private.bound_jobs enable row level security;
revoke all on career_message_approval_private.bound_jobs from public,anon,authenticated,service_role;

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
   -- This first TEST execution path cannot safely infer the hidden raw value of a listed widget. Refuse before
   -- showing/tapping a knowingly unsupported card, rather than promise an authorization that cannot execute.
   if a->>'kind'='listed' or (a->>'kind'='text' and a->>'value' is distinct from a->>'shown') then
    raise exception 'unsupported message approval mapping'; end if;
   if a->>'kind'='checkbox' and not (
    (lower(a->>'value') in ('true','yes','y','on','checked') and a->>'shown'='Yes (checked)') or
    (lower(a->>'value') in ('false','no','n','off','unchecked') and a->>'shown'='No (left unchecked)')) then
    raise exception 'unsupported message approval checkbox mapping'; end if;
   if a->>'kind'='choice' and (coalesce(a->>'value','')='' or a->>'value' like '%checked=%'
    or exists(select 1 from unnest(string_to_array(a->>'value',', '))x where x='' or x like '%,%')) then
    raise exception 'unsupported message approval choice mapping'; end if;
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
 insert into career_message_approval_private.bound_approvals(approval_id,user_id,job_id,batch_hash,approved_at,expires_at)
  select a.id,a.user_id,a.job_id,a.batch_hash,stamp,stamp+interval '24 hours'
  from public.career_apply_batch_approvals a
  where a.user_id=u and a.revoked_at is null and a.used_at is null and a.approved_at=stamp
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

-- Messages-only final queue boundary. The unchanged canonical consumer inserts/starts its queue record and marks
-- its approval used before attaching agent_batch_hash. Raising here rolls that entire statement back, including
-- both earlier writes. The trigger is deliberately not UPDATE OF a late-added column (clean migration order).
create or replace function career_message_approval_private.guard_queue() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare n jsonb:=to_jsonb(new); o jsonb; marker career_message_approval_private.bound_approvals;
 old_marker boolean:=false; h text; e jsonb; p jsonb; a jsonb; f jsonb; d text; want text;
 resume_hash text; resume_name text; active_check boolean; bound_id uuid;
begin
 if tg_op='UPDATE' then
  o:=to_jsonb(old);
  select exists(select 1 from career_message_approval_private.bound_approvals b
   where b.user_id=old.user_id and b.batch_hash=o->>'agent_batch_hash') into old_marker;
  if old_marker and row(n->>'agent_batch_hash',new.user_id,new.job_id,new.url,new.company,new.payload,new.approval_hash,new.payload_hash)
    is distinct from row(o->>'agent_batch_hash',old.user_id,old.job_id,old.url,old.company,old.payload,old.approval_hash,old.payload_hash) then
   raise exception 'message approval boundary: queue binding is immutable'; end if;
 end if;
 h:=n->>'agent_batch_hash';
 select approval_id into bound_id from career_message_approval_private.bound_jobs where job_row_id=new.id;
 if bound_id is not null then
  select * into marker from career_message_approval_private.bound_approvals where approval_id=bound_id;
  if marker.user_id is distinct from new.user_id or marker.batch_hash is distinct from h then
   raise exception 'message approval boundary: queue binding is immutable'; end if;
 else
  select * into marker from career_message_approval_private.bound_approvals b
   where b.user_id=new.user_id and b.batch_hash=h order by b.approved_at desc limit 1;
 end if;
 if marker.approval_id is null then return new; end if;
 -- Terminal evidence remains recordable after permission expires. Entry/payload association above stays immutable.
 active_check:=tg_op='INSERT' or not old_marker or new.state in ('queued','driving');
 if active_check and (marker.expires_at<=clock_timestamp() or not exists(select 1 from
  career_message_approval_private.test_users where user_id=new.user_id and enabled)) then
  raise exception 'message approval boundary: TEST disabled or permission expired'; end if;
 select entry into e from public.career_apply_batch_approvals where id=marker.approval_id and user_id=new.user_id
  and job_id=marker.job_id and batch_hash=h and used_at is not null and (not active_check or revoked_at is null);
 if e is null or h is distinct from encode(sha256(convert_to(public.career_apply_canonical(e),'UTF8')),'hex') then
  raise exception 'message approval boundary: canonical approval missing or changed'; end if;
 p:=new.payload;
 if new.job_id is distinct from marker.job_id or p->>'job_id' is distinct from marker.job_id
  or p->>'user_id' is distinct from new.user_id::text or p->>'source' is distinct from 'extension'
  or p->>'company' is distinct from e->>'company' or new.company is distinct from e->>'company'
  or p->>'url' is distinct from e->>'url' or new.url is distinct from e->>'url'
  or p->>'manifest_hash' is distinct from e->>'manifest_hash' or p->>'quarantine_version' is distinct from e->>'quarantine_version'
  or e->>'quarantine_version' is distinct from 'd007-v1'
  or jsonb_typeof(p->'fields') is distinct from 'array'
  or new.payload_hash is distinct from new.approval_hash
  or new.approval_hash is distinct from encode(sha256(convert_to(public.career_apply_canonical(p),'UTF8')),'hex') then
  raise exception 'message approval boundary: destination or payload identity changed'; end if;
 if (select array_agg(x->>'name' order by x->>'name') from jsonb_array_elements(p->'fields')x)
  is distinct from (select array_agg(x->>'name' order by x->>'name') from jsonb_array_elements(e->'answers')x) then
  raise exception 'message approval boundary: fields changed'; end if;
 for a in select value from jsonb_array_elements(e->'answers') loop
  select value into f from jsonb_array_elements(p->'fields') where value->>'name'=a->>'name';
  if f->>'source' is distinct from 'trainee' or f->>'label' is distinct from a->>'label'
   or f->>'factId' is distinct from a->>'factId' or jsonb_typeof(f->'detail') is distinct from 'string' then
   raise exception 'message approval boundary: field provenance changed'; end if;
  d:=f->>'detail';
  if a->>'kind'='checkbox' then
   -- Native default-value boxes and explicit yes/no buttons only. An unchecked box alone cannot distinguish
   -- a deliberate No from an unanswered question. Custom raw values/ambiguous button mappings are unsupported.
   if lower(a->>'value') in ('true','yes','y','on','checked') and a->>'shown'='Yes (checked)' then
    if not ((f->>'value'='Yes (checked)' and d='checked=true;value=on') or
     (f->>'value'='Yes' and d='checked=true;value=on;pressed=yes')) then
     raise exception 'message approval boundary: checkbox readback changed or unsupported'; end if;
   elsif lower(a->>'value') in ('false','no','n','off','unchecked') and a->>'shown'='No (left unchecked)' then
    if f->>'value' is distinct from 'No' or d is distinct from 'checked=false;value=on;pressed=no' then
     raise exception 'message approval boundary: checkbox No is ambiguous'; end if;
   else raise exception 'message approval boundary: unsupported checkbox mapping'; end if;
  else
   if f->>'value' is distinct from a->>'shown' then raise exception 'message approval boundary: shown answer changed'; end if;
   case a->>'kind'
    when 'text' then if d<>'' or a->>'value' is distinct from a->>'shown' then
     raise exception 'message approval boundary: hidden text detail or unsupported text mapping'; end if;
    when 'select' then if d is distinct from 'value='||(a->>'value') then raise exception 'message approval boundary: select raw value changed'; end if;
    when 'choice' then
     -- Raw values must use the planner's canonical comma+space separator, in DOM option order. Raw values
     -- containing commas/checked= cannot be disambiguated by this wire format and are refused.
     if coalesce(a->>'value','')='' or a->>'value' like '%checked=%'
      or array_to_string(string_to_array(a->>'value',', '),', ') is distinct from a->>'value'
      or exists(select 1 from unnest(string_to_array(a->>'value',', '))x where x='' or x like '%,%') then
      raise exception 'message approval boundary: unsupported choice mapping'; end if;
     select string_agg('checked='||x,',' order by ord) into want from unnest(string_to_array(a->>'value',', ')) with ordinality v(x,ord);
     if d is distinct from want then raise exception 'message approval boundary: choice raw values changed'; end if;
    when 'file' then
     if d !~ ('^'||(a->>'file')||':[0-9]+:([A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+)?$') then
      raise exception 'message approval boundary: attached bytes changed or malformed'; end if;
     if a->>'factId'='approved-local-resume:'||(a->>'file') then
      resume_hash:=a->>'file'; resume_name:=a->>'shown';
      if p->>'resume_sha256' is distinct from resume_hash or p->>'resume_name' is distinct from resume_name then
       raise exception 'message approval boundary: prepared resume changed'; end if;
     end if;
    else raise exception 'message approval boundary: unsupported listed/raw mapping';
   end case;
  end if;
 end loop;
 if resume_hash is null then raise exception 'message approval boundary: prepared resume missing'; end if;
 if bound_id is null then
  insert into career_message_approval_private.bound_jobs(job_row_id,user_id,approval_id)
   values(new.id,new.user_id,marker.approval_id);
 end if;
 return new;
end $$;
revoke all on function career_message_approval_private.guard_queue() from public,anon,authenticated,service_role;
drop trigger if exists career_apply_message_boundary on public.career_apply_jobs;
create trigger career_apply_message_boundary before insert or update on public.career_apply_jobs
 for each row execute function career_message_approval_private.guard_queue();
