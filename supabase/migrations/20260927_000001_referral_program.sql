-- Upmore migration 20260927_000001: referral program backend (2026-09-27).
-- Vishnu's spec: $10 ACCOUNT CREDIT paid ON SIGNUP (not on subscription).
-- Higher risk/reward by design. Backend enforces the guardrails:
--   1. Only active subscribers ($10/mo, status='active', period valid) can refer.
--   2. Referee must complete FULL onboarding (profile row created w/ onboarding
--      answers within the last 48h) — not just an email signup.
--   3. On qualified signup: referrer gets $10 credit IMMEDIATELY (credit toward
--      their subscription, never cash).
--   4. Cap: 5 referral credits per referrer per calendar month ($50 max).
--   5. Fraud: no self-referral, brand-new referee only, one credit per referee.
--
-- Implementation is database functions (SECURITY DEFINER) rather than an Edge
-- Function: all checks + inserts happen in ONE transaction, no race conditions.
-- NOT YET WIRED TO BILLING: public.user_subscriptions is a minimal stub table
-- that the future Stripe integration must populate. is_eligible_referrer()
-- reads it. Until Stripe lands, nobody is eligible to refer.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Referral code on profiles (unique 8-char alphanumeric, immutable)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

-- Generates a unique 8-char code. Charset excludes 0/O and 1/I/L to avoid
-- confusion when users read codes aloud or type them.
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..8 LOOP
      candidate := candidate || substr(chars, (floor(random() * 32)::int) + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE referral_code = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$;

-- Auto-assign a code on profile insert when the client didn't provide one.
CREATE OR REPLACE FUNCTION public.assign_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_assign_referral_code ON public.profiles;
CREATE TRIGGER profiles_assign_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.assign_referral_code();

-- Referral codes are immutable once assigned (clients must not rotate or
-- steal codes; UNIQUE alone would not stop a user blanking their own code).
CREATE OR REPLACE FUNCTION public.lock_referral_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.referral_code IS NOT NULL
     AND NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'referral_code is immutable once assigned';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_lock_referral_code ON public.profiles;
CREATE TRIGGER profiles_lock_referral_code
  BEFORE UPDATE OF referral_code ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.lock_referral_code();

-- Backfill codes for existing profiles (one statement per row so each
-- uniqueness check sees previously assigned codes).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE referral_code IS NULL LOOP
    UPDATE public.profiles
      SET referral_code = public.generate_referral_code()
      WHERE id = r.id;
  END LOOP;
END $$;

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

-- ---------------------------------------------------------------------------
-- 5. is_eligible_referrer(): only ACTIVE paying subscribers may refer
-- ---------------------------------------------------------------------------
-- "Paying" = status 'active' with a current period that has not ended.
-- trialing / past_due / canceled do NOT qualify.
CREATE OR REPLACE FUNCTION public.is_eligible_referrer(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND current_period_end IS NOT NULL
      AND current_period_end > now()
  );
$$;

REVOKE ALL ON FUNCTION public.is_eligible_referrer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_eligible_referrer(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. qualify_referral(): the core transaction
-- ---------------------------------------------------------------------------
-- Called by the REFEREE (authenticated) exactly once, right after onboarding
-- completes and their profile row exists. Derives referee identity from
-- auth.uid() — callers cannot qualify referrals on behalf of other users.
--
-- Returns jsonb:
--   success: {"ok": true, "referral_id": ..., "credit_id": ..., "amount": 10}
--   failure: {"ok": false, "error": "<code>"}
-- Error codes: not_authenticated | invalid_code | self_referral | no_profile |
--              not_new_user | already_referred | referrer_not_subscriber |
--              monthly_cap_reached
--
-- All checks and both inserts run in one transaction. An advisory lock per
-- referrer serializes concurrent calls so the 5/month cap cannot be raced.
CREATE OR REPLACE FUNCTION public.qualify_referral(p_referral_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referee_id uuid := auth.uid();
  v_code text := upper(trim(p_referral_code));
  v_referrer_id uuid;
  v_referee_created timestamptz;
  v_month_count int;
  v_referral_id uuid;
  v_credit_id uuid;
BEGIN
  IF v_referee_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF v_code IS NULL OR v_code !~ '^[A-Z2-9]{8}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  -- SECURITY DEFINER bypasses the "own profile" RLS so we can resolve the
  -- referrer from their public code. Only the id is used; nothing else leaks.
  SELECT id INTO v_referrer_id
  FROM public.profiles WHERE referral_code = v_code;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  -- Fraud: no self-referral.
  IF v_referrer_id = v_referee_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  -- Referee must have completed onboarding (profile exists with answers).
  SELECT created_at INTO v_referee_created
  FROM public.profiles WHERE id = v_referee_id;

  IF v_referee_created IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_profile');
  END IF;

  -- Fraud: referee must be brand-new (onboarded within the last 48h).
  IF v_referee_created < now() - interval '48 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_new_user');
  END IF;

  -- One referral credit per referee, ever.
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = v_referee_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;

  -- Rule 1: referrer must be an active paying subscriber.
  IF NOT public.is_eligible_referrer(v_referrer_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'referrer_not_subscriber');
  END IF;

  -- Serialize per-referrer so the monthly cap can't be raced by concurrent
  -- signups.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('upmore_referral:' || v_referrer_id::text, 0)
  );

  -- Rule 4: cap of 5 credited referrals per referrer per calendar month.
  SELECT COUNT(*) INTO v_month_count
  FROM public.referrals
  WHERE referrer_id = v_referrer_id
    AND status = 'credited'
    AND credited_at >= date_trunc('month', now());

  IF v_month_count >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monthly_cap_reached');
  END IF;

  -- Belt-and-braces: the referee gets their own code for future referrals
  -- (the INSERT trigger normally covers this).
  UPDATE public.profiles
    SET referral_code = public.generate_referral_code()
    WHERE id = v_referee_id AND referral_code IS NULL;

  -- Rule 3: issue the $10 credit IMMEDIATELY, atomically with the referral.
  INSERT INTO public.referrals
    (referrer_id, referee_id, referral_code, status, qualified_at, credited_at)
  VALUES (v_referrer_id, v_referee_id, v_code, 'credited', now(), now())
  RETURNING id INTO v_referral_id;

  INSERT INTO public.referral_credits (user_id, amount, referral_id, applied)
  VALUES (v_referrer_id, 10, v_referral_id, false)
  RETURNING id INTO v_credit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'referral_id', v_referral_id,
    'credit_id', v_credit_id,
    'amount', 10
  );
