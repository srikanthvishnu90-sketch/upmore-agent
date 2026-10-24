// C-04: the relevance floor. Hard filters a posting must pass before it is suggested, alerted, prepared or queued.
// Irrelevant matches are the category's top complaint (docs/competitors: AIApply, JobCopilot, Tsenta, LoopCV), and an
// application sent to the wrong job is worse than none. Every filter applies only when the person stated it; silence
// never fails a posting, and a posting that does not say something (its pay, its level) passes with the reason named.
// Whole words only, no model calls. Card: docs/architect/cards/C-04-relevance-floor.md.
import { STAFFING_AGENCIES } from "./career_staffing_agencies.ts";

export type Level = "intern" | "entry" | "mid" | "senior" | "lead" | "exec";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "temporary";
export interface Floor {
  levels?: Level[];
  types?: EmploymentType[];
  exclude_words?: string[];
  exclude_companies?: string[];
  min_pay?: { amount: number; period: "year" | "hour" };
  allow_staffing?: boolean;
}
export interface FloorResult {
  pass: boolean;
  reasons: string[];
}

const LEVELS: Level[] = ["intern", "entry", "mid", "senior", "lead", "exec"];
const TYPES: EmploymentType[] = ["full_time", "part_time", "contract", "internship", "temporary"];
const HOURS_PER_YEAR = 2080;
const lc = (s: unknown) => String(s ?? "").toLowerCase();

// The level a title names, highest first, or null when it names none. A title that says nothing is never "mid" by
// default (the router's seniorityBand returns "mid" for silence; a floor must not fail a posting on that).
// Traps: "Seniority Analyst" is not senior; "Staff Accountant", "Staff Nurse" are not staff-engineer level; "Lead
// Generation" is not a lead role; "Executive Assistant" is not an executive; "internal", "international" are not
// "intern".
export function levelOf(title: unknown): Level | null {
  const t = lc(title);
  if (/\b(director|vp|svp|evp|vice president|head of|chief)\b/.test(t)) return "exec";
  if (/\bprincipal\b/.test(t) || /\blead\b(?!\s*gen)/.test(t)) return "lead";
  if (/\bstaff\b/.test(t) && /\b(engineer|scientist|developer|architect|designer|researcher|swe|sre)\b/.test(t)) {
    return "lead";
  }
  if (/\b(senior|sr)\b/.test(t)) return "senior";
  if (/\b(intern|internship|co-op)\b/.test(t)) return "intern";
  if (/\b(junior|jr|entry[- ]level|entry|new grad|new graduate|associate)\b/.test(t)) return "entry";
  return null;
}

// The employment type a posting names, or null. The title decides when it names one; "Contract Manager",
// "Contracts Administrator" and "Contract Attorney" are full-time jobs about contracts, not contract work. The
// description counts only when it says so in a phrase about the role ("this is a contract position", "6-month
// contract", "contract-to-hire", "part-time role"), never a passing "contract" ("government contracts", "contract
// negotiations"). Only the first 2,000 characters are read.
export function typeOf(title: unknown, description: unknown): EmploymentType | null {
  const t = lc(title);
  const subject =
    /\bcontracts?\s+(manager|management|administrator|admin|specialist|analyst|negotiator|attorney|lawyer|law|counsel|coordinator|officer|director|lead)\b/;
  if (/\b(intern|internship|co-op)\b/.test(t)) return "internship";
  if (/\bpart[- ]time\b/.test(t)) return "part_time";
  if (/\b(temp|temporary|seasonal)\b/.test(t)) return "temporary";
  if (/\b(contractor|contract-to-hire|contract to hire|freelance)\b/.test(t)) return "contract";
  if (/\bcontract\b/.test(t) && !subject.test(t)) return "contract";
  if (/\bfull[- ]time\b/.test(t)) return "full_time";
  const d = lc(description).slice(0, 2000);
  if (/\b(paid |summer |this )?internship (program|position|role|opportunity)\b|\bthis is an internship\b/.test(d)) {
    return "internship";
  }
  if (/\bthis is a part[- ]time\b|\bpart[- ]time (role|position|job|opportunity|schedule)\b/.test(d)) {
    return "part_time";
  }
  if (/\bthis is a temporary\b|\btemporary (role|position|assignment|job)\b/.test(d)) return "temporary";
  if (
    /\bthis is a contract\b|\bcontract (role|position|assignment|engagement)\b|\b\d+[- ]?(month|mo|week)s?\s+contract\b|\bcontract[- ]to[- ]hire\b|\bw-?2 contract\b|\b1099\b/
      .test(d)
  ) return "contract";
  return null;
}

