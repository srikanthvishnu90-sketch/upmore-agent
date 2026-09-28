-- Upmore migration 20260923_000002: profiles.prefs jsonb.
-- Stores per-user UI preferences (e.g. reminder toggles) so they survive
-- sign-out and sync across devices. Idempotent.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS prefs jsonb NOT NULL DEFAULT '{}';
