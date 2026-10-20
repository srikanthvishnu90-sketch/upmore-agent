// WO-032: apply operations. (1) The employer's own email confirms an application, and nothing else does; (2) the PR #16
// gate count (its SQL half is tests/db/career_apply_ops.test.sql); (3) applying by email, only on the person's yes to the
// exact email shown; (4) the open questions pushed once, as the thread's last word. Synthetic mail, a fake Gmail, a model
// stub and in-memory stores only: no network, no database, no real model.
// Run: deno test -A --no-check tests/architect/wo-032-apply-ops.test.ts
import { askText, confirmWhichTurn, memoryConfirmStore, planConfirmations, type QueueRow } from "../../supabase/functions/_shared/career_apply_confirm.ts";
import { receiptText } from "../../supabase/functions/_shared/career_apply_receipts.ts";
import { type QuestionRow, runAsks, runMail, runQuestions } from "../../supabase/functions/_shared/career_proactive_run.ts";
import { memoryMailStore } from "../../supabase/functions/_shared/career_mail_store.ts";
import { memoryAlertStore } from "../../supabase/functions/_shared/career_alert_store.ts";
import { type MailIn } from "../../supabase/functions/_shared/career_mail.ts";
import { mimeOf, sendMail } from "../../supabase/functions/_shared/career_mail_gmail.ts";
import { applyEmailOf } from "../../supabase/functions/_shared/apply_email.ts";
import { EMAIL_INTENT, type EmailCard, type EmailPayload, type EmailPosting, type EmailStore, emailTurn, type Resume } from "../../supabase/functions/_shared/career_apply_email.ts";
import { hashApplyPayload } from "../../supabase/functions/_shared/career_apply_store.ts";
import { type OpenQuestion, QUESTIONS_INTENT, type QuestionStore, questionsTurn } from "../../supabase/functions/_shared/career_apply_questions.ts";

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const DAY = 86400000;
const NOW = Date.parse("2026-10-20T15:00:00Z"); // 11:00 in New York
const iso = (t: number) => new Date(t).toISOString();
const H = (c: string) => c.repeat(64);

// ================================================================================================ 1. confirmation
const row = (o: Partial<QueueRow> & { id: string }): QueueRow => ({
  company: "Stripe", title: "Data Analyst", url: "https://job-boards.greenhouse.io/stripe/jobs/1", state: "submitted_unconfirmed",
  submitted_at: iso(NOW - 2 * DAY), confirmation_hash: null, ...o,
});
const received = (hash: string, at: number, o: Partial<MailIn> = {}): MailIn => ({
  hash, date: iso(at), from: "Stripe <no-reply@us.greenhouse-mail.io>", subject: "Thank you for applying to Stripe",
  snippet: "We have received your application for the Data Analyst role and will review it shortly.", ...o,
});

Deno.test("WO-032/C1 the employer's 'we received your application' confirms the one application it matches", () => {
  const plan = planConfirmations([received(H("a"), NOW)], [row({ id: "J1" }), row({ id: "J2", company: "Plaid", url: "https://jobs.lever.co/plaid/2" })]);
  eq(plan.map((p) => [p.kind, (p as any).id, p.hash, p.mail_kind]), [["confirm", "J1", H("a"), "received"]]);
  assert(plan[0].evidence.length <= 300 && !/\d{6,}/.test(plan[0].evidence), plan[0].evidence);
  // From the employer's own domain too, and for a row whose drive outcome was unknown.
  const own = planConfirmations([received(H("b"), NOW, { from: "Stripe Recruiting <careers@stripe.com>" })], [row({ id: "J3", state: "unknown_outcome" })]);
  eq(own.map((p) => (p as any).id), ["J3"]);
});

