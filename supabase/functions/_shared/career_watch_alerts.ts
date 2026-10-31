// Job watches set by text, as the scheduled alerts run reads them.
//
// The chat router keeps a person's watches in 152's watch profile (the account's watch state, career_watch_kv key
// career:watch-profile:<user>). The scheduled run (career-proactive) reads career_alert_prefs. syncWatchAlerts is the
// bridge: after a turn is saved, the watch the turn left becomes the person's alert settings, each watch kept whole
// (career_alerts.ts matches a posting against one watch at a time, never one watch's role in another's city).
//   - every turn with a watch makes the stored settings agree with it (a failed write is repaired by the next turn); a
//     turn with no watch at all reads and writes nothing;
//   - a watch set, changed or resumed: saved, starting from now (postings already on the boards are never alerted), with
//     the person's zone, report hour, quiet hours and caps as they were;
//   - paused, or the last watch stopped: alerts off, the settings kept;
//   - forget everything: the settings removed.
// What a watch carries over: its role's title terms (keywords) and blockers (exclude_words), its places and remote, its
// bands (intern, new grad) as levels, its firms (only these), the firms it and the opt-out exclude.
import { type AlertInterest, type AlertPrefs, type AlertSignal, DEFAULT_PREFS, matchPosting, MAX_INSTANT_PER_DAY } from "./career_alerts.ts";
import { type AlertRow, type AlertStore, startWatching, validPrefs } from "./career_alert_store.ts";
import { type Floor, validFloor } from "./career_floor.ts";

export const WATCH_PROFILE_KEY = (userId: string) => `career:watch-profile:${userId}`;
const DEFAULT_TZ = "America/New_York";
const BAND_LEVELS: Record<string, "intern" | "entry"> = { intern: "intern", new_grad: "entry", junior: "entry" };
const text = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const texts = (v: unknown, n = 20) => [...new Set((Array.isArray(v) ? v : []).map(text).filter((x) => x && x.length <= 60))].slice(0, n);

export type WatchSync =
  | { action: "unchanged" | "none" | "saved" | "off" | "removed" }
  | { action: "refused"; reason: string };

// Each watch of a profile, as the alerts run matches it. A profile that is not 152's, or a watch with no title term, gives none.
export function interestsFromWatch(wp: any): AlertInterest[] {
  if (!wp || wp.type !== "career_watch_profile" || !Array.isArray(wp.interests)) return [];
  const optedOut = texts(wp.opt_out?.companies);
  const out: AlertInterest[] = [];
  for (const i of wp.interests) {
    const f = i?.filters || {};
    const levels = [...new Set(texts(f.bands).map((b) => BAND_LEVELS[b]).filter(Boolean))];
    // JOB ALERTS AS A REAL OUTCOME (2026-10-31): an internship watch's level is its floor's (levels: intern, read from the
    // title as intern, internship or co-op), so its title terms drop the level word: "frontend internships" matched only a
    // title with both "frontend" and "internships", never "Frontend Engineer Intern". A term that is only the level keeps it.
    const levelWord = levels.includes("intern") ? /\s*\b(?:interns?|internships?|co-?ops?)\b\s*/g : null;
    const keywords = [...new Set(texts(i?.role?.terms, 10).map((k) => {
      const t = k.toLowerCase(), bare = levelWord ? t.replace(levelWord, " ").replace(/\s+/g, " ").trim() : t;
      return bare || t;
    }))];
    if (!keywords.length) continue;
    const raw: Record<string, unknown> = {
      exclude_words: texts(i.role.blockers),
      exclude_companies: [...new Set([...texts(f.firms_exclude), ...optedOut])].slice(0, 20),
      ...(levels.length ? { levels } : {}),
    };
    const fl = validFloor(raw);
    const floor: Floor | undefined = fl.ok && Object.keys(fl.floor).length ? fl.floor : undefined;
    const companies = texts(f.firms_include);
    // SERIAL-1530: the person's stated location rides each watch, for a posting's stated country or region restriction.
    const home = text(wp.scoring_profile?.location).slice(0, 80);
    out.push({ keywords, locations: texts(f.locations, 10), remote_ok: f.remote_ok !== false, ...(floor ? { floor } : {}), ...(companies.length ? { companies } : {}), ...(home ? { home } : {}) });
  }
  return out;
}

// The profile as the person last set it, without the time it was written.
const same = (a: any, b: any) => JSON.stringify(a ? { ...a, updated_at: null } : null) === JSON.stringify(b ? { ...b, updated_at: null } : null);

