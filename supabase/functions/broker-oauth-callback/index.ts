// Brokerage connect, step 2: the broker sends the person back here with ?code&state. Public by necessity (no Upmore JWT
// on a browser redirect); the signed, single-use state is the authentication. Deploy with --no-verify-jwt.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { connectDb, connectEnv, handleCallback } from "../_shared/broker_connect.ts";

serve((req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return handleCallback(req, { env: connectEnv((k) => Deno.env.get(k)), db: connectDb(admin), log: (l) => console.log(l) });
});