Deno.test("WO-032/C2 a 'received' from another domain (a scam using the employer's name) confirms nothing", () => {
  for (const from of ["Stripe Careers <apply@talentpipeline.io>", "Stripe Hiring <stripe.hiring@gmail.com>", "Stripe <jobs-noreply@linkedin.com>", "Stripe <noreply@hackerrank.com>"]) {
    eq(planConfirmations([received(H("c"), NOW, { from })], [row({ id: "J1" })]), [], from);
  }
});

Deno.test("WO-032/C3 the window: sent within the 14 days before the email; before or after that, nothing", () => {
  eq(planConfirmations([received(H("d"), NOW)], [row({ id: "J1", submitted_at: iso(NOW - 15 * DAY) })]), [], "15 days after the submission");
  eq(planConfirmations([received(H("d"), NOW)], [row({ id: "J1", submitted_at: iso(NOW + 3600000) })]), [], "an email before the submission");
  eq(planConfirmations([received(H("d"), NOW)], [row({ id: "J1", submitted_at: iso(NOW - 14 * DAY + 60000) })]).length, 1, "inside 14 days");
  eq(planConfirmations([received(H("d"), NOW)], [row({ id: "J1", state: "not_submitted" })]), [], "a row that never went");
  eq(planConfirmations([received(H("d"), NOW)], [row({ id: "J1", title: "Software Engineer, Payments" })]), [], "the posting title says another role");
});

