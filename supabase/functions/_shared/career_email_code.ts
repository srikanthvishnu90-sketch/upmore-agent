// WO-096: the code an employer's application form emails the person ("we sent a security code to your email"), read from
// the person's own Gmail with their Google consent (the career grant's gmail.readonly), so an application the person
// approved on its card can finish without them copying a code by hand. The person can do this; with their consent the
// agent does it the same way.
//
// What is read, and only that: mail from the application system's own sending domains (ATS_CODE_SENDERS), that Gmail
// itself authenticated as coming from that domain (career_mail.ts authenticated: DKIM or DMARC pass in Gmail's own
// Authentication-Results), received after the form asked (sinceMs, less a small tolerance) and within D-021's 15 minutes
// (gmail_code_window.ts), newest first. The code is taken only by that system's own strict pattern (CODE_PATTERNS). Two
// different codes are never guessed between (ambiguous: the person types the right one).
//
// Where the code goes: back to the caller, in memory, inside an EmailCode whose every printable form is "[emailed code]"
// (toString, toJSON, Deno and Node inspect), so a log line, an evidence file, a tracker row, a chat reply or an error
// message built from a result never carries it. Only reveal() gives the characters, and only the page fill calls it.
// Nothing here stores, logs or sends the code anywhere. Mail tracking (career_mail.ts) keeps classing verification mail
// as noise and never stores codes; this is a separate, narrower read.
//
// When it may run: only inside an application the person approved on its card, while it is being driven. The edge
// function (career-email-code) checks that against the person's own queue row (state driving, its lease, claimed within
// the window); the worker and the extension call it only after the approval (scripts/apply.ts, extension/content.js).
import { authenticated } from "./career_mail.ts";
import { CAREER_READ_SCOPE, careerToken, type TokenDeps } from "./career_mail_gmail.ts";
import { CODE_WINDOW_MS } from "./gmail_code_window.ts";
import { CODE_MAX_WAIT_MS, pollForCode } from "./career_email_code_poll.ts";

export type Ats = "greenhouse" | "lever" | "ashby" | "workday";
export const ATS_LIST: Ats[] = ["greenhouse", "lever", "ashby", "workday"];
export const ATS_NAMES: Record<Ats, string> = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", workday: "Workday" };
// The domains each system sends its candidate mail from (a subdomain counts: no-reply@us.greenhouse-mail.io). An
// employer's own domain never counts: a code is the application system's, and a look-alike employer mail proves nothing.
export const ATS_CODE_SENDERS: Record<Ats, string[]> = {
  greenhouse: ["greenhouse-mail.io", "greenhouse.io"],
  lever: ["lever.co"],
  ashby: ["ashbyhq.com"],
  workday: ["myworkdayjobs.com", "myworkday.com"],
};
// Each system's own code, by its own words. Greenhouse: "Copy and paste this code into the security code field on your
// application: Xy7kQ2mB" (8 letters and digits; a plain word such as "Complete" is never a code: it needs a digit, or a
// capital after its first letter and a small letter). Lever, Ashby: a 6-digit verification code. Workday: a 6 to 8-digit
// verification code or one-time passcode. A code is read only right after those words (within one line).
const word = (t: string) => !/\d/.test(t) && !(/[a-z]/.test(t) && /[A-Z]/.test(t.slice(1)));
export const CODE_PATTERNS: Record<Ats, { re: RegExp; reject?: (t: string) => boolean }[]> = {
  greenhouse: [{ re: /\bsecurity code\b(?:[^\n:]{0,80}:| is:?)\s*([A-Za-z0-9]{8})(?![A-Za-z0-9])/gi, reject: word }],
  lever: [{ re: /\b(?:verification|security|confirmation) code\b[^\n\d]{0,40}?(?<!\d)(\d{6})(?!\d)/gi }],
  ashby: [{ re: /\b(?:verification|security|confirmation) code\b[^\n\d]{0,40}?(?<!\d)(\d{6})(?!\d)/gi }],
  workday: [{ re: /\b(?:verification code|one[- ]time (?:pass)?code|passcode)\b[^\n\d]{0,40}?(?<!\d)(\d{6,8})(?!\d)/gi }],
};

