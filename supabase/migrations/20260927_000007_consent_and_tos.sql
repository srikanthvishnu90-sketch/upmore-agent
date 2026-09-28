-- Upmore migration 20260927_000007: consent log, ToS acceptance, DOB for 18+ gate.
--
-- Legal-docs track of the compliance pass (founder's "testing ready" gate,
-- gaps 1, 2, 5 of security-policies/11-compliance-analysis.md):
--   Gap 1: 18+ age gate. profiles.dob (nullable date) stores the date of
--     birth collected at signup by the neutral DOB gate. The client blocks
--     under-18 users before any profile row is written, and this migration
--     adds a server-side CHECK so no profiles row can ever hold a minor's
--     DOB. Existing rows keep dob NULL (grandfathered, 18+ by ToS
--     representation).
--   Gap 2: pre-connection consent screen. consent_log records one row per
--     explicit consent event: each time a user completes a pre-connection
--     consent screen for a financial aggregator ('simplefin' = bank,
--     'plaid' = brokerage) plus the version of the consent text shown.
--     This is what lets the Plaid Q10 answer become "Yes".
--   Gap 5: full clickwrap. tos_acceptance records which ToS version each
--     user accepted and when. Append-only: one row per (user, version), so
--     re-acceptance of a new version is a new INSERT, never an UPDATE.
--
-- Privacy: consent_log and tos_acceptance are append-only for end users
-- (INSERT + SELECT on own rows only; no UPDATE/DELETE policies). Users can
-- never rewrite their own consent history; deletion happens via the account
-- delete cascade.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. consent_log: per-connection explicit consent events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('simplefin', 'plaid')),
  version text NOT NULL DEFAULT 'v1.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert own consent" ON public.consent_log;
CREATE POLICY "insert own consent" ON public.consent_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "select own consent" ON public.consent_log;
CREATE POLICY "select own consent" ON public.consent_log
  FOR SELECT USING (auth.uid() = user_id);
-- No UPDATE/DELETE policies: consent history is append-only for end users.

CREATE INDEX IF NOT EXISTS consent_log_user_kind_idx
  ON public.consent_log (user_id, kind, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. tos_acceptance: which ToS version each user accepted, and when
--    Append-only: UNIQUE (user_id, tos_version). Accepting a new version is
--    an INSERT of a new row; history is never rewritten.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tos_acceptance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tos_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tos_version)
);

ALTER TABLE public.tos_acceptance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert own tos acceptance" ON public.tos_acceptance;
CREATE POLICY "insert own tos acceptance" ON public.tos_acceptance
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "select own tos acceptance" ON public.tos_acceptance;
CREATE POLICY "select own tos acceptance" ON public.tos_acceptance
  FOR SELECT USING (auth.uid() = user_id);
-- No UPDATE/DELETE policies: acceptance history is append-only for end users.

CREATE INDEX IF NOT EXISTS tos_acceptance_user_idx
  ON public.tos_acceptance (user_id, accepted_at DESC);

-- ---------------------------------------------------------------------------
-- 3. profiles.dob: nullable DOB for the 18+ signup gate, server-enforced
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dob date;

-- Server-side 18+ enforcement: a profiles row can never hold a minor's DOB.
-- NULL stays allowed (existing users grandfathered; they accept the 18+
-- ToS representation at next sign-in).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_dob_adult') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_dob_adult
      CHECK (dob IS NULL OR dob <= (CURRENT_DATE - INTERVAL '18 years')::date);
  END IF;
END
$$;
