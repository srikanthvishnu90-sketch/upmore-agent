// WO-032: applying by email, for a posting whose application is "email your resume to X" (career_postings.apply_email,
// found in ingestion by apply_email.ts). One turn, before any brain, like the card and the questions:
//   "apply by email to Acme" (or "apply to Acme by email", optionally "for <title>") prepares the email card: the address
//   the posting gives, a subject from the posting's title, a body drafted ONLY from the person's confirmed facts through
//   WO-030's drafting and fact-lock (essay_draft.ts: the employer's AI policy first, every name and number traced to a
//   confirmed fact or the posting, the length met by rewriting, never by cutting), and the resume attached: the one
//   WO-028 tailors to this posting from confirmed facts (career_tailor.ts), else the person's own file.
//   The whole email is shown; nothing is sent.
//   "yes", while that card is the thread's last word, sends exactly that payload, once, from the person's own Gmail
//   (users.messages.send through the career grant): one recipient, no Cc, no Bcc. The database takes the yes only for the
//   payload hash on the card, within a day, under the daily limit, one per posting and one per company per 30 days
//   (career_apply_email_reserve_as), and the send is recorded on a tracked application (source 'email').
//   "subject: ..." or "body: ..." changes the email and shows it again; the change needs its own yes. "no" drops it.
// No career grant that may send: NOT_WIRED, with the one thing to do, and nothing is reserved. No resume file on Trainee's
// side: NOT_WIRED the same way. The model writes sentences only; code decides everything that matters.
import { type DraftDeps, draftEssay, MIN_FACTS, whatWouldHelp } from "./essay_draft.ts";
import { hashApplyPayload } from "./career_apply_store.ts";
import { roleOverlap, sameCompany } from "./career_mail.ts";
import { ONE_ADDRESS, type OutMail, type SendResult } from "./career_mail_gmail.ts";
import { RESUME_BUCKET, resumePath, type TailorDeps, tailorForPosting } from "./career_tailor.ts";

export const EMAIL_INTENT = "career_apply_email";
export const EMAIL_CARD_KEY = "career:email-card";
export const RESUME_FILE_KEY = "career:resume-file";
export const BODY_WORDS = 150;
const DAY = 86400000;

export interface EmailPosting { job_id: string; company: string; title: string; url: string; description?: string | null; apply_email: string | null }
export interface Resume { filename: string; bytes: Uint8Array; sha256: string; tailored: boolean; mime?: string }
export interface EmailPayload {
  kind: "email"; version: 1; user_id: string; job_id: string; company: string; title: string; url: string;
  to: string; subject: string; body: string;
  attachment: { filename: string; sha256: string; size: number; tailored: boolean };
  resume_sha256: string; resume_tailored: boolean; // WO-028's tag on the tracked application reads these
}
export interface EmailCard { payload: EmailPayload; payload_hash: string; state: "shown" | "sending" | "sent" | "failed" | "declined"; shown_at: string; thread: string; application?: string }
export interface Profile { facts?: unknown[]; basics?: { name?: string | null } | null }
export interface EmailStore {
  postings(company: string): Promise<EmailPosting[]>; // open postings that take an emailed application, at that company
  card(userId: string): Promise<EmailCard | null>;
  setCard(userId: string, c: EmailCard): Promise<void>;
  lastAssistantIntent(threadId: string): Promise<string | null>;
  // career_apply_email_reserve_as: throws changed_since_yes, duplicate_job, company_cooldown or daily_cap.
  reserve(userId: string, payload: EmailPayload, hash: string): Promise<{ id: string; lease_token: string }>;
  finish(userId: string, id: string, lease: string, state: "submitted_unconfirmed" | "not_submitted" | "unknown_outcome", evidence: Record<string, unknown>): Promise<void>;
}
export interface EmailDeps {
  store: EmailStore;
  profile: () => Profile;
  draft?: DraftDeps;
  resume: (userId: string, posting: EmailPosting) => Promise<Resume | null>; // tailored to the posting, else their file
  attachment: (userId: string, sha256: string) => Promise<Resume | null>; // the exact file on the card, by its hash
  canSend: (userId: string) => Promise<boolean>; // a career grant with gmail.send
  send: (userId: string, m: OutMail) => Promise<SendResult>;
}

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
// What the canonical hash and the database agree on: no control characters but the line break.
const clean = (s: unknown, n: number) => String(s ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, n);

