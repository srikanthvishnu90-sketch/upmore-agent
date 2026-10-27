// Multi-step follow-through (family: workflows): reminders the person sets by text, and one truthful "status?" over
// everything Trainee is doing for them. Code's, before the router and any brain, on every channel (the web app, and
// Telegram, SMS and WhatsApp through the same handler). Nothing here calls a model.
//
//   reminders   "remind me Friday at 9am to follow up with Stripe": kept on the account (career_watch_kv
//               'career:workflow', which "forget everything" deletes with the rest of the account's keys) and, when
//               CAREER_REMINDER_DELIVERY=on (the owner sets it once trainee-deliver runs on a schedule), queued on
//               career_outbox at that local time, moved out of the person's quiet hours, for the texting channel's
//               deliverDue to send (paused, stopped or erased people are skipped there). Off, the reminder is kept and
//               listed, and the reply says it will not be sent on its own. The person's time zone is asked once, and
//               a reminder is never set on a guessed one. "cancel that", "make it 3pm", "move it to Monday", "cancel the
//               reminder about X", "cancel all my reminders" and "what reminders do I have" act on the record.
//   in a longer message ("find 10 roles, tailor my resume for the top 3, and remind me Friday"), the reminder part is
//               set here and the rest goes on to the router; career_account_memory.ts then adds what was set, and which
//               other parts were not started, to the router's reply (workflowAfterTurn below).
//   progress    "status?", "what are you working on for me", "what's pending": the reminders, the job alert watch, the
//               apply queue, the applications and the tracker, each line read from its own record just now; a record
//               that cannot be read is named, never guessed.
import { type CareerEvent, type EventStore, recordEvent, supabaseEventStore } from "./agent/timeline.ts";
import { type AppRow, statusReply } from "./career_apply_status.ts";

export const REMINDER_SET_INTENT = "career_reminder_set";
export const REMINDER_ASK_INTENT = "career_reminder_ask";
export const REMINDER_MOVED_INTENT = "career_reminder_moved";
export const REMINDER_CANCELLED_INTENT = "career_reminder_cancelled";
export const REMINDER_REFUSED_INTENT = "career_reminder_refused";
export const REMINDERS_INTENT = "career_reminders";
export const PROGRESS_INTENT = "career_progress";
export const TIMEZONE_INTENT = "career_timezone_set";
// The replies a "cancel that" or "make it 3pm" right after can mean.
const REMINDER_LAST_WORDS = new Set([REMINDER_SET_INTENT, REMINDER_ASK_INTENT, REMINDER_MOVED_INTENT]);

export const WORKFLOW_KEY = "career:workflow";
export const WHAT_MAX = 200, ACTIVE_MAX = 25, KEPT_MAX = 60, HORIZON_DAYS = 366, DEFAULT_HOUR = 9;
export const DEFAULT_QUIET = { start: 22, end: 7 };
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

// ------------------------------------------------------------------------------------------------ the record
export type ReminderState = "needs_when" | "needs_zone" | "scheduled" | "kept" | "cancelled";
export interface WhenSpec {
  day: { kind: "today" } | { kind: "tomorrow" } | { kind: "weekday"; wd: number } | { kind: "date"; m: number; d: number } | null;
  time: { h: number; min: number } | null;
  rel: number | null; // "in 2 hours": milliseconds from when it was said
  said: string;
}
export interface Reminder {
  id: string; what: string; state: ReminderState; created_at: string; updated_at: string; said_sha256: string;
  when: WhenSpec | null; anchor: string; // the time the when was said, which "tomorrow" and "Friday" count from
  tz: string | null; due_at: string | null; deliver_at: string | null; quiet_moved: boolean; default_time: boolean;
  outbox_key: string | null; // the career_outbox row that sends it (CAREER_REMINDER_DELIVERY=on), else null
  rev: number; // changes each time it is moved, so each send has its own outbox key
}
export interface WorkflowDoc { rev: number; tz: { tz: string; said: string; at: string } | null; reminders: Reminder[] }
export const emptyDoc = (): WorkflowDoc => ({ rev: 0, tz: null, reminders: [] });

export type ChannelName = "telegram" | "whatsapp" | "text";
export interface OutboxState { status: string; delivered_at: string | null; deliver_at: string | null }
export interface WorkflowStore {
  deliveryOn: boolean;
  load(userId: string): Promise<WorkflowDoc>;
  save(userId: string, doc: WorkflowDoc, prevRev: number): Promise<boolean>; // false: someone else saved first
  queue(userId: string, m: { key: string; text: string; at: number }): Promise<boolean>;
  unqueue(userId: string, key: string): Promise<"removed" | "missing" | string>; // removed, missing, or the row's status
  outbox(userId: string, keys: string[]): Promise<Map<string, OutboxState>>;
  contact(userId: string): Promise<{ channel: ChannelName; opted_out: boolean } | null>;
  quietHours(userId: string): Promise<{ start: number; end: number }>;
  lastWord(userId: string): Promise<string | null>; // the intent of Trainee's newest reply in any of the person's threads
  alerts(userId: string): Promise<{ on: boolean; watches: string[] } | null>;
  applyQueue(userId: string): Promise<{ company: string; title: string; state: string }[]>;
  events: EventStore | null;
}

// ------------------------------------------------------------------------------------------------ words
const norm = (s: string) => ` ${String(s ?? "").toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim()} `;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WD_RX = "(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)";
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RX = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const wdIndex = (w: string) => WEEKDAYS.findIndex((d) => d.startsWith(w.slice(0, 3)));
const monthIndex = (w: string) => MONTHS.findIndex((m) => m.startsWith(w.slice(0, 3)));

