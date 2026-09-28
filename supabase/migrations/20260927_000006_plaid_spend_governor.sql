-- Upmore migration 20260927_000006: Plaid spend governor + founder alerts.
-- Founder order 2026-09-27: "implement everything so we're not getting bombed
-- with recurring charges." Vendor-cost armor for metered bills (Plaid
-- pay-as-you-go, AI). The server is the authority; the UI mirrors it.
--
-- Plaid pricing (founder's dashboard, pay-as-you-go):
--   Investments Holdings    $0.18 / item / month  (accrues per connected item)
--   Investments Transactions $0.35 / item / month  (not consumed by Upmore —
--                                    we only call /investments/holdings/get,
--                                    so only the Holdings fee is accrued)
--   Investments Refresh     $0.12 / successful call (on-demand
--                                    /investments/refresh add-on)
--
-- Policy shipped (enforced in supabase/functions/plaid):
--   - Auto holdings refresh: at most weekly per item (cache served otherwise).
--   - Manual refresh: max 1 per item per 24h.
--   - Hard per-user cap: $3.00/month. Over cap -> 429 {error:"plaid_cap",
--     cached:true} and last cached holdings are served.
--   - Every billable event writes to plaid_spend_ledger. Monthly item fees
--     accrue once per item per calendar month on the first holdings call.
--   - Founder alert: any user crossing 80% of cap -> founder_alerts row.
--
-- Also creates report_ai_anomaly() for the agent-chat AI tripwire (450
-- calls/month or 100 calls/day -> founder_alerts row, once per user per day).
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. founder_alerts: service_role / SECURITY DEFINER only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.founder_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  user_id uuid NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.founder_alerts ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role and SECURITY DEFINER functions can write or
-- read. End users can never see other users' alerts.

CREATE INDEX IF NOT EXISTS founder_alerts_kind_user_idx
  ON public.founder_alerts (kind, user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. plaid_spend_ledger: every billable Plaid event, per user per month
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plaid_spend_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id text NOT NULL DEFAULT 'default',
  kind text NOT NULL CHECK (kind IN ('item_month', 'refresh')),
  cost_cents integer NOT NULL CHECK (cost_cents > 0),
  period_month text NOT NULL,  -- YYYY-MM
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plaid_spend_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own plaid spend" ON public.plaid_spend_ledger;
CREATE POLICY "own plaid spend" ON public.plaid_spend_ledger
  FOR SELECT USING (auth.uid() = user_id);
-- No write policies: only service_role / SECURITY DEFINER (the plaid edge
-- function) may insert.

-- Idempotent monthly accrual: one item_month row per item per month.
CREATE UNIQUE INDEX IF NOT EXISTS plaid_spend_ledger_item_month_uniq
  ON public.plaid_spend_ledger (user_id, item_id, period_month)
  WHERE kind = 'item_month';

CREATE INDEX IF NOT EXISTS plaid_spend_ledger_user_period_idx
  ON public.plaid_spend_ledger (user_id, period_month);

-- ---------------------------------------------------------------------------
-- 3. plaid_holdings_cache: last good holdings per user (served when capped or
--    within the weekly auto-refresh window)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plaid_holdings_cache (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id text NOT NULL DEFAULT 'default',
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plaid_holdings_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own plaid cache" ON public.plaid_holdings_cache;
CREATE POLICY "own plaid cache" ON public.plaid_holdings_cache
  FOR SELECT USING (auth.uid() = user_id);
-- Writes go through service_role (the plaid edge function) only.

-- ---------------------------------------------------------------------------
-- 4. plaid_month_spend(): month-to-date Plaid spend in cents
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plaid_month_spend(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;
  -- Authenticated callers may only read their own spend. service_role
  -- (auth.uid() IS NULL) may read anyone's — the edge function needs that.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'can only read your own plaid spend';
  END IF;
  RETURN (
    SELECT COALESCE(SUM(cost_cents), 0)::integer
    FROM public.plaid_spend_ledger
    WHERE user_id = p_user_id
      AND period_month = to_char(now(), 'YYYY-MM')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.plaid_month_spend(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plaid_month_spend(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. report_ai_anomaly(): AI tripwire for agent-chat (service of the founder)
-- ---------------------------------------------------------------------------
-- Called by the agent-chat edge function when a user crosses 450 model calls
-- in a calendar month OR 100 in a day. Inserts one founder_alerts row per
-- user per day (no spam). No behavior change for the user.
CREATE OR REPLACE FUNCTION public.report_ai_anomaly(
  p_user_id uuid, p_month_calls integer, p_day_calls integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.founder_alerts
    WHERE kind = 'ai_anomaly'
      AND user_id = p_user_id
      AND created_at >= date_trunc('day', now())
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.founder_alerts (kind, user_id, detail)
  VALUES (
    'ai_anomaly', p_user_id,
    jsonb_build_object(
      'user_id', p_user_id,
      'calls_month', p_month_calls,
      'calls_day', p_day_calls
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_ai_anomaly(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_ai_anomaly(uuid, integer, integer) TO authenticated;
