// FEATURE NEEDS (2026-10-26): Gmail connect from any channel. The link "connect gmail" sends (GET peeks, POST goes to
// Google) and Google's redirect back (GET ?state&code). Public by necessity: deploy with --no-verify-jwt; the one-time
// token and the signed state are the authentication (_shared/career_connect_flow.ts). Its URL is the OAuth client's
// redirect URI: <SUPABASE_URL>/functions/v1/career-connect.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { handleConnect } from "../_shared/career_connect_flow.ts";
import { deliverer } from "../_shared/channel_runtime.ts";

serve((req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return handleConnect(req, { admin, env: Deno.env, fetch, deliver: deliverer(admin, Deno.env), log: (l) => console.log(l) });
});