// Time zones by the words people use. A guess is never made: a word not here is asked about.
const ZONE_WORDS: [RegExp, string][] = [
  [/\b(?:eastern|est|edt|new york|nyc|ny|boston|atlanta|miami|philadelphia|philly|washington dc|dc|detroit|toronto)\b/, "America/New_York"],
  [/\b(?:central|cst|cdt|chicago|dallas|houston|austin|minneapolis|nashville|st\.? louis|new orleans)\b/, "America/Chicago"],
  [/\b(?:mountain|mst|mdt|denver|salt lake(?: city)?|boise)\b/, "America/Denver"],
  [/\b(?:arizona|phoenix)\b/, "America/Phoenix"],
  [/\b(?:pacific|pst|pdt|los angeles|la|san francisco|sf|bay area|seattle|portland|san diego|san jose)\b/, "America/Los_Angeles"],
  [/\b(?:alaska|anchorage)\b/, "America/Anchorage"],
  [/\b(?:hawaii|honolulu)\b/, "Pacific/Honolulu"],
  [/\b(?:london|uk|gmt|bst)\b/, "Europe/London"],
  [/\b(?:utc)\b/, "UTC"],
];
const ZONE_LABEL: Record<string, string> = { "America/New_York": "Eastern", "America/Chicago": "Central", "America/Denver": "Mountain", "America/Phoenix": "Arizona", "America/Los_Angeles": "Pacific", "America/Anchorage": "Alaska", "Pacific/Honolulu": "Hawaii", "Europe/London": "UK", "UTC": "UTC" };
export const zoneLabel = (tz: string) => ZONE_LABEL[tz] ? `${ZONE_LABEL[tz]} time` : tz;
export function validZone(tz: string): string | null {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z_+-]+){1,2}$/.test(tz) && tz !== "UTC") return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return null; }
}
// A zone named in a phrase: "central", "9am pacific", "chicago time", "America/Chicago". The two-letter forms (ET, CT, MT,
// PT) count only in capitals, as the person typed them, so "pt" or "et" inside other words is never read as a zone.
export function zoneIn(text: string): string | null {
  const raw = String(text ?? "");
  const iana = /\b([A-Z][A-Za-z_]+\/[A-Z][A-Za-z_]+(?:\/[A-Z][A-Za-z_]+)?)\b/.exec(raw);
  if (iana && validZone(iana[1])) return iana[1];
  const caps = /\b(ET|CT|MT|PT)\b/.exec(raw);
  if (caps) return { ET: "America/New_York", CT: "America/Chicago", MT: "America/Denver", PT: "America/Los_Angeles" }[caps[1]] ?? null;
  const t = raw.toLowerCase().replace(/[’`]/g, "'");
  // A city counts only as a zone ("chicago time", "in chicago time", "central"): "follow up with the Chicago office" is
  // not a zone. The zone words themselves (eastern, central, est, pst...) count anywhere.
  const zoneOnly = /\b(?:eastern|central|mountain|pacific|est|edt|cst|cdt|mst|mdt|pst|pdt|gmt|bst|utc)\b/.exec(t);
  if (zoneOnly) return ZONE_WORDS.find(([rx]) => rx.test(zoneOnly[0]))?.[1] ?? null;
  const city = /\b([a-z. ]{2,20}?) time\b/.exec(t);
  if (city) for (const [rx, tz] of ZONE_WORDS) if (rx.test(city[1].trim())) return tz;
  return null;
}
// The answer to "which time zone are you in?": a short message that names one ("central", "I'm in Chicago", "PST").
export function zoneAnswer(message: string): string | null {
  const t = String(message ?? "").trim();
  if (!t || t.split(/\s+/).length > 7) return null;
  const z = zoneIn(t);
  if (z) return z;
  const m = /^(?:i'?m |i am |we'?re )?(?:in |on |at |based in |near )?(?:the )?([a-z .]{2,30}?)(?: time| area)?(?: zone)?[.! ]*$/i.exec(t.replace(/[’`]/g, "'"));
  if (!m) return null;
  for (const [rx, tz] of ZONE_WORDS) if (rx.test(m[1].toLowerCase().trim()) && m[1].trim().length <= 20) return tz;
  return null;
}

// When, as said. Returns the spec and the spans it was read from (so they can be cut out of the "what").
export function whenIn(text: string): { spec: WhenSpec; spans: [number, number][] } | null {
  const t = String(text ?? "").toLowerCase().replace(/[’`]/g, "'");
  const spans: [number, number][] = [];
  const take = (m: RegExpExecArray | null) => { if (m) spans.push([m.index, m.index + m[0].length]); return m; };
  let day: WhenSpec["day"] = null, time: WhenSpec["time"] = null, rel: number | null = null, evening = false;
  const r = take(/\bin (\d{1,3}|an?|one|two|three|four|five|six|ten|thirty|fifteen) ?(minutes?|mins?|hours?|hrs?|days?|weeks?)\b/.exec(t));
  if (r) {
    const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, fifteen: 15, thirty: 30 };
    const n = Number.isFinite(Number(r[1])) ? Number(r[1]) : words[r[1]] ?? 1, u = r[2];
    rel = n * (/^m/.test(u) ? MIN : /^h/.test(u) ? HOUR : /^d/.test(u) ? DAY : 7 * DAY);
  }
  let m: RegExpExecArray | null;
  if ((m = take(/\b(?:today|this (?:morning|afternoon|evening))\b/.exec(t)))) { day = { kind: "today" }; if (/afternoon/.test(m[0])) time = { h: 14, min: 0 }; if (/evening/.test(m[0])) time = { h: 18, min: 0 }; if (/morning/.test(m[0])) time = { h: 9, min: 0 }; }
  if ((m = take(/\btonight\b/.exec(t)))) { day = { kind: "today" }; evening = true; }
  if ((m = take(/\b(?:tomorrow|tmrw|tmr|tmw|tomorow|2morrow)\b/.exec(t)))) day = { kind: "tomorrow" };
  if ((m = take(new RegExp(`\\b(?:(?:this|next|on|by|coming) )?${WD_RX}\\b`).exec(t)))) day = { kind: "weekday", wd: wdIndex(m[1]) };
  if ((m = take(new RegExp(`\\b(?:on )?${MONTH_RX}\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(t)))) day = { kind: "date", m: monthIndex(m[1]) + 1, d: Number(m[2]) };
  else if ((m = take(/\b(?:on )?(\d{1,2})\/(\d{1,2})\b/.exec(t)))) day = { kind: "date", m: Number(m[1]), d: Number(m[2]) };
  if ((m = take(/\b(?:at )?(\d{1,2})(?::(\d{2}))? ?(a\.?m\.?|p\.?m\.?)(?![a-z])/.exec(t)))) {
    let h = Number(m[1]) % 12; if (/^p/.test(m[3])) h += 12;
    time = { h, min: Number(m[2] ?? 0) };
  } else if ((m = take(/\bat (\d{1,2})(?::(\d{2}))?\b(?! ?(?:%|percent|companies|jobs|roles))/.exec(t)))) {
    let h = Number(m[1]);
    if (h >= 1 && h <= 6) h += 12; else if (evening && h < 12) h += 12;
    time = { h: h % 24, min: Number(m[2] ?? 0) };
  } else if ((m = take(/\b(?:at )?(noon|midday|midnight)\b/.exec(t)))) time = { h: m[1] === "midnight" ? 0 : 12, min: 0 };
  else if ((m = take(/\b(?:in the |first thing (?:in the )?|end of (?:the )?)?(morning|afternoon|evening|night|eod|end of day|day)\b/.exec(t))) && (day || /morning|afternoon|evening|night|eod|end of day/.test(m[0]))) {
    const w = m[0];
    time = /morning/.test(w) ? { h: 9, min: 0 } : /afternoon/.test(w) ? { h: 14, min: 0 } : /evening/.test(w) ? { h: 18, min: 0 } : /night/.test(w) ? { h: 20, min: 0 } : /eod|end of/.test(w) ? { h: 17, min: 0 } : null;
    if (!time) spans.pop();
  }
  if (evening && !time) time = { h: 20, min: 0 };
  if (time && (time.h > 23 || time.min > 59)) return null;
  if (!day && !time && rel === null) return null;
  const said = spans.slice().sort((a, b) => a[0] - b[0]).map(([a, b]) => text.slice(a, b)).join(" ").replace(/\s+/g, " ").trim();
  return { spec: { day, time, rel, said }, spans };
}

