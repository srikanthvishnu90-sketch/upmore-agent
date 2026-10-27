// trainee-whatsapp (WO-038): the WhatsApp Cloud API webhook. Logic and tests: ./handler.ts, tests/architect/wo-038-channels.test.ts.
// Deploy with --no-verify-jwt: Meta sends no Authorization header; the verify token (GET) and the app secret's signature
// (POST) are the gate.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { chatThroughAgent, deliverer } from "../_shared/channel_runtime.ts";
import { supabaseInboundStore } from "../trainee-inbound/store.ts";
import { handleWhatsApp } from "./handler.ts";
// E-15: the turn runs after the provider has its 200 (Supabase's background tasks: EdgeRuntime.waitUntil keeps the worker
// until the promise settles, within the plan's wall-clock limit). Where the runtime has none, the turn runs before the answer.
// deno-lint-ignore no-explicit-any
const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil?.bind((globalThis as any).EdgeRuntime) as ((p: Promise<unknown>) => void) | undefined;

serve((req) => {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response(JSON.stringify({ error: "not configured: Supabase URL or service key missing" }), { status: 503, headers: { "content-type": "application/json" } });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const deliverNow = deliverer(admin, Deno.env);
  return handleWhatsApp(req, {
    env: Deno.env, now: Date.now, store: () => supabaseInboundStore(admin), chat: chatThroughAgent(url, key),
    admin, // 2026-10-26: the card's reply buttons are answered as Telegram's taps (channel_card_tap.ts)
    ...(waitUntil ? { defer: waitUntil } : {}),
    // Everything due for the person, oldest first: what waited for the window goes out before the answer.
    deliver: (a) => deliverNow({ userId: a.userId, key: a.key, now: a.now, wholeUser: true }),
  });
});
