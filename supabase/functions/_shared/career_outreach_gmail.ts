// WO-033 part 3: the send rail. One approved message at a time through Gmail's users.messages.send, with the career
// Google grant's token (provider google_career, vault oauth_google_career_<uid>, scopes from gmail-oauth/career.ts).
// No grant, no gmail.send scope, no refresh token or no OAuth client: NOT_WIRED, and nothing is sent.
// No blast mode: exactly one recipient, no Cc or Bcc header ever, no header the person did not see (only To, Subject,
// MIME-Version and Content-Type are written; Gmail adds From as the signed-in account). A header value with a line
// break is refused (header injection), never cleaned.
// Replies are read per thread (gmail.readonly, format=metadata), for "stop", bounces and answers: who, subject, snippet.
import type { Message, ReplyRead, SendResult } from "./career_outreach.ts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const b64url = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
// RFC 2047 for a subject that is not plain ASCII.
const encodeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`);
export const ONE_ADDRESS = /^[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,24}$/;

export function buildRaw(m: Message): string {
  if (!ONE_ADDRESS.test(m.to)) throw new Error("one recipient, one plain address: no lists, names or separators");
  if (/[\r\n]/.test(m.subject) || /[\r\n]/.test(m.to)) throw new Error("a header with a line break is refused");
  const head = [`To: ${m.to}`, `Subject: ${encodeWord(m.subject)}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit"];
  return b64url(`${head.join("\r\n")}\r\n\r\n${m.text.replace(/\r?\n/g, "\r\n")}`);
}

export interface GmailDeps { fetch: typeof fetch; token: (userId: string, scope: string) => Promise<string | null> }

export function gmailSender(d: GmailDeps) {
  return {
    async send(userId: string, m: Message): Promise<SendResult> {
      let raw: string;
      try { raw = buildRaw(m); } catch (e) { return { status: "ERROR", detail: e instanceof Error ? e.message : String(e) }; }
      const token = await d.token(userId, GMAIL_SEND_SCOPE);
      if (!token) return { status: "NOT_WIRED", reason: "no career Google grant with gmail.send" };
      const r = await d.fetch(`${API}/messages/send`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ raw }) });
      if (r.status === 429 || r.status === 403 && /rateLimit|quota/i.test(await r.clone().text())) return { status: "RATE_LIMITED", detail: `HTTP ${r.status}` };
      if (!r.ok) return { status: "ERROR", detail: `send: HTTP ${r.status}` };
      const j: any = await r.json().catch(() => ({}));
      return j?.id ? { status: "sent", id: String(j.id), thread_id: String(j.threadId ?? "") } : { status: "ERROR", detail: "send: no message id" };
    },
  };
}

const header = (msg: any, name: string) => String((msg?.payload?.headers ?? []).find((h: any) => String(h?.name ?? "").toLowerCase() === name.toLowerCase())?.value ?? "");
// The messages on a thread Trainee started, except the person's own (Gmail labels them SENT).
export function gmailThreadReader(d: GmailDeps) {
  return async (userId: string, threadId: string): Promise<ReplyRead> => {
    const token = await d.token(userId, GMAIL_READ_SCOPE);
    if (!token) return { status: "NOT_WIRED" };
    const r = await d.fetch(`${API}/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return { status: "ERROR", detail: `read a thread: HTTP ${r.status}` };
    const j: any = await r.json().catch(() => ({}));
    const messages = (Array.isArray(j?.messages) ? j.messages : []).filter((m: any) => !(m?.labelIds ?? []).includes("SENT"))
      .map((m: any) => ({ from: header(m, "From"), subject: header(m, "Subject"), snippet: String(m?.snippet ?? ""), at: new Date(Number(m?.internalDate) || Date.now()).toISOString() }));
    return { status: "ok", messages };
  };
}

// ------------------------------------------------------------------------------------------------ the token
// The career grant's access token for one scope, refreshed when about to expire and written back to the vault. null
// (so the rail is NOT_WIRED) when there is no career grant, it lacks the scope, there is no refresh token, the OAuth
// client is not configured, or Google says the grant was revoked. The same shape as WO-024's reader (career_mail_gmail.ts
// careerToken), which needs gmail.readonly; this one is asked for the scope the caller needs.
export interface TokenDeps {
  connection: (userId: string) => Promise<{ vault_name: string; scopes?: string | string[] | null } | null>;
  readVault: (name: string) => Promise<string | null>;
  writeVault: (name: string, secret: string) => Promise<void>;
  fetch: typeof fetch;
  env: { get(k: string): string | undefined };
  now: () => number;
}
export function careerScopedToken(d: TokenDeps): (userId: string, scope: string) => Promise<string | null> {
  return async (userId, scope) => {
    const name = `oauth_google_career_${userId}`;
    const conn = await d.connection(userId);
    if (!conn || conn.vault_name !== name) return null;
    const scopes = Array.isArray(conn.scopes) ? conn.scopes : String(conn.scopes ?? "").split(/[\s,]+/);
    if (!scopes.includes(scope)) return null;
    const raw = await d.readVault(name);
    if (!raw) return null;
    let tok: any;
    try { tok = JSON.parse(raw); } catch { return null; }
    if (tok.access_token && d.now() < Number(tok.expires_at || 0) - 60000) return String(tok.access_token);
    const id = d.env.get("GOOGLE_OAUTH_CLIENT_ID"), secret = d.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    if (!tok.refresh_token || !id || !secret) return null;
    const r = await d.fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: String(tok.refresh_token), grant_type: "refresh_token" }),
    });
    const nt: any = await r.json().catch(() => ({}));
    if (!r.ok || !nt.access_token) {
      if (r.status === 400 || r.status === 401) return null;
      throw new Error(`refresh the career grant: HTTP ${r.status}`);
    }
    await d.writeVault(name, JSON.stringify({ ...tok, access_token: nt.access_token, refresh_token: nt.refresh_token || tok.refresh_token, expires_at: d.now() + (Number(nt.expires_in) || 3600) * 1000 }));
    return String(nt.access_token);
  };
}
