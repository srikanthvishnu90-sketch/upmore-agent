// From chat to the person's apply queue (STEP 4 F1, 2026-10-25). "apply to the <role> role at <Company>" or "apply to
// <Company>" puts the matching open posting on file into career_apply_wanted, the same queue the Trainee extension
// takes from and the server's prepare-ahead run draws candidates from (career_apply_prepare_candidates). The reply says
// what was queued and that nothing is prepared, filled or sent by it: preparation uses only confirmed facts, the form's
// open questions are asked of the person in chat, and the exact application goes only on their tap on its card.
// A posting not on file is said so, never invented; a second ask for the same posting queues nothing twice; the same
// screens the brain's queue_applications applies (their current employer, a recent application there, the daily limit)
// apply here. Batch shapes ("apply to these", "apply to 25 roles") are not this turn's: they stay where they are.
import { COMPANY_COOLDOWN_DAYS, type Limits } from "./career_apply.ts";
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
  // The daily limit, read only once the turn is an apply ask (a reader that runs on every turn would cost every turn a
  // database call and would wake stubs that never expected one).
  limits?: Limits | (() => Promise<Limits | undefined>); tz?: string;
}
export type ApplyChatResult = { reply: string; status: "queued" | "already" | "none" | "which" | "refused" | "unreadable"; intent: typeof APPLY_QUEUE_INTENT; posting?: { job_id: string; company: string; title: string } };

const NOTHING_SENT = (company: string) =>
  `Nothing is sent and nothing is filled yet: I prepare it before you ask, from the facts you confirmed and a resume tailored to it; if the form asks something you haven't told me, I'll ask you here. The exact application goes to ${company} only when you approve it on its card.`;

export async function applyTurn(o: ApplyChatDeps): Promise<ApplyChatResult | null> {
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
  const limits = typeof o.limits === "function" ? await o.limits().catch(() => undefined) : o.limits;
  const r = await queueWants(o.wants, o.userId, screened.ok, o.now, { limits, tz: o.tz });
  const posting = { job_id: p.job_id, company: p.company, title: p.title };
  if (r.queued) return { reply: `Queued: ${p.title} at ${p.company} is on your apply list. ${NOTHING_SENT(p.company)}`, status: "queued", intent, posting };
  if (r.already) return { reply: `${p.title} at ${p.company} is already in your queue, so nothing changed. ${NOTHING_SENT(p.company)}`, status: "already", intent, posting };
  const why = r.refused[0]?.reason ?? "it could not be queued";
  return { reply: `Not queued: ${why}.`, status: "refused", intent, posting };
}
