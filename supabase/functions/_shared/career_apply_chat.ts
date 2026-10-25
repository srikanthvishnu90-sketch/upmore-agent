// From chat to the person's apply queue (STEP 4 F1, 2026-10-25). "apply to the <role> role at <Company>" or "apply to
// <Company>" puts the matching open posting on file into career_apply_wanted, the same queue the Trainee extension
// takes from and the server's prepare-ahead run draws candidates from (career_apply_prepare_candidates). The reply says
// what was queued and that nothing is prepared, filled or sent by it: preparation uses only confirmed facts, the form's
// open questions are asked of the person in chat, and the exact application goes only on their tap on its card.
// A posting not on file is said so, never invented; a second ask for the same posting queues nothing twice; the screens
// the brain's queue_applications applies (their current employer, an application there in the last 30 days) apply here.
// No product ceiling (owner, 2026-10-22: no cap on applications): only a daily pace the person set themselves is read,
// and only once the turn is an apply ask; the once-per-employer guard, the exact-payload approval on each card and the
// site limits stand. The batch ask (SERIAL-1410 (1): "apply to these", "apply to the top 2", "apply to 3 roles", "apply
// to the second one") queues from the postings the thread last listed (the router's discovery.lastShortlist), each one
// through the same screens on its own; the reply lists what was queued and what was not, with the reason for each. With
// no list on the thread the batch ask is not this turn's.
import { COMPANY_COOLDOWN_DAYS, INT4_MAX, type Limits, PACE_RE } from "./career_apply.ts";
import { type Pick, queueWants, screenPicks, type WantStore } from "./career_apply_want.ts";
import type { AppRow } from "./career_apply_status.ts";
import { searchWords } from "./career_ingest.ts";
import { sameCompany, type TrackedApp } from "./career_mail.ts";

export const APPLY_QUEUE_INTENT = "career_apply_queue";
const CO = "([A-Z][A-Za-z0-9&.'’-]*(?:\\s+(?:[A-Z][A-Za-z0-9&.'’-]*|\\d+|of|and|&))*)";
const QUESTION = /^\s*(how|what|where|when|should|can|could|would|do|does|did|is|are|am|why|which)\b/i;
const BATCH = /\b(these|those|them|all of|the ones|each of|every|\d+\s+(roles?|jobs?|postings?|internships?|positions?))\b/i;

// The ask: a role at a named employer, or a named employer alone. Questions ("how do I apply to X?") and batch shapes
// are never this ask.
export function applyAsk(message: string): { company: string; role: string | null } | null {
  const raw = String(message ?? "").trim();
  if (!/\bapply\b/i.test(raw) || QUESTION.test(raw) || BATCH.test(raw)) return null;
  let m = raw.match(new RegExp(`\\bapply\\s+(?:me\\s+)?(?:to|for)\\s+(?:the\\s+|that\\s+|this\\s+)?(.+?)\\s+(?:role|position|job|internship|opening)\\s+at\\s+${CO}\\s*[.!]?\\s*$`, "i"));
  if (m) return { role: m[1].trim(), company: m[2].trim() };
  m = raw.match(new RegExp(`\\bapply\\s+(?:me\\s+)?(?:to|at|for)\\s+${CO}\\s*[.!]?\\s*$`, "i"));
  if (m) return { role: null, company: m[1].trim() };
  return null;
}