// ------------------------------------------------------------------------------------------------ clock
function wall(ms: number, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, min: Number(p.minute), wd: wdIndex(String(p.weekday).toLowerCase()) };
}
// The instant a wall-clock time in a zone names (the later one when a clock change repeats an hour, the first valid
// minute after one it skips).
export function instantOf(y: number, m: number, d: number, h: number, min: number, tz: string): number {
  const want = Date.UTC(y, m - 1, d, h, min);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const w = wall(t, tz), seen = Date.UTC(w.y, w.m - 1, w.d, w.h, w.min);
    if (seen === want) return t;
    t += want - seen;
  }
  return t;
}
// Where the spec lands, counted from `anchor` in `tz`. "past": it names a time already gone.
export function resolveWhen(spec: WhenSpec, anchor: number, tz: string): { due: number; defaultTime: boolean } | "past" | "too_far" | "bad_date" {
  let due: number, defaultTime = false;
  if (spec.rel !== null && !spec.day && !spec.time) due = anchor + spec.rel;
  else {
    const now = wall(anchor, tz);
    const time = spec.time ?? (spec.day ? { h: DEFAULT_HOUR, min: 0 } : null);
    defaultTime = !spec.time;
    let y = now.y, m = now.m, d = now.d;
    const at = (yy: number, mm: number, dd: number) => instantOf(yy, mm, dd, time!.h, time!.min, tz);
    const plusDays = (n: number) => { const x = new Date(Date.UTC(now.y, now.m - 1, now.d + n)); return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()] as const; };
    if (!spec.day) { // a time alone: today if it is still ahead, else tomorrow
      due = at(y, m, d);
      if (due <= anchor) { [y, m, d] = plusDays(1); due = at(y, m, d); }
    } else if (spec.day.kind === "today") due = at(y, m, d);
    else if (spec.day.kind === "tomorrow") { [y, m, d] = plusDays(1); due = at(y, m, d); }
    else if (spec.day.kind === "weekday") {
      // A weekday is the coming one; today's own name means a week from today ("today" says today).
      let n = (spec.day.wd - now.wd + 7) % 7;
      if (n === 0) n = 7;
      [y, m, d] = plusDays(n); due = at(y, m, d);
    } else {
      if (spec.day.m < 1 || spec.day.m > 12 || spec.day.d < 1 || spec.day.d > 31) return "bad_date";
      const probe = new Date(Date.UTC(now.y, spec.day.m - 1, spec.day.d));
      if (probe.getUTCMonth() !== spec.day.m - 1) return "bad_date";
      due = at(now.y, spec.day.m, spec.day.d);
      if (due <= anchor) due = at(now.y + 1, spec.day.m, spec.day.d);
    }
  }
  if (due <= anchor) return "past";
  if (due - anchor > HORIZON_DAYS * DAY) return "too_far";
  return { due, defaultTime };
}
// The person's quiet hours hold: a time inside them moves to their end, that local morning.
export function outOfQuiet(due: number, tz: string, q: { start: number; end: number }): number {
  if (q.start === q.end) return due;
  const w = wall(due, tz), inQuiet = q.start > q.end ? (w.h >= q.start || w.h < q.end) : (w.h >= q.start && w.h < q.end);
  if (!inQuiet) return due;
  const next = w.h >= q.end && q.start > q.end ? new Date(Date.UTC(w.y, w.m - 1, w.d + 1)) : new Date(Date.UTC(w.y, w.m - 1, w.d));
  return instantOf(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), q.end, 0, tz);
}
export function spoken(ms: number, tz: string): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" }).format(new Date(ms));
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
  return `${day} at ${time} ${zoneLabel(tz)}`;
}
const hourWord = (h: number) => new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, h)));

