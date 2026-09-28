-- Upmore migration 20260924_000002: Manage-your-finances tables.
-- Per-user finance hub backing the Money tab: linked accounts (Plaid/manual/demo),
-- agent alerts, savings goals, monthly snapshots, and a bank-connection waitlist.
-- All rows owned by user_id -> profiles(id) ON DELETE CASCADE, RLS owner-only.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. finance_accounts: bank accounts the user linked or added manually.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_name text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL DEFAULT 'checking'
    CHECK (account_type IN ('checking','savings','credit','investment','manual')),
  mask text,
  balance_current numeric,
  balance_available numeric,
  currency text NOT NULL DEFAULT 'USD',
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('plaid','manual','demo')),
  plaid_account_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_finance_accounts ON public.finance_accounts;
CREATE POLICY own_finance_accounts ON public.finance_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. finance_alerts: things the money agent noticed and the user should see.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'info'
    CHECK (kind IN ('spike','new_recurring','low_balance','payday','promo_fit','info')),
  title text NOT NULL,
  detail text,
  evidence text,
  action_label text,
  action_tab text,
  action_url text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','acted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_finance_alerts ON public.finance_alerts;
CREATE POLICY own_finance_alerts ON public.finance_alerts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. finance_goals: savings goals tracked from real balances.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_amount numeric NOT NULL CHECK (target_amount > 0),
  current_amount numeric NOT NULL DEFAULT 0,
  deadline date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_finance_goals ON public.finance_goals;
CREATE POLICY own_finance_goals ON public.finance_goals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. finance_snapshots: monthly rollup (inflow/outflow/cash) for the Money page.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month date NOT NULL,
  inflow numeric NOT NULL DEFAULT 0,
  outflow numeric NOT NULL DEFAULT 0,
  cash_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);
ALTER TABLE public.finance_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_finance_snapshots ON public.finance_snapshots;
CREATE POLICY own_finance_snapshots ON public.finance_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. finance_waitlist: emails wanting real bank connections (private beta).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);
ALTER TABLE public.finance_waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_finance_waitlist ON public.finance_waitlist;
CREATE POLICY own_finance_waitlist ON public.finance_waitlist
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Demo seed for demo@upmore.app (1f9b18e5-928c-44ce-9d7e-d77c0e57f396).
-- Clearly marked source='demo'; real Plaid rows will use source='plaid'.
-- ---------------------------------------------------------------------------
INSERT INTO public.finance_accounts (id, user_id, institution_name, account_name, account_type, mask, balance_current, balance_available, source)
VALUES
  ('a1111111-1111-1111-1111-111111111111', '1f9b18e5-928c-44ce-9d7e-d77c0e57f396', 'Chase', 'Checking', 'checking', '4471', 2340.12, 2290.12, 'demo'),
  ('a2222222-2222-2222-2222-222222222222', '1f9b18e5-928c-44ce-9d7e-d77c0e57f396', 'Chase', 'Savings', 'savings', '8823', 1150.00, 1150.00, 'demo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.finance_snapshots (id, user_id, month, inflow, outflow, cash_total)
VALUES
  ('b1111111-1111-1111-1111-111111111111', '1f9b18e5-928c-44ce-9d7e-d77c0e57f396', date_trunc('month', now())::date, 3200.00, 2415.66, 3490.12)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.finance_alerts (id, user_id, kind, title, detail, evidence, action_label, action_tab)
VALUES
  ('c1111111-1111-1111-1111-111111111111', '1f9b18e5-928c-44ce-9d7e-d77c0e57f396', 'spike',
   'Electric bill doubled', 'ComEd charged $184.20 — up from $89.10 last month.',
   'Based on 3 months of Chase checking …4471.', 'See the bill', NULL),
  ('c2222222-2222-2222-2222-222222222222', '1f9b18e5-928c-44ce-9d7e-d77c0e57f396', 'new_recurring',
   'New recurring charge', 'Paramount+ $7.99/mo started Sept 12.',
   'First seen 2026-09-12 on Chase checking …4471.', 'Review in Save', 'save'),
  ('c3333333-3333-3333-3333-333333333333', '1f9b18e5-928c-44ce-9d7e-d77c0e57f396', 'payday',
   'Payday landed', '$1,600 arrived Sept 19. Move $200 to savings?',
   'Paycheck pattern: every other Friday.', 'Show me how', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.finance_goals (id, user_id, name, target_amount, current_amount)
VALUES
  ('d1111111-1111-1111-1111-111111111111', '1f9b18e5-928c-44ce-9d7e-d77c0e57f396', '$1,000 emergency fund', 1000, 340)
ON CONFLICT (id) DO NOTHING;
