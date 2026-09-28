-- Upmore migration 20260928_000005: "connect once" Plaid sync state.
--
-- Goal: the product works without the user re-connecting. A scheduled
-- edge function (plaid-sync, every 6h via pg_cron) iterates all vaulted
-- Plaid items and refreshes data server-side:
--   - transactions: incremental /transactions/sync every run (cursor kept here)
--   - holdings/balances: /investments/holdings/get when the cache is older
--     than 7 days (the founder's COST ARMOR weekly policy stands — the
--     scheduler runs every 6h, each item refreshes holdings at most weekly)
--
-- plaid_items: per-item sync state + re-auth flag + nudge throttle.
-- plaid_txn_cache: synced transactions per item (feeds detectors + the
--   billing-cycle watcher once Plaid replaces SimpleFIN as the txn pipe).
--
-- Reconnect nudge: when Plaid reports ITEM_LOGIN_REQUIRED (or an equivalent
-- dead-token error), the sync sets needs_reauth and creates ONE
-- type='plaid_reconnect' reminder (deduped; at most one per item per 7 days
-- via last_nudge_at). The app surfaces it in Tasks with a Reconnect button
-- that opens Plaid Link (re-auth is always the user's own tap). The flag
-- clears on the next successful sync or token exchange. Stale data is never
-- presented as fresh: the UI shows "last synced <time>" from last_sync_at.

create table if not exists public.plaid_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  needs_reauth boolean not null default false,
  last_sync_at timestamptz,
  last_sync_error text,
  txn_cursor text,
  last_nudge_at timestamptz,
  consecutive_failures int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.plaid_txn_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  transaction_id text not null,
  posted date,
  amount numeric not null,
  merchant_name text,
  merchant_raw text not null,
  pending boolean not null default false,
  category text,
  primary key (user_id, item_id, transaction_id)
);
create index if not exists plaid_txn_cache_user_posted
  on public.plaid_txn_cache (user_id, posted desc);

alter table public.plaid_items enable row level security;
alter table public.plaid_txn_cache enable row level security;

-- Owner read; writes are service_role only (the sync function, exchange,
-- disconnect). No insert/update/delete policies for clients.
drop policy if exists plaid_items_owner_read on public.plaid_items;
create policy plaid_items_owner_read on public.plaid_items for select
  using (auth.uid() = user_id);

drop policy if exists plaid_txn_cache_owner_read on public.plaid_txn_cache;
create policy plaid_txn_cache_owner_read on public.plaid_txn_cache for select
  using (auth.uid() = user_id);
