-- Generated OFFLINE from pinned git objects; no SQL has been executed.
create temp table bridge_live_source(signature text primary key,source_body text,source_path text,source_commit text);
insert into bridge_live_source values
('public.career_apply_cloud_refusal(public.career_apply_jobs,timestamp with time zone)',$live014_body$
declare fam text := public.career_apply_portal(j.url); o public.career_apply_cloud_optin; a jsonb; went text[] :=
 array['driving', 'confirmed', 'submitted_unconfirmed', 'needs_user', 'unknown_outcome']; co text := public.career_apply_company_key(j.company);
begin
 if j.state <> 'queued' or j.attempts <> 0 or j.source is not null or j.approval_hash is distinct from j.payload_hash
  or coalesce(j.payload->>'engine_approval', '') !~ '^[0-9a-f]{64}$' then return 'not_approved'; end if;
 if public.career_apply_current(j.user_id, j.payload) is distinct from true then return 'stale'; end if;
 if fam is null or fam not in ('greenhouse', 'lever', 'ashby') then return 'portal_not_cloud'; end if;
 -- A form only the person can submit (prepared with --person-submits: its destination is their own Submit press) is
 -- never the cloud's: a server has no person at the window.
 if coalesce(j.payload->>'destination', '') !~ '^https://' then return 'person_submits'; end if;
 if not public.career_apply_cloud_open(fam) and public.career_apply_cloud_waiver_left(j.user_id, fam, p_now) <= 0 then return 'gate_closed'; end if;
 select * into o from public.career_apply_cloud_optin where user_id = j.user_id;
 select value into a from public.career_watch_kv where user_id = j.user_id and key = 'career:account';
 if o.user_id is null or not o.enabled or o.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint, 0) then return 'not_opted_in'; end if;
 if exists (select from public.career_apply_cloud_pauses where scope = 'portal' and portal = fam and until > p_now) then
  return 'portal_paused'; end if;
 if exists (select from public.career_apply_cloud_pauses where scope = 'person' and user_id = j.user_id and until > p_now) then
  return 'person_paused'; end if;
 if (select count(*) from public.career_apply_jobs where user_id = j.user_id and state = any(went) and claimed_at > p_now - interval '1 day')
  >= least(coalesce(o.daily, 25), public.career_apply_daily_limit(j.user_id)) then return 'daily_limit'; end if;
 if co <> '' and exists (select from public.career_apply_jobs x where x.user_id = j.user_id and x.id <> j.id and x.state = any(went)
  and coalesce(x.claimed_at, x.created_at) > p_now - interval '30 days' and public.career_apply_company_key(x.company) = co) then
  return 'company_cooldown'; end if;
 return null;
end $live014_body$,'supabase/migrations/20261024120000_career_apply_cloud_gate_waiver.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('public.career_apply_cloud_claim_at(integer,timestamp with time zone)',$live014_body$
declare c uuid; u uuid; ids uuid[] := '{}'; dead uuid[]; users uuid[]; fams text[]; wf text[]; j public.career_apply_jobs; got int := 0;
 lim int := greatest(0, least(6, coalesce(p_limit, 0)));
