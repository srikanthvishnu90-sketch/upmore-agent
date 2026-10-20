// WO-037: the 200-role labeled set for alert precision. Real postings (read by the product's own feed reader), each
// paired with one of the personas in personas.json, picked to be hard: for every persona a share the alert gate passes
// and near misses of each kind (the floor says no, the place is wrong, the title is close, another title for the same
// work). A person labels each row match / no match for that persona (scripts/career/label-alerts.ts); the eval
// (evals/career/alert-precision.ts) scores the gate against those labels. Precision counts only rows a person labeled.
//   The gate: career_alerts.ts matchPosting, the exact function the alerts run calls, with the persona's stated prefs.
import { matchPosting, type AlertPrefs } from "../../../supabase/functions/_shared/career_alerts.ts";
import { relevanceFloor } from "../../../supabase/functions/_shared/career_floor.ts";
import { validPrefs } from "../../../supabase/functions/_shared/career_alert_store.ts";

export interface Persona { id: string; who: string; prefs: Record<string, unknown>; synonyms: string[] }
export interface PoolPosting {
  job_id: string; provider: string; board: string; company: string; title: string; location: string; url: string;
  posted_at: string | null; description: string; department?: string;
}
export type Stratum = "gate_pass" | "near_miss_floor" | "near_miss_place" | "near_miss_title" | "near_miss_synonym";
export const STRATA: Stratum[] = ["gate_pass", "near_miss_floor", "near_miss_place", "near_miss_title", "near_miss_synonym"];
// Of each persona's 20 rows: 8 the gate passes, 3 of each near miss. A short stratum is filled from the others.
export const QUOTA: Record<Stratum, number> = { gate_pass: 8, near_miss_floor: 3, near_miss_place: 3, near_miss_title: 3, near_miss_synonym: 3 };
export interface Row { id: string; persona: string; stratum: Stratum; gate: boolean; posting: PoolPosting }
export type Label = "match" | "no_match";
export interface LabelFile { kind: "human" | "assumed"; note: string; rubric?: string; labels: Record<string, { label: Label; by: string; at: string; why?: string }> }

export function prefsOf(p: Persona): AlertPrefs {
  const r = validPrefs(p.prefs);
  if (!r.ok) throw new Error(`persona ${p.id}: ${r.error}`);
  return r.prefs;
}
const asOpen = (x: PoolPosting) => ({ ...x, closed_at: null, first_seen_at: x.posted_at || "2026-10-20T00:00:00Z" });
const GENERIC = new Set(["engineer", "engineering", "manager", "analyst", "specialist", "coordinator", "representative", "lead", "associate"]);
const words = (s: string) => String(s || "").toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);

// The alert gate's own answer for this persona and posting.
export function gate(x: PoolPosting, prefs: AlertPrefs): boolean { return matchPosting(asOpen(x), prefs); }

// Which stratum a posting falls in for a persona, or null when it is nowhere near (not worth a person's time).
export function stratumOf(x: PoolPosting, p: Persona, prefs: AlertPrefs = prefsOf(p)): Stratum | null {
  if (gate(x, prefs)) return "gate_pass";
  const noFloor = { ...prefs, floor: undefined };
  const everywhere = { ...noFloor, locations: [], remote_ok: true };
  if (gate(x, noFloor) && prefs.floor && !relevanceFloor(asOpen(x), prefs.floor).pass) return "near_miss_floor";
  if (!gate(x, noFloor) && gate(x, { ...everywhere, floor: prefs.floor })) return "near_miss_place";
  const title = new Set(words(x.title));
  // Sharing only a generic word ("engineer", "manager") is not close; sharing the specific one ("data", "nurse") is.
  const kw = prefs.keywords.flatMap(words).filter((w) => !GENERIC.has(w));
  if (kw.some((w) => title.has(w)) && !gate(x, everywhere)) return "near_miss_title";
  const t = ` ${words(x.title).join(" ")} `;
  if (p.synonyms.some((s) => t.includes(` ${words(s).join(" ")} `))) return "near_miss_synonym";
  return null;
}

// A stable pseudo-random order (FNV-1a), so the set is the same on every machine.
export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

// 20 rows per persona (10 personas -> 200), at most 2 per company per persona, one row per posting overall.
export function buildRows(pool: PoolPosting[], personas: Persona[], perPersona = 20): Row[] {
  const out: Row[] = [], used = new Set<string>();
  for (const p of personas) {
    const prefs = prefsOf(p);
    const buckets = new Map<Stratum, PoolPosting[]>(STRATA.map((s) => [s, []]));
    for (const x of pool) { const s = stratumOf(x, p, prefs); if (s) buckets.get(s)!.push(x); }
    for (const list of buckets.values()) list.sort((a, b) => fnv(p.id + a.job_id) - fnv(p.id + b.job_id));
    const perCompany = new Map<string, number>();
    const mine: Row[] = [];
    const take = (s: Stratum, n: number) => {
      for (const x of buckets.get(s)!) {
        if (n <= 0 || mine.length >= perPersona) return;
        const c = x.company.toLowerCase();
        if (used.has(x.job_id) || (perCompany.get(c) ?? 0) >= 2) continue;
        used.add(x.job_id); perCompany.set(c, (perCompany.get(c) ?? 0) + 1);
        mine.push({ id: `${p.id}-${String(mine.length + 1).padStart(2, "0")}`, persona: p.id, stratum: s, gate: s === "gate_pass", posting: x });
        n--;
      }
    };
    for (const s of STRATA) take(s, QUOTA[s]);
    for (const s of STRATA) take(s, perPersona - mine.length); // fill a short stratum from the others
    out.push(...mine);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the score
export interface Score {
  status: "NOT_RUN" | "MEASURED"; labeled: number; skipped_unlabeled: number;
  tp: number; fp: number; fn: number; tn: number; precision: number | null; recall: number | null;
  precision_ci95: [number, number] | null; alerts: number;
}
// Wilson score interval for a proportion (95%): honest at small n, never outside 0..1.
export function wilson(k: number, n: number, z = 1.96): [number, number] | null {
  if (n <= 0) return null;
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
// Precision and recall of the gate against labels. A row without a label is skipped, never counted either way.
export function score(rows: Row[], labels: LabelFile, personas: Persona[]): Score {
  const byId = new Map(personas.map((p) => [p.id, prefsOf(p)]));
  let tp = 0, fp = 0, fn = 0, tn = 0, labeled = 0;
  for (const r of rows) {
    const l = labels.labels[r.id];
    if (!l || (l.label !== "match" && l.label !== "no_match")) continue;
    labeled++;
    const said = gate(r.posting, byId.get(r.persona)!), yes = l.label === "match";
    if (said && yes) tp++; else if (said && !yes) fp++; else if (!said && yes) fn++; else tn++;
  }
  return { status: labeled ? "MEASURED" : "NOT_RUN", labeled, skipped_unlabeled: rows.length - labeled, tp, fp, fn, tn,
    precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, precision_ci95: wilson(tp, tp + fp), alerts: tp + fp };
}