Deno.test("WO-032/C4 two applications at that company in the window: nothing confirmed, the person asked once which one", async () => {
  const rows = [row({ id: "J1", title: null, submitted_at: iso(NOW - 3 * DAY) }), row({ id: "J2", title: null, url: "https://job-boards.greenhouse.io/stripe/jobs/2", submitted_at: iso(NOW - DAY) })];
  const mail = received(H("e"), NOW, { snippet: "We have received your application and will review it shortly." });
  const plan = planConfirmations([mail], rows);
  eq(plan.map((p) => [p.kind, (p as any).ids]), [["ask", ["J1", "J2"]]]);
  const text = (plan[0] as any).text as string;
  assert(text.includes("Which one was it?") && text.length <= 1500 && !/[*_#`]/.test(text), text);
  assert(text.split("\n").some((l) => l === "https://job-boards.greenhouse.io/stripe/jobs/2"), "a link stands alone on its line");
  // Through the run: asked once, never confirmed; texted once as the thread's last word; "2" confirms J2.
  const confirm = memoryConfirmStore({ queue: { U1: rows } });
  const mailStore = memoryMailStore({ people: [{ user_id: "U1", read_through: null }] });
  const outbox = memoryAlertStore();
  for (let i = 0; i < 2; i++) await runMail({ outbox, now: NOW, store: mailStore, confirm, read: async () => ({ status: "ok", mails: [mail], readThrough: NOW, listed: 1 }) });
  eq(confirm.st.confirmed, [], "nothing confirmed while it is ambiguous");
  eq(Object.keys(confirm.st.asks).length, 1, "asked about once");
  eq(await runAsks({ now: NOW, store: confirm }), 1);
  eq(await runAsks({ now: NOW, store: confirm }), 0, "texted once");
  eq(await confirmWhichTurn({ message: "maybe", userId: "U1", threadId: "U1", store: confirm }), null, "not a number: not an answer");
  const r = await confirmWhichTurn({ message: "2", userId: "U1", threadId: "U1", store: confirm });
  eq(r?.status, "confirmed", JSON.stringify(r));
  eq(confirm.st.confirmed.map((c) => c.id), ["J2"]);
});

Deno.test("WO-032/C5 idempotent: the same email read again confirms nothing twice and texts once; the receipt names the email", async () => {
  const confirm = memoryConfirmStore({ queue: { U1: [row({ id: "J1" })] } });
  const store = memoryMailStore({ people: [{ user_id: "U1", read_through: null }] });
  const outbox = memoryAlertStore();
  const read = async () => ({ status: "ok" as const, mails: [received(H("f"), NOW)], readThrough: NOW, listed: 1 });
  const a = await runMail({ outbox, now: NOW, store, confirm, read });
  const b = await runMail({ outbox, now: NOW + 600000, store, confirm, read });
  eq([a.confirmations, b.confirmations], [1, 0]);
  const texts = outbox.dump().outbox.filter((m: any) => m.key.startsWith("status:confirmed:"));
  eq(texts.length, 1);
  eq(texts[0].text, "Applied to Stripe: confirmed by Stripe's email on Oct 20. https://job-boards.greenhouse.io/stripe/jobs/1");
  eq(receiptText({ company: "Stripe", state: "confirmed", email_confirmed_at: iso(NOW) }), "Applied to Stripe: confirmed by Stripe's email on Oct 20.");
  // A page's "thank you" is said as what it is, never as confirmation.
  const page = receiptText({ company: "Stripe", state: "submitted_unconfirmed", evidence: { page_confirmation: true } });
  assert(!/confirmed by|confirmed it/.test(page) && /confirmation email is the proof/.test(page), page);
});

Deno.test("WO-032/C6 a rejection, an interview or an offer for an unconfirmed submitted row also confirms receipt", () => {
  const no = received(H("1"), NOW, { subject: "Your application to Stripe", snippet: "After careful review, we've decided not to move forward with your application." });
  const plan = planConfirmations([no], [row({ id: "J1" })]);
  eq(plan.map((p) => [p.kind, p.mail_kind]), [["confirm", "rejection"]]);
  eq(planConfirmations([no], [row({ id: "J1", confirmation_hash: H("9") })]), [], "a row another email confirmed stays as it is");
});

// ================================================================================================ 3. apply by email
Deno.test("WO-032/E1 detection in ingestion: the posting's own words ask for an emailed application; nothing else counts", () => {
  const yes = [
    ["To apply, email your resume and cover letter to Jobs@AcmeRetail.example.", "https://acme.example/careers/1"],
    ["Please send your CV to hiring@acme.example. We review every application.", "https://job-boards.greenhouse.io/acme/jobs/1"],
    ["Applications should be sent to talent@acme.example by Friday.", "https://jobs.lever.co/acme/1"],
    ["Interested? Apply at careers@acme.example with a short note.", "https://acme.example/jobs/2"],
  ];
  for (const [description, url] of yes) assert(applyEmailOf({ description, url }), description);
  eq(applyEmailOf({ description: yes[0][0], url: yes[0][1] }), "jobs@acmeretail.example");
  const no = [
    ["If you need an accommodation during the application process, email accommodations@acme.example.", "https://acme.example/1"],
    ["Recruiting agencies: please do not send resumes to hr@acme.example.", "https://acme.example/1"],
    ["Questions about your application? Email recruiting@acme.example.", "https://job-boards.greenhouse.io/acme/jobs/1"],
    ["We will never ask for payment. Report scams to security@acme.example.", "https://acme.example/1"],
    ["Send your resume to no-reply@acme.example.", "https://acme.example/1"],
    // On an ATS posting, only a plain instruction to email the application counts: an address near "application" does not.
    ["Your application data is handled by privacyteam@acme.example under our policy.", "https://jobs.lever.co/acme/1"],
    ["The application team (team@acme.example) built this page.", "https://jobs.ashbyhq.com/acme/1"],
  ];
  for (const [description, url] of no) eq(applyEmailOf({ description, url }), null, description);
});

const FACTS = [
  { id: "F-001", kind: "experience", text: "Data analyst at Example Analytics, 2022 to 2024; built weekly sales dashboards in Tableau used by 40 store managers", needs_confirmation: false, status: "confirmed" },
  { id: "F-002", kind: "project", text: "Built a Python demand forecast for Example Analytics that cut stockouts by 12%", needs_confirmation: false, status: "confirmed" },
  { id: "F-005", kind: "experience", text: "Led a team of 12 engineers at Stripe as engineering manager", needs_confirmation: true, status: "draft" },
];
const CLEAN = "I am a data analyst at Example Analytics, where I built weekly sales dashboards in Tableau used by 40 store managers. I also built a Python demand forecast that cut stockouts by 12%.";
const INVENTED = "At Stripe I led a team of 12 engineers as engineering manager and doubled revenue using Kubernetes.";
function stub(...answers: string[]) {
  const calls: any[] = [];
  return { calls, model: async (p: any) => { calls.push(p); return { type: "message", role: "assistant", content: [{ type: "text", text: answers[Math.min(calls.length - 1, answers.length - 1)] }], stop_reason: "end_turn" }; } };
}
const RESUME_BYTES = new TextEncoder().encode("%PDF-1.4 TEST resume");
const TAILORED_BYTES = new TextEncoder().encode("%PDF-1.4 TEST resume tailored to Acme Retail");
const shaOf = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>))].map((x) => x.toString(16).padStart(2, "0")).join("");
const resumeSha = async () => [...new Uint8Array(await crypto.subtle.digest("SHA-256", RESUME_BYTES))].map((b) => b.toString(16).padStart(2, "0")).join("");
const POSTING: EmailPosting = { job_id: "lever:acme:1", company: "Acme Retail", title: "Data Analyst", url: "https://acme.example/jobs/1", description: "Email your resume to jobs@acme.example.", apply_email: "jobs@acme.example" };

