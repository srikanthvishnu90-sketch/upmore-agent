-- WO-009b. Private queue; only the owned worker may enqueue/claim/transition.
create table if not exists public.career_apply_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 job_id text not null, company text not null, url text not null check(url ~ '^https?://'), payload jsonb not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'), approval_hash text not null,
 state text not null default 'queued' check(state in ('queued','driving','confirmed','submitted_unconfirmed','needs_user','failed','not_submitted','unknown_outcome')),
 reason text, confirmation_id text, attempts integer not null default 0 check(attempts between 0 and 1),
 lease_token uuid, claimed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), evidence jsonb not null default '{}',
 check(approval_hash=payload_hash), check(octet_length(payload::text)<=262144),unique(user_id,job_id),
 check(state<>'driving' or (attempts=1 and claimed_at is not null and lease_token is not null))
);
alter table public.career_apply_jobs enable row level security;
revoke all on public.career_apply_jobs from public, anon, authenticated;
grant select on public.career_apply_jobs to authenticated;
grant all on public.career_apply_jobs to service_role;
drop policy if exists career_apply_owner_read on public.career_apply_jobs;
create policy career_apply_owner_read on public.career_apply_jobs for select to authenticated using((select auth.uid())=user_id);
create index if not exists career_apply_claim_idx on public.career_apply_jobs(created_at,id) where state='queued';
create index if not exists career_apply_user_idx on public.career_apply_jobs(user_id,created_at);
create index if not exists career_apply_dead_idx on public.career_apply_jobs(claimed_at) where state='driving';

-- Compact deterministic JSON matching the worker's UTF-8 key ordering.
create or replace function public.career_apply_canonical(p jsonb) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
begin
 case jsonb_typeof(p)
 when 'object' then return '{'||coalesce((select string_agg(to_jsonb(key)::text||':'||public.career_apply_canonical(value),',' order by key collate "C") from jsonb_each(p)),'')||'}';
 when 'array' then return '['||coalesce((select string_agg(public.career_apply_canonical(value),',' order by ord) from jsonb_array_elements(p) with ordinality as x(value,ord)),'')||']';
 else return p::text; end case;
end $$;

create or replace function public.career_apply_current(p_user uuid,p_payload jsonb) returns boolean
language plpgsql volatile set search_path=public,pg_temp as $$
declare a jsonb;begin
 select value into a from public.career_watch_kv where user_id=p_user and key='career:account';
 return a is not null and coalesce(a->>'paused','false')='false'
 and coalesce((a->>'epoch')::bigint,0)=(p_payload->>'privacy_epoch')::bigint
 and coalesce((a->>'version')::bigint,0)=(p_payload->>'account_version')::bigint
 and (p_payload->>'expires_at')::timestamptz>clock_timestamp();end
$$;

create or replace function public.career_apply_enqueue(p_payload jsonb,p_hash text,p_approval text,p_daily integer default 15)
returns public.career_apply_jobs language plpgsql set search_path=public,extensions,pg_temp as $$
declare u uuid:=(p_payload->>'user_id')::uuid; j public.career_apply_jobs; co text; counted text[]:=array['queued','driving','confirmed','submitted_unconfirmed','needs_user','unknown_outcome'];
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if p_payload->>'version' is distinct from '1' or nullif(p_payload->>'job_id','') is null or nullif(p_payload->>'company','') is null
 or coalesce(p_payload->>'url','') !~ '^https?://' or jsonb_typeof(p_payload->'fields') is distinct from 'array' or p_daily is null or p_daily not between 1 and 15
 or p_approval is distinct from p_hash or p_hash is distinct from encode(sha256(convert_to(public.career_apply_canonical(p_payload),'UTF8')),'hex')
 or public.career_apply_current(u,p_payload) is distinct from true then raise exception 'invalid or stale application approval'; end if;
 if exists(select from public.career_apply_jobs where user_id=u and job_id=p_payload->>'job_id') then raise exception 'duplicate_job'; end if;
 co:=trim(regexp_replace(regexp_replace(regexp_replace(replace(lower(p_payload->>'company'),'&',' and '),'[^a-z0-9 ]',' ','g'),'\m(inc|llc|ltd|corp|corporation|co|company|the)\M',' ','g'),'\s+',' ','g'));
 if co<>'' and exists(select from public.career_apply_jobs where user_id=u and state=any(counted) and created_at>now()-interval '30 days'
 and trim(regexp_replace(regexp_replace(regexp_replace(replace(lower(company),'&',' and '),'[^a-z0-9 ]',' ','g'),'\m(inc|llc|ltd|corp|corporation|co|company|the)\M',' ','g'),'\s+',' ','g'))=co) then raise exception 'company_cooldown'; end if;
 if (select count(*) from public.career_apply_jobs where user_id=u and state=any(counted) and created_at>now()-interval '1 day')>=p_daily then raise exception 'daily_cap'; end if;
 insert into public.career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash)
 values(u,p_payload->>'job_id',p_payload->>'company',p_payload->>'url',p_payload,p_hash,p_approval) returning * into j; return j;