begin
 if p_now is null or not public.career_apply_cloud_enabled() then return; end if;
 -- Cloud drives that stopped without a result, and the candidates: queued, approved, of a person who turned the cloud on,
 -- on a family whose gate is open and which is not paused; one person's oldest first, then the next person's (so no one
 -- fills every context). Nothing is locked yet.
 dead := array(select id from public.career_apply_jobs where source = 'cloud' and state = 'driving' and claimed_at < p_now - interval '15 minutes');
 fams := array(select f from unnest(array['greenhouse', 'lever', 'ashby']) f where public.career_apply_cloud_open(f)
  and not exists (select from public.career_apply_cloud_pauses where scope = 'portal' and portal = f and until > p_now));
 -- 20261024120000: a family whose gate is closed is still a candidate for a person holding a live waiver on it (D-010 as
 -- changed by the owner, 2026-10-21); the refusal below decides each job, the waiver's own count included.
 wf := array(select distinct w.portal from public.career_apply_cloud_gate_waivers w where w.revoked_at is null and w.expires_at > p_now
  and not exists (select from public.career_apply_cloud_pauses where scope = 'portal' and portal = w.portal and until > p_now));
 if lim > 0 and (cardinality(fams) > 0 or cardinality(wf) > 0) then
  ids := array(select x.id from (select q.id, q.created_at, row_number() over (partition by q.user_id order by q.created_at, q.id) rn
        from public.career_apply_jobs q join public.career_apply_cloud_optin o on o.user_id = q.user_id and o.enabled
        where q.state = 'queued' and q.attempts = 0 and q.source is null and q.approval_hash = q.payload_hash
         and (public.career_apply_portal(q.url) = any(fams)
          or (public.career_apply_portal(q.url) = any(wf) and public.career_apply_cloud_waiver_left(q.user_id, public.career_apply_portal(q.url), p_now) > 0))) x
        order by x.rn, x.created_at, x.id limit lim * 4);
 end if;
 -- Each person's lock first, in user id order, the same order every time (the finish, the enqueue and the own claim also
 -- take the person's lock before any row), so two of them can never wait on each other in a circle.
 users := array(select distinct user_id from public.career_apply_jobs where id = any(dead || ids) order by user_id);
 foreach u in array users loop
  perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 end loop;
 -- A cloud drive that stopped without a result is unknown, an error in the telemetry, and never re-driven.
 for j in update public.career_apply_jobs set state = 'unknown_outcome',
   reason = 'application outcome unknown: the drive stopped before recording it; not retried',
   evidence = evidence || jsonb_build_object('swept_at', p_now), updated_at = p_now
   where id = any(dead) and source = 'cloud' and state = 'driving' and claimed_at < p_now - interval '15 minutes' returning * loop
  perform public.career_apply_cloud_record(j, 'error', 'unknown_outcome', p_now);
 end loop;
 foreach c in array ids loop
  exit when got >= lim;
  select * into j from public.career_apply_jobs where id = c and state = 'queued' for update skip locked;
  continue when not found;
  continue when public.career_apply_cloud_refusal(j, p_now) is not null;
  update public.career_apply_jobs set state = 'driving', attempts = 1, claimed_at = p_now, lease_token = gen_random_uuid(),
   updated_at = p_now, source = 'cloud' where id = j.id returning * into j;
  got := got + 1;
  return next j;
 end loop;
end $live014_body$,'supabase/migrations/20261024120000_career_apply_cloud_gate_waiver.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('public.career_apply_claim_own(integer,text)',$live014_body$
declare u uuid:=auth.uid(); n timestamptz:=clock_timestamp();
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_source is null or p_source not in ('own_computer', 'extension') then raise exception 'invalid apply source'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 update public.career_apply_jobs set state='unknown_outcome',
  reason='application outcome unknown: the drive stopped before recording it; not retried',
  evidence=evidence||jsonb_build_object('swept_at',n),updated_at=n
  where user_id=u and state='driving' and claimed_at<n-interval '15 minutes' and source is distinct from 'cloud';
 return query
 with picked as (select id from public.career_apply_jobs where user_id=u and state='queued' and source is null
  and public.career_apply_current(user_id,payload) and approval_hash=payload_hash and attempts=0
  order by created_at,id limit greatest(0,least(6,coalesce(p_limit,0))) for update skip locked)
 update public.career_apply_jobs j set state='driving',attempts=1,claimed_at=n,lease_token=gen_random_uuid(),updated_at=n,source=p_source
  from picked where j.id=picked.id returning j.*;
end $live014_body$,'supabase/migrations/20261021080000_career_apply_cloud.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('public.career_apply_claim_own(integer)',$live014_body$
begin
 return query select * from public.career_apply_claim_own(p_limit, 'own_computer');
