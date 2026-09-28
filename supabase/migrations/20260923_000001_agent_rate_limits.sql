-- Upmore migration 20260923_000001: atomic fixed-window rate limiter.
-- The original agent_rl_bump did SELECT ... FOR UPDATE then a separate
-- insert/upsert, which raced on concurrent first requests (count reset to 1).
-- This version is a single atomic upsert: the row lock serializes concurrent
-- calls and the CASE re-evaluates on the latest committed row, so a burst of
-- N concurrent requests always ends at count N, never 1.
-- Idempotent: safe to run on the live DB (replaces the function in place,
-- preserving grants) and on fresh DBs.

CREATE TABLE IF NOT EXISTS public.agent_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.agent_rl_bump(p_user uuid, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.agent_rate_limits (user_id, window_start, count)
  VALUES (p_user, now(), 1)
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

-- Least privilege: only signed-in users (edge functions call with the user's
-- JWT via service_role anyway) and service_role may execute.
REVOKE ALL ON FUNCTION public.agent_rl_bump(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_rl_bump(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.agent_rl_bump(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rl_bump(uuid, integer) TO service_role;

-- The limiter table is service-managed only; no direct client access.
ALTER TABLE public.agent_rate_limits ENABLE ROW LEVEL SECURITY;