END;
$$;

REVOKE ALL ON FUNCTION public.qualify_referral(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qualify_referral(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_referral_stats(): dashboard numbers for the referrer
-- ---------------------------------------------------------------------------
-- Callers may only query their own stats (enforced inside; the function is
-- SECURITY DEFINER so it can aggregate across the user's own rows).
CREATE OR REPLACE FUNCTION public.get_referral_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_total numeric;
  v_pending int;
  v_month int;
  v_available numeric;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'can only read your own referral stats';
  END IF;

  SELECT referral_code INTO v_code
  FROM public.profiles WHERE id = p_user_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM public.referral_credits WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_pending
  FROM public.referrals
  WHERE referrer_id = p_user_id AND status = 'pending';

  SELECT COUNT(*) INTO v_month
  FROM public.referrals
  WHERE referrer_id = p_user_id
    AND status = 'credited'
    AND credited_at >= date_trunc('month', now());

  SELECT COALESCE(SUM(amount), 0) INTO v_available
  FROM public.referral_credits
  WHERE user_id = p_user_id AND applied = false;

  RETURN jsonb_build_object(
    'referral_code', v_code,
    'total_earned', v_total,
    'pending', v_pending,
    'this_month_count', v_month,
    'this_month_remaining', GREATEST(0, 5 - v_month),
    'credits_available', v_available,
    'eligible_to_refer', public.is_eligible_referrer(p_user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_referral_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_referral_stats(uuid) TO authenticated;
