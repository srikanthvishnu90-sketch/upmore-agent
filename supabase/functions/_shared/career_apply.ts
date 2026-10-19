// The apply core (WO-009a, D-011: mass applying first). Pure functions, no browser and no network:
//   classifyOutcome   what the employer's page shows after submit → the only states we ever report
//   admitApplication  the person's approval of this exact payload, duplicates, one per company per 30 days, a daily limit
//   greenhouseQuestions / classifyField / planBatch
//                     prepare every application BEFORE a browser opens: the employer's published questions are answered from
//                     the person's confirmed facts; anything missing is asked once for the whole batch and saved, so later
//                     batches need nothing; the batch is admitted against the limits up front.
// The worker (WO-009b) fills exactly the prepared fields by name, reads each back, and classifies the outcome here.
import { mapQuestion } from "./question_map.ts";
import { chooseOption, yesNoFromFact, yesNoOf } from "./answer_options.ts";

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
// D-011's numbers, restored by the owner in writing (2026-10-19: "yes i raise the cap from higher then 15, as long as the
// capability to rapidly apply to a role is there"): 25 a day by default, a person may set their own up to 50, never more.
// The queue's SQL holds the same bound (career_apply_daily_limit, career_apply_enqueue).
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
  [/first\s*(&|and)\s*last\s*name/i, "full_name"],
  [/^first\s*name|^given\s*name|^preferred\s*first/i, "first_name"],
  [/^last\s*name|^family\s*name|^surname/i, "last_name"],
  [/^(full\s*)?name$|^legal\s*name/i, "full_name"],
  [/e-?mail/i, "email"],
  [/\b(tele)?phone\b|\bcell\b|^mobile\b(?!\s*(app|development|device|engineer))|mobile\s*(phone|number)/i, "phone"],
  [/resume|\bcv\b|curriculum/i, "resume"],
  [/cover\s*letter/i, "cover_letter"],
  [/how did you (hear|learn|find out)/i, "how_heard"],
  [/linkedin/i, "linkedin"],
  [/github/i, "github"],
  [/(personal\s*)?(website|portfolio)/i, "website"],
  [/(require|need).*(sponsor)|sponsorship|visa\s*status/i, "sponsorship"],
  [/(legally\s*)?authori[sz]ed\s*to\s*work|work\s*authori[sz]ation|eligible\s*to\s*work/i, "work_authorization"],
  [/^(current\s*)?(location|city)|where are you (located|based)/i, "location"],
  [/start\s*date|when can you start|earliest.*start/i, "start_date"],
  [/salary|compensation\s*expectation|desired\s*pay/i, "salary_expectation"],
  [/gender|race|ethnicity|veteran|disability|hispanic|latino/i, "eeo"],
];
// A wrong mapping sends a wrong answer; an unknown only asks. So the person's own contact facts go only into a free-text
// box (never a checkbox, radio or select, where "Do you own a smartphone?" or "Email me about other openings" would take
// the person's number or address), and never into a question about someone else (a reference, a manager, an emergency
// contact). tests/architect/wo-009-classify-precision.test.ts holds the real labels that were mapped wrongly before.
const CONTACT = new Set(["first_name", "last_name", "full_name", "email", "phone", "linkedin", "github", "website", "location", "start_date", "salary_expectation"]);
const FREE_TEXT = /^(input_text|text|email|tel|url|textarea|input|search|number|date)$/;
const SOMEONE_ELSE = /\breferr|\breferen|\bteam member|\breferee|\bemergency|\bmanager|\bsupervisor|\brecruiter|\bspouse|\bparent|\bguardian|\bemployee who/i;
export function classifyField(label: string, type: string): string {
  const l = String(label || "");
  if (/file/.test(type) && /resume|cv/i.test(l)) return "resume";
  // One checkbox carrying a long statement (no question in it) is an acknowledgement for the person to read, never a
  // fact. A long question rendered as checkboxes ("Will you ... require sponsorship ...?") is still a question.
  if (type === "checkbox" && l.length > 120 && !l.includes("?")) return "unknown";
  for (const [re, key] of KEYS) {
    if (!re.test(l)) continue;
    if (CONTACT.has(key) && (!FREE_TEXT.test(type) || SOMEONE_ELSE.test(l))) continue;
    // The resume answer is the approved file itself: it goes into an upload, never typed into a box as text.
    if ((key === "resume" || key === "cover_letter") && !/file/.test(type)) continue;
    // "a visa that does NOT require sponsorship" asks the opposite of the sponsorship fact: ask the person. Only the
    // question itself counts (up to its "?"): a note after it ("you must be authorized without sponsorship") does not.
    if (key === "sponsorship" && /\bnot\b|without|no longer/i.test(l.split("?")[0])) continue;
    // "authorized to work WITHOUT sponsorship?" needs both facts at once (authorized now, sponsorship later): ask.
    if (key === "work_authorization" && /sponsor/i.test(l.split("?")[0])) continue;
    return key;
  }
  return "unknown";
}

