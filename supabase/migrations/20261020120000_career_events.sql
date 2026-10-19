-- WO-027: the person never repeats themselves. career_events is the account's timeline: one row for each thing that
-- happened (an application prepared, approved or finished; an alert set, changed or stopped; a standing instruction kept
-- or removed; a fact confirmed; a search; outreach and intros; a mock interview; a status the person reported; a note),
-- written in code by the path that did it (supabase/functions/_shared/agent/timeline.ts), never from a model's words.
-- The chat's recall tool reads it back ("which bankers did I email in October?"), and past the 40-message window a
-- summary of it goes into the system prompt (WO-023 B5).
-- The person reads their own rows (and through career_recall_own); only the service role writes. Rows go with the
-- account (cascade) and with an erase (20261020120100_career_events_erase.sql).
create table if not exists public.career_events (
 id bigserial primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 at timestamptz not null default now(),
 kind text not null check (kind in ('application_prepared', 'application_approved', 'application_finished',
  'alert_set', 'alert_changed', 'alert_stopped', 'instruction_kept', 'instruction_removed', 'fact_confirmed',
  'search', 'outreach_drafted', 'outreach_sent', 'intro_proposed', 'intro_made', 'mock_done', 'status_change', 'note')),
 subject text not null default '' check (length(subject) <= 200),
 detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 4096),
 source text not null default 'chat' check (length(source) between 1 and 40)
);
create index if not exists career_events_user_at on public.career_events (user_id, at desc);
create index if not exists career_events_user_kind_at on public.career_events (user_id, kind, at desc);
alter table public.career_events enable row level security;
revoke all on public.career_events from public, anon, authenticated;
revoke all on sequence public.career_events_id_seq from public, anon, authenticated;
grant select on public.career_events to authenticated;
grant all on public.career_events to service_role;
grant usage, select on sequence public.career_events_id_seq to service_role;
drop policy if exists career_events_owner_read on public.career_events;
create policy career_events_owner_read on public.career_events for select to authenticated using ((select auth.uid()) = user_id);

-- The signed-in person's own timeline, newest first: by kinds, a subject (a company, person or role, matched in the
-- subject or the detail, case-insensitive, LIKE wildcards taken literally), a time window [from, to), at most 200 rows.
create or replace function public.career_recall_own(p_kind text[] default null, p_subject text default null,
 p_from timestamptz default null, p_to timestamptz default null, p_limit int default 50)
returns setof public.career_events language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); s text := nullif(btrim(coalesce(p_subject, '')), ''); pat text;
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_kind is not null and exists (select from unnest(p_kind) k where k is null or k not in ('application_prepared',
  'application_approved', 'application_finished', 'alert_set', 'alert_changed', 'alert_stopped', 'instruction_kept',
  'instruction_removed', 'fact_confirmed', 'search', 'outreach_drafted', 'outreach_sent', 'intro_proposed', 'intro_made',
  'mock_done', 'status_change', 'note')) then raise exception 'unknown event kind'; end if;
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

-- An application prepared on the person's computer (career_apply_prepared, WO-022) is on the timeline from the insert
-- itself. A failure to write the event never fails the preparation: it is logged as a warning and the insert goes on.
create or replace function public.career_events_on_prepared() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 begin
  insert into public.career_events (user_id, at, kind, subject, detail, source)
  values (new.user_id, new.created_at, 'application_prepared', left(new.company, 200),
   jsonb_build_object('prepared', new.id, 'job_id', left(new.job_id, 200), 'url', left(new.url, 500)), 'prepare');
 exception when others then
  raise warning 'career event not recorded (application_prepared): %', sqlerrm;
 end;
 return new;
end $$;
revoke all on function public.career_events_on_prepared() from public, anon, authenticated;
drop trigger if exists career_events_on_prepared on public.career_apply_prepared;
create trigger career_events_on_prepared after insert on public.career_apply_prepared
 for each row execute function public.career_events_on_prepared();
