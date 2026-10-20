// WO-084 (D-029, under D-021): the code an application site emails the person, read from their own Gmail (the career
// grant, gmail.readonly) and handed only to their own extension, which types it into the form in their own browser.
// Only the site family's own sender or the employer's own domain, only mail that arrived after the prompt and is at most
// 15 minutes old, only when the mail plainly gives exactly one code. The code is never stored, logged or shown in chat:
// nothing here writes anywhere, and the endpoint's answer is never cached. Tests: tests/architect/wo-084-emailed-codes.test.ts.
import { freshForCode, gmailCodeQuery } from "./gmail_code_window.ts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
// Each site family's own sending domains (a subdomain counts: us.greenhouse-mail.io).
export const CODE_SENDERS: Record<string, string[]> = {
  greenhouse: ["greenhouse-mail.io", "greenhouse.io"],
  lever: ["lever.co"],
  ashby: ["ashbyhq.com"],
  workday: ["myworkday.com", "workday.com", "myworkdayjobs.com"],
  icims: ["icims.com"],
  smartrecruiters: ["smartrecruiters.com"],
  gusto: ["gusto.com"],
};
const SITE_NAMES: Record<string, string> = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", workday: "Workday", icims: "iCIMS", smartrecruiters: "SmartRecruiters", gusto: "Gusto" };
// A mailbox anyone can have is never "the employer's own domain".
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "aol.com", "proton.me", "protonmail.com"]);
const SKEW_MS = 30_000;
export const NO_GMAIL = "Connect Gmail in Trainee (one tap) and I'll fill these codes for you. For now, type the code from your inbox.";
export const NOT_YET = "No code arrived yet. Check your inbox and type it here.";

export interface CodeMail { id: string; from: string; subject: string; text: string; internalDate: number }

const under = (domain: string, root: string) => domain === root || domain.endsWith("." + root);
const employerOk = (d: unknown): string | null => {
  const s = String(d ?? "").trim().toLowerCase();
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(s) && !FREE_MAIL.has(s) ? s : null;
};
const senderDomain = (from: string): string | null => {
  const addr = (String(from ?? "").match(/<([^<>]+)>\s*$/)?.[1] ?? String(from ?? "")).trim().toLowerCase();
  const m = addr.match(/^[^@\s]+@([a-z0-9.-]+)$/);
  return m ? m[1] : null;
};

export function senderAllowed(from: string, family: string, employerDomain: string | null): boolean {
  const d = senderDomain(from);
  if (!d) return false;
  const employer = employerOk(employerDomain);
  return (CODE_SENDERS[family] ?? []).some((r) => under(d, r)) || (!!employer && under(d, employer));
}

