-- Upmore migration 20260923_000006: rate-limiter hardening (audit H1 + H2).
-- H1: drop the permissive ALL policy on agent_rate_limits. The table is
-- written only by the SECURITY DEFINER agent_rl_bump RPC; with RLS enabled
-- and no policies, clients have no direct access (deny by default).
-- H2: agent_rl_bump no longer trusts its p_user argument. It derives the
-- caller from auth.uid() (the verified JWT), so no caller can burn another
-- user's quota via direct RPC. p_user is kept in the signature for
-- compatibility but ignored.
-- Idempotent and zero-downtime: existing callers keep working.

DROP POLICY IF EXISTS rl_agent_rate_limits_own ON public.agent_rate_limits;

CREATE OR REPLACE FUNCTION public.agent_rl_bump(p_user uuid, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count integer;
BEGIN
  -- The caller is whoever the verified JWT says they are. Never trust p_user.
  IF v_user IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO public.agent_rate_limits (user_id, window_start, count)
  VALUES (v_user, now(), 1)
  ON CONFLICT (user_id) DO UPDATE
  SET
    window_start = CASE
      WHEN agent_rate_limits.window_start < now() - interval '60 minutes'
      THEN now()
      ELSE agent_rate_limits.window_start
    END,
    count = CASE
      WHEN agent_rate_limits.window_start < now() - interval '60 minutes'
      THEN 1
      ELSE agent_rate_limits.count + 1
    END
  RETURNING agent_rate_limits.count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_rl_bump(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_rl_bump(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.agent_rl_bump(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rl_bump(uuid, integer) TO service_role;
