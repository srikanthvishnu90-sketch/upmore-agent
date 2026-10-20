-- Messaging-channel approval offers (TEST ONLY).
-- When a channel bridge presents a hash-bound batch approval card, the
-- card's cardSha256 stays server-side: this table binds it to a
-- single-use, expiring opaque token that a Telegram inline button or a
-- WhatsApp numbered choice carries back. Resolution consumes the row
-- BEFORE the bridge calls agent-chat with the exact approval message +
-- the structured career_batch approve request, so a token can never
-- resolve twice and the core remains the only authority that verifies
-- the hash against the stored run. Written by the telegram-inbound /
-- whatsapp-inbound edge functions using the service_role key (bypasses
-- RLS). RLS enabled with no public policies: ordinary users get
-- nothing. NOT APPLIED by the build lane — operator applies with the
-- channel rollout, same as every career migration.
create table if not exists public.channel_pending_approvals (
  token text primary key,
  channel text not null check (channel in ('telegram', 'whatsapp')),
  sender_key text not null,
  user_id uuid not null,
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  run_id text not null,
  card_sha256 text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists channel_pending_approvals_sender_idx
  on public.channel_pending_approvals (channel, sender_key, created_at desc);

alter table public.channel_pending_approvals enable row level security;
