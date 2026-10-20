// career-proactive (WO-007b): the scheduled job-alerts run. Logic and tests: ./handler.ts, tests/edge/career-proactive.test.ts.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { supabaseAlertStore } from "../_shared/career_alert_store.ts";
import { supabasePostingsDb } from "../_shared/career_ingest.ts";
import { supabaseMailStore } from "../_shared/career_mail_store.ts";
import { careerToken, readMailSince } from "../_shared/career_mail_gmail.ts";
import { supabaseEventStore } from "../_shared/agent/timeline.ts";
import { handleProactive } from "./handler.ts";

serve((req) => {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response(JSON.stringify({ error: "not configured: Supabase URL or service key missing" }), { status: 503, headers: { "content-type": "application/json" } });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const postings = supabasePostingsDb(admin);
  return handleProactive(req, {
    env: Deno.env, now: Date.now, store: () => supabaseAlertStore(admin), events: () => supabaseEventStore(admin),
    recentPostings: (since) => postings.newSince(since), postingsById: (ids) => postings.getMany(ids),
    finishedApplications: async (since) => {
      const { data, error } = await admin.from("career_apply_jobs").select("id,user_id,company,url,state,reason,confirmation_id")
        .in("state", ["confirmed", "submitted_unconfirmed", "needs_user", "failed", "not_submitted", "unknown_outcome"]).gte("updated_at", since).limit(2000);
      if (error) throw new Error(`read finished applications: ${error.message}`);
      return data ?? [];
    },
    readyApplications: async () => {
      const { data, error } = await admin.from("career_apply_prepared").select("id,user_id,company,card_lines,created_at")
        .eq("state", "ready").order("created_at", { ascending: true }).limit(2000);
      if (error) throw new Error(`read prepared applications: ${error.message}`);
      const users = [...new Set((data ?? []).map((r: any) => r.user_id))];
      if (!users.length) return [];
      const prefs = await admin.from("career_alert_prefs").select("user_id,tz,prefs").in("user_id", users);
      if (prefs.error) throw new Error(`read quiet hours: ${prefs.error.message}`);
      const of = new Map((prefs.data ?? []).map((p: any) => [p.user_id, p]));
      return (data ?? []).map((r: any) => {
        const p: any = of.get(r.user_id);
        return { ...r, tz: p?.tz ?? null, quiet_start: p?.prefs?.quiet_start, quiet_end: p?.prefs?.quiet_end };
      });
    },
    pushCard: async (userId, ids, text) => {
      const { data, error } = await admin.rpc("career_apply_card_push_as", { p_user: userId, p_ids: ids, p_text: text });
      if (error) throw new Error(`push a card: ${error.message}`);
      return data ?? null;
    },
    // Mail tracking (WO-024) reads people's mail, so it runs only once the owner turns it on at deploy.
    mail: Deno.env.get("CAREER_MAIL_TRACKING") === "on" ? {
      store: () => supabaseMailStore(admin),
      read: (userId, since, now) => readMailSince({
        fetch,
        token: careerToken({
          env: Deno.env, fetch, now: Date.now,
          connection: async (u) => {
            const { data, error } = await admin.from("user_oauth_connections").select("vault_name,scopes").eq("user_id", u).eq("provider", "google_career").maybeSingle();
            if (error) throw new Error(`read the career grant: ${error.message}`);
            return data ?? null;
          },
          readVault: async (name) => {
            const { data, error } = await admin.rpc("oauth_vault_read", { p_name: name });
            if (error) throw new Error("read the career grant's vault entry");
            return data ? String(data) : null;
          },
          writeVault: async (name, secret) => {
            const { error } = await admin.rpc("oauth_vault_store", { p_name: name, p_secret: secret });
            if (error) throw new Error("save the refreshed career grant");
          },
        }),
      }, userId, since, now),
    } : undefined,
    recordRun: async (r) => { const { error } = await admin.from("career_proactive_runs").insert({ run_at: r.at, users: r.users, alerts: r.alerts, held: r.held, reports: r.reports, duplicates: r.duplicates, postings: r.postings, receipts: r.receipts ?? 0, cards: r.cards ?? 0, statuses: r.statuses ?? 0, followups: r.followups ?? 0, ms: r.ms, error: r.error }); if (error) throw new Error(`record run: ${error.message}`); },
  });
});
