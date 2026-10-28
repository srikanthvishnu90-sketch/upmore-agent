-- Restore the tables the referral flow needs: user_subscriptions, referrals, referral_credits (2026-10-28).
-- referrals and referral_credits were dropped from production by mistake. This restores them exactly as defined in
-- 20260927_000001_referral_program.sql sections 2-4 (columns, constraints, RLS, policies, index). Idempotent: every
-- statement is IF NOT EXISTS / DROP POLICY IF EXISTS, so it is safe to re-run and a no-op where the tables exist.
-- The functions (qualify_referral, credit_pending_referral, ...) were never dropped and are not redefined here.
-- Until this is applied, stripe-webhook and stripe-checkout skip referral credits instead of failing (trainee_billing.ts
-- tolerantReferrals). NOT APPLIED by any agent: the owner applies it.

-- ---------------------------------------------------------------------------
-- 2. Minimal subscription status table (stub for future Stripe integration)
-- ---------------------------------------------------------------------------
-- The Stripe billing integration (webhook / edge function) must UPSERT this
-- table on subscription events. Until it does, is_eligible_referrer() returns
-- false for everyone and no referral credits can be issued.
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'incomplete'
    CHECK (status IN ('incomplete','incomplete_expired','trialing','active',
                      'past_due','canceled','unpaid')),
  plan text NOT NULL DEFAULT 'monthly',
  price_cents integer NOT NULL DEFAULT 1000,
  current_period_start timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own subscription" ON public.user_subscriptions;
CREATE POLICY "own subscription" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies: only service_role / SECURITY DEFINER
-- (the future Stripe webhook) may write subscription status.

-- ---------------------------------------------------------------------------
-- 3. referrals table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','qualified','credited')),
  created_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz,
  credited_at timestamptz,
  CONSTRAINT referrals_no_self CHECK (referrer_id <> referee_id),
  CONSTRAINT referrals_one_per_referee UNIQUE (referee_id)
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own referrals" ON public.referrals;
CREATE POLICY "own referrals" ON public.referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id);
-- No write policies: rows are created only by qualify_referral() (SECURITY
-- DEFINER). Users can never insert/update/delete referral records directly.

CREATE INDEX IF NOT EXISTS referrals_referrer_idx
  ON public.referrals (referrer_id, status, credited_at);

-- ---------------------------------------------------------------------------
-- 4. referral_credits table ($10 account credits, never cash)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 10 CHECK (amount = 10),
  referral_id uuid NOT NULL UNIQUE REFERENCES public.referrals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- applied=false means the credit is banked but not yet consumed against a
  -- subscription invoice. The billing integration flips this when it applies
  -- the credit. Credits never leave Upmore as cash.
  applied boolean NOT NULL DEFAULT false
);

ALTER TABLE public.referral_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own credits" ON public.referral_credits;
CREATE POLICY "own credits" ON public.referral_credits
  FOR SELECT USING (auth.uid() = user_id);
-- No write policies: created only by qualify_referral(); consumed only by
-- the future billing integration (service role).

