-- WO-051: the per-person daily cap on the mail second opinion (CAREER_MAIL_MODEL=on, D-025 pending the owner), counted
-- here, not in the run: one row per person and UTC day with the calls granted. career_mail_model_claim grants at most
-- p_want more and never past the cap (at most 200, whatever the caller asks), under a per-person lock so two runs at once
-- cannot both pass it. A call granted and then not made still counts (the run claims exactly what it will ask).
-- Only a count is kept: no mail, no subject, no sender. Not applied by this order: the owner applies it at deploy.
create table if not exists public.career_mail_model_calls (
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null,
 calls integer not null default 0 check (calls between 0 and 200),
 updated_at timestamptz not null default now(),
 primary key (user_id, day)
);
alter table public.career_mail_model_calls enable row level security;
revoke all on public.career_mail_model_calls from anon, authenticated;

create or replace function public.career_mail_model_claim(p_user uuid, p_want integer, p_cap integer default 200)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare d date := (now() at time zone 'utc')::date; cap integer := least(greatest(coalesce(p_cap, 0), 0), 200); used integer; got integer;
begin
 if p_user is null or p_want is null or p_want < 1 then return 0; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 51));
 select calls into used from public.career_mail_model_calls where user_id = p_user and day = d;
 got := greatest(0, least(p_want, cap - coalesce(used, 0)));
 if got > 0 then
  insert into public.career_mail_model_calls (user_id, day, calls) values (p_user, d, got)
  on conflict (user_id, day) do update set calls = public.career_mail_model_calls.calls + excluded.calls, updated_at = now();
 end if;
 return got;
end $$;
revoke all on function public.career_mail_model_claim(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.career_mail_model_claim(uuid, integer, integer) to service_role;
