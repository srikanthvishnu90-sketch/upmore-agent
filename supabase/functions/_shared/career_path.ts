// WO-036: "how do I get into X", answered only from data in the repo.
//   - X's own programs, timelines and stated requirements (packages/career-data/firm-guide.json, each with its URL and
//     the date it was checked);
//   - X's H-1B filings (DOL LCA aggregate, packages/career-data/datasets/dol-lca-fy2025q4-cir-companies.json, and the
//     wage cells when imported);
//   - the person's confirmed facts and tracked applications.
// Who X actually hired comes only from People Data Labs aggregates (career_hired.ts, live with the owner's PDL_API_KEY):
// counts by school, prior employer, major and degree, nothing under 5, never a named person. Without them the answer
// says so in one line and never describes hired candidates. Hired-background frequencies are not a probability of being
// hired, and the answer says that in words. A probability is given only from a base rate X published, with
// its source; otherwise the answer says no honest number exists and what would decide it. Each of the (up to) 3 moves
// is derived from a gap between a confirmed fact and a stated requirement and cites both; there are no generic tips.
// WO-041: a date a program's timeline states that is already past when the answer is given is said to have passed, with
// "the next cycle's date is not published yet" (the next date is never guessed), and "apply inside its window" is never
// a move for a closed program (every date it states past). A date stated without a year is said to have none, never
// given one. A program page the last source check found gone is said so, and statements from pages no check has opened
// are labeled unverified.
import { CareerPaths } from "./router_core.career.js";
import { hasWord, MAX_MESSAGE, MIN_N, payData, type OfferData } from "./career_offer.ts";
import { type HiredResult, hiredText } from "./career_hired.ts";

export const MAX_MOVES = 3;
export function hiredDataLine(name: string): string { return `I don't have data on who ${name} actually hired yet.`; }

export interface Fact { id: string; kind?: string; text: string }
export interface StatedDate { said: string; date: string; kind: "deadline" | "opens" | "date" }
export interface Requirement { id: string; program: string; kind: string; text: string; source_url: string; checked_at: string; any?: string[]; not?: string[]; count?: number; min?: number; from?: string | null; to?: string | null }
export type Status = "met" | "unmet" | "unknown";
export interface Check { requirement: Requirement; status: Status; fact: Fact | null; gap: string | null }
export interface Move { rank: number; action: string; requirement: { id: string; text: string; program: string; source_url: string; checked_at: string }; status: Status; fact: { id: string; text: string } | null; gap: string | null }
export interface PathResult {
  status: "answered" | "no_record";
  firm: { id: string; name: string } | null;
  programs: { name: string; timeline: string | null; source_url: string; checked_at: string; past_dates: StatedDate[]; source_status: string }[];
  lca: { period: string; cases: number; median: number | null; n: number | null; top_titles: { title: string; cases: number }[]; source_url: string } | null;
  hired_data: string;
  hired: { status: "NOT_WIRED" | "ok" | "unavailable"; n: number | null };
  probability: { kind: "base_rate"; statement: string; source_url: string; checked_at: string; publisher: string } | { kind: "none"; reason: string; decided_by: string[] };
  moves: Move[];
  messages: string[];
}