// The database's reserve, in memory: the card's hash, a day, the daily limit, one per posting.
function emailWorld(o: { limit?: number; sentToday?: number; grant?: boolean; resume?: boolean; editBetween?: boolean; tailored?: boolean; swapFile?: boolean } = {}) {
  let card: EmailCard | null = null, intent: string | null = null;
  const rows: { id: string; job_id: string; state: string; source: string }[] = Array.from({ length: o.sentToday ?? 0 }, (_, i) => ({ id: `R${i}`, job_id: `other:${i}`, state: "submitted_unconfirmed", source: "own_computer" }));
  const sends: { to: string; subject: string; body: string; file?: Uint8Array }[] = [], reserves: string[] = [];
  const store: EmailStore = {
    async postings() { return [POSTING]; },
    async card() {
      const c = card ? JSON.parse(JSON.stringify(card)) : null;
      // A change lands after the turn read the card and before the yes reaches the database.
      if (o.editBetween && card) card = { ...card, payload: { ...card.payload, subject: "Edited after the yes" }, payload_hash: await hashApplyPayload({ ...card.payload, subject: "Edited after the yes" }) };
      return c;
    },
    async setCard(_u, c) { card = JSON.parse(JSON.stringify(c)); },
    async lastAssistantIntent() { return intent; },
    async reserve(_u, payload, hash) {
      reserves.push(hash);
      if (!card || card.state !== "shown" || card.payload_hash !== hash || (await hashApplyPayload(payload)) !== hash) throw new Error("changed_since_yes");
      if (rows.some((r) => r.job_id === payload.job_id)) throw new Error("duplicate_job");
      if (rows.length >= (o.limit ?? 25)) throw new Error("daily_cap");
      rows.push({ id: `E${rows.length}`, job_id: payload.job_id, state: "driving", source: "email" });
      card = { ...card, state: "sending" };
      return { id: `E${rows.length - 1}`, lease_token: "L" };
    },
    async finish(_u, id, _l, state) { rows.find((r) => r.id === id)!.state = state; if (card) card = { ...card, state: state === "submitted_unconfirmed" ? "sent" : "failed" }; },
  };
  const model = stub(CLEAN);
  const say = async (message: string) => {
    const r = await emailTurn({ message, userId: "U1", threadId: "T1", now: NOW, deps: {
      store, profile: () => ({ facts: FACTS, basics: { name: "Test Person" } }), draft: { model: model.model, facts: () => FACTS },
      // WO-028's tailored resume when it can be made, else the person's own file; at the yes, the file on the card by its hash.
      resume: async (_u, p) => (o.resume === false ? null : o.tailored
        ? { filename: `resume-${p.job_id.replace(/\W+/g, "-")}.pdf`, bytes: TAILORED_BYTES, sha256: await shaOf(TAILORED_BYTES), tailored: true }
        : { filename: "resume.pdf", bytes: RESUME_BYTES, sha256: await resumeSha(), tailored: false } as Resume),
      attachment: async (_u, sha) => {
        const bytes = o.swapFile ? new TextEncoder().encode("%PDF-1.4 another file") : sha === await shaOf(TAILORED_BYTES) ? TAILORED_BYTES : RESUME_BYTES;
        return { filename: "resume.pdf", bytes, sha256: sha, tailored: bytes === TAILORED_BYTES };
      },
      canSend: async () => o.grant !== false,
      send: async (_u, m) => { sends.push({ to: m.to, subject: m.subject, body: m.body, file: m.attachment?.bytes }); return { status: "sent", idHash: H("7") }; },
    } });
    // The handler's rule: a shown card (or one waiting for Gmail) stays the thread's last word.
    intent = r ? (["shown", "NOT_WIRED"].includes(r.status) ? EMAIL_INTENT : "career_apply_email_answer") : "agent";
    return r;
  };
  return { say, sends, reserves, rows, get card() { return card; }, setIntent(i: string | null) { intent = i; }, model };
}

