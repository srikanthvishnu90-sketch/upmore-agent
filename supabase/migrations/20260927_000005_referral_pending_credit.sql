-- Upmore migration 20260927_000005: referral anti-gaming (supersedes 20260927_000001).
-- Founder order 2026-09-27: "implement everything so we're not getting bombed
-- with recurring charges." The old flow created the $10 referral_credits row at
-- referee SIGNUP — gameable, pays credit before any revenue exists.
--
-- New policy:
--   1. qualify_referral() still creates the referrals row at onboarding, but
--      with status='pending' and NO credit row.
--   2. The $10 credit row is created only when the referee's first paid charge
--      clears. credit_pending_referral() is called by the Stripe webhook
--      (service_role only) from checkout.session.completed /
--      invoice.payment_succeeded. Idempotent: referral_credits.referral_id is
--      UNIQUE, guarded with ON CONFLICT DO NOTHING, and the referrals row
--      flips pending -> credited exactly once.
--   3. At payout time the referrer must STILL be an eligible subscriber and the
--      5/month cap is re-checked (cap counts pending+credited created this
--      month, so farmed pendings can't exceed it either).
-- Kept: referrer must be active subscriber, 5/month cap, $10 non-cashable
-- subscription-only credit. Until Stripe is live, no payouts can occur —
-- behavior today is unchanged.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. qualify_referral(): pending-first, no credit row
-- ---------------------------------------------------------------------------
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

  -- One referral per referee, ever.
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

  -- Rule 4: cap of 5 referrals per referrer per calendar month. Counts
  -- pending AND credited (created this month) so farmed pendings can't
  -- exceed the cap either.
  SELECT COUNT(*) INTO v_month_count
  FROM public.referrals
  WHERE referrer_id = v_referrer_id
    AND status IN ('pending', 'credited')
    AND created_at >= date_trunc('month', now());

  IF v_month_count >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monthly_cap_reached');
  END IF;

  -- Belt-and-braces: the referee gets their own code for future referrals
  -- (the INSERT trigger normally covers this).
  UPDATE public.profiles
    SET referral_code = public.generate_referral_code()
    WHERE id = v_referee_id AND referral_code IS NULL;

  -- Anti-gaming: record the referral as PENDING. No credit row is created
  -- here — the $10 credit lands only when the referee's first paid charge
  -- clears (credit_pending_referral, called by the Stripe webhook).
  INSERT INTO public.referrals
    (referrer_id, referee_id, referral_code, status)
  VALUES (v_referrer_id, v_referee_id, v_code, 'pending')
  RETURNING id INTO v_referral_id;

  RETURN jsonb_build_object(
    'ok', true,
    'referral_id', v_referral_id,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.qualify_referral(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qualify_referral(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. credit_pending_referral(): referee's first paid charge -> $10 credit
-- ---------------------------------------------------------------------------
-- Called by the Stripe webhook (service_role) from checkout.session.completed
-- / invoice.payment_succeeded. NOT callable by end users.
--
-- Returns jsonb:
--   success: {"ok": true, "referral_id": ..., "credit_id": ..., "amount": 10}
--   failure: {"ok": false, "error": "<code>"}
-- Error codes: no_referee | no_pending_referral | referrer_not_subscriber |
--              monthly_cap_reached
--
-- Idempotent: safe to call on every invoice.payment_succeeded. The
-- status='pending' filter + UNIQUE(referral_id) + ON CONFLICT DO NOTHING mean
-- the credit is created exactly once no matter how many events arrive.
CREATE OR REPLACE FUNCTION public.credit_pending_referral(p_referee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_id uuid;
  v_referrer_id uuid;
  v_month_count int;
  v_credit_id uuid;
BEGIN
  IF p_referee_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_referee');
  END IF;

  SELECT id, referrer_id INTO v_referral_id, v_referrer_id
  FROM public.referrals
  WHERE referee_id = p_referee_id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_referral_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_pending_referral');
  END IF;

  -- The referrer must STILL be an eligible subscriber at payout time.
  IF NOT public.is_eligible_referrer(v_referrer_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'referrer_not_subscriber');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('upmore_referral:' || v_referrer_id::text, 0)
  );

  -- Re-check the cap at payout (counts pending+credited created this month).
  SELECT COUNT(*) INTO v_month_count
  FROM public.referrals
  WHERE referrer_id = v_referrer_id
    AND status IN ('pending', 'credited')
    AND created_at >= date_trunc('month', now());

  IF v_month_count > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monthly_cap_reached');
  END IF;

  -- Idempotent credit insert: referral_id is UNIQUE.
  INSERT INTO public.referral_credits (user_id, amount, referral_id, applied)
  VALUES (v_referrer_id, 10, v_referral_id, false)
  ON CONFLICT (referral_id) DO NOTHING
  RETURNING id INTO v_credit_id;

  -- Flip pending -> credited exactly once.
  UPDATE public.referrals
  SET status = 'credited', credited_at = now()
  WHERE id = v_referral_id AND status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'referral_id', v_referral_id,
    'credit_id', v_credit_id,
    'amount', 10
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_pending_referral(uuid) FROM PUBLIC;
-- No GRANT to authenticated: service_role (Stripe webhook) only.

-- ---------------------------------------------------------------------------
-- 3. get_referral_stats(): align this_month_count with the cap definition
-- ---------------------------------------------------------------------------
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

  -- Matches the cap: pending+credited created this calendar month.
  SELECT COUNT(*) INTO v_month
  FROM public.referrals
  WHERE referrer_id = p_user_id
    AND status IN ('pending', 'credited')
    AND created_at >= date_trunc('month', now());

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
