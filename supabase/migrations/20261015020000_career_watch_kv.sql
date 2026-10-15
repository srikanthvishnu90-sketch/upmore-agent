-- Career watch KV (Mega Task 2 alerts product, MI-032 step 3 of 5).
-- Prepared by Crew A (MI-032 step 2, branch work/crewa-mi032-host) for the OWNER to run.
-- NOT applied by any agent lane: migrations to the live project are the owner's step.
-- ADDITIVE ONLY: one new table. No existing table is altered.
--
-- Purpose: the durable per-user store behind the alerts host wiring
-- (docs/career/alerts-host-wiring.md §1). Modules 151 (watch) and 152 (assign)
-- hold per-user state in an injected {get,set} KV store; the deployed adapter
-- (createSupabaseStore in scripts/career/alerts-host.mjs) targets this table
-- behind that same interface. Watch state is per USER, not per thread, so it
-- does not belong inside agent_flow_state's per-thread rows.
--
-- Keys stored here are exactly the ones 152 and the host define — the adapter
-- invents none of its own for 152's data:
--   career:watch-profile:<user_id>                    (152 PROFILE_KEY)
--   career:reminder-queue:<user_id>                   (152 QUEUE_KEY)
--   career:reminder-history:<user_id>                 (152 HISTORY_KEY)
--   career:jobs:snapshot:board:<source>:<token>:<user_id>  (host, 151 scheme + user suffix)
--   career:delivery-ledger:<user_id>                   (host delivery exactly-once ledger)
--
-- RLS is enabled with NO anon/authenticated policies: only the backend
-- (scheduler/host) reads and writes, with the service role, which bypasses
-- RLS. No client reads in v1 (design note §1).

create table if not exists public.career_watch_kv (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

comment on table public.career_watch_kv is 'MI-032 alerts host wiring: generic per-user KV for the career watch/assign state (152 watch profiles, reminder queues, seat history; 151 per-board snapshots; host delivery ledger). Written/read by scripts/career/alerts-host.mjs createSupabaseStore via the service role. Design: docs/career/alerts-host-wiring.md.';

alter table public.career_watch_kv enable row level security;