Deno.test("WO-032/E2 the email is drafted only from confirmed facts through the fact-lock, and shown whole", async () => {
  const w = emailWorld();
  const r = await w.say("apply by email to Acme Retail");
  eq(r?.status, "shown", JSON.stringify(r));
  for (const part of ["To: jobs@acme.example", "Subject: Application: Data Analyst", "Attached: resume.pdf", CLEAN, "Test Person"]) assert(r!.reply.includes(part), `missing: ${part}\n${r!.reply}`);
  assert(!/Stripe|engineering manager/.test(JSON.stringify(w.model.calls)), "a draft fact never reaches the model");
  eq(w.sends.length, 0, "showing it sends nothing");
  // A draft that names what is not confirmed is written again once, and if it still does, no card at all.


  const inv = stub(INVENTED);
  const r2 = await emailTurn({ message: "apply by email to Acme Retail", userId: "U1", threadId: "T1", now: NOW, deps: {
    store: { postings: async () => [POSTING] } as any, profile: () => ({ facts: FACTS, basics: { name: "Test Person" } }), draft: { model: inv.model, facts: () => FACTS },
    resume: async () => ({ filename: "resume.pdf", bytes: RESUME_BYTES, sha256: await resumeSha(), tailored: false }), attachment: async () => null, canSend: async () => true, send: async () => { throw new Error("must not send"); },
  } });
  eq(r2?.status, "draft_unverified", JSON.stringify(r2));
  assert(/Stripe/.test(r2!.reply) && !r2!.reply.includes(INVENTED), r2!.reply);
  eq(inv.calls.length, 2, "written again once, then refused");
});

Deno.test("WO-032/E3 nothing is sent without the yes, and a yes counts only while the email is the thread's last word", async () => {
  const w = emailWorld();
  await w.say("apply by email to Acme Retail");
  eq(await w.say("sounds interesting"), null, "talk is not a yes");
  w.setIntent("agent");
  eq(await w.say("yes"), null, "a yes to something said after the email is not a yes to it");
  eq(w.sends.length + w.reserves.length, 0);
  w.setIntent(EMAIL_INTENT);
  eq((await w.say("no"))?.status, "declined");
  w.setIntent(EMAIL_INTENT);
  eq(await w.say("yes"), null, "a dropped email cannot be sent");
  eq(w.sends.length, 0);
  // The yes sends exactly the payload shown, once, to one address, and tracks it as an emailed application.
  const v = emailWorld();
  const shown = await v.say("apply by email to Acme Retail");
  const sent = await v.say("yes");
  eq(sent?.status, "sent", JSON.stringify(sent));
  eq(v.sends.length, 1);
  eq(v.sends[0].to, "jobs@acme.example");
  assert(shown!.reply.includes(v.sends[0].body), "the body sent is the body shown");
  eq(v.rows.map((r) => [r.source, r.state]), [["email", "submitted_unconfirmed"]]);
  eq(await v.say("yes"), null, "one yes, one send");
  eq(v.sends.length, 1);
});

