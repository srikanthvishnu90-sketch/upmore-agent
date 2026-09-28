-- Upmore migration 20260925_000001: SimpleFIN owner scoping.
-- The vaulted Access URL is a single global secret; without an owner table,
-- ANY authenticated user could read the owner's bank data through the proxy.
-- This table records which user_id owns the connection; the proxy enforces it.

CREATE TABLE IF NOT EXISTS public.simplefin_connections (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_label text NOT NULL DEFAULT 'SimpleFIN Bridge',
  connected_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.simplefin_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_simplefin_connections ON public.simplefin_connections;
CREATE POLICY own_simplefin_connections ON public.simplefin_connections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Request log for the <=24 req/day proxy budget.
CREATE TABLE IF NOT EXISTS public.simplefin_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.simplefin_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_simplefin_requests ON public.simplefin_requests;
CREATE POLICY own_simplefin_requests ON public.simplefin_requests
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS simplefin_requests_user_day
  ON public.simplefin_requests (user_id, requested_at DESC);