end $live014_body$,'supabase/migrations/20261021080000_career_apply_cloud.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('career_message_approval_private.guard_queue()',$live014_body$
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
 if jsonb_typeof(p) is distinct from 'object' or p->'version' is distinct from '1'::jsonb
  or exists(select 1 from jsonb_object_keys(p) k where k not in
   ('manifest_hash','quarantine_version','version','source','user_id','job_id','company','url','family','fields',
    'resume_name','resume_sha256','privacy_epoch','account_version','expires_at')) then
  raise exception 'message approval boundary: unknown or malformed payload parameter'; end if;
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
  if jsonb_typeof(f) is distinct from 'object' or exists(select 1 from jsonb_object_keys(f) k where k not in
    ('name','label','value','source','factId','detail'))
   or exists(select 1 from unnest(array['name','label','value','source','factId','detail']) k where jsonb_typeof(f->k) is distinct from 'string')
   or f->>'source' is distinct from 'trainee' or f->>'label' is distinct from a->>'label'
   or f->>'factId' is distinct from a->>'factId' then
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
end $live014_body$,'supabase/migrations/20261021220430_career_apply_message_cards.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('career_message_approval_private.immutable_card()',$live014_body$
begin
 if row(new.id,new.user_id,new.thread_id,new.message_id,new.payload,new.payload_hash,new.shown_at,new.expires_at)
    is distinct from row(old.id,old.user_id,old.thread_id,old.message_id,old.payload,old.payload_hash,old.shown_at,old.expires_at)
  or old.approved_at is not null then raise exception 'message approval card is immutable'; end if;
 return new;
end $live014_body$,'supabase/migrations/20261021220430_career_apply_message_cards.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('public.career_apply_message_card_approve_own(uuid,text)',$live014_body$
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
end $live014_body$,'supabase/migrations/20261021220430_career_apply_message_cards.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('public.career_apply_message_card_show_as(uuid,uuid,jsonb)',$live014_body$
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
end $live014_body$,'supabase/migrations/20261021220430_career_apply_message_cards.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('public.career_apply_message_card_read_own(uuid)',$live014_body$
declare u uuid := auth.uid(); c public.career_apply_message_cards;
begin
 if u is null then raise exception 'not signed in'; end if;
 if not public.career_apply_message_card_test_enabled_own() then raise exception 'message approvals are TEST-only'; end if;
 select * into c from public.career_apply_message_cards where id=p_card and user_id=u;
 if c.id is null or not exists(select 1 from public.agent_threads where id=c.thread_id and user_id=u) then
  raise exception 'message approval card is not yours'; end if;
 return jsonb_build_object('id',c.id,'payload',c.payload,'hash',c.payload_hash,'state',
  case when c.approved_at is not null then 'approved' when c.expires_at<=clock_timestamp() then 'expired' else 'open' end);
end $live014_body$,'supabase/migrations/20261021220430_career_apply_message_cards.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('public.career_apply_message_card_test_enabled_own()',$live014_body$
 select auth.uid() is not null and exists (
  select 1 from career_message_approval_private.test_users where user_id = auth.uid() and enabled
 )
$live014_body$,'supabase/migrations/20261021220430_career_apply_message_cards.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('public.career_apply_extension_begin_own(jsonb,text)',$live014_body$
declare u uuid := auth.uid(); h text; j public.career_apply_jobs;
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' or p_payload->>'user_id' is distinct from u::text then raise exception 'not your application'; end if;
 if p_payload->>'source' is distinct from 'extension' or coalesce(p_payload->>'url', '') !~ '^https://' then raise exception 'invalid extension application'; end if;
 h := encode(sha256(convert_to(public.career_apply_canonical(p_payload), 'UTF8')), 'hex');
 if p_approval is null or p_approval is distinct from h then raise exception 'invalid or stale application approval'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 delete from public.career_apply_jobs where user_id = u and job_id = p_payload->>'job_id' and state = 'not_submitted'
  and evidence->>'reason' = 'stopped before the click';
 j := public.career_apply_enqueue(p_payload, h, h, public.career_apply_daily_limit(u));
 update public.career_apply_jobs set state = 'driving', source = 'extension', attempts = 1, claimed_at = clock_timestamp(), lease_token = gen_random_uuid(),
  updated_at = clock_timestamp() where id = j.id returning * into j;
 return jsonb_build_object('id', j.id, 'lease', j.lease_token, 'payload_hash', j.payload_hash);