// Every turn that has a watch makes the stored settings agree with that watch, whatever the last write did: a write that
// failed (the turn said "paused" and the row stayed on) is repaired by the next turn, not left on. A row the person's
// watches made (it has interests) follows the watch; settings made elsewhere follow it only on a turn that changed it.
// JOB ALERTS AS A REAL OUTCOME (2026-10-31): the cadence the person said with a watch ("every morning", "every morning at
// 6am central", "once a day", "every evening"), read from their own words: one message a day at that hour (Q326, Q336), with
// no instant alerts between, in the zone they named. "right away" / "as soon as" / "instantly" turns the daily message back
// into instant alerts. Nothing said: nothing changed. The default hours: morning 8, evening 18, a day 8.
const ZONES: Record<string, string> = {
  eastern: "America/New_York", et: "America/New_York", est: "America/New_York", edt: "America/New_York", "new york": "America/New_York",
  central: "America/Chicago", ct: "America/Chicago", cst: "America/Chicago", cdt: "America/Chicago", chicago: "America/Chicago",
  mountain: "America/Denver", mt: "America/Denver", mst: "America/Denver", mdt: "America/Denver", denver: "America/Denver",
  pacific: "America/Los_Angeles", pt: "America/Los_Angeles", pst: "America/Los_Angeles", pdt: "America/Los_Angeles",
};
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as any)[k])])) : v;
const canonJson = (v: unknown) => JSON.stringify(canon(v));
export interface Cadence { digest: boolean; report_hour?: number; tz?: string }
export function cadenceFrom(message: unknown): Cadence | null {
  const m = String(message ?? "").toLowerCase().replace(/\s+/g, " ");
  if (/\b(right away|as soon as (?:they|it|one|there)|instantly|in real[- ]time)\b/.test(m)) return { digest: false };
  const when = m.match(/\b(?:every|each) (morning|evening|day|weekday)\b|\b(daily|once a day)\b/);
  if (!when) return null;
  const part = when[1] ?? when[3] ?? "day";
  let hour = part === "evening" ? 18 : 8;
  const at = m.match(/\bat (\d{1,2})(?::00)? ?(am|pm|a\.m\.|p\.m\.)?(?=\W|$)/);
  if (at) {
    const h = Number(at[1]), pm = at[2]?.startsWith("p") || (!at[2] && part === "evening" && h < 12);
    if (h >= 1 && h <= 12) hour = (h % 12) + (pm ? 12 : 0);
    else if (h === 0 || (h > 12 && h <= 23)) hour = h;
  }
  const z = m.match(/\b(eastern|central|mountain|pacific|et|ct|mt|pt|est|edt|cst|cdt|mst|mdt|pst|pdt)\b(?: time)?|\b(new york|chicago|denver) time\b/);
  return { digest: true, report_hour: hour, ...(z ? { tz: ZONES[z[1] ?? z[2]] } : {}) };
}
function withCadence(prefs: AlertPrefs, c: Cadence | null): AlertPrefs {
  if (!c) return prefs;
  if (!c.digest) return prefs.digest ? { ...prefs, digest: false, max_instant_per_day: DEFAULT_PREFS.max_instant_per_day } : prefs;
  return { ...prefs, digest: true, max_instant_per_day: 0, report_hour: c.report_hour ?? prefs.report_hour };
}

export async function syncWatchAlerts(o: {
  userId: string; before: Record<string, unknown> | null | undefined; after: Record<string, unknown> | null | undefined;
  erased?: boolean; store: AlertStore; now: number;
  message?: string; // the person's words this turn, for the cadence they said (cadenceFrom)
}): Promise<WatchSync> {
  if (o.erased) {
    if (!o.store.remove) return { action: "refused", reason: "this alert store cannot remove settings" };
    await o.store.remove(o.userId);
    return { action: "removed" };
  }
  const key = WATCH_PROFILE_KEY(o.userId), was = o.before?.[key] ?? null, now = o.after?.[key] ?? null;
  if (!was && !now) return { action: "unchanged" }; // no watch, ever: nothing to agree with (the alerts run removes a stale copy)
  const changed = !same(was, now), prev = await o.store.get(o.userId);
  const interests = interestsFromWatch(now), active = interests.length > 0 && !(now as any)?.opt_out?.global;
  if (!active) {
    if (prev && prev.prefs.on && (prev.prefs.interests?.length || changed)) {
      await o.store.save({ ...prev, prefs: { ...prev.prefs, on: false } });
      return { action: "off" };
    }
    return { action: prev ? "unchanged" : "none" };
  }
  // A cadence is the person's only on the turn that set or changed the watch, or one about their alerts ("send them every
  // evening instead"): "I apply every day" on some later turn is not a request to change how alerts arrive.
  const cadence = changed || /\b(alerts?|jobs?|roles?|matches|internships?|postings?|openings?|send|text|message)\b/i.test(String(o.message ?? "")) ? cadenceFrom(o.message) : null;
  // Compared key-order-free: the row comes back from jsonb with its keys sorted, so the plain string compare never matched,
  // and EVERY turn by a person with a watch re-saved it through startWatching: "watching from now" (postings first seen
  // since the last run were never alerted) and, past the report hour, today's report marked done before it was sent.
  if (prev && prev.prefs.on && canonJson(prev.prefs.interests ?? null) === canonJson(interests)) {
    // The same watches, a new cadence ("make it every evening instead"): only the cadence changes, the counters stay.
    const next = withCadence(prev.prefs, cadence), tz = cadence?.tz ?? prev.tz;
    if (canonJson(next) === canonJson(prev.prefs) && tz === prev.tz) return { action: "unchanged" };
    await o.store.save({ ...prev, tz, prefs: next });
    return { action: "saved" };
  }
  // The table keeps the watches' words in `keywords` (1 to 10) and their places in `locations` (up to 10); the
  // watches themselves decide the match.
  // NO LIMITS (owner, 2026-10-27; Telegram list #7, 2026-10-28): the column is a summary of the watches' words, and the
  // match reads each watch's own terms (prefs.interests). It used to refuse the whole save past 10 distinct terms, so an
  // 11th title term silently turned every watch's alerts off. The summary keeps the first 10; every watch keeps all of its own.
  const keywords = [...new Set(interests.flatMap((i) => i.keywords))].slice(0, 10);
  const v = validPrefs({ keywords, locations: [...new Set(interests.flatMap((i) => i.locations))].slice(0, 10) }, prev?.prefs ?? DEFAULT_PREFS);
  if (!v.ok) return { action: "refused", reason: v.error };
  const row = startWatching(prev, { userId: o.userId, prefs: withCadence({ ...v.prefs, interests }, cadence), tz: cadence?.tz ?? prev?.tz ?? DEFAULT_TZ, now: o.now });
  await o.store.save(row);
  return { action: "saved" };
}