Deno.test("WO-032/E4 a change after the yes needs a new yes; a change before it shows the email again", async () => {
  const w = emailWorld({ editBetween: true });
  await w.say("apply by email to Acme Retail");
  const r = await w.say("yes");
  eq(r?.status, "changed_since_yes", JSON.stringify(r));
  eq(w.sends.length, 0, "the edit landed after the yes: nothing went");
  // "subject: ..." shows the whole email again with a new hash; the old hash no longer sends anything.
  const v = emailWorld();
  await v.say("apply by email to Acme Retail");
  const before = v.card!.payload_hash;
  const ch = await v.say("subject: Data Analyst application from Test Person");
  assert(ch!.reply.startsWith("Changed.") && ch!.reply.includes("Subject: Data Analyst application from Test Person"), ch!.reply);
  assert(v.card!.payload_hash !== before && v.card!.payload_hash === await hashApplyPayload(v.card!.payload as EmailPayload));
  eq(v.sends.length, 0);
  await v.say("yes");
  eq(v.sends.map((s) => s.subject), ["Data Analyst application from Test Person"]);
});

Deno.test("WO-032/E5 an emailed application counts in the D-011 daily limit", async () => {
  const w = emailWorld({ limit: 3, sentToday: 3 });
  await w.say("apply by email to Acme Retail");
  const r = await w.say("yes");
  eq(r?.status, "daily_cap");
  assert(/daily application limit/.test(r!.reply), r!.reply);
  eq(w.sends.length, 0);
});

Deno.test("WO-032/E6 no Gmail grant that may send, or no resume file: NOT_WIRED with the one thing to do; nothing reserved", async () => {
  const w = emailWorld({ grant: false });
  await w.say("apply by email to Acme Retail");
  const r = await w.say("yes");
  eq(r?.status, "NOT_WIRED");
  assert(r!.reply.startsWith("NOT_WIRED") && /Connect Gmail/.test(r!.reply), r!.reply);
  eq([w.reserves.length, w.sends.length], [0, 0]);
  const n = emailWorld({ resume: false });
  const s = await n.say("apply by email to Acme Retail");
  eq(s?.status, "NOT_WIRED");
  assert(s!.reply.startsWith("NOT_WIRED") && n.card === null, s!.reply);
});

Deno.test("WO-032/E7 one recipient, never Cc or Bcc; Gmail's users.messages.send carries the email and the resume", async () => {
  const mime = mimeOf({ to: "jobs@acme.example", subject: "Application: Data Analyst", body: "Hello", attachment: { filename: "resume.pdf", bytes: RESUME_BYTES } });
  const headers = mime.split("\r\n\r\n")[0];
  assert(/^To: jobs@acme\.example$/m.test(headers) && !/^(Cc|Bcc):/im.test(mime), headers);
  for (const to of ["a@acme.example, b@acme.example", "a@acme.example\r\nBcc: x@evil.example", "not an address"]) {
    let threw = false;
    try { mimeOf({ to, subject: "x", body: "y" }); } catch { threw = true; }
    assert(threw, to);
  }
  const calls: { url: string; method: string; body: string }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => { calls.push({ url: String(url), method: init?.method ?? "GET", body: String(init?.body ?? "") }); return new Response(JSON.stringify({ id: "msg-1" }), { status: 200 }); }) as typeof globalThis.fetch;
  const r = await sendMail({ fetch, token: async () => "TEST-TOKEN" }, "U1", { to: "jobs@acme.example", subject: "Application", body: "Hello", attachment: { filename: "resume.pdf", bytes: RESUME_BYTES } });
  eq(r.status, "sent");
  eq(calls.map((c) => [c.method, c.url]), [["POST", "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"]]);
  const raw = atob(JSON.parse(calls[0].body).raw.replace(/-/g, "+").replace(/_/g, "/"));
  assert(raw.includes("To: jobs@acme.example") && raw.includes('filename="resume.pdf"') && !/Bcc:/i.test(raw), raw.slice(0, 400));
  eq((await sendMail({ fetch, token: async () => null }, "U1", { to: "jobs@acme.example", subject: "x", body: "y" })).status, "NOT_WIRED");
  eq(calls.length, 1, "no token: no request");
});