end $live014_body$,'supabase/migrations/20261021120000_career_apply_form_answers.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('public.career_apply_extension_begin_agent_own(jsonb,text,text)',$live014_body$
declare
 u uuid := auth.uid(); a public.career_apply_batch_approvals; r jsonb; e jsonb; l jsonb; f text;
 qv constant text := 'd007-v1';
 rules constant text[] := array['verbatim', 'option-exact', 'option-yes-no', 'checkbox-yes-no', 'attachment'];
 uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
 if u is null then raise exception 'not signed in'; end if;
 if not public.career_apply_agent_submit_enabled() then raise exception 'agent submit is off'; end if;
 select * into a from public.career_apply_batch_approvals
  where user_id = u and job_id = p_payload->>'job_id' and batch_hash = p_batch_hash and revoked_at is null and used_at is null
   and approved_at > clock_timestamp() - interval '24 hours'
  order by approved_at desc limit 1 for update;
 if a.id is null then raise exception 'no live batch approval for this posting'; end if;
 e := a.entry;

 -- 1 the quarantine rules the approval was made under
 if e->>'quarantine_version' is distinct from qv then raise exception 'agent contract: quarantine version'; end if;

 -- 2 the trusted fact manifest, the same in the approved entry and in the payload
 if coalesce(e->>'manifest_hash', '') !~ '^[0-9a-f]{64}$' or p_payload->>'manifest_hash' is distinct from e->>'manifest_hash'
  or p_payload->>'quarantine_version' is distinct from qv then
  raise exception 'agent contract: manifest';
 end if;

 -- 3 the ledger: complete, one row per answer
 if jsonb_typeof(e->'ledger') is distinct from 'array' or jsonb_typeof(e->'answers') is distinct from 'array' then
  raise exception 'agent contract: ledger';
 end if;
 for l in select x from jsonb_array_elements(e->'ledger') x loop
  if jsonb_typeof(l) is distinct from 'object' or l->>'application_id' is distinct from e->>'jobId'
   or jsonb_typeof(l->'fact_refs') is distinct from 'array' or jsonb_array_length(l->'fact_refs') = 0
   or exists (select 1 from jsonb_array_elements(l->'fact_refs') x where jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = '')
   or jsonb_typeof(l->'source_refs') is distinct from 'array'
   or exists (select 1 from jsonb_array_elements(l->'source_refs') x where jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = '')
   or jsonb_typeof(l->'confirmation_event_id') is distinct from 'string' or btrim(l->>'confirmation_event_id') = ''
   or not coalesce(l->>'derivation_rule' = any(rules), false) then
   raise exception 'agent contract: ledger';
  end if;
 end loop;
 if (select array_agg(x->>'name' order by x->>'name') from jsonb_array_elements(e->'answers') x)
    is distinct from (select array_agg(x->>'field_id' order by x->>'field_id') from jsonb_array_elements(e->'ledger') x) then
  raise exception 'agent contract: ledger';
 end if;

 -- 4 nothing from the quarantine (D-007): F-027..F-079 or the answer-all delegation
 if exists (select 1 from jsonb_array_elements(e->'ledger') x, jsonb_array_elements_text(x->'fact_refs') fr where fr ~ '^F-0*(2[7-9]|[3-6][0-9]|7[0-9])$')
  or exists (select 1 from jsonb_array_elements(e->'answers') x where coalesce(x->>'factId', '') ~ '^F-0*(2[7-9]|[3-6][0-9]|7[0-9])$')
  or exists (select 1 from jsonb_array_elements(e->'ledger') x, jsonb_array_elements_text(x->'source_refs') s where s ~* '(owner-delegated|answer-all)') then
  raise exception 'agent contract: quarantined fact';
 end if;

 -- 5 the payload sends exactly the approved answers, each on the fact its ledger row names
 if jsonb_typeof(p_payload->'fields') is distinct from 'array'
  or exists (select 1 from jsonb_array_elements(p_payload->'fields') x where x->>'source' is distinct from 'trainee')
  or (select array_agg(x->>'name' order by x->>'name') from jsonb_array_elements(p_payload->'fields') x)
     is distinct from (select array_agg(x->>'name' order by x->>'name') from jsonb_array_elements(e->'answers') x)
  or exists (select 1 from jsonb_array_elements(p_payload->'fields') x
   where x->>'factId' is distinct from (select y->'fact_refs'->>0 from jsonb_array_elements(e->'ledger') y where y->>'field_id' = x->>'name' limit 1)) then
  raise exception 'agent contract: payload not the approved answers';
 end if;

 -- 6 every text answer behind it is still this person's, answered
 for f in select fr from jsonb_array_elements(e->'ledger') x, jsonb_array_elements_text(x->'fact_refs') fr where fr like 'text-answer:%' loop
  if substr(f, 13) !~ uuid_re or not exists (select 1 from public.career_apply_questions q
    where q.id = substr(f, 13)::uuid and q.user_id = u and q.state = 'answered') then
   raise exception 'agent contract: withdrawn answer';
  end if;
 end loop;

 r := public.career_apply_extension_begin_own(p_payload, p_approval);
 update public.career_apply_batch_approvals set used_at = clock_timestamp() where id = a.id;
 update public.career_apply_jobs set agent_batch_hash = p_batch_hash where id = (r->>'id')::uuid and user_id = u;
 return r;
