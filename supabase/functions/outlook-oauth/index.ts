// M4 (2026-10-27): Outlook connect from any channel. The link "connect my outlook" sends (GET peeks, POST goes to Microsoft
// with PKCE), Microsoft's redirect back (GET ?state&code), and the leased batch run (POST JSON with x-outlook-jobs-secret).
// Public by necessity (verify_jwt = false, deployed by go-live with --no-verify-jwt): the one-time token, the signed state
// and the jobs secret are the authentication (_shared/outlook_connector.ts). Its URL is the Azure app's redirect URI:
// <SUPABASE_URL>/functions/v1/outlook-oauth.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { handleOutlookOAuth } from "../_shared/outlook_connector.ts";
import { deliverer } from "../_shared/channel_runtime.ts";

serve((req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return handleOutlookOAuth(req, { admin, env: Deno.env, fetch, deliver: deliverer(admin, Deno.env), log: (l) => console.log(l) });
});
