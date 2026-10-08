-- IPO / pre-IPO offerings directory (2026-10-08).
--
-- Global facts, like class_action_settlements: upcoming IPOs the user can
-- request allocations for (e.g. Coinbase IPO Access, launched 2026-09-21).
-- ipo_requests tracks the user's own interest per offering.
--
-- HONESTY: allocation windows go stale fast. Rows carry verified_at; the
-- agent must never claim a window is open without a fresh verified row.
-- There is NO broker API for IPO allocation requests (Coinbase IPO Access
-- is app-only) — the agent alerts and guides; the user taps in the venue's
-- app. Requesting shares = committing funds = needs his explicit approval.

create table if not exists public.ipo_offerings (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  ticker text,
  offering_type text not null default 'ipo'
    check (offering_type in ('ipo','pre_ipo_secondary','direct_listing')),
  provider text not null default 'coinbase',
  price_low numeric check (price_low > 0),
  price_high numeric check (price_high > 0),
  expected_date date,
  window_opens timestamptz,
  window_closes timestamptz,
  status text not null default 'announced'
    check (status in ('announced','window_open','priced','trading','closed','cancelled')),
  shares_offered numeric check (shares_offered > 0),
  official_url text,
  notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ipo_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offering_id uuid not null references public.ipo_offerings(id) on delete cascade,
  status text not null default 'interested'
    check (status in ('interested','requested','allocated','declined','closed')),
  shares_requested numeric check (shares_requested > 0),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, offering_id)
);

create index if not exists ipo_offerings_status_idx
  on public.ipo_offerings (status, expected_date);
create index if not exists ipo_requests_user_idx
  on public.ipo_requests (user_id);

alter table public.ipo_offerings enable row level security;
alter table public.ipo_requests enable row level security;

-- Seed: Oura IPO — first offering on Coinbase IPO Access, announced 2026-09-21.
-- 50M shares at an estimated $40-$44, Nasdaq: OURA. Status as of seeding:
-- announced 2026-09-21; window/pricing status NOT re-verified — refresh before
-- telling the user a window is open.
insert into public.ipo_offerings
  (company_name, ticker, offering_type, provider, price_low, price_high,
   shares_offered, status, notes, verified_at)
values
  ('Oura', 'OURA', 'ipo', 'coinbase', 40, 44,
   50000000, 'announced',
   'First IPO on Coinbase IPO Access (announced 2026-09-21). 13.5M new shares plus 36.5M existing-holder shares. Allocations via Coinbase app Conditional Offer to Buy, subject to demand - may be full, partial, or zero. Selling within 30 days risks a 60-day IPO ban.',
   now());