// JOB ALERTS AS A REAL OUTCOME (2026-10-31): the person's "less like N" / "more like N" (career_alert_feedback.ts) kept on
// their alert settings, here with every other write of the row (D-032). The same job's opposite rule is replaced, never kept
// beside it; at most 20 of each, the newest kept. Only prefs.feedback changes: the counters and watches stay as they are.
const MAX_SIGNALS = 20;
export async function saveAlertFeedback(store: Pick<AlertStore, "save">, row: AlertRow, kind: "less" | "more", sig: AlertSignal): Promise<void> {
  const fb = row.prefs.feedback ?? {}, other = kind === "less" ? "more" : "less";
  const mine = (fb[kind] ?? []).filter((s) => canonJson(s) !== canonJson(sig));
  const theirs = (fb[other] ?? []).filter((s) => s.company !== sig.company);
  await store.save({ ...row, prefs: { ...row.prefs, feedback: { ...fb, [kind]: [...mine, sig].slice(-MAX_SIGNALS), [other]: theirs } } });
}

// At delivery (channel.ts deliverDue): whether a queued job alert (career_outbox key alert:<job_id>) or report
// (report:<day>) is still the person's to get, from their alert settings now, the watch record behind a row their
// watches made, and the posting. Settings gone or off, the watch record gone, paused or empty, or a posting that no
// longer fits (gone, closed, or a watch stopped since): not sent. Nothing that cannot be shown to fit is sent.
export const isAlertKey = (key: string) => /^(alert|report):/.test(String(key ?? ""));
export function alertStillWanted(key: string, now: { row: Pick<AlertRow, "prefs"> | null; record: unknown; posting?: unknown }): boolean {
  const row = now.row;
  if (!row || !row.prefs?.on) return false;
  let prefs = row.prefs;
  if (prefs.interests?.length) {
    const wp: any = now.record ?? null, interests = interestsFromWatch(wp);
    if (!interests.length || wp?.opt_out?.global) return false;
    prefs = { ...prefs, interests };
  }
  if (String(key).startsWith("alert:")) return !!now.posting && matchPosting(now.posting, prefs);
  return isAlertKey(key);
}
// PROACTIVE SCENARIOS ROUND 2 (2026-10-30): a queued job alert against the person's fit floor and daily cap as they are
// now. An alert waits in the outbox (quiet hours, a delivery run behind) after it is planned; a person who raised their
// fit floor or asked for fewer alerts in that time still got everything planned under the old settings. `fit`: the fit
// the alert was queued with (null: not known, never held back on that account). `sentToday`: alerts already delivered to
// the person today on their own clock.
export function alertWithinLimits(prefs: Pick<AlertPrefs, "min_fit" | "max_instant_per_day"> | null | undefined, fit: number | null, sentToday: number): boolean {
  if (!prefs) return true; // no settings: alertStillWanted holds it
  if (typeof fit === "number" && typeof prefs.min_fit === "number" && fit < prefs.min_fit) return false;
  return sentToday < Math.min(MAX_INSTANT_PER_DAY, Math.floor(Number(prefs.max_instant_per_day) || 0));
}