const lc = (s: unknown) => String(s ?? "").toLowerCase();
function host(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }
const cite = (r: { source_url: string; checked_at: string }) => `${host(r.source_url)}, checked ${r.checked_at}`;
const paths = CareerPaths as any;
// The dates a program's timeline states that are past on `now`'s day (UTC), read by 134 statedDates. A past opening
// date of a window whose stated deadline is still ahead is not news, so it is left out.
export function pastDatesOf(p: { timeline?: string | null }, now: number): StatedDate[] {
  const past: StatedDate[] = paths.pastDates(p.timeline ?? "", now);
  const deadlines = (paths.statedDates(p.timeline ?? "") as StatedDate[]).filter((d) => d.kind === "deadline").length;
  return deadlines > past.filter((d) => d.kind === "deadline").length ? past.filter((d) => d.kind !== "opens") : past;
}
// Closed: every dated date the timeline states is past, one is not just an opening, and none is said without a year
// (134 programDates). A date said without a year ("close October 1") is never given one.
const closedOf = (p: any, now: number): boolean => !!p?.timeline && paths.programDates(p.timeline, now).closed;
const undatedOf = (p: any): { said: string; kind: string }[] => paths.undatedDates(p?.timeline ?? "");
export function undatedLine(p: any): string | null {
  const u = undatedOf(p);
  if (!u.length) return null;
  const list = u.map((d) => d.said).join(" and ");
  return `${list} ${u.length === 1 ? "is" : "are"} stated without a year, so I can't tell whether ${u.length === 1 ? "it has" : "they have"} passed; check the page.`;
}
const dateWords = (d: StatedDate) => d.kind === "deadline" ? `the deadline ${d.said}` : d.kind === "opens" ? `the opening date ${d.said}` : d.said;
// "As of 2026-10-20, the deadline 11 October 2026 has passed. The next cycle's date is not published yet in my sources;
// I won't guess it." It names no date the data does not state.
export function pastLine(past: StatedDate[], now: number): string | null {
  if (!past.length) return null;
  const today = new Date(now).toISOString().slice(0, 10);
  const words = past.map(dateWords);
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return `As of ${today}, ${list} ${past.length === 1 ? "has" : "have"} passed. The next cycle's date is not published yet in my sources; I won't guess it.`;
}
// "Unverified: ..." for the cited pages the last source check did not open (live or redirected), grouped by why; null
// when every cited page was opened. Gone pages are said on their own line by the caller.
export function unverifiedSources(urls: string[], checks: any): string | null {
  const unopened: string[] = [], refused: string[] = [];
  let when: string | null = null;
  for (const u of [...new Set(urls)]) {
    const s = paths.sourceStatus(u, checks);
    if (s.verified || s.status === "gone") continue;
    if (s.status === "unverified") unopened.push(host(u));
    else { refused.push(host(u)); when = s.checked; }
  }
  const out: string[] = [];
  const hosts = (h: string[]) => [...new Set(h)].join(", ");
  if (unopened.length) out.push(`Unverified: the statements from ${hosts(unopened)} are search summaries of the cited pages; no source check has opened those pages yet.`);
  if (refused.length) out.push(`Unverified: the pages from ${hosts(refused)} could not be opened at the ${when} source check.`);
  return out.length ? out.join(" ") : null;
}
const short = (t: string, n = 110) => (t.length <= n ? t : t.slice(0, t.lastIndexOf(" ", n - 3)).replace(/[,;:.]$/, "") + "...");