end $$;

create or replace function public.career_apply_claim(p_now timestamptz,p_limit integer) returns setof public.career_apply_jobs
language sql set search_path=public,pg_temp as $$
 with picked as (select id from public.career_apply_jobs where state='queued' and public.career_apply_current(user_id,payload)
 and approval_hash=payload_hash and attempts=0 and p_now is not null
 order by created_at,id limit greatest(0,least(6,coalesce(p_limit,0))) for update skip locked)
 update public.career_apply_jobs j set state='driving',attempts=1,claimed_at=p_now,lease_token=gen_random_uuid(),updated_at=p_now from picked where j.id=picked.id returning j.*;
$$;

create or replace function public.career_apply_sweep(p_now timestamptz) returns integer
language plpgsql set search_path=public,pg_temp as $$declare n integer;begin
 update public.career_apply_jobs set state='unknown_outcome',reason='application outcome unknown: the drive stopped before recording it; not retried',
 evidence=evidence||jsonb_build_object('swept_at',p_now),updated_at=p_now where state='driving' and claimed_at<p_now-interval '15 minutes';
 get diagnostics n=row_count;return n;end $$;

create or replace function public.career_apply_finish(p_id uuid,p_lease uuid,p_state text,p_evidence jsonb default '{}')
returns public.career_apply_jobs language plpgsql set search_path=public,pg_temp as $$
declare j public.career_apply_jobs;
begin
 select * into j from public.career_apply_jobs where id=p_id and lease_token=p_lease;
 if not found then raise exception 'invalid apply claim'; end if;
 perform pg_advisory_xact_lock(hashtextextended(j.user_id::text,0));
 select * into j from public.career_apply_jobs where id=p_id and lease_token=p_lease for update;
 if not found then raise exception 'invalid apply claim'; end if;
 if p_state is null or p_state not in ('confirmed','submitted_unconfirmed','needs_user','failed','not_submitted','unknown_outcome') or j.state<>'driving' or j.attempts<>1 then raise exception 'invalid apply transition'; end if;
 update public.career_apply_jobs set state=p_state,
 reason=p_evidence->>'reason',confirmation_id=p_evidence->>'confirmation_id',evidence=p_evidence,updated_at=now() where id=p_id returning * into j;
 return j;
end $$;
revoke all on function public.career_apply_canonical(jsonb),public.career_apply_current(uuid,jsonb),public.career_apply_enqueue(jsonb,text,text,integer),public.career_apply_claim(timestamptz,integer),public.career_apply_sweep(timestamptz),public.career_apply_finish(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.career_apply_canonical(jsonb),public.career_apply_current(uuid,jsonb),public.career_apply_enqueue(jsonb,text,text,integer),public.career_apply_claim(timestamptz,integer),public.career_apply_sweep(timestamptz),public.career_apply_finish(uuid,uuid,text,jsonb) to service_role;
