// One scheduled alerts run (WO-007b), over injected stores so it runs the same in the function, the simulator and tests:
// everyone with alerts on, the postings first seen in the last 26 hours (plus anything held back for a report), the plan
// from career_alerts.ts, the outbox written once per key, and each person's counters saved. Counters: alerts sent count
// against the person's local day (reset when their date changes); held postings are kept until a report carries them;
// last_checked_at moves to this run, so a posting is alerted at most once.
import { planProactive } from "./career_alerts.ts";
import type { AlertRow, AlertStore, Outbox } from "./career_alert_store.ts";
import { planReceipts, type ReceiptRow } from "./career_apply_receipts.ts";

export interface RunStats { users: number; alerts: number; held: number; reports: number; duplicates: number; postings: number; receipts?: number }
const localDate = (at: number, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));

export async function runAlerts(o: {
  store: AlertStore; outbox: Outbox; now: number;
  recentPostings: (sinceIso: string) => Promise<any[]>; postingsById: (ids: string[]) => Promise<any[]>;
}): Promise<RunStats> {
  const stats: RunStats = { users: 0, alerts: 0, held: 0, reports: 0, duplicates: 0, postings: 0 };
  const rows = await o.store.active();
  stats.users = rows.length;
  if (!rows.length) return stats;
  const recent = await o.recentPostings(new Date(o.now - 26 * 3600000).toISOString());
  const have = new Set(recent.map((p) => p.job_id));
  const heldIds = [...new Set(rows.flatMap((r) => r.held || []))].filter((id) => !have.has(id));
  const postings = heldIds.length ? [...recent, ...(await o.postingsById(heldIds.slice(0, 2000)))] : recent;
  stats.postings = postings.length;
  // A new local day starts the person's count over.
  const users: AlertRow[] = rows.map((r) => ({ ...r, instant_sent_today: r.sent_on === localDate(o.now, r.tz) ? r.instant_sent_today : 0 }));
  const plan = planProactive({ users, postings, now: o.now });
  for (const u of users) {
    const mine = plan.filter((p) => p.userId === u.id);
    let sent = 0;
    const held = new Set(u.held || []);
    let reported = false;
    for (const p of mine) {
      if (p.kind === "held") { held.add(p.job_id); stats.held++; continue; }
      const fresh = await o.outbox.enqueue(u.id, { key: p.key, kind: p.kind, text: p.text, at: p.at });
      if (!fresh) { stats.duplicates++; continue; }
      if (p.kind === "alert") { sent++; stats.alerts++; } else { reported = true; stats.reports++; }
    }
    const today = localDate(o.now, u.tz);
    await o.store.save({
      ...u, last_checked_at: new Date(o.now).toISOString(),
      instant_sent_today: u.instant_sent_today + sent, sent_on: today,
      held: reported ? [] : [...held], // a report lists what was held; after it, nothing is held
      last_report_on: reported ? today : u.last_report_on,
    });
  }
  return stats;
}

// Receipts (WO-021 step 5): every application that finished in the last 26 hours, said once (the outbox keeps one text
// per receipt:<id>, ever), whether or not the person has job alerts on. Returns how many were queued now.
export async function runReceipts(o: { outbox: Outbox; now: number; finished: (sinceIso: string) => Promise<ReceiptRow[]> }): Promise<number> {
  const rows = await o.finished(new Date(o.now - 26 * 3600000).toISOString());
  let n = 0;
  for (const r of planReceipts(rows, o.now)) if (await o.outbox.enqueue(r.userId, { key: r.key, kind: r.kind, text: r.text, at: r.at })) n++;
  return n;
}
