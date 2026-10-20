// The scheduled alerts run (WO-007b), as a function of its inputs so it is testable without a database. pg_cron calls it
// every 5 minutes (scripts/launch/schedule-career-proactive.sql, run by the owner) with the shared secret. It plans and
// queues alerts and reports (career_outbox, once per key); delivery is the texting channel's (WO-013). Every run is
// recorded so a silent stop is visible.
import { equalSecret } from "../_shared/message_service.ts";
import { runAlerts, runCards, runMail, runReceipts, type ReadyRow, type RunStats } from "../_shared/career_proactive_run.ts";
import type { ReceiptRow } from "../_shared/career_apply_receipts.ts";
import type { AlertStore, Outbox } from "../_shared/career_alert_store.ts";
import type { MailStore } from "../_shared/career_mail_store.ts";
import type { ReadResult } from "../_shared/career_mail_gmail.ts";
import type { EventStore } from "../_shared/agent/timeline.ts";

export interface ProactiveDeps {
  env: { get(k: string): string | undefined };
  store: () => AlertStore & Outbox;
  recentPostings: (sinceIso: string) => Promise<any[]>;
  postingsById: (ids: string[]) => Promise<any[]>;
  // Applications that finished since a time (career_apply_jobs), for their receipts. Absent: no receipts this run.
  finishedApplications?: (sinceIso: string) => Promise<ReceiptRow[]>;
  // Applications prepared on the person's computer, not yet shown, and the push of one card (WO-022 step 3). Absent: no
  // cards this run.
  readyApplications?: () => Promise<ReadyRow[]>;
  pushCard?: (userId: string, ids: string[], text: string) => Promise<string | null>;
  // Mail tracking (WO-024): where events, drafts and cursors live, and the read of one person's new mail. Absent: no mail
  // is read this run. Nothing here sends mail.
  mail?: { store: () => MailStore; read: (userId: string, sinceMs: number, nowMs: number) => Promise<ReadResult> };
  // The account timeline each receipt is also written to (WO-027). Absent: receipts only.
  events?: () => EventStore;
  // WO-033: approved outreach, one send per person per run, and the replies on threads already sent. Absent: none.
  // A failure here is reported in the run's answer and never stops the alerts.
  outreach?: (now: number) => Promise<Record<string, unknown>>;
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
    if (d.finishedApplications) stats.receipts = await runReceipts({ outbox: store, now: started, finished: d.finishedApplications, events: d.events ? d.events() : null });
    if (d.readyApplications && d.pushCard) stats.cards = await runCards({ now: started, ready: d.readyApplications, push: d.pushCard });
    if (d.mail) {
      const m = await runMail({ outbox: store, now: started, store: d.mail.store(), read: d.mail.read });
      stats.statuses = m.statuses;
      stats.followups = m.followups;
    }
    const outreach = d.outreach ? await d.outreach(started).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })) : null;
    const ms = d.now() - started;
    await d.recordRun({ ...stats, ms, error: null, at });
    return json({ ...stats, ...(outreach ? { outreach } : {}), ms });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("career-proactive failed:", error);
    try { await d.recordRun({ users: 0, alerts: 0, held: 0, reports: 0, duplicates: 0, postings: 0, ms: d.now() - started, error, at }); } catch { /* the failure is already logged */ }
    return json({ error: "alerts run failed", detail: error }, 500);
  }
}
