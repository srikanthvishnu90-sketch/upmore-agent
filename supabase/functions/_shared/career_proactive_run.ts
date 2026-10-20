// One scheduled alerts run (WO-007b), over injected stores so it runs the same in the function, the simulator and tests:
// everyone with alerts on, the postings first seen in the last 26 hours (plus anything held back for a report), the plan
// from career_alerts.ts, the outbox written once per key, and each person's counters saved. Counters: alerts sent count
// against the person's local day (reset when their date changes); held postings are kept until a report carries them;
// last_checked_at moves to this run, so a posting is alerted at most once.
import { DEFAULT_PREFS, planProactive, quietAt } from "./career_alerts.ts";
import type { AlertRow, AlertStore, Outbox } from "./career_alert_store.ts";
import { planReceipts, type ReceiptRow } from "./career_apply_receipts.ts";
import { cardFor, type Prepared } from "./career_apply_cards.ts";
import { type Classified, draftOffer, foldEvents, type MailIn, planUpdates, type StatusEvent, type TrackedApp } from "./career_mail.ts";
import type { ReadResult } from "./career_mail_gmail.ts";
import type { MailPerson, MailStore } from "./career_mail_store.ts";
import { type MailModelWiring, secondPass } from "./career_mail_model.ts";
import { newMeter } from "./model_gateway.ts";
import { type EventStore, recordEvent } from "./agent/timeline.ts";
import { type AskStore, type ConfirmStore, planConfirmations } from "./career_apply_confirm.ts";
import { receiptText } from "./career_apply_receipts.ts";
import { type OpenQuestion, questionsText } from "./career_apply_questions.ts";
import { extractInvite, type InterviewRow, interviewDrafts, interviewRow, inviteBrief, inviteRef } from "./career_invite.ts";
import type { DigestStore, InterviewStore } from "./career_brief_store.ts";
import { buildDigest, DEFAULT_DIGEST, digestDue } from "./career_digest.ts";

export interface RunStats { users: number; alerts: number; held: number; reports: number; duplicates: number; postings: number; receipts?: number; cards?: number; statuses?: number; followups?: number; briefs?: number; brief_ms_max?: number | null; digests?: number; questions?: number; confirmations?: number; asks?: number; mail_model?: string; mail_model_ask?: string; mail_model_calls?: number; mail_model_decided?: number }
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

