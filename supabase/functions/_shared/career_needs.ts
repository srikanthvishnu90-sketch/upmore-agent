// FEATURE NEEDS (2026-10-26): what Trainee needs from the person next, and why, as one pure function.
//
// Given the person's state (their resume, the contact facts Trainee already has and where each came from, their work
// authorization and sponsorship answers, the Google scopes they granted, the applications in flight with what each form
// asks) and what they are trying to do, nextNeed returns the ONE thing Trainee needs next, why, and how to give it, or
// null when nothing is needed. The order is fixed here, by necessity:
//   1. nothing is asked before it is needed: a need belongs to a goal, and only that goal's needs are considered;
//   2. for any application, the resume comes first (no resume, nothing can be prepared); a resume read but not yet said to
//      be theirs is asked to be confirmed, not pasted again;
//   3. contact facts (name, email, then phone when the form asks it) only when neither the resume nor the person's own
//      words give them: a fact Trainee has is never asked again;
//   4. work authorization and sponsorship only when a form asks them and the person has not said;
//   5. the form's other open questions, the first one named;
//   6. Gmail only for a feature that needs it: reading an employer's emailed code after an approved submit (offered once,
//      never a blocker: the person can type the code on the page themselves), tracking replies, sending outreach or an
//      email the person approved. Connecting Gmail is never a step of applying.
// No I/O, no clock, no model: the handler reads the state (career_connectors.ts readNeedsState) and says the need.
// The scopes, from the one Google module that lists them for audit (connectors/google.ts).
import { GMAIL_READ, GMAIL_SEND } from "./connectors/google.ts";
export const READ_SCOPE = GMAIL_READ;
export const SEND_SCOPE = GMAIL_SEND;

export type Goal = "apply" | "email_code" | "track_replies" | "outreach";
export type NeedId =
  | "resume" | "resume_confirm" | "name" | "email" | "phone" | "work_authorization" | "sponsorship" | "form_question"
  | "gmail_read" | "gmail_send" | "send_unavailable" | "code_by_hand";
export type FormNeed = "name" | "email" | "phone" | "work_authorization" | "sponsorship";
// A fact Trainee has, with where it came from: the person's resume (the upload they confirmed), their own words in chat,
// or the profile's own record.
export interface Known { value: string; from: "resume" | "said" | "profile" }
export interface Pending {
  id: string; company: string | null; title: string | null; state: string; reason?: string | null;
  // What the form asks, when it is known (its open questions on file); absent, only what every form asks (name, email).
  requires?: FormNeed[];
  open_questions?: string[];
}
export interface NeedsState {
  resume: "confirmed" | "drafts" | "none" | "unknown";
  contact: { name: Known | null; email: Known | null; phone: Known | null };
  eligibility: { work_authorization: Known | null; sponsorship: Known | null };
  scopes: string[];
  pending: Pending[];
  // Needs already offered without being asked (career_needs_asked): an offer is made once.
  offered: string[];
  // Whether sending from Gmail may be asked for now (google_scopes.ts: deferred until approved). Absent: it may not.
  sendAvailable?: boolean;
}
export interface Target { company: string | null; title: string | null; requires?: FormNeed[]; open_questions?: string[] }
export interface Need {
  id: NeedId;
  blocking: boolean; // true: the goal cannot go on without it
  target: { company: string | null; title: string | null } | null;
  why: string;
  how: string;
  // Scopes a connect link for this need asks for (only the Gmail needs).
  scopes?: string[];
  // A need offered without being asked is offered once (its key in career_needs_asked).
  offer_once?: string;
}

// What every application form asks (Greenhouse, Lever and Ashby all require a name and an email to apply).
export const EVERY_FORM: FormNeed[] = ["name", "email"];
const LABEL: Record<FormNeed, string> = {
  name: "your full name", email: "your email address", phone: "your phone number",
  work_authorization: "whether you're authorized to work in the country of the job", sponsorship: "whether you'll need visa sponsorship",
};
const of = (t: Target | Pending | null | undefined) => (t ? `${t.title ? `${t.title} at ` : ""}${t.company ?? "the employer"}` : "the application");

