-- WO-007b: job alerts. career_alert_prefs holds each person's alert settings and counters (written by the chat's tools
-- and the scheduled career-proactive run, both with the service role); career_outbox holds alerts and daily reports
-- waiting for the texting channel (WO-013), at most one row per person and key, ever, so nothing is sent twice;
-- career_proactive_runs records every run so a silent stop is visible. A person can read their own settings and their
-- own outbox; nobody writes them but the service role.
create table if not exists public.career_alert_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tz text not null default 'America/New_York' check (length(tz) between 1 and 64),
  prefs jsonb not null,
  last_checked_at timestamptz not null,
  instant_sent_today int not null default 0 check (instant_sent_today between 0 and 100),
  sent_on date,
  last_report_on date,
  held text[] not null default '{}' check (cardinality(held) <= 200),
  updated_at timestamptz not null default now(),
  -- "is true": a missing field makes the expression NULL, and a NULL check would pass.
  constraint career_alert_prefs_shape check ((
    jsonb_typeof(prefs) = 'object'
    and jsonb_typeof(prefs->'on') = 'boolean'
    and jsonb_typeof(prefs->'keywords') = 'array' and jsonb_array_length(prefs->'keywords') between 1 and 10
    and jsonb_typeof(prefs->'locations') = 'array' and jsonb_array_length(prefs->'locations') <= 10
    and jsonb_typeof(prefs->'remote_ok') = 'boolean'
    and (prefs->>'report_hour') ~ '^([0-9]|1[0-9]|2[0-3])$'
    and (prefs->>'quiet_start') ~ '^([0-9]|1[0-9]|2[0-3])$'
    and (prefs->>'quiet_end') ~ '^([0-9]|1[0-9]|2[0-3])$'
    and (prefs->>'max_instant_per_day') ~ '^([0-9]|10)$') is true)
);
create index if not exists career_alert_prefs_on on public.career_alert_prefs (user_id) where (prefs->>'on') = 'true';

create table if not exists public.career_outbox (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^(alert|report):.+$' and length(key) <= 310),
  kind text not null check (kind in ('alert', 'report')),
  text text not null check (length(text) between 1 and 4000),
  deliver_at timestamptz not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint career_outbox_once unique (user_id, key)
);
create index if not exists career_outbox_due on public.career_outbox (deliver_at) where delivered_at is null;

create table if not exists public.career_proactive_runs (
  id bigserial primary key,
  run_at timestamptz not null,
  users int not null, alerts int not null, held int not null, reports int not null, duplicates int not null, postings int not null,
  ms int not null, error text
);

alter table public.career_alert_prefs enable row level security;
alter table public.career_outbox enable row level security;
alter table public.career_proactive_runs enable row level security;
revoke all on public.career_alert_prefs, public.career_outbox, public.career_proactive_runs from anon, authenticated;
grant select on public.career_alert_prefs, public.career_outbox to authenticated;
drop policy if exists career_alert_prefs_own on public.career_alert_prefs;
create policy career_alert_prefs_own on public.career_alert_prefs for select to authenticated using (user_id = auth.uid());
drop policy if exists career_outbox_own on public.career_outbox;
create policy career_outbox_own on public.career_outbox for select to authenticated using (user_id = auth.uid());
