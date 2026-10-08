-- Copy trading + auto-invest schema (2026-10-08).
--
-- Brokerage API keys NEVER live in these tables — they go in Secure Vault;
-- brokerage_accounts stores only the vault ref. trade_orders is the full
-- audit trail: proposed -> approved -> submitted -> filled.
--
-- SAFETY: nothing auto-executes. Every order requires an exec_approvals row
-- (one approval per trade, Vishnu's explicit yes) until he authorizes a
-- separate autonomous-trading framework. Paper accounts first, always.

create table if not exists public.brokerage_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'alpaca',
  label text not null default 'main',
  paper boolean not null default true,
  vault_key_ref text,
  status text not null default 'active' check (status in ('active','paused','revoked')),
  created_at timestamptz not null default now(),
  unique (user_id, provider, label)
);

create table if not exists public.copy_leaders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source text not null default 'manual' check (source in ('manual','community','strategy')),
  description text,
  risk_profile text check (risk_profile in ('conservative','moderate','aggressive')),
  perf_cache jsonb not null default '{}',
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.copy_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  leader_id uuid not null references public.copy_leaders(id) on delete cascade,
  brokerage_account_id uuid references public.brokerage_accounts(id) on delete set null,
  allocation_pct numeric check (allocation_pct > 0 and allocation_pct <= 100),
  allocation_amount numeric check (allocation_amount > 0),
  max_position_pct numeric check (max_position_pct > 0 and max_position_pct <= 100),
  stop_loss_pct numeric check (stop_loss_pct > 0 and stop_loss_pct <= 100),
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  unique (user_id, leader_id)
);

create table if not exists public.auto_invest_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brokerage_account_id uuid references public.brokerage_accounts(id) on delete set null,
  name text not null,
  rule_type text not null check (rule_type in ('recurring_buy','rebalance','drift_trigger')),
  allocations jsonb not null default '{}',
  amount numeric check (amount > 0),
  frequency text check (frequency in ('daily','weekly','monthly')),
  drift_threshold_pct numeric check (drift_threshold_pct > 0),
  cash_reserve numeric check (cash_reserve >= 0),
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now()
);

create table if not exists public.trade_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brokerage_account_id uuid references public.brokerage_accounts(id) on delete set null,
  symbol text not null,
  side text not null check (side in ('buy','sell')),
  qty numeric not null check (qty > 0),
  order_type text not null default 'market' check (order_type in ('market','limit')),
  limit_price numeric check (limit_price > 0),
  source text check (source in ('copy','auto_invest','manual')),
  copy_follow_id uuid references public.copy_follows(id) on delete set null,
  auto_invest_rule_id uuid references public.auto_invest_rules(id) on delete set null,
  status text not null default 'proposed'
    check (status in ('proposed','approved','rejected','submitted','filled','cancelled','failed')),
  approval_id uuid references public.exec_approvals(id) on delete set null,
  broker_order_id text,
  filled_qty numeric check (filled_qty >= 0),
  filled_avg_price numeric check (filled_avg_price >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brokerage_account_id uuid references public.brokerage_accounts(id) on delete cascade,
  holdings jsonb not null default '[]',
  cash numeric check (cash >= 0),
  total_equity numeric check (total_equity >= 0),
  snapshot_at timestamptz not null default now()
);

create index if not exists brokerage_accounts_user_idx on public.brokerage_accounts (user_id);
create index if not exists copy_leaders_user_idx on public.copy_leaders (user_id);
create index if not exists copy_follows_user_idx on public.copy_follows (user_id);
create index if not exists copy_follows_leader_idx on public.copy_follows (leader_id);
create index if not exists auto_invest_rules_user_idx on public.auto_invest_rules (user_id);
create index if not exists trade_orders_user_idx on public.trade_orders (user_id);
create index if not exists trade_orders_status_idx on public.trade_orders (status, created_at);
create index if not exists portfolio_snapshots_acct_idx on public.portfolio_snapshots (brokerage_account_id, snapshot_at desc);

alter table public.brokerage_accounts enable row level security;
alter table public.copy_leaders enable row level security;
alter table public.copy_follows enable row level security;
alter table public.auto_invest_rules enable row level security;
alter table public.trade_orders enable row level security;
alter table public.portfolio_snapshots enable row level security;
