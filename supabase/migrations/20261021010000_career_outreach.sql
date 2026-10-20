-- WO-033: outreach the person approves, sent from their own Gmail under caps the database enforces as well as the code
-- (supabase/functions/_shared/career_outreach.ts). Three tables:
--   career_outreach_drafts  one row per drafted email: the recipient, the exact subject, body and footer shown, the
--                           SHA-256 of that message, and what happened to it. An approval is the hash of the exact message
--                           shown; a row can be 'approved' only with approved_hash = hash.
--   career_outreach_dnc     the person's do-not-contact list: a recipient who replied "stop" or "unsubscribe", forever.
--                           Kept as a SHA-256 of the lowercased address, so an erase of the career profile never
--                           re-opens them and the list itself names nobody.
--   career_outreach_prefs   the person's daily limit (1 to 30) and their signature.
-- career_outreach_claim is the only way a send starts: under the person's lock it checks the approval's hash, the
-- do-not-contact list, the daily limit (20 by default, the person's own up to 30, never more; 10 a day in the first week
-- of sending when there is no send history), and 90 seconds since the last send, then marks the row 'sending'.
-- The timeline (career_events) gains three kinds: outreach_approved, outreach_replied, outreach_bounced.
-- The person reads their own drafts (and exports them); only the service role writes. An erase ("forget my career
-- profile", a new account epoch in career_watch_kv) deletes their drafts and settings; deleting the account removes all.
-- Idempotent: every statement can run twice.

-- ---------------------------------------------------------------------------------------------- the timeline's kinds
alter table public.career_events drop constraint if exists career_events_kind_check;
alter table public.career_events add constraint career_events_kind_check check (kind in ('application_prepared', 'application_approved',
 'application_finished', 'alert_set', 'alert_changed', 'alert_stopped', 'instruction_kept', 'instruction_removed', 'fact_confirmed',
 'search', 'outreach_drafted', 'outreach_sent', 'intro_proposed', 'intro_made', 'mock_done', 'status_change', 'note',
 'outreach_approved', 'outreach_replied', 'outreach_bounced'));

create or replace function public.career_recall_own(p_kind text[] default null, p_subject text default null,
 p_from timestamptz default null, p_to timestamptz default null, p_limit int default 50)
returns setof public.career_events language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); s text := nullif(btrim(coalesce(p_subject, '')), ''); pat text;
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_kind is not null and exists (select from unnest(p_kind) k where k is null or k not in ('application_prepared',
  'application_approved', 'application_finished', 'alert_set', 'alert_changed', 'alert_stopped', 'instruction_kept',
  'instruction_removed', 'fact_confirmed', 'search', 'outreach_drafted', 'outreach_sent', 'intro_proposed', 'intro_made',
  'mock_done', 'status_change', 'note', 'outreach_approved', 'outreach_replied', 'outreach_bounced')) then raise exception 'unknown event kind'; end if;
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

-- ---------------------------------------------------------------------------------------------- drafts
create table if not exists public.career_outreach_drafts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 batch_id uuid not null,
 thread_id uuid,
 n int not null check (n between 1 and 10),
 recipient jsonb not null check (jsonb_typeof(recipient) = 'object' and octet_length(recipient::text) <= 2048),
 -- One plain address: no list, no display name, no separator. One recipient per message, always.
 recipient_email text not null check (recipient_email ~ '^[a-z0-9._%+-]{1,64}@([a-z0-9-]{1,63}\.)+[a-z]{2,24}$'),
 subject text not null check (length(subject) between 1 and 200 and strpos(subject, chr(10)) = 0 and strpos(subject, chr(13)) = 0),
 body text not null check (length(body) between 1 and 4000),
 footer text not null check (length(footer) between 1 and 600),
 hash text not null check (hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'shown' check (status in ('shown', 'approved', 'skipped', 'sending', 'sent', 'failed', 'bounced', 'replied')),
 approved_hash text check (approved_hash is null or approved_hash ~ '^[a-f0-9]{64}$'),
 approved_at timestamptz,
 sent_at timestamptz,
 gmail_id text check (gmail_id is null or length(gmail_id) <= 200),
 gmail_thread text check (gmail_thread is null or length(gmail_thread) <= 200),
 result text check (result is null or length(result) <= 200),
 shared jsonb not null default '[]'::jsonb check (jsonb_typeof(shared) = 'array' and octet_length(shared::text) <= 2048),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (batch_id, n),
 constraint career_outreach_approved_is_exact check (status <> 'approved' or (approved_hash is not null and approved_hash = hash))
);
create index if not exists career_outreach_drafts_user_created on public.career_outreach_drafts (user_id, created_at desc);
create index if not exists career_outreach_drafts_approved on public.career_outreach_drafts (approved_at) where status = 'approved';
create index if not exists career_outreach_drafts_user_sent on public.career_outreach_drafts (user_id, sent_at) where sent_at is not null;
alter table public.career_outreach_drafts enable row level security;
revoke all on public.career_outreach_drafts from public, anon, authenticated;
grant select on public.career_outreach_drafts to authenticated;
grant all on public.career_outreach_drafts to service_role;
drop policy if exists career_outreach_drafts_owner_read on public.career_outreach_drafts;
create policy career_outreach_drafts_owner_read on public.career_outreach_drafts for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------- do-not-contact, settings
create table if not exists public.career_outreach_dnc (
 user_id uuid not null references public.profiles(id) on delete cascade,
 email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
 reason text not null default 'recipient asked to stop' check (length(reason) <= 120),
 at timestamptz not null default now(),
 primary key (user_id, email_hash)
);
alter table public.career_outreach_dnc enable row level security;
revoke all on public.career_outreach_dnc from public, anon, authenticated;
grant all on public.career_outreach_dnc to service_role;