// Greenhouse asks "Resume/CV" as one question with two ways to answer it: a file upload (resume) and a paste box
// (resume_text), both marked required. The paste box beside its upload is the upload's alternative: uploading the
// approved file answers the question, and nothing is typed into the box. 63 of 80 real Greenhouse postings carry it.
export function fileAlternative(f: { name: string; type: string }, fields: { name: string; type: string }[]): boolean {
  const base = /^(.+)_text$/.exec(String(f.name || ""))?.[1];
  return !!base && !/file/.test(f.type) && fields.some((x) => x.name === base && /file/.test(x.type));
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

// WO-020 part 2: a question the keyword classifier does not place is read by meaning (question_map.ts) and answered from
// the person's own confirmed facts, onto the employer's own options (answer_options.ts). What each kind may do:
//   fact, attestation  the person's stated answer (an attestation is never a default: it exists only if they said it)
//   derived            computed from what they stated: "worked here before" from their confirmed employer list
//   consent            their standing consent, shown on the approval card as theirs
//   screen             this job's office days, relocation or travel, from their stated yes/no preference; anything else
//                      about the job is asked
//   essay, file, unknown  asked (an essay is drafted only in a later step, from confirmed facts, and shown in full)
// Contact and identity facts go only into a free-text box or onto a matching option, never into a checkbox.
const TEXT_FACTS = new Set(["full_name", "legal_name", "first_name", "last_name", "preferred_name", "email", "phone", "street_address",
  "full_address", "city", "postal_code", "location", "linkedin", "github", "website", "current_employer", "current_title", "school",
  "major", "salary_expectation", "current_compensation", "signature", "references", "timezone"]);
const PREFERENCE: Record<string, string> = { job_onsite: "onsite_ok", job_relocation: "relocation", job_travel: "travel_ok" };
const SPLIT = /\s*[;,\n]\s*/;
function byMeaning(f: FormField, company: string, answers: Record<string, Answer>): Answer | null {
  const m = mapQuestion({ label: f.label, type: f.type, options: f.options });
  if (m.kind === "essay" || m.kind === "file" || m.kind === "unknown") return null;
  let a: Answer | undefined;
  if (m.fact === "worked_here_before" && answers.former_employers) {
    const co = normCompany(company);
    const listed = String(answers.former_employers.value).split(SPLIT).map(normCompany).filter(Boolean);
    a = { value: co && listed.some((x) => x === co || co.includes(x) || x.includes(co)) ? "Yes" : "No", factId: answers.former_employers.factId };
  } else if (m.kind === "screen") {
    const pref = PREFERENCE[m.fact] ? answers[PREFERENCE[m.fact]] : answers[m.fact];
    // Only a plain yes or no from the person answers a question about this job; "3 days" is not "5 days a week".
    if (pref && yesNoOf(pref.value)) a = pref;
  } else {
    a = answers[m.fact];
  }
  if (!a) return null;
  const choice = f.options.length ? chooseOption(m.fact, String(a.value), f.options, f.label) : null;
  if (f.options.length) return choice === null ? null : { value: choice, factId: a.factId };
  if (f.type === "checkbox") {
    const yn = yesNoFromFact(m.fact, String(a.value), f.label) ?? yesNoOf(a.value);
    return yn ? { value: yn, factId: a.factId } : null;
  }
  if (TEXT_FACTS.has(m.fact) && !FREE_TEXT.test(f.type)) return null;
  return { value: String(a.value), factId: a.factId };
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
      if (fileAlternative(f, p.fields)) continue;
      const key = classifyField(f.label, f.type);
      const direct: Answer | undefined = (key !== "unknown" && key !== "eeo" ? o.answers[key] : undefined) ?? o.saved[normLabel(f.label)];
      let a: Answer | undefined = direct;
      let value: string | null = a ? String(a.value) : null;
      if (value !== null && f.options.length) value = matchOption(value, f.options) ?? (key !== "unknown" && direct === o.answers[key] ? chooseOption(key, value, f.options, f.label) : null);
      if (value === null && !direct) {
        const m = byMeaning(f, p.company, o.answers);
        if (m) { a = m; value = m.value; }
      }
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
