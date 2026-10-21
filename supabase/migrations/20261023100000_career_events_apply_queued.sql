-- WO-100: queue_applications (WO-066) records 'apply_queued' on the person's timeline, but the table's check and
-- career_recall_own refused that kind, so a posting queued from chat never reached recall (the write was logged and
-- dropped). Both take it now; every earlier kind is kept (20261021010000_career_outreach.sql's list).
-- Idempotent: every statement can run twice.
alter table public.career_events drop constraint if exists career_events_kind_check;
alter table public.career_events add constraint career_events_kind_check check (kind in ('application_prepared', 'application_approved',
 'application_finished', 'alert_set', 'alert_changed', 'alert_stopped', 'instruction_kept', 'instruction_removed', 'fact_confirmed',
 'search', 'outreach_drafted', 'outreach_sent', 'intro_proposed', 'intro_made', 'mock_done', 'status_change', 'note',
 'outreach_approved', 'outreach_replied', 'outreach_bounced', 'apply_queued'));

create or replace function public.career_recall_own(p_kind text[] default null, p_subject text default null,
 p_from timestamptz default null, p_to timestamptz default null, p_limit int default 50)
returns setof public.career_events language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); s text := nullif(btrim(coalesce(p_subject, '')), ''); pat text;
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_kind is not null and exists (select from unnest(p_kind) k where k is null or k not in ('application_prepared',
  'application_approved', 'application_finished', 'alert_set', 'alert_changed', 'alert_stopped', 'instruction_kept',
  'instruction_removed', 'fact_confirmed', 'search', 'outreach_drafted', 'outreach_sent', 'intro_proposed', 'intro_made',
  'mock_done', 'status_change', 'note', 'outreach_approved', 'outreach_replied', 'outreach_bounced', 'apply_queued')) then raise exception 'unknown event kind'; end if;
 if s is not null and length(s) > 200 then raise exception 'subject too long'; end if;
 pat := '%' || replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_') || '%';
 return query select e.* from public.career_events e
  where e.user_id = u
   and (p_kind is null or cardinality(p_kind) = 0 or e.kind = any(p_kind))
   and (p_from is null or e.at >= p_from) and (p_to is null or e.at < p_to)
   and (s is null or e.subject ilike pat or e.detail::text ilike pat)
  order by e.at desc, e.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;
revoke all on function public.career_recall_own(text[], text, timestamptz, timestamptz, int) from public, anon;
grant execute on function public.career_recall_own(text[], text, timestamptz, timestamptz, int) to authenticated, service_role;
