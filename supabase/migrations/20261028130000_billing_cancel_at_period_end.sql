-- Billing and cancelling by text (owner, 2026-10-27; supabase/functions/_shared/career_billing.ts). A plan cancelled at
-- period end stays "active" at Stripe until the period ends, so the row must say it is ending, or "what am I paying"
-- would promise a next charge that will never come. stripe-webhook writes Stripe's cancel_at_period_end on every
-- subscription event; the chat's cancel sets it once Stripe accepted the cancel.
-- Idempotent. RLS stays on (20260927_000001: the person reads their own row; only the service role writes).
-- The table comes from 20260927_000001_referral_program.sql; on a project without it this does nothing.
do $$
begin
  if to_regclass('public.user_subscriptions') is not null then
    alter table public.user_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
    alter table public.user_subscriptions enable row level security;
  end if;
end $$;