create table if not exists public.career_outreach_prefs (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 daily_cap int check (daily_cap is null or daily_cap between 1 and 30),
 signature text check (signature is null or length(signature) between 1 and 300),
 -- What each contact list cost, as the owner entered it (career_contacts.ts listCost): VERIFIED only with an invoice number.
 list_costs jsonb not null default '{}'::jsonb check (jsonb_typeof(list_costs) = 'object' and octet_length(list_costs::text) <= 16384),
 updated_at timestamptz not null default now()
);
alter table public.career_outreach_prefs add column if not exists list_costs jsonb not null default '{}'::jsonb;
alter table public.career_outreach_prefs enable row level security;
revoke all on public.career_outreach_prefs from public, anon, authenticated;
grant all on public.career_outreach_prefs to service_role;

-- Hunter's answer for one address in one billing month, so an address is paid for once a month whoever's list it is on.
-- The key is the month and a SHA-256 of the lowercased address: the table names nobody.
create table if not exists public.career_email_checks (
 key text primary key check (key ~ '^\d{4}-\d{2}:[a-f0-9]{64}$'),
 status text not null check (status in ('valid', 'invalid', 'accept_all', 'webmail', 'disposable', 'unknown')),
 score int check (score is null or score between 0 and 100),
 checked_at timestamptz not null default now()
);
alter table public.career_email_checks enable row level security;
revoke all on public.career_email_checks from public, anon, authenticated;
grant all on public.career_email_checks to service_role;

-- ---------------------------------------------------------------------------------------------- the claim
-- p_day_start is the start of the person's local day (the code reads their zone); it must be within the 26 hours before
-- p_now. Returns 'ok' (the row is now 'sending' at p_now) or the reason it may not go: not_approved, changed,
-- do_not_contact, daily_cap, spacing.
create index if not exists career_outreach_drafts_recipient on public.career_outreach_drafts (lower(recipient_email), sent_at);

create or replace function public.career_outreach_claim(p_user uuid, p_draft uuid, p_hash text, p_now timestamptz, p_day_start timestamptz)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.career_outreach_drafts; cap int; first_at timestamptz; today int;
begin
 if p_user is null or p_draft is null or p_hash is null or p_now is null or p_day_start is null
  or p_day_start > p_now or p_day_start < p_now - interval '26 hours' then raise exception 'invalid outreach claim'; end if;
 perform pg_advisory_xact_lock(hashtextextended('career_outreach:' || p_user::text, 0));
 select * into d from public.career_outreach_drafts where id = p_draft and user_id = p_user for update;
 if not found or d.status <> 'approved' or d.approved_hash is null then return 'not_approved'; end if;
 if d.approved_hash <> p_hash or d.hash <> p_hash then return 'changed'; end if;
 -- Do-not-contact is checked across every Trainee user: a "stop" to anyone stops everyone's drafts to that address.
 if exists (select 1 from public.career_outreach_dnc
   where email_hash = encode(sha256(convert_to(lower(d.recipient_email), 'UTF8')), 'hex')) then return 'do_not_contact'; end if;
 -- At most 3 Trainee-drafted emails reach one recipient in 30 days, from all users together (lock on the recipient so two
 -- people's runs cannot both take the third slot).
 perform pg_advisory_xact_lock(hashtextextended('career_outreach_to:' || lower(d.recipient_email), 0));
 if (select count(*) from public.career_outreach_drafts where lower(recipient_email) = lower(d.recipient_email)
   and status in ('sending', 'sent', 'replied', 'bounced') and sent_at > p_now - interval '30 days' and sent_at <= p_now) >= 3
   then return 'recipient_cap'; end if;
 cap := coalesce((select least(greatest(daily_cap, 1), 30) from public.career_outreach_prefs where user_id = p_user), 20);
 select min(sent_at) into first_at from public.career_outreach_drafts
  where user_id = p_user and sent_at is not null and status in ('sending', 'sent', 'replied', 'bounced');
 if first_at is null or p_now < first_at + interval '7 days' then cap := least(cap, 10); end if;
 select count(*) into today from public.career_outreach_drafts
  where user_id = p_user and status in ('sending', 'sent', 'replied', 'bounced') and sent_at >= p_day_start and sent_at <= p_now;
 if today >= cap then return 'daily_cap'; end if;
 if exists (select 1 from public.career_outreach_drafts where user_id = p_user and status in ('sending', 'sent', 'replied', 'bounced')
   and sent_at > p_now - interval '90 seconds' and sent_at <= p_now) then return 'spacing'; end if;
 update public.career_outreach_drafts set status = 'sending', sent_at = p_now, updated_at = now() where id = d.id;
 return 'ok';
end $$;
revoke all on function public.career_outreach_claim(uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.career_outreach_claim(uuid, uuid, text, timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------------- the erase
-- career_host_commit's erase writes the account with a new epoch; that write deletes the person's drafts and settings.
-- The do-not-contact hashes stay: an erase never re-opens someone who asked to stop.
create or replace function public.career_outreach_on_erase() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if new.key = 'career:account' and coalesce((new.value->>'epoch')::bigint, 0) >
    (case when tg_op = 'UPDATE' then coalesce((old.value->>'epoch')::bigint, 0) else 0 end) then
  delete from public.career_outreach_drafts where user_id = new.user_id;
  delete from public.career_outreach_prefs where user_id = new.user_id;
 end if;
 return new;
end $$;
revoke all on function public.career_outreach_on_erase() from public, anon, authenticated;
drop trigger if exists career_outreach_on_erase on public.career_watch_kv;
create trigger career_outreach_on_erase after insert or update on public.career_watch_kv
 for each row when (new.key = 'career:account') execute function public.career_outreach_on_erase();
