// Brokerage connect, step 1: the signed-in person taps Connect; this returns the broker's own approval URL.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { corsFor } from "../agent-chat/_shared/chat_cors.ts";
import { connectDb, connectEnv, handleStart } from "../_shared/broker_connect.ts";

serve((req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return handleStart(req, {
    env: connectEnv((k) => Deno.env.get(k)),
    cors: corsFor(req),
    user: async (jwt) => { const { data } = await anon.auth.getUser(jwt); return data && data.user ? { id: data.user.id } : null; },
    db: connectDb(admin),
  });
});