// ================================================================================================ 4. questions, pushed
const qrow = (o: Partial<QuestionRow> & { id: string }): QuestionRow => ({
  user_id: "U1", key: `label:${o.id.padStart(16, "0")}`, kind: "unknown", label: `Question ${o.id}?`, type: "input_text", options: [], company: null,
  job_ids: ["gh:a"], misfit: false, answer: null, created_at: iso(NOW - 3600000), pushed_at: null, ...o,
});
// The database's push, in memory: once a day, open and never pushed, the thread's last word, the questions shown kept.
function pushWorld(rows: QuestionRow[]) {
  const texts: { ids: string[]; text: string }[] = [];
  let shown: any = null, intent: string | null = null, lastPush = -Infinity;
  const push = async (_u: string, ids: string[], text: string) => {
    if (NOW - lastPush < DAY) return false;
    const qs = rows.filter((r) => ids.includes(r.id));
    if (qs.length !== ids.length || qs.some((q) => q.answer || q.pushed_at)) return false;
    for (const q of qs) assert(text.includes(q.label), "the text carries every question");
    for (const q of qs) q.pushed_at = iso(NOW);
    texts.push({ ids, text }); lastPush = NOW; intent = QUESTIONS_INTENT;
    shown = { thread: "T1", ids, at: iso(NOW) };
    return true;
  };
  const store: QuestionStore = {
    async open(_u, limit) { return rows.filter((r) => !r.answer).slice(0, limit); },
    async countOpen() { return rows.filter((r) => !r.answer).length; },
    async get(_u, ids) { return rows.filter((r) => ids.includes(r.id)); },
    async answer(_u, id, a) { rows.find((r) => r.id === id)!.answer = a; },
    async shown() { return shown ? JSON.parse(JSON.stringify(shown)) : null; },
    async setShown(_u, s) { shown = JSON.parse(JSON.stringify(s)); },
    async lastAssistantIntent() { return intent; },
  };
  return { push, texts, store, rows };
}