// ------------------------------------------------------------------------------------------------ what the person says
export type EmailReply =
  | { kind: "apply"; company: string; title: string | null }
  | { kind: "yes" } | { kind: "no" }
  | { kind: "subject"; value: string } | { kind: "body"; value: string };
const APPLY = [
  /^(?:please |can you |could you )?(?:apply|send (?:my|an|the) application|email (?:my|an|the) application)(?: to| at)? (.{2,80}?) (?:by|via|over|through) e-?mail(?: for (?:the )?(.{2,80}?)(?: role| position| job)?)?$/,
  /^(?:please |can you |could you )?(?:apply by e-?mail|e-?mail (?:my )?(?:application|resume|cv)) (?:to|at) (.{2,80}?)(?: for (?:the )?(.{2,80}?)(?: role| position| job)?)?$/,
];
export function parseEmailReply(text: string): EmailReply | null {
  const raw = String(text ?? "").trim();
  const edit = /^(subject|body)\s*:\s*([\s\S]+)$/i.exec(raw);
  if (edit) return { kind: edit[1].toLowerCase() as "subject" | "body", value: edit[2].trim() };
  const t = raw.toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
  for (const re of APPLY) {
    const m = re.exec(t);
    if (m) return { kind: "apply", company: m[1].trim(), title: m[2]?.trim() || null };
  }
  if (/^(yes|yep|yeah|y|send it|yes send it|yes please|send)$/.test(t)) return { kind: "yes" };
  if (/^(no|nope|n|don'?t send( it)?|drop it|cancel it)$/.test(t)) return { kind: "no" };
  return null;
}

// ------------------------------------------------------------------------------------------------ preparing
export function bodyQuestion(p: EmailPosting): string {
  return `Write the body of a short email applying for the ${clip(p.title, 120)} role at ${clip(p.company, 120)}: who you are and why you fit, in ${BODY_WORDS} words or less.`;
}
const sha = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>))].map((b) => b.toString(16).padStart(2, "0")).join("");

export type Prepared = { ok: true; payload: EmailPayload; hash: string } | { ok: false; status: string; reply: string };
export async function prepareEmail(o: { userId: string; posting: EmailPosting; profile: Profile; resume: Resume | null; draft?: DraftDeps }): Promise<Prepared> {
  const p = o.posting, co = clip(p.company, 120);
  const to = String(p.apply_email ?? "").trim().toLowerCase();
  if (!ONE_ADDRESS.test(to)) return { ok: false, status: "no_address", reply: `${co}'s posting doesn't give one address to email, so I can't apply by email there.` };
  const name = clip(o.profile.basics?.name, 120);
  if (!name) return { ok: false, status: "no_name", reply: `I need your name to sign the email. Tell me your full name, then say "apply by email to ${co}" again.` };
  if (!o.resume) {
    return { ok: false, status: "NOT_WIRED", reply: `NOT_WIRED: Trainee doesn't have your resume file to attach yet. Add your resume file to Trainee, then say "apply by email to ${co}" again.` };
  }
  if ((await sha(o.resume.bytes)) !== o.resume.sha256) return { ok: false, status: "resume_changed", reply: "Your resume file doesn't match its record, so I won't attach it. Add it again, then ask me again." };
  if (!o.draft) return { ok: false, status: "draft_off", reply: `I can't draft the email here. Write it yourself and send it to ${to}.` };
  // The posting's own words carry its AI policy (a "no AI-written applications" posting is never drafted for).
  const q = { id: `email:${p.job_id}`, label: bodyQuestion(p), type: "textarea", kind: "essay", company: p.company, job_ids: [p.job_id], ai_policy: null };
  const siblings = String(p.description ?? "").split(/(?<=[.!?])\s+/).filter((s) => /\b(ai|artificial intelligence|chatgpt|generative|llm)\b/i.test(s)).slice(0, 10);
  const d = await draftEssay({ q, siblingLabels: siblings, deps: o.draft })
    .catch((e) => ({ ok: false as const, why: "model" as const, policy: null, detail: [String(e?.message ?? e)], tries: 0 }));
  if (!d.ok) {
    const own = `You can also write it yourself and send it to ${to}.`;
    const reply = d.why === "policy"
      ? `${co}'s posting asks for applications in your own words${d.policy?.said ? ` ("${clip(d.policy.said, 90)}")` : ""}, so I won't draft this email. ${own}`
      : d.why === "thin"
      ? `I can't draft the email yet: only ${d.detail[0]} of your confirmed facts fit it, and I need at least ${MIN_FACTS} so nothing is made up. Tell me ${whatWouldHelp(q.label, p.company)}, confirm it, then say "apply by email to ${co}" again. ${own}`
      : d.why === "unverified"
      ? `I didn't show a draft: it kept including things you haven't confirmed (${d.detail.join("; ")}). If any of that is true, tell me and confirm it, then ask again. ${own}`
      : d.why === "too_long"
      ? `I couldn't write it inside ${BODY_WORDS} words without cutting a sentence, so there's no draft. ${own}`
      : `I couldn't draft the email right now, so nothing changed. Try again in a few minutes. ${own}`;
    return { ok: false, status: `draft_${d.why}`, reply };
  }
  const payload: EmailPayload = {
    kind: "email", version: 1, user_id: o.userId, job_id: p.job_id, company: clean(p.company, 200), title: clean(p.title, 200), url: p.url,
    to, subject: clean(`Application: ${clip(p.title, 150)}`, 200),
    body: clean(`Hello ${co} hiring team,\n\n${d.text}\n\nMy resume is attached.\n\n${name}`, 5000),
    attachment: { filename: clip(o.resume.filename, 120) || "resume.pdf", sha256: o.resume.sha256, size: o.resume.bytes.length, tailored: !!o.resume.tailored },
    resume_sha256: o.resume.sha256, resume_tailored: !!o.resume.tailored,
  };
  return { ok: true, payload, hash: await hashApplyPayload(payload) };
}