// ------------------------------------------------------------------------------------------------ the code, kept in memory
const HIDDEN = "[emailed code]";
export class EmailCode {
  #value: string;
  constructor(value: string) {
    this.#value = value;
  }
  // The characters, for the one place that types them into the employer's page.
  reveal(): string {
    return this.#value;
  }
  toString() {
    return HIDDEN;
  }
  toJSON() {
    return HIDDEN;
  }
  [Symbol.for("Deno.customInspect")]() {
    return HIDDEN;
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return HIDDEN;
  }
}
// Every occurrence of a code in a text replaced, for any text that may have picked it up from a page (an employer's page
// can echo what was typed).
export function redactCode(text: string, code: string | EmailCode | null | undefined): string {
  const c = code instanceof EmailCode ? code.reveal() : String(code ?? "");
  return c.length >= 4 ? String(text).split(c).join(HIDDEN) : String(text);
}

// ------------------------------------------------------------------------------------------------ results
export type CodeStatus = "found" | "not_yet" | "no_google_connection" | "scope_missing" | "ambiguous";
export type CodeResult =
  | { status: "found"; ats: Ats; code: EmailCode; receivedAt: number }
  | { status: "not_yet"; ats: Ats; looked: number }
  | { status: "no_google_connection"; ats: Ats }
  | { status: "scope_missing"; ats: Ats }
  | { status: "ambiguous"; ats: Ats; codes: number };

// What the person reads when the code could not be used: what to do, by name. Never the code.
export function codeStop(status: Exclude<CodeStatus, "found">, ats: Ats | string): string {
  const n = ATS_NAMES[ats as Ats] ?? "the employer";
  if (status === "no_google_connection") {
    return `Connect Google so I can read the code ${n} emails you, or type the code on the page yourself.`;
  }
  if (status === "scope_missing") {
    return `Your Google connection doesn't let me read mail. Connect Google again and allow reading mail so I can read the code ${n} emails you, or type the code on the page yourself.`;
  }
  if (status === "ambiguous") {
    return `Two different codes from ${n} are in your inbox, so I didn't guess. Type the newest one on the page yourself.`;
  }
  return `The code ${n} emails you hasn't arrived in your inbox after 3 minutes. Type the code on the page yourself when it comes.`;
}

// ------------------------------------------------------------------------------------------------ reading one message
export interface CodeMessage { id: string; internalDate: number; from: string; subject: string; text: string; auth: string[] }
export function senderDomain(from: string): string {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(from) ?? /([^\s<>"]+@[^\s<>"]+)/.exec(from);
  return m ? m[1].split("@").pop()!.toLowerCase().replace(/[.>]+$/, "") : "";
}
export function fromAts(ats: Ats, from: string): boolean {
  const d = senderDomain(from);
  return !!d && ATS_CODE_SENDERS[ats].some((s) => d === s || d.endsWith("." + s));
}
// The distinct codes one message carries, by its system's own pattern (subject and body).
export function extractCodes(ats: Ats, text: string): string[] {
  const out = new Set<string>();
  for (const p of CODE_PATTERNS[ats]) {
    for (const m of String(text).matchAll(new RegExp(p.re.source, p.re.flags))) {
      if (!p.reject?.(m[1])) out.add(m[1]);
    }
  }
  return [...out];
}

// ------------------------------------------------------------------------------------------------ the mailbox
// The person's mailbox as this module needs it: a search (newest first, ids only) and one message.
export interface CodeMailbox {
  search(q: string): Promise<string[]>;
  get(id: string): Promise<CodeMessage | null>;
}
// A mailbox that cannot be read for the person's own reason (no grant, revoked, no mail scope) says so with this error.
export class CodeAccessError extends Error {
  constructor(public status: "no_google_connection" | "scope_missing") {
    super(status);
  }
}
export function codeQuery(ats: Ats, afterMs: number): string {
  return `from:(${ATS_CODE_SENDERS[ats].join(" OR ")}) after:${Math.max(0, Math.floor(afterMs / 1000))}`;
}

// One look: the newest matching messages, each checked (sender, Gmail's authentication, time), their codes gathered.
export async function lookOnce(mailbox: CodeMailbox, ats: Ats, sinceMs: number, toleranceMs: number, now: number, looked = 1): Promise<CodeResult> {
  const from = sinceMs - Math.max(0, Math.min(toleranceMs, 120_000));
  const ids = (await mailbox.search(codeQuery(ats, from))).slice(0, 10);
  const codes = new Map<string, number>();
  for (const id of ids) {
    const m = await mailbox.get(id);
    if (!m) continue;
    const at = Number(m.internalDate);
    if (!Number.isFinite(at) || at < from || at > now + 60_000 || now - at > CODE_WINDOW_MS) continue; // old, or not this ask
    if (!fromAts(ats, m.from)) continue; // another sender
    if (!authenticated(m.auth, senderDomain(m.from))) continue; // a From line alone proves nothing
    for (const c of extractCodes(ats, `${m.subject}\n${m.text}`)) codes.set(c, Math.max(codes.get(c) ?? 0, at));
  }
  if (codes.size > 1) return { status: "ambiguous", ats, codes: codes.size };
  if (codes.size === 1) {
    const [[c, at]] = [...codes];
    return { status: "found", ats, code: new EmailCode(c), receivedAt: at };
  }
  return { status: "not_yet", ats, looked };
}

