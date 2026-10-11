// The agent speaks first: an hourly run (pg_cron -> pg_net POST with PROACTIVE_SECRET) that delivers alerts, the weekly
// recap, the monthly close, the morning brief and the person's standing reports into their "Updates from Upmore" chat
// thread. Deploy with --no-verify-jwt (the secret header is the authentication). Logic and tests: _shared/proactive.ts,
// tests/edge/proactive.test.ts.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { handleProactive, supabaseProactiveStore } from "../_shared/proactive.ts";

serve((req) => handleProactive(req, { env: Deno.env, store: supabaseProactiveStore(createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)) }));
