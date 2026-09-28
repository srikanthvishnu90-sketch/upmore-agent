-- Add annual_price to save_subscriptions (client sends it from the add-subscription form;
-- render code shows "annual $X saves $Y/yr" when set). Nullable: only filled when the user
-- enters an annual price.
ALTER TABLE public.save_subscriptions
  ADD COLUMN IF NOT EXISTS annual_price numeric;
