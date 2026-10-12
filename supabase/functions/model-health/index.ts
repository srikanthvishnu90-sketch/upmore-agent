// Model health for an uptime monitor: GET /functions/v1/model-health?probe=1&token=<HEALTH_CHECK_TOKEN>. 200 when the
// AI provider answers, 503 (and a founder_alerts row) when it does not. Public by necessity (a monitor carries no Upmore
// JWT); the token is the authentication. Deploy with --no-verify-jwt. Logic and tests: _shared/model_health.ts,
// tests/edge/model-health.test.ts.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { handleHealth } from "../_shared/model_health.ts";

serve((req) => handleHealth(req, { env: Deno.env, admin: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!) }));