Deno.test("WO-032/Q1 open questions are texted once a day at most, at most 5 a text, the rest counted", async () => {
  const w = pushWorld(Array.from({ length: 7 }, (_, i) => qrow({ id: String(i + 1) })));
  eq(await runQuestions({ now: NOW, open: async () => w.rows, push: w.push }), 1);
  eq(w.texts[0].ids, ["1", "2", "3", "4", "5"]);
  assert(w.texts[0].text.includes("2 more after these.") && w.texts[0].text.length <= 1600 && !/[*_#`]/.test(w.texts[0].text), w.texts[0].text);
  eq(await runQuestions({ now: NOW, open: async () => w.rows, push: w.push }), 0, "the same day: nothing more");
  // A preparation still under way (a question in the last 10 minutes) waits until it settles.
  const s = pushWorld([qrow({ id: "1" }), qrow({ id: "2", created_at: iso(NOW - 60000) })]);
  eq(await runQuestions({ now: NOW, open: async () => s.rows, push: s.push }), 0);
});

Deno.test("WO-032/Q2 an answered question is never asked again, nor one already pushed", async () => {
  const w = pushWorld([qrow({ id: "1", answer: "No" }), qrow({ id: "2", pushed_at: iso(NOW - 2 * DAY) }), qrow({ id: "3" })]);
  eq(await runQuestions({ now: NOW, open: async () => w.rows, push: w.push }), 1);
  eq(w.texts[0].ids, ["3"]);
  assert(!w.texts[0].text.includes("Question 1?") && !w.texts[0].text.includes("Question 2?"), w.texts[0].text);
  const none = pushWorld([qrow({ id: "1", answer: "No" })]);
  eq(await runQuestions({ now: NOW, open: async () => none.rows, push: none.push }), 0);
});

Deno.test("WO-032/Q3 the push makes the questions the thread's last word: the numbered answer goes to questionsTurn", async () => {
  const w = pushWorld([qrow({ id: "1", label: "Will you require sponsorship?", options: ["Yes", "No"], type: "select" }), qrow({ id: "2", label: "When can you start?" })]);
  eq(await runQuestions({ now: NOW, open: async () => w.rows, push: w.push }), 1);
  const r = await questionsTurn({ message: "1 no 2 in two weeks", userId: "U1", threadId: "T1", now: NOW + 60000, store: w.store });
  eq(r?.status, "answered", JSON.stringify(r));
  eq(w.rows.map((q) => q.answer), ["No", "in two weeks"]);
});

Deno.test("WO-032/Q4 quiet hours hold: never at 3am New York, the person's own quiet hours either", async () => {
  const at3am = Date.parse("2026-10-20T07:00:00Z");
  const w = pushWorld([qrow({ id: "1", created_at: iso(at3am - 3600000) })]);
  eq(await runQuestions({ now: at3am, open: async () => w.rows, push: w.push }), 0, "3am New York by default");
  const t = pushWorld([qrow({ id: "1", created_at: iso(at3am - 3600000), tz: "Asia/Tokyo", quiet_start: 15, quiet_end: 18 })]);
  eq(await runQuestions({ now: at3am, open: async () => t.rows, push: t.push }), 0, "4pm in Tokyo, inside their own quiet hours");
  const ok = pushWorld([qrow({ id: "1", created_at: iso(at3am - 3600000), tz: "Asia/Tokyo" })]);
  eq(await runQuestions({ now: at3am, open: async () => ok.rows, push: ok.push }), 1, "4pm in Tokyo");
  // The ask about an ambiguous email holds the same hours.
  const c = memoryConfirmStore();
  await c.ask("U1", { kind: "ask", hash: H("2"), ids: ["J1", "J2"], text: askText("Stripe", iso(NOW), [row({ id: "J1" }), row({ id: "J2" })]), company: "Stripe", mail_kind: "received", evidence: "x", mail_at: iso(NOW) });
  eq(await runAsks({ now: at3am, store: c }), 0);
  eq(await runAsks({ now: NOW, store: c }), 1);
});

Deno.test("WO-032/E8 the resume attached is WO-028's, tailored to the posting, when it can be made; the file sent is the file shown", async () => {
  const w = emailWorld({ tailored: true });
  const r = await w.say("apply by email to Acme Retail");
  assert(r!.reply.includes("Attached: resume-lever-acme-1.pdf (tailored for this job)"), r!.reply);
  eq([w.card!.payload.resume_tailored, w.card!.payload.attachment.tailored, w.card!.payload.resume_sha256], [true, true, await shaOf(TAILORED_BYTES)]);
  await w.say("yes");
  eq(w.sends.length, 1);
  eq(await shaOf(w.sends[0].file!), await shaOf(TAILORED_BYTES), "the tailored file went");
  // A file that is not byte for byte the one on the card never goes.
  const x = emailWorld({ swapFile: true });
  await x.say("apply by email to Acme Retail");
  eq((await x.say("yes"))?.status, "resume_changed");
  eq([x.sends.length, x.reserves.length], [0, 0]);
});
