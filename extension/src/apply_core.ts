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
import { howHeardChannel } from "../../supabase/functions/_shared/answer_options.ts";
import { readAiPolicy } from "../../supabase/functions/_shared/ai_policy.ts";

export { applyUrl, detectPortal, type Family, type Portal, postingKey, tenantOf } from "../../supabase/functions/_shared/posting_key.ts";
import { applyUrl, detectPortal, type Family, type Portal, postingKey, tenantOf } from "../../supabase/functions/_shared/posting_key.ts";

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

// On a Workday page that is not the application flow the extension reads (WO-048: no formField-* wrappers, an unknown
// layout), only the basic contact fields are filled (WO-031); in the flow, every field goes to the planner.
const WORKDAY_BASIC = new Set(["first_name", "last_name", "full_name", "legal_name", "preferred_name", "email", "phone", "street_address",
  "full_address", "city", "state", "postal_code", "country", "location", "linkedin", "github", "website", "resume"]);
export const WORKDAY_NOTICE = "Workday needs you signed in on the employer's site; I fill the fields I can.";
// WO-048: the words the person reads on a Workday card.
export const WORKDAY_PAGE_SET = "Filled by Workday from your resume: check them";
export const workdayDraftLine = (employer: string) => `Save and Continue sends this page to ${employer} as a draft; nothing is submitted.`;
export const workdaySubmitLine = (employer: string) => `Approve submits this application to ${employer} with Workday's own Submit. This is the last step.`;
export const workdaySignIn = (employer: string) => `Sign in to ${employer}'s Workday yourself; I'll fill the application after.`;
export const WORKDAY_PERSONAL = "The disability form (Voluntary Self-Identification of Disability) is yours: Trainee never fills it. Answer it yourself on the page.";
// The employer as its Workday tenant names it: the first label of the tenant's host ("northwind" of northwind.wd5...).
export function workdayEmployer(href: string): string {
  try {
    return new URL(href).hostname.toLowerCase().split(".")[0] || "the employer";
  } catch {
    return "the employer";
  }
}

