-- Upmore migration 20261008_000002: service-role rate-limit bump.
--
-- The hardened agent_rl_bump derives the user from auth.uid() and returns
-- false when it is null — which is always the case for service_role callers
-- (the service_role JWT has no sub claim). The iMessage test bridge runs
-- turns as an explicit user via the service_role key, so it needs a variant
-- that takes the user id explicitly.
--
-- Security: executable ONLY by service_role (our own backend, which supplies
-- p_user explicitly). Never granted to anon/authenticated/PUBLIC, so the
-- "never trust p_user" property of the hardened limiter is preserved for all
-- client-facing paths.
CREATE OR REPLACE FUNCTION public.agent_rl_bump_as(p_user uuid, p_limit integer)
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

REVOKE ALL ON FUNCTION public.agent_rl_bump_as(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_rl_bump_as(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.agent_rl_bump_as(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rl_bump_as(uuid, integer) TO service_role;
