// FEATURE NEEDS (2026-10-26): Google (Gmail) as a Connector. The scopes, the words a person reads about them and the
// disconnect are Google verification's own modules (PR #196), so the connect flow can never ask for or say something the
// verification submission did not:
//   ../google_scopes.ts      the one list of Google scopes (openid, email, gmail.readonly; gmail.send deferred until the
//                            owner names it in GOOGLE_APPROVED_EXTRA_SCOPES), requestableScopes(), consentNotice()
//   ../google_disconnect.ts  "disconnect gmail": revoke at Google, delete tokens, rows and the mail rows, read back
// This file adds only what a connect link needs: the consent URL and the code exchange.
import type { Connector, Exchanged } from "./types.ts";
import { consentNotice, EMAIL, GMAIL_READONLY, GMAIL_SEND, OPENID, requestableScopes, SUBMITTED_SCOPES } from "../google_scopes.ts";
import { disconnectGoogle, disconnectReply } from "../google_disconnect.ts";

export const GMAIL_READ = GMAIL_READONLY;
export { GMAIL_SEND };
export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

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
  scopes: { read: GMAIL_READONLY, send: GMAIL_SEND },
  requestable: (asked, env) => requestableScopes(asked, env),
  allScopes: () => [...SUBMITTED_SCOPES, GMAIL_SEND],
  notice: (scopes) => { const n = consentNotice(scopes); return { reads: n.reads, never: n.never, undo: n.undo }; },
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
  async disconnect(o) {
    const r = await disconnectGoogle(o.admin, o.userId, { fetch: o.fetch });
    return { reply: disconnectReply(r), ok: r.ok, had: r.had };
  },
};
export const GOOGLE_IDENTITY = [OPENID, EMAIL];
