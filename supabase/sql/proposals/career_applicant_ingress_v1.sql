-- UNAPPLIED forward proposal after career_applicant_resume_store_v1.sql.
-- Standalone authenticated applicant ingress; no agent-chat/native edits.
create function public.career_applicant_canonical_v1(v jsonb) returns text language sql immutable security invoker set search_path=public,pg_temp as $$
 select case jsonb_typeof(v)
 when 'object' then '{'||coalesce((select string_agg(to_json(key)::text||':'||career_applicant_canonical_v1(value),',' order by key collate "C") from jsonb_each(v)),'')||'}'
 when 'array' then '['||coalesce((select string_agg(career_applicant_canonical_v1(value),',' order by ord) from jsonb_array_elements(v) with ordinality x(value,ord)),'')||']'
 else v::text end;
$$;
create table public.career_applicant_uploads_v1(
 user_id uuid not null references auth.users(id) on delete cascade,
 upload_id uuid not null,artifact_id text not null,thread_id uuid not null references agent_threads(id),request_key text not null,
 privacy_epoch bigint not null,filename text not null,content_type text not null,sha256 text not null,bytes integer not null,
 content bytea,validation jsonb not null,review jsonb,confirmed boolean not null default false,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes',
 primary key(user_id,upload_id),unique(user_id,request_key),
 check(bytes between 1 and 1048576),check(content is null or octet_length(content)=bytes),
 check(sha256 ~ '^[a-f0-9]{64}$'),check(filename !~ '[[:cntrl:]/\\]' and length(filename) between 1 and 180),
 check(content_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
);
create index career_applicant_upload_expiry_v1 on career_applicant_uploads_v1(expires_at) where not confirmed;
alter table career_applicant_uploads_v1 enable row level security;
revoke all on career_applicant_uploads_v1 from public,anon,authenticated;
grant select,insert,update,delete on career_applicant_uploads_v1 to service_role;
create policy career_applicant_upload_backend_v1 on career_applicant_uploads_v1 for all to service_role using(true) with check(true);
alter table career_applicant_resumes_v1 add column upload_id uuid,add column confirmed_fields jsonb not null default '[]'::jsonb,
 add foreign key(user_id,upload_id) references career_applicant_uploads_v1(user_id,upload_id) on delete cascade;

create function public.career_applicant_upload_sweep_v1(p_user uuid,p_limit integer default 20) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;
begin
 if p_user is null or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid upload cleanup scope';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 with expired as(select upload_id from career_applicant_uploads_v1 where user_id=p_user and not confirmed and expires_at<=clock_timestamp() order by expires_at limit p_limit)
 delete from career_applicant_uploads_v1 u using expired e where u.user_id=p_user and u.upload_id=e.upload_id;
 get diagnostics n=row_count;return jsonb_build_object('deleted',n);
end $$;

create function public.career_applicant_upload_turn_v1(p_base jsonb,p_upload jsonb,p_encoded text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
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
end $$;

create function public.career_applicant_review_v1(p_user uuid,p_thread uuid,p_upload uuid,p_fields jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
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

create function public.career_applicant_confirm_turn_v1(p_base jsonb,p_upload uuid,p_review text,p_fields jsonb,p_message text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
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
end $$;

alter function public.career_applicant_equipment_resolve_v1(uuid,text,bigint,bigint,text,text,uuid,text,text,boolean) rename to career_applicant_equipment_resolve_base_v1;
create function public.career_applicant_equipment_resolve_v1(p_user uuid,p_artifact text,p_version bigint,p_epoch bigint,p_task text,p_intent text,p_lease uuid,p_posting text,p_sha text,p_include_bytes boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
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
create function public.career_applicant_upload_erase_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if coalesce(new.key,old.key)='career:account' and (tg_op='DELETE' or (tg_op='UPDATE' and coalesce((new.value->>'epoch')::bigint,0) is distinct from coalesce((old.value->>'epoch')::bigint,0))) then delete from career_applicant_uploads_v1 where user_id=coalesce(new.user_id,old.user_id);end if;
 return null;
end $$;
create trigger career_applicant_upload_erasure_v1 after update or delete on career_watch_kv for each row execute function career_applicant_upload_erase_v1();
revoke all on function career_applicant_canonical_v1(jsonb),career_applicant_upload_sweep_v1(uuid,integer),career_applicant_upload_turn_v1(jsonb,jsonb,text),career_applicant_review_v1(uuid,uuid,uuid,jsonb),career_applicant_confirm_turn_v1(jsonb,uuid,text,jsonb,text),career_applicant_equipment_resolve_v1(uuid,text,bigint,bigint,text,text,uuid,text,text,boolean),career_applicant_upload_erase_v1() from public,anon,authenticated;
grant execute on function career_applicant_canonical_v1(jsonb),career_applicant_upload_sweep_v1(uuid,integer),career_applicant_upload_turn_v1(jsonb,jsonb,text),career_applicant_review_v1(uuid,uuid,uuid,jsonb),career_applicant_confirm_turn_v1(jsonb,uuid,text,jsonb,text),career_applicant_equipment_resolve_v1(uuid,text,bigint,bigint,text,text,uuid,text,text,boolean),career_applicant_upload_erase_v1() to service_role;

-- Read-only reload discovery. Global same-epoch resume metadata is available
-- in any owned thread; source-thread contact facts and original bytes are not.
-- The existing account and immutable confirmation receipt remain authority.
create function public.career_applicant_status_v1(p_user uuid,p_thread uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
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
revoke all on function public.career_applicant_status_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.career_applicant_status_v1(uuid,uuid) to service_role;