export interface Answer { value: string; factId: string }
export interface PlannedField { name: string; label: string; value: string; factId: string }
// What the extension fills on this form and what it cannot answer, from the person's confirmed facts and saved answers.
// Both come from planBatch itself: once with every field optional (every answer the planner is sure of, even when a
// required question is still open, so the person sees the form mostly done), once as the form is (the required questions
// left, asked once by text). Identity numbers never reach the planner.
export function planForm(o: {
  userId: string; jobId: string; company: string; family: Family; schema: FormField[];
  answers: Record<string, Answer>; saved: Record<string, Answer>; now: number; workdayFlow?: boolean; location?: string;
}) {
  const identity = o.schema.filter((f) => isIdentityField(f));
  // Two fields under one label: the label belongs to at most one of them, so neither is answered from it (WO-031
  // review: a referrer's phone read as "Phone"). Both are left to the person and listed as still needed.
  const count = new Map<string, number>();
  for (const f of o.schema) count.set(normLabel(f.label), (count.get(normLabel(f.label)) ?? 0) + 1);
  const ambiguous = o.schema.filter((f) => !isIdentityField(f) && !f.personal && (count.get(normLabel(f.label)) ?? 0) > 1);
  // WO-048: a form only the person fills (the disability self-identification) is neither planned nor asked by text.
  const fields = o.schema.filter((f) => !isIdentityField(f) && !ambiguous.includes(f) && !f.personal);
  // WO-053: the posting's own location as its page shows it, for the questions that depend on where the job is.
  const posting = (fs: FormField[]) => [{ job_id: o.jobId, company: o.company, title: "", fields: fs, location: o.location }];
  const all = planBatch({ userId: o.userId, postings: posting(fields.map((f) => ({ ...f, required: false }))), answers: o.answers, saved: o.saved, log: [], now: o.now });
  let fill: PlannedField[] = all.ready[0]?.fields ?? [];
  const basicOnly = o.family === "workday" && !o.workdayFlow;
  if (basicOnly) {
    fill = fill.filter((p) => {
      const f = fields.find((x) => x.name === p.name)!;
      return WORKDAY_BASIC.has(classifyField(f.label, f.type)) || WORKDAY_BASIC.has(mapQuestion(f).fact);
    });
  }
  const strict = planBatch({ userId: o.userId, postings: posting(fields), answers: o.answers, saved: o.saved, log: [], now: o.now });
  const planned = new Set(fill.map((f) => f.name));
  const needs = basicOnly
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

// WO-042: a dropdown widget's options exist only once its menu opens on the page (Greenhouse's react-select). The choice
// among them is the planner's, exactly as for an ordinary select: the field is planned again with the employer's own
// option texts. A phone-country list ("United States +1") is matched by its country. Nothing the planner would not choose
// is ever picked: no answer, or one that is not on the list, leaves the widget for the person.
export function chooseWidgetOption(o: {
  userId: string; jobId: string; company: string; family: Family; field: FormField; labels: string[];
  answers: Record<string, Answer>; saved: Record<string, Answer>; now: number; form?: FormField[]; location?: string;
}): string | null {
  const labels = o.labels.map((l) => String(l).replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!labels.length) return null;
  const dial = labels.length > 20 && labels.filter((l) => /\s\+\d{1,4}$/.test(l)).length > labels.length * 0.8;
  const options = labels.map((l) => ({ label: dial ? l.replace(/\s\+\d{1,4}$/, "") : l, value: l }));
  // The rest of the form rides along without options, for the rules that read a field beside its neighbours.
  const rest = (o.form ?? []).filter((f) => f.name !== o.field.name).map((f) => ({ ...f, options: [] }));
  const r = planForm({ userId: o.userId, jobId: o.jobId, company: o.company, family: o.family, schema: [{ ...o.field, options }, ...rest], answers: o.answers, saved: o.saved, now: o.now, location: o.location });
  const v = r.fill.find((p) => p.name === o.field.name)?.value ?? null;
  return v !== null && labels.includes(v) ? v : null;
}

// The rows career_apply_questions_put_own stores, keyed by how far each answer may travel (answerKey).
export function questionsForTrainee(o: { jobId: string; company: string; location?: string; needs: { label: string; type: string; options: string[] }[]; answers: Record<string, unknown>; answered: Set<string> }) {
  return questionsToStore({ posting: o.jobId, company: o.company, location: o.location, questions: o.needs }, { facts: o.answers, answered: o.answered });
}

// Ask once, from the form (WO-042, session run 4: every repeat of a question cost the person the same seconds, since
// only answers given by text were kept). A question this posting could not answer, which the person then answered on the
// form themselves and approved on the card, is kept under the same key the text path uses (answerKey: a fact for every
// employer, a wording, or this posting only), so it travels exactly as far as a texted answer would. Never a masked or
// identity value, never a file, never anything the page or Trainee filled. An answer that would travel beyond this
// posting is kept only when it can be true elsewhere: never one naming this employer, and a how-heard answer only when it
// names a channel ("A friend here told me" is about this employer). Two kinds never leave their posting (session run 5,
// where an acknowledgment ticked for one employer and a veteran-status answer were filled again at the next):
//   a statement the person agreed to (a consent, an attestation, "I understand / acknowledge / agree / confirm ..."): an
//     agreement is given to one employer, and another employer's identical words are agreed to only by the person;
//   a self-identification answer (gender, race, ethnicity, veteran or disability status): voluntary, and given to one
//     employer; the planner never fills it from facts either.
const AGREEMENT = /^\s*(i|we)\s+(hereby\s+)?(understand|acknowledge|agree|confirm|certify|consent|accept|attest|authori[sz]e|have read|declare)\b/i;
const staysWithPosting = (row: { kind: string; label: string; type: string; options: string[] }) => {
  if (row.kind === "consent" || row.kind === "attestation" || AGREEMENT.test(row.label)) return true;
  const m = mapQuestion({ label: row.label, type: row.type, options: row.options.map((l) => ({ label: l })) }) as { fact?: string };
  return m.fact === "eeo" || classifyField(row.label, row.type) === "eeo";
};
const namesEmployer = (answer: string, company: string) => {
  const c = String(company ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(inc|llc|ltd|corp|co|the)\b/g, "").replace(/\s+/g, " ").trim();
  return c.length >= 3 && ` ${answer.toLowerCase().replace(/[^a-z0-9 ]/g, " ")} `.includes(` ${c} `);
};
export function formAnswersToKeep(o: {
  jobId: string; company: string; location?: string; needs: { label: string; type: string; options: string[] }[];
  fields: { name: string; label: string; value: string; source: string }[]; answers: Record<string, unknown>; answered: Set<string>;
}) {
  const q = questionsForTrainee(o);
  const norm = (x: string) => String(x ?? "").replace(/\s+/g, " ").trim();
  const out: { key: string; kind: string; label: string; type: string; options: string[]; company: string | null; answer: string }[] = [];
  for (const row of q.questions as any[]) {
    if (/file/.test(String(row.type))) continue;
    const f = o.fields.find((x) => (x.source === "you" || x.source === "drafted") && !x.name.startsWith("fixed:") && norm(x.label) === row.label);
    const answer = norm(f?.value ?? "");
    if (!f || !answer || answer === MASKED || answer.length > 2000 || staysWithPosting(row)) continue;
    // WO-049: a written answer (and above all one Trainee drafted on the card) is kept for this posting only, never as a
    // fact or a wording that would put it on another employer's form.
    if ((row.kind === "essay" || f.source === "drafted") && !String(row.key).startsWith("job:")) continue;
    if (!String(row.key).startsWith("job:") && (namesEmployer(answer, o.company) || (row.key === "fact:how_heard" && !howHeardChannel(answer)))) continue;
    out.push({ key: row.key, kind: row.kind, label: row.label, type: row.type, options: row.options, company: row.company, answer });
  }
  return { posting: q.posting, answers: out };
}

// ------------------------------------------------------------------------------------------------ answer once (WO-054)
// Before the session the queue's postings are read in hidden tabs (planForm, strict; nothing filled or clicked) and the
// questions only the person can answer are asked once in the panel. They are grouped by the key the planner reads saved
// answers by (answerKey, through questionsToStore, so a fact the person stated that did not fit a form is that posting's):
// a fact or a wording is one entry for every posting that asks it; a question about one job (job:) stays that posting's
// and is shown with its company. Never listed (left for the card): an identity number, a self-identification (EEO, the
// disability form), a written answer (drafted on the card, WO-049), a file, and an agreement (an agreement is given to one
// employer: formAnswersToKeep's rule). The panel starts every choice empty; only the person's own pick is ever stored.
export interface OpenQuestion { label: string; type: string; options: string[]; personal?: boolean }
export interface PreparedPosting { jobId: string; company: string; url?: string; location?: string; needs: OpenQuestion[] }
export interface AskedAt { jobId: string; company: string; label: string; type: string; options: string[]; misfit: boolean }
export interface PanelQuestion {
  key: string; kind: string; label: string; type: string; options: string[]; similar: number; postings: AskedAt[]; perPosting: boolean; selected: null;
}
export type LeftReason = "identity" | "personal" | "essay" | "file" | "agreement";
function leftForCard(n: OpenQuestion): LeftReason | null {
  const q = { label: n.label, type: n.type, options: (n.options || []).map((l) => ({ label: l })) };
  if (isIdentityField({ label: n.label }) || NEVER_BY_TEXT.test(n.label)) return "identity";
  const m = mapQuestion(q);
  if (n.personal || m.fact === "eeo" || classifyField(n.label, n.type) === "eeo") return "personal";
  if (/file/.test(String(n.type)) || m.kind === "file") return "file";
  if (m.kind === "essay") return "essay";
  // A statement whose only answers accept it ("Agreement to Arbitrate" over "I understand and agree ...") is an agreement.
  if (n.options?.length && n.options.every((l) => /^\s*(i\s+)?(will read|accept|agree|acknowledge|understand|consent|confirm|certify|attest)\b/i.test(l))) return "agreement";
  return null;
}
export function answerOnceQuestions(o: { postings: PreparedPosting[]; answers: Record<string, unknown>; answered: Set<string> }) {
  const by = new Map<string, Omit<PanelQuestion, "label" | "type" | "options" | "similar" | "selected">>();
  const left: { jobId: string; label: string; why: LeftReason }[] = [];
  for (const p of o.postings) {
    const keep: OpenQuestion[] = [];
    for (const n of p.needs) {
      const why = leftForCard(n);
      if (why) left.push({ jobId: p.jobId, label: n.label, why });
      else keep.push(n);
    }
    for (const r of questionsForTrainee({ jobId: p.jobId, company: p.company, location: p.location, needs: keep, answers: o.answers, answered: o.answered }).questions as any[]) {
      if (staysWithPosting(r)) {
        left.push({ jobId: p.jobId, label: r.label, why: "agreement" });
        continue;
      }
      const g = by.get(r.key) ?? { key: r.key, kind: r.kind, postings: [], perPosting: String(r.key).startsWith("job:") };
      g.postings.push({ jobId: p.jobId, company: p.company, label: r.label, type: r.type, options: r.options, misfit: !!r.misfit });
      by.set(r.key, g);
    }
  }
  const questions: PanelQuestion[] = [...by.values()].map((g) => {
    // The wording most postings use (the first seen on a tie), and that posting's own options; it goes first.
    const count = new Map<string, number>();
    for (const a of g.postings) count.set(shortLabel(a.label), (count.get(shortLabel(a.label)) ?? 0) + 1);
    const top = [...count].reduce((b, x) => (x[1] > b[1] ? x : b))[0];
    const rep = g.postings.find((a) => shortLabel(a.label) === top)!;
    const postings = [rep, ...g.postings.filter((a) => a !== rep)];
    return { ...g, postings, label: rep.label, type: rep.type, options: rep.options, similar: count.size - 1, selected: null };
  });
  // Asked by the most postings first; otherwise in queue order (sort is stable).
  questions.sort((a, b) => b.postings.length - a.postings.length);
  return { questions, left };
}
// WO-064: the panel's questions drafted from the person's confirmed facts, on their tap (career-answer-draft). A form that
// asks for the person's own words gets no free-text draft (own_words); the server never sees a fact from here.
export function ownWordsAsked(labels: string[]): boolean {
  const p = readAiPolicy(labels).policy;
  return p === "prohibited" || p === "unread";
}
export function shortDraftRequest(questions: PanelQuestion[], ownWordsJobs: string[]) {
  const own = new Set(ownWordsJobs.map(String));
  return questions.slice(0, 200).map((q) => ({
    key: q.key, label: q.label, type: q.type, options: q.options, company: q.postings[0]?.company ?? "",
    own_words: q.postings.some((p) => own.has(String(p.jobId))),
  }));
}
// What the panel shows: a draft only for a question still open, and an option answer only when it is one of that
// question's own options (the server checked; this checks again, since the reply came over the network).
export type ShownDraft = { answer: string; from: string[] };
export function draftsFromReply(questions: PanelQuestion[], drafts: unknown): Record<string, ShownDraft> {
  const out: Record<string, ShownDraft> = {};
  const byKey = new Map(questions.map((q) => [q.key, q]));
  for (const d of Array.isArray(drafts) ? drafts : []) {
    const q = byKey.get(String(d?.key));
    if (!q || d?.ok !== true || typeof d.answer !== "string" || !d.answer.trim()) continue;
    const answer = d.answer.trim().slice(0, 600);
    if (q.options.length && !answer.split(/\s*;\s*/).every((a: string) => q.options.includes(a))) continue;
    out[q.key] = { answer, from: (Array.isArray(d.from) ? d.from : []).map((x: unknown) => String(x).slice(0, 100)).slice(0, 4) };
  }
  return out;
}
// The person's picks as the rows the store already takes: per posting, the questions (career_apply_questions_put_own, so
// the row names that posting) and the answers (career_apply_questions_answer_from_form_own, under the same key the text
// path uses). An empty pick is a skip, left for the card. A pick that is not one of the shown options, an identity-shaped
// number, or (beyond one posting) an answer naming an employer or a how-heard that names no channel is refused, never kept.
export function answerOnceRows(o: { questions: PanelQuestion[]; picks: { key: string; answer: string }[] }) {
  const groups = new Map<string, { posting: string; questions: Record<string, unknown>[]; answers: { key: string; kind: string; label: string; type: string; options: string[]; company: string; answer: string }[] }>();
  const refused: { key: string; why: string }[] = [];
  for (const pick of o.picks) {
    const q = o.questions.find((x) => x.key === pick.key);
    const answer = String(pick.answer ?? "").replace(/\s+/g, " ").trim();
    if (!q || !answer) continue;
    const why = answer.length > 2000 || answer === MASKED || looksLikeIdNumber(answer) ? "not an answer Trainee keeps"
      : q.options.length && !q.options.includes(answer) ? "not one of the employer's options"
      : !q.perPosting && (q.postings.some((a) => namesEmployer(answer, a.company)) || (q.key === "fact:how_heard" && !howHeardChannel(answer)))
      ? "it names one employer, so it is answered on that card" : null;
    if (why) {
      refused.push({ key: q.key, why });
      continue;
    }
    const at = q.postings[0];
    const g = groups.get(at.jobId) ?? { posting: at.jobId, questions: [], answers: [] };
    g.questions.push({ key: q.key, kind: q.kind, label: at.label, type: at.type, options: at.options, company: at.company, misfit: at.misfit });
    g.answers.push({ key: q.key, kind: q.kind, label: at.label, type: at.type, options: at.options, company: at.company, answer });
    groups.set(at.jobId, g);
  }
  return { groups: [...groups.values()], refused };
}
// The fields on a card Trainee filled from an answer the person gave in the panel before the session (its stored row).
export const beforeSession = (fields: SnapField[], factIds: string[]) =>
  fields.filter((f) => f.source === "trainee" && !!f.factId && factIds.includes(f.factId)).map((f) => f.name);

// ------------------------------------------------------------------------------------------------ the reviewed payload
// Every answer the form will send, read back from the page, with where it came from:
//   trainee  filled by the extension from a confirmed fact (its fact id), unchanged since
//   you      typed or picked by the person on the page (a trusted input event)
//   page     set by the employer's page or changed by a script, not by the person: never approved (blocks the tap)
//   fixed    a read-only field the employer's page set (a reference code): shown, bound to the approval, not blocking
//   drafted  a written answer Trainee drafted on the card from the person's confirmed facts, put on the form by the
//            person's own "Use this" (and edited by them, if they did); its factId names the facts (WO-049)
// `detail` is what the browser actually sends for the field beyond its visible text: a select's option value, the checked
// state and value of radios and checkboxes, the SHA-256 and size of an attached file's bytes (WO-031 review: the hash
// covered what was shown, not what was sent).
//   workday  (WO-048) a value Workday itself had set when Trainee first read the page (a tenant's default, a resume parse):
//            shown under "Filled by Workday from your resume: check them", never counted as Trainee's, never overwritten
export type Source = "trainee" | "you" | "page" | "fixed" | "drafted" | "workday";
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
// WO-048: what one Workday step's card says. A page step ("draft"): that page's answers exactly as Save and Continue will
// send them, Workday's own values apart, and that nothing is submitted. The Review step ("submit"): the review page's own
// reading of every answer, and the one Submit.
export interface WorkdayCard {
  action: "draft" | "submit"; step: string; employer: string; conflicts?: { label: string; workday: string; yours: string }[]; personal?: boolean;
}
export function cardLines(o: {
  company: string; family: Family; payload: ReviewPayload; openRequired: string[]; identity: { label: string }[];
  blockers: string[]; verification: string[]; ambiguous?: { label: string }[]; workday?: WorkdayCard; before?: string[];
}) {
  if (o.family === "workday" && o.workday) return workdayLines(o as typeof o & { workday: WorkdayCard });
  const lines: string[] = [`${o.company}`];
  if (o.family === "workday") lines.push(WORKDAY_NOTICE);
  lines.push("Every answer exactly as it will be sent:");
  for (const f of o.payload.fields) {
    const ids = draftFactIds(f.factId);
    // WO-054: an answer the person gave in the panel before the session says so, so they check it here.
    const from = f.source === "trainee" ? (o.before?.includes(f.name) ? " (your answer, answered before the session)" : "") : f.source === "you" ? " (typed by you)" : f.source === "fixed" ? " (set by the employer's page, read-only)"
      : f.source === "drafted" ? ` (drafted by Trainee from your confirmed facts${ids.length ? ` ${ids.join(", ")}` : ""}; put on the form by you)` : " (set by the page)";
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
function workdayLines(o: Parameters<typeof cardLines>[0] & { workday: WorkdayCard }) {
  const w = o.workday;
  const lines: string[] = [`${o.company}`, WORKDAY_NOTICE];
  const line = (f: ReviewPayload["fields"][number], from = "") => `${MARK[mapQuestion({ label: f.label }).kind] ?? ""}${shortLabel(f.label)}: ${f.value}${from}`;
  if (w.action === "submit") {
    lines.push(`${w.step || "Review"}: your application exactly as Workday shows it before Submit:`);
    // The review's labels carry their step and section ("My Experience: Languages 1 — Writing"); read as they are.
    for (const f of o.payload.fields) lines.push(`${shortLabel(f.label)}: ${f.value}`);
  } else {
    lines.push(`${w.step || "This page"}: every answer on this page exactly as Save and Continue will send it:`);
    for (const f of o.payload.fields.filter((x) => x.source !== "workday")) {
      lines.push(line(f, f.source === "you" ? " (typed by you)" : f.source === "fixed" ? " (set by the employer's page, read-only)" : f.source === "page" ? " (set by the page)" : ""));
    }
    const ws = o.payload.fields.filter((x) => x.source === "workday");
    if (ws.length || w.conflicts?.length) lines.push(WORKDAY_PAGE_SET);
    for (const f of ws) lines.push(line(f));
    for (const c of w.conflicts ?? []) {
      lines.push(`${shortLabel(c.label)}: Workday has "${c.workday}"; your confirmed answer is "${c.yours}". Trainee left Workday's value; change it on the page if yours is right.`);
    }
  }
  if (w.personal) lines.push(WORKDAY_PERSONAL);
  for (const l of o.openRequired) lines.push(`Still needed: ${l}. Answer it on the page.`);
  for (const f of o.ambiguous ?? []) lines.push(`Still needed: ${shortLabel(f.label)}. Two fields on this page share that label, so Trainee left both for you.`);
  for (const f of o.identity) lines.push(`Type this yourself on the form: ${f.label}. Trainee never fills, keeps or sends it anywhere.`);
  if (o.verification.length) lines.push(`The page runs a verification check (${o.verification.join(", ")}). If it asks you something, you answer it.`);
  lines.push(w.action === "submit" ? workdaySubmitLine(w.employer) : workdayDraftLine(w.employer));
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
  times: { card: number; approved: number; clicked: number; done: number }; drafts?: Record<string, { original: string; factIds: string[] }>;
}) {
  const answers: Record<string, unknown>[] = [];
  // WO-049 (D-024): a drafted answer says so in the record, with the facts it came from and whether the person edited it.
  const drafted = draftProvenance(o.payload.fields, o.drafts ?? {});
  for (const f of o.payload.fields) {
    const d = drafted[f.name];
    const prov = d ? { fact_ids: d.fact_ids, edited: d.edited, provenance: d.said } : {};
    answers.push(f.value.length > 500
      ? { label: f.label.slice(0, 300), value: f.value.slice(0, 500), value_length: f.value.length, value_sha256: await sha256Text(f.value), source: f.source, ...prov }
      : { label: f.label.slice(0, 300), value: f.value, source: f.source, ...prov });
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
    rec.answers = await Promise.all(o.payload.fields.map(async (f) => ({ value_sha256: await sha256Text(f.label + "\n" + f.value), source: f.source,
      ...(drafted[f.name] ? { fact_ids: drafted[f.name].fact_ids, edited: drafted[f.name].edited } : {}) })));
  }
  return rec;
}

// "Confirmed" needs proof the person can see: the page after the click was read and photographed. Without the after
// screenshot the card never says confirmed (the owner: "when someone submits... they need to show proof").
export function cardOutcome(o: { state: string; reason: string; confirmation_id: string | null }, hasAfterShot: boolean) {
  if (o.state === "confirmed" && hasAfterShot) {
    return { status: "done", message: `Sent; the employer's page confirmed it${o.confirmation_id ? ` (${o.confirmation_id})` : ""}. Their email makes it final.` };
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

// ------------------------------------------------------------------------------------------------ written answers (WO-049)
// The card offers "Draft from my facts" on each written question the form still needs (question_map: kind essay). The
// draft is the server's (supabase/functions/career-essay-draft): the employer's AI policy first, the person's confirmed
// facts only, every item traced, the form's limit met by writing again. It reaches the form only by the person's "Use
// this", as source "drafted", and the approval binds its exact text like any other answer.
export const DRAFT_PREFIX = "essay-draft:";
// The facts a drafted answer came from, carried in the payload field's factId (at most 200 characters, as a fact id).
export function draftFactId(ids: string[]): string {
  let out = DRAFT_PREFIX;
  for (const id of ids.map((x) => String(x).replace(/[,\s]+/g, "")).filter(Boolean)) {
    const next = out === DRAFT_PREFIX ? out + id : `${out},${id}`;
    if (next.length > 200) break;
    out = next;
  }
  return out;
}
export const draftFactIds = (factId: string | null | undefined): string[] =>
  typeof factId === "string" && factId.startsWith(DRAFT_PREFIX) ? factId.slice(DRAFT_PREFIX.length).split(",").filter(Boolean) : [];

export interface EssayAsk { name: string; label: string; type: string; chars: number | null; own: string | null }
// The employer's own AI policy, read on the card as the server reads it (ai_policy.ts over the question and the form's
// other labels): a form that asks for answers written without AI, or names a policy it does not spell out, is never
// offered a draft; the card says so up front and no request is sent (WO-049 follow-up).
export const OWN_WORDS_BANNED = "This form asks for answers written without AI, so Trainee won't draft this one: it needs your own words.";
export const OWN_WORDS_UNREAD = "This form names its own AI policy without saying what it allows, so Trainee won't draft this one: it needs your own words.";
// The written questions the card offers to draft: required, not an identity number, a written answer by the question map,
// and not answered yet, or answered with a draft the person used (so its text stays editable on the card). One the person
// typed themselves, or that Trainee filled from a saved answer, is theirs and not offered.
export function essayQuestions(o: { schema: FormField[]; fields: { name: string; source: string }[]; maxLength?: Record<string, number> }): EssayAsk[] {
  const by = new Map(o.fields.map((f) => [f.name, f]));
  return o.schema
    .filter((f) => f.required && !isIdentityField(f) && mapQuestion({ label: f.label, type: f.type, options: f.options || [] }).kind === "essay")
    .filter((f) => !by.has(f.name) || by.get(f.name)!.source === "drafted")
    .map((f) => {
      const n = Number(o.maxLength?.[f.name]);
      const policy = readAiPolicy([f.label, ...o.schema.map((x) => x.label).filter((l) => l !== f.label)]).policy;
      const own = policy === "prohibited" ? OWN_WORDS_BANNED : policy === "unread" ? OWN_WORDS_UNREAD : null;
      return { name: f.name, label: String(f.label), type: String(f.type || "textarea"), chars: Number.isInteger(n) && n > 0 ? n : null, own };
    });
}
// A draft the card may show: the server said ok, whole text that ends a sentence, within one answer's size. Anything else
// (a refusal, an unverified or cut-off draft) is never shown; the card says why in one line.
export function showableDraft(r: unknown): boolean {
  const x = r as any;
  return !!x && x.ok === true && typeof x.text === "string" && x.text.trim().length > 0 && x.text.length <= 2000 &&
    /[.!?]["”')\]]?$/.test(x.text.trim()) && Array.isArray(x.fact_ids) && x.fact_ids.every((i: unknown) => typeof i === "string");
}
// For the proof (D-024): each drafted answer, the facts it came from and whether the person edited it before it went.
export function draftProvenance(fields: { name: string; value: string; source: string; factId: string | null }[],
  drafts: Record<string, { original: string; factIds: string[] }>) {
  const out: Record<string, { fact_ids: string[]; edited: boolean; said: string }> = {};
  const flat = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();
  for (const f of fields) {
    if (f.source !== "drafted") continue;
    const d = drafts[f.name];
    const ids = draftFactIds(f.factId).length ? draftFactIds(f.factId) : d?.factIds ?? [];
    const edited = !d || flat(f.value) !== flat(d.original);
    out[f.name] = { fact_ids: ids, edited, said: `drafted by Trainee from your facts${ids.length ? ` (${ids.join(", ")})` : ""}, ${edited ? "edited and used by you" : "used by you as drafted"}` };
  }
  return out;
}
