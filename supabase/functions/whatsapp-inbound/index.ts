// Trainee WhatsApp test bridge (TEST ONLY, Twilio sandbox shape) — see
// _shared/whatsapp_twilio.ts for the full posture, including the LoopMessage
// WhatsApp production-parity follow-up. Thin serve wrapper: wires the real
// Supabase admin client and Deno env into the shared handler. verify_jwt is
// OFF for this ingress on purpose: Twilio sends no Supabase JWT; the
// X-Twilio-Signature validation + the config-driven sender allowlist are the
// security boundary.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm";
import { handleWhatsappWebhook } from "../_shared/whatsapp_twilio.ts";

serve((req) =>
  handleWhatsappWebhook(req, {
    env: (k) => Deno.env.get(k),
    fetchFn: fetch,
    createAdmin: () =>
      createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
  })
);