end $live014_body$,'supabase/migrations/20261024100000_career_apply_agent_contract.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('public.career_apply_batch_revoke_own()',$live014_body$
declare u uuid := auth.uid(); n integer;
begin
 if u is null then raise exception 'not signed in'; end if;
 update public.career_apply_batch_approvals set revoked_at = clock_timestamp() where user_id = u and revoked_at is null and used_at is null;
 get diagnostics n = row_count;
 return n;
end $live014_body$,'supabase/migrations/20261024090000_career_apply_agent_submit.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('public.career_apply_cloud_optin_as(uuid,boolean,text)',$live014_body$
declare a jsonb; d int;
begin
 if p_user is null or p_on is null then raise exception 'invalid cloud opt-in'; end if;
 if p_on then
  if p_terms is null or length(btrim(p_terms)) not between 1 and 1500 then raise exception 'invalid cloud opt-in'; end if;
  select value into a from public.career_watch_kv where user_id = p_user and key = 'career:account';
  if a is null then raise exception 'no_account'; end if;
  if coalesce(a->>'paused', 'false') <> 'false' then raise exception 'account_paused'; end if;
  d := public.career_apply_daily_limit(p_user);
  insert into public.career_apply_cloud_optin (user_id, enabled, terms, terms_sha256, daily, privacy_epoch, turned_on_at, updated_at)
  values (p_user, true, p_terms, encode(sha256(convert_to(p_terms, 'UTF8')), 'hex'), d, coalesce((a->>'epoch')::bigint, 0), now(), now())
  on conflict (user_id) do update set enabled = true, terms = excluded.terms, terms_sha256 = excluded.terms_sha256, daily = excluded.daily,
   privacy_epoch = excluded.privacy_epoch, turned_on_at = excluded.turned_on_at, updated_at = now();
  return jsonb_build_object('enabled', true, 'daily', d);
 end if;
 update public.career_apply_cloud_optin set enabled = false, turned_off_at = now(), updated_at = now() where user_id = p_user;
 delete from public.career_apply_cloud_resumes where user_id = p_user;
 return jsonb_build_object('enabled', false);
end $live014_body$,'supabase/migrations/20261021080000_career_apply_cloud.sql','01401cb456bc2982d67316165e183bbd275581c9'),
('public.career_apply_cloud_optin_get(uuid)',$live014_body$
 select coalesce((select jsonb_build_object('enabled', enabled, 'daily', daily, 'terms', terms, 'terms_sha256', terms_sha256) from public.career_apply_cloud_optin
  where user_id = p_user), jsonb_build_object('enabled', false))
$live014_body$,'supabase/migrations/20261021080000_career_apply_cloud.sql','01401cb456bc2982d67316165e183bbd275581c9');