export interface FetchCodeInput { userId: string; ats: Ats | string; sinceMs: number; toleranceMs?: number; maxWaitMs?: number }
export interface FetchCodeDeps {
  // The person's mailbox, or why it cannot be read for them.
  mailbox: (userId: string) => Promise<CodeMailbox | { status: "no_google_connection" | "scope_missing" }>;
  now: () => number;
  sleep?: (ms: number) => Promise<void>;
}
export const DEFAULT_TOLERANCE_MS = 30_000;
export function isAts(x: unknown): x is Ats {
  return ATS_LIST.includes(x as Ats);
}

// The code the form just asked for, waiting up to about three minutes (career_email_code_poll.ts). maxWaitMs 0 is one look.
export async function fetchVerificationCode(i: FetchCodeInput, d: FetchCodeDeps): Promise<CodeResult> {
  if (!isAts(i.ats)) throw new TypeError("fetchVerificationCode: an application system Trainee knows the senders of");
  const ats = i.ats;
  if (!i.userId || !Number.isFinite(i.sinceMs)) throw new TypeError("fetchVerificationCode: userId and sinceMs");
  const box = await d.mailbox(i.userId);
  if (!("search" in box)) return { status: box.status, ats };
  return await pollForCode(async (attempt) => {
    try {
      return await lookOnce(box, ats, i.sinceMs, i.toleranceMs ?? DEFAULT_TOLERANCE_MS, d.now(), attempt + 1);
    } catch (e) {
      if (e instanceof CodeAccessError) return { status: e.status, ats } as CodeResult;
      return { status: "not_yet", ats, looked: attempt + 1 } as CodeResult; // a passing failure: look again
    }
  }, { now: d.now, sleep: d.sleep, maxWaitMs: i.maxWaitMs ?? CODE_MAX_WAIT_MS });
}

