// WO-031: what the browser extension decides, as pure functions (no DOM, no chrome.*). The planner, the question map,
// the answer keys and the payload hash are the apply stack's own (D-014), imported, never copied:
//   planBatch / classifyField   supabase/functions/_shared/career_apply.ts
//   mapQuestion / NEVER_BY_TEXT supabase/functions/_shared/question_map.ts
//   hashApplyPayload            supabase/functions/_shared/career_apply_store.ts (the same canonical hash the queue's SQL computes)
//   questionsToStore            workers/career-browser/ask-once.ts (ask once, shared with the desktop runner)
// Bundled into extension/lib/trainee-core.js by extension/build.ts; tested by tests/architect/wo-031-extension.test.ts.
import { classifyField, classifyOutcome, type FormField, normLabel, type Observation, planBatch } from "../../supabase/functions/_shared/career_apply.ts";
import { mapQuestion, NEVER_BY_TEXT } from "../../supabase/functions/_shared/question_map.ts";
import { hashApplyPayload } from "../../supabase/functions/_shared/career_apply_store.ts";
import { questionsToStore } from "../../workers/career-browser/ask-once.ts";

export type Family = "greenhouse" | "lever" | "ashby" | "workday";
export interface Portal { family: Family; embedded: boolean }

// The application forms the extension recognizes, by host. Greenhouse also embeds its form in an employer's own page as an
// iframe from boards.greenhouse.io/embed/job_app; the content script runs in that frame. Workday is recognized only to say
// what it cannot do (D-013: the person signs in on the employer's site themselves).
const GREENHOUSE = /^(job-boards|boards)(\.eu)?\.greenhouse\.io$/;
const LEVER = /^jobs(\.eu)?\.lever\.co$/;
const ASHBY = /^jobs\.ashbyhq\.com$/;
const WORKDAY = /(^|\.)(myworkdayjobs\.com|myworkdaysite\.com|myworkday\.com)$/;
export function detectPortal(href: string): Portal | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (GREENHOUSE.test(h)) return { family: "greenhouse", embedded: /^\/embed\//.test(u.pathname) };
  if (LEVER.test(h)) return { family: "lever", embedded: false };
  if (ASHBY.test(h)) return { family: "ashby", embedded: false };
  if (WORKDAY.test(h)) return { family: "workday", embedded: false };
  return null;
}

// One posting, one key, the engine's shape (scripts/apply.ts posting()): family:tenant:id. Null when the link is not a
// posting (a board's list page, a search).
export function postingKey(href: string): string | null {
  const p = detectPortal(href);
  if (!p) return null;
  const u = new URL(href), seg = u.pathname.split("/").filter(Boolean);
  if (p.family === "greenhouse") {
    const tenant = u.searchParams.get("for") || seg[0] || "", id = u.pathname.match(/\/jobs\/(\d+)/)?.[1] || u.searchParams.get("token");
    return tenant && id && /^\d+$/.test(id) ? `greenhouse:${tenant}:${id}` : null;
  }
  if (p.family === "lever" || p.family === "ashby") {
    return seg[0] && seg[1] && /^[0-9a-f-]{8,}$/i.test(seg[1]) ? `${p.family}:${seg[0]}:${seg[1].toLowerCase()}` : null;
  }
  const last = seg.filter((s) => !/^(apply|applyManually|autofillWithResume)$/i.test(s)).at(-1);
  return last ? `workday:${u.hostname.toLowerCase()}:${last}` : null;
}

// The page that holds the form: a Lever or Ashby posting link opens its description; the form is one step on.
export function applyUrl(href: string): string {
  const p = detectPortal(href);
  if (!p) return href;
  const u = new URL(href), seg = u.pathname.split("/").filter(Boolean);
  if (p.family === "lever" && seg.length === 2) u.pathname = `/${seg[0]}/${seg[1]}/apply`;
  if (p.family === "ashby" && seg.length === 2) u.pathname = `/${seg[0]}/${seg[1]}/application`;
  return u.href;
}
export const tenantOf = (key: string) => key.split(":")[1] || "";

