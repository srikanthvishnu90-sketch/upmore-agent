-- The agent speaks first (owner's capability list, section 2). Two tables:
--   agent_proactive_settings: what the person asked for, in their words, remembered (alerts on or off, the weekly recap
--     day, the morning brief, quiet hours, their time zone, the watches and standing reports they set up by chat).
--     The person reads and changes their own row (the chat handler writes it through their own session).
--   agent_proactive_log: one row per message the scheduler delivered, unique per (person, key). The scheduler claims the
--     key before it writes the message, so a retry, a second run or two schedulers racing can never send it twice. The
--     person can read their own log; only the service role writes it.
-- Nothing here moves money or contacts anyone: these are reports and alerts into the person's own chat thread.

create table if not exists public.agent_proactive_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  alerts boolean not null default true,
  morning_brief boolean not null default false,
  weekly_recap_dow smallint check (weekly_recap_dow is null or weekly_recap_dow between 0 and 6) default 0,
  monthly_close boolean not null default true,
  quiet_start smallint check (quiet_start is null or quiet_start between 0 and 23) default 22,
  quiet_end smallint check (quiet_end is null or quiet_end between 0 and 23) default 7,
  time_zone text not null default 'America/New_York' check (time_zone ~ '^[A-Za-z_]+(/[A-Za-z_+-]+){0,2}$' and length(time_zone) <= 64),
  buffer_cents bigint check (buffer_cents is null or buffer_cents between 0 and 100000000),
  large_threshold_cents bigint check (large_threshold_cents is null or large_threshold_cents between 100 and 100000000),
  watches jsonb not null default '[]'::jsonb check (jsonb_typeof(watches) = 'array' and jsonb_array_length(watches) <= 20),
  control jsonb check (control is null or (jsonb_typeof(control) = 'object' and length(control::text) <= 20000)),
  updated_at timestamptz not null default now(),
  -- Never a secret or an identity number in a setting (owner rule): long digit runs are refused outright.
  check (watches::text !~ '\d{9,}' and coalesce(control::text, '') !~ '\d{13,}')
);
alter table public.agent_proactive_settings enable row level security;
drop policy if exists "own proactive settings" on public.agent_proactive_settings;
create policy "own proactive settings" on public.agent_proactive_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.agent_proactive_settings from anon;
grant select, insert, update on public.agent_proactive_settings to authenticated;
grant all on public.agent_proactive_settings to service_role;

create table if not exists public.agent_proactive_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (length(key) between 1 and 300),
  kind text not null check (kind in ('safety','watch','finding','morning_brief','weekly_recap','monthly_close','standing_report')),
  capability_id text check (capability_id is null or capability_id ~ '^[A-Z]+-\d{3}$'),
  cadence boolean not null default false,
  thread_id uuid,
  message_id bigint,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index if not exists agent_proactive_log_recent on public.agent_proactive_log (user_id, sent_at desc);
alter table public.agent_proactive_log enable row level security;
drop policy if exists "own proactive log" on public.agent_proactive_log;
create policy "own proactive log" on public.agent_proactive_log for select to authenticated using (user_id = auth.uid());
revoke all on public.agent_proactive_log from anon, authenticated;
grant select on public.agent_proactive_log to authenticated;
grant all on public.agent_proactive_log to service_role;
