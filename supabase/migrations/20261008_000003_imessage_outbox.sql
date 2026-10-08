-- iMessage test-bridge outbound outbox (TEST ONLY).
-- The imessage-inbound edge function no longer holds LoopMessage API keys
-- (they live in Muse's Secure Vault as use-only credentials). It enqueues
-- one row per reply bubble here; a VM-side sender worker drains the outbox
-- through the vault surrogate. RLS enabled with no public policies:
-- ordinary users get nothing; service_role only.
create table if not exists public.imessage_outbox (
  id uuid primary key default gen_random_uuid(),
  agent text not null check (agent in ('ruwe', 'upmore')),
  contact text not null,
  text text not null,
  seq int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);
create index if not exists imessage_outbox_status_created_idx
  on public.imessage_outbox (status, created_at);
alter table public.imessage_outbox enable row level security;
