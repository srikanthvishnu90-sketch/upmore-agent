// trainee-file: hosted job match file / application proof file pages. Logic and tests: ./handler.ts, tests/architect/file-page.test.ts.
// Deployed with verify_jwt = false: the signed, expiring, single-user token in the link is the credential. Supabase serves an
// edge function's HTML as text/plain on its own domain, so people open it through the site's /file rewrite (api/file.js).
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { supabaseTapStore } from "../_shared/channel_card_tap.ts";
import { supabaseEventStore } from "../_shared/agent/timeline.ts";
import { supabaseCardStore } from "../_shared/career_apply_cards.ts";
import { supabaseFileStore, supabaseUserOfTelegram } from "./store.ts";
import { handleFile } from "./handler.ts";

serve((req) => {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response("not configured", { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  return handleFile(req, { store: supabaseFileStore(admin), cards: supabaseCardStore(admin), tap: supabaseTapStore(admin), now: Date.now, env: Deno.env, events: supabaseEventStore(admin), userOfTelegram: supabaseUserOfTelegram(admin) });
});
