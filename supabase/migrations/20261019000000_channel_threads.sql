-- Messaging-channel test-bridge thread mapping (TEST ONLY).
-- Mirrors 20261008_000001_imessage_threads.sql, generalized per channel:
-- maps (channel, sender_key) -> agent_threads row so multi-turn context
-- persists across messages on Telegram and WhatsApp. Written by the
-- telegram-inbound / whatsapp-inbound edge functions using the service_role
-- key (bypasses RLS). RLS enabled with no public policies: ordinary users
-- get nothing. NOT APPLIED by the build lane — operator applies with the
-- channel rollout, same as every career migration.
create table if not exists public.channel_threads (
  channel text not null check (channel in ('telegram', 'whatsapp')),
  sender_key text not null,
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  last_message_id text,
  updated_at timestamptz not null default now(),
  primary key (channel, sender_key)
);

alter table public.channel_threads enable row level security;
