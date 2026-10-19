-- WO-013b-1: delivering career_outbox over the texting channel. channel_contacts is the texting contact of each person and
-- the contacts who texted STOP (kept even before an account exists); career_outbox gains the delivery record of each row;
-- channel_delivery_runs records every delivery run so a silent stop is visible. Delivery is at most once: a run claims rows
-- (two overlapping runs never claim the same row) and a row left "sending" by a run that died is failed, never resent.
create table if not exists public.channel_contacts (
  contact text primary key check (contact ~ '^(\+[0-9]{8,15}|[^@\s]+@[^@\s]+)$'),
  user_id uuid unique references auth.users(id) on delete cascade,
  opted_out boolean not null default false,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.career_outbox
  add column if not exists status text not null default 'queued',
  add column if not exists attempts int not null default 0,
  add column if not exists retry_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists contact text,
  add column if not exists provider_id text,
  add column if not exists error text;
alter table public.career_outbox drop constraint if exists career_outbox_status;
alter table public.career_outbox add constraint career_outbox_status check (
  status in ('queued', 'sending', 'delivered', 'failed', 'skipped_opt_out')
  and attempts between 0 and 10
  and (status <> 'delivered' or delivered_at is not null)
  and (provider_id is null or length(provider_id) <= 200)
  and (error is null or length(error) <= 500));
drop index if exists public.career_outbox_due;
create index if not exists career_outbox_due on public.career_outbox (deliver_at, id) where status in ('queued', 'failed');
create index if not exists career_outbox_sent on public.career_outbox (delivered_at) where status = 'delivered';
create index if not exists career_outbox_sending on public.career_outbox (claimed_at) where status = 'sending';

create table if not exists public.channel_delivery_runs (
  id bigserial primary key,
  run_at timestamptz not null,
  delivered int not null, failed int not null, retried int not null, skipped_opt_out int not null, capped int not null,
  swept int not null, ms int not null, error text
);

-- Claim up to p_limit due rows of people with a texting contact. A failed row is due again only at its retry time; a
-- final failure has no retry time. Returns the status each row had, so a row the run does not finish can be put back.
create or replace function public.career_outbox_claim(p_now timestamptz, p_limit int)
returns table (id bigint, user_id uuid, contact text, key text, text text, deliver_at timestamptz, attempts int, prior_status text)
language sql security definer set search_path = public as $$
  with due as (
    select o.id, c.contact, o.status as prior_status
    from career_outbox o join channel_contacts c on c.user_id = o.user_id
    where o.deliver_at <= p_now
      and (o.status = 'queued' or (o.status = 'failed' and o.retry_at is not null and o.retry_at <= p_now))
    order by o.deliver_at, o.id
    limit least(greatest(p_limit, 0), 100)
    for update of o skip locked)
  update career_outbox o set status = 'sending', claimed_at = p_now, contact = due.contact
  from due where o.id = due.id
  returning o.id, o.user_id, o.contact, o.key, o.text, o.deliver_at, o.attempts, due.prior_status;
$$;

-- Distinct contacts sent to on a UTC day: the provider's daily contact cap counts people, not messages.
create or replace function public.career_outbox_contacts_on(p_day date)
returns int language sql stable security definer set search_path = public as $$
  select count(distinct contact)::int from career_outbox
  where status = 'delivered' and delivered_at >= (p_day::timestamp at time zone 'UTC')
    and delivered_at < ((p_day + 1)::timestamp at time zone 'UTC');
$$;

revoke all on function public.career_outbox_claim(timestamptz, int) from public, anon, authenticated;
revoke all on function public.career_outbox_contacts_on(date) from public, anon, authenticated;
grant execute on function public.career_outbox_claim(timestamptz, int) to service_role;
grant execute on function public.career_outbox_contacts_on(date) to service_role;

alter table public.channel_contacts enable row level security;
alter table public.channel_delivery_runs enable row level security;
revoke all on public.channel_contacts, public.channel_delivery_runs from anon, authenticated;
grant select on public.channel_contacts to authenticated;
drop policy if exists channel_contacts_own on public.channel_contacts;
create policy channel_contacts_own on public.channel_contacts for select to authenticated using (user_id = auth.uid());