// The pay a posting states, as its highest stated top in dollars per year, or a reason why there is none. Amounts
// next to bonus, signing, stipend, relocation or equity are not pay. A range in another currency is not comparable.
// An hourly range converts at 2,080 hours a year. Several ranges (one per city) count by the most generous.
export function statedPay(
  description: unknown,
): { top_per_year: number } | { none: "pay_not_stated" | "pay_not_comparable" } {
  const d = String(description ?? "");
  const num = (s: string) => {
    const k = /k$/i.test(s.trim());
    const n = Number(s.replace(/[k,\s]/gi, ""));
    return Number.isFinite(n) ? (k ? n * 1000 : n) : NaN;
  };
  const amount = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?\s*[kK]?`;
  const range = new RegExp(
    String
      .raw`(\$|usd\s*|£|€|gbp\s*|eur\s*|cad\s*|c\$)\s*(${amount})(?:\s*(?:-|–|—|to)\s*(?:\$|usd\s*|£|€|c\$)?\s*(${amount}))?\s*(?:usd)?\s*(\/\s*(?:hr|hour|yr|year)|per\s+(?:hour|year|annum)|an?\s+(?:hour|year)|hourly|annually|annual)?`,
    "gi",
  );
  let best = 0, foreign = false;
  for (const m of d.matchAll(range)) {
    // Not pay: an amount named as a bonus, stipend or the like, by the words right before it ("bonus of $5,000") or
    // right after it ("$1,000 signing bonus"). "$120k-150k plus equity" is still pay.
    const before = d.slice(Math.max(0, m.index! - 25), m.index!).toLowerCase();
    const after = d.slice(m.index! + m[0].length, m.index! + m[0].length + 25).toLowerCase();
    const extra = /(bonus|stipend|relocation|allowance|reimbursement|referral|sign-on|signing)/;
    if (new RegExp(extra.source + String.raw`\s*(of|up to|:)?\s*$`).test(before)) continue;
    if (
      new RegExp(
        String.raw`^\s*(one-time\s+|annual\s+|cash\s+)?(signing\s+|sign-on\s+|referral\s+|relocation\s+)?` +
          extra.source,
      ).test(after)
    ) continue;
    const cur = m[1].trim().toLowerCase();
    if (!/^(\$|usd)$/.test(cur)) {
      foreign = true;
      continue;
    }
    const lo = num(m[2]), hi = m[3] ? num(m[3]) : lo;
    if (!Number.isFinite(hi) || hi <= 0) continue;
    const unit = lc(m[4]);
    const hourly = /hr|hour/.test(unit) || (!unit && hi < 500);
    if (!unit && hi >= 500 && hi < 10000) continue; // a bare 500-9,999 is a fee or a bonus, not a salary
    best = Math.max(best, hourly ? hi * HOURS_PER_YEAR : hi);
    void lo;
  }
  if (best > 0) return { top_per_year: best };
  return { none: foreign ? "pay_not_comparable" : "pay_not_stated" };
}

const normCompany = (s: unknown) =>
  lc(s).replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|the|plc|gmbh)\b/g, " ").replace(/\s+/g, " ").trim();
const wholePhrase = (hay: string, phrase: string) => {
  const p = phrase.trim();
  return !!p && new RegExp(`(^| )${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(hay);
};
// Whether a posting's company is the one a person named ("Goldman Sachs" is "Goldman Sachs & Co. LLC").
export const sameCompany = (company: unknown, name: unknown) => wholePhrase(normCompany(company), normCompany(name));
// career_staffing_agencies.ts: only names whose own site or filing says they place workers with client
// companies, each with its source and checked date. A missing agency is a pass, never a guess.
const AGENCIES = STAFFING_AGENCIES.map((a) => a.name);

export function isStaffing(company: unknown, description: unknown, names: string[] = AGENCIES): boolean {
  const c = normCompany(company);
  if (names.some((a) => wholePhrase(c, normCompany(a)))) return true;
  // "our client" names one employer the agency recruits for; "our clients" is a firm describing its customers.
  return /\bon behalf of (?:our|a) client\b|\bour client(?!s)\b/i.test(String(description ?? "").slice(0, 3000));
}

export function relevanceFloor(p: any, floor: Floor = {}): FloorResult {
  const reasons: string[] = [];
  if (!p || p.closed_at) return { pass: false, reasons: ["closed"] };
  const title = String(p.title ?? ""), description = String(p.description ?? "");
  if (floor.levels?.length) {
    const level = levelOf(title);
    if (level && !floor.levels.includes(level)) reasons.push(`level_${level}`);
  }
  if (floor.types?.length) {
    const type = typeOf(title, description);
    if (type && !floor.types.includes(type)) reasons.push(`type_${type}`);
  }
  if (floor.exclude_words?.length) {
    const t = " " + lc(title).replace(/[^a-z0-9+#]+/g, " ").trim() + " ";
    const hit = floor.exclude_words.find((w) => wholePhrase(t.trim(), lc(w).replace(/[^a-z0-9+#]+/g, " ").trim()));
    if (hit) reasons.push(`excluded_word`);
  }
  if (floor.exclude_companies?.length) {
    const c = normCompany(p.company);
    if (floor.exclude_companies.some((x) => wholePhrase(c, normCompany(x)))) reasons.push("excluded_company");
  }
  let note: string | null = null;
  if (floor.min_pay) {
    const pay = statedPay(description);
    const want = floor.min_pay.period === "hour" ? floor.min_pay.amount * HOURS_PER_YEAR : floor.min_pay.amount;
    if ("none" in pay) note = pay.none;
    else if (pay.top_per_year < want) reasons.push("pay_below_floor");
  }
  if (!floor.allow_staffing && isStaffing(p.company, description)) reasons.push("staffing_agency");
  return { pass: reasons.length === 0, reasons: reasons.length ? reasons : note ? [note] : [] };
}

// A batch through the floor, in the order given (newest first in search): the same job on another board within 30
// days is a duplicate, and only its first copy is kept. Returns what passed and how many were hidden, by reason.
export function applyFloor(postings: any[], floor: Floor = {}): { kept: any[]; filtered: Record<string, number> } {
  const kept: any[] = [], filtered: Record<string, number> = {}, seen = new Map<string, number>();
  const count = (r: string) => (filtered[r] = (filtered[r] ?? 0) + 1);
  const at = (p: any) => Date.parse(String(p.first_seen_at ?? "")) || 0;
  for (const p of postings) {
    const r = relevanceFloor(p, floor);
    if (!r.pass) {
      count(r.reasons[0]);
      continue;
    }
    const key = normCompany(p.company) + "|" + lc(p.title).replace(/[^a-z0-9+#]+/g, " ").trim();
    const prior = seen.get(key);
    if (prior !== undefined && Math.abs(prior - at(p)) <= 30 * 86400000) {
      count("duplicate");
      continue;
    }
    seen.set(key, at(p));
    kept.push(p);
  }
  return { kept, filtered };
}

// The person's stated floor, as saved with their job settings. Anything not stated is left out, never defaulted.
export function validFloor(v: unknown): { ok: true; floor: Floor } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, floor: {} };
  if (typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "floor must be an object" };
  const o = v as Record<string, unknown>, floor: Floor = {};
  const list = <T extends string>(x: unknown, allowed: T[] | null, name: string): T[] | string => {
    if (!Array.isArray(x)) return `${name} must be a list`;
    const out = [...new Set(x.map((s) => lc(s).trim()).filter(Boolean))];
    if (out.length > 20 || out.some((s) => s.length > 60)) return `${name}: at most 20, each 60 characters or fewer`;
    if (allowed && out.some((s) => !allowed.includes(s as T))) return `${name} must be from: ${allowed.join(", ")}`;
    return out as T[];
  };
  for (
    const [key, allowed] of [["levels", LEVELS], ["types", TYPES], ["exclude_words", null], [
      "exclude_companies",
      null,
    ]] as const
  ) {
    if (o[key] === undefined) continue;
    const r = list(o[key], allowed as any, key);
    if (typeof r === "string") return { ok: false, error: r };
    if (r.length) (floor as any)[key] = r;
  }
  if (o.min_pay !== undefined) {
    const m = o.min_pay as any;
    if (!m || !Number.isFinite(m.amount) || m.amount <= 0 || !["year", "hour"].includes(m.period)) {
      return { ok: false, error: "min_pay must be { amount > 0, period: year | hour }" };
    }
    floor.min_pay = { amount: Number(m.amount), period: m.period };
  }
  if (o.allow_staffing !== undefined) {
    if (typeof o.allow_staffing !== "boolean") return { ok: false, error: "allow_staffing must be true or false" };
    floor.allow_staffing = o.allow_staffing;
  }
  return { ok: true, floor };
}