// A question that asks for an identity number, a bank or card number, or a secret: never filled, never stored, never in
// evidence. The person types it on the form; its value never leaves the page (NEVER_BY_TEXT, the texting side's rule).
// NEVER_BY_TEXT is the texting side's list; the extension also knows the identity numbers of other countries and the
// ways forms write "number" (WO-031 review: SIN, Aadhaar, Personnummer, "Passport #" and others went through).
export const IDENTITY_EXTRA =
  /\bsin\b|social insurance|social security|\bssn\b|national (identification|identity|id|insurance)\b|\bnin\b|\bni (number|no\b)|passport\s*(#|no\b|num|number)|driver'?s'? licen[cs]e\s*(#|no\b|num|number)|licen[cs]e\s*(#|number)|tax file number|\btfn\b|aadhaa?r|government[- ]issued( photo)? id|personnummer|\bcpf\b|\bcurp\b|\bpesel\b|\bnric\b|\bbsn\b|\bdni\b|\bnie\b|\bpps\b|\b(id|identity|identification) (card |document )?(number|no\b|#)|\btax (id|identification)|\biban\b|sort code|account number|routing number|card number|\bcvv\b|\bpassword\b|\bpin\b/i;
export const isIdentityField = (f: { label: string; name?: string }) => {
  const label = String(f.label || ""), name = String(f.name || "").replace(/[_\-\[\]]+/g, " ");
  return NEVER_BY_TEXT.test(label) || NEVER_BY_TEXT.test(name) || IDENTITY_EXTRA.test(label) || IDENTITY_EXTRA.test(name);
};
// A value the person typed with eight or more digits in a row (separators ignored) and no confirmed fact behind it may be
// an identity number whatever its label says: it is masked in the payload, the record, the evidence and the screenshot.
export const looksLikeIdNumber = (v: string) => /\d{8,}/.test(String(v || "").replace(/[\s.\-\/()+]/g, ""));

// On Workday only the basic contact fields are filled; every other answer is the person's on the employer's site.
const WORKDAY_BASIC = new Set(["first_name", "last_name", "full_name", "legal_name", "preferred_name", "email", "phone", "street_address",
  "full_address", "city", "state", "postal_code", "country", "location", "linkedin", "github", "website", "resume"]);
export const WORKDAY_NOTICE = "Workday needs you signed in on the employer's site; I fill the fields I can.";

export interface Answer { value: string; factId: string }
export interface PlannedField { name: string; label: string; value: string; factId: string }
// What the extension fills on this form and what it cannot answer, from the person's confirmed facts and saved answers.
// Both come from planBatch itself: once with every field optional (every answer the planner is sure of, even when a
// required question is still open, so the person sees the form mostly done), once as the form is (the required questions
// left, asked once by text). Identity numbers never reach the planner.
export function planForm(o: {
  userId: string; jobId: string; company: string; family: Family; schema: FormField[];
  answers: Record<string, Answer>; saved: Record<string, Answer>; now: number;
}) {
  const identity = o.schema.filter((f) => isIdentityField(f));
  // Two fields under one label: the label belongs to at most one of them, so neither is answered from it (WO-031
  // review: a referrer's phone read as "Phone"). Both are left to the person and listed as still needed.
  const count = new Map<string, number>();
  for (const f of o.schema) count.set(normLabel(f.label), (count.get(normLabel(f.label)) ?? 0) + 1);
  const ambiguous = o.schema.filter((f) => !isIdentityField(f) && (count.get(normLabel(f.label)) ?? 0) > 1);
  const fields = o.schema.filter((f) => !isIdentityField(f) && !ambiguous.includes(f));
  const posting = (fs: FormField[]) => [{ job_id: o.jobId, company: o.company, title: "", fields: fs }];
  const all = planBatch({ userId: o.userId, postings: posting(fields.map((f) => ({ ...f, required: false }))), answers: o.answers, saved: o.saved, log: [], now: o.now });
  let fill: PlannedField[] = all.ready[0]?.fields ?? [];
  if (o.family === "workday") {
    fill = fill.filter((p) => {
      const f = fields.find((x) => x.name === p.name)!;
      return WORKDAY_BASIC.has(classifyField(f.label, f.type)) || WORKDAY_BASIC.has(mapQuestion(f).fact);
    });
  }
  const strict = planBatch({ userId: o.userId, postings: posting(fields), answers: o.answers, saved: o.saved, log: [], now: o.now });
  const planned = new Set(fill.map((f) => f.name));
  const needs = o.family === "workday"
    ? fields.filter((f) => f.required && !planned.has(f.name)).map((f) => ({ label: f.label }))
    : strict.needs.map((n) => ({ label: n.label }));
  // Each open question as the form asks it, the engine's shape, so it is asked once by text in the form's own terms.
  const questions = needs.map((n) => {
    const f = fields.find((x) => x.label === n.label) || ({} as FormField);
    const opts = (f.options || []).filter((x) => x.label && !/^select\b/i.test(x.label.trim()));
    return { label: n.label, type: String(f.type || "input_text"), options: opts.length <= 60 ? opts.map((x) => String(x.label)) : [] };
  });
  return {
    fill, needs: questions, identity: identity.map((f) => ({ name: f.name, label: f.label, required: f.required })),
    ambiguous: ambiguous.map((f) => ({ name: f.name, label: f.label, required: f.required })),
  };
}

// The rows career_apply_questions_put_own stores, keyed by how far each answer may travel (answerKey).
export function questionsForTrainee(o: { jobId: string; company: string; needs: { label: string; type: string; options: string[] }[]; answers: Record<string, unknown>; answered: Set<string> }) {
  return questionsToStore({ posting: o.jobId, company: o.company, questions: o.needs }, { facts: o.answers, answered: o.answered });
}

// ------------------------------------------------------------------------------------------------ the reviewed payload
// Every answer the form will send, read back from the page, with where it came from:
//   trainee  filled by the extension from a confirmed fact (its fact id), unchanged since
//   you      typed or picked by the person on the page (a trusted input event)
//   page     set by the employer's page or changed by a script, not by the person: never approved (blocks the tap)
//   fixed    a read-only field the employer's page set (a reference code): shown, bound to the approval, not blocking
// `detail` is what the browser actually sends for the field beyond its visible text: a select's option value, the checked
// state and value of radios and checkboxes, the SHA-256 and size of an attached file's bytes (WO-031 review: the hash
// covered what was shown, not what was sent).
export type Source = "trainee" | "you" | "page" | "fixed";
export interface SnapField { name: string; label: string; value: string; source: Source; factId: string | null; masked: boolean; detail?: string }
export const MASKED = "[typed by you on the form; never kept by Trainee]";

export interface Account { epoch: number; version: number }
export function reviewPayload(o: {
  userId: string; jobId: string; company: string; url: string; family: Family;
  fields: SnapField[]; resume: { filename: string; sha256: string } | null; account: Account; expiresAt: string;
}) {
  return {
    version: 1 as const,
    source: "extension",
    user_id: o.userId,
    job_id: o.jobId,
    company: o.company,
    url: o.url,
    family: o.family,
    fields: o.fields.map((f) => ({ name: f.name, label: f.label, value: f.masked ? MASKED : f.value, source: f.source, factId: f.factId, detail: f.masked ? "" : f.detail ?? "" })),
    resume_name: o.resume?.filename ?? null,
    resume_sha256: o.resume?.sha256 ?? null,
    privacy_epoch: o.account.epoch,
    account_version: o.account.version,
    expires_at: o.expiresAt,
  };
}
export type ReviewPayload = ReturnType<typeof reviewPayload>;
// The approval is bound to this hash: the same canonical SHA-256 the queue's SQL computes (career_apply_canonical), so
// the database can check the person approved exactly what is recorded.
export const approvalHash = (p: ReviewPayload) => hashApplyPayload(p);
// The same payload as one string, for the check made in the same task as the click (a hash needs an await; this does not).
export const payloadText = (p: ReviewPayload) => JSON.stringify(p);

// Which answers differ between what the person reviewed and what the page holds now.
export function changedFields(reviewed: SnapField[], now: SnapField[]): string[] {
  const out: string[] = [];
  const at = new Map(now.map((f) => [f.name, f]));
  for (const r of reviewed) {
    const n = at.get(r.name);
    if (!n || n.value !== r.value || n.source !== r.source || (n.detail ?? "") !== (r.detail ?? "")) out.push(r.label);
  }
  for (const n of now) if (!reviewed.some((r) => r.name === n.name)) out.push(n.label);
  return out;
}

// What stops the one tap: a value the page set, a required question left open, a verification on the page.
export function blockers(o: { fields: SnapField[]; openRequired: string[]; challenge: boolean; family: Family }) {
  const out: string[] = [];
  if (o.challenge) out.push("A verification check is showing on the page. Finish it yourself there; Trainee never answers one.");
  for (const f of o.fields.filter((x) => x.source === "page")) {
    out.push(`"${f.label}" was set by the page, not by you or Trainee. Change or clear it yourself on the form.`);
  }
  for (const l of o.openRequired) out.push(`"${l}" is required and not answered yet.`);
  return out;
}

// What the page shows after the click, judged by the engine's classifyOutcome, with two rules of the extension's own
// (WO-031 review: one posting reached the employer twice). An error that was already on the page before the click (a
// cookie banner, a notice) is not the employer's answer. And after a click nothing is ever "not submitted": an end the
// page does not make clear (no answer within the wait, the form gone without a word) is unknown_outcome, which counts as
// applied and is never sent again.
export const NO_ANSWER_WAIT_MS = 30_000;
export function outcomeAfterClick(o: Observation, before: string[] = [], timedOut = false) {
  // An error counts only while the form is still there (a notice on a thank-you page is not a refused form), and only if
  // it was not already showing before the click.
  const fresh = o.form_present_after ? (o.validation_errors || []).filter((e) => !before.includes(e)) : [];
  const r = classifyOutcome({ ...o, validation_errors: fresh });
  if (timedOut && o.form_present_after && !fresh.length && !o.captcha && !o.email_code_prompt) {
    return { state: "unknown_outcome", reason: "the employer did not answer within 30 seconds; counted as applied, never sent again", confirmation_id: null };
  }
  if (r.state === "not_submitted") return { state: "unknown_outcome", reason: `after the click, ${r.reason}; counted as applied, never sent again`, confirmation_id: null };
  return r;
}
export const BEFORE_CLICK = "stopped before the click";

// The card the person reads before the tap: plain text, every answer exactly as it will be sent.
const MARK: Record<string, string> = { consent: "You agree: ", attestation: "Your statement: ", screen: "About this job: " };
// A label as the person reads it: the form's required star dropped, a long statement cut at 160 characters.
export const shortLabel = (l: string) => {
  const t = String(l || "").replace(/\s*[*✱]+\s*$/, "").replace(/\s+/g, " ").trim();
  return t.length > 160 ? t.slice(0, 157) + "..." : t;
};
export function cardLines(o: {
  company: string; family: Family; payload: ReviewPayload; openRequired: string[]; identity: { label: string }[];
  blockers: string[]; verification: string[]; ambiguous?: { label: string }[];
}) {
  const lines: string[] = [`${o.company}`];
  if (o.family === "workday") lines.push(WORKDAY_NOTICE);
  lines.push("Every answer exactly as it will be sent:");
  for (const f of o.payload.fields) {
    const from = f.source === "trainee" ? "" : f.source === "you" ? " (typed by you)" : f.source === "fixed" ? " (set by the employer's page, read-only)" : " (set by the page)";
    lines.push(`${MARK[mapQuestion({ label: f.label }).kind] ?? ""}${shortLabel(f.label)}: ${f.value}${from}`);
  }
  lines.push(`Resume: ${o.payload.resume_name ?? "none attached"}`);
  for (const l of o.openRequired) lines.push(`Still needed: ${l}. Answer it on the form, or answer Trainee once by text and it fills on every later form.`);
  for (const f of o.ambiguous ?? []) lines.push(`Still needed: ${shortLabel(f.label)}. Two fields on this form share that label, so Trainee left both for you.`);
  for (const f of o.identity) lines.push(`Type this yourself on the form: ${f.label}. Trainee never fills, keeps or sends it anywhere.`);
  if (o.verification.length) lines.push(`The page runs a verification check (${o.verification.join(", ")}). If it asks you something, you answer it.`);
  lines.push(`Approve sends it with the site's own Submit at ${new URL(o.payload.url).host}.`);
  for (const b of o.blockers) lines.push(`Before you can approve: ${b}`);
  return lines.map((l) => l.trim()).filter(Boolean);
}

// ------------------------------------------------------------------------------------------------ evidence
// No identity number leaves the page: the reviewed payload already carries MASKED for those fields; the confirmation text
// is scrubbed of anything shaped like one (an SSN, a nine-digit number) before it is kept or recorded.
export function scrubIdentity(text: string): string {
  return String(text || "").replace(/\b\d{3}[- ]\d{2}[- ]\d{4}\b/g, "[number removed]").replace(/\b\d{9}\b/g, "[number removed]");
}
export function outcomeOf(o: Observation) {
  return classifyOutcome(o);
}
// The record must fit the queue's 64 KB evidence limit, or every try to record it fails (WO-031 review): an answer over
// 500 characters is kept as its first 500, its length and the SHA-256 of the whole; if the record is still too big, the
// answers are kept as hashes only. Its shape is fixed (WO-042 counts on it): times, screenshot_sha256,
// screenshot_after_sha256, confirmation_text, confirmation_id, url_after.
const sha256Text = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((n) => n.toString(16).padStart(2, "0")).join("");
export const EVIDENCE_LIMIT = 60_000;
export async function evidenceRecord(o: {
  payload: ReviewPayload; hash: string; outcome: { state: string; reason: string; confirmation_id: string | null };
  pageText: string; urlAfter: string; screenshotSha256: string | null; screenshotAfterSha256: string | null;
  times: { card: number; approved: number; clicked: number; done: number };
}) {
  const answers: Record<string, unknown>[] = [];
  for (const f of o.payload.fields) {
    answers.push(f.value.length > 500
      ? { label: f.label.slice(0, 300), value: f.value.slice(0, 500), value_length: f.value.length, value_sha256: await sha256Text(f.value), source: f.source }
      : { label: f.label.slice(0, 300), value: f.value, source: f.source });
  }
  const iso = (t: number) => new Date(t).toISOString();
  const rec = {
    reason: o.outcome.reason,
    confirmation_id: o.outcome.confirmation_id,
    source: "extension",
    approval_hash: o.hash,
    answers,
    screenshot_after_sha256: o.screenshotAfterSha256,
    times: { card_shown_at: iso(o.times.card), approved_at: iso(o.times.approved), clicked_at: iso(o.times.clicked), finished_at: iso(o.times.done) },
    resume_name: o.payload.resume_name,
    screenshot_sha256: o.screenshotSha256,
    confirmation_text: scrubIdentity(o.pageText).slice(0, 2000),
    url_after: o.urlAfter,
    card_shown_at: new Date(o.times.card).toISOString(),
    approved_at: new Date(o.times.approved).toISOString(),
    clicked_at: new Date(o.times.clicked).toISOString(),
    finished_at: new Date(o.times.done).toISOString(),
    ms_card_to_done: o.times.done - o.times.card,
  };
  if (JSON.stringify(rec).length > EVIDENCE_LIMIT) {
    rec.answers = await Promise.all(o.payload.fields.map(async (f) => ({ value_sha256: await sha256Text(f.label + "\n" + f.value), source: f.source })));
  }
  return rec;
}

// "Confirmed" needs proof the person can see: the page after the click was read and photographed. Without the after
// screenshot the card never says confirmed (the owner: "when someone submits... they need to show proof").
export function cardOutcome(o: { state: string; reason: string; confirmation_id: string | null }, hasAfterShot: boolean) {
  if (o.state === "confirmed" && hasAfterShot) {
    return { status: "done", message: `Sent and confirmed by the employer${o.confirmation_id ? ` (${o.confirmation_id})` : ""}.` };
  }
  if (o.state === "confirmed" || o.state === "submitted_unconfirmed" || o.state === "unknown_outcome") {
    return { status: "done", message: "Sent; the employer's answer could not be captured. Check your email for their confirmation." };
  }
  if (o.state === "needs_user") return { status: "done", message: "Sent, and the page now asks you for something (a check or a code). Finish it yourself on the page." };
  return { status: "done", message: `Not confirmed: ${o.reason}.` };
}

// Links to postings in a pasted list or in Trainee's alert texts: one posting each, in order, the form's own page.
export function postingLinks(text: string, max = 100): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const m of String(text || "").matchAll(/https:\/\/[^\s<>"')]+/g)) {
    const url = m[0].replace(/[.,;]+$/, "");
    const key = postingKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(applyUrl(url));
    if (out.length >= max) break;
  }
  return out;
}
