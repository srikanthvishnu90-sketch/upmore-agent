// The scheduled alerts run (WO-007b), as a function of its inputs so it is testable without a database. pg_cron calls it
// every 5 minutes (scripts/launch/schedule-career-proactive.sql, run by the owner) with the shared secret. It plans and
// queues alerts and reports (career_outbox, once per key); delivery is the texting channel's (WO-013). Every run is
// recorded so a silent stop is visible.
import { equalSecret } from "../_shared/message_service.ts";
import { runAlerts, runReceipts, type RunStats } from "../_shared/career_proactive_run.ts";
import type { ReceiptRow } from "../_shared/career_apply_receipts.ts";
import type { AlertStore, Outbox } from "../_shared/career_alert_store.ts";

export interface ProactiveDeps {
  env: { get(k: string): string | undefined };
  store: () => AlertStore & Outbox;
  recentPostings: (sinceIso: string) => Promise<any[]>;
  postingsById: (ids: string[]) => Promise<any[]>;
  // Applications that finished since a time (career_apply_jobs), for their receipts. Absent: no receipts this run.
  finishedApplications?: (sinceIso: string) => Promise<ReceiptRow[]>;
  recordRun: (r: RunStats & { ms: number; error: string | null; at: string }) => Promise<void>;
  now: () => number;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function handleProactive(req: Request, d: ProactiveDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = d.env.get("CAREER_PROACTIVE_SECRET") || "";
  if (secret.length < 32) return json({ error: "not configured: CAREER_PROACTIVE_SECRET must be set, 32 characters or more" }, 503);
  if (!equalSecret(req.headers.get("x-trainee-proactive-secret") || "", secret)) return json({ error: "Unauthorized" }, 401);
  const started = d.now(), at = new Date(started).toISOString();
  const store = d.store();
  try {
    const stats: RunStats = await runAlerts({ store, outbox: store, now: started, recentPostings: d.recentPostings, postingsById: d.postingsById });
    if (d.finishedApplications) stats.receipts = await runReceipts({ outbox: store, now: started, finished: d.finishedApplications });
    const ms = d.now() - started;
    await d.recordRun({ ...stats, ms, error: null, at });
    return json({ ...stats, ms });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("career-proactive failed:", error);
    try { await d.recordRun({ users: 0, alerts: 0, held: 0, reports: 0, duplicates: 0, postings: 0, ms: d.now() - started, error, at }); } catch { /* the failure is already logged */ }
    return json({ error: "alerts run failed", detail: error }, 500);
  }
}
