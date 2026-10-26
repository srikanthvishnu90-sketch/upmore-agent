// FEATURE NEEDS (2026-10-26): Google (Gmail), the one place Trainee's Google scopes are listed for audit (the owner is
// starting Google's verification). Two capabilities, each one scope, plus the identity scopes that name the address:
//   read  https://www.googleapis.com/auth/gmail.readonly  (restricted): employers' replies (F8 mail tracking reads From,
//         Subject, Date and the snippet of new mail) and, during an application the person approved, the code an
//         application system emails (WO-096 career-email-code; the code is used once and never stored)
//   send  https://www.googleapis.com/auth/gmail.send      (sensitive): only a message the person approved word for word
//   identity  openid, email  (non-sensitive): the address shown in "Gmail connected: <address>"
// Nothing else is asked for: no Calendar, no Drive, no contacts. supabase/migrations/20261026160000 mirrors this list in a
// check constraint (career_connect_links.scopes), and tests/architect/career-needs-unit.test.ts keeps the two equal.
import type { Connector, Exchanged } from "./types.ts";

export const GMAIL_READ = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
export const GOOGLE_IDENTITY = ["openid", "email"];
export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";

// The address that granted access: the ID token Google returned with the code (over TLS, from Google's own token endpoint,
// so its claims need no signature check: OpenID Connect Core 3.1.3.7), else Google's userinfo for this token.
async function emailOf(f: typeof fetch, tok: { id_token?: unknown; access_token: string }): Promise<string | null> {
  if (typeof tok.id_token === "string") {
    try {
      const part = tok.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const claims = JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
      if (typeof claims.email === "string") return claims.email;
    } catch { /* userinfo below */ }
  }
  try {
    const r = await f(GOOGLE_USERINFO, { headers: { authorization: `Bearer ${tok.access_token}` } });
    const me = await r.json().catch(() => ({}));
    return r.ok && typeof me.email === "string" ? me.email : null;
  } catch { return null; }
}

export const google: Connector = {
  id: "google",
  label: "Gmail",
  provider: "google_career",
  legacyProviders: ["gmail"],
  env: { clientId: "GOOGLE_OAUTH_CLIENT_ID", clientSecret: "GOOGLE_OAUTH_CLIENT_SECRET" },
  scopes: { read: GMAIL_READ, send: GMAIL_SEND },
  identity: GOOGLE_IDENTITY,
  allScopes: () => [GMAIL_READ, GMAIL_SEND, ...GOOGLE_IDENTITY],
  words: {
    read: "read: Google's permission covers all of your mail. I use it for two things: the sender, subject and short preview of new mail, to spot employers' replies, and, during an application you approved, the code email from that application system",
    send: "send: only a message you approve word for word in this chat, from your own Gmail",
  },
  consentUrl: (o) => `${GOOGLE_AUTH}?${new URLSearchParams({ client_id: o.clientId, redirect_uri: o.redirectUri, response_type: "code", scope: o.scopes.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: o.state })}`,
  async exchange(o): Promise<Exchanged> {
    const r = await o.fetch(GOOGLE_TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: o.code, client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri, grant_type: "authorization_code" }) });
    const tok = await r.json().catch(() => ({}));
    if (!r.ok || typeof tok.access_token !== "string") throw new Error(`token exchange: HTTP ${r.status}`);
    return {
      access_token: tok.access_token, refresh_token: typeof tok.refresh_token === "string" ? tok.refresh_token : null,
      expires_in: Number(tok.expires_in) || 3600,
      granted: typeof tok.scope === "string" && tok.scope.trim() ? tok.scope.split(/\s+/).filter(Boolean) : null,
      email: await emailOf(o.fetch, tok),
    };
  },
  async revoke(o): Promise<boolean> {
    try {
      const r = await o.fetch(GOOGLE_REVOKE, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: o.token }) });
      // 400 invalid_token: Google no longer holds it (the person already removed it), which is the outcome wanted.
      return r.ok || r.status === 400;
    } catch { return false; }
  },
};
