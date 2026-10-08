-- iMessage test-bridge thread mapping (TEST ONLY).
-- Maps (agent, phone) -> agent_threads row so multi-turn context persists
-- across texts. Written by the imessage-inbound edge function using the
-- service_role key (bypasses RLS). RLS enabled with no public policies:
-- ordinary users get nothing.
create table if not exists public.imessage_threads (
  agent text not null check (agent in ('ruwe', 'upmore')),
  phone text not null,
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  last_message_id text,
  updated_at timestamptz not null default now(),
  primary key (agent, phone)
);
