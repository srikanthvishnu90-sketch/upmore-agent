-- Upmore-only migration: spike-detector fields on save_subscriptions.
-- The frontend sets previous_amount/previous_amount_at when a user edits a
-- subscription amount; without these columns the UPDATE fails and the
-- "bill went up" detector can never fire.
ALTER TABLE public.save_subscriptions
  ADD COLUMN IF NOT EXISTS previous_amount numeric,
  ADD COLUMN IF NOT EXISTS previous_amount_at timestamptz;