// A code is a 4-10 character token with a digit (or, right after "code is" / "code:", one with a capital letter), never
// part of a date, an address or a link. It is looked for just after each mention of a code; when only the subject
// mentions one, in the whole text. Exactly one distinct token, or none: a guessed code is never typed.
const WORDING = /\b(?:code|passcode|otp)\b/i;
const TOKEN = /(?<![\w\-\/@.=#&?%+])([A-Za-z0-9]{4,10})(?![\w\-\/@=#&?%+]|\.\w)/g;
function candidates(span: string): string[] {
  const out = [...span.matchAll(TOKEN)].map((m) => m[1]).filter((t) => /\d/.test(t));
  const named = span.match(/^(?:code|passcode|otp)(?:\s+is|\s*:)\s*([A-Za-z]{4,10})\b/i)?.[1];
  if (named && /[A-Z]/.test(named)) out.push(named);
  return out;
}
export function extractCode(subject: string, text: string): string | null {
  const body = String(text ?? "");
  if (!WORDING.test(String(subject ?? "")) && !WORDING.test(body)) return null;
  const spans = WORDING.test(body) ? [...body.matchAll(/\b(?:code|passcode|otp)\b/gi)].map((m) => body.slice(m.index!, m.index! + 120)) : [body];
  const found = new Set(spans.flatMap(candidates));
  return found.size === 1 ? [...found][0] : null;
}

// The newest mail from an allowed sender that mentions a code, sent after the prompt (30 seconds of clock skew) and at most
// 15 minutes old. Its code, or none (an unclear newest mail never falls back to an older code).
export function pickCode(mails: CodeMail[], o: { now: number; since: number; family: string; employerDomain: string | null }): { code: string; from: string } | null {
  const ok = mails.filter((m) => senderAllowed(m.from, o.family, o.employerDomain) && freshForCode(m, o.now) && m.internalDate >= o.since - SKEW_MS &&
    WORDING.test(`${m.subject} ${m.text}`)).sort((a, b) => b.internalDate - a.internalDate);
  if (!ok.length) return null;
  const code = extractCode(ok[0].subject, ok[0].text);
  const d = senderDomain(ok[0].from)!;
  return code ? { code, from: (CODE_SENDERS[o.family] ?? []).some((r) => under(d, r)) ? SITE_NAMES[o.family] : employerOk(o.employerDomain)! } : null;
}

// ------------------------------------------------------------------------------------------------ reading the mail
const b64urlText = (s: string) => {
  const b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
};
function bodyText(payload: any): string {
  const parts: any[] = [];
  const walk = (p: any) => (p && (parts.push(p), (p.parts ?? []).forEach(walk)));
  walk(payload);
  const plain = parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
  if (plain) return b64urlText(plain.body.data);
  const html = parts.find((p) => p.mimeType === "text/html" && p.body?.data);
  return html ? b64urlText(html.body.data).replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ") : "";
}
const header = (msg: any, name: string) => String((msg?.payload?.headers ?? []).find((h: any) => String(h?.name).toLowerCase() === name.toLowerCase())?.value ?? "");

export interface CodeDeps { token: (userId: string) => Promise<string | null>; fetch: typeof fetch; now: () => number }
type CodeResult = { ok: true; code: string; from: string } | { ok: false; why: "no_gmail" | "not_yet" | "invalid"; message: string };
export async function readEmailedCode(userId: string, req: { family: string; employer_domain: string | null; since: number }, d: CodeDeps): Promise<CodeResult> {
  const senders = CODE_SENDERS[req.family];
  if (!senders || !Number.isFinite(Number(req.since))) return { ok: false, why: "invalid", message: "That is not an application site Trainee reads codes for." };
  const employer = employerOk(req.employer_domain);
  const notYet = { ok: false as const, why: "not_yet" as const, message: NOT_YET };
  try {
    const token = await d.token(userId);
    if (!token) return { ok: false, why: "no_gmail", message: NO_GMAIL };
    const auth = { headers: { authorization: `Bearer ${token}` } };
    const q = gmailCodeQuery(`(${[...senders, ...(employer ? [employer] : [])].join(" OR ")})`);
    const list = await d.fetch(`${API}?q=${encodeURIComponent(q)}&maxResults=5`, auth);
    if (list.status === 401) return { ok: false, why: "no_gmail", message: NO_GMAIL };
    if (!list.ok) return notYet;
    const ids = ((await list.json().catch(() => ({})))?.messages ?? []).map((m: any) => String(m?.id ?? "")).filter(Boolean).slice(0, 5);
    const mails: CodeMail[] = [];
    for (const id of ids) {
      const r = await d.fetch(`${API}/${encodeURIComponent(id)}?format=full`, auth);
      if (!r.ok) continue;
      const msg = await r.json().catch(() => null);
      if (msg) mails.push({ id, from: header(msg, "From"), subject: header(msg, "Subject"), text: bodyText(msg.payload), internalDate: Number(msg.internalDate) });
    }
    const got = pickCode(mails, { now: d.now(), since: Number(req.since), family: req.family, employerDomain: employer });
    return got ? { ok: true, ...got } : notYet;
  } catch {
    return notYet; // nothing about the mail is logged: the extension asks again
  }
}

// ------------------------------------------------------------------------------------------------ the endpoint
// The person's own session only (the career-essay-draft pattern): a service key is refused. Never cached.
const jwtRole = (token: string): string | null => {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part + "=".repeat((4 - part.length % 4) % 4))).role ?? null;
  } catch {
    return null;
  }
};
export async function handleApplyCode(req: Request, d: { cors: Record<string, string>; user: (token: string) => Promise<{ id: string } | null>; code: CodeDeps }): Promise<Response> {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...d.cors, "content-type": "application/json", "cache-control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: d.cors });
  if (req.method !== "POST") return json(405, { ok: false, why: "invalid", message: "POST only." });
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!m) return json(401, { ok: false, why: "invalid", message: "Sign in to Upmore first." });
  if (jwtRole(m[1]) !== "authenticated") return json(403, { ok: false, why: "invalid", message: "Only a person's own sign-in can ask for a code." });
  const user = await d.user(m[1]).catch(() => null);
  if (!user?.id) return json(401, { ok: false, why: "invalid", message: "Sign in to Upmore first." });
  const body = await req.json().catch(() => null);
  const domain = body?.employer_domain ?? null;
  if (!body || !CODE_SENDERS[String(body.family)] || !Number.isFinite(Number(body.since)) || (domain !== null && typeof domain !== "string")) {
    return json(400, { ok: false, why: "invalid", message: "That is not an application site Trainee reads codes for." });
  }
  const r = await readEmailedCode(user.id, { family: String(body.family), employer_domain: domain, since: Number(body.since) }, d.code);
  return json(r.ok || r.why !== "invalid" ? 200 : 400, r);
}
