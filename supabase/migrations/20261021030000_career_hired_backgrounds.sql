-- WO-036: who a firm actually hired, from People Data Labs' Person Search API (the owner's account; secret PDL_API_KEY).
-- Aggregates only: counts by school, prior employer, degree and major, and the median years from finishing school to
-- joining. No row here is about one person: names, profile URLs and contact fields are stripped in code before anything
-- is counted (supabase/functions/_shared/career_hired.ts), and the check below refuses any of those keys anywhere in a
-- cached aggregate. Nothing here is about the person asking either, so no erase path is needed.
-- career_hired_cache: one row per (firm, role family, since year), reused for 30 days so the 350 monthly credits last.
-- career_pdl_calls: every Person Search call with its credit cost (one credit per record returned, per PDL's docs).
-- Only the service role reads or writes either table.
create table if not exists public.career_hired_cache (
 firm_id text not null check (firm_id ~ '^[a-z0-9-]{1,60}$'),
 role_family text not null default '' check (length(role_family) <= 40),
 since_year int not null check (since_year between 2000 and 2100),
 aggregates jsonb not null check (jsonb_typeof(aggregates) = 'object' and octet_length(aggregates::text) <= 16384),
 fetched_at timestamptz not null default now(),
 primary key (firm_id, role_family, since_year)
);
alter table public.career_hired_cache drop constraint if exists career_hired_cache_no_person_fields;
alter table public.career_hired_cache add constraint career_hired_cache_no_person_fields check (aggregates::text !~*
 '"(full_name|first_name|last_name|middle_name|name_aliases|linkedin_url|linkedin_username|linkedin_id|facebook_url|twitter_url|github_url|profiles|emails|personal_emails|work_email|recommended_personal_email|phone_numbers|mobile_phone|street_addresses|birth_date|birth_year)"\s*:');
alter table public.career_hired_cache enable row level security;
revoke all on public.career_hired_cache from public, anon, authenticated;
grant all on public.career_hired_cache to service_role;

create table if not exists public.career_pdl_calls (
 id bigserial primary key,
 at timestamptz not null default now(),
 firm_id text not null check (firm_id ~ '^[a-z0-9-]{1,60}$'),
 role_family text not null default '' check (length(role_family) <= 40),
 since_year int not null check (since_year between 2000 and 2100),
 size_requested int not null check (size_requested between 0 and 100),
 records_returned int not null default 0 check (records_returned >= 0),
 records_kept int not null default 0 check (records_kept >= 0),
 credits int not null default 0 check (credits >= 0),
 status text not null check (status in ('ok', 'http_error', 'budget_refused')),
 http_status int,
 constraint career_pdl_calls_kept_check check (records_kept <= records_returned)
);
create index if not exists career_pdl_calls_at on public.career_pdl_calls (at desc);
alter table public.career_pdl_calls enable row level security;
revoke all on public.career_pdl_calls from public, anon, authenticated;
revoke all on sequence public.career_pdl_calls_id_seq from public, anon, authenticated;
grant all on public.career_pdl_calls to service_role;
grant usage, select on sequence public.career_pdl_calls_id_seq to service_role;

-- Credits spent in the calendar month (UTC) of p_at: the adapter refuses a call that would pass the monthly budget.
create or replace function public.career_pdl_credits_month(p_at timestamptz default now()) returns int
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce(sum(credits), 0)::int from public.career_pdl_calls
 where at >= date_trunc('month', p_at at time zone 'UTC') at time zone 'UTC'
  and at < (date_trunc('month', p_at at time zone 'UTC') + interval '1 month') at time zone 'UTC'
$$;
revoke all on function public.career_pdl_credits_month(timestamptz) from public, anon, authenticated;
grant execute on function public.career_pdl_credits_month(timestamptz) to service_role;
