-- OWNER RULE (2026-10-26, in writing): "never submit applications without a real resume". FEATURE 16 (Telegram end to
-- end). The chat, the card and the engine refuse in code (career_apply_chat.ts, career_apply_cards.ts, approve-first.ts,
-- workers/career-cloud/worker.ts); this is the same rule in the database, so no path that skips the code gets past it:
--   1. approve-to-queue: a career_apply_jobs row is queued only with a payload that binds a resume (resume_sha256, the
--      sha256 of the resume file the form gets: the tailored render, or the person's own file). Any approve path
--      (career_apply_enqueue, the card's career_apply_card_answer_for, the message card's tap) inserts through here.
--   2. the claim: a queued row with no resume hash is never handed to a drive (the person's computer, the extension, the
--      cloud): the claim's update skips it. Rows queued before this rule are closed as not sent, with the reason.
--   3. prepared and carded: a prepared application with no resume hash is never stored, and a card never shows one.
--   4. career_resume_on_file(p_user): the person has resume entries they confirmed with provenance (a fact_confirmed
--      event in career_events names each one's confirmation_event_id). The chat's apply turn and the card read it.
--   5. career_resume_uploads: a resume the person sent as a file on a texting channel (Telegram), by its sha256 and the
--      provider's own reference, so a later "yes, that's my resume" records that upload as the evidence. Erased with the
--      account ("forget everything").
-- Triggers only, so none of the claim functions' texts change (scripts/launch/verify-claim-guards.sql and
-- tests/architect/bridge-ledger-order.test.ts compare those texts). Idempotent. NOT APPLIED: the owner applies migrations.

create or replace function public.career_resume_bound(p jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
 select coalesce(p->>'resume_sha256', '') ~ '^[a-f0-9]{64}$'
$$;

-- 1. approve-to-queue
create or replace function public.career_apply_jobs_resume_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
 if tg_op = 'INSERT' then
  if new.state = 'queued' and not public.career_resume_bound(new.payload) then
   raise exception 'no_resume: an application is queued only with the resume it sends (owner rule 2026-10-26)';
  end if;
  return new;
 end if;
 -- 2. the claim: queued -> driving only with a bound resume; otherwise the row is not handed out (skipped).
 if old.state = 'queued' and new.state = 'driving' and not public.career_resume_bound(new.payload) then
  return null;
 end if;
 return new;
end $$;
revoke all on function public.career_apply_jobs_resume_guard() from public, anon, authenticated;
drop trigger if exists career_apply_jobs_resume_guard on public.career_apply_jobs;
create trigger career_apply_jobs_resume_guard before insert or update of state on public.career_apply_jobs
 for each row execute function public.career_apply_jobs_resume_guard();

-- Rows queued before the rule, with no resume bound: closed as not sent, never driven.
update public.career_apply_jobs set state = 'not_submitted',
 reason = 'not sent: no resume was bound to it (applications go only with a real resume)', updated_at = now()
 where state = 'queued' and not public.career_resume_bound(payload);

-- 3. prepared and carded
create or replace function public.career_apply_prepared_resume_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
 if not public.career_resume_bound(new.payload) then
  raise exception 'no_resume: an application is prepared only with the resume it sends (owner rule 2026-10-26)';
 end if;
 return new;
end $$;
revoke all on function public.career_apply_prepared_resume_guard() from public, anon, authenticated;
drop trigger if exists career_apply_prepared_resume_guard on public.career_apply_prepared;
create trigger career_apply_prepared_resume_guard before insert or update of payload on public.career_apply_prepared
 for each row execute function public.career_apply_prepared_resume_guard();

create or replace function public.career_apply_cards_resume_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
 if exists (select from jsonb_array_elements(new.items) it
   left join public.career_apply_prepared p on p.id = (it->>'prepared_id')::uuid and p.user_id = new.user_id
   where p.id is null or not public.career_resume_bound(p.payload)) then
  raise exception 'no_resume: a card shows only applications that send a resume (owner rule 2026-10-26)';
 end if;
 return new;
end $$;
revoke all on function public.career_apply_cards_resume_guard() from public, anon, authenticated;
drop trigger if exists career_apply_cards_resume_guard on public.career_apply_cards;
create trigger career_apply_cards_resume_guard before insert on public.career_apply_cards
 for each row execute function public.career_apply_cards_resume_guard();

-- 4. a confirmed resume on file: a resume entry confirmed in the profile the server prepares from, whose confirmation
-- event is recorded for this person.
create or replace function public.career_resume_on_file(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce((
  select bool_or(exists (select from public.career_events e where e.user_id = p_user and e.kind = 'fact_confirmed'
                         and e.detail->>'confirmation_event_id' = f->>'confirmation_event_id'))
  from jsonb_array_elements(case when jsonb_typeof(public.career_apply_profile_for(p_user)->'facts') = 'array'
                                 then public.career_apply_profile_for(p_user)->'facts' else '[]'::jsonb end) f
  where f->>'status' = 'confirmed' and f->'needs_confirmation' = 'false'::jsonb
   and coalesce(f->>'confirmation_event_id', '') <> '' and coalesce(f->>'kind', '') in ('experience', 'education', 'project', 'leadership', 'certification')
 ), false)
$$;
revoke all on function public.career_resume_on_file(uuid) from public, anon, authenticated;
grant execute on function public.career_resume_on_file(uuid) to service_role;

-- 5. a resume sent as a file
create table if not exists public.career_resume_uploads (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 channel text not null check (channel in ('telegram', 'whatsapp', 'imessage', 'web')),
 provider_ref text not null check (length(provider_ref) between 1 and 200),
 filename text not null check (length(filename) between 1 and 200),
 mime text not null check (length(mime) between 1 and 120),
 bytes integer not null check (bytes between 1 and 10485760),
 sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 content_b64 text not null check (length(content_b64) <= 14000000),
 message_sha256 text not null check (message_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 unique (user_id, sha256, message_sha256)
);
create index if not exists career_resume_uploads_user_message on public.career_resume_uploads (user_id, message_sha256);
alter table public.career_resume_uploads enable row level security;
revoke all on public.career_resume_uploads from public, anon, authenticated;
grant select on public.career_resume_uploads to authenticated;
drop policy if exists career_resume_uploads_own on public.career_resume_uploads;
create policy career_resume_uploads_own on public.career_resume_uploads for select to authenticated using (user_id = auth.uid());
grant select, insert on public.career_resume_uploads to service_role;

create or replace function public.career_resume_upload_record_as(p_user uuid, p_channel text, p_ref text, p_filename text, p_mime text,
 p_bytes integer, p_sha256 text, p_content_b64 text, p_message_sha256 text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare rid uuid;
begin
 if p_user is null then raise exception 'invalid resume upload'; end if;
 insert into public.career_resume_uploads (user_id, channel, provider_ref, filename, mime, bytes, sha256, content_b64, message_sha256)
 values (p_user, p_channel, p_ref, p_filename, p_mime, p_bytes, p_sha256, p_content_b64, p_message_sha256)
 on conflict (user_id, sha256, message_sha256) do update set created_at = public.career_resume_uploads.created_at
 returning id into rid;
 return rid;
end $$;
revoke all on function public.career_resume_upload_record_as(uuid, text, text, text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.career_resume_upload_record_as(uuid, text, text, text, text, integer, text, text, text) to service_role;

create or replace function public.career_resume_uploads_on_erase() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if new.key = 'career:account' and coalesce((new.value->>'epoch')::bigint, 0) >
    (case when tg_op = 'UPDATE' then coalesce((old.value->>'epoch')::bigint, 0) else 0 end) then
  delete from public.career_resume_uploads where user_id = new.user_id;
 end if;
 return new;
end $$;
revoke all on function public.career_resume_uploads_on_erase() from public, anon, authenticated;
drop trigger if exists career_resume_uploads_on_erase on public.career_watch_kv;
create trigger career_resume_uploads_on_erase after insert or update on public.career_watch_kv
 for each row when (new.key = 'career:account') execute function public.career_resume_uploads_on_erase();