// ------------------------------------------------------------------------------------------------ Gmail, for real
const b64text = (s: string) => {
  try {
    const bin = atob(String(s).replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
};
const html = (t: string) => t.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ");
export function gmailText(full: any): string {
  const plain: string[] = [], rich: string[] = [];
  const walk = (p: any) => {
    if (!p) return;
    const mt = String(p.mimeType || "");
    if (mt === "text/plain" && p.body?.data) plain.push(b64text(p.body.data));
    if (mt === "text/html" && p.body?.data) rich.push(html(b64text(p.body.data)));
    for (const q of p.parts || []) walk(q);
  };
  walk(full?.payload);
  return (plain.length ? plain : rich).join("\n");
}
const head = (msg: any, name: string) =>
  String((msg?.payload?.headers ?? []).find((h: any) => String(h?.name ?? "").toLowerCase() === name)?.value ?? "");
// The Gmail API (users.messages list + get format=full) with one access token. base is Gmail's own address; a loopback
// stand-in is allowed only to the local test fixtures (scripts/apply.ts refuses it for a real employer).
export const GMAIL_MESSAGES = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
export function gmailCodeMailbox(d: { fetch: typeof fetch; token: string; base?: string }): CodeMailbox {
  const base = d.base ?? GMAIL_MESSAGES;
  const call = async (url: string) => {
    const r = await d.fetch(url, { headers: { Authorization: `Bearer ${d.token}` } });
    if (r.status === 401) throw new CodeAccessError("no_google_connection");
    if (r.status === 403) {
      const body = await r.clone().json().catch(() => ({}));
      const why = JSON.stringify((body as any)?.error ?? "");
      if (/insufficient|scope|ACCESS_TOKEN_SCOPE/i.test(why)) throw new CodeAccessError("scope_missing");
    }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`gmail: HTTP ${r.status}`);
    return await r.json();
  };
  return {
    async search(q) {
      const body = await call(`${base}?q=${encodeURIComponent(q)}&maxResults=10`);
      return ((body as any)?.messages ?? []).map((m: any) => String(m?.id ?? "")).filter(Boolean);
    },
    async get(id) {
      const msg = await call(`${base}/${encodeURIComponent(id)}?format=full`);
      if (!msg) return null;
      const auth = ((msg as any)?.payload?.headers ?? []).filter((h: any) => String(h?.name ?? "").toLowerCase() === "authentication-results")
        .map((h: any) => String(h?.value ?? "")).slice(0, 5);
      return { id, internalDate: Number((msg as any).internalDate), from: head(msg, "from"), subject: head(msg, "subject"), text: gmailText(msg), auth };
    },
  };
}
// The person's career Google grant (vault oauth_google_career_<uid>) as a mailbox: no grant is no_google_connection, a
// grant without gmail.readonly is scope_missing, a revoked grant (refresh refused) is no_google_connection.
export function careerCodeMailbox(d: TokenDeps & { base?: string }): FetchCodeDeps["mailbox"] {
  return async (userId) => {
    const conn = await d.connection(userId);
    if (!conn || conn.vault_name !== `oauth_google_career_${userId}`) return { status: "no_google_connection" };
    const scopes = Array.isArray(conn.scopes) ? conn.scopes : String(conn.scopes ?? "").split(/[\s,]+/);
    if (!scopes.includes(CAREER_READ_SCOPE)) return { status: "scope_missing" };
    const token = await careerToken(d)(userId);
    if (!token) return { status: "no_google_connection" };
    return gmailCodeMailbox({ fetch: d.fetch, token, base: d.base });
  };
}

// ------------------------------------------------------------------------------------------------ the edge function
// Which application system a posting's page belongs to, by its host. null: not one Trainee reads codes for by host.
export function atsOfUrl(url: string): Ats | null {
  let h = "";
  try {
    h = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (/(^|\.)greenhouse\.io$/.test(h)) return "greenhouse";
  if (/(^|\.)lever\.co$/.test(h)) return "lever";
  if (/(^|\.)ashbyhq\.com$/.test(h)) return "ashby";
  if (/(^|\.)(myworkdayjobs|myworkday)\.com$/.test(h)) return "workday";
  return null;
}
// How long after the drive was claimed a code may still be read for it: the code step comes within minutes of the click.
export const DRIVE_WINDOW_MS = 20 * 60_000;
export interface DrivingJob { user_id: string; state: string; lease_token: string | null; url: string; claimed_at: string | null }
export interface CodeHandlerDeps {
  cors?: Record<string, string>;
  user: (token: string) => Promise<{ id: string } | null>;
  job: (userId: string, id: string) => Promise<DrivingJob | null>;
  // One look in the person's mailbox (the caller polls: an edge function never holds a request for three minutes).
  look: (i: FetchCodeInput) => Promise<CodeResult>;
  now: () => number;
}
// POST {apply_id, lease, since_ms, ats?} with the person's own session. Answers {status, code} when found, else
// {status, stop}. Nothing is logged; an error says what was wrong with the request, never anything from the mailbox.
export async function handleEmailCode(req: Request, d: CodeHandlerDeps): Promise<Response> {
  const cors = d.cors ?? {};
  const out = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out(405, { error: "POST only" });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const user = token ? await d.user(token).catch(() => null) : null;
  if (!user) return out(401, { error: "sign in first" });
  const b = await req.json().catch(() => null) as any;
  if (!b || typeof b.apply_id !== "string" || typeof b.lease !== "string" || !Number.isFinite(Number(b.since_ms))) {
    return out(400, { error: "apply_id, lease and since_ms" });
  }
  const job = await d.job(user.id, b.apply_id).catch(() => null);
  const now = d.now(), claimed = Date.parse(String(job?.claimed_at ?? ""));
  // The approval law: only an application the person approved on its card, being driven now, under this drive's lease.
  if (!job || job.user_id !== user.id || job.state !== "driving" || !job.lease_token || job.lease_token !== b.lease ||
    !Number.isFinite(claimed) || now - claimed > DRIVE_WINDOW_MS) {
    return out(403, { error: "only an application you approved, while it is being sent" });
  }
  const host = atsOfUrl(job.url), asked = b.ats === undefined ? host : b.ats;
  if (!isAts(asked) || (host && asked !== host)) return out(400, { error: "the application system of this posting" });
  const sinceMs = Math.min(now, Math.max(Number(b.since_ms), claimed - 60_000));
  const r = await d.look({ userId: user.id, ats: asked, sinceMs, maxWaitMs: 0 });
  if (r.status === "found") return out(200, { status: "found", code: r.code.reveal() });
  return out(200, { status: r.status, stop: codeStop(r.status, asked) });
}
