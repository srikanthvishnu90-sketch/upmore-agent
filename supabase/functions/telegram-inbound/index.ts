// Trainee Telegram test bridge (TEST ONLY) — see _shared/telegram.ts for the
// full posture. Thin serve wrapper: wires the real Supabase admin client and
// Deno env into the shared handler. verify_jwt is OFF for this ingress on
// purpose: Telegram sends no Supabase JWT; the X-Telegram-Bot-Api-Secret-Token
// header + the config-driven sender allowlist are the security boundary.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm";
import { handleTelegramWebhook } from "../_shared/telegram_bridge.ts";

serve((req) =>
  handleTelegramWebhook(req, {
    env: (k) => Deno.env.get(k),
    fetchFn: fetch,
    createAdmin: () =>
      createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
  })
);
