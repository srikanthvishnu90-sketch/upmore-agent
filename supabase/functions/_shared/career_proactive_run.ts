// One scheduled alerts run (WO-007b), over injected stores so it runs the same in the function, the simulator and tests:
// everyone with alerts on, the postings first seen in the last 26 hours (plus anything held back for a report), the plan
// from career_alerts.ts, the outbox written once per key, and each person's counters saved. Counters: alerts sent count
// against the person's local day (reset when their date changes); held postings are kept until a report carries them;
// last_checked_at moves to this run, so a posting is alerted at most once.
// WO-037, enforced here rather than trusted from the plan: an alert is queued only if its posting passes the person's
// own gate again at the moment of queuing (matchPosting: their keywords, place and relevance floor; and news, not
// backlog), so nothing below the person's threshold is ever sent; and the weekly cap is counted from the outbox (a store
// that cannot count sends no alerts). Each alert carries its posting's first_seen_at, for the latency report.
import { DEFAULT_PREFS, matchPosting, planProactive, quietAt } from "./career_alerts.ts";
import { freshWhenSeen } from "./career_ingest.ts";
import type { AlertRow, AlertStore, Outbox } from "./career_alert_store.ts";
import { planReceipts, type ReceiptRow } from "./career_apply_receipts.ts";
import { cardFor, type Prepared } from "./career_apply_cards.ts";
import { type EventStore, recordEvent } from "./agent/timeline.ts";

export interface RunStats { users: number; alerts: number; held: number; reports: number; duplicates: number; postings: number; receipts?: number; cards?: number; below_threshold?: number }
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
  // A new local day starts the person's count over. The last 7 days' alerts count against the weekly cap; a store that
  // cannot say how many were sent leaves no room (Infinity), so a counting failure never turns into a flood.
  const week = o.store.alertsSince ? await o.store.alertsSince(new Date(o.now - 7 * 86400000).toISOString()) : null;
  const users: AlertRow[] = rows.map((r) => ({ ...r, instant_sent_today: r.sent_on === localDate(o.now, r.tz) ? r.instant_sent_today : 0,
    sent_this_week: week ? week.get(r.id) ?? 0 : Infinity }));
  const byId = new Map(postings.map((p) => [p.job_id, p]));
  const plan = planProactive({ users, postings, now: o.now });
  for (const u of users) {
    const mine = plan.filter((p) => p.userId === u.id);
    let sent = 0;
    const held = new Set(u.held || []);
    let reported = false;
    for (const p of mine) {
      if (p.kind === "held") { held.add(p.job_id); stats.held++; continue; }
      let firstSeen: string | undefined;
      if (p.kind === "alert") {
        const posting = byId.get(p.job_id);
        if (!posting || !freshWhenSeen(posting) || !matchPosting(posting, u.prefs)) { stats.below_threshold = (stats.below_threshold ?? 0) + 1; continue; }
        const seen = Date.parse(String(posting.first_seen_at ?? ""));
        if (Number.isFinite(seen)) firstSeen = new Date(seen).toISOString();
      }
      const fresh = await o.outbox.enqueue(u.id, { key: p.key, kind: p.kind, text: p.text, at: p.at, ...(firstSeen ? { first_seen_at: firstSeen } : {}) });
      if (!fresh) { stats.duplicates++; continue; }
      if (p.kind === "alert") { sent++; stats.alerts++; } else { reported = true; stats.reports++; }
    }
    const today = localDate(o.now, u.tz);
    const { sent_this_week: _week, ...row } = u;
    await o.store.save({
      ...row, last_checked_at: new Date(o.now).toISOString(),
      instant_sent_today: u.instant_sent_today + sent, sent_on: today,
      held: reported ? [] : [...held], // a report lists what was held; after it, nothing is held
      last_report_on: reported ? today : u.last_report_on,
    });
  }
  return stats;
}

// Receipts (WO-021 step 5): every application that finished in the last 26 hours, said once (the outbox keeps one text
// per receipt:<id>, ever), whether or not the person has job alerts on. Returns how many were queued now.
// WO-027: a receipt queued for the first time is also written to the person's timeline (application_finished, once,
// since the outbox key is once ever); a timeline that cannot be written never stops a receipt.
export async function runReceipts(o: { outbox: Outbox; now: number; finished: (sinceIso: string) => Promise<ReceiptRow[]>; events?: EventStore | null }): Promise<number> {
  const rows = await o.finished(new Date(o.now - 26 * 3600000).toISOString());
  const byId = new Map(rows.map((r) => [`receipt:${r.id}`, r]));
  let n = 0;
  for (const r of planReceipts(rows, o.now)) {
    if (!(await o.outbox.enqueue(r.userId, { key: r.key, kind: r.kind, text: r.text, at: r.at }))) continue;
    n++;
    const row = byId.get(r.key);
    await recordEvent(o.events, {
      user_id: r.userId, at: o.now, kind: "application_finished", subject: row?.company ?? "",
      detail: { application: row?.id ?? null, state: row?.state ?? null, url: row?.url ?? null, reason: row?.reason ?? null, confirmation_id: row?.confirmation_id ?? null },
      source: "receipt",
    });
  }
  return n;
}

// The card of prepared applications (WO-022 step 3), shown in the person's texting thread without being asked for. A batch
// counts once it has settled (nothing prepared in the last 10 minutes, so one batch is not split across cards), never in
// the person's quiet hours, one card per person per run, oldest first. The database decides the rest in one transaction
// (career_apply_card_push_for): no texting thread or a STOP, a card still open, a conversation under way, or a text that
// does not carry every line pushes nothing. One person's failure does not stop the others; the run then records it.
export interface ReadyRow extends Prepared { user_id: string; created_at: string; tz?: string | null; quiet_start?: number; quiet_end?: number }
export const CARD_SETTLE_MS = 10 * 60000;
export async function runCards(o: {
  now: number; ready: () => Promise<ReadyRow[]>; push: (userId: string, ids: string[], text: string) => Promise<string | null>;
}): Promise<number> {
  const byUser = new Map<string, ReadyRow[]>();
  for (const r of await o.ready()) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  let pushed = 0;
  const failed: string[] = [];
  for (const [userId, rows] of byUser) {
    rows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    if (Date.parse(rows[rows.length - 1].created_at) > o.now - CARD_SETTLE_MS) continue;
    const first = rows[0];
    const quiet = { quiet_start: first.quiet_start ?? DEFAULT_PREFS.quiet_start, quiet_end: first.quiet_end ?? DEFAULT_PREFS.quiet_end };
    if (quietAt(o.now, first.tz || "America/New_York", quiet)) continue;
    // An application too long for a text is left for "show my applications" (which says so); it never holds back the rest.
    const c = cardFor(rows.filter((r) => { const one = cardFor([r]); return one !== null && "take" in one; }));
    if (!c || !("take" in c)) continue;
    try {
      if (await o.push(userId, c.take.map((p) => p.id), c.text)) pushed++;
    } catch (e) {
      failed.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (failed.length) throw new Error(`card push failed for ${failed.length} people (${pushed} pushed): ${failed[0]}`);
  return pushed;
}
