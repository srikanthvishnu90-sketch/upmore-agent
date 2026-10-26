-- STEP 4 F1 (2026-10-25): the server's prepare-ahead run draws its candidates from the person's own apply queue too.
-- Before, career_apply_prepare_candidates read only the postings their alerts sent them (career_outbox 'alert:' keys),
-- so a posting put in the queue from chat or the extension was never prepared on the server. Now a waiting
-- career_apply_wanted row whose posting_key is an open posting on file is a candidate as well, under the same gates:
-- the account not paused, no application or prepared row for it, no fresh failed try, no application to that employer
-- in 30 days, at most p_per_person per person (25) and p_limit in all (200). Nothing here approves, queues or sends.
create or replace function public.career_apply_prepare_candidates(p_now timestamptz, p_per_person integer, p_limit integer)
returns table (user_id uuid, job_id text, company text, title text, url text, location text, description text, epoch bigint, version bigint)
language sql stable security definer set search_path = public, pg_temp as $$
 with s as (
  select o.user_id, substr(o.key, 7) as job_id, o.created_at as at
  from public.career_outbox o
  where o.kind = 'alert' and o.key like 'alert:%' and o.created_at > p_now - interval '14 days'
  union all
  select w.user_id, w.posting_key as job_id, w.queued_at as at
  from public.career_apply_wanted w
  where w.state = 'waiting'
 ), a as (
  select s.user_id, s.job_id, max(s.at) as alerted_at from s group by s.user_id, s.job_id
 ), c as (
  select a.user_id, p.job_id, p.company, p.title, p.url, p.location, p.description,
   coalesce((k.value->>'epoch')::bigint, 0) as epoch, coalesce((k.value->>'version')::bigint, 0) as version,
   row_number() over (partition by a.user_id order by a.alerted_at desc, p.job_id) as rn, a.alerted_at
  from a
  join public.career_postings p on p.job_id = a.job_id and p.closed_at is null
  join public.profiles pr on pr.id = a.user_id
  join public.career_watch_kv k on k.user_id = a.user_id and k.key = 'career:account' and coalesce(k.value->>'paused', 'false') <> 'true'
  where not exists (select from public.career_apply_jobs j where j.user_id = a.user_id and j.job_id = p.job_id)
   and not exists (select from public.career_apply_prepared x where x.user_id = a.user_id and x.job_id = p.job_id)
   and not exists (select from public.career_apply_prepare_attempts t where t.user_id = a.user_id and t.posting_job_id = p.job_id
    and (t.outcome = 'ready'
     or (t.outcome = 'asked' and exists (select from public.career_apply_questions q where q.user_id = a.user_id and q.state = 'open'
      and t.engine_job_id = any(q.job_ids)))
     or (t.outcome <> 'asked' and t.at > p_now - interval '7 days')))
   and public.career_apply_company_key(p.company) <> ''
   and not exists (select from public.career_apply_ledger(a.user_id, p_now - interval '30 days') l
    where l.company_key = public.career_apply_company_key(p.company))
 )
 select c.user_id, c.job_id, c.company, c.title, c.url, c.location, c.description, c.epoch, c.version
 from c where c.rn <= greatest(0, least(coalesce(p_per_person, 0), 25))
 order by c.alerted_at desc, c.user_id, c.job_id
 limit greatest(0, least(coalesce(p_limit, 0), 200))
$$;
revoke all on function public.career_apply_prepare_candidates(timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.career_apply_prepare_candidates(timestamptz, integer, integer) to service_role;