// Mail tracking (WO-024): for each person with the career Google grant, the mail since their cursor (10 minutes of
// overlap; the first read looks back 3 days), classified in code, each status event recorded once per message, one short
// text per real change, and follow-ups drafted and offered by text. Nothing is ever sent by email: a draft is a row and a
// text that shows it. Texts wait out the person's quiet hours. The least recently read go first, a few at a time, so at
// the 5-minute schedule everyone is read within the hour up to MAIL_PEOPLE_PER_RUN x 12 people. A rate limit keeps what
// was read and moves the cursor only that far. One person's failure does not stop the others; the run then records it.
export const MAIL_PEOPLE_PER_RUN = 200, MAIL_OVERLAP_MS = 10 * 60000, MAIL_FIRST_LOOKBACK_MS = 3 * 86400000;
// model (WO-040): the second pass, "off" unless CAREER_MAIL_MODEL=on; model_calls asked, model_decided read with confidence.
export interface MailStats { people: number; not_wired: number; statuses: number; followups: number; briefs: number; brief_ms_max: number | null; confirmations: number; asks: number; model?: "off" | "on" | "NOT_WIRED"; model_ask?: string; model_calls?: number; model_decided?: number }
function awake(now: number, tz: string | null | undefined, q: { quiet_start?: number; quiet_end?: number }): number {
  const quiet = { quiet_start: q.quiet_start ?? DEFAULT_PREFS.quiet_start, quiet_end: q.quiet_end ?? DEFAULT_PREFS.quiet_end };
  let at = now;
  try { while (quietAt(at, tz || "America/New_York", quiet) && at < now + 86400000) at += 15 * 60000; } catch { return now; }
  return at;
}
// WO-034: with an interview store, an interview invite found in this run is briefed in this run: its stated facts are
// stored (career_interviews, once per message), and the brief is queued as two texts (brief:<message hash>:1 and :2) right
// after the status text, at most one brief per application a week (a reschedule or a second email about the same round
// is stored, not briefed again). The time from the email's arrival to the brief being queued is recorded on the row and
// the run. An application with a stated interview date leaves its thank-you and nudge to runInterviewDrafts.
export const BRIEF_AGAIN_MS = 7 * 86400000;
async function briefMail(o: { outbox: Outbox; now: number; briefs: InterviewStore }, userId: string, e: StatusEvent, m: MailIn, had: InterviewRow[], at: number): Promise<{ ms: number; row: InterviewRow } | null> {
  const sent = Date.parse(m.date) || o.now;
  const inv = extractInvite({ text: m.snippet, subject: m.subject, from: m.from, sentAt: sent, company: e.company, role: e.role ?? null });
  const row = interviewRow(inv, { key: e.hash, source: "mail", ref: e.ref, mail_at: new Date(sent).toISOString(), seen_at: o.now });
  if (!(await o.briefs.save(userId, row))) return null;
  if (had.some((r) => r.ref === e.ref && r.brief_at && o.now - Date.parse(r.brief_at) < BRIEF_AGAIN_MS)) return null;
  const b = inviteBrief(inv, { now: o.now });
  let queued = 0;
  for (const [i, text] of b.texts.entries()) if (await o.outbox.enqueue(userId, { key: `brief:${e.hash}:${i + 1}`, kind: "brief", text, at })) queued++;
  if (!queued) return null;
  const ms = Math.max(0, o.now - sent);
  await o.briefs.briefed(userId, e.hash, o.now, ms);
  return { ms, row: { ...row, brief_at: new Date(o.now).toISOString(), brief_ms: ms } };
}
const withInterviews = (apps: TrackedApp[], rows: InterviewRow[]) =>
  apps.map((a) => { const r = rows.find((x) => x.date && inviteRef(x) === a.ref); return r ? { ...a, interview_on: r.date! } : a; });

