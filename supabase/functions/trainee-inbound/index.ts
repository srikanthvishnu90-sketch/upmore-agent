// trainee-inbound (WO-013b-2): LoopMessage's inbound webhook. Logic and tests: ./handler.ts, tests/edge/channel-inbound.test.ts.
// Deploy with --no-verify-jwt: LoopMessage cannot send an Authorization header; the 32+ character secret is the gate.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { deliverDue } from "../_shared/channel.ts";
import { supabaseChannelStore } from "../_shared/channel_store.ts";
import { loopSend } from "../_shared/loopmessage.ts";
import { DEFAULT_DAILY_CONTACTS } from "../trainee-deliver/handler.ts";
import { handleInbound } from "./handler.ts";
import { supabaseInboundStore } from "./store.ts";

serve((req) => {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response(JSON.stringify({ error: "not configured: Supabase URL or service key missing" }), { status: 503, headers: { "content-type": "application/json" } });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const cap = Number(Deno.env.get("LOOPMESSAGE_DAILY_CONTACTS") || DEFAULT_DAILY_CONTACTS);
  return handleInbound(req, {
    env: Deno.env, now: Date.now, store: () => supabaseInboundStore(admin), send: (apiKey) => loopSend({ apiKey }),
    // The turn runs as the person through agent-chat's service-role path, so history, erase, the host's STOP and pause,
    // persistence and the hourly turn limit are the chat's own.
    chat: async (a) => {
      const res = await fetch(`${url}/functions/v1/agent-chat`, {
        method: "POST", signal: AbortSignal.timeout(120000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ as_user_id: a.userId, message: a.message, turn_key: a.turnKey, ...(a.threadId ? { thread_id: a.threadId } : {}) }),
      });
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (res.status === 429) return { status: 429, reply: String(body.message || "Slow down a little, then try again."), threadId: null };
      if (!res.ok) throw new Error(`agent-chat HTTP ${res.status}`);
      return { status: res.status, reply: String(body.reply ?? ""), threadId: typeof body.thread_id === "string" ? body.thread_id : null };
    },
    deliverReply: async (a) => {
      const store = supabaseChannelStore(admin, { only: { userId: a.userId, key: a.key } });
      await deliverDue({ store, send: loopSend({ apiKey: a.apiKey }), now: a.now, limit: 1, dailyContactCap: Number.isInteger(cap) && cap > 0 ? cap : DEFAULT_DAILY_CONTACTS });
      await store.release();
    },
  });
});
