-- CHANNEL-DOC-1 — owner-scoped document bytes behind the agent-chat
-- reply contract's artifacts[] (LANE B, 2026-10-20).
-- When a turn produces a document a user should receive as a file
-- (today: the tailored resume PDF rendered by module 148), agent-chat
-- stores the bytes here, scoped to the turn's user and thread, and the
-- reply carries only an opaque ref (this row's id). The channel
-- bridges resolve the ref at send time under the same owner scope —
-- Telegram uploads the bytes via sendDocument; WhatsApp serves them
-- through a signed, expiring URL on whatsapp-inbound itself. A ref is
-- never a public link: the table has no public access at all.
-- Written and read ONLY by the edge functions using the service_role
-- key (bypasses RLS). RLS enabled with no public policies: ordinary
-- users get nothing — the same posture as channel_threads and
-- channel_pending_approvals. expires_at bounds every row's life; an
-- expired row reads as nothing at the seam. NOT APPLIED by the build
-- lane — operator applies with the rollout, same as every channel
-- migration.
create table if not exists public.channel_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  kind text not null default 'document',
  filename text not null,
  mime text not null,
  bytes_b64 text not null,
  sha256 text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.channel_artifacts enable row level security;

create index if not exists channel_artifacts_user_thread_idx
  on public.channel_artifacts (user_id, thread_id, created_at desc);
