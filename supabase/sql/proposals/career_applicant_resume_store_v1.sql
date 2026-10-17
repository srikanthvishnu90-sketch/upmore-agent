-- UNAPPLIED SOURCE PROPOSAL. Requires memory/task migrations and owned-claim
-- proposal already in this branch. No application sends, new account authority,
-- credentials, buckets, background jobs or fabricated legacy confirmations.
-- Existing snapshots contain no durable PDF/DOCX byte store. This is the minimal
-- new private byte record; profile basics remain unconfirmed and are NOT mapped.
create table public.career_applicant_resumes_v1 (
 user_id uuid not null references auth.users(id) on delete cascade,
 artifact_id text not null check(artifact_id ~ '^[A-Za-z0-9_-]{1,160}$'),
 version_id text not null check(version_id ~ '^[A-Za-z0-9_-]{1,160}$'),
 sequence bigint generated always as identity,
 privacy_epoch bigint not null check(privacy_epoch>=0),
 filename text not null check(length(filename) between 1 and 180 and filename !~ '[[:cntrl:]/\\]' and filename not in ('.','..')),
 content_type text not null check(content_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 content bytea not null check(octet_length(content) between 1 and 1048576),
 sha256 text generated always as (encode(sha256(content),'hex')) stored,
 confirmation_thread uuid not null references public.agent_threads(id),
 confirmation_account_version bigint not null,
 confirmation_key text not null,
 confirmation_ref text not null check(confirmation_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
 confirmed_at timestamptz not null default now(),
 primary key(user_id,artifact_id,version_id),unique(user_id,confirmation_key),
 foreign key(user_id,confirmation_key) references public.career_watch_kv(user_id,key) on delete cascade
);
create index career_applicant_resume_latest_v1 on public.career_applicant_resumes_v1(user_id,privacy_epoch,sequence desc);
alter table public.career_applicant_resumes_v1 enable row level security;
revoke all on public.career_applicant_resumes_v1 from public,anon,authenticated;
grant select,insert,delete on public.career_applicant_resumes_v1 to service_role;
grant usage,select on sequence public.career_applicant_resumes_v1_sequence_seq to service_role;
create policy career_applicant_resume_backend_v1 on public.career_applicant_resumes_v1 for all to service_role using(true) with check(true);

-- Stamp new durable turn receipts from the existing account row. Timestamps
-- are not an authority/version proof (several writes can share a transaction).
-- Legacy receipts are never retrospectively upgraded to explicit confirmation.
create function public.career_applicant_turn_version_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
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
create trigger career_applicant_turn_version_stamp_v1 before insert or update on public.career_watch_kv for each row execute function public.career_applicant_turn_version_v1();

-- Called ONLY by a server-owned upload/confirmation handler after a genuine
-- authenticated plain-text turn commits. No such upload handler exists yet.
-- Source provenance is the exact existing careerRequestHash v2 + owned turn
-- receipt, not a caller's boolean or inferred status on a resume fact.
create function public.career_applicant_resume_confirm_v1(p_user uuid,p_thread uuid,p_key text,p_artifact text,p_version text,p_filename text,p_type text,p_encoded text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
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
end $$;

-- This is a task/lease scoped read, never an arbitrary owner/profile dump.
-- The original prepare request anchors artifact/hash/posting; approve still
-- needs its own existing exact approval intent. It starts no browser action.
create function public.career_applicant_equipment_resolve_v1(p_user uuid,p_artifact text,p_version bigint,p_epoch bigint,p_task text,p_intent text,p_lease uuid,p_posting text,p_sha text,p_include_bytes boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;i career_task_intents_v1;latest career_applicant_resumes_v1;record jsonb;confirmation jsonb;r jsonb;
begin
 if p_user is null or p_version is null or p_epoch is null or p_lease is null or p_include_bytes is null or coalesce(p_task,'') !~ '^[a-f0-9]{32}$' or coalesce(p_intent,'') !~ '^[a-f0-9]{64}$' or coalesce(p_sha,'') !~ '^[a-f0-9]{64}$' then raise exception 'applicant scope required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent;
 if a is null or a->'paused'='true'::jsonb or (a->>'version')::bigint is distinct from p_version or coalesce((a->>'epoch')::bigint,0) is distinct from p_epoch or i.intent_id is null or i.state<>'claimed' or i.task_id is distinct from p_task or i.lease_token is distinct from p_lease or i.expires_at<=now() or i.authority_account_version is distinct from p_version or i.privacy_epoch is distinct from p_epoch or coalesce(i.binding->>'action','') not in ('prepare','approve') or i.binding->>'resume_sha256' is distinct from p_sha or (i.claim_worker is not null and (i.claim_lease_until is null or i.claim_lease_until<=now())) then raise exception 'applicant task authority revoked';end if;
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
end $$;

create function public.career_applicant_resume_erase_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if coalesce(new.key,old.key)='career:account' and (tg_op='DELETE' or (tg_op='UPDATE' and coalesce((new.value->>'epoch')::bigint,0) is distinct from coalesce((old.value->>'epoch')::bigint,0))) then
  delete from career_applicant_resumes_v1 where user_id=coalesce(new.user_id,old.user_id);
 end if;
 return null;
end $$;
create trigger career_applicant_resume_erasure_v1 after update or delete on public.career_watch_kv for each row execute function public.career_applicant_resume_erase_v1();
revoke all on function public.career_applicant_resume_confirm_v1(uuid,uuid,text,text,text,text,text,text),public.career_applicant_equipment_resolve_v1(uuid,text,bigint,bigint,text,text,uuid,text,text,boolean),public.career_applicant_resume_erase_v1(),public.career_applicant_turn_version_v1() from public,anon,authenticated;
grant execute on function public.career_applicant_resume_confirm_v1(uuid,uuid,text,text,text,text,text,text),public.career_applicant_equipment_resolve_v1(uuid,text,bigint,bigint,text,text,uuid,text,text,boolean),public.career_applicant_resume_erase_v1(),public.career_applicant_turn_version_v1() to service_role;
