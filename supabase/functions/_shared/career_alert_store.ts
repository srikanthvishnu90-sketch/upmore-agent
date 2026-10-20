// Where job alerts live (WO-007b): each person's alert preferences and counters, and the outbox of alerts and reports
// waiting to be delivered. The chat's tools write preferences; the scheduled runner (career-proactive) reads them, plans
// with career_alerts.ts, writes the outbox (one row per person and key, ever) and saves the counters. Delivery from the
// outbox is the texting channel's job (WO-013); the simulator drains its own in-memory queue.
// Tables: supabase/migrations/20261019010000_career_alerts.sql.
import { DEFAULT_PREFS, MAX_INSTANT_PER_DAY, WEEKLY_MAX, type AlertPrefs, type PlanUser } from "./career_alerts.ts";
import { validFloor } from "./career_floor.ts";

export interface AlertRow extends PlanUser { sent_on: string | null } // sent_on: the local day instant_sent_today counts
export interface AlertStore {
  get(userId: string): Promise<AlertRow | null>;
  save(row: AlertRow): Promise<void>;
  active(): Promise<AlertRow[]>; // everyone with alerts on
  // WO-037: alerts per person whose delivery time is at or after `sinceIso` (the weekly cap's count). A store without it
  // sends no alerts (the run fails closed).
  alertsSince?(sinceIso: string): Promise<Map<string, number>>;
}
// first_seen_at (WO-037, alerts only): when Trainee first saw the posting, kept with the alert so the latency from
// first seen to delivered can be reported (career_alert_latency).
export interface Outbox { enqueue(userId: string, m: { key: string; kind: "alert" | "report" | "receipt" | "status" | "followup" | "brief" | "digest"; text: string; at: number; first_seen_at?: string }): Promise<boolean> } // false: that key was already queued or sent

// The person's words, checked: what the tools accept and what the table's constraint accepts are the same rules.
export function validPrefs(input: Record<string, unknown>, base: AlertPrefs = DEFAULT_PREFS): { ok: true; prefs: AlertPrefs } | { ok: false; error: string } {
  // A field left out keeps the alert's current value (an empty list clears it): "only 1 a day" never drops the place.
  const list = (v: unknown, name: string, kept: string[]): string[] | string => {
    if (v === undefined) return kept;
    if (!Array.isArray(v)) return `${name} must be a list`;
    const out = v.map((x) => String(x ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
    if (out.length > 10) return `at most 10 ${name}`;
    if (out.some((x) => x.length > 60)) return `each of the ${name} must be 60 characters or fewer`;
    return [...new Set(out.map((x) => x.toLowerCase()))];
  };
  const keywords = list(input.keywords, "keywords", base.keywords), locations = list(input.locations, "locations", base.locations);
  if (typeof keywords === "string") return { ok: false, error: keywords };
  if (typeof locations === "string") return { ok: false, error: locations };
  if (!keywords.length) return { ok: false, error: "say at least one kind of job to watch for (keywords)" };
  const hour = (v: unknown, d: number) => (v === undefined ? d : Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 23 ? (v as number) : NaN);
  const report_hour = hour(input.report_hour, base.report_hour);
  if (Number.isNaN(report_hour)) return { ok: false, error: "report_hour must be a whole hour from 0 to 23" };
  const quiet_start = hour(input.quiet_start, base.quiet_start), quiet_end = hour(input.quiet_end, base.quiet_end);
  if (Number.isNaN(quiet_start) || Number.isNaN(quiet_end)) return { ok: false, error: "quiet_start and quiet_end must be whole hours from 0 to 23" };
  const cap = input.max_instant_per_day === undefined ? base.max_instant_per_day : Number(input.max_instant_per_day);
  if (!Number.isInteger(cap) || cap < 0 || cap > MAX_INSTANT_PER_DAY) return { ok: false, error: `max_instant_per_day must be 0 to ${MAX_INSTANT_PER_DAY}` };
  const week = input.max_per_week === undefined ? base.max_per_week : Number(input.max_per_week);
  if (week !== undefined && (!Number.isInteger(week) || week < 0 || week > WEEKLY_MAX)) return { ok: false, error: `max_per_week must be 0 to ${WEEKLY_MAX}` };
  if (input.remote_ok !== undefined && typeof input.remote_ok !== "boolean") return { ok: false, error: "remote_ok must be true or false" };
  // The relevance floor (C-04): only what the person stated; a floor not given keeps the one already saved.
  const fl = input.floor === undefined ? { ok: true as const, floor: base.floor } : validFloor(input.floor);
  if (!fl.ok) return { ok: false, error: fl.error };
  const floor = fl.floor && Object.keys(fl.floor).length ? fl.floor : undefined;
  return { ok: true, prefs: { ...base, on: true, keywords, locations, remote_ok: input.remote_ok === undefined ? base.remote_ok : input.remote_ok as boolean, report_hour, quiet_start, quiet_end, max_instant_per_day: cap, floor, ...(week !== undefined ? { max_per_week: week } : {}) } };
}
export function validZone(tz: unknown): string | null {
  if (typeof tz !== "string" || !tz || tz.length > 64) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return null; }
}

// Turning alerts on (or changing them) starts watching now: postings already on the boards are never alerted, and if
// today's report hour has passed, the first report is tomorrow's, not one sent minutes after the person asked.
export function startWatching(prev: AlertRow | null, o: { userId: string; prefs: AlertPrefs; tz: string; now: number }): AlertRow {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: o.tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(o.now));
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "0";
  const today = `${g("year")}-${g("month")}-${g("day")}`, hour = Number(g("hour")) % 24;
  return { id: o.userId, tz: o.tz, prefs: o.prefs, last_checked_at: new Date(o.now).toISOString(),
    instant_sent_today: prev?.sent_on === today ? prev.instant_sent_today : 0, sent_on: today,
    last_report_on: hour >= o.prefs.report_hour ? today : (prev?.last_report_on ?? null), held: prev?.held ?? [] };
}

