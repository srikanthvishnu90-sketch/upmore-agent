// Guided manual connect: the live sign-in window and the session store (owner addendum 2026-10-11; decision 1: no
// password storage, session-only). POST, signed-in (verify_jwt on); the person is the verified JWT's user. Actions:
// status, consent, start, check, read, disconnect. Logic and contract: _shared/manual_connect.ts; the window:
// _shared/manual_browser.ts (Browserbase; without BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID every window step
// answers 503 NOT_WIRED). Tests: tests/edge/manual-connect.test.ts. CORS: the app's own origins only.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { financeCorsFor as corsFor } from "../agent-chat/_shared/chat_cors.ts";
import { handleManualConnect, manualDb } from "../_shared/manual_connect.ts";
import { browserbaseBrowser } from "../_shared/manual_browser.ts";

serve((req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return handleManualConnect(req, {
    cors: corsFor(req),
    user: async (jwt) => { const { data } = await anon.auth.getUser(jwt); return data && data.user ? { id: data.user.id } : null; },
    db: manualDb(admin),
    browser: browserbaseBrowser(Deno.env),
  });
});