function applyNeed(s: NeedsState, t: Target | null): Need | null {
  const target = t ? { company: t.company, title: t.title } : null;
  if (s.resume === "none") {
    return { id: "resume", blocking: true, target, why: `nothing can be prepared for ${of(t)} without your resume`,
      how: "paste it here or attach the file, then tell me it's yours" };
  }
  if (s.resume === "drafts") {
    return { id: "resume_confirm", blocking: true, target, why: "I read your resume, but you haven't told me it's yours yet",
      how: 'check what I read and say "yes, that\'s my resume" (or tell me what to fix)' };
  }
  // Unknown (the record could not be read) decides nothing: it is never asked as if it were missing.
  if (s.resume !== "confirmed") return null;
  const requires = t?.requires?.length ? t.requires : EVERY_FORM;
  for (const f of ["name", "email", "phone"] as const) {
    if (requires.includes(f) && !s.contact[f]) {
      return { id: f, blocking: true, target, why: `${of(t)}'s form asks for ${LABEL[f]}, and it isn't on your resume or in what you've told me`, how: `tell me ${LABEL[f]}` };
    }
  }
  for (const f of ["work_authorization", "sponsorship"] as const) {
    if (requires.includes(f) && !s.eligibility[f]) {
      return { id: f, blocking: true, target, why: `${of(t)}'s form asks ${LABEL[f]}, and you haven't told me`, how: `tell me ${LABEL[f]}` };
    }
  }
  const open = t?.open_questions?.filter(Boolean) ?? [];
  if (open.length) {
    return { id: "form_question", blocking: true, target, why: `${of(t)}'s form asks "${open[0]}"${open.length > 1 ? ` (and ${open.length - 1} more)` : ""}, which only you can answer`,
      how: 'text "what do you need from me" and answer by number' };
  }
  return null;
}

// An employer's emailed code waiting on an application the person approved: Gmail offered once, the page otherwise.
function codeNeed(s: NeedsState): Need | null {
  const waiting = s.pending.find((p) => p.state === "needs_user" && p.reason === "email_code");
  if (!waiting) return null;
  const target = { company: waiting.company, title: waiting.title };
  const key = `gmail_read:email_code`;
  if (!s.scopes.includes(READ_SCOPE) && !s.offered.includes(key)) {
    // Connecting now does not finish this application (it stopped for the person); it lets the code reader (WO-096) read
    // the next one, during an application they approved.
    return { id: "gmail_read", blocking: false, target, scopes: [READ_SCOPE], offer_once: key,
      why: `${of(waiting)} emailed you a code to finish your application`,
      how: "type the code from that email on the application page in your browser; never send it here. If you connect Gmail, I can read a code like that myself on your next applications" };
  }
  if (s.scopes.includes(READ_SCOPE)) return null; // the reader takes it during the approved application
  return { id: "code_by_hand", blocking: false, target, why: `${of(waiting)} emailed you a code to finish your application`,
    how: "type the code from that email on the application page in your browser; never send it here" };
}

export function nextNeed(s: NeedsState, goal: Goal, target: Target | null = null): Need | null {
  if (goal === "apply") return applyNeed(s, target) ?? codeNeed(s);
  if (goal === "email_code") return codeNeed(s);
  if (goal === "track_replies") {
    return s.scopes.includes(READ_SCOPE) ? null : { id: "gmail_read", blocking: true, target: null, scopes: [READ_SCOPE],
      why: "I can only see employers' replies in your Gmail", how: "connect Gmail so I can read employers' replies" };
  }
  if (goal === "outreach") {
    if (s.scopes.includes(SEND_SCOPE)) return null;
    if (!s.sendAvailable) return { id: "send_unavailable", blocking: true, target: null, why: "sending from your Gmail isn't available in Trainee yet", how: "send it from your own email yourself" };
    return { id: "gmail_send", blocking: true, target: null, scopes: [SEND_SCOPE],
      why: "messages go from your own Gmail, and only the ones you approve", how: "connect Gmail for sending" };
  }
  return null;
}

// The need as one sentence for the chat: what, why, how. Never a list.
export function needSentence(n: Need): string {
  switch (n.id) {
    case "resume": return `Next I need one thing: your resume, because ${n.why}. Please ${n.how}.`;
    case "resume_confirm": return `Next I need one thing: ${n.why}. Please ${n.how}.`;
    case "gmail_read": case "gmail_send": return `${cap(n.why)}: ${n.how}.`;
    case "code_by_hand": return `${cap(n.why)}: ${n.how}.`;
    default: return `Next I need one thing: ${n.how.replace(/^tell me /, "")}, because ${n.why}. Please ${n.how}.`;
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