// The whole email, as it will go. Plain text; nothing on the card that the email does not carry.
export function emailCardText(p: EmailPayload, changed = false): string {
  return [
    changed
      ? `Changed. Here is the whole email again; nothing is sent until you say yes to this version.`
      : `${clip(p.company, 80)}'s posting asks for applications by email. Here is the whole email; nothing is sent until you say yes.`,
    `To: ${p.to}`,
    `Subject: ${p.subject}`,
    `Attached: ${p.attachment.filename}${p.attachment.tailored ? " (tailored for this job)" : ""}`,
    "",
    p.body,
    "",
    `Reply "yes" to send it from your Gmail, "no" to drop it, or "subject: ..." or "body: ..." to change it.`,
  ].join("\n");
}

// ------------------------------------------------------------------------------------------------ the turn
const REFUSED: Record<string, string> = {
  daily_cap: "today's daily application limit is already used",
  company_cooldown: "you applied to them in the last 30 days",
  duplicate_job: "you already applied to this posting",
  changed_since_yes: "the email changed after you saw it, so your yes was not for this version",
};
export async function emailTurn(o: { message: string; userId: string; threadId: string; now: number; deps: EmailDeps }): Promise<{ reply: string; status: string } | null> {
  const r = parseEmailReply(o.message);
  if (!r) return null;
  const s = o.deps.store;
  if (r.kind === "apply") {
    const found = (await s.postings(r.company)).filter((p) => p.apply_email && sameCompany(p.company, r.company))
      .filter((p) => !r.title || roleOverlap(p.title, r.title) >= 0.5);
    if (!found.length) return { reply: `I don't see an open posting at ${clip(r.company, 80)} that asks for applications by email.`, status: "none" };
    if (found.length > 1) {
      const titles = found.slice(0, 5).map((p, i) => `${i + 1}. ${clip(p.title, 80)}`);
      return { reply: [`${clip(found[0].company, 80)} has ${found.length} postings that take applications by email:`, ...titles, `Say "apply by email to ${clip(found[0].company, 80)} for" and the title.`].join("\n"), status: "which" };
    }
    const resume = await o.deps.resume(o.userId, found[0]);
    const prep = await prepareEmail({ userId: o.userId, posting: found[0], profile: o.deps.profile(), resume, draft: o.deps.draft });
    if (!prep.ok) return { reply: prep.reply, status: prep.status };
    await s.setCard(o.userId, { payload: prep.payload, payload_hash: prep.hash, state: "shown", shown_at: new Date(o.now).toISOString(), thread: o.threadId });
    return { reply: emailCardText(prep.payload), status: "shown" };
  }
  // A yes, a no or a change counts only while the email card is this thread's last word, and only for a day.
  let card: EmailCard | null;
  try {
    if ((await s.lastAssistantIntent(o.threadId)) !== EMAIL_INTENT) return null;
    card = await s.card(o.userId);
  } catch (e) {
    console.error("email card: not read", e instanceof Error ? e.message : String(e));
    return null;
  }
  if (!card || card.state !== "shown" || card.thread !== o.threadId) return null;
  if (Date.parse(card.shown_at) < o.now - DAY) return { reply: `That email is more than a day old, so nothing was sent. Say "apply by email to ${clip(card.payload.company, 80)}" for a fresh one.`, status: "expired" };
  if (r.kind === "no") {
    await s.setCard(o.userId, { ...card, state: "declined" });
    return { reply: "Dropped. Nothing was sent.", status: "declined" };
  }
  if (r.kind === "subject" || r.kind === "body") {
    const value = r.kind === "subject" ? clean(r.value, 200).replace(/\n+/g, " ") : clean(r.value, 5000);
    if (!value) return { reply: `That ${r.kind} is empty, so nothing changed.`, status: "shown" };
    const payload = { ...card.payload, [r.kind]: value } as EmailPayload;
    const hash = await hashApplyPayload(payload);
    await s.setCard(o.userId, { ...card, payload, payload_hash: hash, shown_at: new Date(o.now).toISOString() });
    return { reply: emailCardText(payload, true), status: "shown" };
  }
  // The yes: exactly the payload on the card, checked by its hash here and again by the database.
  const hash = await hashApplyPayload(card.payload);
  if (hash !== card.payload_hash) return { reply: `Not sent: ${REFUSED.changed_since_yes}.`, status: "changed" };
  if (!(await o.deps.canSend(o.userId))) {
    return { reply: "NOT_WIRED: not sent. Trainee can't send from your Gmail yet. Connect Gmail in the Trainee app (it asks to send on your behalf), then say yes again.", status: "NOT_WIRED" };
  }
  const resume = await o.deps.attachment(o.userId, card.payload.attachment.sha256);
  if (!resume || resume.sha256 !== card.payload.attachment.sha256 || (await sha(resume.bytes)) !== resume.sha256) {
    return { reply: `Not sent: your resume file is not the one on this email. Say "apply by email to ${clip(card.payload.company, 80)}" for a fresh one.`, status: "resume_changed" };
  }
  let job: { id: string; lease_token: string };
  try {
    job = await s.reserve(o.userId, card.payload, hash);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const why = Object.keys(REFUSED).find((k) => msg.includes(k));
    if (!why) throw e;
    return { reply: `Not sent: ${REFUSED[why]}. Nothing went to ${clip(card.payload.company, 80)}.`, status: why };
  }
  const p = card.payload;
  const res = await o.deps.send(o.userId, { to: p.to, subject: p.subject, body: p.body, attachment: { filename: p.attachment.filename, bytes: resume.bytes, mime: resume.mime } })
    .catch((e) => ({ status: "UNKNOWN" as const, detail: e instanceof Error ? e.message : String(e) }));
  const at = new Date(o.now).toISOString();
  if (res.status === "sent") {
    await s.finish(o.userId, job.id, job.lease_token, "submitted_unconfirmed", { reason: "emailed from the person's Gmail", sent_at: at, message_hash: res.idHash, to: p.to, subject: p.subject });
    return { reply: `Sent to ${p.to} from your Gmail. I'm tracking it, and I'll mark it confirmed when ${clip(p.company, 80)} writes back.`, status: "sent" };
  }
  if (res.status === "NOT_WIRED" || res.status === "REFUSED") {
    await s.finish(o.userId, job.id, job.lease_token, "not_submitted", { reason: res.status === "NOT_WIRED" ? "NOT_WIRED" : res.detail, at });
    return { reply: res.status === "NOT_WIRED"
      ? "NOT_WIRED: not sent. Trainee can't send from your Gmail yet. Connect Gmail in the Trainee app, then say yes again."
      : `Not sent: Gmail refused it (${res.detail}). Nothing went to ${clip(p.company, 80)}.`, status: "not_sent" };
  }
  await s.finish(o.userId, job.id, job.lease_token, "unknown_outcome", { reason: res.detail, at });
  return { reply: `I can't tell whether the email to ${p.to} went, so I won't send it again. If it's in your Gmail's Sent folder, it went.`, status: "unknown" };
}