// The batch ask: the listed postings (all, the first N, the Nth, or N of them). Questions, past tense and a named employer
// ("apply to the analyst role at Acme": the single ask's) are never this ask.
export type ManyAsk = { kind: "all" } | { kind: "first"; n: number } | { kind: "nth"; i: number };
const WORD_N: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
const numOf = (w: string) => /^\d+$/.test(w) ? Number(w) : WORD_N[w.toLowerCase()];
export function applyManyAsk(message: string): ManyAsk | null {
  const raw = String(message ?? "").trim();
  if (!/\bapply\b/i.test(raw) || QUESTION.test(raw) || /\bapplied\b/i.test(raw) || /\bat\s+[A-Z]/.test(raw)) return null;
  const t = raw.toLowerCase().replace(/[.!]+$/, "").replace(/\s+/g, " ");
  const after = t.match(/\bapply\b(?:\s+me)?(?:\s+(?:to|for))?\s+(.*)$/)?.[1];
  if (after === undefined) return null;
  let m = after.match(/^(?:the\s+)?(first|second|third|fourth|fifth)\s+one\b/);
  if (m) return { kind: "nth", i: ORD[m[1]] };
  m = after.match(/^(?:the\s+)?(?:top|first|best)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  if (m) return { kind: "first", n: numOf(m[1]) };
  m = after.match(/^(?:all\s+)?(\d{1,3}|two|three|four|five|six|seven|eight|nine|ten)\s+(?:[a-z-]+\s+){0,3}?(?:roles?|jobs?|postings?|positions?|internships?|openings?|of (?:them|these|those))\b/);
  if (m) return { kind: "first", n: numOf(m[1]) };
  if (/^(?:all\s+(?:of\s+)?)?(?:these|those|them|both|each of (?:these|those|them)|every one of (?:these|those|them)|them all|the ones (?:you )?(?:just )?listed|the list|all)\b/.test(after)) return { kind: "all" };
  return null;
}

const lower = (s: unknown) => String(s ?? "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// What the queue recorded, as an application for the once-per-employer screen: a row that was approved or went counts;
// one that failed before anything left, or stopped for the person, does not.
const COUNTED = new Set(["queued", "driving", "submitted_unconfirmed", "confirmed", "unknown_outcome"]);
export function trackedFromRows(rows: AppRow[]): TrackedApp[] {
  return rows.map((r) => ({ ref: r.id, company: r.company, role: r.title ?? undefined, applied_at: r.created_at, stage: COUNTED.has(r.state) ? "Submitted" : "Saved", source: "queue" as const }));
}

export interface ApplyChatDeps {
  message: string; userId: string; now: number;
  postings: { search(words: string[], limit: number): Promise<any[]> };
  wants: WantStore;
  apps: () => Promise<AppRow[]>;
  facts: any[];
  // The postings the thread last listed (the router's discovery.lastShortlist), for the batch ask.
  shortlist?: ShortlistEntry[] | null;
  // The person's own daily pace, if they set one (never a product number), read only once the turn is an apply ask. A
  // reader that throws is retried once; still failing, the turn queues nothing and says the pace could not be read.
  limits?: () => Promise<Limits | undefined>;
  tz?: string;
}
export interface ShortlistEntry { id?: string | null; title?: string | null; company?: string | null; location?: string | null; url?: string | null }
export type ApplyChatResult = {
  reply: string; status: "queued" | "already" | "none" | "which" | "refused" | "unreadable" | "pace_unknown" | "pace_unreadable" | "no_list"; intent: typeof APPLY_QUEUE_INTENT;
  posting?: { job_id: string; company: string; title: string };
  // The batch ask: what went into the queue and what did not, each with its reason.
  queued?: { job_id: string; company: string; title: string }[]; refused?: { job_id: string | null; company: string; title: string; reason: string }[];
};

// SERIAL-1420 (b) / SERIAL-1430: the person's pace from the database, in its three states (career_apply_pace_state): none
// (daily null), set (daily n), unreadable (daily null and the stored value in `unreadable`). A lookup error is thrown,
// never read as "no pace": unknown is not no preference.
export function paceReader(admin: { rpc(name: string, args: Record<string, unknown>): PromiseLike<any> }, userId: string): () => Promise<Limits> {
  return async () => {
    let r: any;
    try { r = await admin.rpc("career_apply_pace_state", { p_user: userId }); }
    catch (e) { throw new Error(`pace lookup failed: ${String((e as Error)?.message ?? e)}`); }
    if (r?.error) throw new Error(`pace lookup failed: ${String(r.error.message ?? r.error)}`);
    const row = Array.isArray(r?.data) ? r.data[0] : r?.data;
    if (!row || typeof row !== "object") throw new Error("pace lookup failed: no row");
    if (row.state === "set") return { daily: Number(row.pace) };
    if (row.state === "unreadable") return { daily: null, unreadable: String(row.raw ?? "") };
    return { daily: null };
  };
}
// The pace, tried twice; `unknown` when both tries fail (the turn then queues nothing and says so).
export async function readPace(limits?: () => Promise<Limits | undefined>): Promise<{ limits?: Limits; unknown?: string }> {
  if (!limits) return {};
  let why = "";
  for (let i = 0; i < 2; i++) {
    try { return { limits: await limits() }; }
    catch (e) { why = String((e as Error)?.message ?? e); }
  }
  return { unknown: why };
}
const PACE_UNKNOWN = "I couldn't read your daily pace just now, so I don't know how many you want a day; nothing was queued. Ask again in a minute.";
const PACE_UNREADABLE = (raw: string) =>
  `Your saved daily pace could not be read (it says ${JSON.stringify(raw)}), so I don't know how many you want a day; nothing was queued. Say "set my daily pace to N" (a whole number) or "no daily pace", then ask again.`;
export const PACE_INTENT = "career_apply_pace";
const PACE_RULE = "a whole number from 1 to 2147483647, or \"no daily pace\"";

// SERIAL-1430 (b): the person sets or clears their pace in chat. Questions and other numbers are never this ask.
export function paceAsk(message: string): { pace: string | null } | null {
  const raw = String(message ?? "").trim();
  if (QUESTION.test(raw) || /\bapplied\b/i.test(raw)) return null;
  const t = raw.toLowerCase().replace(/[.!]+$/, "").replace(/\s+/g, " ").trim();
  let m = t.match(/^(?:set|change|make|put)\s+my\s+(?:daily\s+)?(?:pace|limit|cap)(?:\s+to|\s+at|\s*[:=])\s+(.+?)(?:\s+(?:a|per)\s+day)?$/);
  if (m) return { pace: /^(none|no limit|no pace|no daily pace|nothing|off|clear)$/.test(m[1]) ? null : m[1] };
  m = t.match(/^apply\s+(?:to\s+)?(?:at most\s+|up to\s+)?(\S+)\s+(?:a|per)\s+day$/);
  if (m) return { pace: m[1] };
  if (/^(?:no|remove|clear|drop|turn off|lift)\s+(?:my\s+)?(?:daily\s+)?(?:pace|limit|cap)$|^no daily (?:pace|limit|cap)$|^(?:remove|clear|drop)\s+my\s+daily\s+(?:pace|limit|cap)$/.test(t)) return { pace: null };
  return null;
}
export type PaceTurnResult = { reply: string; status: "set" | "none" | "refused" | "unreadable"; intent: typeof PACE_INTENT };
export async function paceTurn(o: { message: string; userId: string; admin: { rpc(name: string, args: Record<string, unknown>): PromiseLike<any> } }): Promise<PaceTurnResult | null> {
  const ask = paceAsk(o.message);
  if (!ask) return null;
  const intent = PACE_INTENT;
  // The same rule as the store's, here first so an impossible number is refused in the person's words before any write.
  if (ask.pace !== null && !(PACE_RE.test(ask.pace) && Number(ask.pace.trim()) >= 1 && Number(ask.pace.trim()) <= INT4_MAX)) {
    return { reply: `${ask.pace} is not a pace I can keep: ${PACE_RULE}. Your pace is unchanged.`, status: "refused", intent };
  }
  let r: any;
  try { r = await o.admin.rpc("career_apply_pace_set", { p_user: o.userId, p_pace: ask.pace === null ? "none" : ask.pace.trim() }); }
  catch (e) { r = { error: { message: String((e as Error)?.message ?? e) } }; }
  if (r?.error) {
    const msg = String(r.error.message ?? r.error);
    if (/invalid pace/.test(msg)) return { reply: `${ask.pace} is not a pace I can keep: ${PACE_RULE}. Your pace is unchanged.`, status: "refused", intent };
    return { reply: "I couldn't save that just now, so your pace is unchanged. Say it again in a minute.", status: "unreadable", intent };
  }
  if (ask.pace === null) return { reply: "Done: no daily pace. I queue what you ask for, one application per employer in 30 days, and each goes only when you approve it on the card that shows it exactly.", status: "none", intent };
  const n = Number(r?.data?.pace ?? ask.pace);
  return { reply: `Done: your daily pace is ${n} a day. I won't queue more than that in a day; say "no daily pace" to lift it, or a new number to change it.`, status: "set", intent };
}


const NOTHING_SENT = (company: string) =>
  `Nothing is sent and nothing is filled yet: I prepare it before you ask, from the facts you confirmed and a resume tailored to it; if the form asks something you haven't told me, I'll ask you here. The exact application goes to ${company} only when you approve it on the card that shows it exactly.`;

export async function applyTurn(o: ApplyChatDeps): Promise<ApplyChatResult | null> {
  // The batch ask first: applyAsk's employer grammar is case-blind, so "apply to the top 2" would read as an employer.
  if (applyManyAsk(o.message)) return applyManyTurn(o);
  const ask = applyAsk(o.message);
  if (!ask) return null;
  const intent = APPLY_QUEUE_INTENT;
  // Only an open posting on file (career_postings) is this turn's: when none matches, or the read fails, the turn is
  // not claimed, and the router answers the ask as it always has (its own served list, its honest named stop).
  let hits: any[];
  try { hits = await o.postings.search(searchWords(ask.company), 50); }
  catch { return null; }
  const atCompany = hits.filter((p) => sameCompany(p?.company, ask.company) || lower(p?.company) === lower(ask.company));
  const roleWords = ask.role ? searchWords(ask.role) : [];
  const matching = roleWords.length ? atCompany.filter((p) => { const t = lower(p?.title); return roleWords.every((w) => t.includes(lower(w))); }) : atCompany;
  if (!matching.length) {
    if (!atCompany.length) return null;
    const near = `${ask.company} has ${atCompany.length === 1 ? "one open posting" : `${atCompany.length} open postings`} on file: ${atCompany.slice(0, 3).map((p) => p.title).join("; ")}.`;
    return { reply: `I have no open posting for ${ask.role} at ${ask.company} on file, so nothing was queued. ${near} Say "apply to the <role> role at ${ask.company}" for one of those, or paste the posting's link.`, status: "none", intent };
  }
  if (matching.length > 1 && !ask.role) {
    return { reply: `${ask.company} has ${matching.length} open postings on file. Which one? ${matching.slice(0, 5).map((p, i) => `${i + 1}. ${p.title}`).join(" ")} Say "apply to the <role> role at ${ask.company}".`, status: "which", intent };
  }
  const p = matching[0];
  const pick: Pick = { job_id: p.job_id, url: p.url, company: p.company, title: p.title, location: p.location };
  let apps: TrackedApp[];
  try { apps = trackedFromRows(await o.apps()); }
  catch { return { reply: "I couldn't read your applications just now, so I couldn't rule out one already sent there; nothing was queued. Ask again in a minute.", status: "unreadable", intent }; }
  const screened = screenPicks([pick], { apps, facts: o.facts ?? [], now: o.now });
  if (!screened.ok.length) {
    const why = screened.refused[0]?.reason ?? `nothing was queued`;
    return { reply: `Not queued: ${why}. (Trainee applies to an employer once in ${COMPANY_COOLDOWN_DAYS} days.)`, status: "refused", intent, posting: { job_id: p.job_id, company: p.company, title: p.title } };
  }
  const pace = await readPace(o.limits);
  if (pace.unknown !== undefined) return { reply: PACE_UNKNOWN, status: "pace_unknown", intent, posting: { job_id: p.job_id, company: p.company, title: p.title } };
  if (pace.limits?.unreadable !== undefined) return { reply: PACE_UNREADABLE(pace.limits.unreadable), status: "pace_unreadable", intent, posting: { job_id: p.job_id, company: p.company, title: p.title } };
  const r = await queueWants(o.wants, o.userId, screened.ok, o.now, { limits: pace.limits, tz: o.tz });
  const posting = { job_id: p.job_id, company: p.company, title: p.title };
  if (r.queued) return { reply: `Queued: ${p.title} at ${p.company} is on your apply list. ${NOTHING_SENT(p.company)}`, status: "queued", intent, posting };
  if (r.already) return { reply: `${p.title} at ${p.company} is already in your queue, so nothing changed. ${NOTHING_SENT(p.company)}`, status: "already", intent, posting };
  const why = r.refused[0]?.reason ?? "it could not be queued";
  return { reply: `Not queued: ${why}.`, status: "refused", intent, posting };
}

const NOTHING_SENT_MANY = "Nothing is sent and nothing is filled yet: I prepare each one before you ask, from the facts you confirmed and a resume tailored to it; if a form asks something you haven't told me, I'll ask you here. Each application goes to its employer only when you approve it on the card that shows it exactly; one card can carry several, and one yes to that card approves exactly what it shows.";
const nameOf = (p: { title?: string | null; company?: string | null }) => `${p.title || "the posting"} at ${p.company || "an employer not on record"}`;
const listed = (names: string[], max = 12) => names.length <= max ? names.join("; ") : `${names.slice(0, max).join("; ")}; and ${names.length - max} more`;

// The batch ask over the thread's last listed postings: null with no ask, or no list (the router's turn, as before).
export async function applyManyTurn(o: ApplyChatDeps): Promise<ApplyChatResult | null> {
  const ask = applyManyAsk(o.message);
  if (!ask) return null;
  const list = (o.shortlist ?? []).filter((e) => e && (e.url || e.id));
  const intent = APPLY_QUEUE_INTENT;
  // SERIAL-1440 (2): with no list on this thread the ask still gets an answer that says what to say, never a catch-all.
  if (!list.length) {
    return { reply: `I haven't listed any postings in this thread yet, so there is nothing for "these" to mean; nothing was queued. Say "find <role> jobs in <place>" first and then "apply to these", or name one: "apply to the <role> role at <Company>".`, status: "no_list", intent, queued: [], refused: [] };
  }
  let slice: ShortlistEntry[], note = "";
  if (ask.kind === "nth") {
    if (ask.i > list.length) return { reply: `I listed ${list.length}, so there is no ${["first", "second", "third", "fourth", "fifth"][ask.i - 1]} one; nothing was queued. Say which of the ${list.length} you mean.`, status: "none", intent };
    slice = list.slice(ask.i - 1, ask.i);
  } else if (ask.kind === "first") {
    if (ask.n < 1) return null;
    slice = list.slice(0, ask.n);
    if (ask.n > list.length) note = `I listed ${list.length}, not ${ask.n}, so these ${list.length}. `;
  } else slice = list.slice();
  const picks: Pick[] = slice.map((e) => ({ job_id: e.id ?? undefined, url: e.url ?? undefined, company: e.company ?? undefined, title: e.title ?? undefined, location: e.location ?? undefined }));
  let apps: TrackedApp[];
  try { apps = trackedFromRows(await o.apps()); }
  catch { return { reply: "I couldn't read your applications just now, so I couldn't rule out one already sent to any of these; nothing was queued. Ask again in a minute.", status: "unreadable", intent }; }
  // Each posting through the same screens as a single ask, on its own: their current employer, an application there in 30 days.
  const screened = screenPicks(picks, { apps, facts: o.facts ?? [], now: o.now });
  const refused = screened.refused.map((r) => ({ job_id: r.posting.job_id, company: r.posting.company, title: r.posting.title, reason: r.reason }));
  let queued: { job_id: string; company: string; title: string }[] = [], already = 0;
  if (screened.ok.length) {
    const pace = await readPace(o.limits);
    if (pace.unknown !== undefined) return { reply: PACE_UNKNOWN, status: "pace_unknown", intent, queued: [], refused };
    if (pace.limits?.unreadable !== undefined) return { reply: PACE_UNREADABLE(pace.limits.unreadable), status: "pace_unreadable", intent, queued: [], refused };
    const r = await queueWants(o.wants, o.userId, screened.ok, o.now, { limits: pace.limits, tz: o.tz });
    queued = r.items.map((w) => ({ job_id: w.posting_key, company: w.company, title: w.title }));
    already = r.already;
    for (const x of r.refused) refused.push({ job_id: x.posting.job_id, company: x.posting.company, title: x.posting.title, reason: x.reason });
  }
  const parts: string[] = [];
  if (queued.length) parts.push(`Queued ${queued.length}${slice.length > queued.length ? ` of the ${slice.length}` : ""}${ask.kind === "all" && !note ? " I listed" : ""}: ${listed(queued.map(nameOf))}.`);
  if (already) parts.push(queued.length ? `${already} already in your queue, unchanged.` : `${already === slice.length ? (slice.length === 1 ? "That one is" : "Those are") : `${already} of them are`} already in your queue, so nothing changed.`);
  if (refused.length) parts.push(`Not queued: ${listed(refused.map((r) => `${nameOf(r)}: ${r.reason}`), 8)}.`);
  const status = queued.length ? "queued" : already ? "already" : "refused";
  const tail = queued.length || already ? ` ${NOTHING_SENT_MANY}` : refused.length ? ` (Trainee applies to an employer once in ${COMPANY_COOLDOWN_DAYS} days.)` : "";
  return { reply: `${note}${parts.join(" ")}${tail}`.trim(), status, intent, queued, refused };
}
