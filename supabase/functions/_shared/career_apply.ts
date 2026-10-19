// The apply core (WO-009a, D-011: mass applying first). Pure functions, no browser and no network:
//   classifyOutcome   what the employer's page shows after submit → the only states we ever report
//   admitApplication  the person's approval of this exact payload, duplicates, one per company per 30 days, a daily limit
//   greenhouseQuestions / classifyField / planBatch
//                     prepare every application BEFORE a browser opens: the employer's published questions are answered from
//                     the person's confirmed facts; anything missing is asked once for the whole batch and saved, so later
//                     batches need nothing; the batch is admitted against the limits up front.
// The worker (WO-009b) fills exactly the prepared fields by name, reads each back, and classifies the outcome here.

// ------------------------------------------------------------------------------------------------ outcome
export interface Observation {
  url_before: string; url_after: string;
  form_present_after: boolean; required_empty_after: number;
  validation_errors: string[]; captcha: boolean; email_code_prompt: boolean;
  page_text: string;
}
export type OutcomeState = "confirmed" | "submitted_unconfirmed" | "needs_user" | "failed" | "not_submitted";
export interface Outcome { state: OutcomeState; reason: string; confirmation_id: string | null }

// Employer confirmation wording. Only counted when the form is gone from the page.
const SUCCESS = /(application (?:has been |was )?(?:submitted|received)|thank you for (?:applying|your application)|we(?:'ve| have) received your application|successfully submitted|application is complete|your application was sent)/i;
// An id needs an id label and a token with a digit: a word is never an id (BUG-208: "security").
const ID = /(?:application|confirmation|reference|submission|tracking)\s*(?:(?:id|number|no\.?)\s*[:#]?|#)\s*([A-Z0-9][A-Z0-9-]{4,})\b/i;

export function classifyOutcome(o: Observation): Outcome {
  if (o.captcha) return { state: "needs_user", reason: "captcha", confirmation_id: null };
  if (o.email_code_prompt) return { state: "needs_user", reason: "email_code", confirmation_id: null };
  if (o.validation_errors.length) return { state: "failed", reason: o.validation_errors.join("; "), confirmation_id: null };
  if (o.form_present_after) return { state: "not_submitted", reason: o.required_empty_after ? `${o.required_empty_after} required field(s) still empty` : "the form is still open", confirmation_id: null };
  const m = ID.exec(o.page_text || "");
  const id = m && /\d/.test(m[1]) ? m[1] : null;
  if (SUCCESS.test(o.page_text || "")) return { state: "confirmed", reason: "employer confirmation on the page", confirmation_id: id };
  if (o.url_after !== o.url_before) return { state: "submitted_unconfirmed", reason: "the page moved and the form is gone, but the employer said nothing yet", confirmation_id: null };
  return { state: "not_submitted", reason: "nothing changed on the page", confirmation_id: null };
}

// ------------------------------------------------------------------------------------------------ admission
export interface Limits { daily?: number }
export const DEFAULT_DAILY = 25, MAX_DAILY = 50, COMPANY_COOLDOWN_DAYS = 30;
const DAY = 86400000;
// States that mean an application reached (or may have reached) the employer; a failed or not-submitted attempt can be retried.
const COUNTED = new Set(["confirmed", "submitted_unconfirmed", "needs_user", "submitting", "queued", "planned"]);
export const normCompany = (c: unknown) => String(c ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ")
  .replace(/\b(inc|llc|ltd|corp|corporation|co|company|the)\b/g, " ").replace(/\s+/g, " ").trim();
export const dailyLimit = (l?: Limits) => Math.max(1, Math.min(MAX_DAILY, Math.floor(Number(l?.daily) || DEFAULT_DAILY)));

export interface LogRow { user_id: string; job_id: string; company: string; at: number; state: string }
export function admitApplication(log: LogRow[], a: { user_id: string; job_id: string; company: string; approval_hash?: string; payload_hash?: string }, now: number, limits?: Limits): { ok: boolean; reason: string | null } {
  if (a.approval_hash !== undefined || a.payload_hash !== undefined) {
    if (!a.approval_hash || a.approval_hash !== a.payload_hash) return { ok: false, reason: "not_approved" };
  }
  const mine = log.filter((x) => x.user_id === a.user_id && COUNTED.has(x.state));
  if (mine.some((x) => x.job_id === a.job_id)) return { ok: false, reason: "duplicate_job" };
  const co = normCompany(a.company);
  if (co && mine.some((x) => normCompany(x.company) === co && now - x.at < COMPANY_COOLDOWN_DAYS * DAY)) return { ok: false, reason: "company_cooldown" };
  if (mine.filter((x) => x.at > now - DAY).length >= dailyLimit(limits)) return { ok: false, reason: "daily_cap" };
  return { ok: true, reason: null };
}

// ------------------------------------------------------------------------------------------------ preparing
export interface FormField { name: string; label: string; required: boolean; type: string; options: { label: string; value: string }[] }
export function greenhouseQuestions(job: any): FormField[] {
  const out: FormField[] = [];
  for (const q of (job && Array.isArray(job.questions) ? job.questions : [])) {
    for (const f of (Array.isArray(q.fields) ? q.fields : [])) {
      out.push({ name: String(f.name), label: String(q.label ?? "").trim(), required: !!q.required, type: String(f.type ?? "input_text"),
        options: (Array.isArray(f.values) ? f.values : []).map((v: any) => ({ label: String(v.label ?? ""), value: String(v.value ?? "") })) });
    }
  }
  return out;
}

const KEYS: [RegExp, string][] = [
  [/^first\s*name|^given\s*name|^preferred\s*first/i, "first_name"],
  [/^last\s*name|^family\s*name|^surname/i, "last_name"],
  [/^(full\s*)?name$|^legal\s*name/i, "full_name"],
  [/e-?mail/i, "email"],
  [/phone|mobile/i, "phone"],
  [/resume|\bcv\b|curriculum/i, "resume"],
  [/cover\s*letter/i, "cover_letter"],
  [/linkedin/i, "linkedin"],
  [/github/i, "github"],
  [/(personal\s*)?(website|portfolio)/i, "website"],
  [/(require|need).*(sponsor)|sponsorship|visa\s*status/i, "sponsorship"],
  [/(legally\s*)?authori[sz]ed\s*to\s*work|work\s*authori[sz]ation|eligible\s*to\s*work/i, "work_authorization"],
  [/^(current\s*)?(location|city)|where are you (located|based)/i, "location"],
  [/start\s*date|when can you start|earliest.*start/i, "start_date"],
  [/salary|compensation\s*expectation|desired\s*pay/i, "salary_expectation"],
  [/how did you hear/i, "how_heard"],
  [/gender|race|ethnicity|veteran|disability|hispanic|latino/i, "eeo"],
];
export function classifyField(label: string, type: string): string {
  if (/file/.test(type) && /resume|cv/i.test(label)) return "resume";
  for (const [re, key] of KEYS) if (re.test(String(label || ""))) return key;
  return "unknown";
}

export interface Answer { value: string; factId: string }
export interface PlannedField { name: string; label: string; value: string; factId: string }
export interface PlanPosting { job_id: string; company: string; title: string; fields: FormField[] }
export const normLabel = (l: string) => String(l || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const yesNo = (v: string) => (/^(y|yes|true)$/i.test(v.trim()) ? "yes" : /^(n|no|false)$/i.test(v.trim()) ? "no" : null);

// A select is answered only with one of the employer's own options, matched exactly (or yes/no to Yes/No). Never forced.
function matchOption(value: string, options: { label: string; value: string }[]): string | null {
  const v = value.trim().toLowerCase();
  const exact = options.find((o) => o.label.trim().toLowerCase() === v || o.value.trim().toLowerCase() === v);
  if (exact) return exact.value;
  const yn = yesNo(value);
  if (yn) { const o = options.find((x) => yesNo(x.label) === yn); if (o) return o.value; }
  return null;
}

export function planBatch(o: { userId: string; postings: PlanPosting[]; answers: Record<string, Answer>; saved: Record<string, Answer>; log: LogRow[]; now: number; limits?: Limits }) {
  const ready: { job_id: string; company: string; title: string; fields: PlannedField[] }[] = [];
  const needs = new Map<string, { label: string; key: string; required: boolean; job_ids: string[] }>();
  const skipped: { job_id: string; reason: string }[] = [];
  const log = o.log.slice();
  for (const p of o.postings) {
    const admit = admitApplication(log, { user_id: o.userId, job_id: p.job_id, company: p.company }, o.now, o.limits);
    if (!admit.ok) { skipped.push({ job_id: p.job_id, reason: admit.reason! }); continue; }
    const filled: PlannedField[] = [];
    let blocked = false;
    for (const f of p.fields) {
      const key = classifyField(f.label, f.type);
      const a: Answer | undefined = (key !== "unknown" && key !== "eeo" ? o.answers[key] : undefined) ?? o.saved[normLabel(f.label)];
      let value: string | null = a ? String(a.value) : null;
      if (value !== null && f.options.length) value = matchOption(value, f.options);
      if (value !== null && value !== "") { filled.push({ name: f.name, label: f.label, value, factId: a!.factId }); continue; }
      if (!f.required) continue; // optional and unknown: left empty, never guessed
      blocked = true;
      const k = normLabel(f.label);
      const n = needs.get(k) ?? { label: f.label, key, required: true, job_ids: [] };
      if (!n.job_ids.includes(p.job_id)) n.job_ids.push(p.job_id);
      needs.set(k, n);
    }
    if (blocked) { skipped.push({ job_id: p.job_id, reason: "needs_answers" }); continue; }
    ready.push({ job_id: p.job_id, company: p.company, title: p.title, fields: filled });
    log.push({ user_id: o.userId, job_id: p.job_id, company: p.company, at: o.now, state: "planned" });
  }
  return { ready, needs: [...needs.values()].map(({ label, key, job_ids }) => ({ label, key, job_ids })), skipped };
}
