// career-proactive (WO-007b): the scheduled job-alerts run. Logic and tests: ./handler.ts, tests/edge/career-proactive.test.ts.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { supabaseAlertStore } from "../_shared/career_alert_store.ts";
import { supabasePostingsDb } from "../_shared/career_ingest.ts";
import { handleProactive } from "./handler.ts";

serve((req) => {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response(JSON.stringify({ error: "not configured: Supabase URL or service key missing" }), { status: 503, headers: { "content-type": "application/json" } });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const postings = supabasePostingsDb(admin);
  return handleProactive(req, {
    env: Deno.env, now: Date.now, store: () => supabaseAlertStore(admin),
    recentPostings: (since) => postings.newSince(since), postingsById: (ids) => postings.getMany(ids),
    recordRun: async (r) => { const { error } = await admin.from("career_proactive_runs").insert({ run_at: r.at, users: r.users, alerts: r.alerts, held: r.held, reports: r.reports, duplicates: r.duplicates, postings: r.postings, ms: r.ms, error: r.error }); if (error) throw new Error(`record run: ${error.message}`); },
  });
});
