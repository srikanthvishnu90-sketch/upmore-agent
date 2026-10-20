// WO-033 part 5: the referral map. For the person's top target firms (at most 20: the firms they named, then the ones on
// their account), the warm paths in their OWN exports only: their connections export (a 1st-degree connection at the
// firm), the people on any list they sent who went to their school (alumni), and their own past internships and jobs
// (confirmed facts). Ranked by module 135's warmth (alumni 40, 1st-degree 20, cross-city discount disclosed); every
// path names the row it came from. Nothing here fetches anything: never LinkedIn automation, no profile URL is read.
import { CareerGraph } from "./router_core.career.js";
import { type ContactRow, normalizeFirm, sameFirm } from "./career_contacts.ts";
import { confirmed, factText } from "./career_outreach.ts";

export const REFERRAL_ASK = "Export your LinkedIn connections (Settings, Data privacy, Get a copy of your data) and send me the file.";
export const MAX_TARGETS = 20, PATHS_PER_FIRM = 5;
const G: any = CareerGraph;
const plain = (s: unknown) => String(s ?? "").toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const hasWords = (hay: string, needle: string) => { const n = plain(needle); return !!n && ` ${plain(hay)} `.includes(` ${n} `); };

// The targets, in order: what the person named, then what their account holds (their stated target firm, alert words
// that name a firm). One spelling per firm, at most 20.
export function targetFirms(lists: string[][]): string[] {
  const out: string[] = [];
  for (const list of lists) for (const raw of list ?? []) {
    const f = normalizeFirm(raw);
    if (f && !out.some((x) => sameFirm(x, f)) && out.length < MAX_TARGETS) out.push(f);
  }
  return out;
}

export interface Path { name: string; title: string; why: string[]; score: number; source: string; adjustments: string[] }
export interface FirmMap { firm: string; paths: Path[]; more: number; own: { fact: string; text: string }[] }
export interface ReferralMap { firms: FirmMap[]; schools: string[]; rows: number; ms: number; ask?: string; note?: string }

// The connections the older importer kept (122 ingestLinkedIn: name/company/position/connectedOn) read as rows too.
export function legacyRows(connections: unknown): ContactRow[] {
  return (Array.isArray(connections) ? connections : []).map((c: any, i: number) => ({
    file: "LinkedIn connections (imported earlier)", row: i + 1, name: String(c?.name ?? c?.full_name ?? "").trim(), email: c?.email ?? null,
    firm: normalizeFirm(c?.company ?? c?.current_firm ?? ""), firm_raw: String(c?.company ?? ""), company: normalizeFirm(c?.company ?? ""),
    title: String(c?.position ?? c?.title ?? ""), school: String(c?.school ?? ""), connected_on: c?.connectedOn ?? c?.connected_on ?? "imported",
  })).filter((r) => r.name);
}

export function referralMap(o: { targets: string[]; rows: ContactRow[]; facts: unknown[]; now?: () => number }): ReferralMap {
  const clock = o.now ?? (() => performance.now());
  const t0 = clock();
  const facts = confirmed(o.facts);
  const factTexts = facts.map((f) => ({ id: String(f.id ?? ""), kind: String(f.kind ?? ""), text: factText(f) }));
  // The person's schools: a school on a row that one of their confirmed facts names.
  const schools = [...new Set(o.rows.map((r) => r.school).filter(Boolean))].filter((s) => factTexts.some((f) => hasWords(f.text, s)));
  if (!o.rows.length && !facts.length) return { firms: [], schools, rows: 0, ms: Math.round(clock() - t0), ask: REFERRAL_ASK };
  const firms: FirmMap[] = [];
  for (const firm of o.targets.slice(0, MAX_TARGETS)) {
    const at = o.rows.filter((r) => r.firm && sameFirm(r.firm, firm));
    const store = G.makeGraphStore();
    store.people = at.map((r) => G.normalizePerson({
      person_id: `${r.file}#${r.row}`, full_name: r.name, current_firm: firm, title: r.title, schools: r.school ? [r.school] : [],
      connection_degree: r.connected_on ? 1 : null, relationship_to_user: r.connected_on ? "1st-degree connection" : "none",
      source_list: [`${r.file}, row ${r.row}`],
    }));
    const found = G.findPaths(store, firm, { school: schools[0] ?? null }, {});
    const rowsByScore = (found.paths as any[]).filter((p) => p.score > 0).map((p) => ({
      name: p.name, title: p.title || "", score: p.score, adjustments: (p.adjustments ?? []).map((a: any) => a.note),
      why: (p.why as string[]).map((w) => (w.startsWith("alumni:") ? `went to ${w.slice(7)}, as you did` : w === "1st-degree" ? "a 1st-degree connection" : w)),
      source: (p.sources ?? [])[0] ?? "",
    }));
    // Their own internship or job there, from a confirmed fact (never a draft).
    const own = factTexts.filter((f) => ["experience", "internship", "leadership", "other"].includes(f.kind) && (hasWords(f.text, firm) || f.text.split(/[\s,;()/|]+/).some((_, i, w) => [1, 2, 3].some((k) => sameFirm(w.slice(i, i + k).join(" "), firm)))))
      .map((f) => ({ fact: f.id, text: f.text.slice(0, 160) }));
    firms.push({ firm, paths: rowsByScore.slice(0, PATHS_PER_FIRM), more: Math.max(0, rowsByScore.length - PATHS_PER_FIRM), own });
  }
  const out: ReferralMap = { firms, schools, rows: o.rows.length, ms: Math.round(clock() - t0) };
  if (!o.rows.length) out.ask = REFERRAL_ASK;
  return out;
}