export async function runMail(o: {
  outbox: Outbox; now: number; store: MailStore; read: (userId: string, sinceMs: number, nowMs: number) => Promise<ReadResult>; batch?: number;
  briefs?: InterviewStore | null;
  confirm?: ConfirmStore | null;
  // WO-040: the model's second look at ambiguous mail. Absent: off, the rules alone decide.
  model?: MailModelWiring | null;
}): Promise<MailStats> {
  const stats: MailStats = { people: 0, not_wired: 0, statuses: 0, followups: 0, briefs: 0, brief_ms_max: null, confirmations: 0, asks: 0 };
  const second = o.model?.status === "on" ? o.model.deps : null;
  if (o.model) Object.assign(stats, { model: o.model.status, model_calls: 0, model_decided: 0 }, o.model.status === "NOT_WIRED" ? { model_ask: o.model.ask } : {});
  const failed: string[] = [];
  const one = async (p: MailPerson) => {
    const since = p.read_through ? Date.parse(p.read_through) - MAIL_OVERLAP_MS : o.now - MAIL_FIRST_LOOKBACK_MS;
    const r = await o.read(p.user_id, Math.max(since, o.now - 14 * 86400000), o.now);
    if (r.status === "NOT_WIRED") { stats.not_wired++; return; }
    if (r.status === "ERROR") failed.push(r.detail);
    stats.people++;
    const had = o.briefs ? await o.briefs.list(p.user_id) : [];
    // The second pass, one meter per person; its cost is recorded whether or not anything was decided.
    let decided: Map<string, Classified> | undefined;
    if (second) {
      const meter = newMeter();
      const sp = await secondPass(r.mails, (payload) => second.call(payload, meter));
      decided = sp.decided;
      stats.model_calls! += sp.asked;
      stats.model_decided! += sp.decided.size;
      if (meter.calls) await second.cost(p.user_id, meter).catch((e) => console.error("mail second pass cost:", e instanceof Error ? e.message : e));
    }
    const plan = planUpdates(r.mails, withInterviews(foldEvents(await o.store.applications(p.user_id), await o.store.events(p.user_id)), had), o.now, decided);
    const fresh = await o.store.record(p.user_id, plan.events);
    const at = awake(o.now, p.tz, p);
    for (const t of plan.texts) {
      if (fresh.has(t.hash) && await o.outbox.enqueue(p.user_id, { key: t.key, kind: "status", text: t.text, at })) stats.statuses++;
    }
    if (o.briefs) {
      const byHash = new Map(r.mails.map((m) => [m.hash, m]));
      for (const e of plan.events) {
        const m = byHash.get(e.hash);
        if (e.kind !== "interview" || e.flagged || !fresh.has(e.hash) || !m) continue;
        const done = await briefMail({ outbox: o.outbox, now: o.now, briefs: o.briefs }, p.user_id, e, m, had, at);
        if (!done) continue;
        stats.briefs++;
        stats.brief_ms_max = Math.max(stats.brief_ms_max ?? 0, done.ms);
        had.push(done.row);
      }
    }
    for (const d of plan.drafts) {
      if (await o.store.saveDraft(p.user_id, d) && await o.outbox.enqueue(p.user_id, { key: `followup:${d.key}`, kind: "followup", text: draftOffer(d), at })) stats.followups++;
    }
    // WO-032: the same mail confirms applications in the queue, only on the stricter match in career_apply_confirm.ts.
    // A received email that confirms one is said once (status:confirmed:<application>); a rejection, interview or offer
    // that confirms one already has its own status text. Two that fit are asked about once, by runAsks.
    if (o.confirm && r.mails.length) {
      for (const c of planConfirmations(r.mails, await o.confirm.queue(p.user_id))) {
        if (c.kind === "ask") { if (await o.confirm.ask(p.user_id, c)) stats.asks++; continue; }
        if ((await o.confirm.confirm(p.user_id, c)) !== "confirmed") continue;
        stats.confirmations++;
        if (c.mail_kind !== "received") continue;
        const text = receiptText({ company: c.company, url: c.url, state: "confirmed", email_confirmed_at: c.mail_at, tz: p.tz });
        if (await o.outbox.enqueue(p.user_id, { key: `status:confirmed:${c.id}`, kind: "status", text, at })) stats.statuses++;
      }
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

// Thank-you and nudge for interviews with a stated date (WO-034), for everyone with one, mail grant or not: the planner
// in career_invite.ts decides, the draft is stored once (career_mail_drafts, key thank_you:...), and one text offers it in
// full, after quiet hours. Nothing is ever sent to the employer: the person sends the draft themselves.
export async function runInterviewDrafts(o: {
  outbox: Outbox; now: number; interviews: InterviewStore; drafts: Pick<MailStore, "applications" | "events" | "saveDraft">;
}): Promise<number> {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  let n = 0;
  const failed: string[] = [];
  for (const p of await o.interviews.dated(day(o.now - 31 * 86400000), day(o.now + 86400000))) {
    try {
      const rows = await o.interviews.list(p.user_id);
      const apps = foldEvents(await o.drafts.applications(p.user_id), await o.drafts.events(p.user_id));
      const at = awake(o.now, p.tz, p);
      for (const d of interviewDrafts(rows, apps, o.now, p.tz || "America/New_York")) {
        if (await o.drafts.saveDraft(p.user_id, d) && await o.outbox.enqueue(p.user_id, { key: `followup:${d.key}`, kind: "followup", text: draftOffer(d), at })) n++;
      }
    } catch (e) {
      failed.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (failed.length) throw new Error(`interview drafts failed for ${failed.length} people (${n} queued): ${failed[0]}`);
  return n;
}

// The weekly digest (WO-034): checked in the first 5 minutes of each hour (the run is every 5 minutes, so once an hour),
// queued for each person whose day it is and whose hour has come, in their zone, keyed digest:<ISO week> so it is said
// once a week; a digest hour inside the person's quiet hours waits for them to end. Nothing on file, nothing said.
export const DIGEST_CHECK_MINUTES = 5;
export async function runDigest(o: { outbox: Outbox; now: number; store: DigestStore }): Promise<number> {
  if (new Date(o.now).getUTCMinutes() >= DIGEST_CHECK_MINUTES) return 0;
  let n = 0;
  const failed: string[] = [];
  for (const p of await o.store.people(o.now)) {
    const tz = p.tz || "America/New_York";
    const { due, week } = digestDue(p.prefs ?? DEFAULT_DIGEST, o.now, tz);
    if (!due) continue;
    try {
      const d = buildDigest(await o.store.rows(p.user_id, new Date(o.now - 7 * 86400000).toISOString()), { now: o.now, tz });
      if (d && await o.outbox.enqueue(p.user_id, { key: `digest:${week}`, kind: "digest", text: d.text, at: awake(o.now, tz, p) })) n++;
    } catch (e) {
      failed.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (failed.length) throw new Error(`digest failed for ${failed.length} people (${n} queued): ${failed[0]}`);
  return n;
}

// The questions a preparation left open (WO-032, ask once pushed): texted once, without being asked for, with the same
// formatter as "what do you need from me" (questionsText: at most 5, the rest counted). Only questions never pushed, once
// the preparation has settled (nothing new in the last 10 minutes), never in the person's quiet hours, one text per person
// per run. The database decides the rest in one transaction (career_apply_questions_push_for): a texting thread and no
// STOP, at most one such text a day, nothing else waiting in the thread, every question still open and never pushed, the
// text carrying every question; and it makes the text the thread's last word with the questions intent and records the
// questions shown, so the numbered answers go to questionsTurn as if the person had asked.
export interface QuestionRow extends OpenQuestion {
  user_id: string; created_at: string; pushed_at?: string | null; tz?: string | null; quiet_start?: number; quiet_end?: number;
}
export const QUESTIONS_SETTLE_MS = CARD_SETTLE_MS;
export async function runQuestions(o: {
  now: number; open: () => Promise<QuestionRow[]>; push: (userId: string, ids: string[], text: string) => Promise<boolean>;
}): Promise<number> {
  const byUser = new Map<string, QuestionRow[]>();
  for (const q of await o.open()) byUser.set(q.user_id, [...(byUser.get(q.user_id) ?? []), q]);
  let pushed = 0;
  const failed: string[] = [];
  for (const [userId, rows] of byUser) {
    // Open only: an answered question is never asked again (the database checks it once more).
    const open = rows.filter((q) => !q.answer || q.misfit).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const fresh = open.filter((q) => !q.pushed_at);
    if (!fresh.length || Math.max(...open.map((q) => Date.parse(q.created_at))) > o.now - QUESTIONS_SETTLE_MS) continue;
    const quiet = { quiet_start: fresh[0].quiet_start ?? DEFAULT_PREFS.quiet_start, quiet_end: fresh[0].quiet_end ?? DEFAULT_PREFS.quiet_end };
    if (quietAt(o.now, fresh[0].tz || "America/New_York", quiet)) continue;
    const t = questionsText(fresh, open.length);
    if (!t) continue;
    try {
      if (await o.push(userId, t.take.map((q) => q.id), t.text)) pushed++;
    } catch (e) {
      failed.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (failed.length) throw new Error(`questions push failed for ${failed.length} people (${pushed} pushed): ${failed[0]}`);
  return pushed;
}

// Which application an employer's email confirms, when two fit (WO-032): each ask texted once, outside quiet hours, one
// per person per run; the database refuses it while the thread waits on something else, and it waits for a later run.
export async function runAsks(o: { now: number; store: Pick<AskStore, "pending" | "push"> }): Promise<number> {
  const seen = new Set<string>();
  let pushed = 0;
  for (const a of await o.store.pending()) {
    if (seen.has(a.user_id) || !a.text) continue;
    const quiet = { quiet_start: a.quiet_start ?? DEFAULT_PREFS.quiet_start, quiet_end: a.quiet_end ?? DEFAULT_PREFS.quiet_end };
    if (quietAt(o.now, a.tz || "America/New_York", quiet)) continue;
    seen.add(a.user_id);
    if (await o.store.push(a.user_id, a.hash, a.text)) pushed++;
  }
  return pushed;
}
