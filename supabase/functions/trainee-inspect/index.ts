// trainee-inspect: the inspect and receipt links of an approval card. Logic and tests: ./handler.ts,
// tests/architect/flow-channel-approvals-pg.test.ts. Deploy with --no-verify-jwt: the 128-bit token is the gate.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { handleInspect, supabaseInspectDeps } from "./handler.ts";

serve((req) => {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response("not configured: Supabase URL or service key missing", { status: 503, headers: { "content-type": "text/plain" } });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  return handleInspect(req, { now: Date.now, ...supabaseInspectDeps(admin) });
});