// ------------------------------------------------------------------------------------------------ Supabase
// deno-lint-ignore no-explicit-any
export function supabaseEmailStore(admin: any): EmailStore {
  const must = (r: any, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
  return {
    async postings(company) {
      const word = clip(company, 80).replace(/[%_,()]/g, " ").split(" ").filter((w) => w.length > 1)[0] ?? "";
      if (!word) return [];
      return must(await admin.from("career_postings").select("job_id,company,title,url,description,apply_email").not("apply_email", "is", null)
        .is("closed_at", null).ilike("company", `%${word}%`).order("first_seen_at", { ascending: false }).limit(20), "read email postings") ?? [];
    },
    async card(u) {
      const r = must(await admin.from("career_watch_kv").select("value").eq("user_id", u).eq("key", EMAIL_CARD_KEY).maybeSingle(), "read the email card");
      const v = r?.value;
      return v && v.payload && typeof v.payload_hash === "string" ? v as EmailCard : null;
    },
    async setCard(u, c) {
      must(await admin.from("career_watch_kv").upsert({ user_id: u, key: EMAIL_CARD_KEY, value: c }, { onConflict: "user_id,key" }), "keep the email card");
    },
    async lastAssistantIntent(threadId) {
      const rows = must(await admin.from("agent_messages").select("meta").eq("thread_id", threadId).eq("role", "assistant").order("id", { ascending: false }).limit(1), "read the last reply");
      return rows?.[0]?.meta?.intent ?? null;
    },
    async reserve(u, payload, hash) {
      const j = must(await admin.rpc("career_apply_email_reserve_as", { p_user: u, p_payload: payload, p_hash: hash }), "reserve the email application");
      return { id: j.id, lease_token: j.lease_token };
    },
    async finish(u, id, lease, state, evidence) {
      must(await admin.rpc("career_apply_email_finish_as", { p_user: u, p_id: id, p_lease: lease, p_state: state, p_evidence: evidence }), "record the email application");
    },
  };
}
// The resume to attach (WO-028 merged): first the one tailored to this posting from the person's confirmed facts, which
// tailorForPosting renders, checks (truth audit, ATS parse) and stores privately at career-resumes/<user>/<sha256>.pdf;
// if it refuses (too few confirmed facts, no contact line), the person's own file, named by the account's
// career:resume-file record ({path, filename, sha256}) in the same private bucket. Neither: null (NOT_WIRED on the card).
// At the yes, the file on the card is read back by its hash, so what goes is byte for byte what was shown.
// deno-lint-ignore no-explicit-any
export function supabaseResumes(admin: any, o: { profile: () => any; tailor?: TailorDeps | null }) {
  const download = async (path: string): Promise<Uint8Array | null> => {
    const f = await admin.storage.from(RESUME_BUCKET).download(path);
    if (f?.error || !f?.data) return null;
    return new Uint8Array(await f.data.arrayBuffer());
  };
  const ownFile = async (u: string): Promise<Resume | null> => {
    const r = await admin.from("career_watch_kv").select("value").eq("user_id", u).eq("key", RESUME_FILE_KEY).maybeSingle();
    const v = r?.data?.value;
    if (r?.error || !v || typeof v.path !== "string" || !v.path.startsWith(`${u}/`) || !/^[a-f0-9]{64}$/.test(String(v.sha256 ?? ""))) return null;
    const bytes = await download(v.path);
    if (!bytes || (await sha(bytes)) !== v.sha256) return null;
    return { filename: String(v.filename ?? "resume.pdf"), bytes, sha256: String(v.sha256), tailored: false, mime: typeof v.mime === "string" ? v.mime : "application/pdf" };
  };
  return {
    async resume(u: string, p: EmailPosting): Promise<Resume | null> {
      if (o.tailor) {
        const t = await tailorForPosting({ userId: u, profile: o.profile(), posting: { text: `${p.title} at ${p.company}\n\n${p.description ?? ""}`, job_id: p.job_id, company: p.company }, deps: o.tailor, now: Date.now() })
          .catch((e) => { console.error("email apply: tailoring failed", e instanceof Error ? e.message : String(e)); return null; });
        if (t && t.ok) {
          const bytes = await download(resumePath(u, t.sha256));
          if (bytes && (await sha(bytes)) === t.sha256) return { filename: t.filename, bytes, sha256: t.sha256, tailored: true, mime: "application/pdf" };
        }
      }
      return await ownFile(u);
    },
    async attachment(u: string, sha256: string): Promise<Resume | null> {
      if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
      const tailored = await download(resumePath(u, sha256));
      if (tailored && (await sha(tailored)) === sha256) return { filename: "resume.pdf", bytes: tailored, sha256, tailored: true, mime: "application/pdf" };
      const own = await ownFile(u);
      return own && own.sha256 === sha256 ? own : null;
    },
  };
}
