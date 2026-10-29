// The posting screen's gate (FEATURES F09, gap closed): every apply path (single ask, batch ask, the possible-match
// answer, the brain's queue_applications) passes its picks through gatePicks BEFORE anything is queued, so no payload
// is prepared or shown for approval for a stale, closed, scam-looking or knocked-out posting.
//   * stale / closed / scam / knock-out mismatch against a CONFIRMED fact: excluded, with a short reason;
//   * a knock-out the person has not confirmed a fact for: held, and asked ONCE per batch (never guessed, D-007);
//   * D-MS-3: only an exact duplicate blocks (the screen's own already_applied / duplicate_in_batch); no per-company rule;
//   * NO LIMITS (D-MS-2): no count cap anywhere; the batch is screened in one pass.
// The pure screen is career_apply_screen.ts; this file adapts the chat's fact list and posting records to it.
import { type ExcludeReason, type ScreenFacts, type ScreenFactKey, type ScreenPosting, screenBatch } from "./career_apply_screen.ts";

// What a pick may carry beyond its identity: the posting record's own text and dates, copied from the record on file.
export interface PostingContent { description?: string | null; posted_at?: string | null; first_seen_at?: string | null; closed_at?: string | null; remote?: string | null; apply_url?: string | null }
export interface GatePick { url?: string; job_id?: string; company?: string; title?: string; location?: string; content?: PostingContent }
export const contentOf = (rec: any): PostingContent | undefined => rec && typeof rec === "object"
  ? { description: rec.description ?? null, posted_at: rec.posted_at ?? null, first_seen_at: rec.first_seen_at ?? null, closed_at: rec.closed_at ?? null, remote: rec.remote ?? null, apply_url: rec.apply_url ?? null }
  : undefined;

// The chat's confirmed-fact list (profile facts + facts stated in chat) as the screen's keyed facts. A fact counts only
// when it names its schema key (`key`, `fact_key`, or a `kind` that is one) and was not left unconfirmed or in draft.
const KEYS = new Set(["location", "country", "relocation", "sponsorship", "work_authorization", "citizenship", "years_experience", "education_level", "skills"]);
export function screenFactsFrom(facts: any[]): ScreenFacts {
  const out: ScreenFacts = {};
  const skills: string[] = [];
  for (const f of facts ?? []) {
    if (!f || f.needs_confirmation || f.status === "draft") continue;
    const k = String(f.key ?? f.fact_key ?? f.kind ?? "");
    if (f.kind === "skill" && (f.name || f.value)) { skills.push(String(f.name ?? f.value)); continue; }
    if (!KEYS.has(k) || f.value === undefined || f.value === null || String(f.value).trim() === "") continue;
    out[k] = { value: f.value, confirmed: true, id: f.id };
  }
  if (skills.length) out.skills = { value: skills, confirmed: true };
  // Work authorization answers the citizenship / sponsorship knock-outs only when it says so in a yes/no of its own.
  return out;
}

export type DropKind = "stale" | "closed" | "scam" | "knockout" | "duplicate";
const KIND: Record<ExcludeReason, DropKind> = {
  closed: "closed", stale: "stale", scam: "scam", already_applied: "duplicate", duplicate_in_batch: "duplicate",
  location: "knockout", sponsorship: "knockout", citizenship: "knockout", years: "knockout", degree: "knockout",
};
export interface Dropped { posting: { job_id: string | null; company: string; title: string; url: string }; kind: DropKind; reason: ExcludeReason; why: string }
export interface GateResult {
  ok: GatePick[];
  dropped: Dropped[];
  held: { job_id: string | null; company: string; title: string; url: string; facts: ScreenFactKey[] }[]; // waiting on a fact the person has not confirmed
  asks: { fact: ScreenFactKey; question: string; count: number }[]; // each missing fact once
  counts: { total: number; ok: number; dropped: number; held: number; by_kind: Partial<Record<DropKind, number>> };
}

export function gatePicks(picks: GatePick[], o: { facts: any[]; now: number }): GateResult {
  const sp: (ScreenPosting & { _i: number })[] = picks.map((p, _i) => ({
    _i, job_id: p.job_id ?? null, url: p.url ?? null, company: p.company ?? null, title: p.title ?? null, location: p.location ?? null,
    description: p.content?.description ?? null, posted_at: p.content?.posted_at ?? null, first_seen_at: p.content?.first_seen_at ?? null,
    closed_at: p.content?.closed_at ?? null, remote: p.content?.remote ?? null, apply_url: p.content?.apply_url ?? null,
  }));
  const b = screenBatch("", sp, screenFactsFrom(o.facts), { now: o.now });
  const idOf = (x: { _i?: number }) => x._i as number;
  const id = (p: GatePick) => ({ job_id: p.job_id ? String(p.job_id) : null, company: String(p.company ?? ""), title: String(p.title ?? ""), url: String(p.url ?? "") });
  const by_kind: Partial<Record<DropKind, number>> = {};
  const dropped = b.exclude.map((x) => {
    const kind = KIND[x.reason];
    by_kind[kind] = (by_kind[kind] ?? 0) + 1;
    return { posting: id(picks[idOf(x as any)]), kind, reason: x.reason, why: x.why } as Dropped;
  });
  const askCount = new Map<ScreenFactKey, number>();
  const held = b.needs_fact.map((x) => { for (const f of x.facts) askCount.set(f, (askCount.get(f) ?? 0) + 1); return { ...id(picks[idOf(x as any)]), facts: x.facts }; });
  const asks = b.asks.map((a) => ({ fact: a.fact, question: a.question, count: askCount.get(a.fact) ?? a.keys.length }));
  return {
    ok: b.include.map((x) => picks[idOf(x as any)]), dropped, held, asks,
    counts: { total: picks.length, ok: b.include.length, dropped: dropped.length, held: held.length, by_kind },
  };
}

// The batch summary line the person reads: counts and short reasons, nothing hidden. "" when nothing was screened out.
export function gateSummary(g: GateResult, name: (p: { title?: string; company?: string }) => string, max = 8): string {
  if (!g.dropped.length && !g.held.length) return "";
  const lab: Record<DropKind, string> = { stale: "stale", closed: "closed", scam: "scam-looking", knockout: "knock-out mismatch", duplicate: "duplicate" };
  const kinds = Object.entries(g.counts.by_kind).map(([k, n]) => `${n} ${lab[k as DropKind]}`);
  const parts: string[] = [];
  if (g.dropped.length) {
    const shown = g.dropped.slice(0, max).map((d) => `${name(d.posting)}: ${d.why}`);
    parts.push(`Screened out ${g.dropped.length} (${kinds.join(", ")}): ${shown.join("; ")}${g.dropped.length > max ? `; and ${g.dropped.length - max} more` : ""}.`);
  }
  if (g.held.length) {
    parts.push(`${g.held.length} held until you confirm a fact, not guessed: ${g.asks.map((a) => a.question).join(" ")}`);
  }
  return parts.join(" ");
}
