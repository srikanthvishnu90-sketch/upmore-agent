-- WO-013b-2: texts coming in. channel_inbound claims each provider message id before any work, so a retried webhook
-- never runs a second turn (it keeps the id only: no number or text, so nothing there outlives a deleted account);
-- channel_contacts keeps each person's one texting thread; replies ride career_outbox (key reply:<message id>) so the
-- daily contact cap and the at-most-once rule cover them too.
create table if not exists public.channel_inbound (
  provider_message_id text primary key check (length(provider_message_id) between 1 and 200),
  received_at timestamptz not null default now()
);
create index if not exists channel_inbound_received on public.channel_inbound (received_at);

alter table public.channel_contacts add column if not exists thread_id uuid references public.agent_threads(id) on delete set null;

alter table public.career_outbox drop constraint if exists career_outbox_key_check;
alter table public.career_outbox add constraint career_outbox_key_check check (key ~ '^(alert|report|reply):.+$' and length(key) <= 310);
alter table public.career_outbox drop constraint if exists career_outbox_kind_check;
alter table public.career_outbox add constraint career_outbox_kind_check check (kind in ('alert', 'report', 'reply'));

-- Claim one row by its key (a reply sent the moment it is written); same rules as career_outbox_claim.
create or replace function public.career_outbox_claim_key(p_user uuid, p_key text, p_now timestamptz)
returns table (id bigint, user_id uuid, contact text, key text, text text, deliver_at timestamptz, attempts int, prior_status text)
language sql security definer set search_path = public as $$
  with due as (
    select o.id, c.contact, o.status as prior_status
    from career_outbox o join channel_contacts c on c.user_id = o.user_id
    where o.user_id = p_user and o.key = p_key and o.deliver_at <= p_now
      and (o.status = 'queued' or (o.status = 'failed' and o.retry_at is not null and o.retry_at <= p_now))
    for update of o skip locked)
  update career_outbox o set status = 'sending', claimed_at = p_now, contact = due.contact
  from due where o.id = due.id
  returning o.id, o.user_id, o.contact, o.key, o.text, o.deliver_at, o.attempts, due.prior_status;
$$;
revoke all on function public.career_outbox_claim_key(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.career_outbox_claim_key(uuid, text, timestamptz) to service_role;

alter table public.channel_inbound enable row level security;
revoke all on public.channel_inbound from anon, authenticated;