// ------------------------------------------------------------------------------------------------ memory
export interface MemoryAlerts { rows: Record<string, AlertRow>; outbox: { userId: string; key: string; kind: string; text: string; at: number; first_seen_at?: string }[] }
export function memoryAlertStore(initial?: MemoryAlerts): AlertStore & Outbox & { dump(): MemoryAlerts } {
  const st: MemoryAlerts = initial ? JSON.parse(JSON.stringify(initial)) : { rows: {}, outbox: [] };
  return {
    async get(id) { return st.rows[id] ? JSON.parse(JSON.stringify(st.rows[id])) : null; },
    async save(row) { st.rows[row.id] = JSON.parse(JSON.stringify(row)); },
    async active() { return Object.values(st.rows).filter((r) => r.prefs.on).map((r) => JSON.parse(JSON.stringify(r))); },
    async alertsSince(since) {
      const t = Date.parse(since), out = new Map<string, number>();
      for (const o of st.outbox) if (o.kind === "alert" && o.at >= t) out.set(o.userId, (out.get(o.userId) ?? 0) + 1);
      return out;
    },
    async enqueue(userId, m) {
      if (st.outbox.some((o) => o.userId === userId && o.key === m.key)) return false;
      st.outbox.push({ userId, ...m });
      return true;
    },
    dump() { return JSON.parse(JSON.stringify(st)); },
  };
}

// ------------------------------------------------------------------------------------------------ Supabase
const PAGE = 1000;
function must<T>(r: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}
const fromDb = (r: any): AlertRow => ({ id: r.user_id, tz: r.tz, prefs: r.prefs, last_checked_at: r.last_checked_at, instant_sent_today: r.instant_sent_today,
  sent_on: r.sent_on, last_report_on: r.last_report_on, held: r.held || [] });
const toDb = (r: AlertRow) => ({ user_id: r.id, tz: r.tz, prefs: r.prefs, last_checked_at: r.last_checked_at, instant_sent_today: r.instant_sent_today,
  sent_on: r.sent_on, last_report_on: r.last_report_on, held: (r.held || []).slice(0, 200), updated_at: new Date().toISOString() });

// deno-lint-ignore no-explicit-any
export function supabaseAlertStore(admin: any): AlertStore & Outbox {
  return {
    async get(id) { const r = must<any>(await admin.from("career_alert_prefs").select("*").eq("user_id", id).maybeSingle(), "read alert settings"); return r ? fromDb(r) : null; },
    async save(row) { must(await admin.from("career_alert_prefs").upsert(toDb(row), { onConflict: "user_id" }), "save alert settings"); },
    async active() {
      const out: AlertRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const got = must<any[]>(await admin.from("career_alert_prefs").select("*").eq("prefs->>on", "true").order("user_id").range(from, from + PAGE - 1), "read alert settings") || [];
        out.push(...got.map(fromDb));
        if (got.length < PAGE) return out;
      }
    },
    // career_alerts_sent_since (20261021060000_career_board_state.sql): one row per person, counted in the database.
    async alertsSince(since) {
      const out = new Map<string, number>();
      for (const r of must<any[]>(await admin.rpc("career_alerts_sent_since", { p_since: since }), "count this week's alerts") || []) out.set(r.user_id, Number(r.n) || 0);
      return out;
    },
    async enqueue(userId, m) {
      const r = await admin.from("career_outbox").insert({ user_id: userId, key: m.key, kind: m.kind, text: m.text, deliver_at: new Date(m.at).toISOString(),
        ...(m.first_seen_at ? { posting_first_seen_at: m.first_seen_at } : {}) });
      if (r.error && (r.error.code === "23505" || /duplicate key/i.test(r.error.message))) return false; // queued or sent before: once per key, ever
      must(r, "queue an alert");
      return true;
    },
  };
}
