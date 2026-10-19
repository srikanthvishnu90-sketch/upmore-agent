// One scheduled alerts run (WO-007b), over injected stores so it runs the same in the function, the simulator and tests:
// everyone with alerts on, the postings first seen in the last 26 hours (plus anything held back for a report), the plan
// from career_alerts.ts, the outbox written once per key, and each person's counters saved. Counters: alerts sent count
// against the person's local day (reset when their date changes); held postings are kept until a report carries them;
// last_checked_at moves to this run, so a posting is alerted at most once.
import { DEFAULT_PREFS, planProactive, quietAt } from "./career_alerts.ts";
import type { AlertRow, AlertStore, Outbox } from "./career_alert_store.ts";
import { planReceipts, type ReceiptRow } from "./career_apply_receipts.ts";
import { cardFor, type Prepared } from "./career_apply_cards.ts";
import { draftOffer, foldEvents, planUpdates } from "./career_mail.ts";
import type { ReadResult } from "./career_mail_gmail.ts";
import type { MailPerson, MailStore } from "./career_mail_store.ts";

export interface RunStats { users: number; alerts: number; held: number; reports: number; duplicates: number; postings: number; receipts?: number; cards?: number; statuses?: number; followups?: number }
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

// Mail tracking (WO-024): for each person with the career Google grant, the mail since their cursor (10 minutes of
// overlap; the first read looks back 3 days), classified in code, each status event recorded once per message, one short
// text per real change, and follow-ups drafted and offered by text. Nothing is ever sent by email: a draft is a row and a
// text that shows it. Texts wait out the person's quiet hours. The least recently read go first, a few at a time, so at
// the 5-minute schedule everyone is read within the hour up to MAIL_PEOPLE_PER_RUN x 12 people. A rate limit keeps what
// was read and moves the cursor only that far. One person's failure does not stop the others; the run then records it.
export const MAIL_PEOPLE_PER_RUN = 200, MAIL_OVERLAP_MS = 10 * 60000, MAIL_FIRST_LOOKBACK_MS = 3 * 86400000;
export interface MailStats { people: number; not_wired: number; statuses: number; followups: number }
function awake(now: number, tz: string | null | undefined, q: { quiet_start?: number; quiet_end?: number }): number {
  const quiet = { quiet_start: q.quiet_start ?? DEFAULT_PREFS.quiet_start, quiet_end: q.quiet_end ?? DEFAULT_PREFS.quiet_end };
  let at = now;
  try { while (quietAt(at, tz || "America/New_York", quiet) && at < now + 86400000) at += 15 * 60000; } catch { return now; }
  return at;
}
export async function runMail(o: {
  outbox: Outbox; now: number; store: MailStore; read: (userId: string, sinceMs: number, nowMs: number) => Promise<ReadResult>; batch?: number;
}): Promise<MailStats> {
  const stats: MailStats = { people: 0, not_wired: 0, statuses: 0, followups: 0 };
  const failed: string[] = [];
  const one = async (p: MailPerson) => {
    const since = p.read_through ? Date.parse(p.read_through) - MAIL_OVERLAP_MS : o.now - MAIL_FIRST_LOOKBACK_MS;
    const r = await o.read(p.user_id, Math.max(since, o.now - 14 * 86400000), o.now);
    if (r.status === "NOT_WIRED") { stats.not_wired++; return; }
    if (r.status === "ERROR") failed.push(r.detail);
    stats.people++;
    const plan = planUpdates(r.mails, foldEvents(await o.store.applications(p.user_id), await o.store.events(p.user_id)), o.now);
    const fresh = await o.store.record(p.user_id, plan.events);
    const at = awake(o.now, p.tz, p);
    for (const t of plan.texts) {
      if (fresh.has(t.hash) && await o.outbox.enqueue(p.user_id, { key: t.key, kind: "status", text: t.text, at })) stats.statuses++;
    }
    for (const d of plan.drafts) {
      if (await o.store.saveDraft(p.user_id, d) && await o.outbox.enqueue(p.user_id, { key: `followup:${d.key}`, kind: "followup", text: draftOffer(d), at })) stats.followups++;
    }
    if (r.readThrough !== null) await o.store.saveCursor(p.user_id, r.readThrough);
  };
  const people = await o.store.people(MAIL_PEOPLE_PER_RUN), size = o.batch ?? 5;
  for (let i = 0; i < people.length; i += size) {
    await Promise.all(people.slice(i, i + size).map((p) => one(p).catch((e) => { failed.push(e instanceof Error ? e.message : String(e)); })));
  }
  if (failed.length) throw new Error(`mail tracking failed for ${failed.length} people (${stats.statuses} status texts queued): ${failed[0]}`);
  return stats;
}