// ------------------------------------------------------------------------------------------------ the asks
const LEAD = String.raw`(?:(?:hey|hi|yo|ok(?:ay)?|so|also|and|oh|pls|please|trainee)[,!]?\s+)*(?:(?:can|could|would|will) (?:you|u) (?:please |pls )?|please |pls |i need you to |i want you to |go ahead and )?`;
const TRIGGER = new RegExp(String.raw`^\s*${LEAD}(?:remind me|set (?:me )?(?:a|up a) reminder|set reminder|add a reminder|make a reminder|ping me|nudge me)\b`, "i");
export const isReminderAsk = (s: string) => TRIGGER.test(String(s ?? ""));
// The parts of a longer message: split at commas, semicolons, sentence boundaries and "and"/"then" before another
// ask. A sentence boundary counts only before another ask, so "email Dr. Smith" never splits and a decimal never
// does; without it, "How should I follow up? Remind me Friday …" was one clause no part of which is a reminder ask,
// and the reminder was never set at all.
const ACTION = "(?:remind|find|search|look|get|show|tailor|apply|watch|track|draft|write|send|email|message|prep|prepare|set|add|update|make|schedule)";
export function clausesOf(message: string): string[] {
  return String(message ?? "").split(new RegExp(String.raw`\s*(?:;|,\s*(?:and\s+|then\s+|and then\s+)?|[.!?]\s+(?=(?:me\s+)?(?:please\s+)?${ACTION}\b)|\s+(?:and then|and|then|also|plus)\s+(?=(?:me\s+)?(?:please\s+)?${ACTION}\b))\s*`, "i"))
    .map((c) => c.replace(/^[\s,.;:-]+|[\s,.;:!?-]+$/g, "")).filter((c) => c.length > 0);
}
// The message's sentences, for the reminder that opens it: a boundary after an abbreviation or an initial
// ("Dr. Smith", "J. R.") is not one.
const ABBREV = /^(?:dr|mr|mrs|ms|st|vs|jr|sr|prof|hon|sgt|capt|lt|col|gen|sen|rep|gov)$/i;
export function sentenceParts(message: string): string[] {
  const raw = String(message ?? "").replace(/\s+/g, " ").trim();
  const split = raw.split(/(?<=[.!?])\s+(?=[A-Z"“'(])/);
  const out: string[] = [];
  for (const s of split) {
    const prev = out[out.length - 1];
    const tail = prev ? /([A-Za-z]+)\.$/.exec(prev.trim()) : null;
    if (prev && tail && (tail[1].length === 1 || ABBREV.test(tail[1]))) out[out.length - 1] = `${prev} ${s}`;
    else out.push(s);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}
export interface ReminderParse { what: string; when: WhenSpec | null; zone: string | null; tooLong: boolean }
export function reminderParse(clause: string): ReminderParse {
  const s = String(clause ?? "").replace(/\s+/g, " ").trim();
  const head = TRIGGER.exec(s);
  let rest = head ? s.slice(head[0].length) : s;
  const w = whenIn(rest), zone = zoneIn(rest);
  // The words that said when (and the zone) are cut out of what to remind about.
  let cut = rest;
  if (w) for (const [a, b] of w.spans.slice().sort((x, y) => y[0] - x[0])) cut = cut.slice(0, a) + " " + cut.slice(b);
  cut = cut.replace(/\b(?:eastern|central|mountain|pacific|est|edt|cst|cdt|mst|mdt|pst|pdt|utc|gmt)(?: time)?\b/gi, " ").replace(/\b(?:ET|CT|MT|PT)\b/g, " ")
    .replace(/\b[A-Z][A-Za-z_]+\/[A-Z][A-Za-z_]+\b/g, " ");
  const m = /^\s*(?:[,.]?\s*)?(?:(?:on|at|by|for|in)\s+)*(?:(?:to|about|that|of|re:?)\s+)?([\s\S]*)$/i.exec(cut);
  let what = (m ? m[1] : cut).replace(/\s+/g, " ").replace(/^(?:(?:to|about|that|of)\s+)+/i, "").replace(/\s+(?:on|at|by|in|for)\s*$/i, "").replace(/^[\s,.;:-]+|[\s,.;:!?-]+$/g, "").trim();
  if (/^(?:please|pls|thanks?|thank you|ok|okay)$/i.test(what)) what = "";
  rest = what;
  return { what: rest.slice(0, WHAT_MAX), when: w ? w.spec : null, zone, tooLong: rest.length > WHAT_MAX };
}

const plainT = (s: string) => norm(s).replace(/[?!.]+\s*$/, " ").replace(/\s+/g, " ");
const PROGRESS = /^ (?:so |ok |okay |hey |and )?(?:status|progress|update|updates|any updates|status update|status check|what'?s the status|what is the status|what'?s my status|where are we(?: at)?|where are things|how'?s it going|how is it going|what'?s going on|what is going on|what'?s happening|what are you (?:working on|doing)(?: for me)?(?: right now| now)?|what'?s (?:pending|in progress|on my plate|left|running|scheduled)|what (?:is|do i have) (?:pending|in progress|scheduled|running)|what (?:have you done|did you do|are you doing)(?: for me)?(?: so far| today)?|what'?s on (?:my|the) list|give me (?:a|the) (?:status|progress) (?:update|report)|status report|progress report) $/;
const LIST = /^ (?:so |ok |and )?(?:(?:what|which) (?:are )?(?:my )?reminders(?: do i have)?(?: set)?|(?:show|list|see) (?:me )?(?:all )?(?:my |the )?reminders|(?:do i have|are there|any) (?:any )?reminders(?: set)?|my reminders|reminders|what (?:did i ask you to|will you) remind me(?: about| of)?) $/;
const CANCEL_THAT = /^ (?:ok(?:ay)?,? |actually,? |nah,? |no,? |hmm,? |wait,? |oh,? )?(?:(?:nvm|never ?mind|nevermind)[,.]? )?(?:(?:please |pls )?(?:cancel|scratch|undo|forget|drop|delete|remove|kill|nix) (?:that|it|this)(?: one)?(?: reminder)?(?: please| pls)?|nvm|never ?mind|nevermind|don'?t bother|no need|forget about it) $/;
const CANCEL_ALL = /^ (?:please )?(?:cancel|delete|remove|clear|drop) (?:all )?(?:of )?(?:my |the )?(?:reminders|all reminders)(?: please)? $|^ (?:please )?(?:cancel|delete|remove|clear) all (?:of )?my reminders $|^ stop (?:all )?reminders $/;
const CANCEL_ONE = /^ (?:please )?(?:cancel|delete|remove|drop|undo) (?:my |the |that )?reminder(?: (?:about|for|to|on|re:?) (.+?))? $|^ (?:please )?(?:don'?t|do not|no need to) remind me(?: (?:about|to|of) (.+?))?(?: anymore| after all)? $|^ stop reminding me(?: (?:about|to) (.+?))? $/;
const MOVE = /^ (?:(?:actually|ok(?:ay)?|no|wait|hmm|oh)[,]? )*(?:(?:can you |please |pls )?(?:make|move|change|push|switch|reschedule|set|bump|shift)(?: it| that| the reminder| my reminder(?: about .+?)?)? (?:to |for |till |until )?|(?:do it|instead) )?(.+?) (?:instead )?$/;
const ZONE_SET = /^ (?:(?:my )?(?:time ?zone|tz) (?:is|=|:)|set my (?:time ?zone|tz) (?:to|as)|(?:i'?m|i am|we'?re) (?:on|in) (?:the )?)(.+?) $/;

export type WorkflowAsk =
  | { kind: "remind"; parse: ReminderParse }
  | { kind: "remind_part"; parse: ReminderParse; others: string[] }
  | { kind: "progress" } | { kind: "list" }
  | { kind: "cancel_that" } | { kind: "cancel_all" } | { kind: "cancel_one"; about: string | null }
  | { kind: "move"; when: WhenSpec; zone: string | null }
  | { kind: "zone_set"; tz: string } | { kind: "answer"; text: string };
// What the message asks, from its words alone. "answer" is only a candidate (a zone or a when on its own): it counts
// when a reminder is waiting for exactly that.
export function workflowAsk(message: string): WorkflowAsk | null {
  const raw = String(message ?? "");
  if (raw.length > 4000) return null;
  const t = plainT(raw);
  if (PROGRESS.test(t)) return { kind: "progress" };
  if (LIST.test(t)) return { kind: "list" };
  if (CANCEL_ALL.test(t)) return { kind: "cancel_all" };
  const one = CANCEL_ONE.exec(t);
  if (one) return { kind: "cancel_one", about: (one[1] ?? one[2] ?? one[3] ?? null)?.trim() || null };
  if (CANCEL_THAT.test(t)) return { kind: "cancel_that" };
  const zs = ZONE_SET.exec(t);
  if (zs) { const tz = zoneAnswer(zs[1]) ?? zoneIn(zs[1]); if (tz && /time ?zone|tz| time\b|^ (?:i'?m|i am|we'?re) on /.test(t + " ")) return { kind: "zone_set", tz }; }
  // A message that starts with the ask is one reminder, its "and"s included ("remind me to call Sam and send the deck").
  // A reminder asked after other asks ("find 10 roles, tailor my resume for the top 3, and remind me Friday") is a part.
  if (isReminderAsk(raw)) {
    // …unless the reminder is only the message's first sentence: what follows the sentence boundary is other parts,
    // not more of the reminder's "what" ("Remind me Friday to check the portal. I'm so overwhelmed …" set the
    // reminder with the whole second sentence buried in its text, and that sentence was never answered). It counts
    // as split only when the first sentence parses as a reminder with a "what" of its own, or a later sentence is a
    // question; a fragment that completes the "what" ("Remind me Friday. I need to call Sam") stays one reminder.
    const sents = sentenceParts(raw);
    if (sents.length > 1 && isReminderAsk(sents[0])) {
      const parse = reminderParse(sents[0]);
      const rest = sents.slice(1);
      if (parse.what || rest.some((p) => /\?\s*$/.test(p))) return { kind: "remind_part", parse, others: rest };
    }
    return { kind: "remind", parse: reminderParse(raw) };
  }
  const parts = /\b(?:remind me|reminder|ping me|nudge me)\b/i.test(raw) ? clausesOf(raw) : [];
  if (parts.some((p) => isReminderAsk(p))) {
    const i = parts.findIndex((p) => isReminderAsk(p));
    if (parts.length > 1 && i >= 0) {
      const others = parts.filter((_, j) => j !== i);
      const parse = reminderParse(parts[i]);
      if (!parse.what) parse.what = others.join(", ").slice(0, WHAT_MAX);
      return { kind: "remind_part", parse, others };
    }
    return { kind: "remind", parse: reminderParse(raw) };
  }
  // "make it 3pm", "move it to monday", "actually friday at 4": a new when on its own (only right after a reminder reply).
  const mv = MOVE.exec(t);
  if (mv && raw.split(/\s+/).length <= 10 && /\b(?:make|move|change|push|switch|reschedule|set|bump|shift|actually|instead|do it)\b/.test(t)) {
    const w = whenIn(mv[1]);
    if (w && mv[1].replace(/\s+/g, " ").trim().length <= w.spec.said.length + 25) return { kind: "move", when: w.spec, zone: zoneIn(raw) };
  }
  if (raw.trim().split(/\s+/).length <= 8 && (zoneAnswer(raw) || whenIn(raw))) return { kind: "answer", text: raw };
  return null;
}

// ------------------------------------------------------------------------------------------------ the turn
export interface WorkflowReply { reply: string; status: string; intent: string }
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);
async function sha256(s: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const active = (r: Reminder) => r.state !== "cancelled";
const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const CHANNEL_WORD: Record<ChannelName, string> = { telegram: "on Telegram", whatsapp: "on WhatsApp", text: "by text message" };

// How a set reminder reaches the person, said exactly.
function reachLine(store: WorkflowStore, contact: { channel: ChannelName; opted_out: boolean } | null, r: Reminder): string {
  if (!store.deliveryOn) return "Sending reminders on their own isn't switched on yet, so no message will go out at that time; it stays on your list, and I show it whenever you ask \"status\".";
  if (!contact) return "No texting channel (Telegram, SMS or WhatsApp) is linked to your account, so it can't reach you on its own; it stays on your list, and I show it whenever you ask \"status\".";
  if (contact.opted_out) return "You texted STOP, so nothing goes out on its own until you text START; it stays on your list.";
  const wa = contact.channel === "whatsapp" ? " (WhatsApp holds it until you next write if you haven't written in the last 24 hours)" : "";
  return `I'll send it to you ${CHANNEL_WORD[contact.channel]} then${wa}.`;
}

// Puts a resolved reminder on the outbox (delivery on), or keeps it listed only (off).
async function schedule(store: WorkflowStore, userId: string, r: Reminder, due: number, defaultTime: boolean, now: number) {
  const quiet = await store.quietHours(userId);
  const at = outOfQuiet(due, r.tz!, quiet);
  r.due_at = new Date(due).toISOString(); r.deliver_at = new Date(at).toISOString(); r.quiet_moved = at !== due; r.default_time = defaultTime;
  r.updated_at = new Date(now).toISOString();
  if (store.deliveryOn) {
    r.rev += 1;
    const key = `status:reminder:${r.id}:${r.rev}`; // the outbox key check (20261021075000) allows status:…
    const text = `Reminder you asked for: ${r.what}`;
    if (!(await store.queue(userId, { key, text, at }))) throw new Error("the reminder could not be queued");
    r.outbox_key = key; r.state = "scheduled";
  } else { r.outbox_key = null; r.state = "kept"; }
  return quiet;
}
function setLine(r: Reminder, quiet: { start: number; end: number }): string {
  const due = Date.parse(r.due_at!), at = Date.parse(r.deliver_at!);
  const lines = [`Reminder set for ${spoken(due, r.tz!)}: ${r.what}.`];
  if (r.default_time) lines.push(`You didn't give a time, so I picked ${hourWord(DEFAULT_HOUR)}; tell me another time if you want.`);
  if (r.quiet_moved) lines.push(`That's inside your quiet hours (${hourWord(quiet.start)} to ${hourWord(quiet.end)}), so it goes out at ${spoken(at, r.tz!)} instead.`);
  return lines.join(" ");
}
const askLine = (r: Reminder) => r.state === "needs_zone"
  ? `Which time zone should I use for "${r.when?.said || "that"}"? Say Eastern, Central, Mountain or Pacific, or a city.`
  : `When should I remind you${r.what ? ` to ${r.what.replace(/^to /i, "")}` : ""}? Say a day and time, like "Friday at 9am".`;

export async function workflowTurn(o: { message: string; userId: string; now: number; store: WorkflowStore; apps?: () => Promise<{ jobs: AppRow[] | null; tracker: any[] | null }> }): Promise<WorkflowReply | null> {
  const ask = workflowAsk(o.message);
  if (!ask) return null;
  // The asks that only mean something right after a reminder reply.
  if (ask.kind === "cancel_that" || ask.kind === "move" || ask.kind === "answer") {
    const last = await o.store.lastWord(o.userId).catch(() => null);
    const doc0 = await o.store.load(o.userId);
    const waiting = doc0.reminders.filter((r) => r.state === "needs_zone" || r.state === "needs_when");
    if (ask.kind === "answer") {
      // A zone or a when on its own answers a reminder only while that question is the last word, or (a zone) when a
      // reminder from part of a longer message asked for it in the last 10 minutes (that question rode the router's reply).
      const fresh = waiting.some((r) => r.state === "needs_zone" && o.now - Date.parse(r.updated_at) < 10 * MIN) && !!zoneAnswer(ask.text);
      if (!((last === REMINDER_ASK_INTENT && waiting.length) || fresh)) return null;
    } else if (!(last && REMINDER_LAST_WORDS.has(last))) return null;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await o.store.load(o.userId);
    const prev = doc.rev;
    const out = await act(o, ask, doc);
    if (!out) return null;
    if (!out.changed) return out.reply;
    doc.rev = prev + 1;
    doc.reminders = trim(doc.reminders);
    if (await o.store.save(o.userId, doc, prev)) {
      for (const k of out.unqueue ?? []) await o.store.unqueue(o.userId, k).catch((e) => console.error("workflow: unqueue", e?.message ?? e));
      // Part of a longer message: the reminder is saved and the router answers the rest (workflowAfterTurn adds the line).
      return out.partial ? null : out.reply;
    }
    // Someone saved first: what this turn queued is taken back, and the turn runs again on the new record.
    for (const k of out.queued ?? []) await o.store.unqueue(o.userId, k).catch(() => {});
  }
  return { reply: "I couldn't save that just now, so nothing changed. Say it again in a moment.", status: "failed", intent: REMINDER_REFUSED_INTENT };
}
const trim = (rs: Reminder[]) => {
  const live = rs.filter(active), gone = rs.filter((r) => !active(r)).slice(-Math.max(0, KEPT_MAX - live.length));
  return [...gone, ...live].sort((a, b) => a.created_at.localeCompare(b.created_at));
};

type Acted = { reply: WorkflowReply; changed: boolean; unqueue?: string[]; queued?: string[]; partial?: boolean } | null;
async function act(o: Parameters<typeof workflowTurn>[0], ask: WorkflowAsk, doc: WorkflowDoc): Promise<Acted> {
  const nowIso = new Date(o.now).toISOString();
  const say = (reply: string, intent: string, status: string, changed = false, extra: Partial<NonNullable<Acted>> = {}): Acted => ({ reply: { reply, intent, status }, changed, ...extra });
  const live = doc.reminders.filter(active);
  switch (ask.kind) {
    case "progress": return say(await progressText(o, doc), PROGRESS_INTENT, "shown");
    case "list": {
      if (!live.length) return say("You have no reminders set. Say something like \"remind me Friday at 9am to follow up with Acme\".", REMINDERS_INTENT, "none");
      return say(await reminderLines(o.store, o.userId, live, o.now).then((ls) => [`Your reminders (${live.length}):`, ...ls].join("\n")), REMINDERS_INTENT, "shown");
    }
    case "zone_set": {
      doc.tz = { tz: ask.tz, said: o.message.slice(0, 120), at: nowIso };
      const lines = [`Time zone set: ${zoneLabel(ask.tz)} (${ask.tz}). Reminders use it from now on.`];
      const queued: string[] = [];
      for (const r of live.filter((x) => x.state === "needs_zone")) {
        const done = await resolveAndSchedule(o, r, ask.tz, queued);
        lines.push(done.line);
      }
      return say(lines.join("\n"), TIMEZONE_INTENT, "completed", true, { queued });
    }
    case "remind": case "remind_part": return remind(o, ask, doc, say);
    case "answer": {
      const r = [...live].reverse().find((x) => x.state === "needs_zone" || x.state === "needs_when")!;
      const queued: string[] = [];
      if (r.state === "needs_zone") {
        const tz = zoneAnswer(ask.text);
        if (!tz) return null;
        doc.tz = { tz, said: ask.text.slice(0, 120), at: nowIso };
        const done = await resolveAndSchedule(o, r, tz, queued);
        return say(done.line, done.ok ? REMINDER_SET_INTENT : REMINDER_ASK_INTENT, done.ok ? "completed" : "awaiting_user", true, { queued });
      }
      const w = whenIn(ask.text);
      if (!w) return null;
      r.when = w.spec; r.anchor = nowIso;
      const tz = zoneIn(ask.text) ?? r.tz ?? doc.tz?.tz ?? null;
      if (!tz) { r.state = "needs_zone"; r.updated_at = nowIso; return say(askLine(r), REMINDER_ASK_INTENT, "awaiting_user", true); }
      if (zoneIn(ask.text)) doc.tz = { tz, said: ask.text.slice(0, 120), at: nowIso };
      const done = await resolveAndSchedule(o, r, tz, queued);
      return say(done.line, done.ok ? REMINDER_SET_INTENT : REMINDER_ASK_INTENT, done.ok ? "completed" : "awaiting_user", true, { queued });
    }
    case "move": {
      const r = [...live].sort((a, b) => a.updated_at.localeCompare(b.updated_at)).pop();
      if (!r) return null;
      const old = r.outbox_key;
      const tz = ask.zone ?? r.tz ?? doc.tz?.tz ?? null;
      // A new time alone keeps the day; a new day alone keeps the time.
      const prevWhen = r.when;
      const merged: WhenSpec = { day: ask.when.day ?? (ask.when.rel === null ? prevWhen?.day ?? null : null), time: ask.when.time ?? (ask.when.rel === null && !r.default_time ? prevWhen?.time ?? null : null), rel: ask.when.rel, said: ask.when.said };
      if (!merged.day && ask.when.time && r.due_at && tz) {
        const w = wall(Date.parse(r.due_at), tz);
        merged.day = { kind: "date", m: w.m, d: w.d };
      }
      r.when = merged; r.anchor = new Date(o.now).toISOString();
      if (!tz) { r.state = "needs_zone"; r.updated_at = nowIso; return say(askLine(r), REMINDER_ASK_INTENT, "awaiting_user", true, { unqueue: old ? [old] : [] }); }
      if (ask.zone) doc.tz = { tz, said: o.message.slice(0, 120), at: nowIso };
      if (old) {
        const st = (await o.store.outbox(o.userId, [old])).get(old);
        if (st && st.status !== "queued") return say(`That reminder already went out (${st.status === "delivered" ? `sent ${spoken(Date.parse(st.delivered_at ?? st.deliver_at ?? nowIso), r.tz ?? tz)}` : "it is being sent now"}), so there is nothing to move. Say "remind me ..." to set a new one.`, REMINDER_REFUSED_INTENT, "blocked");
      }
      const queued: string[] = [];
      const done = await resolveAndSchedule(o, r, tz, queued);
      if (!done.ok) return say(done.line, REMINDER_ASK_INTENT, "awaiting_user", true, { unqueue: old ? [old] : [], queued });
      return say(done.line.replace(/^Reminder set for/, "Moved: your reminder is now set for"), REMINDER_MOVED_INTENT, "completed", true, { unqueue: old && old !== r.outbox_key ? [old] : [], queued });
    }
    case "cancel_that": case "cancel_all": case "cancel_one": {
      let chosen: Reminder[] = [];
      if (ask.kind === "cancel_all") chosen = live;
      else if (ask.kind === "cancel_that") { const r = [...live].sort((a, b) => a.updated_at.localeCompare(b.updated_at)).pop(); chosen = r ? [r] : []; }
      else {
        const words = String(ask.about ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["the", "about", "for", "and", "with", "reminder", "remind"].includes(w));
        chosen = words.length ? live.filter((r) => words.every((w) => r.what.toLowerCase().includes(w))) : live;
        if (!words.length && live.length > 1) {
          return say([`You have ${live.length} reminders; which one should I cancel? Say "cancel the reminder about ..." or "cancel all my reminders".`, ...(await reminderLines(o.store, o.userId, live, o.now))].join("\n"), REMINDERS_INTENT, "awaiting_user");
        }
      }
      if (!chosen.length) return say(live.length ? `None of your reminders is about "${clip(String(ask.kind === "cancel_one" ? ask.about : ""), 60)}", so nothing was cancelled. Say "what reminders do I have" to see them.` : "You have no reminders set, so there is nothing to cancel.", REMINDER_REFUSED_INTENT, "none");
      const unqueue: string[] = [], sent: Reminder[] = [], done: Reminder[] = [];
      for (const r of chosen) {
        if (r.outbox_key) {
          const st = (await o.store.outbox(o.userId, [r.outbox_key])).get(r.outbox_key);
          if (st && st.status !== "queued") { sent.push(r); continue; }
          unqueue.push(r.outbox_key);
        }
        r.state = "cancelled"; r.updated_at = nowIso; done.push(r);
      }
      const lines = [
        ...(done.length ? [done.length === 1 ? `Cancelled your reminder${done[0].due_at ? ` for ${spoken(Date.parse(done[0].due_at), done[0].tz!)}` : ""}: ${done[0].what}. Nothing will be sent for it.` : `Cancelled ${done.length} reminders; nothing will be sent for them.`] : []),
        ...sent.map((r) => `Already sent, so not cancelled: ${r.what}.`),
      ];
      return say(lines.join("\n"), done.length ? REMINDER_CANCELLED_INTENT : REMINDER_REFUSED_INTENT, done.length ? "completed" : "blocked", done.length > 0, { unqueue });
    }
  }
}

async function resolveAndSchedule(o: Parameters<typeof workflowTurn>[0], r: Reminder, tz: string, queued: string[]): Promise<{ ok: boolean; line: string }> {
  r.tz = tz;
  if (!r.when) { r.state = "needs_when"; r.updated_at = new Date(o.now).toISOString(); return { ok: false, line: askLine(r) }; }
  const res = resolveWhen(r.when, Date.parse(r.anchor), tz);
  if (res === "past" || res === "too_far" || res === "bad_date") {
    r.state = "needs_when"; r.when = null; r.updated_at = new Date(o.now).toISOString();
    const why = res === "past" ? `That time has already passed (it's ${spoken(o.now, tz).replace(/^.* at /, "")} now).` : res === "too_far" ? "That's more than a year away." : "That date doesn't exist.";
    return { ok: false, line: `${why} When should I remind you${r.what ? ` to ${r.what}` : ""}?` };
  }
  const quiet = await schedule(o.store, o.userId, r, res.due, res.defaultTime, o.now);
  if (r.outbox_key) queued.push(r.outbox_key);
  const contact = await o.store.contact(o.userId).catch(() => null);
  return { ok: true, line: `${setLine(r, quiet)} ${reachLine(o.store, contact, r)}` };
}

async function remind(o: Parameters<typeof workflowTurn>[0], ask: Extract<WorkflowAsk, { kind: "remind" | "remind_part" }>, doc: WorkflowDoc,
  say: (reply: string, intent: string, status: string, changed?: boolean, extra?: Partial<NonNullable<Acted>>) => Acted): Promise<Acted> {
  const p = ask.parse, nowIso = new Date(o.now).toISOString();
  if (p.tooLong) return say(`That's too long for a reminder: keep what to remind you about under ${WHAT_MAX} characters. Nothing was set.`, REMINDER_REFUSED_INTENT, "refused");
  const live = doc.reminders.filter(active);
  if (live.length >= ACTIVE_MAX) return say(`You already have ${live.length} reminders, the most I keep at once, so this one wasn't set. Cancel one first ("cancel the reminder about ...").`, REMINDER_REFUSED_INTENT, "refused");
  const said = await sha256(o.message);
  // The same words again (a retried send): the reminder already made from them stands, and nothing new is made.
  const same = live.find((r) => r.said_sha256 === said && o.now - Date.parse(r.created_at) < DAY);
  if (same) {
    const line = same.due_at ? `That reminder is already set for ${spoken(Date.parse(same.due_at), same.tz!)}: ${same.what}. Nothing new was added.` : askLine(same);
    return say(line, same.due_at ? REMINDER_SET_INTENT : REMINDER_ASK_INTENT, "duplicate");
  }
  if (p.zone) doc.tz = { tz: p.zone, said: o.message.slice(0, 120), at: nowIso };
  const r: Reminder = { id: newId(), what: p.what, state: "needs_when", created_at: nowIso, updated_at: nowIso, said_sha256: said, when: p.when, anchor: nowIso,
    tz: p.zone ?? doc.tz?.tz ?? null, due_at: null, deliver_at: null, quiet_moved: false, default_time: false, outbox_key: null, rev: 0 };
  doc.reminders.push(r);
  const queued: string[] = [];
  let line: string, ok = false;
  if (!r.when) {
    r.state = "needs_when";
    line = r.tz ? askLine(r) : `When should I remind you${r.what ? ` to ${r.what}` : ""}, and in which time zone? Say something like "Friday at 9am Eastern".`;
  } else if (!r.tz) { r.state = "needs_zone"; line = askLine(r); }
  else { const done = await resolveAndSchedule(o, r, r.tz, queued); line = done.line; ok = done.ok; }
  if (ask.kind === "remind_part") {
    // The router answers the rest of the message; the after-turn step adds this line to its reply (workflowAfterTurn).
    const tail = ok ? line.replace(/\s*Say "cancel that".*$/, "") : `Your reminder isn't set yet: ${line}`;
    await recordEvent(o.store.events, { user_id: o.userId, at: o.now, kind: "note", subject: `Reminder ${ok ? "set" : "waiting"}: ${clip(r.what, 120)}`, source: "chat",
      detail: { type: "reminder", reminder_id: r.id, state: r.state, message_sha256: said, line: tail, parts: ask.others.slice(0, 6) } });
    return { reply: { reply: "", intent: "", status: "" }, changed: true, queued, partial: true };
  }
  return say(ok ? `${line} Say "cancel that" to cancel it, or tell me a new time.` : line, ok ? REMINDER_SET_INTENT : REMINDER_ASK_INTENT, ok ? "completed" : "awaiting_user", true, { queued });
}

// ------------------------------------------------------------------------------------------------ readback
export async function reminderLines(store: WorkflowStore, userId: string, rs: Reminder[], now: number): Promise<string[]> {
  const keys = rs.map((r) => r.outbox_key).filter((k): k is string => !!k);
  const [box, contact] = await Promise.all([keys.length ? store.outbox(userId, keys).catch(() => null) : Promise.resolve(new Map<string, OutboxState>()), store.contact(userId).catch(() => null)]);
  return rs.map((r) => {
    if (r.state === "needs_zone") return `- ${r.what || "(no subject)"} (${r.when?.said || "no time yet"}): waiting for your time zone.`;
    if (r.state === "needs_when") return `- ${r.what || "(no subject)"}: waiting for you to say when.`;
    const when = spoken(Date.parse(r.due_at!), r.tz!), head = `- ${when}: ${r.what}.`;
    if (r.state === "kept") return `${head} ${Date.parse(r.due_at!) <= now ? "It was due then; " : ""}sending reminders on their own isn't switched on, so it is listed here only.`;
    const st = r.outbox_key && box ? box.get(r.outbox_key) : undefined;
    if (!box) return `${head} Whether it was sent could not be read just now.`;
    if (!st) return `${head} Its message is not queued any more, so it will not be sent.`;
    if (st.status === "delivered") return `${head} Sent ${spoken(Date.parse(st.delivered_at ?? st.deliver_at!), r.tz!)}.`;
    if (st.status === "skipped_opt_out") return `${head} Not sent: Trainee was paused or stopped when it was due.`;
    if (st.status === "sending") return `${head} Being sent now.`;
    if (st.status === "failed") return `${head} Sending failed; it is tried again.`;
    if (st.status === "held") return `${head} Held by WhatsApp until you next write there.`;
    const reach = !contact ? " Not sent until a texting channel (Telegram, SMS or WhatsApp) is linked." : contact.opted_out ? " Not sent while you have texted STOP." : ` Goes to you ${CHANNEL_WORD[contact.channel]}${r.quiet_moved ? ` at ${spoken(Date.parse(r.deliver_at!), r.tz!)}, after your quiet hours` : ""}.`;
    return `${head}${reach}`;
  });
}

async function progressText(o: Parameters<typeof workflowTurn>[0], doc: WorkflowDoc): Promise<string> {
  const lines: string[] = [], unread: string[] = [];
  const live = doc.reminders.filter(active);
  const [alerts, queue, apps] = await Promise.all([
    o.store.alerts(o.userId).catch(() => { unread.push("job alerts"); return undefined; }),
    o.store.applyQueue(o.userId).catch(() => { unread.push("apply queue"); return undefined; }),
    o.apps ? o.apps().catch(() => { unread.push("applications"); return undefined; }) : Promise.resolve(undefined),
  ]);
  if (live.length) lines.push(`Reminders: ${live.length}.`, ...(await reminderLines(o.store, o.userId, live, o.now)));
  if (alerts) lines.push(alerts.on ? `Job alerts: on, watching ${alerts.watches.join("; ") || "your saved roles"}.` : `Job alerts: stopped. ${alerts.watches.length ? `Your watches stay saved (${alerts.watches.join("; ")}); say "resume my job alerts" to turn them back on.` : ""}`.trim());
  if (queue && queue.length) {
    const waiting = queue.filter((q) => q.state === "waiting"), taken = queue.filter((q) => q.state !== "waiting");
    if (waiting.length) lines.push(`Apply queue: ${waiting.length} ${waiting.length === 1 ? "posting waits" : "postings wait"} for the Trainee extension to prepare ${waiting.length === 1 ? "it" : "them"} (${waiting.slice(0, 5).map((q) => `${q.company}${q.title ? `, ${q.title}` : ""}`).join("; ")}${waiting.length > 5 ? "; and more" : ""}). Nothing is sent without your approval on its card.`);
    if (taken.length) lines.push(`${taken.length} queued ${taken.length === 1 ? "posting was" : "postings were"} taken by the extension to prepare.`);
  }
  if (apps) {
    const jobs = apps.jobs ?? [];
    if (jobs.length) lines.push(`Applications: ${statusReply("where are my applications", jobs, o.now)?.reply ?? ""}`.trim());
    const tracked = Array.isArray(apps.tracker) ? apps.tracker : [];
    if (tracked.length) lines.push(`Your tracker: ${tracked.length} ${tracked.length === 1 ? "application" : "applications"} you told me about (${tracked.slice(0, 5).map((a: any) => a?.company || "company not stated").join("; ")}${tracked.length > 5 ? "; and more" : ""}).`);
    if (apps.jobs === null) unread.push("applications");
  }
  if (unread.length) lines.push(`I couldn't read your ${[...new Set(unread)].join(" and ")} just now, so ${unread.length === 1 ? "it isn't" : "they aren't"} in this list.`);
  if (!lines.length || lines.every((l) => /^I couldn't read/.test(l))) {
    return [`Nothing is in progress for you right now: no reminders, no job alerts, nothing in your apply queue, and no applications on record.`, ...lines,
      `Tell me what you want done, for example "find data analyst roles in Chicago" or "remind me Friday at 9am to follow up with Acme".`].join("\n");
  }
  return ["Here is everything in progress for you, read from your records just now:", ...lines].join("\n");
}

// ------------------------------------------------------------------------------------------------ after the router
// Part of a longer message set a reminder before the router answered the rest: its line goes on the router's reply, with
// the parts of the message the router's answer did not take up named as not started (nothing is claimed for them).
const INTENT_PARTS: [RegExp, RegExp][] = [
  [/^career_(?:discovery|search|jobs|role_search)/, /\b(?:find|search|look|get|show|list)\b/i],
  [/^career_tailor/, /\b(?:tailor|resume|cv)\b/i],
  [/^career_watch/, /\b(?:watch|alert|notify|let me know)\b/i],
  [/^career_(?:apply|batch_apply)/, /\bapply\b/i],
  [/^career_(?:track|tracking|apply_status)/, /\b(?:track|applied|status)\b/i],
  [/^conversation_recall/, /\b(?:discuss|discussed|talk|talked|conversation|recap)\b/i],
];
export async function workflowAfterTurn(o: { message: string; userId: string; now: number; out: { reply: string; intent?: string | null; handler?: string | null }; events: EventStore | null | undefined }): Promise<string | null> {
  if (!o.events || !isReminderAsk(o.message) && !/\bremind me\b/i.test(o.message)) return null;
  if (o.out.handler === "standing") return null;
  const said = await sha256(o.message);
  let notes: CareerEvent[] = [];
  try { notes = await o.events.recall(o.userId, { kinds: ["note"], from: new Date(o.now - 10 * MIN).toISOString(), limit: 10 }); } catch (e) { console.error("workflow: notes unreadable", (e as Error)?.message ?? e); return null; }
  const note = notes.find((e) => (e.detail as any)?.type === "reminder" && (e.detail as any)?.message_sha256 === said);
  if (!note) return null;
  const d = note.detail as { line?: string; parts?: string[] };
  const intent = String(o.out.intent ?? "");
  const taken = INTENT_PARTS.find(([rx]) => rx.test(intent))?.[1] ?? null;
  const parts = Array.isArray(d.parts) ? d.parts : [];
  const untaken = parts.filter((p) => !(taken && taken.test(p)));
  const lines = [String(d.line ?? "")];
  if (untaken.length) lines.push(`Not started from the same message: ${untaken.map((p) => `"${clip(p, 80)}"`).join("; ")}. Ask for ${untaken.length === 1 ? "it" : "each"} on its own and I'll do it.`);
  return lines.filter(Boolean).join("\n");
}

// ------------------------------------------------------------------------------------------------ Supabase
// deno-lint-ignore no-explicit-any
export function supabaseWorkflow(admin: any, o: { deliveryOn: boolean }): WorkflowStore {
  const must = (r: { error: { message: string } | null }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); };
  return {
    deliveryOn: o.deliveryOn,
    events: supabaseEventStore(admin),
    async load(u) {
      const r = await admin.from("career_watch_kv").select("value").eq("user_id", u).eq("key", WORKFLOW_KEY).maybeSingle();
      must(r, "read reminders");
      const v = r.data?.value;
      return v && typeof v === "object" && Array.isArray(v.reminders) ? { rev: Number(v.rev) || 0, tz: v.tz ?? null, reminders: v.reminders } : emptyDoc();
    },
    async save(u, doc, prevRev) {
      if (prevRev === 0) {
        const ins = await admin.from("career_watch_kv").insert({ user_id: u, key: WORKFLOW_KEY, value: doc });
        if (!ins.error) return true;
        if (ins.error.code === "23505" || /duplicate key/i.test(ins.error.message)) {
          // An empty record left by an erase or a first write: replace it only if it is still at revision 0.
          const up = await admin.from("career_watch_kv").update({ value: doc, updated_at: new Date().toISOString() }).eq("user_id", u).eq("key", WORKFLOW_KEY).eq("value->>rev", "0").select("key");
          must(up, "save reminders");
          return (up.data ?? []).length === 1;
        }
        must(ins, "save reminders");
      }
      const up = await admin.from("career_watch_kv").update({ value: doc, updated_at: new Date().toISOString() }).eq("user_id", u).eq("key", WORKFLOW_KEY).eq("value->>rev", String(prevRev)).select("key");
      must(up, "save reminders");
      return (up.data ?? []).length === 1;
    },
    async queue(u, m) {
      const r = await admin.from("career_outbox").insert({ user_id: u, key: m.key, kind: "status", text: m.text, deliver_at: new Date(m.at).toISOString() });
      if (r.error && (r.error.code === "23505" || /duplicate key/i.test(r.error.message))) return false;
      must(r, "queue the reminder");
      return true;
    },
    async unqueue(u, key) {
      const del = await admin.from("career_outbox").delete().eq("user_id", u).eq("key", key).eq("status", "queued").select("key");
      must(del, "take the reminder off the queue");
      if ((del.data ?? []).length) return "removed";
      const r = await admin.from("career_outbox").select("status").eq("user_id", u).eq("key", key).maybeSingle();
      must(r, "read the reminder's message");
      return r.data ? String(r.data.status) : "missing";
    },
    async outbox(u, keys) {
      const out = new Map<string, OutboxState>();
      if (!keys.length) return out;
      const r = await admin.from("career_outbox").select("key,status,delivered_at,deliver_at").eq("user_id", u).in("key", keys);
      must(r, "read the reminders' messages");
      for (const row of r.data ?? []) out.set(row.key, { status: row.status, delivered_at: row.delivered_at ?? null, deliver_at: row.deliver_at ?? null });
      return out;
    },
    async contact(u) {
      const r = await admin.from("channel_contacts").select("contact,opted_out").eq("user_id", u).limit(1);
      must(r, "read the linked channel");
      const c = r.data?.[0];
      if (!c) return null;
      const contact = String(c.contact);
      return { channel: contact.startsWith("tg:") ? "telegram" : contact.startsWith("wa:") ? "whatsapp" : "text", opted_out: !!c.opted_out };
    },
    async quietHours(u) {
      const r = await admin.from("career_alert_prefs").select("prefs").eq("user_id", u).maybeSingle();
      if (r.error || !r.data?.prefs) return { ...DEFAULT_QUIET };
      const p = r.data.prefs, ok = (h: unknown) => Number.isInteger(h) && (h as number) >= 0 && (h as number) <= 23;
      return { start: ok(p.quiet_start) ? p.quiet_start : DEFAULT_QUIET.start, end: ok(p.quiet_end) ? p.quiet_end : DEFAULT_QUIET.end };
    },
    async lastWord(u) {
      const th = await admin.from("agent_threads").select("id").eq("user_id", u).limit(200);
      must(th, "read the threads");
      const ids = (th.data ?? []).map((t: any) => t.id);
      if (!ids.length) return null;
      const m = await admin.from("agent_messages").select("meta").in("thread_id", ids).eq("role", "assistant").order("id", { ascending: false }).limit(1);
      must(m, "read the last reply");
      const intent = m.data?.[0]?.meta?.intent;
      return typeof intent === "string" ? intent : null;
    },
    async alerts(u) {
      const r = await admin.from("career_alert_prefs").select("prefs").eq("user_id", u).maybeSingle();
      must(r, "read job alerts");
      const p = r.data?.prefs;
      if (!p) return null;
      const ints = Array.isArray(p.interests) && p.interests.length ? p.interests : [{ keywords: p.keywords ?? [], locations: p.locations ?? [], remote_ok: p.remote_ok }];
      const watches = ints.map((i: any) => `${(i.keywords ?? []).join(" ") || "roles"} (${[...(i.locations ?? []), ...(i.remote_ok === false ? [] : ["remote"])].join(" + ") || "any location"})`);
      return { on: p.on === true, watches };
    },
    async applyQueue(u) {
      const r = await admin.from("career_apply_wanted").select("company,title,state").eq("user_id", u).order("queued_at", { ascending: true }).limit(200);
      must(r, "read the apply queue");
      return (r.data ?? []).map((x: any) => ({ company: String(x.company || "an employer"), title: String(x.title || ""), state: String(x.state) }));
    },
  };
}
