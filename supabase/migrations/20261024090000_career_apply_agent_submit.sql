-- WO-101: the agent submits. The person approves a batch up front, of the exact answers per posting (the extension's
-- batchPlan entry: every answer as it will be sent and shown, and what is left blank); the extension then sends each
-- posting itself only when the page holds exactly that entry (batchMatch). Here, the database's side:
--   career_apply_batch_approvals          one row per approved posting: the entry, its hash (the database's own), when
--                                          the person approved it, revoked or used. Read by its owner only.
--   career_apply_batch_approve_own        the person's tap, signed in as them: stores each entry under its own hash
--   career_apply_batch_revoke_own         the person's "Stop applying": every approval not yet used is revoked
--   career_apply_extension_begin_agent_own  the start of an agent-approved application: refused unless the owner's kill
--                                          switch CAREER_AGENT_SUBMIT is 'on' (anything else is off) and an approval of
--                                          this posting is live (not revoked, not used, under 24 hours old); used once
-- Not applied to any database by this change; turning CAREER_AGENT_SUBMIT on is the owner's alone.
alter table public.career_cloud_settings drop constraint if exists career_cloud_settings_key_check;
alter table public.career_cloud_settings add constraint career_cloud_settings_key_check
  check (key in ('CAREER_CLOUD_APPLY', 'owner_user_id', 'gate_user_ids', 'CAREER_AGENT_SUBMIT'));
-- The owner's kill switch: off until the owner sets CAREER_AGENT_SUBMIT to 'on'; any other value, or none, is off.
create or replace function public.career_apply_agent_submit_enabled() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce((select value = 'on' from public.career_cloud_settings where key = 'CAREER_AGENT_SUBMIT'), false)
$$;
revoke all on function public.career_apply_agent_submit_enabled() from public, anon, authenticated;

create table if not exists public.career_apply_batch_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id text not null check (char_length(job_id) between 3 and 300),
  batch_hash text not null check (batch_hash ~ '^[0-9a-f]{64}$'),
  entry jsonb not null check (octet_length(entry::text) <= 131072),
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  used_at timestamptz
);
create index if not exists career_apply_batch_approvals_live on public.career_apply_batch_approvals (user_id, job_id) where revoked_at is null and used_at is null;
alter table public.career_apply_batch_approvals enable row level security;
drop policy if exists career_apply_batch_approvals_owner_read on public.career_apply_batch_approvals;
create policy career_apply_batch_approvals_owner_read on public.career_apply_batch_approvals for select to authenticated using (auth.uid() = user_id);
revoke all on public.career_apply_batch_approvals from public, anon, authenticated;
grant select on public.career_apply_batch_approvals to authenticated;

alter table public.career_apply_jobs add column if not exists agent_batch_hash text;
alter table public.career_apply_jobs drop constraint if exists career_apply_jobs_agent_batch_hash_check;
alter table public.career_apply_jobs add constraint career_apply_jobs_agent_batch_hash_check check (agent_batch_hash is null or agent_batch_hash ~ '^[0-9a-f]{64}$');

-- The person's tap on the batch. Each item is {entry, hash}: the hash must be the database's own of the entry (the same
-- canonical SHA-256 as the extension's batchHash), the entry must be an agent-batch entry with an https posting. An
-- earlier live approval of the same posting is replaced. At most 100 postings at once. Returns how many were stored.
create or replace function public.career_apply_batch_approve_own(p_items jsonb)
returns integer language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare u uuid := auth.uid(); it jsonb; e jsonb; h text; n integer := 0;
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'invalid batch'; end if;
 if jsonb_array_length(p_items) > 100 then raise exception 'at most 100 postings at once'; end if;
 for it in select * from jsonb_array_elements(p_items) loop
  e := it->'entry';
  if e is null or jsonb_typeof(e) <> 'object' or e->>'kind' is distinct from 'agent-batch' or (e->>'version') is distinct from '1'
   or coalesce(e->>'url', '') !~ '^https://' or coalesce(e->>'jobId', '') = '' or jsonb_typeof(e->'answers') is distinct from 'array' then
   raise exception 'invalid batch entry';
  end if;
  h := encode(sha256(convert_to(public.career_apply_canonical(e), 'UTF8')), 'hex');
  if it->>'hash' is distinct from h then raise exception 'invalid or stale batch approval'; end if;
  update public.career_apply_batch_approvals set revoked_at = clock_timestamp()
   where user_id = u and job_id = e->>'jobId' and revoked_at is null and used_at is null;
  insert into public.career_apply_batch_approvals (user_id, job_id, batch_hash, entry) values (u, e->>'jobId', h, e);
  n := n + 1;
 end loop;
 return n;
end $$;
revoke all on function public.career_apply_batch_approve_own(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_batch_approve_own(jsonb) to authenticated;

-- "Stop applying": every approval of theirs not yet used is revoked at once. Returns how many.
create or replace function public.career_apply_batch_revoke_own()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); n integer;
begin
 if u is null then raise exception 'not signed in'; end if;
 update public.career_apply_batch_approvals set revoked_at = clock_timestamp() where user_id = u and revoked_at is null and used_at is null;
 get diagnostics n = row_count;
 return n;
end $$;
revoke all on function public.career_apply_batch_revoke_own() from public, anon, authenticated, service_role;
grant execute on function public.career_apply_batch_revoke_own() to authenticated;

-- The start of an agent-approved application. Everything career_apply_extension_begin_own checks still holds (the
-- person's own payload, its hash, the queue's rules); before it: the owner's kill switch, and a live approval of this
-- posting by this hash, which is used up here.
create or replace function public.career_apply_extension_begin_agent_own(p_payload jsonb, p_approval text, p_batch_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare u uuid := auth.uid(); a public.career_apply_batch_approvals; r jsonb;
begin
 if u is null then raise exception 'not signed in'; end if;
 if not public.career_apply_agent_submit_enabled() then raise exception 'agent submit is off'; end if;
 select * into a from public.career_apply_batch_approvals
  where user_id = u and job_id = p_payload->>'job_id' and batch_hash = p_batch_hash and revoked_at is null and used_at is null
   and approved_at > clock_timestamp() - interval '24 hours'
  order by approved_at desc limit 1 for update;
 if a.id is null then raise exception 'no live batch approval for this posting'; end if;
 r := public.career_apply_extension_begin_own(p_payload, p_approval);
 update public.career_apply_batch_approvals set used_at = clock_timestamp() where id = a.id;
 update public.career_apply_jobs set agent_batch_hash = p_batch_hash where id = (r->>'id')::uuid and user_id = u;
 return r;
end $$;
revoke all on function public.career_apply_extension_begin_agent_own(jsonb, text, text) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_extension_begin_agent_own(jsonb, text, text) to authenticated;
