-- SOURCE ONLY. Apply after owned-claim recovery. No browser is enabled here.
-- An admission is a conservative quota reservation, NOT an employer receipt.
create table public.career_application_admissions_v1 (
 user_id uuid not null references auth.users(id) on delete cascade,
 task_id text not null, intent_id text not null, privacy_epoch bigint not null,
 company_key text not null, vendor text not null, admitted_at timestamptz not null,
 primary key(user_id,task_id),
 foreign key(user_id,intent_id) references public.career_task_intents_v1(user_id,intent_id)
);
create index career_application_admissions_owner_time_v1 on public.career_application_admissions_v1(user_id,admitted_at);
alter table public.career_application_admissions_v1 enable row level security;
revoke all on public.career_application_admissions_v1 from public,anon,authenticated;
grant select,insert on public.career_application_admissions_v1 to service_role;
create policy career_application_admissions_backend_v1 on public.career_application_admissions_v1 for all to service_role using(true) with check(true);

create function public.career_application_admit_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
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
create trigger career_application_admission_v1 before insert on public.career_task_effects_v1 for each row execute function public.career_application_admit_v1();

create function public.career_application_admission_history_v1(p_user uuid,p_intent text,p_lease uuid,p_task text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
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
revoke all on function public.career_application_admit_v1(),public.career_application_admission_history_v1(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.career_application_admit_v1(),public.career_application_admission_history_v1(uuid,text,uuid,text) to service_role;
