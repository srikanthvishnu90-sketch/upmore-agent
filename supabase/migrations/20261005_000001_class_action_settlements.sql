-- Class action settlements directory: verified open settlements the agent can
-- match against the user's scenario. Every row must be a REAL settlement with
-- a REAL claim deadline and the OFFICIAL court-appointed administrator URL.
-- Never seed aggregator/blog URLs as claim URLs.

CREATE TABLE IF NOT EXISTS public.class_action_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  case_name text,
  category text NOT NULL DEFAULT 'consumer',
  summary text NOT NULL,
  eligibility text NOT NULL,
  eligibility_states text[] NOT NULL DEFAULT '{}',
  claim_deadline date NOT NULL,
  payout_summary text NOT NULL,
  proof_required text NOT NULL DEFAULT 'none',
  claim_url text NOT NULL,
  settlement_site_url text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  verified_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.class_action_settlements ENABLE ROW LEVEL SECURITY;

-- Settlements are public data: any signed-in user can read them.
DROP POLICY IF EXISTS settlements_read_all ON public.class_action_settlements;
CREATE POLICY settlements_read_all ON public.class_action_settlements
  FOR SELECT USING (auth.role() = 'authenticated');

-- Writes are admin-only (service role bypasses RLS).
DROP POLICY IF EXISTS settlements_no_user_write ON public.class_action_settlements;
CREATE POLICY settlements_no_user_write ON public.class_action_settlements
  FOR ALL USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_settlements_deadline
  ON public.class_action_settlements (claim_deadline)
  WHERE status = 'open';
