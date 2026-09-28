-- Upmore migration 20260923_000004: Save Side tables.
-- Five per-user tables backing the Save Side feature set: subscription
-- tracking, receipts/returns+warranty, the money-saved ledger, upcoming
-- renewals, and claims/deadlines. All rows are owned by a single user
-- (user_id -> profiles(id) ON DELETE CASCADE) with RLS enforcing
-- per-user access via auth.uid() = user_id.
-- Idempotent: safe to re-run on live and fresh DBs.

-- ---------------------------------------------------------------------------
-- 1. save_subscriptions: recurring subscriptions the user pays for.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.save_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant text NOT NULL,
  plan_name text,
  amount numeric,
  currency text NOT NULL DEFAULT 'USD',
  billing_interval text,
  next_billing_date date,
  status text NOT NULL DEFAULT 'active',
  cancel_url text,
  cancel_steps text,
  detected_via text NOT NULL DEFAULT 'manual',
  waste_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.save_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_subscriptions ON public.save_subscriptions;
CREATE POLICY own_subscriptions ON public.save_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. save_receipts: purchase receipts for returns and warranty tracking.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.save_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant text,
  order_no text,
  purchased_at date,
  total numeric,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  return_window_end date,
  warranty_terms text,
  source text NOT NULL DEFAULT 'manual',
  raw_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.save_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_receipts ON public.save_receipts;
CREATE POLICY own_receipts ON public.save_receipts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. save_ledger: the "money saved" ledger (Received/Avoided/Reduced/
--    Cash flow/Found buckets).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.save_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK (bucket IN ('Received','Avoided','Reduced','Cash flow','Found')),
  amount numeric NOT NULL,
  title text NOT NULL,
  detail text,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  reversed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.save_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_ledger ON public.save_ledger;
CREATE POLICY own_ledger ON public.save_ledger
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. save_renewals: upcoming renewals needing prep (insurance, memberships,
--    domain renewals, annual bills...).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.save_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  renews_on date NOT NULL,
  kind text,
  prep_notes text,
  status text NOT NULL DEFAULT 'upcoming',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.save_renewals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_renewals ON public.save_renewals;
CREATE POLICY own_renewals ON public.save_renewals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. save_claims: claims/deadlines to chase (price adjustments, rebates,
--    warranty claims, class-action payouts...).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.save_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant text,
  kind text NOT NULL,
  amount numeric,
  deadline date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  steps text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.save_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_claims ON public.save_claims;
CREATE POLICY own_claims ON public.save_claims
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
