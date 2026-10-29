-- Trainee subscribe/cancel by text (2026-10-28): the webhook records whether Stripe will end the subscription at the end of
-- the paid period. Additive and idempotent. Requires user_subscriptions (20261028100000 or 20260927_000001).
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
