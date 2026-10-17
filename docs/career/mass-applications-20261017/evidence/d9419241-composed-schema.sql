--
-- PostgreSQL database dump
--

\restrict aSwCRlCblpvG7Afwf5kTN1DmpUqqmLGpSoEmYmYc8ovcGjhIzqhbYIO7JMXgOGM

-- Dumped from database version 16.15 (Debian 16.15-1.pgdg13+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$select null::uuid$$;


--
-- Name: agent_model_call_record(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.agent_model_call_record(p_call uuid, p_usage jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare slot public.agent_model_calls; k text; amount bigint;
begin
  select * into slot from public.agent_model_calls where id=p_call for update;
  if not found then raise exception 'model reservation unavailable'; end if;
  if jsonb_typeof(p_usage) is distinct from 'object' then raise exception 'invalid token usage'; end if;
  if (select count(*) from jsonb_object_keys(p_usage))<>4 then raise exception 'invalid token usage'; end if;
  foreach k in array array['input_tokens','output_tokens','cache_read_tokens','cache_write_tokens'] loop
    if jsonb_typeof(p_usage->k) is distinct from 'number' or (p_usage->>k)!~'^[0-9]+$' then raise exception 'invalid token usage'; end if;
    amount:=(p_usage->>k)::bigint;
    if amount>10000000 then raise exception 'invalid token usage'; end if;
  end loop;
  if slot.state='recorded' then
    if slot.usage is distinct from p_usage then raise exception 'conflicting token usage'; end if;
    return;
  end if;
  update public.agent_model_calls set state='recorded',usage=p_usage where id=p_call;
  insert into public.agent_usage(user_id,thread_id,model,call_id,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens)
    values(slot.user_id,slot.thread_id,slot.model,slot.id,(p_usage->>'input_tokens')::integer,(p_usage->>'output_tokens')::integer,
      (p_usage->>'cache_read_tokens')::integer,(p_usage->>'cache_write_tokens')::integer);
end;
$_$;


--
-- Name: agent_model_call_reserve(uuid, uuid, uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.agent_model_call_reserve(p_user uuid, p_thread uuid, p_request uuid, p_step integer, p_model text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare old public.agent_model_calls; slot public.agent_model_calls; n bigint;
begin
  if p_user is null or p_thread is null or p_request is null or p_step is null or p_step not between 0 and 15
    or p_model is null or length(p_model) not between 1 and 100 then raise exception 'invalid model reservation'; end if;
  perform 1 from auth.users where id=p_user for update;
  if not found or not exists(select 1 from public.agent_threads where id=p_thread and user_id=p_user)
    then raise exception 'conversation owner mismatch'; end if;
  select * into old from public.agent_model_calls where user_id=p_user and request_id=p_request and step=p_step;
  if found then
    if old.thread_id<>p_thread or old.model<>p_model then raise exception 'model reservation changed'; end if;
    return jsonb_build_object('ok',false,'state','already_reserved','call_id',old.id);
  end if;
  select (select count(*) from public.agent_model_calls where user_id=p_user and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')+
    (select count(*) from public.agent_usage where user_id=p_user and call_id is null and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC') into n;
  if n>=900 then return jsonb_build_object('ok',false,'state','monthly_limit'); end if;
  insert into public.agent_model_calls(user_id,thread_id,request_id,step,model) values(p_user,p_thread,p_request,p_step,p_model) returning * into slot;
  return jsonb_build_object('ok',true,'state','reserved','call_id',slot.id);
end;
$$;


--
-- Name: career_applicant_canonical_v1(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_applicant_canonical_v1(v jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select case jsonb_typeof(v)
 when 'object' then '{'||coalesce((select string_agg(to_json(key)::text||':'||career_applicant_canonical_v1(value),',' order by key collate "C") from jsonb_each(v)),'')||'}'
 when 'array' then '['||coalesce((select string_agg(career_applicant_canonical_v1(value),',' order by ord) from jsonb_array_elements(v) with ordinality x(value,ord)),'')||']'
 else v::text end;
$$;


--
-- Name: career_applicant_confirm_turn_v1(jsonb, uuid, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_applicant_confirm_turn_v1(p_base jsonb, p_upload uuid, p_review text, p_fields jsonb, p_message text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;a jsonb;v career_applicant_uploads_v1;f jsonb;profile jsonb;k text;x jsonb;source_path text[];fields jsonb:='[]'::jsonb;binding jsonb;expected text;reply jsonb;saved jsonb;b bytea;version_id text;r jsonb;
begin
 if u is null or t is null or p_upload is null or coalesce(p_review,'') !~ '^[a-f0-9]{64}$' or p_message is null or length(p_message)>120 or jsonb_typeof(p_fields) is distinct from 'object' or lower(btrim(p_message)) is distinct from (case when p_fields='{}'::jsonb then 'use this resume' else 'use this resume and confirm these fields' end) then raise exception 'explicit owned upload confirmation required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 binding:=jsonb_build_object('version','career_applicant_confirm/v1','threadId',t,'requestId',p_base->>'p_key','uploadId',p_upload,'reviewHash',p_review,'fields',p_fields,'message',p_message);
 expected:=encode(sha256(convert_to(career_applicant_canonical_v1(binding),'UTF8')),'hex');
 if p_base->>'p_hash' is distinct from expected then raise exception 'confirmation request hash mismatch';end if;
 select value into r from career_watch_kv where user_id=u and key='career:turn:'||t||':'||(p_base->>'p_key');
 select value into a from career_watch_kv where user_id=u and key='career:account';
 if r is not null then
  if r->>'hash' is distinct from expected or r->'response' is null or r->'response'='null'::jsonb or coalesce((r->>'epoch')::bigint,-1) is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'confirmation replay conflict';end if;
  return jsonb_build_object('response',r->'response','replay',true);
 end if;
 if a is null or a->'paused'='true'::jsonb or not exists(select 1 from agent_threads where id=t and user_id=u) then raise exception 'applicant authority revoked';end if;
 select * into v from career_applicant_uploads_v1 where user_id=u and upload_id=p_upload for update;
 if v.upload_id is null or v.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or (not v.confirmed and v.expires_at<=clock_timestamp()) or v.review is null or v.review->>'sha256' is distinct from p_review or (v.review->>'expiresAt')::timestamptz<=clock_timestamp() or v.review#>>'{binding,threadId}' is distinct from t::text or v.review#>'{binding,fields}' is distinct from p_fields or (v.review#>>'{binding,accountVersion}')::bigint is distinct from (a->>'version')::bigint then raise exception 'applicant review stale or missing';end if;
 b:=v.content;if b is null then select content into b from career_applicant_resumes_v1 where user_id=u and upload_id=p_upload order by sequence desc limit 1;end if;
 if b is null or encode(sha256(b),'hex') is distinct from v.sha256 then raise exception 'owned upload bytes unavailable';end if;
 select state->'career' into f from agent_flow_state where thread_id=t and user_id=u;
 f:=coalesce(f,jsonb_build_object('v',1,'scope',jsonb_build_object('userId',u),'stores','{}'::jsonb));
 profile:=coalesce(f#>'{stores,profile}',p_base->'p_profile_defaults');
 if jsonb_typeof(profile) is distinct from 'object' or jsonb_typeof(profile->'basics') is distinct from 'object' then raise exception 'server profile defaults required';end if;
 profile:=jsonb_set(profile,'{basics}',coalesce(profile->'basics','{}'::jsonb));profile:=jsonb_set(profile,'{basics,links}',coalesce(profile#>'{basics,links}','{}'::jsonb));
 for k,x in select * from jsonb_each(p_fields) loop
  source_path:=case when k in ('linkedin','website','github') then array['basics','links',k] else array['basics',k] end;
  profile:=jsonb_set(profile,source_path,x);
  fields:=fields||jsonb_build_array(jsonb_build_object('kind','fact','key',k,'value',x,'userId',u,'privacyEpoch',coalesce((a->>'epoch')::bigint,0),'confirmation',jsonb_build_object('confirmed',true,'userId',u,'ref',p_base->>'p_key','at',now()),'source',jsonb_build_object('kind','authenticated_applicant_turn/v1','threadId',t,'turnKey',p_base->>'p_key','requestHash',expected,'uploadId',p_upload,'reviewHash',p_review,'path',source_path)));
 end loop;
 f:=jsonb_set(f,'{stores,profile}',profile);version_id:='confirmed_'||substr(expected,1,40);
 reply:=jsonb_build_object('thread_id',t,'turn_key',p_base->>'p_key','reply','Saved this owned resume and the fields you explicitly confirmed. Each application still needs its own review and approval.','reminders','[]'::jsonb,'applicant',jsonb_build_object('status','confirmed','uploadId',p_upload,'artifactId',v.artifact_id,'versionId',version_id,'sha256',v.sha256,'filename',v.filename,'contentType',v.content_type,'bytes',v.bytes,'confirmedFieldKeys',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_each(p_fields))));
 saved:=career_host_commit(u,t,p_base->>'p_key',expected,(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,f,'{}'::jsonb,p_message,reply);
 if saved ? 'error' then return saved;end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 if (select count(*) from career_applicant_resumes_v1 where user_id=u)>=20 then raise exception 'confirmed resume history limit';end if;
 insert into career_applicant_resumes_v1(user_id,artifact_id,version_id,privacy_epoch,filename,content_type,content,confirmation_thread,confirmation_account_version,confirmation_key,confirmation_ref,upload_id,confirmed_fields)
 values(u,v.artifact_id,version_id,coalesce((a->>'epoch')::bigint,0),v.filename,v.content_type,b,t,(a->>'version')::bigint,'career:turn:'||t||':'||(p_base->>'p_key'),p_base->>'p_key',p_upload,fields);
 update career_applicant_uploads_v1 set content=null,review=null,confirmed=true where user_id=u and upload_id=p_upload;
 return saved;
end $_$;


--
-- Name: career_applicant_equipment_resolve_base_v1(uuid, text, bigint, bigint, text, text, uuid, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_applicant_equipment_resolve_base_v1(p_user uuid, p_artifact text, p_version bigint, p_epoch bigint, p_task text, p_intent text, p_lease uuid, p_posting text, p_sha text, p_include_bytes boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare a jsonb;i career_task_intents_v1;latest career_applicant_resumes_v1;record jsonb;confirmation jsonb;r jsonb;
begin
 if p_user is null or p_version is null or p_epoch is null or p_lease is null or p_include_bytes is null or coalesce(p_task,'') !~ '^[a-f0-9]{32}$' or coalesce(p_intent,'') !~ '^[a-f0-9]{64}$' or coalesce(p_sha,'') !~ '^[a-f0-9]{64}$' then raise exception 'applicant scope required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent;
 if a is null or a->'paused'='true'::jsonb or (a->>'version')::bigint is distinct from p_version or coalesce((a->>'epoch')::bigint,0) is distinct from p_epoch or i.intent_id is null or i.state<>'claimed' or i.task_id is distinct from p_task or i.lease_token is distinct from p_lease or i.expires_at<=clock_timestamp() or i.authority_account_version is distinct from p_version or i.privacy_epoch is distinct from p_epoch or coalesce(i.binding->>'action','') not in ('prepare','approve') or i.binding->>'resume_sha256' is distinct from p_sha or (i.claim_worker is not null and (i.claim_lease_until is null or i.claim_lease_until<=clock_timestamp())) then raise exception 'applicant task authority revoked';end if;
 if not exists(select 1 from career_task_intents_v1 anchor where anchor.user_id=p_user and anchor.task_id=p_task and anchor.privacy_epoch=p_epoch and anchor.binding->>'action'='prepare' and anchor.binding->>'artifact_id'=p_artifact and anchor.binding->>'resume_sha256'=p_sha and anchor.private_input#>>'{posting,canonicalKey}'=p_posting) then raise exception 'applicant posting binding mismatch';end if;
 select * into latest from career_applicant_resumes_v1 where user_id=p_user and privacy_epoch=p_epoch order by sequence desc limit 1;
 if latest.artifact_id is null then return jsonb_build_object('error','CONFIRMED_RESUME_NOT_STORED');end if;
 if latest.artifact_id is distinct from p_artifact or latest.sha256 is distinct from p_sha then raise exception 'latest confirmed applicant resume required';end if;
 select value into r from career_watch_kv where user_id=p_user and key=latest.confirmation_key;
 if r is null or r->'response' is null or r->'response'='null'::jsonb or coalesce((r->>'epoch')::bigint,-1) is distinct from p_epoch or (r->>'equipment_account_version')::bigint is distinct from latest.confirmation_account_version or not exists(select 1 from agent_threads where id=latest.confirmation_thread and user_id=p_user) then raise exception 'applicant confirmation revoked';end if;
 confirmation:=jsonb_build_object('confirmed',true,'userId',p_user,'ref',latest.confirmation_ref,'at',latest.confirmed_at);
 record:=jsonb_build_object('version','career_owned_equipment/v2','userId',p_user,'accountVersion',p_version,'privacyEpoch',p_epoch,
 'artifact',jsonb_build_object('id',latest.artifact_id,'versionId',latest.version_id,'userId',p_user,'privacyEpoch',p_epoch,'filename',latest.filename,'contentType',latest.content_type,'bytes',octet_length(latest.content),'sha256',latest.sha256,'confirmation',confirmation),
 'latestConfirmedArtifact',jsonb_build_object('userId',p_user,'privacyEpoch',p_epoch,'id',latest.artifact_id,'versionId',latest.version_id,'sha256',latest.sha256,'confirmationRef',latest.confirmation_ref),
 'facts','[]'::jsonb);
 return jsonb_build_object('records',record)||case when p_include_bytes then jsonb_build_object('blob',jsonb_build_object('userId',p_user,'artifactId',latest.artifact_id,'versionId',latest.version_id,'base64',replace(encode(latest.content,'base64'),E'\n',''))) else '{}'::jsonb end;
end $_$;


--
-- Name: career_applicant_equipment_resolve_v1(uuid, text, bigint, bigint, text, text, uuid, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_applicant_equipment_resolve_v1(p_user uuid, p_artifact text, p_version bigint, p_epoch bigint, p_task text, p_intent text, p_lease uuid, p_posting text, p_sha text, p_include_bytes boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;v career_applicant_resumes_v1;f jsonb;x jsonb;facts jsonb:='[]'::jsonb;source_path text[];
begin
 result:=career_applicant_equipment_resolve_base_v1(p_user,p_artifact,p_version,p_epoch,p_task,p_intent,p_lease,p_posting,p_sha,p_include_bytes);
 if result ? 'error' then return result;end if;
 select * into v from career_applicant_resumes_v1 where user_id=p_user and artifact_id=p_artifact and version_id=result#>>'{records,artifact,versionId}';
 select state->'career' into f from agent_flow_state where user_id=p_user and thread_id=v.confirmation_thread;
 if f#>>'{scope,userId}'=p_user::text and coalesce((f->>'privacy_epoch')::bigint,-1)=p_epoch and exists(select 1 from career_task_intents_v1 where user_id=p_user and intent_id=p_intent and thread_id=v.confirmation_thread) then
  for x in select * from jsonb_array_elements(v.confirmed_fields) loop
   select array_agg(value order by ord) into source_path from jsonb_array_elements_text(x#>'{source,path}') with ordinality a(value,ord);
   if x->>'userId'=p_user::text and (x->>'privacyEpoch')::bigint=p_epoch and f#>'{stores,profile}'#>source_path=x->'value' then facts:=facts||jsonb_build_array(x);end if;
  end loop;
 end if;
 return jsonb_set(result,'{records,facts}',facts);
end $$;


--
-- Name: career_applicant_resume_confirm_v1(uuid, uuid, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_applicant_resume_confirm_v1(p_user uuid, p_thread uuid, p_key text, p_artifact text, p_version text, p_filename text, p_type text, p_encoded text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare a jsonb;r jsonb;f jsonb;b bytea;sha text;message text;expected text;old career_applicant_resumes_v1;
begin
 if p_user is null or p_thread is null or coalesce(p_key,'') !~ '^[A-Za-z0-9_-]{1,128}$' or coalesce(p_artifact,'') !~ '^[A-Za-z0-9_-]{1,160}$' or coalesce(p_version,'') !~ '^[A-Za-z0-9_-]{1,160}$' or p_encoded is null or length(p_encoded)>1398104 or p_encoded !~ '^[A-Za-z0-9+/]+={0,2}$' then raise exception 'invalid applicant resume';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or a->'paused'='true'::jsonb then raise exception 'applicant authority revoked';end if;
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user) then raise exception 'owned applicant thread missing';end if;
 select state->'career' into f from agent_flow_state where thread_id=p_thread and user_id=p_user;
 if f#>>'{scope,userId}' is distinct from p_user::text or coalesce((f->>'privacy_epoch')::bigint,-1) is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'applicant snapshot stale';end if;
 b:=decode(p_encoded,'base64');sha:=encode(sha256(b),'hex');
 if octet_length(b) not between 1 and 1048576 or replace(encode(b,'base64'),E'\n','') is distinct from p_encoded then raise exception 'invalid applicant resume bytes';end if;
 if not ((p_type='application/pdf' and substring(b from 1 for 5)=convert_to('%PDF-','UTF8') and p_filename ~* '\.pdf$') or (p_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document' and substring(b from 1 for 4)=decode('504b0304','hex') and p_filename ~* '\.docx$')) then raise exception 'invalid applicant resume type';end if;
 message:='Confirm resume '||sha||' for applications';
 expected:=encode(sha256(convert_to('{"acceptedImages":[],"careerTask":null,"message":'||to_json(message)::text||',"version":"career_turn/v2"}','UTF8')),'hex');
 select value into r from career_watch_kv where user_id=p_user and key='career:turn:'||p_thread||':'||p_key;
 if r is null or r->>'hash' is distinct from expected or r->'response' is null or r->'response'='null'::jsonb or r#>>'{response,thread_id}' is distinct from p_thread::text or coalesce((r->>'epoch')::bigint,-1) is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'explicit owned resume confirmation required';end if;
 select * into old from career_applicant_resumes_v1 where user_id=p_user and artifact_id=p_artifact and version_id=p_version;
 if old.artifact_id is not null then
  if old.confirmation_account_version is distinct from (r->>'equipment_account_version')::bigint or old.sha256 is distinct from sha or old.filename is distinct from p_filename or old.content_type is distinct from p_type or old.confirmation_key is distinct from 'career:turn:'||p_thread||':'||p_key then raise exception 'immutable applicant resume conflict';end if;
  return jsonb_build_object('artifactId',old.artifact_id,'versionId',old.version_id,'sha256',old.sha256,'replay',true);
 end if;
 -- An old confirmed chat turn cannot become a newer artifact after another
 -- turn advanced the existing account row. Serialize on the same owner lock.
 if (r->>'equipment_account_version')::bigint is distinct from (a->>'version')::bigint then raise exception 'applicant confirmation stale';end if;
 insert into career_applicant_resumes_v1(user_id,artifact_id,version_id,privacy_epoch,filename,content_type,content,confirmation_thread,confirmation_account_version,confirmation_key,confirmation_ref)
 values(p_user,p_artifact,p_version,coalesce((a->>'epoch')::bigint,0),p_filename,p_type,b,p_thread,(a->>'version')::bigint,'career:turn:'||p_thread||':'||p_key,p_key);
 return jsonb_build_object('artifactId',p_artifact,'versionId',p_version,'sha256',sha,'replay',false);
end $_$;


--
-- Name: career_applicant_resume_erase_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_applicant_resume_erase_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if coalesce(new.key,old.key)='career:account' and (tg_op='DELETE' or (tg_op='UPDATE' and coalesce((new.value->>'epoch')::bigint,0) is distinct from coalesce((old.value->>'epoch')::bigint,0))) then
  delete from career_applicant_resumes_v1 where user_id=coalesce(new.user_id,old.user_id);
 end if;
 return null;
end $$;


--
-- Name: career_applicant_review_v1(uuid, uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_applicant_review_v1(p_user uuid, p_thread uuid, p_upload uuid, p_fields jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare a jsonb;v career_applicant_uploads_v1;k text;x jsonb;binding jsonb;h text;
begin
 if p_user is null or p_thread is null or p_upload is null or jsonb_typeof(p_fields) is distinct from 'object' or octet_length(p_fields::text)>8000 then raise exception 'invalid applicant review';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));perform career_applicant_upload_sweep_v1(p_user);
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select * into v from career_applicant_uploads_v1 where user_id=p_user and upload_id=p_upload for update;
 if a is null or a->'paused'='true'::jsonb or v.upload_id is null or v.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or (not v.confirmed and v.expires_at<=clock_timestamp()) or not exists(select 1 from agent_threads where id=p_thread and user_id=p_user) then raise exception 'owned upload unavailable';end if;
 for k,x in select * from jsonb_each(p_fields) loop
  if k not in ('name','first_name','last_name','email','phone','location','country','city','state','postal_code','linkedin','website','github') or jsonb_typeof(x) is distinct from 'string' or length(x#>>'{}') not between 1 and 300 or (x#>>'{}') ~ '[[:cntrl:]]' or btrim(x#>>'{}')='' then raise exception 'unsupported explicit applicant field';end if;
 end loop;
 binding:=jsonb_build_object('version','career_applicant_review/v1','userId',p_user,'threadId',p_thread,'uploadId',p_upload,'artifactId',v.artifact_id,'filename',v.filename,'contentType',v.content_type,'sha256',v.sha256,'bytes',v.bytes,'accountVersion',(a->>'version')::bigint,'privacyEpoch',coalesce((a->>'epoch')::bigint,0),'fields',p_fields);
 h:=encode(sha256(convert_to(career_applicant_canonical_v1(binding),'UTF8')),'hex');
 if v.review->>'sha256' is distinct from h or (v.review->>'expiresAt')::timestamptz<=clock_timestamp() then
  update career_applicant_uploads_v1 set review=jsonb_build_object('sha256',h,'binding',binding,'expiresAt',now()+interval '10 minutes') where user_id=p_user and upload_id=p_upload returning * into v;
 end if;
 return jsonb_build_object('review',v.review,'confirmationMessage',case when p_fields='{}'::jsonb then 'use this resume' else 'use this resume and confirm these fields' end);
end $$;


--
-- Name: career_applicant_status_v1(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_applicant_status_v1(p_user uuid, p_thread uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare a jsonb;r jsonb;latest career_applicant_resumes_v1;result jsonb;epoch bigint;
begin
 if p_user is null or p_thread is null then return jsonb_build_object('error','APPLICANT_STATUS_FORBIDDEN');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','APPLICANT_STATUS_FORBIDDEN');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or a->'paused'='true'::jsonb then return jsonb_build_object('error','APPLICANT_STATUS_REVOKED');end if;
 epoch:=coalesce((a->>'epoch')::bigint,0);
 result:=jsonb_build_object('version','career_applicant_status/v1','userId',p_user,'threadId',p_thread,'accountVersion',(a->>'version')::bigint,'privacyEpoch',epoch,'checkedAt',clock_timestamp());
 select * into latest from career_applicant_resumes_v1 where user_id=p_user and privacy_epoch=epoch order by sequence desc limit 1;
 if latest.artifact_id is null then return result||jsonb_build_object('status','none','applicant',null);end if;
 select value into r from career_watch_kv where user_id=p_user and key=latest.confirmation_key;
 if r is null or r->'response' is null or r->'response'='null'::jsonb or r#>>'{response,thread_id}' is distinct from latest.confirmation_thread::text or coalesce((r->>'epoch')::bigint,-1) is distinct from epoch or (r->>'equipment_account_version')::bigint is distinct from latest.confirmation_account_version or not exists(select 1 from agent_threads where id=latest.confirmation_thread and user_id=p_user)then return jsonb_build_object('error','APPLICANT_CONFIRMATION_UNAVAILABLE');end if;
 return result||jsonb_build_object('status','confirmed','applicant',jsonb_build_object('status','confirmed','artifactId',latest.artifact_id,'versionId',latest.version_id,'sha256',latest.sha256,'filename',latest.filename,'contentType',latest.content_type,'bytes',octet_length(latest.content),'confirmedAt',latest.confirmed_at));
end $$;


--
-- Name: career_applicant_turn_version_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_applicant_turn_version_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare a jsonb;
begin
 if new.key like 'career:turn:%' then
  if new.value->'response' is null or new.value->'response'='null'::jsonb then new.value:=new.value-'equipment_account_version';
  else
   select value into a from career_watch_kv where user_id=new.user_id and key='career:account';
   new.value:=(new.value-'equipment_account_version')||jsonb_build_object('equipment_account_version',(a->>'version')::bigint);
  end if;
 end if;
 return new;
end $$;


--
-- Name: career_applicant_upload_erase_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_applicant_upload_erase_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if coalesce(new.key,old.key)='career:account' and (tg_op='DELETE' or (tg_op='UPDATE' and coalesce((new.value->>'epoch')::bigint,0) is distinct from coalesce((old.value->>'epoch')::bigint,0))) then delete from career_applicant_uploads_v1 where user_id=coalesce(new.user_id,old.user_id);end if;
 return null;
end $$;


--
-- Name: career_applicant_upload_sweep_v1(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_applicant_upload_sweep_v1(p_user uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare n integer;
begin
 if p_user is null or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid upload cleanup scope';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 with expired as(select upload_id from career_applicant_uploads_v1 where user_id=p_user and not confirmed and expires_at<=clock_timestamp() order by expires_at limit p_limit)
 delete from career_applicant_uploads_v1 u using expired e where u.user_id=p_user and u.upload_id=e.upload_id;
 get diagnostics n=row_count;return jsonb_build_object('deleted',n);
end $$;


--
-- Name: career_applicant_upload_turn_v1(jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_applicant_upload_turn_v1(p_base jsonb, p_upload jsonb, p_encoded text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;a jsonb;f jsonb;b bytea;meta jsonb;expected text;reply jsonb;saved jsonb;old career_applicant_uploads_v1;
begin
 if u is null or t is null or coalesce(p_base->>'p_key','') !~ '^[A-Za-z0-9_-]{1,128}$' or p_encoded is null or length(p_encoded)>1398104 then raise exception 'invalid upload request';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform career_applicant_upload_sweep_v1(u);
 if not exists(select 1 from agent_threads where id=t and user_id=u) then raise exception 'owned applicant thread missing';end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';a:=coalesce(a,'{"version":0,"epoch":0}'::jsonb);
 if a->'paused'='true'::jsonb then raise exception 'applicant authority revoked';end if;
 b:=decode(p_encoded,'base64');
 if octet_length(b) not between 1 and 1048576 or replace(encode(b,'base64'),E'\n','') is distinct from p_encoded or p_upload->>'sha256' is distinct from encode(sha256(b),'hex') or (p_upload->>'bytes')::integer is distinct from octet_length(b) or p_upload->>'policy' is distinct from 'bounded_plain_pdf_docx/v1' or p_upload->>'version' is distinct from 'career_applicant_format/v1' then raise exception 'invalid upload bytes';end if;
 if not ((p_upload->>'contentType'='application/pdf' and substring(b from 1 for 5)=convert_to('%PDF-','UTF8') and p_upload->>'filename' ~* '\.pdf$') or (p_upload->>'contentType'='application/vnd.openxmlformats-officedocument.wordprocessingml.document' and substring(b from 1 for 4)=decode('504b0304','hex') and p_upload->>'filename' ~* '\.docx$')) then raise exception 'invalid upload type';end if;
 meta:=jsonb_build_object('version','career_applicant_upload/v1','threadId',t,'requestId',p_base->>'p_key','filename',p_upload->>'filename','contentType',p_upload->>'contentType','sha256',p_upload->>'sha256','bytes',octet_length(b));
 expected:=encode(sha256(convert_to(career_applicant_canonical_v1(meta),'UTF8')),'hex');
 if p_base->>'p_hash' is distinct from expected then raise exception 'upload request hash mismatch';end if;
 select * into old from career_applicant_uploads_v1 where user_id=u and request_key=p_base->>'p_key';
 if old.upload_id is not null then
  if old.sha256 is distinct from p_upload->>'sha256' or old.filename is distinct from p_upload->>'filename' or old.content_type is distinct from p_upload->>'contentType' or old.thread_id is distinct from t then raise exception 'upload idempotency conflict';end if;
  return jsonb_build_object('response',(select value->'response' from career_watch_kv where user_id=u and key='career:turn:'||t||':'||(p_base->>'p_key')),'replay',true);
 end if;
 if (select count(*) from career_applicant_uploads_v1 where user_id=u and not confirmed)>=4 then raise exception 'unconfirmed upload limit';end if;
 select state->'career' into f from agent_flow_state where thread_id=t and user_id=u;
 f:=coalesce(f,jsonb_build_object('v',1,'scope',jsonb_build_object('userId',u),'stores','{}'::jsonb));
 old.upload_id:=gen_random_uuid();old.artifact_id:='resume_'||replace(old.upload_id::text,'-','');
 reply:=jsonb_build_object('thread_id',t,'turn_key',p_base->>'p_key','reply','Resume uploaded privately. Review this owned file before confirming it; nothing was submitted.','reminders','[]'::jsonb,'applicant',jsonb_build_object('status','uploaded_unconfirmed','uploadId',old.upload_id,'artifactId',old.artifact_id,'sha256',p_upload->>'sha256','filename',p_upload->>'filename','contentType',p_upload->>'contentType','bytes',octet_length(b),'expiresAt',now()+interval '15 minutes'));
 saved:=career_host_commit(u,t,p_base->>'p_key',expected,(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,f,'{}'::jsonb,'Upload resume '||(p_upload->>'filename'),reply);
 if saved ? 'error' then return saved;end if;
 if saved->'replay'='true'::jsonb then raise exception 'upload record unavailable';end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 insert into career_applicant_uploads_v1(user_id,upload_id,artifact_id,thread_id,request_key,privacy_epoch,filename,content_type,sha256,bytes,content,validation)
 values(u,old.upload_id,old.artifact_id,t,p_base->>'p_key',coalesce((a->>'epoch')::bigint,0),p_upload->>'filename',p_upload->>'contentType',p_upload->>'sha256',octet_length(b),b,p_upload);
 return saved;
end $_$;


--
-- Name: career_application_admission_history_v1(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_admission_history_v1(p_user uuid, p_intent text, p_lease uuid, p_task text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if i.state is distinct from 'claimed' or i.task_id is distinct from p_task or i.lease_token is distinct from p_lease
  or i.expires_at<=clock_timestamp() or (i.claim_worker is not null and (i.claim_lease_until is null or i.claim_lease_until<=clock_timestamp()))
  or a is null or a->'paused'='true'::jsonb or i.authority_account_version is distinct from (a->>'version')::bigint
  or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'task authority revoked';end if;
 if exists(select 1 from career_task_effects_v1 e where e.user_id=p_user and e.operation='submit'
  and not exists(select 1 from career_application_admissions_v1 q where q.user_id=e.user_id and q.task_id=e.task_id)) then raise exception 'task submission history incomplete';end if;
 return jsonb_build_object('records',coalesce((select jsonb_agg(jsonb_build_object('userId',p_user,'status','submission_admitted','timestamp',admitted_at,'company',company_key,'vendor',vendor) order by admitted_at,task_id)
  from career_application_admissions_v1 where user_id=p_user and admitted_at>clock_timestamp()-interval '30 days'),'[]'::jsonb));
end $$;


--
-- Name: career_application_admit_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_admit_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare i career_task_intents_v1; posting jsonb; company text; host text; vendor_key text;
 at_time timestamptz; day_start timestamptz; a jsonb;
begin
 if NEW.operation<>'submit' then return NEW;end if;
 perform pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 select * into i from career_task_intents_v1 where user_id=NEW.user_id and intent_id=NEW.intent_id;
 select value into a from career_watch_kv where user_id=NEW.user_id and key='career:account';
 at_time:=clock_timestamp();day_start:=date_trunc('day',at_time at time zone 'UTC') at time zone 'UTC';
 if i.state is distinct from 'claimed' or i.binding->>'action' is distinct from 'approve'
  or i.task_id is distinct from NEW.task_id or i.expires_at<=at_time
  or (i.claim_worker is not null and (i.claim_lease_until is null or i.claim_lease_until<=at_time))
  or a is null or a->'paused'='true'::jsonb or i.authority_account_version is distinct from (a->>'version')::bigint
  or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'task authority revoked';end if;
 -- Only the original owner-bound preparation can name this task's company
 -- and ATS. Caller-supplied approval fields cannot move it to another bucket.
 select p.private_input->'posting' into posting from career_task_intents_v1 p
  where p.user_id=NEW.user_id and p.task_id=NEW.task_id and p.binding->>'action'='prepare'
  and p.privacy_epoch=i.privacy_epoch and p.binding->>'resume_sha256'=i.binding->>'resume_sha256'
  order by p.created_at,p.intent_id limit 1;
 company:=trim(regexp_replace(regexp_replace(lower(coalesce(posting->>'company','')),'\(test\)',' ','g'),'[^a-z0-9 ]|\s+',' ','g'));
 company:=regexp_replace(company,'\s+',' ','g');
 host:=substring(lower(coalesce(posting->>'url','')) from '^https?://([^/:?#]+)');
 vendor_key:=case when host in ('localhost','127.0.0.1') then 'controlled_loopback'
  when host in ('boards.greenhouse.io','job-boards.greenhouse.io','boards.eu.greenhouse.io') then 'greenhouse'
  when host in ('jobs.lever.co','jobs.eu.lever.co') then 'lever'
  when host='jobs.ashbyhq.com' then 'ashby'
  when host='jobs.smartrecruiters.com' then 'smartrecruiters' else null end;
 if company='' or vendor_key is null then raise exception 'task submission accounting binding missing';end if;
 -- A deployment with older attempts must explicitly reconcile/backfill those
 -- rows first. Never silently pretend its historical usage was empty.
 if exists(select 1 from career_task_effects_v1 e where e.user_id=NEW.user_id and e.operation='submit'
  and not exists(select 1 from career_application_admissions_v1 q where q.user_id=e.user_id and q.task_id=e.task_id)) then raise exception 'task submission history incomplete';end if;
 if exists(select 1 from career_application_admissions_v1 where user_id=NEW.user_id and task_id=NEW.task_id) then raise exception 'task submit already admitted';end if;
 if (select count(*)from career_application_admissions_v1 where user_id=NEW.user_id and admitted_at>=day_start)>=15 then raise exception 'task submission cap reached: perDay';end if;
 if (select count(*)from career_application_admissions_v1 where user_id=NEW.user_id and vendor=vendor_key and admitted_at>=day_start)>=5 then raise exception 'task submission cap reached: perVendorPerDay';end if;
 if exists(select 1 from career_application_admissions_v1 where user_id=NEW.user_id and company_key=company and admitted_at>at_time-interval '30 days') then raise exception 'task submission cap reached: perCompanyPer30Days';end if;
 insert into career_application_admissions_v1 values(NEW.user_id,NEW.task_id,NEW.intent_id,i.privacy_epoch,company,vendor_key,at_time);
 return NEW;
end $$;


--
-- Name: career_application_approval_source_guard_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_approval_source_guard_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s career_application_searches_v1;r jsonb;
begin
 if new.binding->>'action'='approve'and new.private_input#>>'{batch,batchId}'is not null then
  select *into s from career_application_searches_v1 where user_id=new.user_id and selected_batch=(new.private_input#>>'{batch,batchId}')::uuid;
  if s.search_id is not null then
   select v into r from jsonb_array_elements(coalesce(s.current_results,s.results))v where v->>'taskId'=new.task_id;
   if r is null or(r#>>'{source,observedAt}')::timestamptz<clock_timestamp()-interval '5 minutes'then raise exception 'application source observation expired; refresh and review required';end if;
  end if;
 end if;return new;
end $$;


--
-- Name: career_application_batch_answers_v1(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_batch_answers_v1(p_user uuid, p_intent text, p_lease uuid, p_task text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare i career_task_intents_v1;b career_application_batches_v1;r career_application_batch_roles_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent;
 if i.state is distinct from 'claimed' or i.lease_token is distinct from p_lease or i.task_id is distinct from p_task or i.expires_at<=clock_timestamp()
  or(i.claim_worker is not null and(i.claim_lease_until is null or i.claim_lease_until<=clock_timestamp()))then raise exception 'batch task authority revoked';end if;
 b:=career_application_batch_context_v1(p_user,i.thread_id,(i.private_input#>>'{batch,batchId}')::uuid);
 select * into r from career_application_batch_roles_v1 where user_id=p_user and batch_id=b.batch_id and task_id=p_task;
 if r.task_id is null or i.authority_account_version<>b.account_version or i.privacy_epoch<>b.privacy_epoch or r.last_intent<>i.intent_id or r.answer_revision::text is distinct from i.private_input#>>'{batch,answerRevision}'then raise exception 'batch answer context revoked';end if;
 return jsonb_build_object('answers',r.answers,'answerRevision',r.answer_revision);
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: career_application_batches_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_application_batches_v1 (
    user_id uuid NOT NULL,
    batch_id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    account_version bigint NOT NULL,
    privacy_epoch bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: career_application_batch_context_v1(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_batch_context_v1(p_user uuid, p_thread uuid, p_batch uuid) RETURNS public.career_application_batches_v1
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare b career_application_batches_v1;a jsonb;s career_application_searches_v1;q career_application_search_scopes_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select *into b from career_application_batches_v1 where user_id=p_user and batch_id=p_batch;select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if b.batch_id is null or b.thread_id is distinct from p_thread or not exists(select 1 from agent_threads where user_id=p_user and id=p_thread)or a is null or a->'paused'='true'::jsonb or b.account_version is distinct from (a->>'version')::bigint or b.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0)then raise exception 'batch context revoked';end if;
 select *into s from career_application_searches_v1 where user_id=p_user and selected_batch=p_batch;
 if s.search_id is not null then select *into q from career_application_search_scopes_v1 where user_id=p_user and thread_id=p_thread;if q.interests is distinct from s.role_interests or q.account_version is distinct from b.account_version or q.privacy_epoch is distinct from b.privacy_epoch then raise exception 'batch search scope changed';end if;end if;return b;
end $$;


--
-- Name: career_application_batch_control_v1(uuid, uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_batch_control_v1(p_user uuid, p_thread uuid, p_request text, p_action text, p_input jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare a jsonb;b career_application_batches_v1;r career_application_batch_roles_v1;s career_task_intents_v1;i career_task_intents_v1;
 saved career_application_batch_commands_v1;review career_application_batch_reviews_v1;
 batch uuid;request_hash text;task text;entry jsonb;answer jsonb;question jsonb;new_answers jsonb;ready jsonb:='[]';held jsonb:='[]';manifest jsonb;
 result jsonb;review_hash text;expiry timestamptz;field_key text;allowed text[];
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or a->'paused'='true'::jsonb or not exists(select 1 from agent_threads where id=p_thread and user_id=p_user) then raise exception 'batch context revoked';end if;
 if coalesce(p_request,'')!~'^[A-Za-z0-9_-]{1,128}$' or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>65536 then raise exception 'invalid batch command';end if;
 allowed:=case p_action when 'create' then array['taskIds'] when 'review' then array['batchId'] when 'approve' then array['batchId','reviewHash','message'] when 'answers' then array['batchId','taskId','questionsHash','answers','message'] when 'reconcile' then array['batchId','taskId','message'] when 'status' then array['batchId'] else null end;
 if allowed is null then raise exception 'invalid batch command';end if;
 for field_key in select jsonb_object_keys(p_input)loop if not field_key=any(allowed)then raise exception 'unknown batch command field';end if;end loop;
 if p_action<>'create' then batch:=(p_input->>'batchId')::uuid;b:=career_application_batch_context_v1(p_user,p_thread,batch);end if;
 if p_action='status' then return jsonb_build_object('version','career_application_batch/v1','batchId',batch,'roles',career_application_batch_progress_v1(p_user,batch));end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_thread,p_action,p_input)::text,'UTF8')),'hex');
 select * into saved from career_application_batch_commands_v1 where user_id=p_user and request_key=p_request;
 if saved.request_key is not null then
  if saved.request_hash is distinct from request_hash or saved.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'batch command conflict';end if;
  if p_action='create' then perform career_application_batch_context_v1(p_user,p_thread,(saved.response->>'batchId')::uuid);end if;
  return saved.response;
 end if;
 if p_action='create' then
  if jsonb_typeof(p_input->'taskIds') is distinct from 'array' or jsonb_array_length(p_input->'taskIds') not between 1 and 100
   or (select count(distinct v)from jsonb_array_elements_text(p_input->'taskIds')v)<>jsonb_array_length(p_input->'taskIds') then raise exception 'exact distinct batch tasks required';end if;
  insert into career_application_batches_v1(user_id,thread_id,account_version,privacy_epoch)values(p_user,p_thread,(a->>'version')::bigint,coalesce((a->>'epoch')::bigint,0))returning * into b;batch:=b.batch_id;
  for task in select jsonb_array_elements_text(p_input->'taskIds')loop
   if task!~'^[a-f0-9]{32}$'then raise exception 'invalid batch task';end if;
   select * into s from career_task_intents_v1 where user_id=p_user and thread_id=p_thread and task_id=task and binding->>'action'='prepare' and privacy_epoch=b.privacy_epoch and private_input->'posting' is not null order by created_at,intent_id limit 1;
   if s.intent_id is null then raise exception 'owned batch task missing';end if;
   select * into i from career_task_intents_v1 where user_id=p_user and task_id=task and privacy_epoch=b.privacy_epoch order by updated_at desc,intent_id desc limit 1;
   insert into career_application_batch_roles_v1(user_id,batch_id,task_id,source_intent,last_intent)values(p_user,batch,task,s.intent_id,i.intent_id);
   if not exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=task and (operation='submit' or state in('reserved','started','uncertain')))then perform career_application_batch_queue_v1(p_user,batch,task,'prepare');end if;
  end loop;
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'roles',career_application_batch_progress_v1(p_user,batch));
 elsif p_action='review' then
  expiry:=clock_timestamp()+interval '10 minutes';
  for entry in select * from jsonb_array_elements(career_application_batch_progress_v1(p_user,batch))loop
   if entry->>'status'='review_ready' and entry#>>'{task,review,authority,accountVersion}'=b.account_version::text
    and entry#>>'{task,review,authority,privacyEpoch}'=b.privacy_epoch::text and entry#>>'{task,review,eligibility,status}'='eligible'
    and (entry#>>'{task,review,expiresAt}')::timestamptz>clock_timestamp() then
    ready:=ready||jsonb_build_array(jsonb_build_object('taskId',entry->>'taskId','intentId',entry->>'intentId','posting',entry->'posting','review',entry#>'{task,review}'));
    expiry:=least(expiry,(entry#>>'{task,review,expiresAt}')::timestamptz);
   else held:=held||jsonb_build_array(jsonb_build_object('taskId',entry->>'taskId','status',entry->>'status','asks',entry#>'{task,asks}'));end if;
  end loop;
  if jsonb_array_length(ready)=0 then raise exception 'no batch roles ready';end if;
  manifest:=jsonb_build_object('version','career_application_batch_review/v1','batchId',batch,'userId',p_user,'threadId',p_thread,'accountVersion',b.account_version,'privacyEpoch',b.privacy_epoch,'roles',ready,'withheld',held);
  review_hash:=encode(sha256(convert_to(manifest::text,'UTF8')),'hex');
  insert into career_application_batch_reviews_v1(user_id,batch_id,review_sha256,manifest,expires_at)values(p_user,batch,review_hash,manifest,expiry)on conflict do nothing;
  select * into review from career_application_batch_reviews_v1 where user_id=p_user and batch_id=batch and review_sha256=review_hash;
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'reviewHash',review_hash,'encoding','postgres-jsonb-text/v1','manifest',review.manifest,'expiresAt',review.expires_at,'approvalPhrase','Approve batch '||review_hash);
 elsif p_action='approve' then
  review_hash:=p_input->>'reviewHash';select * into review from career_application_batch_reviews_v1 where user_id=p_user and batch_id=batch and review_sha256=review_hash for update;
  if review.review_sha256 is null or review.approved_at is not null or review.expires_at<=clock_timestamp() or p_input->>'message' is distinct from 'Approve batch '||review_hash then raise exception 'exact fresh batch approval required';end if;
  for entry in select * from jsonb_array_elements(review.manifest->'roles')loop
   select * into r from career_application_batch_roles_v1 where user_id=p_user and batch_id=batch and task_id=entry->>'taskId';
   select * into i from career_task_intents_v1 where user_id=p_user and intent_id=r.last_intent;
   if r.last_intent is distinct from entry->>'intentId' or i.result->>'status' is distinct from 'review_ready' or i.result->'review' is distinct from entry->'review' then raise exception 'batch review changed';end if;
   perform career_application_batch_queue_v1(p_user,batch,r.task_id,'approve',entry->'review');
  end loop;
  update career_application_batch_reviews_v1 set approved_at=clock_timestamp()where user_id=p_user and batch_id=batch and review_sha256=review_hash;
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'reviewHash',review_hash,'approvedTaskIds',(select jsonb_agg(v->>'taskId')from jsonb_array_elements(review.manifest->'roles')v),'status','queued','execution','separate_worker');
 elsif p_action='reconcile' then
  task:=p_input->>'taskId';
  if not exists(select 1 from career_application_batch_roles_v1 where user_id=p_user and batch_id=batch and task_id=task)or p_input->>'message' is distinct from 'Reconcile batch role '||task then raise exception 'exact role reconciliation required';end if;
  perform career_application_batch_queue_v1(p_user,batch,task,'reconcile',jsonb_build_object('requestId',p_request));
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'taskId',task,'status','readback_queued','resubmitAuthorized',false);
 elsif p_action='answers' then
  task:=p_input->>'taskId';select * into r from career_application_batch_roles_v1 where user_id=p_user and batch_id=batch and task_id=task for update;
  select * into i from career_task_intents_v1 where user_id=p_user and intent_id=r.last_intent;
  if r.task_id is null or i.result->>'status' is distinct from 'awaiting_user' or i.result->>'questionsSha256' is distinct from p_input->>'questionsHash'
   or p_input->>'message' is distinct from 'Confirm answers for '||task||' '||(p_input->>'questionsHash') then raise exception 'exact role answer confirmation required';end if;
  if jsonb_typeof(p_input->'answers')is distinct from 'array' or jsonb_array_length(p_input->'answers')not between 1 and 50
   or (select count(distinct v->>'fieldId')from jsonb_array_elements(p_input->'answers')v)<>jsonb_array_length(p_input->'answers')then raise exception 'invalid role answers';end if;
  new_answers:=r.answers;
  for answer in select * from jsonb_array_elements(p_input->'answers')loop
   if jsonb_typeof(answer)is distinct from 'object' or (select count(*)from jsonb_object_keys(answer))<>3 or not answer?'fieldId' or not answer?'questionSha256' or not answer?'value'
    or jsonb_typeof(answer->'value')not in('string','boolean','number') or octet_length((answer->'value')::text)>4000 then raise exception 'invalid role answer';end if;
   select v into question from jsonb_array_elements(i.result->'asks')v where v->>'field_id'=answer->>'fieldId' and v->>'questionSha256'=answer->>'questionSha256' and v->'required'='true'::jsonb and v->'answerable'='true'::jsonb;
   if question is null then raise exception 'role question changed';end if;
   if question#>>'{field,kind}'='eligibility' and (jsonb_typeof(answer->'value') is distinct from question#>>'{field,answerType}' or (question#>>'{field,answerType}'='string' and (length(btrim(answer->>'value'))not between 1 and 300)))then raise exception 'invalid eligibility answer type';end if;
   select coalesce(jsonb_agg(v),'[]')into new_answers from jsonb_array_elements(new_answers)v where v->>'fieldId'<>answer->>'fieldId';
   new_answers:=new_answers||jsonb_build_array(answer||jsonb_build_object('source','user_explicit_role_confirmation','kind',coalesce(question#>>'{field,kind}','portal')));
  end loop;
  update career_application_batch_roles_v1 set answers=new_answers,answer_revision=answer_revision+1 where user_id=p_user and batch_id=batch and task_id=task;
  perform career_application_batch_queue_v1(p_user,batch,task,'prepare');
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'taskId',task,'status','queued','submissionApproved',false);
 end if;
 insert into career_application_batch_commands_v1 values(p_user,p_request,request_hash,coalesce((a->>'epoch')::bigint,0),result,now());
 return result;
end $_$;


--
-- Name: career_application_batch_erase_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_batch_erase_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare u uuid;
begin
 if coalesce(new.key,old.key)='career:account' and(TG_OP='DELETE' or(TG_OP='UPDATE' and coalesce((new.value->>'epoch')::bigint,0)<>coalesce((old.value->>'epoch')::bigint,0)))then
  u:=coalesce(new.user_id,old.user_id);delete from career_application_batches_v1 where user_id=u;delete from career_application_batch_commands_v1 where user_id=u;
 end if;return null;
end $$;


--
-- Name: career_application_batch_lookup_v1(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_batch_lookup_v1(p_user uuid, p_thread uuid, p_review text DEFAULT NULL::text, p_task text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare a jsonb;b career_application_batches_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)or a is null or a->'paused'='true'::jsonb then raise exception 'application context revoked';end if;
 select *into b from career_application_batches_v1 x where x.user_id=p_user and x.thread_id=p_thread and x.account_version=(a->>'version')::bigint and x.privacy_epoch=coalesce((a->>'epoch')::bigint,0)
 and(p_review is null or exists(select 1 from career_application_batch_reviews_v1 r where r.user_id=p_user and r.batch_id=x.batch_id and r.review_sha256=p_review))
 and(p_task is null or exists(select 1 from career_application_batch_roles_v1 r where r.user_id=p_user and r.batch_id=x.batch_id and r.task_id=p_task))order by x.created_at desc,x.batch_id limit 1;
 return jsonb_build_object('batchId',b.batch_id);
end $$;


--
-- Name: career_application_batch_progress_v1(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_batch_progress_v1(p_user uuid, p_batch uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select coalesce(jsonb_agg(jsonb_build_object('taskId',r.task_id,'intentId',r.last_intent,
 'answerRevision',r.answer_revision,'confirmedAnswerCount',jsonb_array_length(r.answers),
 'posting',s.private_input->'posting','status',case
  when exists(select 1 from career_task_effects_v1 e where e.user_id=r.user_id and e.task_id=r.task_id and e.operation='submit')
   then case when i.result->>'status'='completed' and i.result#>'{result,receipt}' is not null then 'completed' else 'unknown_outcome' end
  when exists(select 1 from career_task_effects_v1 e where e.user_id=r.user_id and e.task_id=r.task_id and e.state in('started','uncertain'))then 'needs_reconciliation'
  when i.result is not null then i.result->>'status'
  when i.state='queued' then 'queued' when i.state='claimed' then 'running' else 'requires_review' end,
 'task',i.result,'employerConfirmed',false) order by r.task_id),'[]'::jsonb)
 from career_application_batch_roles_v1 r join career_task_intents_v1 i on i.user_id=r.user_id and i.intent_id=r.last_intent
 join career_task_intents_v1 s on s.user_id=r.user_id and s.intent_id=r.source_intent
 where r.user_id=p_user and r.batch_id=p_batch;
$$;


--
-- Name: career_application_batch_queue_v1(uuid, uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_batch_queue_v1(p_user uuid, p_batch uuid, p_task text, p_kind text, p_review jsonb DEFAULT NULL::jsonb) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare b career_application_batches_v1;r career_application_batch_roles_v1;s career_task_intents_v1;
 id text;event text;binding jsonb;payload jsonb;context jsonb;expiry timestamptz;
begin
 select * into b from career_application_batches_v1 where user_id=p_user and batch_id=p_batch;
 b:=career_application_batch_context_v1(p_user,b.thread_id,p_batch);
 select * into r from career_application_batch_roles_v1 where user_id=p_user and batch_id=p_batch and task_id=p_task for update;
 select * into s from career_task_intents_v1 where user_id=p_user and intent_id=r.source_intent;
 if r.task_id is null or s.private_input->'posting' is null or s.privacy_epoch<>b.privacy_epoch or p_kind not in('prepare','approve','reconcile') then raise exception 'batch preparation source missing';end if;
 if p_kind='reconcile' then
  if not exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=p_task and operation='submit')then raise exception 'batch reconcile not needed';end if;
 elsif exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=p_task and operation='submit')then raise exception 'batch reconcile required';end if;
 context:=jsonb_build_object('batchId',p_batch,'taskId',p_task,'answerRevision',r.answer_revision);
 id:=encode(sha256(convert_to(jsonb_build_array(p_user,p_batch,p_task,r.answer_revision,p_kind,p_review)::text,'UTF8')),'hex');event:='batch_'||substr(id,1,48);
 expiry:=clock_timestamp()+interval '10 minutes';
 binding:=jsonb_build_object('version','career_task_intent/v1','intent_id',id,'user_id',p_user,'thread_id',b.thread_id,'turn_key',event,
  'request_hash',id,'action',p_kind,'task_id',p_task,'event_id',event,'artifact_id',s.binding->>'artifact_id',
  'resume_sha256',s.binding->>'resume_sha256','payload_sha256',null,'profile_sha256',null,
  'destination',s.private_input#>>'{posting,url}','authority_account_version',b.account_version,'privacy_epoch',b.privacy_epoch);
 if p_kind='approve' then
  if p_review->>'taskId' is distinct from p_task or p_review->>'userId' is distinct from p_user::text
   or coalesce(p_review->>'payloadSha256','')!~'^[a-f0-9]{64}$' or coalesce(p_review->>'profileHash','')!~'^[a-f0-9]{64}$'
   or p_review->>'resumeSha256' is distinct from s.binding->>'resume_sha256'
   or p_review#>>'{eligibility,status}' is distinct from 'eligible' then raise exception 'batch exact review required';end if;
  expiry:=least(expiry,(p_review->>'expiresAt')::timestamptz);
  binding:=binding||jsonb_build_object('payload_sha256',p_review->>'payloadSha256','profile_sha256',p_review->>'profileHash','destination',p_review->>'destination');
  payload:=jsonb_build_object('batch',context);
 elsif p_kind='reconcile' then payload:=jsonb_build_object('batch',context);
 else payload:=s.private_input||jsonb_build_object('eventId',event,'batch',context);end if;
 if expiry<=clock_timestamp() then raise exception 'batch review expired';end if;
 insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id,expires_at)
 values(p_user,id,b.thread_id,event,id,encode(sha256(convert_to(p_user::text||':'||event,'UTF8')),'hex'),binding,payload,b.account_version,b.privacy_epoch,p_task,expiry);
 update career_application_batch_roles_v1 set last_intent=id where user_id=p_user and batch_id=p_batch and task_id=p_task;
 return id;
end $_$;


--
-- Name: career_application_chat_context_v1(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_chat_context_v1(p_user uuid, p_thread uuid, p_key text, p_hash text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare loaded jsonb;resume jsonb;s career_application_searches_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a->'paused'='true'::jsonb then return jsonb_build_object('error','application_context_revoked');end if;
 loaded:=career_host_load(p_user,p_thread,p_key,p_hash);if loaded?'error'then return loaded;end if;
 if loaded?'replay'then return jsonb_build_object('version','career_application_context/v1','loaded',loaded);end if;
 resume:=career_applicant_status_v1(p_user,p_thread);
 if resume?'error'and resume->>'error'<>'APPLICANT_STATUS_REVOKED'then return resume;end if;
 select * into s from career_application_searches_v1 where user_id=p_user and thread_id=p_thread and request_key=p_key;
 if s.search_id is not null and s.request_hash is distinct from p_hash then return jsonb_build_object('error','turn_key_conflict');end if;
 if s.search_id is not null and(s.account_version is distinct from (a->>'version')::bigint or s.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0))then return jsonb_build_object('error','application_context_revoked');end if;
 return jsonb_build_object('version','career_application_context/v1','loaded',loaded,'resume',resume->'applicant','searchReplay',case when s.search_id is null then null else to_jsonb(s)end);
end $$;


--
-- Name: career_application_conversation_erase_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_conversation_erase_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if coalesce(new.key,old.key)='career:account'and(tg_op='DELETE'or(tg_op='UPDATE'and coalesce((new.value->>'epoch')::bigint,0)is distinct from coalesce((old.value->>'epoch')::bigint,0)))then
  delete from career_application_search_scopes_v1 where user_id=coalesce(new.user_id,old.user_id);delete from career_application_scope_requests_v1 where user_id=coalesce(new.user_id,old.user_id);delete from career_application_searches_v1 where user_id=coalesce(new.user_id,old.user_id);delete from career_application_profile_reviews_v1 where user_id=coalesce(new.user_id,old.user_id);
 end if;return null;
end $$;


--
-- Name: career_application_profile_confirm_v1(jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_profile_confirm_v1(p_base jsonb, p_review text, p_message text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;r career_application_profile_reviews_v1;loaded jsonb;f jsonb;response jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));loaded:=career_host_load(u,t,p_base->>'p_key',p_base->>'p_hash');if loaded?'error'then return loaded;end if;if loaded?'replay'then return jsonb_build_object('response',loaded->'replay');end if;
 select *into r from career_application_profile_reviews_v1 where user_id=u and thread_id=t and review_sha256=p_review;
 if r.review_sha256 is null or r.expires_at<=clock_timestamp()or r.account_version is distinct from (loaded->>'accountVersion')::bigint or r.privacy_epoch is distinct from coalesce((loaded#>>'{account,epoch}')::bigint,0)or loaded#>'{account,paused}'='true'::jsonb or p_message is distinct from 'Confirm application facts '||p_review then raise exception 'application profile review changed';end if;
 f:=coalesce(nullif(loaded->'snapshot','null'::jsonb),jsonb_build_object('v',1,'scope',jsonb_build_object('userId',u),'stores','{}'::jsonb));f:=jsonb_set(f,'{stores,profile}',r.profile);
 response:=jsonb_build_object('thread_id',t,'turn_key',p_base->>'p_key','reply','Saved the application facts you explicitly confirmed. No application was submitted. Ask me to find your internship shortlist.','reminders','[]'::jsonb,'application',jsonb_build_object('version','career_application_chat/v1','status','profile_confirmed'));
 return career_host_commit(u,t,p_base->>'p_key',p_base->>'p_hash',(loaded->>'revision')::bigint,(loaded->>'accountVersion')::bigint,f,'{}'::jsonb,p_message,response);
end $$;


--
-- Name: career_application_profile_review_v1(uuid, uuid, text, text, bigint, bigint, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_profile_review_v1(p_user uuid, p_thread uuid, p_key text, p_hash text, p_version bigint, p_epoch bigint, p_review text, p_profile jsonb, p_fields jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare a jsonb;expected text;r career_application_profile_reviews_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a->'paused'='true'::jsonb or coalesce((a->>'version')::bigint,0)is distinct from p_version or coalesce((a->>'epoch')::bigint,0)is distinct from p_epoch or not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)then raise exception 'application context revoked';end if;
 select *into r from career_application_profile_reviews_v1 where user_id=p_user and thread_id=p_thread and request_key=p_key;
 if r.review_sha256 is not null then
  if r.request_hash is distinct from p_hash then raise exception 'application profile request conflict';end if;
  if r.account_version is distinct from p_version or r.privacy_epoch is distinct from p_epoch then raise exception 'application profile review changed';end if;
  return jsonb_build_object('reviewHash',r.review_sha256,'fields',r.fields,'expiresAt',r.expires_at);
 end if;
 expected:=encode(sha256(convert_to(career_applicant_canonical_v1(jsonb_build_object('userId',p_user,'threadId',p_thread,'requestKey',p_key,'accountVersion',p_version,'privacyEpoch',p_epoch,'profile',p_profile,'fields',p_fields)),'UTF8')),'hex');if expected is distinct from p_review then raise exception 'invalid application profile review';end if;
 insert into career_application_profile_reviews_v1(user_id,thread_id,request_key,request_hash,review_sha256,account_version,privacy_epoch,profile,fields)values(p_user,p_thread,p_key,p_hash,p_review,p_version,p_epoch,p_profile,p_fields)on conflict(user_id,review_sha256)do nothing;
 return jsonb_build_object('reviewHash',p_review,'fields',p_fields,'expiresAt',(select expires_at from career_application_profile_reviews_v1 where user_id=p_user and review_sha256=p_review));
end $$;


--
-- Name: career_application_search_prepare_v1(uuid, uuid, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_search_prepare_v1(p_user uuid, p_thread uuid, p_key text, p_search uuid, p_tasks jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare a jsonb;s career_application_searches_v1;resume jsonb;r jsonb;t text;id text;event text;binding jsonb;request jsonb;result jsonb;old career_task_intents_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select *into s from career_application_searches_v1 where user_id=p_user and search_id=p_search and thread_id=p_thread for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if s.search_id is null or a is null or a->'paused'='true'::jsonb or s.account_version is distinct from (a->>'version')::bigint or s.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0)or not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)then raise exception 'application context revoked';end if;
 if jsonb_typeof(p_tasks)is distinct from 'array'or jsonb_array_length(p_tasks)not between 1 and 100 or (select count(distinct v)from jsonb_array_elements_text(p_tasks)v)<>jsonb_array_length(p_tasks)then raise exception 'invalid selected application tasks';end if;
 if s.selected_batch is not null then if s.selected_tasks is distinct from p_tasks then raise exception 'application selection conflict';end if;return career_application_batch_control_v1(p_user,p_thread,p_key,'status',jsonb_build_object('batchId',s.selected_batch));end if;
 if s.expires_at<=clock_timestamp()then raise exception 'application source snapshot expired';end if;
 resume:=career_applicant_status_v1(p_user,p_thread);if resume->>'status'is distinct from 'confirmed'or resume#>>'{applicant,artifactId}'is distinct from s.resume->>'artifactId'or resume#>>'{applicant,versionId}'is distinct from s.resume->>'versionId'or resume#>>'{applicant,sha256}'is distinct from s.resume->>'sha256'then raise exception 'application resume changed';end if;
 for t in select jsonb_array_elements_text(p_tasks)loop
  select v into r from jsonb_array_elements(s.results)v where v->>'taskId'=t;
  if r is null then raise exception 'owned selected application missing';end if;
  select anchor.*into old from career_task_intents_v1 anchor where anchor.user_id=p_user and anchor.task_id=t and anchor.privacy_epoch=s.privacy_epoch and anchor.binding->>'action'='prepare'and anchor.private_input->'posting'is not null order by anchor.created_at,anchor.intent_id limit 1;
  if old.intent_id is not null and(old.private_input->'posting'is distinct from r->'posting'or old.binding->>'resume_sha256'is distinct from s.resume->>'sha256')then raise exception 'application original preparation changed';end if;
  if old.intent_id is null then
   id:=encode(sha256(convert_to(career_applicant_canonical_v1(jsonb_build_array(p_user::text,p_search::text,t,'source')),'UTF8')),'hex');event:='discovery_'||substr(id,1,48);
   binding:=jsonb_build_object('version','career_task_intent/v1','intent_id',id,'user_id',p_user,'thread_id',p_thread,'turn_key',event,'request_hash',s.request_hash,'action','prepare','task_id',t,'event_id',event,'artifact_id',s.resume->>'artifactId','resume_sha256',s.resume->>'sha256','destination',r#>>'{posting,url}','authority_account_version',s.account_version,'privacy_epoch',s.privacy_epoch);
   request:=jsonb_build_object('eventId',event,'posting',r->'posting','artifactId',s.resume->>'artifactId','resumeSha256',s.resume->>'sha256');
   insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id,state,expires_at)
   values(p_user,id,p_thread,event,s.request_hash,id,binding,request,s.account_version,s.privacy_epoch,t,'completed',clock_timestamp()+interval '10 minutes');
  end if;
 end loop;
 result:=career_application_batch_control_v1(p_user,p_thread,p_key,'create',jsonb_build_object('taskIds',p_tasks));
 update career_application_searches_v1 set selected_batch=(result->>'batchId')::uuid,selected_tasks=p_tasks where user_id=p_user and search_id=p_search;
 return result;
end $$;


--
-- Name: career_application_search_scope_v1(uuid, uuid, text, text, bigint, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_search_scope_v1(p_user uuid, p_thread uuid, p_key text, p_hash text, p_version bigint, p_epoch bigint, p_interests jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare a jsonb;old career_application_search_scopes_v1;saved career_application_scope_requests_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if not exists(select 1 from agent_threads where user_id=p_user and id=p_thread)or a->'paused'='true'::jsonb or coalesce((a->>'version')::bigint,0)is distinct from p_version or coalesce((a->>'epoch')::bigint,0)is distinct from p_epoch then raise exception 'application scope context revoked';end if;
 if coalesce(p_key,'')!~'^[A-Za-z0-9_-]{1,128}$'or coalesce(p_hash,'')!~'^[a-f0-9]{64}$'or jsonb_typeof(p_interests)is distinct from 'array'or octet_length(p_interests::text)>16384 then raise exception 'invalid application scope';end if;
 select *into old from career_application_search_scopes_v1 where user_id=p_user and thread_id=p_thread;
 select *into saved from career_application_scope_requests_v1 where user_id=p_user and thread_id=p_thread and request_key=p_key;
 if saved.request_key is not null then
  if saved.request_hash is distinct from p_hash then raise exception 'application search conflict';end if;
  if saved.account_version is distinct from p_version or saved.privacy_epoch is distinct from p_epoch or old.interests is distinct from saved.interests then raise exception 'application search scope changed';end if;
  return jsonb_build_object('interests',saved.interests);
 end if;
 insert into career_application_scope_requests_v1 values(p_user,p_thread,p_key,p_hash,p_version,p_epoch,p_interests);
 insert into career_application_search_scopes_v1 values(p_user,p_thread,p_version,p_epoch,p_interests)on conflict(user_id,thread_id)do update set account_version=excluded.account_version,privacy_epoch=excluded.privacy_epoch,interests=excluded.interests;
 if old.interests is distinct from p_interests then
  update career_task_intents_v1 i set state='cancelled'where i.user_id=p_user and i.thread_id=p_thread and i.state in('queued','claimed')and i.binding->>'action'in('prepare','approve')and exists(select 1 from career_application_searches_v1 x where x.user_id=p_user and x.thread_id=p_thread and x.selected_batch::text=i.private_input#>>'{batch,batchId}'and x.role_interests is distinct from p_interests);
  delete from career_application_batch_reviews_v1 r using career_application_batches_v1 b where b.user_id=p_user and b.thread_id=p_thread and r.user_id=b.user_id and r.batch_id=b.batch_id and r.approved_at is null;
 end if;
 return jsonb_build_object('interests',p_interests);
end $_$;


--
-- Name: career_application_search_store_v1(uuid, uuid, text, text, bigint, bigint, text, integer, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_search_store_v1(p_user uuid, p_thread uuid, p_key text, p_hash text, p_version bigint, p_epoch bigint, p_ask text, p_limit integer, p_results jsonb, p_health jsonb, p_interests jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare a jsonb;resume jsonb;s career_application_searches_v1;r jsonb;expected text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or a->'paused'='true'::jsonb or (a->>'version')::bigint is distinct from p_version or coalesce((a->>'epoch')::bigint,0)is distinct from p_epoch or not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)then return jsonb_build_object('error','application_context_revoked');end if;
 if coalesce(p_key,'')!~'^[A-Za-z0-9_-]{1,128}$'or coalesce(p_hash,'')!~'^[a-f0-9]{64}$'or p_ask is null or length(p_ask)>4000 or p_limit not between 1 and 100 or jsonb_typeof(p_results)is distinct from 'array'or jsonb_array_length(p_results)>least(200,p_limit*2)or (select count(distinct v->>'taskId')from jsonb_array_elements(p_results)v)<>jsonb_array_length(p_results)or jsonb_typeof(p_health)is distinct from 'array'or jsonb_typeof(p_interests)is distinct from 'array'then raise exception 'invalid application search';end if;
 select * into s from career_application_searches_v1 where user_id=p_user and thread_id=p_thread and request_key=p_key;
 if s.search_id is not null then if s.request_hash is distinct from p_hash then return jsonb_build_object('error','turn_key_conflict');end if;return to_jsonb(s);end if;
 resume:=career_applicant_status_v1(p_user,p_thread);if resume->>'status'is distinct from 'confirmed'then return jsonb_build_object('error','confirmed_resume_required');end if;
 for r in select *from jsonb_array_elements(p_results)loop
  expected:=substr(encode(sha256(convert_to(career_applicant_canonical_v1(jsonb_build_array(p_user::text,r#>>'{posting,canonicalKey}')),'UTF8')),'hex'),1,32);
  if r->>'taskId'is distinct from expected or r#>>'{posting,status}'is distinct from 'open'or coalesce(r#>>'{source,sha256}','')!~'^[a-f0-9]{64}$'or coalesce(r#>>'{source,provenance}','')not in('public_ats_snapshot/v1','synthetic_fixture/v1')or r#>>'{source,observedAt}'is null or (r#>>'{source,observedAt}')::timestamptz<clock_timestamp()-interval '5 minutes'or (r#>>'{source,observedAt}')::timestamptz>clock_timestamp()+interval '30 seconds'then raise exception 'invalid sourced application candidate';end if;
 end loop;
 insert into career_application_searches_v1(user_id,thread_id,request_key,request_hash,account_version,privacy_epoch,ask,requested,resume,results,source_health,role_interests)
 values(p_user,p_thread,p_key,p_hash,p_version,p_epoch,p_ask,p_limit,resume->'applicant',p_results,p_health,p_interests)returning *into s;return to_jsonb(s);
end $_$;


--
-- Name: career_application_source_refresh_context_v1(uuid, uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_source_refresh_context_v1(p_user uuid, p_thread uuid, p_batch uuid, p_key text, p_hash text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s career_application_searches_v1;c career_application_batch_commands_v1;
begin
 perform career_application_batch_context_v1(p_user,p_thread,p_batch);select *into s from career_application_searches_v1 where user_id=p_user and thread_id=p_thread and selected_batch=p_batch;
 if s.search_id is null then raise exception 'owned source snapshot missing';end if;
 select *into c from career_application_batch_commands_v1 where user_id=p_user and request_key=p_key;
 if c.request_key is not null then if c.request_hash is distinct from p_hash then raise exception 'source refresh conflict';end if;return jsonb_build_object('replay',c.response);end if;
 return jsonb_build_object('search',to_jsonb(s));
end $$;


--
-- Name: career_application_source_refresh_v1(uuid, uuid, uuid, text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_source_refresh_v1(p_user uuid, p_thread uuid, p_batch uuid, p_key text, p_hash text, p_results jsonb, p_health jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare ctx jsonb;s career_application_searches_v1;r career_application_batch_roles_v1;prior jsonb;fresh jsonb;kept jsonb:='[]';result jsonb;i career_task_intents_v1;id text;event text;binding jsonb;
begin
 ctx:=career_application_source_refresh_context_v1(p_user,p_thread,p_batch,p_key,p_hash);if ctx?'replay'then return ctx->'replay';end if;s:=jsonb_populate_record(null::career_application_searches_v1,ctx->'search');
 if coalesce(p_key,'')!~'^[A-Za-z0-9_-]{1,128}$'or coalesce(p_hash,'')!~'^[a-f0-9]{64}$'or jsonb_typeof(p_results)is distinct from 'array'or jsonb_array_length(p_results)>100 or octet_length(p_results::text)>4194304 or jsonb_typeof(p_health)is distinct from 'array'then raise exception 'invalid source refresh';end if;
 for fresh in select *from jsonb_array_elements(p_results)loop if coalesce(fresh#>>'{source,sha256}','')!~'^[a-f0-9]{64}$'or coalesce(fresh#>>'{source,provenance}','')not in('public_ats_snapshot/v1','synthetic_fixture/v1')or fresh#>>'{source,observedAt}'is null or (fresh#>>'{source,observedAt}')::timestamptz<clock_timestamp()-interval '5 minutes'or(fresh#>>'{source,observedAt}')::timestamptz>clock_timestamp()+interval '30 seconds'then raise exception 'invalid refreshed observation';end if;end loop;
 for r in select *from career_application_batch_roles_v1 where user_id=p_user and batch_id=p_batch for update loop
  if exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=r.task_id and(operation='submit'or state in('reserved','started','uncertain')))then continue;end if;
  select v into prior from jsonb_array_elements(s.results)v where v->>'taskId'=r.task_id;select v into fresh from jsonb_array_elements(p_results)v where v->>'taskId'=r.task_id;
  update career_task_intents_v1 pending set state='cancelled'where pending.user_id=p_user and pending.task_id=r.task_id and pending.state in('queued','claimed')and pending.binding->>'action'in('prepare','approve');
  update career_application_batch_roles_v1 set answer_revision=answer_revision+1,answers='[]'where user_id=p_user and batch_id=p_batch and task_id=r.task_id;
  if fresh is not null and fresh->'posting'=prior->'posting'then kept:=kept||jsonb_build_array(fresh);perform career_application_batch_queue_v1(p_user,p_batch,r.task_id,'prepare');
  else
   select *into i from career_task_intents_v1 where user_id=p_user and intent_id=r.source_intent;id:=encode(sha256(convert_to(jsonb_build_array(p_user,p_batch,r.task_id,p_key,'source-held')::text,'UTF8')),'hex');event:='refresh_'||substr(id,1,48);binding:=i.binding||jsonb_build_object('intent_id',id,'turn_key',event,'event_id',event,'request_hash',p_hash);
   insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id,state,result,expires_at)
   values(p_user,id,p_thread,event,p_hash,id,binding,i.private_input,s.account_version,s.privacy_epoch,r.task_id,'completed',jsonb_build_object('status','blocked','blocker','SOURCE_CHANGED_OR_UNAVAILABLE_RESELECTION_REQUIRED','review',null,'asks','[]'::jsonb,'observedReplacement',fresh->'posting'),clock_timestamp()+interval '10 minutes');
   update career_application_batch_roles_v1 set last_intent=id where user_id=p_user and batch_id=p_batch and task_id=r.task_id;
  end if;
 end loop;
 update career_application_searches_v1 set current_results=kept,source_health=p_health where user_id=p_user and search_id=s.search_id;
 delete from career_application_batch_reviews_v1 where user_id=p_user and batch_id=p_batch and approved_at is null;
 result:=career_application_batch_control_v1(p_user,p_thread,p_key,'status',jsonb_build_object('batchId',p_batch));insert into career_application_batch_commands_v1 values(p_user,p_key,p_hash,s.privacy_epoch,result,now());return result;
end $_$;


--
-- Name: career_application_task_context_v1(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_application_task_context_v1(p_user uuid, p_intent text, p_lease uuid, p_task text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare a jsonb;i career_task_intents_v1;s career_application_searches_v1;r jsonb;profile jsonb;f jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';select *into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent;
 if a is null or a->'paused'='true'::jsonb or i.state is distinct from 'claimed'or i.task_id is distinct from p_task or i.lease_token is distinct from p_lease or i.expires_at<=clock_timestamp()or i.authority_account_version is distinct from (a->>'version')::bigint or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0)or(i.claim_worker is not null and(i.claim_lease_until is null or i.claim_lease_until<=clock_timestamp()))or coalesce(i.binding->>'action','')not in('prepare','approve')then raise exception 'application task context revoked';end if;
 select *into s from career_application_searches_v1 where user_id=p_user and thread_id=i.thread_id and selected_batch=(i.private_input#>>'{batch,batchId}')::uuid and account_version=i.authority_account_version and privacy_epoch=i.privacy_epoch;
 if s.search_id is null then return jsonb_build_object('context',null);end if;
 perform career_application_batch_context_v1(p_user,i.thread_id,s.selected_batch);
 select v into r from jsonb_array_elements(coalesce(s.current_results,s.results))v where v->>'taskId'=p_task;
 select state->'career'into f from agent_flow_state where user_id=p_user and thread_id=i.thread_id;profile:=f#>'{stores,profile}';
 if r is null or profile is null or f#>>'{scope,userId}'is distinct from p_user::text or coalesce((f->>'privacy_epoch')::bigint,-1)is distinct from i.privacy_epoch then raise exception 'application profile context revoked';end if;
 return jsonb_build_object('context',jsonb_build_object('userId',p_user,'accountVersion',i.authority_account_version,'privacyEpoch',i.privacy_epoch,'taskId',p_task,'careerProfile',profile,'ask',s.ask,'roleInterests',s.role_interests,'currentPosting',jsonb_build_object('posting',r->'posting','observedAt',r#>>'{source,observedAt}','sourceSha256',r#>>'{source,sha256}')));
end $$;


--
-- Name: career_host_commit(uuid, uuid, text, text, bigint, bigint, jsonb, jsonb, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_host_commit(p_user uuid, p_thread uuid, p_key text, p_hash text, p_revision bigint, p_account_version bigint, p_snapshot jsonb, p_patch jsonb, p_input text, p_response jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
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
end $_$;


--
-- Name: career_host_load(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_host_load(p_user uuid, p_thread uuid, p_key text, p_hash text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
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
end $_$;


--
-- Name: career_journey_action_claim_v1(uuid, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_action_claim_v1(p_user uuid, p_thread uuid, p_action text, p_spec jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare readback jsonb;a jsonb;e jsonb;s jsonb;c jsonb;p jsonb;pol career_model_pair_policy_v2;reason text;eid uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 readback:=career_journey_action_read_v1(p_user,p_thread,p_action);if readback ? 'error' then return readback;end if;
 if readback->'execution'<>'null'::jsonb then return jsonb_build_object('execution',readback->'execution','is_new',false);end if;a:=readback->'action';
 c:=career_journey_context_read_v1(p_user,p_thread);if c ? 'error' then return c;end if;
 select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=p_thread;
 if p_spec->>'request_hash' is distinct from a#>>'{proposal,input_digest}'
 or (p_spec->>'canonical_request')::jsonb is distinct from a#>'{proposal,args,request}'
 or p_spec->>'request_digest' is distinct from encode(sha256(convert_to(p_spec->>'canonical_request','UTF8')),'hex')
 or p_spec->>'generation_payload' is distinct from encode(sha256(convert_to(p_spec->>'generation_wire_body','UTF8')),'hex')
 or (p_spec->>'generation_input')::bigint is distinct from octet_length(p_spec->>'generation_wire_body')
 or p_spec->>'verification_envelope' is distinct from encode(sha256(convert_to(p_spec->>'verification_envelope_text','UTF8')),'hex')
 or octet_length(p_spec::text)>200000 then raise exception 'invalid exact execution specification';end if;
 if c->'paused'='true'::jsonb or s->>'status' is distinct from 'active' or s#>>'{checkpoint,pending_reasoning,action_id}' is distinct from p_action
 or a#>'{proposal,expected_binding,epoch}' is distinct from c#>'{context,binding,epoch}' then reason:='context_changed';end if;
 select * into pol from career_model_pair_policy_v2 where policy_digest=p_spec->>'policy_digest' and active;
 if pol.policy_digest is null or pol.generation_config_digest is distinct from p_spec->>'generation_config_digest'
 or pol.verification_config_digest is distinct from p_spec->>'verification_config_digest'
 or pol.model is distinct from ((p_spec->>'generation_wire_body')::jsonb->>'model')
 or (p_spec->>'generation_output')::bigint is distinct from (((p_spec->>'generation_wire_body')::jsonb->>'max_completion_tokens')::bigint)then reason:='policy_unavailable';end if;
 if reason is null then
  p:=career_model_pair_reserve_v2(p_user,p_thread,p_action,p_spec->>'request_hash',(c#>>'{context,binding,thread_revision}')::bigint,(c#>>'{context,binding,account_version}')::bigint,(c#>>'{context,binding,epoch}')::bigint,p_spec->>'policy_digest',p_spec->>'generation_payload',p_spec->>'verification_envelope',(p_spec->>'generation_input')::bigint,(p_spec->>'generation_output')::bigint,(p_spec->>'verification_input')::bigint,(p_spec->>'verification_output')::bigint);
  if p->>'ok' is distinct from 'true' then reason:=p->>'reason';end if;
 end if;
 e:=jsonb_build_object('execution_id',eid,'owner_id',p_user,'thread_id',p_thread,'action_id',p_action,'epoch',c#>'{context,binding,epoch}','state',case when reason is null then 'claimed' else 'not_sent' end,'reason',reason,'pair_id',case when reason is null then p->'pair_id' else 'null'::jsonb end,'spec',p_spec,'observations','{}'::jsonb,'claimed_at',clock_timestamp());
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:journey-execution:'||p_thread||':'||p_action,e);
 return jsonb_build_object('execution',e,'is_new',true);
end $$;


--
-- Name: career_journey_action_read_v1(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_action_read_v1(p_user uuid, p_thread uuid, p_action text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare a jsonb;e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:journey-action:'||p_thread||':'||p_action;
 if a is null or a#>>'{proposal,owner_id}' is distinct from p_user::text or a#>>'{proposal,thread_id}' is distinct from p_thread::text or a#>>'{proposal,type}' is distinct from 'coach_answer' then return jsonb_build_object('error','action_unavailable');end if;
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 return jsonb_build_object('action',a,'execution',e);
end $$;


--
-- Name: career_journey_artifact_open_v1(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_artifact_open_v1(p_user uuid, p_artifact uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare a jsonb;c jsonb;s jsonb;r jsonb;rid uuid:=gen_random_uuid();t uuid;pending boolean;verified boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:journey-artifact:'||p_artifact;
 if a is null then return jsonb_build_object('error','artifact_unavailable');end if;t:=(a->>'thread_id')::uuid;
 c:=career_journey_context_read_v1(p_user,t);
 select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=t;
 pending:=coalesce(a->'delivery_binding',a->'binding')=c#>'{context,binding}' and a->>'journey_revision'=s->>'revision' and a->>'action_id'=s#>>'{checkpoint,pending_artifact,action_id}';
 verified:=a->'readable_binding'=c#>'{context,binding}' and a->>'readable_journey_revision'=s->>'revision'
  and s#>>'{completion,artifact,readback_status}'='verified' and s#>>'{completion,artifact,id}'=p_artifact::text
  and s#>'{completion,artifact,version}'=a->'version' and s#>>'{completion,artifact,sha256}'=a->>'sha256'
  and s#>>'{completion,artifact,receipt_id}'=a->>'verified_receipt_id';
 if c ? 'error' or c->'paused'='true'::jsonb or s->>'status' is distinct from 'active' or not coalesce(pending or verified,false)
 or a->>'owner_id' is distinct from p_user::text or a->>'journey_id' is distinct from s->>'journey_id'
 or a->'target_ref' is distinct from s->'target_ref' or a->'resume_ref' is distinct from s->'resume_ref'
 or a->>'sha256' is distinct from encode(sha256(convert_to(a->>'content','UTF8')),'hex')
 or (a->>'byte_length')::integer is distinct from octet_length(a->>'content')
 then return jsonb_build_object('error','artifact_unavailable');end if;
 r:=jsonb_build_object('id',rid,'type',case when pending then 'artifact_readback' else 'artifact_reopen' end,'owner_id',p_user,'thread_id',t,'epoch',a->'epoch','artifact_id',p_artifact,'artifact_version',a->'version','action_id',a->'action_id','input_digest',a->'input_digest','authorized_open',true,'fresh_session',true,'journey_revision',a->'journey_revision','validated_binding',(c#>'{context,binding}')||jsonb_build_object('owner_id',p_user,'thread_id',t,'journey_revision',a->'journey_revision'),'target_ref',a->'target_ref','resume_ref',a->'resume_ref','sha256',a->'sha256');
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:journey-readback:'||rid,jsonb_build_object('receipt',r,'artifact',a));
 return jsonb_build_object('artifact',a,'receipt',r);
end $$;


--
-- Name: career_journey_artifact_scope_v1(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_artifact_scope_v1(p_user uuid, p_artifact uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select jsonb_build_object('thread_id',(select a.value->'thread_id'from career_watch_kv a join agent_threads t on t.id=(a.value->>'thread_id')::uuid and t.user_id=p_user where a.user_id=p_user and a.key='career:journey-artifact:'||p_artifact));
$$;


--
-- Name: career_journey_checker_prepare_v1(uuid, uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_checker_prepare_v1(p_user uuid, p_thread uuid, p_action text, p_execution uuid, p_wire text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e jsonb;a jsonb;wire jsonb;input jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:journey-action:'||p_thread||':'||p_action;
 wire:=p_wire::jsonb;input:=(wire#>>'{messages,-1,content}')::jsonb;
 if e is null or e->>'execution_id' is distinct from p_execution::text or e->>'state' is distinct from 'claimed'
 or octet_length(p_wire)>(e#>>'{spec,verification_input}')::bigint
 or wire->>'model' is distinct from ((e#>>'{spec,generation_wire_body}')::jsonb->>'model')
 or (wire->>'max_completion_tokens')::bigint is distinct from (e#>>'{spec,verification_output}')::bigint
 or input->>'kind' is distinct from 'interview_checker_request/v1' or input->'request' is distinct from a#>'{proposal,args,request}'
 or input->'candidate' is distinct from (e#>>'{observations,generation,text}')::jsonb
 or input->>'request_digest' is distinct from e#>>'{spec,request_digest}'
 or(e->>'verification_wire_body' is not null and e->>'verification_wire_body' is distinct from p_wire)then raise exception 'invalid immutable checker request';end if;
 e:=e||jsonb_build_object('verification_wire_body',p_wire);
 update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 return jsonb_build_object('ok',true);
end $$;


--
-- Name: career_journey_context_basis_v1(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_context_basis_v1(p_user uuid, p_thread uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $_$
 with stores as(select thread_id,coalesce(state#>'{career,stores}','{}'::jsonb)-'interviewJourney'-'globalPause' as value from agent_flow_state where user_id=p_user),
 account_items as(select k.key,v.item-'freshness' as item from career_watch_kv k cross join lateral jsonb_array_elements(
  coalesce(k.value->'facts','[]'::jsonb)||coalesce(k.value->'sources','[]'::jsonb)||coalesce(k.value->'dialogue','[]'::jsonb)||coalesce(k.value->'goals','[]'::jsonb)||coalesce(k.value->'pending_asks','[]'::jsonb)||coalesce(k.value->'tool_status','[]'::jsonb)||coalesce(k.value->'receipts','[]'::jsonb)||coalesce(k.value->'artifacts','[]'::jsonb)||coalesce(k.value->'assessments','[]'::jsonb)||case when jsonb_typeof(k.value->'current_draft')='object'then jsonb_build_array(k.value->'current_draft')else '[]'::jsonb end)v(item)
  where k.user_id=p_user and k.key~'^career:journey-context:[a-f0-9-]{36}$'and v.item#>>'{scope,kind}'='account'),
 mutation_counts as(select count(*)filter(where key like 'career:turn:%')as turns,
  count(*)filter(where key='career:owner-mutation:'||(value->>'epoch')||':'||(value->>'account_version')and value->>'kind'='career_watch_write/v1'and value->>'owner_id'=p_user::text and value->>'epoch'=coalesce((select value->>'epoch'from career_watch_kv where user_id=p_user and key='career:account'),'0')and jsonb_typeof(value->'account_version')='number'and value->>'account_version'~'^[0-9]{1,19}$'and value->>'key_sha256'~'^[a-f0-9]{64}$')as background
  from career_watch_kv where user_id=p_user)
 select jsonb_build_object(
  'turn_count',turns,'mutation_count',turns+background,
  'thread_sha',encode(sha256(convert_to(coalesce((select value from stores where thread_id=p_thread),'{}'::jsonb)::text,'UTF8')),'hex'),
  'account_sha',encode(sha256(convert_to(jsonb_build_object('stores',coalesce((select jsonb_agg(jsonb_build_array(thread_id,value)order by thread_id)from stores where value<>'{}'::jsonb),'[]'::jsonb),'canonical',coalesce((select jsonb_agg(jsonb_build_array(key,item)order by key,item->>'id')from account_items),'[]'::jsonb),'watch_profile',(select value from career_watch_kv where user_id=p_user and key='career:watch-profile:'||p_user),'preferences',coalesce((select value-'version'-'epoch'-'paused' from career_watch_kv where user_id=p_user and key='career:account'),'{}'::jsonb))::text,'UTF8')),'hex'))from mutation_counts;
$_$;


--
-- Name: career_journey_context_commit_v1(jsonb, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_context_commit_v1(p_base jsonb, p_expected_context_sha text, p_context jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;old jsonb;a jsonb;saved jsonb;source jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select value into old from career_watch_kv where user_id=u and key='career:turn:'||t||':'||(p_base->>'p_key');
 if old is not null then
  saved:=career_host_load(u,t,p_base->>'p_key',p_base->>'p_hash');if saved ? 'error' then return saved;end if;
  return jsonb_build_object('response',saved->'replay','replay',true);
 end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 select value into old from career_watch_kv where user_id=u and key='career:journey-context:'||t;
 if old#>>'{binding,context_sha256}' is distinct from p_expected_context_sha then return jsonb_build_object('error','journey_context_unavailable');end if;
 if p_context->>'owner_id' is distinct from u::text or p_context->>'thread_id' is distinct from t::text
 or p_context->>'contract_version' is distinct from 'career_journey_context/v1' or octet_length(p_context::text)>524288
 or (p_context#>>'{binding,account_version}')::bigint is distinct from (p_base->>'p_account_version')::bigint+1
 or (p_context#>>'{binding,thread_revision}')::bigint is distinct from (p_base->>'p_revision')::bigint+1
 or (p_context#>>'{binding,epoch}')::bigint is distinct from coalesce((a->>'epoch')::bigint,0)
 or exists(select 1 from jsonb_array_elements((p_context->'facts')||(p_context->'sources')) x where x#>>'{scope,owner_id}' is distinct from u::text or(x#>>'{scope,kind}'='thread'and x#>>'{scope,thread_id}' is distinct from t::text))
 then raise exception 'invalid owned context write';end if;
 for source in select value from jsonb_array_elements(p_context->'sources') loop
  if source->>'availability'='available' and source->>'source_sha256' is distinct from encode(sha256(convert_to(source->>'content','UTF8')),'hex')then raise exception 'invalid source bytes';end if;
 end loop;
 saved:=career_host_commit(u,t,p_base->>'p_key',p_base->>'p_hash',(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,p_base->'p_snapshot',p_base->'p_patch',p_base->>'p_input',p_base->'p_response');
 if saved ? 'error' then return saved;end if;
 insert into career_watch_kv(user_id,key,value)values(u,'career:journey-context:'||t,p_context)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 return saved;
end $$;


--
-- Name: career_journey_context_content_v1(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_context_content_v1(p_context jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare c jsonb:=p_context-'binding'-'captured_at'-'invalidations';k text;rows jsonb;
begin
 foreach k in array array['facts','sources','dialogue','goals','pending_asks','tool_status','receipts','artifacts','assessments']loop
  select coalesce(jsonb_agg(value-'freshness'order by ordinality),'[]'::jsonb)into rows from jsonb_array_elements(c->k)with ordinality;
  c:=jsonb_set(c,array[k],rows);
 end loop;
 if jsonb_typeof(c->'current_draft')='object'then c:=jsonb_set(c,'{current_draft}',(c->'current_draft')-'freshness');end if;
 return c;
end $$;


--
-- Name: career_journey_context_cursor_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_context_cursor_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare t uuid;s jsonb;pending jsonb;b jsonb;
begin
 if NEW.key!~'^career:journey-context:[a-f0-9-]{36}$'then return NEW;end if;
 t:=substring(NEW.key from length('career:journey-context:')+1)::uuid;
 perform pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 if NEW.value->>'owner_id' is distinct from NEW.user_id::text or NEW.value->>'thread_id' is distinct from t::text or not exists(select 1 from agent_threads where id=t and user_id=NEW.user_id)then raise exception 'invalid owned context cursor';end if;
 select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=NEW.user_id and thread_id=t;
 select coalesce(jsonb_agg(i->'id'),'[]'::jsonb)into pending from jsonb_array_elements(coalesce(NEW.value->'invalidations','[]'::jsonb))i
  where i#>>'{provenance,record_id}'~'^authority:[a-f0-9]{64}$'and not exists(select 1 from jsonb_array_elements(coalesce(s->'invalidations','[]'::jsonb))applied where applied#>>'{provenance,record_id}'=i#>>'{provenance,record_id}')
  and(s is not null or exists(select 1 from jsonb_each(NEW.value)fields cross join lateral jsonb_array_elements(case when jsonb_typeof(fields.value)='array'then fields.value else '[]'::jsonb end)row where row->>'freshness'='stale'and(i->'target_ids')?(row->>'id'))or(NEW.value#>>'{current_draft,freshness}'='stale'and(i->'target_ids')?(NEW.value#>>'{current_draft,id}')));
 b:=career_journey_context_basis_v1(NEW.user_id,t)||jsonb_build_object('context_sha256',NEW.value#>'{binding,context_sha256}','pending_invalidation_ids',pending);
 -- An explicit owned import can still carry its older projection clock.
 -- Anchor its receipt watermark to that clock, rather than the import time.
 b:=b||jsonb_build_object('mutation_count',(b->>'mutation_count')::bigint-coalesce((select(value->>'version')::bigint from career_watch_kv where user_id=NEW.user_id and key='career:account'),0)+(NEW.value#>>'{binding,account_version}')::bigint);
 insert into career_watch_kv(user_id,key,value)values(NEW.user_id,'career:journey-context-cursor:'||t,b)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 return NEW;
end $_$;


--
-- Name: career_journey_context_load_v2(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_context_load_v2(p_user uuid, p_thread uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare c jsonb;r jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into c from career_watch_kv where user_id=p_user and key='career:journey-context:'||p_thread;
 if c is null then return jsonb_build_object('context',null);end if;
 r:=career_journey_context_read_v1(p_user,p_thread);return r;
end $$;


--
-- Name: career_journey_context_read_v1(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_context_read_v1(p_user uuid, p_thread uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare c jsonb;a jsonb;r bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select coalesce(value,'{}'::jsonb)into a from career_watch_kv where user_id=p_user and key='career:account';
 select coalesce((state#>>'{career,revision}')::bigint,0)into r from agent_flow_state where thread_id=p_thread and user_id=p_user;
 select value into c from career_watch_kv where user_id=p_user and key='career:journey-context:'||p_thread;
 if c is null or c->>'owner_id' is distinct from p_user::text or c->>'thread_id' is distinct from p_thread::text
 or (c#>>'{binding,account_version}')::bigint is distinct from coalesce((a->>'version')::bigint,0)
 or (c#>>'{binding,thread_revision}')::bigint is distinct from coalesce(r,0)
 or (c#>>'{binding,epoch}')::bigint is distinct from coalesce((a->>'epoch')::bigint,0)
 then return jsonb_build_object('error','journey_context_unavailable');end if;
 return jsonb_build_object('context',c,'paused',coalesce((a->>'paused')::boolean,false));
end $$;


--
-- Name: career_journey_context_refresh_commit_v1(uuid, uuid, text, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_context_refresh_commit_v1(p_user uuid, p_thread uuid, p_expected_hash text, p_binding jsonb, p_basis jsonb, p_context jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare loaded jsonb;old jsonb;cursor_value jsonb;s jsonb;art record;k text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 loaded:=career_journey_context_refresh_load_v1(p_user,p_thread);if loaded ? 'error'then return loaded;end if;old:=loaded->'context';
 if old is null or old='null'::jsonb then return jsonb_build_object('error','journey_context_unavailable');end if;
 if old#>'{binding,epoch}' is distinct from loaded#>'{binding,epoch}'then return jsonb_build_object('error','privacy_epoch_changed');end if;
 if old#>>'{binding,context_sha256}' is distinct from p_expected_hash or loaded->'binding' is distinct from p_binding or loaded->'basis' is distinct from p_basis then return jsonb_build_object('error','revision_conflict');end if;
 -- A source fingerprint alone cannot authorize an unexplained counter edit.
 -- Each version must have either an atomic host receipt or typed watch witness.
 -- Unsupported writers or missing witnesses fail closed; do not infer a turn.
 cursor_value:=loaded->'cursor';
 if (old->'binding')-'context_sha256' is distinct from p_binding and(
  cursor_value->>'context_sha256' is distinct from p_expected_hash or coalesce(cursor_value->'mutation_count',cursor_value->'turn_count')is null
  or (p_binding->>'account_version')::bigint<(old#>>'{binding,account_version}')::bigint
  or (p_binding->>'account_version')::bigint-(old#>>'{binding,account_version}')::bigint is distinct from (p_basis->>'mutation_count')::bigint-coalesce(cursor_value->>'mutation_count',cursor_value->>'turn_count')::bigint
  or (p_binding->>'thread_revision')::bigint<(old#>>'{binding,thread_revision}')::bigint
  or (p_binding->>'thread_revision')::bigint-(old#>>'{binding,thread_revision}')::bigint>(p_binding->>'account_version')::bigint-(old#>>'{binding,account_version}')::bigint
 )then return jsonb_build_object('error','journey_context_unavailable');end if;
 if p_context->>'owner_id' is distinct from p_user::text or p_context->>'thread_id' is distinct from p_thread::text
 or (p_context->'binding')-'context_sha256' is distinct from p_binding or p_context#>>'{binding,context_sha256}'!~'^[a-f0-9]{64}$'
 or career_journey_context_content_v1(old) is distinct from career_journey_context_content_v1(p_context)
 or not((p_context->'invalidations')@>(old->'invalidations'))then raise exception 'invalid context-only refresh';end if;
 -- Refresh cannot revive an old/stale value or change any item version/stamp.
 foreach k in array array['facts','sources','dialogue','goals','pending_asks','tool_status','receipts','artifacts','assessments']loop
  if exists(select 1 from jsonb_array_elements(old->k)o join jsonb_array_elements(p_context->k)n on n->>'id'=o->>'id'where not(n->'freshness'=o->'freshness'or(o->>'freshness'='current'and n->>'freshness'='stale')))then raise exception 'freshness revival refused';end if;
 end loop;
 if jsonb_typeof(old->'current_draft')='object'and not(p_context#>'{current_draft,freshness}'=old#>'{current_draft,freshness}'or(old#>>'{current_draft,freshness}'='current'and p_context#>>'{current_draft,freshness}'='stale'))then raise exception 'draft revival refused';end if;
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:journey-context:'||p_thread,p_context)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 select value into cursor_value from career_watch_kv where user_id=p_user and key='career:journey-context-cursor:'||p_thread;
 if jsonb_array_length(cursor_value->'pending_invalidation_ids')=0 then
  select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=p_thread;
  for art in select key,value from career_watch_kv where user_id=p_user and key like 'career:journey-artifact:%'and value->>'thread_id'=p_thread::text loop
   if art.value->>'journey_id'=s->>'journey_id'and art.value->'epoch'=p_binding->'epoch'and art.value->'target_ref'=s->'target_ref'and art.value->'resume_ref'=s->'resume_ref'
   and(art.value->>'action_id'=s#>>'{checkpoint,pending_artifact,action_id}'or(art.value->>'id'=s#>>'{completion,artifact,id}'and art.value->>'sha256'=s#>>'{completion,artifact,sha256}'and s#>>'{completion,artifact,readback_status}'='verified'))then
    update career_watch_kv set value=value||jsonb_build_object('delivery_binding',p_context->'binding')||case when s#>>'{completion,artifact,id}'=art.value->>'id'then jsonb_build_object('readable_binding',p_context->'binding','readable_journey_revision',s->'revision')else '{}'::jsonb end,updated_at=now()where user_id=p_user and key=art.key;
   end if;
  end loop;
 end if;
 return jsonb_build_object('ok',true,'context',p_context,'pending_invalidation_ids',cursor_value->'pending_invalidation_ids');
end $_$;


--
-- Name: career_journey_context_refresh_load_v1(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_context_refresh_load_v1(p_user uuid, p_thread uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare c jsonb;a jsonb;r bigint;cursor_value jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select coalesce((state#>>'{career,revision}')::bigint,0)into r from agent_flow_state where user_id=p_user and thread_id=p_thread;
 select value into c from career_watch_kv where user_id=p_user and key='career:journey-context:'||p_thread;
 select value into cursor_value from career_watch_kv where user_id=p_user and key='career:journey-context-cursor:'||p_thread;
 return jsonb_build_object('context',c,'cursor',cursor_value,'basis',career_journey_context_basis_v1(p_user,p_thread),'binding',jsonb_build_object('epoch',coalesce((a->>'epoch')::bigint,0),'account_version',coalesce((a->>'version')::bigint,0),'thread_revision',coalesce(r,0)));
end $$;


--
-- Name: career_journey_execution_fence_v1(uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_execution_fence_v1(p_user uuid, p_thread uuid, p_action text, p_execution uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action for update;
 if e is null or e->>'execution_id' is distinct from p_execution::text then raise exception 'execution unavailable';end if;
 if e->>'state'='claimed'then
  e:=e||jsonb_build_object('state','unknown');
  update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
  update career_model_reservations_v1 set expires_at=least(expires_at,clock_timestamp())where user_id=p_user and state='started'and id in(select ticket_id from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user);
 end if;
 return jsonb_build_object('execution',e);
end $$;


--
-- Name: career_journey_leg_consume_v1(uuid, uuid, text, uuid, text, text, text, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_leg_consume_v1(p_user uuid, p_thread uuid, p_action text, p_execution uuid, p_kind text, p_payload text, p_envelope text, p_input bigint, p_output bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 if e is null or e->>'execution_id' is distinct from p_execution::text or e->>'state' is distinct from 'claimed' then return jsonb_build_object('ok',false,'reason','execution_fenced');end if;
 if p_kind='verification'and(p_payload is distinct from encode(sha256(convert_to(e->>'verification_wire_body','UTF8')),'hex')or p_input is distinct from octet_length(e->>'verification_wire_body'))then return jsonb_build_object('ok',false,'reason','checker_payload_not_durable');end if;
 return career_model_leg_consume_v2(p_user,(e->>'pair_id')::uuid,p_kind,p_payload,p_envelope,p_input,p_output);
end $$;


--
-- Name: career_journey_observe_v1(uuid, uuid, text, uuid, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_observe_v1(p_user uuid, p_thread uuid, p_action text, p_execution uuid, p_kind text, p_receipt jsonb, p_text text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e jsonb;old jsonb;leg career_model_pair_legs_v2;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action for update;
 select * into leg from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user and thread_id=p_thread and kind=p_kind;
 if e is null or e->>'execution_id' is distinct from p_execution::text or leg.dispatched_payload is null or p_kind not in('generation','verification')
 or p_receipt->>'request_body_sha256' is distinct from leg.dispatched_payload or p_receipt->>'config_digest' is distinct from leg.config_digest
 or octet_length(coalesce(p_text,''))>40000 then raise exception 'invalid owned provider observation';end if;
 old:=e#>array['observations',p_kind];
 if old is not null and old->'receipt' is distinct from p_receipt then raise exception 'provider observation conflict';end if;
 if p_text is not null and old->>'text' is not null and old->>'text' is distinct from p_text then raise exception 'provider content conflict';end if;
 e:=jsonb_set(e,array['observations',p_kind],jsonb_build_object('receipt',p_receipt,'text',coalesce(p_text,old->>'text')));
 update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 return jsonb_build_object('ok',true);
end $$;


--
-- Name: career_journey_outcome_record_v1(uuid, uuid, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_outcome_record_v1(p_user uuid, p_thread uuid, p_action text, p_execution uuid, p_result jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e jsonb;p jsonb;s jsonb;old jsonb;checker jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action for update;
 if e is null or e->>'execution_id' is distinct from p_execution::text or p_result->>'kind'not in('semantic_candidate','reasoning_outcome')or octet_length(p_result::text)>100000 then raise exception 'invalid owned outcome';end if;
 if e->>'pair_id' is not null then p:=career_model_pair_read_v2(p_user,(e->>'pair_id')::uuid);else p:=jsonb_build_object('accounting_state','settled','known_cost_micros',0);end if;
 if p_result->>'budget_state'='settled' and p->>'accounting_state' is distinct from 'settled' then raise exception 'unsettled accounting';end if;
 if p_result->>'kind'='semantic_candidate' then
  checker:=(e#>>'{observations,verification,text}')::jsonb;
  select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=p_thread;
  if p#>>'{generation,state}' is distinct from 'recorded'or p#>>'{verification,state}' is distinct from 'recorded'or p->>'provider_calls_confirmed' is distinct from '2'
  or p->>'contextCurrent' is distinct from 'true' or s->>'status' is distinct from 'active' or s#>>'{checkpoint,pending_reasoning,action_id}' is distinct from p_action
  or (p_result->>'canonical_candidate')::jsonb is distinct from p_result->'candidate'
  or p_result->>'candidate_sha256' is distinct from encode(sha256(convert_to(p_result->>'canonical_candidate','UTF8')),'hex')
  or p_result->>'rendered_sha256' is distinct from encode(sha256(convert_to(p_result->>'rendered_response','UTF8')),'hex')then raise exception 'untrusted candidate publication';end if;
  if p_result->'candidate' is distinct from (e#>>'{observations,generation,text}')::jsonb
  or checker->>'version' is distinct from 'career_interview_checker/v1'or checker->>'verdict' is distinct from 'accepted'
  or checker->>'request_digest' is distinct from e#>>'{spec,request_digest}'
  or checker->>'candidate_sha256' is distinct from p_result->>'candidate_sha256'
  or checker->>'rendered_sha256' is distinct from p_result->>'rendered_sha256'
  or not coalesce(checker#>'{checks,answer_meaning}'='true'::jsonb and checker#>'{checks,factual_grounding}'='true'::jsonb and checker#>'{checks,role_constraints}'='true'::jsonb and checker#>'{checks,rubric_grounding}'='true'::jsonb and checker#>'{checks,truthfulness}'='true'::jsonb,false)then raise exception 'independent checker proof missing';end if;
 end if;
 old:=e->'result';
 if old=p_result then return jsonb_build_object('execution',e);end if;
 if old is not null and old->>'budget_state'='settled'and not(old->>'kind'='semantic_candidate'and p_result->>'kind'='reasoning_outcome'and p_result->>'failure_kind'='stale_context'and p->>'contextCurrent'='false')then raise exception 'terminal outcome conflict';end if;
 if p_result->>'budget_state'='uncertain'then
  -- Reported transport uncertainty participates immediately in the shared
  -- existing overdue-started stop, while retaining full holds. A later owned
  -- raw receipt may perform the first settlement; no dispatch is repeated.
  update career_model_reservations_v1 set expires_at=least(expires_at,clock_timestamp())where user_id=p_user and state='started'and id in(select ticket_id from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user);
 end if;
 e:=e||jsonb_build_object('state',case when p_result->>'budget_state'='settled'then 'closed'else 'unknown'end,'result',p_result,'result_receipt_id',gen_random_uuid());
 update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 return jsonb_build_object('execution',e);
end $$;


--
-- Name: career_journey_readback_v1(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_readback_v1(p_user uuid, p_thread uuid, p_receipt uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare r jsonb;c jsonb;a jsonb;s jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 c:=career_journey_context_read_v1(p_user,p_thread);if c ? 'error' then return c;end if;
 select value into r from career_watch_kv where user_id=p_user and key='career:journey-readback:'||p_receipt;
 select value into a from career_watch_kv where user_id=p_user and key='career:journey-artifact:'||(r#>>'{receipt,artifact_id}');
 select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=p_thread;
 if r is null or a is null or r#>>'{receipt,type}' is distinct from 'artifact_readback' or r#>>'{receipt,thread_id}' is distinct from p_thread::text
 or r#>'{artifact,binding}' is distinct from a->'binding' or coalesce(a->'delivery_binding',a->'binding')is distinct from c#>'{context,binding}'
 or a->>'sha256' is distinct from r#>>'{receipt,sha256}' or a->>'action_id' is distinct from s#>>'{checkpoint,pending_artifact,action_id}'then return jsonb_build_object('error','artifact_unavailable');end if;
 -- Revalidate identical previously opened bytes against the current owned
 -- counter-only delivery binding; keep the original immutable open proof.
 return jsonb_build_object('artifact',a,'receipt',(r->'receipt')||jsonb_build_object('original_validated_binding',r#>'{receipt,validated_binding}','validated_binding',(r#>'{receipt,validated_binding}')||(c#>'{context,binding}')));
end $$;


--
-- Name: career_journey_turn_commit_v1(jsonb, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_journey_turn_commit_v1(p_base jsonb, p_context jsonb, p_actions jsonb, p_artifact jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;readback jsonb;c jsonb;saved jsonb;act jsonb;old jsonb;action_key text;artid uuid;verified jsonb;opened jsonb;existing_artifact jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 -- Replay lookup precedes current-context validation and performs no write.
 select value into old from career_watch_kv where user_id=u and key='career:turn:'||t||':'||(p_base->>'p_key');
 if old is not null then
  saved:=career_host_load(u,t,p_base->>'p_key',p_base->>'p_hash');
  if saved ? 'error' then return saved;end if;
  return jsonb_build_object('response',saved->'replay','replay',true);
 end if;
 readback:=career_journey_context_read_v1(u,t);if readback ? 'error' then return readback;end if;c:=readback->'context';
 if (p_context-'binding'-'captured_at') is distinct from (c-'binding'-'captured_at')
 or (p_context#>>'{binding,account_version}')::bigint is distinct from (p_base->>'p_account_version')::bigint+1
 or (p_context#>>'{binding,thread_revision}')::bigint is distinct from (p_base->>'p_revision')::bigint+1
 or p_context#>>'{binding,epoch}' is distinct from c#>>'{binding,epoch}'
 or p_context#>>'{binding,context_sha256}' !~ '^[a-f0-9]{64}$'
 or jsonb_typeof(p_actions) is distinct from 'array' or jsonb_array_length(p_actions)>8
 then raise exception 'invalid journey commit';end if;
 for act in select value from jsonb_array_elements(p_actions) loop
  if act#>>'{proposal,owner_id}' is distinct from u::text or act#>>'{proposal,thread_id}' is distinct from t::text
  or act#>>'{proposal,action_id}' !~ '^ij-[a-f0-9]{24}$'
  or encode(sha256(convert_to(act->>'canonical_args','UTF8')),'hex') is distinct from act#>>'{proposal,input_digest}'
  or (act->>'canonical_args')::jsonb is distinct from act#>'{proposal,args}' then raise exception 'invalid durable proposal';end if;
  action_key:='career:journey-action:'||t||':'||(act#>>'{proposal,action_id}');
  select value into old from career_watch_kv where user_id=u and career_watch_kv.key=action_key;
  if old is not null and old is distinct from act then raise exception 'durable proposal conflict';end if;
 end loop;
 if p_artifact is not null and p_artifact<>'null'::jsonb then
  artid:=(p_artifact->>'id')::uuid;
  if p_artifact->>'owner_id' is distinct from u::text or p_artifact->>'thread_id' is distinct from t::text
  or p_artifact->'binding' is distinct from p_context->'binding'
  or p_artifact->>'mime_type' is distinct from 'text/markdown; charset=utf-8'
  or p_artifact->>'encoding' is distinct from 'utf-8'
  or octet_length(p_artifact->>'content') not between 1 and 262144
  or (p_artifact->>'byte_length')::integer is distinct from octet_length(p_artifact->>'content')
  or p_artifact->>'sha256' is distinct from encode(sha256(convert_to(p_artifact->>'content','UTF8')),'hex')
  or p_artifact->>'action_id' is distinct from p_base#>>'{p_snapshot,stores,interviewJourney,checkpoint,pending_artifact,action_id}'
  or p_artifact->>'sha256' is distinct from p_base#>>'{p_snapshot,stores,interviewJourney,checkpoint,pending_artifact,sha256}'
  then raise exception 'invalid artifact';end if;
 end if;
 saved:=career_host_commit(u,t,p_base->>'p_key',p_base->>'p_hash',(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,p_base->'p_snapshot',p_base->'p_patch',p_base->>'p_input',p_base->'p_response');
 if saved ? 'error' then return saved;end if;
 insert into career_watch_kv(user_id,key,value)values(u,'career:journey-context:'||t,p_context)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 for act in select value from jsonb_array_elements(p_actions) loop
  insert into career_watch_kv(user_id,key,value)values(u,'career:journey-action:'||t||':'||(act#>>'{proposal,action_id}'),act)on conflict(user_id,key)do nothing;
 end loop;
 if artid is not null then insert into career_watch_kv(user_id,key,value)values(u,'career:journey-artifact:'||artid,p_artifact);end if;
 -- Acknowledgement advances the turn/context binding without changing bytes.
 -- Retain a distinct current delivery binding for verified, still-current packs.
 verified:=p_base#>'{p_snapshot,stores,interviewJourney,completion,artifact}';
 if verified->>'readback_status'='verified' then
  select value into existing_artifact from career_watch_kv where user_id=u and key='career:journey-artifact:'||(verified->>'id') for update;
  select value into opened from career_watch_kv where user_id=u and key='career:journey-readback:'||(verified->>'receipt_id');
  if existing_artifact is null or opened is null or opened#>>'{receipt,type}' is distinct from 'artifact_readback'
  or existing_artifact->>'thread_id' is distinct from t::text or existing_artifact->>'sha256' is distinct from verified->>'sha256'
  or existing_artifact->'version' is distinct from verified->'version' or opened#>'{artifact,binding}' is distinct from existing_artifact->'binding'
  or existing_artifact->'target_ref' is distinct from p_base#>'{p_snapshot,stores,interviewJourney,target_ref}'
  or existing_artifact->'resume_ref' is distinct from p_base#>'{p_snapshot,stores,interviewJourney,resume_ref}'
  or existing_artifact->'epoch' is distinct from p_context#>'{binding,epoch}' then raise exception 'invalid verified artifact';end if;
  update career_watch_kv set value=value||jsonb_build_object('readable_binding',p_context->'binding','readable_journey_revision',p_base#>'{p_snapshot,stores,interviewJourney,revision}','verified_receipt_id',verified->'receipt_id'),updated_at=now()
   where user_id=u and key='career:journey-artifact:'||(verified->>'id');
 end if;
 return saved;
end $_$;


--
-- Name: career_model_budget_consume_v1(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_model_budget_consume_v1(p_user uuid, p_ticket uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare r career_model_reservations_v1;c career_model_campaign_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into r from career_model_reservations_v1 where id=p_ticket and user_id=p_user for update;
 select * into c from career_model_campaign_v1 where campaign='owner-shared-5usd' for update;
 if r.id is null or r.state<>'reserved' or r.expires_at<=now() or c.campaign is null or not c.reconciled or c.expires_at<=now() or c.provider is distinct from r.provider or c.model is distinct from r.model or c.price_key is distinct from r.price_key or not career_model_context_current_v1(p_user,r.thread_id,r.revision,r.account_version,r.epoch) then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 -- Admission is not dispatch. Recheck the global stop under the same campaign
 -- lock used by settlement, including tickets granted before another owner
 -- tripped it. A refused reserved ticket can still settle as not_sent.
 if (select count(*) from (select 1 from career_model_reservations_v1 where state='unknown' or (state='started' and expires_at<=now()) limit 3) uncertain)>=3 then return jsonb_build_object('ok',false,'reason','usage_review_required');end if;
 update career_model_reservations_v1 set state='started' where id=r.id;
 return jsonb_build_object('ok',true,'ticket',r.id);
end $$;


--
-- Name: career_model_budget_reserve_v1(uuid, uuid, text, text, text, bigint, bigint, bigint, text, text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_model_budget_reserve_v1(p_user uuid, p_thread uuid, p_key text, p_hash text, p_payload text, p_revision bigint, p_version bigint, p_epoch bigint, p_provider text, p_model text, p_price text, p_bound bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare c career_model_campaign_v1;r career_model_reservations_v1;
begin
 if p_user is null or p_thread is null or coalesce(p_key,'') !~ '^[A-Za-z0-9_-]{1,128}$' or coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' or coalesce(p_payload,'') !~ '^[a-f0-9]{64}$' or coalesce(p_bound,0) not between 1 and 25000 or p_revision is null or p_version is null or p_epoch is null then return jsonb_build_object('ok',false,'reason','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not career_model_context_current_v1(p_user,p_thread,p_revision,p_version,p_epoch) then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 select * into c from career_model_campaign_v1 where campaign='owner-shared-5usd' for update;
 if c.campaign is null or not c.reconciled or c.expires_at<=now() or c.provider is distinct from p_provider or c.model is distinct from p_model or c.price_key is distinct from p_price then return jsonb_build_object('ok',false,'reason','budget_unavailable');end if;
 select * into r from career_model_reservations_v1 where user_id=p_user and thread_id=p_thread and turn_key=p_key;
 if r.id is not null then return jsonb_build_object('ok',false,'reason',case when r.request_hash<>p_hash or r.payload_hash<>p_payload then 'turn_key_conflict' else 'already_reserved' end);end if;
 -- A crashed caller may never settle its started ticket. After the receipt
 -- deadline it is uncertain too; its full bound remains charged.
 if (select count(*) from (select 1 from career_model_reservations_v1 where state='unknown' or (state='started' and expires_at<=now()) limit 3) uncertain)>=3 then return jsonb_build_object('ok',false,'reason','usage_review_required');end if;
 if c.opening_micros+c.current_micros+p_bound>c.limit_micros then return jsonb_build_object('ok',false,'reason','budget_exhausted');end if;
 insert into career_model_reservations_v1(user_id,thread_id,turn_key,request_hash,payload_hash,provider,model,price_key,revision,account_version,epoch,bound_micros)values(p_user,p_thread,p_key,p_hash,p_payload,p_provider,p_model,p_price,p_revision,p_version,p_epoch,p_bound) returning * into r;
 update career_model_campaign_v1 set current_micros=current_micros+p_bound where campaign=c.campaign;
 return jsonb_build_object('ok',true,'ticket',r.id,'boundMicros',r.bound_micros);
end $_$;


--
-- Name: career_model_budget_settle_v1(uuid, uuid, text, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_model_budget_settle_v1(p_user uuid, p_ticket uuid, p_outcome text, p_cost bigint, p_usage jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare r career_model_reservations_v1;charged bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into r from career_model_reservations_v1 where id=p_ticket and user_id=p_user for update;
 if r.id is null or coalesce(p_outcome,'') not in ('recorded','unknown','not_sent') then raise exception 'invalid owned model settlement';end if;
 if (p_outcome='not_sent' and (r.state not in ('reserved','not_sent') or p_cost is distinct from 0)) or (p_outcome='recorded' and (r.state not in ('started','recorded') or p_cost is null or p_cost<0 or p_cost>r.bound_micros or jsonb_typeof(p_usage) is distinct from 'object')) or (p_outcome='unknown' and r.state not in ('started','unknown')) then raise exception 'invalid model effect outcome';end if;
 charged:=case when p_outcome='unknown' then r.bound_micros else p_cost end;
 if r.state in ('recorded','unknown','not_sent') then
  if r.state<>p_outcome or r.cost_micros is distinct from charged or r.usage is distinct from p_usage then raise exception 'model settlement conflict';end if;
 else
  perform 1 from career_model_campaign_v1 where campaign='owner-shared-5usd' for update;
  if not found then raise exception 'model campaign missing during settlement';end if;
  update career_model_campaign_v1 set current_micros=current_micros-r.bound_micros+charged where campaign='owner-shared-5usd';
  update career_model_reservations_v1 set state=p_outcome,cost_micros=charged,usage=p_usage where id=r.id;
 end if;
 return jsonb_build_object('ok',true,'state',p_outcome,'contextCurrent',career_model_context_current_v1(p_user,r.thread_id,r.revision,r.account_version,r.epoch));
end $$;


--
-- Name: career_model_context_barrier_v2(uuid, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_model_context_barrier_v2(p_user uuid, p_epoch bigint, p_version bigint) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 with stamped as (
 select (value#>>'{response,meta,career_dialogue,account_version}')::bigint v,
 value#>>'{response,meta,career_dialogue,barrier}'='true' barrier
 from career_watch_kv where user_id=p_user and key like 'career:turn:%' and value->>'epoch'=p_epoch::text
 and value#>>'{response,meta,career_dialogue,version}'='career_dialogue/v2'
 ), owned_versions as (select v,bool_or(barrier) barrier from stamped where v between 1 and p_version group by v),
 ordered as (select v,barrier,lag(v,1,0::bigint)over(order by v) previous from owned_versions)
 select greatest(coalesce(max(v)filter(where barrier),0),coalesce(max(case when v>previous+1 then v-1 else 0 end),0),case when coalesce(max(v),0)<p_version then p_version else 0 end) from ordered;
$$;


--
-- Name: career_model_context_current_v1(uuid, uuid, bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_model_context_current_v1(p_user uuid, p_thread uuid, p_revision bigint, p_version bigint, p_epoch bigint) RETURNS boolean
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select exists(select 1 from agent_threads t left join agent_flow_state f on f.thread_id=t.id and f.user_id=p_user left join career_watch_kv a on a.user_id=p_user and a.key='career:account'
 where t.id=p_thread and t.user_id=p_user and coalesce((f.state#>>'{career,revision}')::bigint,0)=p_revision and coalesce((a.value->>'version')::bigint,0)=p_version and coalesce((a.value->>'epoch')::bigint,0)=p_epoch and a.value->'paused' is distinct from 'true'::jsonb);
$$;


--
-- Name: career_model_context_read_v2(uuid, uuid, bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_model_context_read_v2(p_user uuid, p_thread uuid, p_revision bigint, p_version bigint, p_epoch bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare barrier bigint; dialogue jsonb; draft jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not career_model_context_current_v1(p_user,p_thread,p_revision,p_version,p_epoch) then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 barrier:=career_model_context_barrier_v2(p_user,p_epoch,p_version);
 select coalesce(jsonb_agg(x.body order by x.n),'[]'::jsonb) into dialogue from (
 select (value#>>'{response,meta,career_dialogue,account_version}')::bigint n,
 jsonb_build_object('user',left(value#>>'{response,meta,career_dialogue,user_text}',1200),'assistant',left(value#>>'{response,reply}',1800)) body
 from career_watch_kv where user_id=p_user and key like 'career:turn:'||p_thread||':%' and value->>'epoch'=p_epoch::text
 and value#>>'{response,meta,career_dialogue,version}'='career_dialogue/v2'
 and (value#>>'{response,meta,career_dialogue,account_version}')::bigint>barrier
 and (value#>>'{response,meta,career_dialogue,account_version}')::bigint<=p_version
 order by n desc limit 8) x;
 select value#>'{response,meta,career_model,current_draft}' into draft from career_watch_kv
 where user_id=p_user and key like 'career:turn:'||p_thread||':%' and value->>'epoch'=p_epoch::text
 and value#>>'{response,meta,career_dialogue,version}'='career_dialogue/v2'
 and (value#>>'{response,meta,career_dialogue,account_version}')::bigint>barrier
 and (value#>>'{response,meta,career_dialogue,account_version}')::bigint<=p_version
 and value#>>'{response,meta,career_model,current_draft,status}'='draft_not_sent'
 order by (value#>>'{response,meta,career_dialogue,account_version}')::bigint desc limit 1;
 return jsonb_build_object('ok',true,'user_id',p_user,'thread_id',p_thread,'revision',p_revision,'account_version',p_version,'epoch',p_epoch,'barrier_version',barrier,'dialogue',dialogue,'current_draft',draft);
end $$;


--
-- Name: career_model_leg_consume_v2(uuid, uuid, text, text, text, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_model_leg_consume_v2(p_user uuid, p_pair uuid, p_kind text, p_payload text, p_envelope text, p_input bigint, p_output bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare p career_model_pairs_v2;l career_model_pair_legs_v2;r career_model_reservations_v1;pol career_model_pair_policy_v2;c career_model_campaign_v1;used jsonb;
begin
 if p_user is null or coalesce(p_kind,'')not in('generation','verification')or coalesce(p_payload,'')!~'^[a-f0-9]{64}$'then return jsonb_build_object('ok',false,'reason','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into p from career_model_pairs_v2 where id=p_pair and user_id=p_user;
 select * into l from career_model_pair_legs_v2 where pair_id=p_pair and user_id=p_user and kind=p_kind for update;
 if p.id is null or l.ticket_id is null then return jsonb_build_object('ok',false,'reason','not_found');end if;
 select * into r from career_model_reservations_v1 where id=l.ticket_id and user_id=p_user and thread_id=p.thread_id for update;
 select * into pol from career_model_pair_policy_v2 where policy_digest=p.policy_digest and active for share;
 select * into c from career_model_campaign_v1 where campaign='owner-shared-5usd'for update;
 if r.id is null or r.state<>'reserved'or p.deadline<=clock_timestamp()or r.expires_at<=clock_timestamp()or not career_model_context_current_v1(p_user,p.thread_id,p.revision,p.account_version,p.epoch)then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 if pol.policy_digest is null or c.campaign is null or not c.reconciled or c.expires_at<=clock_timestamp()or c.provider is distinct from pol.provider or c.model is distinct from pol.model or c.price_key is distinct from pol.price_key or r.provider is distinct from pol.provider or r.model is distinct from pol.model or r.price_key is distinct from pol.price_key or l.config_digest is distinct from(case when p_kind='generation'then pol.generation_config_digest else pol.verification_config_digest end)then return jsonb_build_object('ok',false,'reason','policy_unavailable');end if;
 if(select count(*)from(select 1 from career_model_reservations_v1 where state='unknown'or(state='started'and expires_at<=clock_timestamp())limit 3)u)>=3 then return jsonb_build_object('ok',false,'reason','usage_review_required');end if;
 if p_envelope is distinct from l.reserved_envelope or coalesce(p_input,0)not between 1 and l.input_bound or coalesce(p_output,0)not between 1 and l.output_bound or(p_kind='generation'and(p_payload is distinct from p.generation_payload or p_input<>l.input_bound or p_output<>l.output_bound))then return jsonb_build_object('ok',false,'reason','payload_conflict');end if;
 if p_kind='verification'and not exists(select 1 from career_model_pair_legs_v2 g join career_model_reservations_v1 t on t.id=g.ticket_id and t.user_id=p_user where g.pair_id=p.id and g.user_id=p_user and g.kind='generation'and t.state='recorded'and g.raw_usage_receipt is not null)then return jsonb_build_object('ok',false,'reason','generation_not_recorded');end if;
 used:=career_model_budget_consume_v1(p_user,l.ticket_id);if used->>'ok'is distinct from 'true'then return used;end if;
 update career_model_pair_legs_v2 set dispatched_payload=p_payload,dispatched_input=p_input,dispatched_output=p_output,started_at=clock_timestamp()where pair_id=p.id and user_id=p_user and kind=p_kind;
 return jsonb_build_object('ok',true,'pair_id',p.id,'kind',p_kind,'ticket',l.ticket_id,'payload_sha256',p_payload);
end $_$;


--
-- Name: career_model_leg_settle_v2(uuid, uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_model_leg_settle_v2(p_user uuid, p_pair uuid, p_kind text, p_outcome text, p_receipt jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare p career_model_pairs_v2;l career_model_pair_legs_v2;r career_model_reservations_v1;pol career_model_pair_policy_v2;fingerprint text;valid boolean:=true;u jsonb;details jsonb;prompt bigint;completion bigint;cached bigint:=0;cost bigint;outcome text;normalized jsonb;k text;done jsonb;deleted bigint;
begin
 if p_user is null or coalesce(p_kind,'')not in('generation','verification')or coalesce(p_outcome,'')not in('recorded','unknown','not_sent')then raise exception 'invalid owned pair settlement';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into p from career_model_pairs_v2 where id=p_pair and user_id=p_user for update;
 select * into l from career_model_pair_legs_v2 where pair_id=p_pair and user_id=p_user and kind=p_kind for update;
 if p.id is null or l.ticket_id is null then raise exception 'invalid owned pair settlement';end if;
 select * into r from career_model_reservations_v1 where id=l.ticket_id and user_id=p_user and thread_id=p.thread_id for update;
 select * into pol from career_model_pair_policy_v2 where policy_digest=p.policy_digest;
 if r.id is null or pol.policy_digest is null then raise exception 'pair obligation unavailable';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('outcome',p_outcome,'receipt',p_receipt)::text,'UTF8')),'hex');
 if l.settlement_request_hash is not null then
  if l.settlement_request_hash<>fingerprint then raise exception 'paired settlement conflict';end if;
  return career_model_pair_read_v2(p_user,p.id)||jsonb_build_object('state',r.state,'cost_micros',r.cost_micros);
 end if;
 if p_outcome='not_sent'then
  if r.state<>'reserved'or p_receipt is not null then raise exception 'started calls cannot refund';end if;
  update career_model_pair_legs_v2 set monthly_id=null where pair_id=p.id and user_id=p_user and kind=p_kind;
  delete from agent_model_calls where id=l.monthly_id and user_id=p_user and thread_id=p.thread_id and request_id=p.id and step=case when p_kind='generation'then 0 else 1 end and state='reserved'and usage is null;
  get diagnostics deleted=row_count;if deleted<>1 then raise exception 'monthly refund unconfirmed';end if;
  done:=career_model_budget_settle_v1(p_user,l.ticket_id,'not_sent',0,'{}'::jsonb);outcome:='not_sent';cost:=0;
 else
  if r.state<>'started'or l.dispatched_payload is null then raise exception 'only started legs may settle usage';end if;
  valid:=p_outcome='recorded'and jsonb_typeof(p_receipt)='object'and octet_length(p_receipt::text)<=16384;
  if valid then
   -- Finite reviewed response mapping. Configuration/pricing stay pinned to
   -- the policy model; retain the observed snapshot in the original receipt.
   valid:=p_receipt->>'version'='gateway_usage_receipt/v1'and p_receipt->>'provider'=pol.provider and p_receipt->>'configured_model'=pol.model and(p_receipt->>'response_model'=pol.model or(pol.model='gpt-5-nano'and p_receipt->>'response_model'='gpt-5-nano-2025-08-07'))and coalesce(p_receipt->>'response_id','')~'^[A-Za-z0-9_-]{1,128}$'and p_receipt->>'request_body_sha256'=l.dispatched_payload and coalesce(p_receipt->>'response_body_sha256','')~'^[a-f0-9]{64}$'and jsonb_typeof(p_receipt->'usage')='object';
   if p_receipt?'config_digest' and p_receipt->>'config_digest' is distinct from l.config_digest then valid:=false;end if;
   if exists(select 1 from jsonb_object_keys(p_receipt)t(k)where t.k not in('version','provider','configured_model','response_model','response_id','request_body_sha256','response_body_sha256','usage','config_digest'))then valid:=false;end if;
  end if;
  if coalesce(valid,false)then
   u:=p_receipt->'usage';
   if exists(select 1 from jsonb_object_keys(u)t(k)where t.k not in('prompt_tokens','completion_tokens','total_tokens','prompt_tokens_details','completion_tokens_details'))then valid:=false;end if;
   foreach k in array array['prompt_tokens','completion_tokens']loop if jsonb_typeof(u->k)is distinct from 'number'or coalesce(u->>k,'')!~'^[0-9]{1,8}$'then valid:=false;end if;end loop;
   if valid then
    prompt:=(u->>'prompt_tokens')::bigint;completion:=(u->>'completion_tokens')::bigint;
    if prompt>10000000 or completion>10000000 or prompt>l.dispatched_input or completion>l.dispatched_output then valid:=false;end if;
    if u?'total_tokens'then if jsonb_typeof(u->'total_tokens')is distinct from 'number'or coalesce(u->>'total_tokens','')!~'^[0-9]{1,8}$'then valid:=false;elsif(u->>'total_tokens')::bigint<>prompt+completion then valid:=false;end if;end if;
    details:=u->'prompt_tokens_details';
    if details is not null and details<>'null'::jsonb then
     if jsonb_typeof(details)is distinct from 'object'then valid:=false;
     else
      if exists(select 1 from jsonb_object_keys(details)t(k)where t.k not in('cached_tokens','audio_tokens'))then valid:=false;end if;
      if details?'audio_tokens'and(jsonb_typeof(details->'audio_tokens')is distinct from 'number'or coalesce(details->>'audio_tokens','')<>'0')then valid:=false;end if;
      if details?'cached_tokens'then if jsonb_typeof(details->'cached_tokens')is distinct from 'number'or coalesce(details->>'cached_tokens','')!~'^[0-9]{1,8}$'then valid:=false;else cached:=(details->>'cached_tokens')::bigint;end if;end if;
     end if;
    end if;
    details:=u->'completion_tokens_details';
    if details is not null and details<>'null'::jsonb then
     if jsonb_typeof(details)is distinct from 'object'then valid:=false;
     else
      if exists(select 1 from jsonb_object_keys(details)t(k)where t.k not in('reasoning_tokens','audio_tokens','accepted_prediction_tokens','rejected_prediction_tokens'))then valid:=false;end if;
      -- These documented fields are optional zeros for this text-only policy.
      -- Nonzero, coerced or unsupported usage never becomes a known cheap bill.
      foreach k in array array['audio_tokens','accepted_prediction_tokens','rejected_prediction_tokens']loop
       if details?k and(jsonb_typeof(details->k)is distinct from 'number'or coalesce(details->>k,'')<>'0')then valid:=false;end if;
      end loop;
      if details?'reasoning_tokens'then if jsonb_typeof(details->'reasoning_tokens')is distinct from 'number'or coalesce(details->>'reasoning_tokens','')!~'^[0-9]{1,8}$'then valid:=false;elsif(details->>'reasoning_tokens')::bigint>completion then valid:=false;end if;end if;
     end if;
    end if;
    if cached>prompt then valid:=false;end if;
    if valid then cost:=((prompt-cached)*pol.input_nanos+cached*pol.cached_nanos+completion*pol.output_nanos+999)/1000;if cost>r.bound_micros then valid:=false;end if;end if;
   end if;
  end if;
  if coalesce(valid,false)then
   normalized:=jsonb_build_object('input_tokens',prompt-cached,'output_tokens',completion,'cache_read_tokens',cached,'cache_write_tokens',0);
   perform agent_model_call_record(l.monthly_id,normalized);
   if not exists(select 1 from agent_model_calls m join agent_usage a on a.call_id=m.id and a.user_id=m.user_id and a.thread_id=m.thread_id where m.id=l.monthly_id and m.user_id=p_user and m.thread_id=p.thread_id and m.request_id=p.id and m.step=case when p_kind='generation'then 0 else 1 end and m.state='recorded'and m.usage=normalized and a.model=pol.model and a.input_tokens=prompt-cached and a.output_tokens=completion and a.cache_read_tokens=cached and a.cache_write_tokens=0)then raise exception 'monthly usage readback unconfirmed';end if;
   done:=career_model_budget_settle_v1(p_user,l.ticket_id,'recorded',cost,p_receipt);outcome:='recorded';
  else
   cost:=r.bound_micros;done:=career_model_budget_settle_v1(p_user,l.ticket_id,'unknown',null,null);outcome:='unknown';
  end if;
 end if;
 if done->>'ok'is distinct from 'true'then raise exception 'paired global settlement unconfirmed';end if;
 update career_model_pair_legs_v2 set settlement_request_hash=fingerprint,settled_at=clock_timestamp(),raw_usage_receipt=case when outcome='recorded'then p_receipt else null end,provider_response_id=case when outcome='recorded'then p_receipt->>'response_id'else null end where pair_id=p.id and user_id=p_user and kind=p_kind;
 update career_model_pairs_v2 set settlement_revision=settlement_revision+1 where id=p.id and user_id=p_user;
 return career_model_pair_read_v2(p_user,p.id)||jsonb_build_object('state',outcome,'cost_micros',cost);
end $_$;


--
-- Name: career_model_pair_read_v2(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_model_pair_read_v2(p_user uuid, p_pair uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare p career_model_pairs_v2;g jsonb;v jsonb;known bigint;held bigint;uncertain bigint;terminal bigint;possible bigint;confirmed bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into p from career_model_pairs_v2 where id=p_pair and user_id=p_user;
 if p.id is null or not exists(select 1 from agent_threads where id=p.thread_id and user_id=p_user)then return jsonb_build_object('ok',false,'reason','not_found');end if;
 select jsonb_object_agg(l.kind,jsonb_build_object('kind',l.kind,'ticket',r.id,'monthly_call_id',l.monthly_id,'bound_micros',r.bound_micros,'state',r.state,'cost_micros',r.cost_micros,'dispatch_payload',l.dispatched_payload,'config_digest',l.config_digest,'raw_usage_receipt',case when r.state='recorded'then l.raw_usage_receipt else null end,'provider_response_id',case when r.state='recorded'then l.provider_response_id else null end,'settled_at',l.settled_at,'receipt_ref',case when l.settlement_request_hash is not null then l.ticket_id::text else null end)) into g
 from career_model_pair_legs_v2 l join career_model_reservations_v1 r on r.id=l.ticket_id and r.user_id=l.user_id and r.thread_id=l.thread_id where l.pair_id=p.id and l.user_id=p_user and l.thread_id=p.thread_id;
 v:=g->'verification';g:=g->'generation';
 select coalesce(sum(r.cost_micros)filter(where r.state='recorded'),0),coalesce(sum(r.bound_micros)filter(where r.state='reserved'),0),coalesce(sum(r.bound_micros)filter(where r.state in('started','unknown')),0),count(*)filter(where r.state in('recorded','unknown','not_sent')),count(*)filter(where r.state in('started','recorded','unknown')),count(*)filter(where r.state='recorded'and l.raw_usage_receipt is not null)
 into known,held,uncertain,terminal,possible,confirmed from career_model_pair_legs_v2 l join career_model_reservations_v1 r on r.id=l.ticket_id and r.user_id=p_user and r.thread_id=p.thread_id where l.pair_id=p.id and l.user_id=p_user and l.thread_id=p.thread_id;
 return jsonb_build_object('ok',true,'pair_id',p.id,'generation',g,'verification',v,'parent_bound_micros',p.parent_bound_micros,'known_cost_micros',known,'held_micros',held,'uncertain_micros',uncertain,'accounting_state',case when uncertain>0 then 'uncertain'when terminal=2 then 'settled'else 'reserved'end,'publication_state',p.publication_state,'settlement_revision',p.settlement_revision,'deadline',p.deadline,'provider_calls_possible',possible,'provider_calls_confirmed',confirmed,'dispatch_count_basis','started legs may have dispatched; only recorded receipts confirm responses','contextCurrent',career_model_context_current_v1(p_user,p.thread_id,p.revision,p.account_version,p.epoch));
end $$;


--
-- Name: career_model_pair_reserve_v2(uuid, uuid, text, text, bigint, bigint, bigint, text, text, text, bigint, bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_model_pair_reserve_v2(p_user uuid, p_thread uuid, p_key text, p_hash text, p_revision bigint, p_version bigint, p_epoch bigint, p_policy text, p_generation_payload text, p_verification_envelope text, p_generation_input bigint, p_generation_output bigint, p_verification_input bigint, p_verification_output bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare p career_model_pairs_v2;pol career_model_pair_policy_v2;c career_model_campaign_v1;gb bigint;vb bigint;g jsonb;v jsonb;gm jsonb;vm jsonb;result jsonb;
begin
 if p_user is null or p_thread is null or coalesce(p_key,'')!~'^[A-Za-z0-9_-]{1,128}$'or coalesce(p_hash,'')!~'^[a-f0-9]{64}$'or coalesce(p_policy,'')!~'^[a-f0-9]{64}$'or coalesce(p_generation_payload,'')!~'^[a-f0-9]{64}$'or coalesce(p_verification_envelope,'')!~'^[a-f0-9]{64}$'or p_revision is null or p_version is null or p_epoch is null or p_revision<0 or p_version<0 or p_epoch<0 then return jsonb_build_object('ok',false,'reason','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not career_model_context_current_v1(p_user,p_thread,p_revision,p_version,p_epoch)then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 select * into p from career_model_pairs_v2 where user_id=p_user and thread_id=p_thread and turn_key=p_key;
 if p.id is not null then
  if p.request_hash is distinct from p_hash or p.policy_digest is distinct from p_policy or p.generation_payload is distinct from p_generation_payload or p.verification_envelope is distinct from p_verification_envelope or p.revision<>p_revision or p.account_version<>p_version or p.epoch<>p_epoch or not exists(select 1 from career_model_pair_legs_v2 where pair_id=p.id and kind='generation'and input_bound=p_generation_input and output_bound=p_generation_output)or not exists(select 1 from career_model_pair_legs_v2 where pair_id=p.id and kind='verification'and input_bound=p_verification_input and output_bound=p_verification_output)then return jsonb_build_object('ok',false,'reason','turn_key_conflict');end if;
  return career_model_pair_read_v2(p_user,p.id)||jsonb_build_object('is_new',false);
 end if;
 select * into pol from career_model_pair_policy_v2 where policy_digest=p_policy and active for share;
 if pol.policy_digest is null then return jsonb_build_object('ok',false,'reason','policy_unavailable');end if;
 if coalesce(p_generation_input,0)not between 1 and pol.max_input_bound or coalesce(p_verification_input,0)not between 1 and pol.max_input_bound or coalesce(p_generation_output,0)not between 1 and pol.max_generation_output or coalesce(p_verification_output,0)not between 1 and pol.max_verification_output then return jsonb_build_object('ok',false,'reason','invalid_bounds');end if;
 gb:=(p_generation_input*pol.input_nanos+p_generation_output*pol.output_nanos+999)/1000;vb:=(p_verification_input*pol.input_nanos+p_verification_output*pol.output_nanos+999)/1000;
 if gb not between 1 and 25000 or vb not between 1 and 25000 then return jsonb_build_object('ok',false,'reason','invalid_bounds');end if;
 select * into c from career_model_campaign_v1 where campaign='owner-shared-5usd'for update;
 if c.campaign is null or not c.reconciled or c.expires_at<=clock_timestamp()or c.provider is distinct from pol.provider or c.model is distinct from pol.model or c.price_key is distinct from pol.price_key then return jsonb_build_object('ok',false,'reason','budget_unavailable');end if;
 if(select count(*)from(select 1 from career_model_reservations_v1 where state='unknown'or(state='started'and expires_at<=clock_timestamp())limit 3)u)>=3 then return jsonb_build_object('ok',false,'reason','usage_review_required');end if;
 if c.opening_micros+c.current_micros+gb+vb>c.limit_micros then return jsonb_build_object('ok',false,'reason','budget_exhausted');end if;
 -- The subtransaction rolls back BOTH global holds and any first monthly slot
 -- when the second slot is unavailable. Legacy monthly admission holds its
 -- existing auth-user quota lock through this outer transaction.
 begin
  insert into career_model_pairs_v2(user_id,thread_id,turn_key,request_hash,revision,account_version,epoch,policy_digest,generation_payload,verification_envelope,parent_bound_micros,deadline)values(p_user,p_thread,p_key,p_hash,p_revision,p_version,p_epoch,p_policy,p_generation_payload,p_verification_envelope,gb+vb,clock_timestamp()+interval '20 seconds')returning * into p;
  g:=career_model_budget_reserve_v1(p_user,p_thread,'p2_'||replace(p.id::text,'-','')||'_g',p_hash,p_generation_payload,p_revision,p_version,p_epoch,pol.provider,pol.model,pol.price_key,gb);
  v:=career_model_budget_reserve_v1(p_user,p_thread,'p2_'||replace(p.id::text,'-','')||'_v',p_hash,p_verification_envelope,p_revision,p_version,p_epoch,pol.provider,pol.model,pol.price_key,vb);
  if g->>'ok'is distinct from 'true'or v->>'ok'is distinct from 'true'then raise exception 'paired global reservation could not be confirmed';end if;
  gm:=agent_model_call_reserve(p_user,p_thread,p.id,0,pol.model);vm:=agent_model_call_reserve(p_user,p_thread,p.id,1,pol.model);
  if gm->>'ok'is distinct from 'true'or vm->>'ok'is distinct from 'true'then raise sqlstate 'P0003'using message='paired monthly quota unavailable';end if;
  update career_model_reservations_v1 set expires_at=p.deadline where id in((g->>'ticket')::uuid,(v->>'ticket')::uuid)and user_id=p_user and thread_id=p_thread;
  insert into career_model_pair_legs_v2(pair_id,user_id,thread_id,kind,ticket_id,monthly_id,config_digest,input_bound,output_bound,reserved_envelope)values(p.id,p_user,p_thread,'generation',(g->>'ticket')::uuid,(gm->>'call_id')::uuid,pol.generation_config_digest,p_generation_input,p_generation_output,p_generation_payload),(p.id,p_user,p_thread,'verification',(v->>'ticket')::uuid,(vm->>'call_id')::uuid,pol.verification_config_digest,p_verification_input,p_verification_output,p_verification_envelope);
  result:=career_model_pair_read_v2(p_user,p.id)||jsonb_build_object('is_new',true);
 exception when sqlstate 'P0003'then return jsonb_build_object('ok',false,'reason','monthly_limit');end;
 return result;
end $_$;


--
-- Name: career_model_replay_check_v2(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_model_replay_check_v2(p_user uuid, p_thread uuid, p_key text, p_hash text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare a jsonb; r jsonb; barrier bigint; v bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user) then return jsonb_build_object('ok',false);end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select value into r from career_watch_kv where user_id=p_user and key='career:turn:'||p_thread||':'||p_key;
 if r->>'hash' is distinct from p_hash or r->>'epoch' is distinct from coalesce(a->>'epoch','0') or r#>>'{response,meta,career_dialogue,version}' is distinct from 'career_dialogue/v2' then return jsonb_build_object('ok',false);end if;
 barrier:=career_model_context_barrier_v2(p_user,coalesce((a->>'epoch')::bigint,0),coalesce((a->>'version')::bigint,0));
 v:=(r#>>'{response,meta,career_dialogue,account_version}')::bigint;
 return jsonb_build_object('ok',coalesce(v>barrier or (v=barrier and r#>>'{response,meta,career_dialogue,barrier}'='true'),false));
end $$;


--
-- Name: career_native_checker_prepare_v1(uuid, uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_native_checker_prepare_v1(p_user uuid, p_thread uuid, p_key text, p_execution uuid, p_wire text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e jsonb;wire jsonb;input jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into e from career_watch_kv where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key for update;
 wire:=p_wire::jsonb;input:=(wire#>>'{messages,-1,content}')::jsonb;
 if e is null or e->>'execution_id' is distinct from p_execution::text or e->>'state' is distinct from 'claimed'
 or octet_length(p_wire)>(e#>>'{spec,verification_input}')::bigint or wire->>'model' is distinct from((e#>>'{spec,generation_wire_body}')::jsonb->>'model')
 or(wire->>'max_completion_tokens')::bigint is distinct from(e#>>'{spec,verification_output}')::bigint
 or input->>'kind' is distinct from 'career_native_checker_request/v1'or input->'request' is distinct from(e#>>'{spec,canonical_request}')::jsonb
 or input->'candidate' is distinct from(e#>>'{observations,generation,text}')::jsonb
 or input->>'request_digest' is distinct from e#>>'{spec,request_digest}'or input->>'intent_sha256' is distinct from e#>>'{spec,intent_sha256}'
 or input->>'context_sha256' is distinct from(((e#>>'{spec,canonical_request}')::jsonb)#>>'{context,binding,context_sha256}')
 or input->>'user_text_sha256' is distinct from e#>>'{intent,user_text_sha256}'
 or input->>'rendered_sha256' is distinct from encode(sha256(convert_to(input->>'rendered_response','UTF8')),'hex')
 or input->>'candidate_sha256' is distinct from encode(sha256(convert_to(input->>'canonical_candidate','UTF8')),'hex')or(input->>'canonical_candidate')::jsonb is distinct from input->'candidate'
 or(e->>'verification_wire_body' is not null and e->>'verification_wire_body' is distinct from p_wire)then raise exception 'invalid immutable native checker request';end if;
 update career_watch_kv set value=value||jsonb_build_object('verification_wire_body',p_wire),updated_at=now()where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key;
 return jsonb_build_object('ok',true);
end $$;


--
-- Name: career_native_claim_v1(uuid, uuid, text, text, bigint, bigint, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_native_claim_v1(p_user uuid, p_thread uuid, p_key text, p_hash text, p_revision bigint, p_version bigint, p_epoch bigint, p_spec jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare r jsonb;e jsonb;q jsonb;c jsonb;wire jsonb;p jsonb;pol career_model_pair_policy_v2;reason text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 r:=career_native_read_v1(p_user,p_thread,p_key,p_hash);if r?'error'then return r;end if;
 if r->'execution'<>'null'::jsonb then return jsonb_build_object('execution',r->'execution','is_new',false);end if;
 if not career_model_context_current_v1(p_user,p_thread,p_revision,p_version,p_epoch)then return jsonb_build_object('error','revision_conflict');end if;
 q:=(p_spec->>'canonical_request')::jsonb;c:=q->'context';wire:=(p_spec->>'generation_wire_body')::jsonb;
 if p_key!~'^[A-Za-z0-9_-]{1,128}$'or p_hash!~'^[a-f0-9]{64}$'or octet_length(p_spec::text)>2000000
 or q->>'version' is distinct from 'career_native_request/v1'or q->'intent' is distinct from p_spec->'intent'
 or q#>>'{intent,version}' is distinct from 'career_native_intent/v1'or q#>>'{intent,source}' is distinct from 'owned_deterministic_host'
 or q#>'{intent,expected_binding}' is distinct from jsonb_build_object('owner_id',p_user,'thread_id',p_thread,'account_version',p_version,'thread_revision',p_revision,'epoch',p_epoch)
 or q#>>'{intent,user_text_sha256}' is distinct from encode(sha256(convert_to(q#>>'{intent,user_text}','UTF8')),'hex')
 or p_spec->>'request_digest' is distinct from encode(sha256(convert_to(p_spec->>'canonical_request','UTF8')),'hex')
 or p_spec->>'intent_sha256' is distinct from encode(sha256(convert_to(p_spec->>'canonical_intent','UTF8')),'hex')or(p_spec->>'canonical_intent')::jsonb is distinct from q->'intent'
 or c->>'contract_version' is distinct from 'career_journey_context/v1'or c->>'owner_id' is distinct from p_user::text or c->>'thread_id' is distinct from p_thread::text
 or c#>'{binding,epoch}' is distinct from to_jsonb(p_epoch)or c#>'{binding,account_version}' is distinct from to_jsonb(p_version+1)or c#>'{binding,thread_revision}' is distinct from to_jsonb(p_revision+1)
 or (p_spec->>'canonical_context_digest_text')::jsonb is distinct from jsonb_set(c-'captured_at','{binding}',(c->'binding')-'context_sha256')
 or c#>>'{binding,context_sha256}' is distinct from encode(sha256(convert_to(p_spec->>'canonical_context_digest_text','UTF8')),'hex')
 or p_spec#>>'{host_snapshot,scope,userId}' is distinct from p_user::text
 or p_spec->>'generation_payload' is distinct from encode(sha256(convert_to(p_spec->>'generation_wire_body','UTF8')),'hex')
 or (p_spec->>'generation_input')::bigint is distinct from octet_length(p_spec->>'generation_wire_body')
 or p_spec->>'verification_envelope' is distinct from encode(sha256(convert_to(p_spec->>'verification_envelope_text','UTF8')),'hex')
 or(wire#>>'{messages,-1,content}')::jsonb is distinct from jsonb_build_object('kind','career_native_generation_request/v1','request',q)
 or jsonb_typeof(p_spec->'fallback_reply')is distinct from 'string'or jsonb_typeof(p_spec->'uncertain_reply')is distinct from 'string'or jsonb_typeof(p_spec->'no_call_reply')is distinct from 'string'
 or exists(select 1 from jsonb_array_elements((c->'facts')||(c->'sources')||(c->'dialogue')||(c->'goals')||(c->'pending_asks')||(c->'invalidations')||(c->'tool_status')||(c->'receipts')||(c->'artifacts')||(c->'assessments')||case when jsonb_typeof(c->'current_draft')='object'then jsonb_build_array(c->'current_draft')else '[]'::jsonb end)x where x#>>'{scope,owner_id}'is distinct from p_user::text or(x#>>'{scope,kind}'='thread'and x#>>'{scope,thread_id}'is distinct from p_thread::text))
 or exists(select 1 from jsonb_array_elements(c->'sources')x where x->>'source_sha256'is distinct from encode(sha256(convert_to(x->>'content','UTF8')),'hex'))then raise exception 'invalid exact native execution specification';end if;
 select *into pol from career_model_pair_policy_v2 where policy_digest=p_spec->>'policy_digest'and active;
 if pol.policy_digest is null or pol.generation_config_digest is distinct from p_spec->>'generation_config_digest'or pol.verification_config_digest is distinct from p_spec->>'verification_config_digest'
 or pol.provider is distinct from 'openai'or pol.model is distinct from wire->>'model'or (p_spec->>'generation_output')::bigint is distinct from (wire->>'max_completion_tokens')::bigint then reason:='policy_unavailable';end if;
 if reason is null then p:=career_model_pair_reserve_v2(p_user,p_thread,p_key,p_hash,p_revision,p_version,p_epoch,p_spec->>'policy_digest',p_spec->>'generation_payload',p_spec->>'verification_envelope',(p_spec->>'generation_input')::bigint,(p_spec->>'generation_output')::bigint,(p_spec->>'verification_input')::bigint,(p_spec->>'verification_output')::bigint);if p->>'ok' is distinct from 'true'then reason:=p->>'reason';end if;end if;
 e:=jsonb_build_object('execution_id',gen_random_uuid(),'owner_id',p_user,'thread_id',p_thread,'turn_key',p_key,'request_hash',p_hash,'epoch',p_epoch,'intent',q->'intent','spec',p_spec,'pair_id',case when reason is null then p->'pair_id'else 'null'::jsonb end,'state',case when reason is null then 'claimed'else 'closed'end,'observations','{}'::jsonb,'reason',reason);
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:native-execution:'||p_thread||':'||p_key,e);
 return jsonb_build_object('execution',e,'is_new',true);
end $_$;


--
-- Name: career_native_fence_v1(uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_native_fence_v1(p_user uuid, p_thread uuid, p_key text, p_execution uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into e from career_watch_kv where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key for update;
 if e is null or e->>'execution_id'is distinct from p_execution::text then raise exception 'native execution unavailable';end if;
 if e->>'state'='claimed'then update career_watch_kv set value=value||jsonb_build_object('state','unknown'),updated_at=now()where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key;end if;
 update career_model_reservations_v1 set expires_at=least(expires_at,clock_timestamp())where user_id=p_user and state='started'and id in(select ticket_id from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user);
 return jsonb_build_object('ok',true);
end $$;


--
-- Name: career_native_leg_consume_v1(uuid, uuid, text, uuid, text, text, text, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_native_leg_consume_v1(p_user uuid, p_thread uuid, p_key text, p_execution uuid, p_kind text, p_payload text, p_envelope text, p_input bigint, p_output bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into e from career_watch_kv where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key;
 if e is null or e->>'execution_id' is distinct from p_execution::text or e->>'state' is distinct from 'claimed'then return jsonb_build_object('ok',false,'reason','execution_fenced');end if;
 if p_kind='verification'and(p_payload is distinct from encode(sha256(convert_to(e->>'verification_wire_body','UTF8')),'hex')or p_input is distinct from octet_length(e->>'verification_wire_body'))then return jsonb_build_object('ok',false,'reason','checker_payload_not_durable');end if;
 return career_model_leg_consume_v2(p_user,(e->>'pair_id')::uuid,p_kind,p_payload,p_envelope,p_input,p_output);
end $$;


--
-- Name: career_native_observe_v1(uuid, uuid, text, uuid, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_native_observe_v1(p_user uuid, p_thread uuid, p_key text, p_execution uuid, p_kind text, p_receipt jsonb, p_text text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e jsonb;old jsonb;l career_model_pair_legs_v2;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into e from career_watch_kv where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key for update;
 select *into l from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user and thread_id=p_thread and kind=p_kind;
 if e is null or e->>'execution_id' is distinct from p_execution::text or l.dispatched_payload is null or p_kind not in('generation','verification')or p_receipt->>'request_body_sha256' is distinct from l.dispatched_payload or p_receipt->>'config_digest' is distinct from l.config_digest or octet_length(coalesce(p_text,''))>50000 then raise exception 'invalid native provider observation';end if;
 old:=e#>array['observations',p_kind];if old is not null and(old->'receipt' is distinct from p_receipt or(old->>'text'is not null and p_text is not null and old->>'text'is distinct from p_text))then raise exception 'native provider observation conflict';end if;
 update career_watch_kv set value=jsonb_set(value,array['observations',p_kind],jsonb_build_object('receipt',p_receipt,'text',coalesce(p_text,old->>'text'))),updated_at=now()where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key;
 return jsonb_build_object('ok',true);
end $$;


--
-- Name: career_native_outcome_v1(uuid, uuid, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_native_outcome_v1(p_user uuid, p_thread uuid, p_key text, p_execution uuid, p_result jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e jsonb;p jsonb;check_input jsonb;checker jsonb;claim jsonb;checked jsonb;k text;role_name text;leg jsonb;reported jsonb;raw_receipt jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into e from career_watch_kv where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key for update;
 if e is null or e->>'execution_id' is distinct from p_execution::text or p_result->>'status'not in('generated','unavailable','unknown')or octet_length(p_result::text)>100000 then raise exception 'invalid native outcome';end if;
 if e->'result'=p_result then return jsonb_build_object('execution',e);end if;
 if e->>'pair_id'is not null then p:=career_model_pair_read_v2(p_user,(e->>'pair_id')::uuid);else p:=jsonb_build_object('accounting_state','settled','provider_calls_confirmed',0,'provider_calls_possible',0,'known_cost_micros',0,'uncertain_micros',0);end if;
 if e?'result'and not(e#>>'{result,status}'='unknown'and p_result->>'status'='unavailable'and p->>'accounting_state'='settled')then raise exception 'terminal native outcome conflict';end if;
 if p_result#>>'{meta,contract}'is distinct from 'native_pair_v1'or p_result#>>'{meta,verification,cost_policy}'is distinct from 'paired_gateway_budgeted/v1'or p_result#>'{meta,pair_id}'is distinct from e->'pair_id'
 or p_result#>>'{meta,status}'is distinct from p_result->>'status'or p_result#>>'{meta,operation_id}'is distinct from e->>'execution_id'or p_result#>>'{meta,request_digest}'is distinct from e#>>'{spec,request_digest}'or p_result#>>'{meta,context_sha256}'is distinct from(((e#>>'{spec,canonical_request}')::jsonb)#>>'{context,binding,context_sha256}')
 or p_result#>'{meta,provider_calls_confirmed}'is distinct from p->'provider_calls_confirmed'or p_result#>>'{meta,accounting_state}'is distinct from p->>'accounting_state'
 or p_result#>'{meta,provider_calls_possible}'is distinct from p->'provider_calls_possible'or p_result#>'{meta,known_cost_micros}'is distinct from p->'known_cost_micros'or p_result#>'{meta,uncertain_micros}'is distinct from p->'uncertain_micros'or p_result#>>'{meta,accounting_source}'is distinct from 'career_model_pair_read_v2'
 or p_result#>>'{meta,intent_sha256}'is distinct from e#>>'{spec,intent_sha256}'or p_result#>>'{meta,user_text_sha256}'is distinct from e#>>'{intent,user_text_sha256}'then raise exception 'native paid provenance mismatch';end if;
 foreach k in array array['generation','verification']loop
  role_name:=case when k='verification'then 'checker'else 'generation'end;leg:=p->k;reported:=p_result#>array['meta','legs',role_name];
  select raw_usage_receipt into raw_receipt from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user and kind=k;
  if reported->>'state'is distinct from coalesce(leg->>'state','not_sent')or reported->'final'is distinct from to_jsonb(leg is null or leg->>'state'in('recorded','not_sent'))
  or reported->'cost_micros'is distinct from(case when leg->>'state'='recorded'then leg->'cost_micros'else '0'::jsonb end)
  or reported->'provider_request_ids'is distinct from(case when leg->>'state'='recorded'then jsonb_build_array(raw_receipt->>'response_id')else '[]'::jsonb end)
  or(leg->>'state'='recorded'and reported->'raw_usage_receipt'is distinct from raw_receipt)
  or p_result#>array['meta','bounds_micros',role_name]is distinct from coalesce(leg->'bound_micros','0'::jsonb)then raise exception 'native usage metadata mismatch';end if;
 end loop;
 if p_result#>'{meta,legs,other}'is distinct from '{"state":"not_sent","final":true,"cost_micros":0,"provider_request_ids":[]}'::jsonb or p_result#>'{meta,bounds_micros,other}'is distinct from '0'::jsonb or p_result#>'{meta,parent_bound_micros}'is distinct from coalesce(p->'parent_bound_micros','0'::jsonb)then raise exception 'native whole-call metadata mismatch';end if;
 if p_result->>'status'='generated'then
  checker:=(e#>>'{observations,verification,text}')::jsonb;check_input:=((e->>'verification_wire_body')::jsonb#>>'{messages,-1,content}')::jsonb;
  if e->>'state'is distinct from 'claimed'or p->>'accounting_state' is distinct from 'settled'or p->>'provider_calls_confirmed'is distinct from '2'or p->>'contextCurrent'is distinct from 'true'
  or e#>'{observations,generation,receipt}'is distinct from p#>'{generation,raw_usage_receipt}'or e#>'{observations,verification,receipt}'is distinct from p#>'{verification,raw_usage_receipt}'
  or p_result->'candidate'is distinct from(e#>>'{observations,generation,text}')::jsonb or p_result->'candidate'is distinct from check_input->'candidate'
  or p_result->>'rendered_response'is distinct from check_input->>'rendered_response'or p_result->>'rendered_sha256'is distinct from check_input->>'rendered_sha256'
  or checker->>'version'is distinct from 'career_native_checker/v1'or checker->>'verdict'is distinct from 'supported'or checker->'whole_response_checked'is distinct from 'true'::jsonb or checker->'authority_safe'is distinct from 'true'::jsonb or checker->'unlisted_claims'is distinct from '[]'::jsonb
  or checker->>'request_digest'is distinct from e#>>'{spec,request_digest}'or checker->>'intent_sha256'is distinct from e#>>'{spec,intent_sha256}'or checker->>'user_text_sha256'is distinct from e#>>'{intent,user_text_sha256}'
  or checker->>'context_sha256'is distinct from check_input->>'context_sha256'or checker->>'candidate_sha256'is distinct from check_input->>'candidate_sha256'or checker->>'rendered_sha256'is distinct from check_input->>'rendered_sha256'
  or jsonb_array_length(checker->'claims')is distinct from jsonb_array_length(p_result#>'{candidate,claims}')then raise exception 'native independent checker proof missing';end if;
  for claim in select value from jsonb_array_elements(p_result#>'{candidate,claims}')loop
   select value into checked from jsonb_array_elements(checker->'claims')where value->>'id'=claim->>'id';
   if checked is null or checked->>'verdict'is distinct from 'entailed'or not((checked->'evidence_ids')@>(claim->'evidence_ids')and(claim->'evidence_ids')@>(checked->'evidence_ids'))then raise exception 'native claim not checked';end if;
  end loop;
  update career_model_pairs_v2 set publication_state='verified_uncommitted'where id=(e->>'pair_id')::uuid and user_id=p_user;
 elsif p_result->>'rendered_response'is distinct from(case when p->>'accounting_state'='uncertain'then e#>>'{spec,uncertain_reply}'when coalesce((p->>'provider_calls_possible')::int,0)=0 then e#>>'{spec,no_call_reply}'else e#>>'{spec,fallback_reply}'end)then raise exception 'unchecked native text publication';end if;
 if p->>'accounting_state'='uncertain'then update career_model_reservations_v1 set expires_at=least(expires_at,clock_timestamp())where user_id=p_user and state='started'and id in(select ticket_id from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user);end if;
 e:=e||jsonb_build_object('state',case when p->>'accounting_state'='uncertain'then 'unknown'else 'closed'end,'result',p_result);
 update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key;return jsonb_build_object('execution',e);
end $$;


--
-- Name: career_native_read_v1(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_native_read_v1(p_user uuid, p_thread uuid, p_key text, p_hash text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e jsonb;c jsonb;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select value into e from career_watch_kv where user_id=p_user and key='career:native-execution:'||p_thread||':'||p_key;
 select value into c from career_watch_kv where user_id=p_user and key='career:native-context:'||p_thread;
 if e is not null and(e->>'request_hash' is distinct from p_hash or e->>'owner_id' is distinct from p_user::text or e->>'thread_id' is distinct from p_thread::text)then return jsonb_build_object('error','turn_key_conflict');end if;
 if e is not null and e->'epoch' is distinct from coalesce(a->'epoch','0'::jsonb)then return jsonb_build_object('error','privacy_epoch_changed');end if;
 return jsonb_build_object('execution',e,'context',c);
end $$;


--
-- Name: career_native_replay_v1(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_native_replay_v1(p_user uuid, p_thread uuid, p_key text, p_hash text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare loaded jsonb;e jsonb;a jsonb;p jsonb;response jsonb;m jsonb;accounting jsonb;legs jsonb;leg jsonb;k text;role_name text;status text;as_of timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 loaded:=career_host_load(p_user,p_thread,p_key,p_hash);if loaded?'error'then return loaded;end if;
 if loaded->'replay'is null then return jsonb_build_object('error','native_replay_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a->'paused'='true'::jsonb or career_model_replay_check_v2(p_user,p_thread,p_key,p_hash)->>'ok'is distinct from 'true'then return jsonb_build_object('error','career_model_context_changed');end if;
 e:=career_native_read_v1(p_user,p_thread,p_key,p_hash);if e?'error'then return e;end if;e:=e->'execution';
 response:=loaded->'replay';m:=response#>'{meta,career_model}';
 if e is null or e->>'execution_id'is distinct from m->>'operation_id'or e->'pair_id'is distinct from m->'pair_id'or e->'result'is null or m->>'contract'is distinct from 'native_pair_v1'then return jsonb_build_object('error','native_replay_missing');end if;
 -- Generated and already-final snapshots retain exact replay bytes. Existing
 -- dialogue/epoch/pause checks above still revoke stale publication.
 if m->>'status'<>'unknown'or e->>'pair_id'is null then return jsonb_build_object('response',response);end if;
 p:=career_model_pair_read_v2(p_user,(e->>'pair_id')::uuid);
 if p->>'ok'is distinct from 'true'then return jsonb_build_object('error','native_replay_missing');end if;
 legs:='{"other":{"state":"not_sent","final":true,"cost_micros":0,"provider_request_ids":[]}}'::jsonb;
 foreach k in array array['generation','verification']loop
  role_name:=case when k='verification'then 'checker'else 'generation'end;leg:=p->k;
  legs:=legs||jsonb_build_object(role_name,jsonb_build_object('state',leg->'state','final',leg->>'state'in('recorded','not_sent'),'cost_micros',case when leg->>'state'='recorded'then leg->'cost_micros'else '0'::jsonb end,'provider_request_ids',case when leg->>'state'='recorded'then jsonb_build_array(leg->>'provider_response_id')else '[]'::jsonb end)||case when leg->>'state'='recorded'then jsonb_build_object('raw_usage_receipt',leg->'raw_usage_receipt')else '{}'::jsonb end);
 end loop;
 accounting:=jsonb_build_object('legs',legs,'provider_calls_confirmed',p->'provider_calls_confirmed','provider_calls_possible',p->'provider_calls_possible','accounting_state',p->'accounting_state','known_cost_micros',p->'known_cost_micros','uncertain_micros',p->'uncertain_micros');
 if m@>accounting then return jsonb_build_object('response',response);end if;
 select max(settled_at)into as_of from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user and thread_id=p_thread;
 status:=case when p->>'accounting_state'='settled'then 'unavailable'else 'unknown'end;
 m:=m||accounting||jsonb_build_object('status',status,'accounting_as_of',as_of,'accounting_source','career_model_pair_read_v2','failure_kind','reconciled_without_redispatch');
 response:=jsonb_set(jsonb_set(response,'{meta,career_model}',m),'{reply}',case when status='unknown'then e#>'{spec,uncertain_reply}'else e#>'{spec,fallback_reply}'end);
 return jsonb_build_object('response',response);
end $$;


--
-- Name: career_native_turn_commit_v1(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_native_turn_commit_v1(p_base jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;e jsonb;saved jsonb;p jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 saved:=career_host_load(u,t,p_base->>'p_key',p_base->>'p_hash');if saved?'error'then return saved;end if;if saved?'replay'then return career_native_replay_v1(u,t,p_base->>'p_key',p_base->>'p_hash')||jsonb_build_object('replay',true);end if;
 select value into e from career_watch_kv where user_id=u and key='career:native-execution:'||t||':'||(p_base->>'p_key');
 if e is not null and((p_base->>'p_revision')::bigint is distinct from(e#>>'{intent,expected_binding,thread_revision}')::bigint or(p_base->>'p_account_version')::bigint is distinct from(e#>>'{intent,expected_binding,account_version}')::bigint)then return jsonb_build_object('error','revision_conflict');end if;
 if e is null or e->>'request_hash'is distinct from p_base->>'p_hash'or e->'result'is null or p_base->'p_snapshot'is distinct from e#>'{spec,host_snapshot}'or coalesce(p_base->'p_patch','{}'::jsonb)<>'{}'::jsonb
 or p_base->>'p_input'is distinct from e#>>'{intent,user_text}'or p_base#>>'{p_response,reply}'is distinct from e#>>'{result,rendered_response}'or p_base#>'{p_response,meta,career_model}'is distinct from e#>'{result,meta}'then raise exception 'native publication binding mismatch';end if;
 if e#>>'{result,status}'='generated'then p:=career_model_pair_read_v2(u,(e->>'pair_id')::uuid);if p->>'contextCurrent'is distinct from 'true'or p->>'publication_state'is distinct from 'verified_uncommitted'then return jsonb_build_object('error','career_model_context_changed');end if;end if;
 saved:=career_host_commit(u,t,p_base->>'p_key',p_base->>'p_hash',(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,p_base->'p_snapshot','{}'::jsonb,p_base->>'p_input',p_base->'p_response');if saved?'error'then return saved;end if;
 insert into career_watch_kv(user_id,key,value)values(u,'career:native-context:'||t,(e#>>'{spec,canonical_request}')::jsonb->'context')on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 if e#>>'{result,status}'='generated'then update career_model_pairs_v2 set publication_state='published'where id=(e->>'pair_id')::uuid and user_id=u;end if;
 return saved;
end $$;


--
-- Name: career_reminder_ack(uuid, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_reminder_ack(p_user uuid, p_id text, p_lease uuid, p_record jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: career_reminder_allowed(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_reminder_allowed(p_user uuid, p_reminder jsonb) RETURNS boolean
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select exists(select 1 from career_watch_kv w where user_id=p_user and key='career:watch-profile:'||p_user
 and w.value->>'user_id'=p_user::text and coalesce(w.value#>'{opt_out,global}','false'::jsonb)<>'true'::jsonb
 and exists(select 1 from jsonb_array_elements(coalesce(w.value->'interests','[]'::jsonb)) i where i->>'interest_id'=p_reminder->>'interest_id')
 and not exists(select 1 from jsonb_array_elements_text(coalesce(w.value#>'{opt_out,companies}','[]'::jsonb)) c where lower(c)=lower(p_reminder->>'company')));
$$;


--
-- Name: career_reminder_claim(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_reminder_claim(p_user uuid, p_id text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: career_reminder_enqueue(uuid, jsonb, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_reminder_enqueue(p_user uuid, p_reminder jsonb, p_version bigint, p_epoch bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: career_reminder_list(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_reminder_list(p_user uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select jsonb_build_object('reminders',coalesce(jsonb_agg(payload),'[]'::jsonb)) from (select payload from career_reminder_outbox where user_id=p_user and status in ('pending','claimed','uncertain') and payload is not null order by created_at,reminder_id limit 100) q;
$$;


--
-- Name: career_reminder_status(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_reminder_status(p_user uuid, p_id text) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select jsonb_build_object('status',status,'record',record,'leaseToken',lease_token,'reminder',payload) from career_reminder_outbox where user_id=p_user and reminder_id=p_id;
$$;


--
-- Name: career_task_account_v1(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_account_v1(p_user uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select jsonb_build_object('exists',exists(select 1 from career_watch_kv where user_id=p_user and key='career:account'),'account',(select value from career_watch_kv where user_id=p_user and key='career:account'));
$$;


--
-- Name: career_task_begin_effect_v1(uuid, text, uuid, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_begin_effect_v1(p_user uuid, p_intent text, p_lease uuid, p_task text, p_operation text, p_effect_key text, p_bindings jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare i career_task_intents_v1;a jsonb;e career_task_effects_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or i.intent_id is null or i.state<>'claimed' or p_lease is distinct from i.lease_token or p_task is distinct from i.task_id or i.expires_at<=now() or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or (p_operation<>'destination_readback' and a->'paused'='true'::jsonb) then raise exception 'task authority revoked';end if;
 if coalesce(p_operation,'') not in ('open','form','fill','answers','atReview','armForSubmit','submit','submissionState','destination_readback','read_public_page') or (i.binding->>'action'='research' and p_operation<>'read_public_page') or (i.binding->>'action'<>'research' and p_operation='read_public_page') or (i.binding->>'action'='prepare' and p_operation in ('armForSubmit','submit')) or (i.binding->>'action'='reconcile' and p_operation<>'destination_readback') then raise exception 'task operation not authorized';end if;
 if coalesce(p_effect_key,'') !~ '^[a-f0-9]{64}$' or p_bindings is distinct from i.binding then raise exception 'task effect binding mismatch';end if;
 if p_operation<>'destination_readback' and exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=p_task and state in ('started','uncertain')) then raise exception 'task effect outcome uncertain';end if;
 if i.spent+i.reserved>=i.budget_limit then raise exception 'task budget exhausted';end if;
 insert into career_task_effects_v1(user_id,intent_id,effect_key,task_id,operation,state) values(p_user,p_intent,p_effect_key,p_task,p_operation,'reserved') returning * into e;
 update career_task_intents_v1 set reserved=reserved+1 where user_id=p_user and intent_id=p_intent;
 return jsonb_build_object('token',e.token,'effectKey',e.effect_key,'state',e.state);
end $_$;


--
-- Name: career_task_claim_owned_v1(uuid, text, text, uuid, uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_claim_owned_v1(p_user uuid, p_intent text, p_task text, p_worker uuid, p_request uuid, p_lease uuid DEFAULT NULL::uuid, p_generation integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or i.intent_id is null or i.state not in ('queued','claimed') or i.expires_at<=now() or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or (i.binding->>'action'<>'reconcile' and a->'paused'='true'::jsonb) then raise exception 'task authority revoked';end if;
 if p_worker is null or p_request is null or coalesce(p_task,'') !~ '^[a-f0-9]{32}$' or (i.task_id is not null and i.task_id<>p_task) then raise exception 'task binding mismatch';end if;
 if i.state='claimed' then
  if i.claim_worker is null then raise exception 'legacy task claim busy';end if;
  if i.claim_lease_until>now() then
   if i.claim_worker is distinct from p_worker or i.claim_request is distinct from p_request or (p_lease is not null and p_lease is distinct from i.lease_token) then raise exception 'task claim owner mismatch';end if;
   if p_lease is null and exists(select 1 from career_task_effects_v1 e where e.user_id=p_user and e.intent_id=p_intent) then raise exception 'task effect outcome uncertain';end if;
   return career_task_owned_grant_v1(i);
  end if;
  -- Reclaim is a CAS against an observed generation and is allowed only
  -- before any effect was admitted. Reserved effects also prevent replay.
  if p_generation is distinct from i.claim_generation or p_generation<1 then raise exception 'task stale claim generation';end if;
  if exists(select 1 from career_task_effects_v1 e where e.user_id=p_user and e.intent_id=p_intent) then raise exception 'task effect outcome uncertain';end if;
 elsif p_generation is distinct from 0 then raise exception 'task stale claim generation';
 end if;
 update career_task_intents_v1 set state='claimed',task_id=p_task,claim_worker=p_worker,claim_request=p_request,claim_generation=claim_generation+1,lease_token=gen_random_uuid(),claim_lease_until=least(expires_at,now()+interval '5 minutes'),updated_at=now() where user_id=p_user and intent_id=p_intent returning * into i;
 return career_task_owned_grant_v1(i);
end $_$;


--
-- Name: career_task_claim_readback_v1(uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_claim_readback_v1(p_user uuid, p_intent text, p_worker uuid, p_request uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or i.intent_id is null or i.state<>'claimed' or i.expires_at<=now() or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or (i.binding->>'action'<>'reconcile' and a->'paused'='true'::jsonb) then raise exception 'task authority revoked';end if;
 if p_worker is null or p_request is null or i.claim_worker is distinct from p_worker or i.claim_request is distinct from p_request then raise exception 'task claim owner mismatch';end if;
 if exists(select 1 from career_task_effects_v1 e where e.user_id=p_user and e.intent_id=p_intent) then return jsonb_build_object('state','uncertain');end if;
 if i.claim_lease_until<=now() then return jsonb_build_object('state','expired','generation',i.claim_generation);end if;
 return jsonb_build_object('state','claimed','grant',career_task_owned_grant_v1(i));
end $$;


--
-- Name: career_task_claim_v1(uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_claim_v1(p_user uuid, p_intent text, p_task text, p_lease uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if i.intent_id is null then raise exception 'task intent missing';end if;
 if a is null or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or (i.binding->>'action'<>'reconcile' and a->'paused'='true'::jsonb) or i.expires_at<=now() or i.state not in ('queued','claimed') then raise exception 'task authority revoked';end if;
 if coalesce(p_task,'') !~ '^[a-f0-9]{32}$' or (i.task_id is not null and i.task_id<>p_task) then raise exception 'task binding mismatch';end if;
 if i.state='claimed' and (p_lease is null or p_lease is distinct from i.lease_token) then raise exception 'task claim busy';end if;
 update career_task_intents_v1 set task_id=p_task,state='claimed',lease_token=coalesce(lease_token,gen_random_uuid()),updated_at=now() where user_id=p_user and intent_id=p_intent returning * into i;
 return jsonb_build_object('version','career_task_intent/v1','intentId',p_intent,'userId',p_user,'taskId',i.task_id,'accountVersion',i.authority_account_version,'privacyEpoch',i.privacy_epoch,'leaseToken',i.lease_token,'binding',i.binding,'request',i.private_input);
end $_$;


--
-- Name: career_task_consume_effect_v1(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_consume_effect_v1(p_user uuid, p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e career_task_effects_v1;i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into e from career_task_effects_v1 where user_id=p_user and token=p_token for update;
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=e.intent_id;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if e.token is null or e.state<>'reserved' or i.state<>'claimed' or i.expires_at<=now() or a is null or i.authority_account_version is distinct from (a->>'version')::bigint or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or (e.operation<>'destination_readback' and a->'paused'='true'::jsonb) then raise exception 'task effect revoked or already consumed';end if;
 update career_task_effects_v1 set state='started' where user_id=p_user and token=p_token;
 return jsonb_build_object('consumed',true,'token',p_token);
end $$;


--
-- Name: career_task_control_hook_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_control_hook_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare u uuid; epoch_changed boolean;
begin
 if coalesce(new.key,old.key)<>'career:account' then return null;end if;
 u:=coalesce(new.user_id,old.user_id);
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 epoch_changed:=tg_op='DELETE' or (tg_op='UPDATE' and coalesce((new.value->>'epoch')::bigint,0)<>coalesce((old.value->>'epoch')::bigint,0));
 update career_task_intents_v1 i set state=case when exists(select 1 from career_task_effects_v1 e where e.user_id=i.user_id and e.intent_id=i.intent_id and e.state in ('started','uncertain')) then 'uncertain' else 'cancelled' end,updated_at=now()
  where i.user_id=u and i.state in ('queued','claimed','uncertain') and (tg_op='DELETE' or new.value->'paused'='true'::jsonb or i.authority_account_version is distinct from (new.value->>'version')::bigint or i.privacy_epoch is distinct from coalesce((new.value->>'epoch')::bigint,0));
 if epoch_changed then
  update career_task_intents_v1 set private_input=null,result=null,
   binding=jsonb_build_object('version','career_task_intent/v1','intent_id',intent_id,'user_id',user_id,'action',binding->>'action','task_id',task_id,'request_hash',request_hash),updated_at=now() where user_id=u;
 end if;
 return null;
end $$;


--
-- Name: career_task_effect_status_v1(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_effect_status_v1(p_user uuid, p_token uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select coalesce((select jsonb_build_object('state',state,'token',token,'beforeSha256',before_sha256,'afterSha256',after_sha256) from career_task_effects_v1 where user_id=p_user and token=p_token),'{}'::jsonb);
$$;


--
-- Name: career_task_finish_v1(uuid, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_finish_v1(p_user uuid, p_intent text, p_lease uuid, p_result jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if i.intent_id is null or p_lease is distinct from i.lease_token then raise exception 'task result owner mismatch';end if;
 if a is null or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or i.state not in ('claimed','completed') then return jsonb_build_object('state','revoked');end if;
 if p_result->>'userId' is distinct from p_user::text or p_result->>'id' is distinct from i.task_id or p_result->>'version' is distinct from 'career_task/v1' or octet_length(p_result::text)>1048576 then raise exception 'invalid owned task result';end if;
 if i.state='completed' and i.result is distinct from p_result then raise exception 'task result receipt conflict';end if;
 update career_task_intents_v1 set state='completed',result=p_result,updated_at=now() where user_id=p_user and intent_id=p_intent;
 return jsonb_build_object('state','completed');
end $$;


--
-- Name: career_task_intents_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_task_intents_v1 (
    user_id uuid NOT NULL,
    intent_id text NOT NULL,
    thread_id uuid NOT NULL,
    turn_key text NOT NULL,
    request_hash text NOT NULL,
    event_hash text NOT NULL,
    binding jsonb NOT NULL,
    private_input jsonb,
    result jsonb,
    authority_account_version bigint NOT NULL,
    privacy_epoch bigint NOT NULL,
    state text DEFAULT 'queued'::text NOT NULL,
    task_id text,
    lease_token uuid,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    spent integer DEFAULT 0 NOT NULL,
    reserved integer DEFAULT 0 NOT NULL,
    budget_limit integer DEFAULT 120 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    claim_worker uuid,
    claim_request uuid,
    claim_generation integer DEFAULT 0 NOT NULL,
    claim_lease_until timestamp with time zone,
    CONSTRAINT career_task_intents_v1_intent_id_check CHECK ((intent_id ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT career_task_intents_v1_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'claimed'::text, 'completed'::text, 'cancelled'::text, 'uncertain'::text])))
);


--
-- Name: career_task_owned_grant_v1(public.career_task_intents_v1); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_owned_grant_v1(i public.career_task_intents_v1) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select jsonb_build_object('version','career_task_intent/v1','intentId',i.intent_id,'userId',i.user_id,'taskId',i.task_id,'accountVersion',i.authority_account_version,'privacyEpoch',i.privacy_epoch,'leaseToken',i.lease_token,'binding',i.binding,'request',i.private_input,'workerId',i.claim_worker,'claimRequest',i.claim_request,'generation',i.claim_generation);
$$;


--
-- Name: career_task_owned_lease_fence_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_owned_lease_fence_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare i career_task_intents_v1;
begin
 if TG_TABLE_NAME='career_task_effects_v1' then
  if TG_OP='INSERT' or (NEW.state='started' and OLD.state is distinct from NEW.state) then
   select * into i from career_task_intents_v1 where user_id=NEW.user_id and intent_id=NEW.intent_id;
   if i.expires_at is null or i.expires_at<=clock_timestamp() then raise exception 'task intent expired';end if;
   if i.claim_worker is not null and (i.claim_lease_until is null or i.claim_lease_until<=clock_timestamp()) then raise exception 'task owned lease revoked';end if;
  end if;
 elsif NEW.state='completed' and OLD.state is distinct from NEW.state and OLD.claim_worker is not null and (OLD.claim_lease_until is null or OLD.claim_lease_until<=clock_timestamp() or OLD.expires_at<=clock_timestamp()) then raise exception 'task owned lease revoked';
 end if;return NEW;
end $$;


--
-- Name: career_task_pending_owned_v1(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_pending_owned_v1(p_worker uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select jsonb_build_object('intents',coalesce(jsonb_agg(jsonb_build_object('userId',i.user_id,'intentId',i.intent_id,'taskId',i.task_id,'binding',i.binding,'request',i.private_input)),'[]'::jsonb)) from
 (select i.* from career_task_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account'
 where p_worker is not null and (i.state='queued' or (i.state='claimed' and i.claim_worker=p_worker and not exists(select 1 from career_task_effects_v1 e where e.user_id=i.user_id and e.intent_id=i.intent_id)))
 and i.expires_at>now() and i.authority_account_version=(a.value->>'version')::bigint and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0) and (i.binding->>'action'='reconcile' or a.value->'paused' is distinct from 'true'::jsonb) order by i.created_at limit 50)i;
$$;


--
-- Name: career_task_pending_scoped_v1(uuid, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_pending_scoped_v1(p_worker uuid, p_user uuid, p_task text, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
begin
 if p_worker is null or p_user is null or coalesce(p_task,'') !~ '^[a-f0-9]{32}$' or p_limit is null or p_limit<1 or p_limit>50 then raise exception 'invalid task pending scope';end if;
 return (
  select jsonb_build_object('intents',coalesce(jsonb_agg(jsonb_build_object('userId',i.user_id,'intentId',i.intent_id,'taskId',i.task_id,'binding',i.binding,'request',i.private_input) order by i.created_at,i.intent_id),'[]'::jsonb)) from (
   select i.* from career_task_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account'
   where i.user_id=p_user and coalesce(i.task_id,i.binding->>'task_id')=p_task
   and exists(select 1 from career_task_intents_v1 anchor where anchor.user_id=p_user and anchor.task_id=p_task and anchor.claim_worker=p_worker and anchor.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0))
   and (i.state='queued' or (i.state='claimed' and i.claim_worker=p_worker and not exists(select 1 from career_task_effects_v1 e where e.user_id=i.user_id and e.intent_id=i.intent_id)))
   and i.expires_at>now() and i.authority_account_version=(a.value->>'version')::bigint and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0)
   and (i.binding->>'action'='reconcile' or a.value->'paused' is distinct from 'true'::jsonb)
   order by i.created_at,i.intent_id limit p_limit
  )i
 );
end $_$;


--
-- Name: career_task_pending_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_pending_v1() RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select jsonb_build_object('intents',coalesce(jsonb_agg(jsonb_build_object('userId',i.user_id,'intentId',i.intent_id,'binding',i.binding,'request',i.private_input)),'[]'::jsonb)) from (select i.* from career_task_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account' where i.state='queued' and i.expires_at>now() and i.authority_account_version=(a.value->>'version')::bigint and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0) and (i.binding->>'action'='reconcile' or a.value->'paused' is distinct from 'true'::jsonb) order by i.created_at limit 50)i;
$$;


--
-- Name: career_task_result_v1(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_result_v1(p_user uuid, p_task text DEFAULT NULL::text, p_intent text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select coalesce((select jsonb_build_object('task',i.result,'researchProof',case when i.binding->>'action'='research' and i.result is not null then jsonb_build_object(
  'userId',i.user_id,'taskId',i.task_id,'intentId',i.intent_id,'binding',i.binding,
  'read',(select jsonb_build_object('state',e.state,'afterSha256',e.after_sha256,'admittedAt',e.created_at) from career_task_effects_v1 e where e.user_id=i.user_id and e.intent_id=i.intent_id and e.task_id=i.task_id and e.operation='read_public_page' order by e.created_at desc limit 1)) else null end)
  from career_task_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account' where i.user_id=p_user and (i.task_id=p_task or i.intent_id=p_intent) and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0) order by i.updated_at desc limit 1),' {"task":null}'::jsonb);
$$;


--
-- Name: career_task_settle_effect_v1(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_settle_effect_v1(p_user uuid, p_token uuid, p_outcome text, p_before text, p_after text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare e career_task_effects_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into e from career_task_effects_v1 where user_id=p_user and token=p_token for update;
 if e.token is null or coalesce(p_outcome,'') not in ('completed','definitely_failed','uncertain') or (p_before is not null and p_before !~ '^[a-f0-9]{64}$') or (p_after is not null and p_after !~ '^[a-f0-9]{64}$') then raise exception 'invalid effect settlement';end if;
 if e.state in ('completed','definitely_failed','uncertain') then
  if e.state is distinct from p_outcome or e.before_sha256 is distinct from p_before or e.after_sha256 is distinct from p_after then raise exception 'effect receipt conflict';end if;
 elsif e.state='started' or (e.state='reserved' and p_outcome='definitely_failed') then
  update career_task_effects_v1 set state=p_outcome,before_sha256=p_before,after_sha256=p_after where user_id=p_user and token=p_token;
  update career_task_intents_v1 set reserved=greatest(reserved-1,0),spent=spent+1 where user_id=p_user and intent_id=e.intent_id;
 else raise exception 'effect was not consumed';end if;
 return jsonb_build_object('state',p_outcome,'token',p_token,'beforeSha256',p_before,'afterSha256',p_after);
end $_$;


--
-- Name: career_task_turn_commit_v1(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_task_turn_commit_v1(p_base jsonb, p_intent jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare u uuid; a jsonb; saved jsonb; row_intent career_task_intents_v1; k text; action text; payload jsonb;
begin
 u:=(p_base->>'p_user')::uuid;action:=p_intent->>'action';
 if p_intent is null or jsonb_typeof(p_intent)<>'object' or p_intent->>'version' is distinct from 'career_task_intent/v1' then raise exception 'invalid task intent version';end if;
 for k in select jsonb_object_keys(p_intent) loop
  if k not in ('version','intent_id','user_id','thread_id','turn_key','request_hash','action','task_id','event_id','artifact_id','resume_sha256','payload_sha256','profile_sha256','destination','authority_account_version','privacy_epoch','research') then raise exception 'unknown task intent field';end if;
 end loop;
 if coalesce(p_intent->>'intent_id','') !~ '^[a-f0-9]{64}$' or p_intent->>'user_id' is distinct from u::text or p_intent->>'thread_id' is distinct from p_base->>'p_thread' or p_intent->>'turn_key' is distinct from p_base->>'p_key' or p_intent->>'request_hash' is distinct from p_base->>'p_hash' or coalesce(action,'') not in ('prepare','approve','reconcile','research') or coalesce(p_intent->>'event_id','') !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'invalid task intent binding';end if;
 if action<>'research' and p_intent ? 'research' then raise exception 'research binding on another task kind';end if;
 if action='research' and (jsonb_typeof(p_intent->'research') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_intent->'research'))<>2 or p_intent#>>'{research,url}' is distinct from p_intent->>'destination' or coalesce(p_intent->>'destination','') !~ '^https://[a-z0-9.-]+/' or coalesce(length(p_intent#>>'{research,question}'),0) not between 1 and 500 or p_intent->>'task_id' is not null or p_intent->>'artifact_id' is not null or p_intent->>'resume_sha256' is not null or p_intent->>'payload_sha256' is not null or p_intent->>'profile_sha256' is not null) then raise exception 'invalid research intent';end if;
 if action='prepare' and (coalesce(p_intent->>'artifact_id','') !~ '^[A-Za-z0-9_-]{1,160}$' or coalesce(p_intent->>'resume_sha256','') !~ '^[a-f0-9]{64}$' or p_intent->>'destination' is distinct from p_base#>>'{p_snapshot,stores,posting,url}' or p_base#>>'{p_snapshot,stores,posting,canonicalKey}' is null) then raise exception 'invalid preparation intent';end if;
 if action in ('approve','reconcile') and coalesce(p_intent->>'task_id','') !~ '^[a-f0-9]{32}$' then raise exception 'invalid task identity';end if;
 if action='approve' and (coalesce(p_intent->>'resume_sha256','') !~ '^[a-f0-9]{64}$' or coalesce(p_intent->>'payload_sha256','') !~ '^[a-f0-9]{64}$' or coalesce(p_intent->>'destination','') !~ '^https?://' or p_base->>'p_input' is distinct from 'Approve browser task '||(p_intent->>'task_id')) then raise exception 'invalid task approval';end if;
 if p_intent ? 'profile_sha256' and p_intent->>'profile_sha256' is not null and p_intent->>'profile_sha256' !~ '^[a-f0-9]{64}$' then raise exception 'invalid profile binding';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from career_task_intents_v1 where user_id=u and event_hash=encode(sha256(convert_to(u::text||':'||(p_intent->>'event_id'),'UTF8')),'hex') and intent_id<>p_intent->>'intent_id') then return jsonb_build_object('error','task_event_conflict');end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 select * into row_intent from career_task_intents_v1 where user_id=u and intent_id=p_intent->>'intent_id';
 if row_intent.intent_id is not null then
  if row_intent.binding is distinct from p_intent then raise exception 'immutable task intent conflict';end if;
 end if;
 -- Call the existing commit, never a fork of its transaction/control logic.
 saved:=career_host_commit(u,(p_base->>'p_thread')::uuid,p_base->>'p_key',p_base->>'p_hash',(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,p_base->'p_snapshot',p_base->'p_patch',p_base->>'p_input',p_base->'p_response');
 if saved ? 'error' then return saved;end if;
 if saved->'replay'='true'::jsonb then
  if row_intent.intent_id is null then raise exception 'replayed task receipt missing intent';end if;
  return saved;
 end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 if a is null or (a->>'version')::bigint is distinct from (p_intent->>'authority_account_version')::bigint or coalesce((a->>'epoch')::bigint,0) is distinct from (p_intent->>'privacy_epoch')::bigint or (action<>'reconcile' and a->'paused'='true'::jsonb) then raise exception 'task authority changed';end if;
 if p_base#>>'{p_response,task,intent_id}' is distinct from p_intent->>'intent_id' or p_base#>>'{p_response,task,userId}' is distinct from u::text or p_base#>'{p_response,task,bindings}' is distinct from p_intent then raise exception 'task response binding mismatch';end if;
 payload:=case when action='research' then jsonb_build_object('eventId',p_intent->>'event_id','research',p_intent->'research') when action='prepare' then jsonb_build_object('eventId',p_intent->>'event_id','posting',p_base#>'{p_snapshot,stores,posting}','artifactId',p_intent->>'artifact_id','resumeSha256',p_intent->>'resume_sha256') else null end;
 insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id)
 values(u,p_intent->>'intent_id',(p_base->>'p_thread')::uuid,p_base->>'p_key',p_base->>'p_hash',encode(sha256(convert_to(u::text||':'||(p_intent->>'event_id'),'UTF8')),'hex'),p_intent,payload,(p_intent->>'authority_account_version')::bigint,(p_intent->>'privacy_epoch')::bigint,p_intent->>'task_id');
 return saved;
end $_$;


--
-- Name: career_watch_cycle_commit(uuid, bigint, bigint, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_watch_cycle_commit(p_user uuid, p_version bigint, p_epoch bigint, p_writes jsonb, p_reminders jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: career_watch_read(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_watch_read(p_user uuid, p_key text) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select jsonb_build_object('value',(select value from career_watch_kv where user_id=p_user and key=p_key),'version',coalesce((a.value->>'version')::bigint,0),'epoch',coalesce((a.value->>'epoch')::bigint,0),'paused',coalesce((a.value->>'paused')::boolean,false))
 from (select (select value from career_watch_kv where user_id=p_user and key='career:account') value) a;
$$;


--
-- Name: career_watch_write(uuid, text, jsonb, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.career_watch_write(p_user uuid, p_key text, p_value jsonb, p_version bigint, p_epoch bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:owner-mutation:'||p_epoch||':'||(p_version+1),jsonb_build_object('kind','career_watch_write/v1','owner_id',p_user,'epoch',p_epoch,'account_version',p_version+1,'key_sha256',encode(sha256(convert_to(p_key,'UTF8')),'hex')));
 return jsonb_build_object('version',p_version+1,'epoch',p_epoch);
end $$;


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    id uuid NOT NULL
);


--
-- Name: agent_flow_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_flow_state (
    thread_id uuid NOT NULL,
    user_id uuid NOT NULL,
    state jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_flow_state_state_check CHECK ((jsonb_typeof(state) = 'object'::text)),
    CONSTRAINT agent_flow_state_state_check1 CHECK ((pg_column_size(state) < 524288)),
    CONSTRAINT agent_flow_state_state_check2 CHECK ((NOT ((state)::text ~* '"(otp|one_time_code|password|passcode|card_number|pan|cvv|ssn)"\s*:'::text)))
);


--
-- Name: agent_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    role text,
    content text,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: agent_model_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_model_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    request_id uuid NOT NULL,
    step integer NOT NULL,
    model text NOT NULL,
    state text DEFAULT 'reserved'::text NOT NULL,
    usage jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_model_calls_check CHECK ((((state = 'reserved'::text) AND (usage IS NULL)) OR ((state = 'recorded'::text) AND (usage IS NOT NULL) AND (jsonb_typeof(usage) = 'object'::text)))),
    CONSTRAINT agent_model_calls_model_check CHECK (((length(model) >= 1) AND (length(model) <= 100))),
    CONSTRAINT agent_model_calls_state_check CHECK ((state = ANY (ARRAY['reserved'::text, 'recorded'::text]))),
    CONSTRAINT agent_model_calls_step_check CHECK (((step >= 0) AND (step <= 15)))
);


--
-- Name: agent_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_threads (
    id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: agent_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cache_read_tokens integer DEFAULT 0 NOT NULL,
    cache_write_tokens integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    call_id uuid
);


--
-- Name: career_applicant_resumes_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_applicant_resumes_v1 (
    user_id uuid NOT NULL,
    artifact_id text NOT NULL,
    version_id text NOT NULL,
    sequence bigint NOT NULL,
    privacy_epoch bigint NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    content bytea NOT NULL,
    sha256 text GENERATED ALWAYS AS (encode(sha256(content), 'hex'::text)) STORED,
    confirmation_thread uuid NOT NULL,
    confirmation_account_version bigint NOT NULL,
    confirmation_key text NOT NULL,
    confirmation_ref text NOT NULL,
    confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
    upload_id uuid,
    confirmed_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT career_applicant_resumes_v1_artifact_id_check CHECK ((artifact_id ~ '^[A-Za-z0-9_-]{1,160}$'::text)),
    CONSTRAINT career_applicant_resumes_v1_confirmation_ref_check CHECK ((confirmation_ref ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
    CONSTRAINT career_applicant_resumes_v1_content_check CHECK (((octet_length(content) >= 1) AND (octet_length(content) <= 1048576))),
    CONSTRAINT career_applicant_resumes_v1_content_type_check CHECK ((content_type = ANY (ARRAY['application/pdf'::text, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::text]))),
    CONSTRAINT career_applicant_resumes_v1_filename_check CHECK ((((length(filename) >= 1) AND (length(filename) <= 180)) AND (filename !~ '[[:cntrl:]/\\]'::text) AND (filename <> ALL (ARRAY['.'::text, '..'::text])))),
    CONSTRAINT career_applicant_resumes_v1_privacy_epoch_check CHECK ((privacy_epoch >= 0)),
    CONSTRAINT career_applicant_resumes_v1_version_id_check CHECK ((version_id ~ '^[A-Za-z0-9_-]{1,160}$'::text))
);


--
-- Name: career_applicant_resumes_v1_sequence_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.career_applicant_resumes_v1 ALTER COLUMN sequence ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.career_applicant_resumes_v1_sequence_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: career_applicant_uploads_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_applicant_uploads_v1 (
    user_id uuid NOT NULL,
    upload_id uuid NOT NULL,
    artifact_id text NOT NULL,
    thread_id uuid NOT NULL,
    request_key text NOT NULL,
    privacy_epoch bigint NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    sha256 text NOT NULL,
    bytes integer NOT NULL,
    content bytea,
    validation jsonb NOT NULL,
    review jsonb,
    confirmed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
    CONSTRAINT career_applicant_uploads_v1_bytes_check CHECK (((bytes >= 1) AND (bytes <= 1048576))),
    CONSTRAINT career_applicant_uploads_v1_check CHECK (((content IS NULL) OR (octet_length(content) = bytes))),
    CONSTRAINT career_applicant_uploads_v1_content_type_check CHECK ((content_type = ANY (ARRAY['application/pdf'::text, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::text]))),
    CONSTRAINT career_applicant_uploads_v1_filename_check CHECK (((filename !~ '[[:cntrl:]/\\]'::text) AND ((length(filename) >= 1) AND (length(filename) <= 180)))),
    CONSTRAINT career_applicant_uploads_v1_sha256_check CHECK ((sha256 ~ '^[a-f0-9]{64}$'::text))
);


--
-- Name: career_application_admissions_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_application_admissions_v1 (
    user_id uuid NOT NULL,
    task_id text NOT NULL,
    intent_id text NOT NULL,
    privacy_epoch bigint NOT NULL,
    company_key text NOT NULL,
    vendor text NOT NULL,
    admitted_at timestamp with time zone NOT NULL
);


--
-- Name: career_application_batch_commands_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_application_batch_commands_v1 (
    user_id uuid NOT NULL,
    request_key text NOT NULL,
    request_hash text NOT NULL,
    privacy_epoch bigint NOT NULL,
    response jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: career_application_batch_reviews_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_application_batch_reviews_v1 (
    user_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    review_sha256 text NOT NULL,
    manifest jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    approved_at timestamp with time zone
);


--
-- Name: career_application_batch_roles_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_application_batch_roles_v1 (
    user_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    task_id text NOT NULL,
    source_intent text NOT NULL,
    last_intent text NOT NULL,
    answer_revision integer DEFAULT 0 NOT NULL,
    answers jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT career_application_batch_roles_v1_task_id_check CHECK ((task_id ~ '^[a-f0-9]{32}$'::text))
);


--
-- Name: career_application_profile_reviews_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_application_profile_reviews_v1 (
    user_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    request_key text NOT NULL,
    request_hash text NOT NULL,
    review_sha256 text NOT NULL,
    account_version bigint NOT NULL,
    privacy_epoch bigint NOT NULL,
    profile jsonb NOT NULL,
    fields jsonb NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    CONSTRAINT career_application_profile_reviews_v1_profile_check CHECK ((octet_length((profile)::text) <= 1048576))
);


--
-- Name: career_application_scope_requests_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_application_scope_requests_v1 (
    user_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    request_key text NOT NULL,
    request_hash text NOT NULL,
    account_version bigint NOT NULL,
    privacy_epoch bigint NOT NULL,
    interests jsonb NOT NULL
);


--
-- Name: career_application_search_scopes_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_application_search_scopes_v1 (
    user_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    account_version bigint NOT NULL,
    privacy_epoch bigint NOT NULL,
    interests jsonb NOT NULL
);


--
-- Name: career_application_searches_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_application_searches_v1 (
    user_id uuid NOT NULL,
    search_id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    request_key text NOT NULL,
    request_hash text NOT NULL,
    account_version bigint NOT NULL,
    privacy_epoch bigint NOT NULL,
    ask text NOT NULL,
    requested integer NOT NULL,
    resume jsonb NOT NULL,
    results jsonb NOT NULL,
    source_health jsonb NOT NULL,
    role_interests jsonb NOT NULL,
    selected_batch uuid,
    selected_tasks jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
    current_results jsonb,
    CONSTRAINT career_application_searches_v1_requested_check CHECK (((requested >= 1) AND (requested <= 100))),
    CONSTRAINT career_application_searches_v1_results_check CHECK (((jsonb_typeof(results) = 'array'::text) AND (jsonb_array_length(results) <= 200))),
    CONSTRAINT career_application_searches_v1_results_check1 CHECK ((octet_length((results)::text) <= 4194304))
);


--
-- Name: career_model_campaign_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_model_campaign_v1 (
    campaign text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    price_key text NOT NULL,
    limit_micros bigint NOT NULL,
    opening_micros bigint NOT NULL,
    current_micros bigint DEFAULT 0 NOT NULL,
    reconciled boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT career_model_campaign_v1_campaign_check CHECK ((campaign = 'owner-shared-5usd'::text)),
    CONSTRAINT career_model_campaign_v1_check CHECK (((opening_micros + current_micros) <= limit_micros)),
    CONSTRAINT career_model_campaign_v1_current_micros_check CHECK ((current_micros >= 0)),
    CONSTRAINT career_model_campaign_v1_limit_micros_check CHECK (((limit_micros >= 1) AND (limit_micros <= 5000000))),
    CONSTRAINT career_model_campaign_v1_opening_micros_check CHECK ((opening_micros >= 0)),
    CONSTRAINT career_model_campaign_v1_price_key_check CHECK ((price_key ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT career_model_campaign_v1_provider_check CHECK ((provider = 'openai'::text))
);


--
-- Name: career_model_pair_legs_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_model_pair_legs_v2 (
    pair_id uuid NOT NULL,
    user_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    kind text NOT NULL,
    ticket_id uuid NOT NULL,
    monthly_id uuid,
    config_digest text NOT NULL,
    input_bound bigint NOT NULL,
    output_bound bigint NOT NULL,
    reserved_envelope text NOT NULL,
    dispatched_payload text,
    dispatched_input bigint,
    dispatched_output bigint,
    started_at timestamp with time zone,
    settled_at timestamp with time zone,
    settlement_request_hash text,
    raw_usage_receipt jsonb,
    provider_response_id text,
    CONSTRAINT career_model_pair_legs_v2_check CHECK ((((dispatched_payload IS NULL) AND (dispatched_input IS NULL) AND (dispatched_output IS NULL) AND (started_at IS NULL)) OR ((dispatched_payload IS NOT NULL) AND ((dispatched_input >= 1) AND (dispatched_input <= input_bound)) AND ((dispatched_output >= 1) AND (dispatched_output <= output_bound)) AND (started_at IS NOT NULL)))),
    CONSTRAINT career_model_pair_legs_v2_config_digest_check CHECK ((config_digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT career_model_pair_legs_v2_dispatched_payload_check CHECK ((dispatched_payload ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT career_model_pair_legs_v2_input_bound_check CHECK (((input_bound >= 1) AND (input_bound <= 1000000))),
    CONSTRAINT career_model_pair_legs_v2_kind_check CHECK ((kind = ANY (ARRAY['generation'::text, 'verification'::text]))),
    CONSTRAINT career_model_pair_legs_v2_output_bound_check CHECK (((output_bound >= 1) AND (output_bound <= 16384))),
    CONSTRAINT career_model_pair_legs_v2_reserved_envelope_check CHECK ((reserved_envelope ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT career_model_pair_legs_v2_settlement_request_hash_check CHECK ((settlement_request_hash ~ '^[a-f0-9]{64}$'::text))
);


--
-- Name: career_model_pair_policy_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_model_pair_policy_v2 (
    policy_digest text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    price_key text NOT NULL,
    input_nanos bigint NOT NULL,
    cached_nanos bigint NOT NULL,
    output_nanos bigint NOT NULL,
    generation_config_digest text NOT NULL,
    verification_config_digest text NOT NULL,
    max_input_bound bigint NOT NULL,
    max_generation_output bigint NOT NULL,
    max_verification_output bigint NOT NULL,
    active boolean DEFAULT false NOT NULL,
    CONSTRAINT career_model_pair_policy_v2_check CHECK (((cached_nanos >= 0) AND (cached_nanos <= input_nanos))),
    CONSTRAINT career_model_pair_policy_v2_generation_config_digest_check CHECK ((generation_config_digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT career_model_pair_policy_v2_input_nanos_check CHECK (((input_nanos >= 1) AND (input_nanos <= 10000000))),
    CONSTRAINT career_model_pair_policy_v2_max_generation_output_check CHECK (((max_generation_output >= 1) AND (max_generation_output <= 16384))),
    CONSTRAINT career_model_pair_policy_v2_max_input_bound_check CHECK (((max_input_bound >= 1) AND (max_input_bound <= 1000000))),
    CONSTRAINT career_model_pair_policy_v2_max_verification_output_check CHECK (((max_verification_output >= 1) AND (max_verification_output <= 16384))),
    CONSTRAINT career_model_pair_policy_v2_model_check CHECK ((model = ANY (ARRAY['gpt-5-nano'::text, 'gpt-5-mini'::text, 'gpt-4.1-nano'::text]))),
    CONSTRAINT career_model_pair_policy_v2_output_nanos_check CHECK (((output_nanos >= 1) AND (output_nanos <= 10000000))),
    CONSTRAINT career_model_pair_policy_v2_policy_digest_check CHECK ((policy_digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT career_model_pair_policy_v2_price_key_check CHECK ((price_key ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT career_model_pair_policy_v2_provider_check CHECK ((provider = 'openai'::text)),
    CONSTRAINT career_model_pair_policy_v2_verification_config_digest_check CHECK ((verification_config_digest ~ '^[a-f0-9]{64}$'::text))
);


--
-- Name: career_model_pairs_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_model_pairs_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    turn_key text NOT NULL,
    request_hash text NOT NULL,
    revision bigint NOT NULL,
    account_version bigint NOT NULL,
    epoch bigint NOT NULL,
    policy_digest text NOT NULL,
    generation_payload text NOT NULL,
    verification_envelope text NOT NULL,
    parent_bound_micros bigint NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    deadline timestamp with time zone NOT NULL,
    publication_state text DEFAULT 'not_published'::text NOT NULL,
    settlement_revision bigint DEFAULT 0 NOT NULL,
    CONSTRAINT career_model_pairs_v2_account_version_check CHECK ((account_version >= 0)),
    CONSTRAINT career_model_pairs_v2_epoch_check CHECK ((epoch >= 0)),
    CONSTRAINT career_model_pairs_v2_generation_payload_check CHECK ((generation_payload ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT career_model_pairs_v2_parent_bound_micros_check CHECK (((parent_bound_micros >= 2) AND (parent_bound_micros <= 50000))),
    CONSTRAINT career_model_pairs_v2_publication_state_check CHECK ((publication_state = ANY (ARRAY['not_published'::text, 'verified_uncommitted'::text, 'published'::text, 'stale_context'::text]))),
    CONSTRAINT career_model_pairs_v2_request_hash_check CHECK ((request_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT career_model_pairs_v2_revision_check CHECK ((revision >= 0)),
    CONSTRAINT career_model_pairs_v2_settlement_revision_check CHECK (((settlement_revision >= 0) AND (settlement_revision <= 2))),
    CONSTRAINT career_model_pairs_v2_turn_key_check CHECK ((turn_key ~ '^[A-Za-z0-9_-]{1,128}$'::text)),
    CONSTRAINT career_model_pairs_v2_verification_envelope_check CHECK ((verification_envelope ~ '^[a-f0-9]{64}$'::text))
);


--
-- Name: career_model_reservations_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_model_reservations_v1 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    turn_key text NOT NULL,
    request_hash text NOT NULL,
    payload_hash text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    price_key text NOT NULL,
    revision bigint NOT NULL,
    account_version bigint NOT NULL,
    epoch bigint NOT NULL,
    bound_micros bigint NOT NULL,
    state text DEFAULT 'reserved'::text NOT NULL,
    cost_micros bigint,
    usage jsonb,
    expires_at timestamp with time zone DEFAULT (now() + '00:00:30'::interval) NOT NULL,
    CONSTRAINT career_model_reservations_v1_bound_micros_check CHECK (((bound_micros >= 1) AND (bound_micros <= 25000))),
    CONSTRAINT career_model_reservations_v1_state_check CHECK ((state = ANY (ARRAY['reserved'::text, 'started'::text, 'recorded'::text, 'unknown'::text, 'not_sent'::text])))
);


--
-- Name: career_reminder_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_reminder_outbox (
    user_id uuid NOT NULL,
    reminder_id text NOT NULL,
    payload jsonb,
    record jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    lease_token uuid,
    lease_until timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    seen_at timestamp with time zone,
    CONSTRAINT career_reminder_outbox_reminder_id_check CHECK (((length(reminder_id) >= 1) AND (length(reminder_id) <= 200))),
    CONSTRAINT career_reminder_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'claimed'::text, 'uncertain'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: career_task_effects_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_task_effects_v1 (
    user_id uuid NOT NULL,
    intent_id text NOT NULL,
    effect_key text NOT NULL,
    task_id text NOT NULL,
    operation text NOT NULL,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    state text NOT NULL,
    before_sha256 text,
    after_sha256 text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT career_task_effects_v1_state_check CHECK ((state = ANY (ARRAY['reserved'::text, 'started'::text, 'completed'::text, 'definitely_failed'::text, 'uncertain'::text])))
);


--
-- Name: career_watch_kv; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.career_watch_kv (
    user_id uuid NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE career_watch_kv; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.career_watch_kv IS 'MI-032 alerts host wiring: generic per-user KV for the career watch/assign state (152 watch profiles, reminder queues, seat history; 151 per-board snapshots; host delivery ledger). Written/read by scripts/career/alerts-host.mjs createSupabaseStore via the service role. Design: docs/career/alerts-host-wiring.md.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL
);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: agent_flow_state agent_flow_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_flow_state
    ADD CONSTRAINT agent_flow_state_pkey PRIMARY KEY (thread_id);


--
-- Name: agent_messages agent_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_pkey PRIMARY KEY (id);


--
-- Name: agent_model_calls agent_model_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_model_calls
    ADD CONSTRAINT agent_model_calls_pkey PRIMARY KEY (id);


--
-- Name: agent_model_calls agent_model_calls_user_id_request_id_step_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_model_calls
    ADD CONSTRAINT agent_model_calls_user_id_request_id_step_key UNIQUE (user_id, request_id, step);


--
-- Name: agent_threads agent_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_threads
    ADD CONSTRAINT agent_threads_pkey PRIMARY KEY (id);


--
-- Name: agent_usage agent_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_usage
    ADD CONSTRAINT agent_usage_pkey PRIMARY KEY (id);


--
-- Name: career_applicant_resumes_v1 career_applicant_resumes_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_applicant_resumes_v1
    ADD CONSTRAINT career_applicant_resumes_v1_pkey PRIMARY KEY (user_id, artifact_id, version_id);


--
-- Name: career_applicant_resumes_v1 career_applicant_resumes_v1_user_id_confirmation_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_applicant_resumes_v1
    ADD CONSTRAINT career_applicant_resumes_v1_user_id_confirmation_key_key UNIQUE (user_id, confirmation_key);


--
-- Name: career_applicant_uploads_v1 career_applicant_uploads_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_applicant_uploads_v1
    ADD CONSTRAINT career_applicant_uploads_v1_pkey PRIMARY KEY (user_id, upload_id);


--
-- Name: career_applicant_uploads_v1 career_applicant_uploads_v1_user_id_request_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_applicant_uploads_v1
    ADD CONSTRAINT career_applicant_uploads_v1_user_id_request_key_key UNIQUE (user_id, request_key);


--
-- Name: career_application_admissions_v1 career_application_admissions_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_admissions_v1
    ADD CONSTRAINT career_application_admissions_v1_pkey PRIMARY KEY (user_id, task_id);


--
-- Name: career_application_batch_commands_v1 career_application_batch_commands_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_batch_commands_v1
    ADD CONSTRAINT career_application_batch_commands_v1_pkey PRIMARY KEY (user_id, request_key);


--
-- Name: career_application_batch_reviews_v1 career_application_batch_reviews_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_batch_reviews_v1
    ADD CONSTRAINT career_application_batch_reviews_v1_pkey PRIMARY KEY (user_id, batch_id, review_sha256);


--
-- Name: career_application_batch_roles_v1 career_application_batch_roles_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_batch_roles_v1
    ADD CONSTRAINT career_application_batch_roles_v1_pkey PRIMARY KEY (user_id, batch_id, task_id);


--
-- Name: career_application_batches_v1 career_application_batches_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_batches_v1
    ADD CONSTRAINT career_application_batches_v1_pkey PRIMARY KEY (user_id, batch_id);


--
-- Name: career_application_profile_reviews_v1 career_application_profile_re_user_id_thread_id_request_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_profile_reviews_v1
    ADD CONSTRAINT career_application_profile_re_user_id_thread_id_request_key_key UNIQUE (user_id, thread_id, request_key);


--
-- Name: career_application_profile_reviews_v1 career_application_profile_reviews_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_profile_reviews_v1
    ADD CONSTRAINT career_application_profile_reviews_v1_pkey PRIMARY KEY (user_id, review_sha256);


--
-- Name: career_application_scope_requests_v1 career_application_scope_requests_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_scope_requests_v1
    ADD CONSTRAINT career_application_scope_requests_v1_pkey PRIMARY KEY (user_id, thread_id, request_key);


--
-- Name: career_application_search_scopes_v1 career_application_search_scopes_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_search_scopes_v1
    ADD CONSTRAINT career_application_search_scopes_v1_pkey PRIMARY KEY (user_id, thread_id);


--
-- Name: career_application_searches_v1 career_application_searches_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_searches_v1
    ADD CONSTRAINT career_application_searches_v1_pkey PRIMARY KEY (user_id, search_id);


--
-- Name: career_application_searches_v1 career_application_searches_v_user_id_thread_id_request_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_searches_v1
    ADD CONSTRAINT career_application_searches_v_user_id_thread_id_request_key_key UNIQUE (user_id, thread_id, request_key);


--
-- Name: career_model_campaign_v1 career_model_campaign_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_campaign_v1
    ADD CONSTRAINT career_model_campaign_v1_pkey PRIMARY KEY (campaign);


--
-- Name: career_model_pair_legs_v2 career_model_pair_legs_v2_monthly_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pair_legs_v2
    ADD CONSTRAINT career_model_pair_legs_v2_monthly_id_key UNIQUE (monthly_id);


--
-- Name: career_model_pair_legs_v2 career_model_pair_legs_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pair_legs_v2
    ADD CONSTRAINT career_model_pair_legs_v2_pkey PRIMARY KEY (pair_id, kind);


--
-- Name: career_model_pair_legs_v2 career_model_pair_legs_v2_ticket_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pair_legs_v2
    ADD CONSTRAINT career_model_pair_legs_v2_ticket_id_key UNIQUE (ticket_id);


--
-- Name: career_model_pair_policy_v2 career_model_pair_policy_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pair_policy_v2
    ADD CONSTRAINT career_model_pair_policy_v2_pkey PRIMARY KEY (policy_digest);


--
-- Name: career_model_pairs_v2 career_model_pairs_v2_id_user_id_thread_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pairs_v2
    ADD CONSTRAINT career_model_pairs_v2_id_user_id_thread_id_key UNIQUE (id, user_id, thread_id);


--
-- Name: career_model_pairs_v2 career_model_pairs_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pairs_v2
    ADD CONSTRAINT career_model_pairs_v2_pkey PRIMARY KEY (id);


--
-- Name: career_model_pairs_v2 career_model_pairs_v2_user_id_thread_id_turn_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pairs_v2
    ADD CONSTRAINT career_model_pairs_v2_user_id_thread_id_turn_key_key UNIQUE (user_id, thread_id, turn_key);


--
-- Name: career_model_reservations_v1 career_model_reservations_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_reservations_v1
    ADD CONSTRAINT career_model_reservations_v1_pkey PRIMARY KEY (id);


--
-- Name: career_model_reservations_v1 career_model_reservations_v1_user_id_thread_id_turn_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_reservations_v1
    ADD CONSTRAINT career_model_reservations_v1_user_id_thread_id_turn_key_key UNIQUE (user_id, thread_id, turn_key);


--
-- Name: career_reminder_outbox career_reminder_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_reminder_outbox
    ADD CONSTRAINT career_reminder_outbox_pkey PRIMARY KEY (user_id, reminder_id);


--
-- Name: career_task_effects_v1 career_task_effects_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_task_effects_v1
    ADD CONSTRAINT career_task_effects_v1_pkey PRIMARY KEY (user_id, intent_id, effect_key);


--
-- Name: career_task_effects_v1 career_task_effects_v1_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_task_effects_v1
    ADD CONSTRAINT career_task_effects_v1_token_key UNIQUE (token);


--
-- Name: career_task_intents_v1 career_task_intents_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_task_intents_v1
    ADD CONSTRAINT career_task_intents_v1_pkey PRIMARY KEY (user_id, intent_id);


--
-- Name: career_task_intents_v1 career_task_intents_v1_user_id_event_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_task_intents_v1
    ADD CONSTRAINT career_task_intents_v1_user_id_event_hash_key UNIQUE (user_id, event_hash);


--
-- Name: career_task_intents_v1 career_task_intents_v1_user_id_thread_id_turn_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_task_intents_v1
    ADD CONSTRAINT career_task_intents_v1_user_id_thread_id_turn_key_key UNIQUE (user_id, thread_id, turn_key);


--
-- Name: career_watch_kv career_watch_kv_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_watch_kv
    ADD CONSTRAINT career_watch_kv_pkey PRIMARY KEY (user_id, key);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: agent_model_calls_user_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_model_calls_user_month ON public.agent_model_calls USING btree (user_id, created_at);


--
-- Name: agent_usage_call_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agent_usage_call_id ON public.agent_usage USING btree (call_id) WHERE (call_id IS NOT NULL);


--
-- Name: career_applicant_resume_latest_v1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX career_applicant_resume_latest_v1 ON public.career_applicant_resumes_v1 USING btree (user_id, privacy_epoch, sequence DESC);


--
-- Name: career_applicant_upload_expiry_v1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX career_applicant_upload_expiry_v1 ON public.career_applicant_uploads_v1 USING btree (expires_at) WHERE (NOT confirmed);


--
-- Name: career_application_admissions_owner_time_v1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX career_application_admissions_owner_time_v1 ON public.career_application_admissions_v1 USING btree (user_id, admitted_at);


--
-- Name: career_model_started_deadline_v1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX career_model_started_deadline_v1 ON public.career_model_reservations_v1 USING btree (expires_at) WHERE (state = 'started'::text);


--
-- Name: career_model_unknown_v1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX career_model_unknown_v1 ON public.career_model_reservations_v1 USING btree (state) WHERE (state = 'unknown'::text);


--
-- Name: career_pair_monthly_owner_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX career_pair_monthly_owner_v2 ON public.agent_model_calls USING btree (id, user_id, thread_id);


--
-- Name: career_pair_owner_thread_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX career_pair_owner_thread_v2 ON public.career_model_pairs_v2 USING btree (user_id, thread_id);


--
-- Name: career_pair_thread_owner_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX career_pair_thread_owner_v2 ON public.agent_threads USING btree (id, user_id);


--
-- Name: career_pair_ticket_owner_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX career_pair_ticket_owner_v2 ON public.career_model_reservations_v1 USING btree (id, user_id, thread_id);


--
-- Name: career_reminder_unseen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX career_reminder_unseen ON public.career_reminder_outbox USING btree (user_id, delivered_at) WHERE ((status = 'delivered'::text) AND (seen_at IS NULL));


--
-- Name: career_task_one_submit_v1; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX career_task_one_submit_v1 ON public.career_task_effects_v1 USING btree (user_id, task_id) WHERE (operation = 'submit'::text);


--
-- Name: career_task_owned_scope_v1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX career_task_owned_scope_v1 ON public.career_task_intents_v1 USING btree (user_id, task_id, claim_worker, privacy_epoch) WHERE (claim_worker IS NOT NULL);


--
-- Name: career_task_pending_scope_v1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX career_task_pending_scope_v1 ON public.career_task_intents_v1 USING btree (user_id, COALESCE(task_id, (binding ->> 'task_id'::text)), created_at, intent_id) WHERE (state = ANY (ARRAY['queued'::text, 'claimed'::text]));


--
-- Name: career_watch_kv career_applicant_resume_erasure_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER career_applicant_resume_erasure_v1 AFTER DELETE OR UPDATE ON public.career_watch_kv FOR EACH ROW EXECUTE FUNCTION public.career_applicant_resume_erase_v1();


--
-- Name: career_watch_kv career_applicant_turn_version_stamp_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER career_applicant_turn_version_stamp_v1 BEFORE INSERT OR UPDATE ON public.career_watch_kv FOR EACH ROW EXECUTE FUNCTION public.career_applicant_turn_version_v1();


--
-- Name: career_watch_kv career_applicant_upload_erasure_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER career_applicant_upload_erasure_v1 AFTER DELETE OR UPDATE ON public.career_watch_kv FOR EACH ROW EXECUTE FUNCTION public.career_applicant_upload_erase_v1();


--
-- Name: career_task_effects_v1 career_application_admission_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER career_application_admission_v1 BEFORE INSERT ON public.career_task_effects_v1 FOR EACH ROW EXECUTE FUNCTION public.career_application_admit_v1();


--
-- Name: career_task_intents_v1 career_application_approval_source_guard_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER career_application_approval_source_guard_v1 BEFORE INSERT ON public.career_task_intents_v1 FOR EACH ROW EXECUTE FUNCTION public.career_application_approval_source_guard_v1();


--
-- Name: career_watch_kv career_application_batch_erase_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER career_application_batch_erase_v1 AFTER DELETE OR UPDATE ON public.career_watch_kv FOR EACH ROW EXECUTE FUNCTION public.career_application_batch_erase_v1();


--
-- Name: career_watch_kv career_application_conversation_erasure_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER career_application_conversation_erasure_v1 AFTER DELETE OR UPDATE ON public.career_watch_kv FOR EACH ROW EXECUTE FUNCTION public.career_application_conversation_erase_v1();


--
-- Name: career_watch_kv career_journey_context_cursor_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER career_journey_context_cursor_v1 AFTER INSERT OR UPDATE OF value ON public.career_watch_kv FOR EACH ROW EXECUTE FUNCTION public.career_journey_context_cursor_v1();


--
-- Name: career_watch_kv career_task_account_control_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER career_task_account_control_v1 AFTER INSERT OR DELETE OR UPDATE ON public.career_watch_kv FOR EACH ROW EXECUTE FUNCTION public.career_task_control_hook_v1();


--
-- Name: career_task_effects_v1 career_task_owned_effect_fence_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER career_task_owned_effect_fence_v1 BEFORE INSERT OR UPDATE ON public.career_task_effects_v1 FOR EACH ROW EXECUTE FUNCTION public.career_task_owned_lease_fence_v1();


--
-- Name: career_task_intents_v1 career_task_owned_finish_fence_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER career_task_owned_finish_fence_v1 BEFORE UPDATE ON public.career_task_intents_v1 FOR EACH ROW EXECUTE FUNCTION public.career_task_owned_lease_fence_v1();


--
-- Name: agent_flow_state agent_flow_state_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_flow_state
    ADD CONSTRAINT agent_flow_state_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.agent_threads(id) ON DELETE CASCADE;


--
-- Name: agent_flow_state agent_flow_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_flow_state
    ADD CONSTRAINT agent_flow_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_messages agent_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.agent_threads(id);


--
-- Name: agent_model_calls agent_model_calls_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_model_calls
    ADD CONSTRAINT agent_model_calls_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.agent_threads(id) ON DELETE CASCADE;


--
-- Name: agent_model_calls agent_model_calls_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_model_calls
    ADD CONSTRAINT agent_model_calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_threads agent_threads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_threads
    ADD CONSTRAINT agent_threads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: agent_usage agent_usage_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_usage
    ADD CONSTRAINT agent_usage_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.agent_model_calls(id) ON DELETE CASCADE;


--
-- Name: agent_usage agent_usage_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_usage
    ADD CONSTRAINT agent_usage_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.agent_threads(id) ON DELETE CASCADE;


--
-- Name: agent_usage agent_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_usage
    ADD CONSTRAINT agent_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_applicant_resumes_v1 career_applicant_resumes_v1_confirmation_thread_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_applicant_resumes_v1
    ADD CONSTRAINT career_applicant_resumes_v1_confirmation_thread_fkey FOREIGN KEY (confirmation_thread) REFERENCES public.agent_threads(id);


--
-- Name: career_applicant_resumes_v1 career_applicant_resumes_v1_user_id_confirmation_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_applicant_resumes_v1
    ADD CONSTRAINT career_applicant_resumes_v1_user_id_confirmation_key_fkey FOREIGN KEY (user_id, confirmation_key) REFERENCES public.career_watch_kv(user_id, key) ON DELETE CASCADE;


--
-- Name: career_applicant_resumes_v1 career_applicant_resumes_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_applicant_resumes_v1
    ADD CONSTRAINT career_applicant_resumes_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_applicant_resumes_v1 career_applicant_resumes_v1_user_id_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_applicant_resumes_v1
    ADD CONSTRAINT career_applicant_resumes_v1_user_id_upload_id_fkey FOREIGN KEY (user_id, upload_id) REFERENCES public.career_applicant_uploads_v1(user_id, upload_id) ON DELETE CASCADE;


--
-- Name: career_applicant_uploads_v1 career_applicant_uploads_v1_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_applicant_uploads_v1
    ADD CONSTRAINT career_applicant_uploads_v1_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.agent_threads(id);


--
-- Name: career_applicant_uploads_v1 career_applicant_uploads_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_applicant_uploads_v1
    ADD CONSTRAINT career_applicant_uploads_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_application_admissions_v1 career_application_admissions_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_admissions_v1
    ADD CONSTRAINT career_application_admissions_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_application_admissions_v1 career_application_admissions_v1_user_id_intent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_admissions_v1
    ADD CONSTRAINT career_application_admissions_v1_user_id_intent_id_fkey FOREIGN KEY (user_id, intent_id) REFERENCES public.career_task_intents_v1(user_id, intent_id);


--
-- Name: career_application_batch_commands_v1 career_application_batch_commands_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_batch_commands_v1
    ADD CONSTRAINT career_application_batch_commands_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_application_batch_reviews_v1 career_application_batch_reviews_v1_user_id_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_batch_reviews_v1
    ADD CONSTRAINT career_application_batch_reviews_v1_user_id_batch_id_fkey FOREIGN KEY (user_id, batch_id) REFERENCES public.career_application_batches_v1(user_id, batch_id) ON DELETE CASCADE;


--
-- Name: career_application_batch_roles_v1 career_application_batch_roles_v1_user_id_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_batch_roles_v1
    ADD CONSTRAINT career_application_batch_roles_v1_user_id_batch_id_fkey FOREIGN KEY (user_id, batch_id) REFERENCES public.career_application_batches_v1(user_id, batch_id) ON DELETE CASCADE;


--
-- Name: career_application_batch_roles_v1 career_application_batch_roles_v1_user_id_last_intent_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_batch_roles_v1
    ADD CONSTRAINT career_application_batch_roles_v1_user_id_last_intent_fkey FOREIGN KEY (user_id, last_intent) REFERENCES public.career_task_intents_v1(user_id, intent_id) ON DELETE CASCADE;


--
-- Name: career_application_batch_roles_v1 career_application_batch_roles_v1_user_id_source_intent_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_batch_roles_v1
    ADD CONSTRAINT career_application_batch_roles_v1_user_id_source_intent_fkey FOREIGN KEY (user_id, source_intent) REFERENCES public.career_task_intents_v1(user_id, intent_id) ON DELETE CASCADE;


--
-- Name: career_application_batches_v1 career_application_batches_v1_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_batches_v1
    ADD CONSTRAINT career_application_batches_v1_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.agent_threads(id);


--
-- Name: career_application_batches_v1 career_application_batches_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_batches_v1
    ADD CONSTRAINT career_application_batches_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_application_profile_reviews_v1 career_application_profile_reviews_v1_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_profile_reviews_v1
    ADD CONSTRAINT career_application_profile_reviews_v1_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.agent_threads(id);


--
-- Name: career_application_profile_reviews_v1 career_application_profile_reviews_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_profile_reviews_v1
    ADD CONSTRAINT career_application_profile_reviews_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_application_scope_requests_v1 career_application_scope_requests_v1_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_scope_requests_v1
    ADD CONSTRAINT career_application_scope_requests_v1_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.agent_threads(id);


--
-- Name: career_application_scope_requests_v1 career_application_scope_requests_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_scope_requests_v1
    ADD CONSTRAINT career_application_scope_requests_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_application_search_scopes_v1 career_application_search_scopes_v1_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_search_scopes_v1
    ADD CONSTRAINT career_application_search_scopes_v1_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.agent_threads(id);


--
-- Name: career_application_search_scopes_v1 career_application_search_scopes_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_search_scopes_v1
    ADD CONSTRAINT career_application_search_scopes_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_application_searches_v1 career_application_searches_v1_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_searches_v1
    ADD CONSTRAINT career_application_searches_v1_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.agent_threads(id);


--
-- Name: career_application_searches_v1 career_application_searches_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_searches_v1
    ADD CONSTRAINT career_application_searches_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_application_searches_v1 career_application_searches_v1_user_id_selected_batch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_application_searches_v1
    ADD CONSTRAINT career_application_searches_v1_user_id_selected_batch_fkey FOREIGN KEY (user_id, selected_batch) REFERENCES public.career_application_batches_v1(user_id, batch_id) ON DELETE CASCADE;


--
-- Name: career_model_pair_legs_v2 career_model_pair_legs_v2_monthly_id_user_id_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pair_legs_v2
    ADD CONSTRAINT career_model_pair_legs_v2_monthly_id_user_id_thread_id_fkey FOREIGN KEY (monthly_id, user_id, thread_id) REFERENCES public.agent_model_calls(id, user_id, thread_id);


--
-- Name: career_model_pair_legs_v2 career_model_pair_legs_v2_pair_id_user_id_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pair_legs_v2
    ADD CONSTRAINT career_model_pair_legs_v2_pair_id_user_id_thread_id_fkey FOREIGN KEY (pair_id, user_id, thread_id) REFERENCES public.career_model_pairs_v2(id, user_id, thread_id) ON DELETE CASCADE;


--
-- Name: career_model_pair_legs_v2 career_model_pair_legs_v2_ticket_id_user_id_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pair_legs_v2
    ADD CONSTRAINT career_model_pair_legs_v2_ticket_id_user_id_thread_id_fkey FOREIGN KEY (ticket_id, user_id, thread_id) REFERENCES public.career_model_reservations_v1(id, user_id, thread_id);


--
-- Name: career_model_pairs_v2 career_model_pairs_v2_policy_digest_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pairs_v2
    ADD CONSTRAINT career_model_pairs_v2_policy_digest_fkey FOREIGN KEY (policy_digest) REFERENCES public.career_model_pair_policy_v2(policy_digest);


--
-- Name: career_model_pairs_v2 career_model_pairs_v2_thread_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pairs_v2
    ADD CONSTRAINT career_model_pairs_v2_thread_id_user_id_fkey FOREIGN KEY (thread_id, user_id) REFERENCES public.agent_threads(id, user_id);


--
-- Name: career_model_pairs_v2 career_model_pairs_v2_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_pairs_v2
    ADD CONSTRAINT career_model_pairs_v2_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_model_reservations_v1 career_model_reservations_v1_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_reservations_v1
    ADD CONSTRAINT career_model_reservations_v1_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.agent_threads(id);


--
-- Name: career_model_reservations_v1 career_model_reservations_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_model_reservations_v1
    ADD CONSTRAINT career_model_reservations_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_reminder_outbox career_reminder_outbox_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_reminder_outbox
    ADD CONSTRAINT career_reminder_outbox_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_task_effects_v1 career_task_effects_v1_user_id_intent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_task_effects_v1
    ADD CONSTRAINT career_task_effects_v1_user_id_intent_id_fkey FOREIGN KEY (user_id, intent_id) REFERENCES public.career_task_intents_v1(user_id, intent_id);


--
-- Name: career_task_intents_v1 career_task_intents_v1_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_task_intents_v1
    ADD CONSTRAINT career_task_intents_v1_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.agent_threads(id);


--
-- Name: career_task_intents_v1 career_task_intents_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_task_intents_v1
    ADD CONSTRAINT career_task_intents_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: career_watch_kv career_watch_kv_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.career_watch_kv
    ADD CONSTRAINT career_watch_kv_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);


--
-- Name: agent_model_calls agent_model_call_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_model_call_owner ON public.agent_model_calls FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: agent_model_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_model_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: career_application_batch_commands_v1 backend_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY backend_only ON public.career_application_batch_commands_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_application_batch_reviews_v1 backend_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY backend_only ON public.career_application_batch_reviews_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_application_batch_roles_v1 backend_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY backend_only ON public.career_application_batch_roles_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_application_batches_v1 backend_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY backend_only ON public.career_application_batches_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_application_profile_reviews_v1 backend_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY backend_only ON public.career_application_profile_reviews_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_application_scope_requests_v1 backend_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY backend_only ON public.career_application_scope_requests_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_application_search_scopes_v1 backend_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY backend_only ON public.career_application_search_scopes_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_application_searches_v1 backend_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY backend_only ON public.career_application_searches_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_applicant_resumes_v1 career_applicant_resume_backend_v1; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_applicant_resume_backend_v1 ON public.career_applicant_resumes_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_applicant_resumes_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_applicant_resumes_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_applicant_uploads_v1 career_applicant_upload_backend_v1; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_applicant_upload_backend_v1 ON public.career_applicant_uploads_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_applicant_uploads_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_applicant_uploads_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_application_admissions_v1 career_application_admissions_backend_v1; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_application_admissions_backend_v1 ON public.career_application_admissions_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_application_admissions_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_application_admissions_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_application_batch_commands_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_application_batch_commands_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_application_batch_reviews_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_application_batch_reviews_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_application_batch_roles_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_application_batch_roles_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_application_batches_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_application_batches_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_application_profile_reviews_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_application_profile_reviews_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_application_scope_requests_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_application_scope_requests_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_application_search_scopes_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_application_search_scopes_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_application_searches_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_application_searches_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_task_effects_v1 career_effect_backend_v1; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_effect_backend_v1 ON public.career_task_effects_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_model_campaign_v1 career_model_campaign_backend; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_model_campaign_backend ON public.career_model_campaign_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_model_campaign_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_model_campaign_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_model_pair_legs_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_model_pair_legs_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_model_pair_policy_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_model_pair_policy_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_model_pairs_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_model_pairs_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_model_reservations_v1 career_model_reservation_backend; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_model_reservation_backend ON public.career_model_reservations_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_model_reservations_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_model_reservations_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_model_pair_legs_v2 career_pair_leg_backend_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_pair_leg_backend_v2 ON public.career_model_pair_legs_v2 TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_model_calls career_pair_monthly_backend_read_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_pair_monthly_backend_read_v2 ON public.agent_model_calls FOR SELECT TO service_role USING (true);


--
-- Name: agent_model_calls career_pair_monthly_unsent_refund_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_pair_monthly_unsent_refund_v2 ON public.agent_model_calls FOR DELETE TO service_role USING (((state = 'reserved'::text) AND (usage IS NULL)));


--
-- Name: career_model_pairs_v2 career_pair_parent_backend_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_pair_parent_backend_v2 ON public.career_model_pairs_v2 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_model_pair_policy_v2 career_pair_policy_backend_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_pair_policy_backend_v2 ON public.career_model_pair_policy_v2 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_reminder_outbox career_reminder_backend; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_reminder_backend ON public.career_reminder_outbox TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_reminder_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_reminder_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: career_task_intents_v1 career_task_backend_v1; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_task_backend_v1 ON public.career_task_intents_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_task_effects_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_task_effects_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_task_intents_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_task_intents_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: career_watch_kv career_watch_backend; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY career_watch_backend ON public.career_watch_kv TO service_role USING (true) WITH CHECK (true);


--
-- Name: career_watch_kv; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.career_watch_kv ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict aSwCRlCblpvG7Afwf5kTN1DmpUqqmLGpSoEmYmYc8ovcGjhIzqhbYIO7JMXgOGM