// ---------- reading the person's confirmed facts against one requirement ----------
const MONTH: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, spring: 5, summer: 8, fall: 12, autumn: 12, winter: 12 };
// The graduation date a fact states: "Class of 2027", "graduating May 2027", "BS CS, expected Dec 2026", "'27".
export function gradOf(text: string): { year: number; month: number | null } | null {
  const t = lc(text);
  if (!/(graduat|class of|expected|degree|b\.?s\b|b\.?a\b|bachelor|master|mba|ph\.?d|'\d\d\b|university|college|school)/.test(t)) return null;
  const m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|spring|summer|fall|autumn|winter)[a-z]*\.?,?\s+(20\d\d)\b/) ;
  if (m) return { year: Number(m[2]), month: MONTH[m[1]] };
  const y = t.match(/\b(?:class of|graduat\w*(?: in)?|expected(?: in)?|grad(?:uation)?(?: year)?:?)\s*'?(20\d\d|\d\d)\b/) || t.match(/'(\d\d)\b/) || t.match(/\b(20[2-3]\d)\b/);
  if (!y) return null;
  const year = y[1].length === 2 ? 2000 + Number(y[1]) : Number(y[1]);
  return { year, month: null };
}
const ym = (s: string) => { const [y, m] = s.split("-").map(Number); return { y, m }; };
const LEVELS: [string, RegExp][] = [
  ["phd", /\b(ph\.?\s?d|doctoral|doctorate)\b/i],
  ["mba", /\bmba\b/i],
  ["master", /\b(master'?s?|m\.s\.|msc|m\.eng|meng|ms in|ms,)\b/i],
  ["bachelor", /\b(bachelor'?s?|b\.?s\.?|b\.?a\.?|bsc|b\.eng|undergrad(?:uate)?|sophomore|junior|senior|freshman)\b/i],
];
// A fact that names a field of study: "majoring in history", "BS Economics", "BA in English", "Bachelor of Arts in Music".
const MAJOR_SAID = /\b(major|majoring|degree in|studying|stud(?:y|ies)|concentration)\b|\b(?:b\.?s\.?c?|b\.?a\.?|m\.?s\.?|m\.?a\.?|ph\.?d|bachelor'?s?|master'?s?)(?: of (?:science|arts))?(?: degree)?(?: in)?\s+(?!at\b|from\b|degree\b|student\b|program\b)[a-z]{3,}/i;
const YEARS = /\b(freshman|sophomore|junior|senior|first[- ]year|second[- ]year|third[- ]year|final[- ]year|penultimate)\b/i;
function educationFacts(facts: Fact[]): Fact[] {
  return facts.filter((f) => lc(f.kind) === "education" || /\b(university|college|degree|major|graduat|class of|bachelor|master|mba|ph\.?d|gpa|junior|senior|sophomore|freshman)\b/i.test(f.text));
}
function anyWord(text: string, words: string[]): string[] { return words.filter((w) => hasWord(text, w)); }

// A named qualification is not necessarily one the person has: "never used Python" must not become Python
// experience. Keep a negated list together, but let a new contrast/first-person clause state positive evidence.
// This deliberately resolves only explicit denials, not arbitrary natural-language entailment.
const NEGATIVE_QUALIFICATION = /\b(?:no|not|never|without|cannot|can't|don't|doesn't|haven't|hasn't|didn't|isn't|aren't|wasn't|weren't|lack|lacks|lacking)\b/i;
function qualificationMentions(text: string, word: string): { yes: boolean; no: boolean } {
  let yes = false, no = false;
  const normalized = text.replace(/[’‘]/g, "'").replace(/\bnot\s+(only|just)\b/gi, "$1")
    .replace(/\bwithout\s+(?:a|any)\s+doubt\b/gi, "certainly").replace(/\bno\s+(?:trouble|problems?|difficult(?:y|ies))\b/gi, "ease");
  const occurrence = new RegExp(`(?<![\\w+#])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w+#])`, "i");
  const clauses = normalized.split(/[;.!?]|\b(?:but|however|whereas)\b|\band\s+(?=(?:(?:i|we)\b|not\b|no\b|never\b))/i);
  for (const clause of clauses) {
    let deniedList = false;
    for (const part of clause.split(/,/)) {
      const at = occurrence.exec(part);
      const inherited: boolean = deniedList && !/\b(?:i|we)\s+(?:have|use|know|hold|possess|am|can|built|work|worked|completed|manage|managed|lead|led)\b/i.test(part);
      // A denial after the qualification must describe that qualification ("Python is not a skill I have").
      // "I use Python without help" does not deny Python.
      const denied: boolean = at
        ? NEGATIVE_QUALIFICATION.test(part.slice(0, at.index)) || /^\s+(?:is|are|was|were)\s+(?:not|never|no longer)\b/i.test(part.slice(at.index + at[0].length)) || inherited
        : NEGATIVE_QUALIFICATION.test(part) || inherited;
      deniedList = denied;
      if (!at) continue;
      if (denied) no = true; else yes = true;
    }
  }
  return { yes, no };
}
function qualificationEvidence(facts: Fact[], words: string[]) {
  const affirmed: string[] = [], denied: string[] = [], conflicting: string[] = [];
  for (const word of words) {
    const mentions = facts.map((f) => qualificationMentions(f.text, word));
    const yes = mentions.some((m) => m.yes), no = mentions.some((m) => m.no);
    if (yes && no) conflicting.push(word);
    else if (yes) affirmed.push(word);
    else if (no) denied.push(word);
  }
  const bestFact = facts.map((fact) => ({ fact, hits: affirmed.filter((w) => qualificationMentions(fact.text, w).yes).length }))
    .sort((a, b) => b.hits - a.hits).find((f) => f.hits > 0)?.fact ?? null;
  const deniedFact = facts.find((f) => denied.some((w) => qualificationMentions(f.text, w).no)) ?? null;
  return { affirmed, denied, conflicting, bestFact, deniedFact };
}

export function check(req: Requirement, facts: Fact[]): Check {
  const edu = educationFacts(facts);
  const r = (status: Status, fact: Fact | null, gap: string | null): Check => ({ requirement: req, status, fact, gap });
  switch (req.kind) {
    case "grad_window": {
      for (const f of edu) {
        const g = gradOf(f.text);
        if (!g) continue;
        const from = req.from ? ym(req.from) : null, to = req.to ? ym(req.to) : null;
        const before = from && (g.year < from.y || (g.month != null && g.year === from.y && g.month < from.m));
        const after = to && (g.year > to.y || (g.month != null && g.year === to.y && g.month > to.m));
        if (before || after) return r("unmet", f, "your graduation date is outside this window");
        const edge = g.month == null && ((from && g.year === from.y && from.m > 1) || (to && g.year === to.y && to.m < 12));
        if (edge) return r("unknown", f, `the month of your ${g.year} graduation decides it`);
        return r("met", f, null);
      }
      return r("unknown", null, "no confirmed graduation date on your profile");
    }
    case "degree_level": {
      for (const f of edu) {
        const levels = LEVELS.filter(([, re]) => re.test(f.text)).map(([k]) => k);
        if (!levels.length) continue;
        if ((req.not || []).some((n) => levels.includes(n))) return r("unmet", f, `this program is not for ${levels[0] === "mba" ? "MBA" : levels[0]} students`);
        if ((req.any || []).some((a) => levels.includes(a))) return r("met", f, null);
        return r("unmet", f, `your stated degree level (${levels[0]}) is not one they list`);
      }
      return r("unknown", null, "no confirmed degree on your profile");
    }
    case "field": {
      for (const f of edu) if (anyWord(f.text, req.any || []).length) return r("met", f, null);
      const said = edu.find((f) => MAJOR_SAID.test(f.text));
      if (said) return r("unmet", said, "your stated field is not one they list");
      return r("unknown", null, "no confirmed major on your profile");
    }
    case "year_of_study": {
      for (const f of edu) {
        if (anyWord(f.text, req.any || []).length) return r("met", f, null);
        if (YEARS.test(f.text)) return r("unmet", f, "your stated year of study is not the one they name");
      }
      return r("unknown", null, "no confirmed year of study on your profile");
    }
    case "gpa": {
      for (const f of facts) {
        const m = f.text.match(/\bgpa\D{0,12}(\d\.\d{1,2})\b|\b(\d\.\d{1,2})\s*(?:\/\s*4(?:\.0)?\s*)?gpa\b/i);
        if (!m) continue;
        const gpa = Number(m[1] ?? m[2]);
        return gpa >= (req.min ?? 0) ? r("met", f, null) : r("unmet", f, `your GPA (${gpa}) is under their minimum (${req.min})`);
      }
      return r("unknown", null, "no confirmed GPA on your profile");
    }
    case "skill": {
      const need = req.count ?? 1;
      const e = qualificationEvidence(facts, req.any || []);
      if (e.affirmed.length >= need) return r("met", e.bestFact, null);
      if (e.conflicting.length) return r("unknown", null, `your confirmed facts conflict about ${e.conflicting.join(", ")}; clarify which is current`);
      if (e.affirmed.length) return r("unmet", e.bestFact, `your profile shows ${e.affirmed.join(", ")}; they ask for ${need}`);
      if (e.denied.length) return r("unmet", e.deniedFact, "your confirmed fact explicitly says you do not have this");
      return r("unknown", null, "nothing confirmed on your profile shows this");
    }
    case "experience":
    case "clearance": {
      const e = qualificationEvidence(facts, req.any || []);
      if (e.affirmed.length) return r("met", e.bestFact, null);
      if (e.conflicting.length) return r("unknown", null, `your confirmed facts conflict about ${e.conflicting.join(", ")}; clarify which is current`);
      if (e.denied.length) return r("unmet", e.deniedFact, "your confirmed fact explicitly says you do not have this");
      return r("unknown", null, "nothing confirmed on your profile shows this");
    }
    default:
      return r("unknown", null, "this is not something your profile can show; check it on their page");
  }
}

function actionFor(c: Check, firm: string): string {
  const k = c.requirement.kind;
  if (c.status === "met") return "Lead with this: it matches what they state.";
  if (c.status === "unmet") {
    if (k === "grad_window") return `Aim at the ${firm} program whose window your graduation date fits, or the next cycle.`;
    if (k === "degree_level") return "Pick the program written for your degree level.";
    if (k === "field") return "Your major is outside their list: show the same skills through coursework or a project, and put it first.";
    if (k === "gpa") return "This program screens on GPA: favor one without that floor.";
    if (k === "skill") return "Close this before you apply: one real project that uses what they ask for.";
    return "Close this gap before you apply.";
  }
  if (k === "grad_window" || k === "degree_level" || k === "field" || k === "year_of_study" || k === "gpa") return "Tell me this so I can check you against it; it decides which program you can apply to.";
  return "If you have this, tell me and I'll put it on your profile; if you don't, it is the gap to close first.";
}
const KIND_ORDER = ["grad_window", "degree_level", "field", "year_of_study", "gpa", "clearance", "skill", "experience", "other"];
const STATUS_ORDER: Record<Status, number> = { unmet: 0, unknown: 1, met: 2 };

export function programsFor(firm: any, role: string): any[] {
  const r = lc(role).trim();
  if (!r) return firm.programs || [];
  const hits = (firm.programs || []).filter((p: any) => (p.roles || []).some((w: string) => hasWord(r, w) || hasWord(w, r)));
  return hits.length ? hits : firm.programs || [];
}

export function movesFor(firm: any, programs: any[], facts: Fact[], tracked: { company?: string }[], now: number = Date.now()): Move[] {
  const names = new Set(programs.map((p: any) => p.name));
  const reqs: Requirement[] = (firm.requirements || []).filter((q: Requirement) => names.has(q.program));
  const byKind = (a: Check, b: Check) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || KIND_ORDER.indexOf(a.requirement.kind) - KIND_ORDER.indexOf(b.requirement.kind);
  const checks = reqs.map((q) => check(q, facts)).sort(byKind);
  // A program the person's own facts rule out (graduation window, degree level, year of study) is said once, by the
  // fact that rules it out; its other requirements are not moves for them.
  const GATES = ["grad_window", "degree_level", "year_of_study"];
  const blocked = new Map<string, Check>();
  for (const c of checks) if (c.status === "unmet" && GATES.includes(c.requirement.kind) && !blocked.has(c.requirement.program)) blocked.set(c.requirement.program, c);
  const open = checks.filter((c) => !blocked.has(c.requirement.program));
  const picked: Check[] = [
    ...open.filter((c) => c.status === "unmet"),
    ...[...blocked.values()],
    ...open.filter((c) => c.status === "unknown"),
  ].slice(0, MAX_MOVES);
  // Applying in the window is a move only when the firm's own page states a timeline and the tracker shows no
  // application there yet: it cites that page and that gap. A closed program (every stated date past) is never "apply
  // inside its window", nor is one whose date has no year; when such a program is the only timed one, the move says
  // its dates passed and the next date is unknown, or that the year is not stated.
  const applied = tracked.some((t) => hasWord(String(t.company ?? ""), lc(firm.name)) || (firm.aliases || []).some((a: string) => lc(t.company).trim() === a));
  const timedAll = programs.filter((p: any) => p.timeline && !blocked.has(p.name));
  const timed = timedAll.find((p: any) => !closedOf(p, now) && !undatedOf(p).length) ?? timedAll[0];
  const timelineAction = (name: string): string => {
    const p = programs.find((x: any) => x.name === name);
    if (p && closedOf(p, now)) {
      const last = (paths.pastDates(p.timeline, now) as StatedDate[]).filter((d) => d.kind !== "opens").pop()!;
      return last.kind === "deadline"
        ? `The ${name} deadline (${last.said}) has passed, and the next cycle's date is not published yet: watch its page and apply when it opens.`
        : `The ${name} dates on file (the last is ${last.said}) have passed, and the next cycle's date is not published yet: watch its page and apply when it opens.`;
    }
    if (p && undatedOf(p).length) return `${name} states ${undatedOf(p).map((d) => d.said).join(" and ")} without a year, so I can't tell whether its window is open: check its page before you apply.`;
    return `Apply to ${name} inside its window.`;
  };
  if (picked.length < MAX_MOVES && timed && !applied) {
    picked.push({ requirement: { id: `${firm.firm_id}-timeline`, program: timed.name, kind: "timeline", text: timed.timeline, source_url: timed.source_url, checked_at: timed.checked_at },
      status: "unmet", fact: null, gap: `no application to ${firm.name} on your tracker` });
  }
  for (const c of open) if (picked.length < MAX_MOVES && c.status === "met") picked.push(c);
  return picked.slice(0, MAX_MOVES).map((c, i) => ({
    rank: i + 1,
    action: c.requirement.kind === "timeline" ? timelineAction(c.requirement.program) : actionFor(c, firm.name),
    requirement: { id: c.requirement.id, text: c.requirement.text, program: c.requirement.program, source_url: c.requirement.source_url, checked_at: c.requirement.checked_at },
    status: c.status, fact: c.fact ? { id: c.fact.id, text: c.fact.text } : null, gap: c.gap,
  }));
}

function fit(lines: string[]): string[] {
  const out: string[] = [];
  let cur = "";
  for (const l of lines) {
    const next = cur ? `${cur}\n${l}` : l;
    if (next.length > MAX_MESSAGE && cur) { out.push(cur.trim()); cur = l; } else cur = next;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map((m) => m.length > MAX_MESSAGE ? m.slice(0, MAX_MESSAGE - 3) + "..." : m);
}
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

// The firm the person named: an exact name or alias first, then the longest alias written as a name in what they said
// ("how do I get into Jane Street as a trader"). "Citadel" is not Citadel Securities: the longer alias wins only when
// it is there.
export function findFirm(said: string, g: any): any | null {
  const t = said.trim();
  const exact = (g?.firms || []).find((f: any) => [f.name, ...(f.aliases || [])].some((a: string) => lc(a) === lc(t)));
  if (exact) return exact;
  let best: any = null, bestLen = 0;
  for (const f of g?.firms || []) for (const a of [f.name, ...(f.aliases || [])]) {
    const w = lc(a);
    if (w.length > bestLen && hasWord(t, w, true)) { best = f; bestLen = w.length; }
  }
  return best;
}

export function pathAnswer(o: { firm: string; role?: string; facts: Fact[]; tracked?: { company?: string }[]; guide?: any; data?: OfferData; hired?: HiredResult | null; now?: number; checks?: any }): PathResult {
  const g = o.guide ?? (CareerPaths as any).firmGuide();
  const now = typeof o.now === "number" && Number.isFinite(o.now) ? o.now : Date.now();
  const checks = o.checks ?? paths.sourceChecks();
  const data = o.data ?? payData();
  const firm = findFirm(String(o.firm ?? ""), g);
  const asked = String(o.firm ?? "").trim() || "that company";
  if (!firm) {
    const lines = [`I don't have ${asked}'s programs or stated requirements on file, so I won't guess them.`, hiredDataLine(asked),
      "No honest probability either: I have no published acceptance rate for them.", "If they have a posting in the job search, I can check it against your profile."];
    return { status: "no_record", firm: null, programs: [], lca: null, hired_data: hiredDataLine(asked), hired: { status: o.hired?.status ?? "NOT_WIRED", n: null }, probability: { kind: "none", reason: "no record of this firm", decided_by: [] }, moves: [], messages: fit(lines) };
  }
  const programs = programsFor(firm, o.role ?? "");
  const moves = movesFor(firm, programs, o.facts || [], o.tracked || [], now);
  // X's H-1B filings: what titles they file for and what they filed, all titles together (not one role's pay).
  const agg = (data?.lca_companies?.companies || []).find((c: any) => c.company_id === firm.lca_company_id);
  const lca = agg ? {
    period: "FY2025 Q4", cases: agg.lca_cases,
    median: agg.wage_annualized_usd && agg.wage_annualized_usd.n >= MIN_N ? agg.wage_annualized_usd.median : null,
    n: agg.wage_annualized_usd ? agg.wage_annualized_usd.n : null,
    // Filing titles sometimes carry the employer's internal requisition number: "Software Engineer (11525.3849.2)".
    top_titles: Object.entries((agg.top_job_titles || []).reduce((acc: Record<string, number>, t: any) => {
      const k = String(t.job_title).replace(/\s*\(\s*[\d.\s]+\)\s*/g, " ").trim();
      acc[k] = (acc[k] || 0) + Number(t.cases || 0);
      return acc;
    }, {})).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 3).map(([title, cases]) => ({ title, cases: cases as number })),
    source_url: data.lca_companies.source_url as string,
  } : null;
  const rates = (firm.base_rates || []).filter((b: any) => b.statement && b.source_url && b.checked_at && (b.rate_pct != null || b.applicants != null));
  const decided = moves.filter((m) => m.status !== "met" && m.requirement.id !== `${firm.firm_id}-timeline`).map((m) => short(m.requirement.text, 80));
  const probability: PathResult["probability"] = rates.length
    ? { kind: "base_rate", statement: rates[0].statement, source_url: rates[0].source_url, checked_at: rates[0].checked_at, publisher: rates[0].publisher }
    : { kind: "none", reason: `${firm.name} publishes no acceptance rate`, decided_by: decided };

  const head: string[] = [`Getting into ${firm.name}${o.role ? ` as ${o.role}` : ""}, from what is on file:`];
  // The firm's own statements cited here are search summaries until a source check opens their pages: said once, up
  // front, as for the interview patterns.
  const cited = [...programs.slice(0, 2).map((p: any) => p.source_url), ...moves.map((m) => m.requirement.source_url), ...(probability.kind === "base_rate" ? [probability.source_url] : [])];
  const note = unverifiedSources(cited, checks);
  if (note) head.push(note);
  for (const p of programs.slice(0, 2)) {
    head.push(`${p.name}: ${short(p.timeline || "no timeline on its page", 220)} (${cite(p)})`);
    const past = pastLine(pastDatesOf(p, now), now);
    if (past) head.push(past);
    const undated = undatedLine(p);
    if (undated) head.push(undated);
    const src = paths.sourceStatus(p.source_url, checks);
    if (src.status === "gone") head.push(`That page answered ${src.http_status ?? "gone"} at the ${src.checked} source check, so this program may no longer be listed there.`);
  }
  if (lca) {
    head.push(`Their H-1B filings (DOL LCA, ${lca.period}): ${lca.cases} cases, most often ${lca.top_titles.map((t) => `${t.title} (${t.cases})`).join(", ")}.` +
      (lca.median != null ? ` Median filed wage across all titles ${usd(lca.median)} (n=${lca.n}); employers' filed wages for visa workers, not offers.` : ""));
  } else head.push(`No H-1B filings for ${firm.name} are on file.`);
  // Aggregates of who joined, when the PDL rail is live; otherwise the one honest line.
  const hiredLine = o.hired?.status === "ok" ? hiredText(o.hired.aggregates, firm.name, o.role ?? "") : hiredDataLine(firm.name);
  head.push(hiredLine);
  if (probability.kind === "base_rate") head.push(`Base rate: ${probability.statement} (${probability.publisher}; ${cite(probability)}). That is across all applicants, not your odds; nothing published adjusts it for a profile like yours.`);
  else head.push(`No honest probability exists here: ${probability.reason}, and I won't make one up. What decides it: ${probability.decided_by.length ? probability.decided_by.join("; ") + ", and" : ""} how you do in their interviews.`);

  const body: string[] = [moves.length ? `The ${moves.length === 1 ? "one move" : `${moves.length} moves`} that matter most for you:` : "I can't name a move: they state no requirement I can check you against."];
  for (const m of moves) {
    body.push(`${m.rank}. ${m.action}`);
    body.push(`Their requirement: ${short(m.requirement.text, 160)} (${cite(m.requirement)})`);
    body.push(m.fact ? `You: "${short(m.fact.text, 90)}" (${m.fact.id})${m.gap ? `, ${m.gap}` : ""}` : `Gap: ${m.gap}`);
  }
  const urls = [...new Set([...programs.slice(0, 2).map((p: any) => p.source_url), ...moves.map((m) => m.requirement.source_url), ...(probability.kind === "base_rate" ? [probability.source_url] : []), ...(lca ? [lca.source_url] : [])])];
  const messages = [...fit(head), ...fit(body), ...fit(["Sources:", ...urls])];
  return {
    status: "answered", firm: { id: firm.firm_id, name: firm.name },
    programs: programs.map((p: any) => ({ name: p.name, timeline: p.timeline ?? null, source_url: p.source_url, checked_at: p.checked_at,
      past_dates: pastDatesOf(p, now), source_status: paths.sourceStatus(p.source_url, checks).status })),
    lca, hired_data: hiredLine, hired: { status: o.hired?.status ?? "NOT_WIRED", n: o.hired?.status === "ok" ? o.hired.aggregates.n : null }, probability, moves, messages,
  };
}
