// Job alerts and the daily report (WO-007): which new postings reach a person right away, which wait for their daily
// report, and when each goes out. Pure planning, no I/O: the scheduled runner (career-proactive) reads postings and
// people, calls planProactive, and hands the results to the conversation store's proactive queue (one per key, ever).
// Every word of an alert or report is written here from the posting's own fields, never by the model.
//   matchPosting   the person's keywords (every word, whole words, in the title), places or remote, open postings only
//   planProactive  instant alerts, freshest first, up to the person's daily cap; the rest held for the report; quiet
//                  hours move an alert to the end of quiet hours in the person's zone; one report per local day at or
//                  after their hour, with the last day's matches and the held ones, or a plain "no new matches"
export interface AlertPrefs {
  on: boolean; keywords: string[]; locations: string[]; remote_ok: boolean;
  report_hour: number; quiet_start: number; quiet_end: number; max_instant_per_day: number;
}
export interface PlanUser {
  id: string; tz: string; prefs: AlertPrefs; last_checked_at: string; instant_sent_today: number;
  last_report_on: string | null; // YYYY-MM-DD in the person's zone
  held?: string[]; // job_ids the daily cap held back
}
export type Planned =
  | { userId: string; kind: "alert"; key: string; at: number; job_id: string; text: string }
  | { userId: string; kind: "held"; job_id: string }
  | { userId: string; kind: "report"; key: string; at: number; text: string };

export const DEFAULT_PREFS: AlertPrefs = { on: true, keywords: [], locations: [], remote_ok: true, report_hour: 8, quiet_start: 22, quiet_end: 7, max_instant_per_day: 3 };
export const MAX_INSTANT_PER_DAY = 10, REPORT_LIMIT = 10;
const DAY = 86400000;

const words = (s: unknown) => String(s ?? "").toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
// Postgres hands timestamps back as "+00:00", the feed as "Z": compare instants, never strings.
const ms = (t: unknown) => { const n = Date.parse(String(t ?? "")); return Number.isFinite(n) ? n : NaN; };
// Posting fields are other people's text: one line, bounded, before they go into a message.
const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const httpsUrl = (u: unknown) => (/^https:\/\/\S+$/.test(String(u ?? "")) ? String(u) : null);

export function matchPosting(p: any, prefs: AlertPrefs): boolean {
  if (!p || p.closed_at || !httpsUrl(p.url)) return false;
  // A keyword matches when every one of its words is a whole word of the title ("data analyst" matches
  // "Analyst, Data Platform", never "Metadata Analyst" for "data"). No keywords means no alerts, never everything.
  const title = new Set(words(p.title));
  if (!prefs.keywords.some((k) => { const ws = words(k); return ws.length > 0 && ws.every((w) => title.has(w)); })) return false;
  const loc = String(p.location ?? "").toLowerCase();
  if (prefs.remote_ok && /\bremote\b/.test(loc)) return true;
  if (!prefs.locations.length) return true;
  return prefs.locations.some((l) => { const t = String(l).trim().toLowerCase(); return t.length > 0 && loc.includes(t); });
}

// The person's local date, hour and minute at an instant.
function local(at: number, tz: string): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "0";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) % 24, minute: Number(g("minute")) };
}
const isQuiet = (hour: number, p: AlertPrefs) =>
  p.quiet_start === p.quiet_end ? false : p.quiet_start > p.quiet_end ? hour >= p.quiet_start || hour < p.quiet_end : hour >= p.quiet_start && hour < p.quiet_end;
// The first instant at or after `from` when the person's clock reads hour:00. Steps of 15 minutes, so zones on a half or
// quarter hour (India, Nepal) land on their own hour, and a daylight-saving jump is crossed rather than assumed.
function nextLocal(from: number, tz: string, hour: number): number {
  const start = Math.ceil(from / 900000) * 900000;
  for (let t = start; t < from + 2 * DAY; t += 900000) { const l = local(t, tz); if (l.hour === hour && l.minute === 0) return t; }
  return from;
}
function ago(mins: number) { return mins < 1 ? "under a minute ago" : mins < 120 ? `${mins} min ago` : `${Math.round(mins / 60)} hours ago`; }
const line = (p: any) => `${clean(p.title, 120)} at ${clean(p.company, 80)}${p.location ? ` (${clean(p.location, 80)})` : ""}`;

export function planProactive(o: { users: PlanUser[]; postings: any[]; now: number }): Planned[] {
  const out: Planned[] = [];
  for (const u of o.users) {
    if (!u.prefs || !u.prefs.on) continue;
    const prefs = u.prefs, l = local(o.now, u.tz), since = ms(u.last_checked_at);
    // Instant alerts: postings first seen since the last check, freshest first, up to the cap left today.
    const fresh = o.postings
      .filter((p) => ms(p.first_seen_at) > since && matchPosting(p, prefs))
      .sort((a, b) => ms(b.first_seen_at) - ms(a.first_seen_at));
    let room = Math.max(0, Math.min(MAX_INSTANT_PER_DAY, Math.floor(prefs.max_instant_per_day)) - Math.max(0, u.instant_sent_today | 0));
    const at = isQuiet(l.hour, prefs) ? nextLocal(o.now, u.tz, prefs.quiet_end) : o.now;
    for (const p of fresh) {
      if (room <= 0) { out.push({ userId: u.id, kind: "held", job_id: p.job_id }); continue; }
      room--;
      const mins = Math.max(0, Math.floor((o.now - ms(p.first_seen_at)) / 60000));
      out.push({ userId: u.id, kind: "alert", key: `alert:${p.job_id}`, at, job_id: p.job_id,
        text: `New match: ${line(p)}, first seen ${ago(mins)}.\n${httpsUrl(p.url)}` });
    }
    // The daily report: once per local day, at or after the person's hour.
    if (l.hour >= prefs.report_hour && u.last_report_on !== l.date) {
      const held = new Set(u.held || []);
      const day = o.postings
        .filter((p) => matchPosting(p, prefs) && (ms(p.first_seen_at) > o.now - DAY || held.has(p.job_id)))
        .sort((a, b) => ms(b.first_seen_at) - ms(a.first_seen_at));
      const text = day.length
        ? [`Your daily job report: ${day.length} match${day.length === 1 ? "" : "es"} in the last day.`,
           ...day.slice(0, REPORT_LIMIT).map((p) => `- ${line(p)}\n  ${httpsUrl(p.url)}`),
           ...(day.length > REPORT_LIMIT ? [`…and ${day.length - REPORT_LIMIT} more. Ask me for the rest.`] : [])].join("\n")
        : "Your daily job report: no new matches in the last day. I'm still watching.";
      out.push({ userId: u.id, kind: "report", key: `report:${l.date}`, at: o.now, text });
    }
  }
  return out;
}
