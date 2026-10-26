-- Trainee sign-up in waves (launch readiness 2026-10-26, B7 and X1): who may use Trainee, recorded once per account.
--
-- A person is admitted by one of three ways, and the way is recorded:
--   existing   every account that exists when this runs (nobody who uses Trainee today is locked out);
--   allowlist  their phone or email is in TRAINEE_ALLOWED_CONTACTS (the edge function checks the env, never the person);
--   waitlist   their confirmed phone (or email) matches a site_waitlist row the owner invited (trainee_invite_wave).
-- The edge functions call trainee_admit with the service role only; the person can read their own admission, nothing
-- else. Nothing here sends a message: inviting a wave marks rows, and telling those people is a separate, approved step.
-- Idempotent: every statement can run again.

alter table public.site_waitlist add column if not exists email text;
alter table public.site_waitlist add column if not exists invited_at timestamptz;
alter table public.site_waitlist add column if not exists invite_wave integer;
alter table public.site_waitlist add column if not exists claimed_by uuid references auth.users(id) on delete set null;
alter table public.site_waitlist add column if not exists claimed_at timestamptz;
create unique index if not exists site_waitlist_claimed_by_key on public.site_waitlist (claimed_by) where claimed_by is not null;
-- Phones match by their digits (the site sends +15551234567; Supabase Auth stores 15551234567).
create index if not exists site_waitlist_phone_digits on public.site_waitlist ((regexp_replace(phone, '\D', '', 'g')));
create index if not exists site_waitlist_uninvited on public.site_waitlist (created_at) where invited_at is null;

create table if not exists public.trainee_admissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  via text not null check (via in ('existing', 'allowlist', 'waitlist')),
  waitlist_id uuid references public.site_waitlist(id) on delete set null,
  admitted_at timestamptz not null default now()
);
alter table public.trainee_admissions enable row level security;
drop policy if exists trainee_admissions_read_own on public.trainee_admissions;
create policy trainee_admissions_read_own on public.trainee_admissions for select to authenticated using (user_id = auth.uid());
revoke all on public.trainee_admissions from anon, authenticated;
grant select on public.trainee_admissions to authenticated;
grant select, insert, update, delete on public.trainee_admissions to service_role;

-- Every account that exists the first time this runs keeps working. The table's comment marks that it ran, so running
-- the file again later never admits the accounts created since.
do $$ begin
  if obj_description('public.trainee_admissions'::regclass, 'pg_class') is distinct from 'trainee admissions: existing accounts admitted' then
    insert into public.trainee_admissions (user_id, via) select id, 'existing' from auth.users on conflict (user_id) do nothing;
    comment on table public.trainee_admissions is 'trainee admissions: existing accounts admitted';
  end if;
end $$;

-- The digits of a phone, or null when there are too few to be a phone number.
create or replace function public.trainee_phone_digits(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) between 10 and 15 then regexp_replace(p, '\D', '', 'g') end
$$;

-- Admit a person if they may use Trainee; return how they were admitted, or null (not yet). p_allowlisted is the edge
-- function's own check of TRAINEE_ALLOWED_CONTACTS against the account's phone and email.
create or replace function public.trainee_admit(p_user uuid, p_allowlisted boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.trainee_admissions; ph text; em text; w uuid;
begin
  if p_user is null then raise exception 'invalid admission'; end if;
  perform pg_advisory_xact_lock(hashtextextended('trainee_admit:' || p_user::text, 0));
  select * into a from public.trainee_admissions where user_id = p_user;
  if found then return a.via; end if;
  -- Only a confirmed phone or email counts: a contact typed at sign-up and never verified claims nothing.
  select case when u.phone_confirmed_at is not null then public.trainee_phone_digits(u.phone) end,
         case when u.email_confirmed_at is not null then lower(nullif(trim(u.email), '')) end
    into ph, em from auth.users u where u.id = p_user;
  if not found then raise exception 'invalid admission'; end if;
  if coalesce(p_allowlisted, false) then
    insert into public.trainee_admissions (user_id, via) values (p_user, 'allowlist');
    return 'allowlist';
  end if;
  select s.id into w from public.site_waitlist s
   where s.invited_at is not null and s.claimed_by is null and s.consent
     and ((ph is not null and public.trainee_phone_digits(s.phone) = ph) or (em is not null and lower(trim(s.email)) = em))
   order by s.invited_at, s.created_at limit 1 for update skip locked;
  if w is null then return null; end if;
  update public.site_waitlist set claimed_by = p_user, claimed_at = now() where id = w;
  insert into public.trainee_admissions (user_id, via, waitlist_id) values (p_user, 'waitlist', w);
  return 'waitlist';
end $$;

-- Whether a phone number has an invited, unclaimed waitlist spot (the texting channels ask before they create an account).
create or replace function public.trainee_waitlist_invited(p_phone text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.trainee_phone_digits(p_phone) is not null and exists (
    select 1 from public.site_waitlist s where s.invited_at is not null and s.claimed_by is null and s.consent
      and public.trainee_phone_digits(s.phone) = public.trainee_phone_digits(p_phone))
$$;

-- The owner's wave: invite the p_count oldest waitlist rows not invited yet (consented ones only), as one numbered wave.
-- Returns the wave number and how many rows it invited. Run with the service role (SQL editor or psql as the owner).
create or replace function public.trainee_invite_wave(p_count integer)
returns table (wave integer, invited integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer; wv integer;
begin
  if p_count is null or p_count not between 1 and 100000 then raise exception 'invite between 1 and 100000 people at a time'; end if;
  perform pg_advisory_xact_lock(hashtextextended('trainee_invite_wave', 0));
  select coalesce(max(s.invite_wave), 0) + 1 into wv from public.site_waitlist s;
  with pick as (select s.id from public.site_waitlist s where s.invited_at is null and s.consent order by s.created_at, s.id limit p_count for update)
  update public.site_waitlist s set invited_at = now(), invite_wave = wv from pick where s.id = pick.id;
  get diagnostics n = row_count;
  return query select wv, n;
end $$;

revoke all on function public.trainee_phone_digits(text), public.trainee_admit(uuid, boolean), public.trainee_waitlist_invited(text),
  public.trainee_invite_wave(integer) from public, anon, authenticated;
grant execute on function public.trainee_admit(uuid, boolean), public.trainee_waitlist_invited(text), public.trainee_invite_wave(integer),
  public.trainee_phone_digits(text) to service_role;
