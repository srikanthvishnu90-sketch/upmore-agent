// FEATURE NEEDS (2026-10-26): the connect link's HTTP side, served by the career-connect edge function (public: a link
// in a chat and Google's redirect carry no Upmore JWT; the one-time token and the signed state are the authentication).
//   GET  ?t=<token>          peek only (message previews fetch links): a Trainee page that says which account the Gmail
//                            would join and exactly what Google will be asked for, with a "Continue to Google" button
//                            (a form POST to this same URL). Used, expired and unknown tokens get their own page.
//   POST t=<token> (form)    the person's tap: the token is used once (career_connect_link_open) and the browser goes to
//                            Google's consent for only the link's scopes (offline, so mail can be read later; granted
//                            scopes kept), with a state signed for this link that expires with it.
//   GET  ?state&code|error   Google's callback: the state verified, the link finished once (career_connect_link_finish),
//                            the code exchanged, the grant stored exactly as gmail-oauth stores the career grant (vault
//                            oauth_google_career_<uid>, user_oauth_connections provider google_career, the scopes Google
//                            says were granted), and the person told in the same channel: "Gmail connected: <address>".
// No token, code or secret is logged, put in a URL Trainee shows, or returned. The person is only ever the one the link
// was minted for; nothing in a query string can name another.
import { READ_SCOPE, SEND_SCOPE } from "./career_needs.ts";
import { linkBase, scopeLines } from "./career_connectors.ts";

export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
const PROVIDER = "google_career";
const STATE_MS = 15 * 60 * 1000;

// deno-lint-ignore no-explicit-any
type Admin = any;
export interface FlowDeps {
  admin: Admin;
  env: { get(k: string): string | undefined };
  fetch: typeof fetch;
  now?: () => number;
  // Sends a just-queued channel message at once (channel_runtime.ts deliverer); absent, the scheduled delivery sends it.
  deliver?: (a: { userId: string; key: string; now: number }) => Promise<void>;
  log?: (line: string) => void;
}

// ------------------------------------------------------------------------------------------------ the signed state
const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload))));
}
export async function issueState(linkId: string, secret: string, now: number): Promise<string> {
  const payload = `c1.${linkId}.${now + STATE_MS}`;
  return `${payload}.${await sign(secret, payload)}`;
}
export async function verifyState(state: string, secret: string, now: number): Promise<string | null> {
  const m = /^(c1\.([0-9a-f-]{36})\.(\d{10,16}))\.([A-Za-z0-9_-]{43})$/.exec(String(state ?? ""));
  if (!m || !secret || Number(m[3]) < now) return null;
  const want = await sign(secret, m[1]);
  // Constant-time compare of the two signatures.
  let diff = want.length ^ m[4].length;
  for (let i = 0; i < Math.min(want.length, m[4].length); i++) diff |= want.charCodeAt(i) ^ m[4].charCodeAt(i);
  return diff === 0 ? m[2] : null;
}

// ------------------------------------------------------------------------------------------------ pages
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const HEADERS = {
  "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'",
};
export function page(title: string, body: string[], status = 200, form?: { action: string; token: string; label: string }): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${esc(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#F2F2F4;color:#4A2F5E;margin:0;padding:24px}` +
    `main{max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px}h1{font-size:20px;margin:0 0 12px}.w{color:#9B7BB8;font-weight:700}` +
    `button{font:inherit;background:#4A2F5E;color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer}</style></head><body><main>` +
    `<p class="w">Trainee</p><h1>${esc(title)}</h1>${body.map((p) => `<p>${esc(p)}</p>`).join("")}` +
    (form ? `<form method="post" action="${esc(form.action)}"><input type="hidden" name="t" value="${esc(form.token)}"><button type="submit">${esc(form.label)}</button></form>` : "") +
    `</main></body></html>`;
  return new Response(html, { status, headers: HEADERS });
}
const GONE: Record<string, string> = {
  used: "This link was already used. Links work once: ask Trainee for a new one by texting \"connect gmail\".",
  expired: "This link expired. Links last 15 minutes: ask Trainee for a new one by texting \"connect gmail\".",
  invalid: "This link isn't valid. Ask Trainee for a new one by texting \"connect gmail\".",
};
const plain = (lines: string[]) => lines.map((l) => l.replace(/^- /, ""));

// What the person is told in the chat once Google answered: what was granted, in plain words, and how to undo it.
export function connectedMessage(email: string | null, granted: string[]): string {
  const can = [granted.includes(READ_SCOPE) ? "read your mail, for employers' replies and application codes" : null,
    granted.includes(SEND_SCOPE) ? "send from your Gmail, only messages you approve word for word" : null].filter(Boolean);
  const not = [!granted.includes(READ_SCOPE) ? "reading mail" : null, !granted.includes(SEND_SCOPE) ? "sending" : null].filter(Boolean);
  return `Gmail connected: ${email ?? "your Google account"}.${can.length ? ` You allowed me to ${can.join(", and to ")}.` : ""}` +
    `${not.length ? ` You didn't allow ${not.join(" or ")}, so I won't do that.` : ""} Say "disconnect gmail" any time to remove it.`;
}

// ------------------------------------------------------------------------------------------------ the handler
export async function handleConnect(req: Request, d: FlowDeps): Promise<Response> {
  const now = (d.now ?? Date.now)();
  const url = new URL(req.url);
  const self = linkBase(d.env) ?? `${url.origin}${url.pathname}`;
  const clientId = d.env.get("GOOGLE_OAUTH_CLIENT_ID") || "", clientSecret = d.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";
  const secret = d.env.get("OAUTH_STATE_SECRET") || "";
  const configured = !!(clientId && clientSecret && secret);

  // Google's callback.
  if (req.method === "GET" && url.searchParams.has("state")) {
    const linkId = await verifyState(url.searchParams.get("state") ?? "", secret, now);
    if (!linkId) return page("This didn't work", ["The sign-in came back without a valid link, so nothing was connected. Ask Trainee for a new link by texting \"connect gmail\"."], 400);
    const declined = url.searchParams.has("error") || !url.searchParams.get("code");
    const fin = await d.admin.rpc("career_connect_link_finish", { p_link: linkId, p_outcome: declined ? "declined" : "error", p_now: new Date(now).toISOString() });
    const link = fin.error ? null : fin.data;
    if (!link || link.error) return page("This link was already used", [GONE[link?.error] ?? GONE.invalid], 400);
    if (declined) {
      await tell(d, link, linkId, "Gmail wasn't connected: Google's page was closed or declined, so nothing changed. Text \"connect gmail\" if you want a new link.", now);
      return page("Gmail wasn't connected", ["Nothing changed. You can close this tab and go back to the chat."]);
    }
    try {
      const tokRes = await d.fetch(GOOGLE_TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: url.searchParams.get("code")!, client_id: clientId, client_secret: clientSecret, redirect_uri: self, grant_type: "authorization_code" }) });
      const tok = await tokRes.json().catch(() => ({}));
      if (!tokRes.ok || typeof tok.access_token !== "string") throw new Error(`token exchange: HTTP ${tokRes.status}`);
      const email = await emailOf(d, tok);
      const prior = await d.admin.from("user_oauth_connections").select("scopes").eq("user_id", link.user_id).eq("provider", PROVIDER).maybeSingle();
      const priorScopes = String(prior.data?.scopes ?? "").split(/[\s,]+/).filter(Boolean);
      // The scopes Google says this grant now holds (include_granted_scopes keeps earlier ones); without that, what was asked.
      const granted = typeof tok.scope === "string" && tok.scope.trim() ? tok.scope.split(/\s+/).filter(Boolean) : [...new Set([...priorScopes, ...(link.scopes as string[])])];
      const vault = `oauth_${PROVIDER}_${link.user_id}`;
      let refresh: string | null = typeof tok.refresh_token === "string" ? tok.refresh_token : null;
      if (!refresh) {
        const old = await d.admin.rpc("oauth_vault_read", { p_name: vault });
        try { refresh = JSON.parse(String(old.data ?? "")).refresh_token ?? null; } catch { refresh = null; }
      }
      const stored = await d.admin.rpc("oauth_vault_store", { p_name: vault, p_secret: JSON.stringify({ access_token: tok.access_token, refresh_token: refresh,
        expires_at: now + (Number(tok.expires_in) || 3600) * 1000, email, scopes: granted.join(" ") }) });
      if (stored.error) throw new Error("save the grant");
      const row = await d.admin.from("user_oauth_connections").upsert({ user_id: link.user_id, provider: PROVIDER, vault_name: vault, email, scopes: granted.join(" "),
        connected_at: new Date(now).toISOString() }, { onConflict: "user_id,provider" });
      if (row.error) throw new Error("record the connection");
      await d.admin.from("career_connect_links").update({ outcome: "connected" }).eq("id", linkId);
      const text = connectedMessage(email, granted);
      await tell(d, link, linkId, text, now);
      return page(`Gmail connected${email ? `: ${email}` : ""}`, [text.replace(/^Gmail connected: [^.]*(?:\.[^ ]+)*\.\s*/, ""), "You can close this tab and go back to the chat."]);
    } catch (e) {
      d.log?.(`career-connect callback failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
      await tell(d, link, linkId, "Gmail wasn't connected: something went wrong on the way back from Google, so nothing was saved. Text \"connect gmail\" for a new link.", now);
      return page("Gmail wasn't connected", ["Something went wrong on the way back from Google, so nothing was saved. Ask Trainee for a new link by texting \"connect gmail\"."], 502);
    }
  }

  // The person's tap: use the token once and go to Google.
  if (req.method === "POST") {
    const form = await req.formData().catch(() => null);
    const token = String(form?.get("t") ?? "");
    if (!configured) return page("Not available yet", ["Connecting Gmail isn't switched on yet, so nothing was connected. Your link still works once it is."], 503);
    const r = await d.admin.rpc("career_connect_link_open", { p_nonce: token, p_now: new Date(now).toISOString() });
    if (r.error || !r.data || r.data.error) return page("This link can't be used", [GONE[r.data?.error] ?? GONE.invalid], 400);
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: self, response_type: "code", scope: (r.data.scopes as string[]).join(" "),
      access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: await issueState(String(r.data.link_id), secret, now) });
    return new Response(null, { status: 303, headers: { location: `${GOOGLE_AUTH}?${q}`, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }

  // The link itself, opened (or fetched by a message preview): peek only.
  if (req.method === "GET" && url.searchParams.has("t")) {
    const token = url.searchParams.get("t") ?? "";
    const r = await d.admin.rpc("career_connect_link_peek", { p_nonce: token, p_now: new Date(now).toISOString() });
    const p = r.error ? { status: "invalid" } : r.data ?? { status: "invalid" };
    if (p.status !== "ok") return page("This link can't be used", [GONE[p.status] ?? GONE.invalid], 410);
    const whose = p.hint ? `the Trainee account ${p.hint}` : "the Trainee account you're chatting with";
    return page("Connect Gmail to Trainee", [
      `This connects your Gmail to ${whose}. Continue only if you asked Trainee for this link in the last 15 minutes.`,
      "Google will ask you to allow:", ...plain(scopeLines(p.scopes ?? [])), "and your email address, so Trainee can tell you which one you connected.",
      "Trainee never sees your Google password.",
    ], 200, { action: self, token, label: "Continue to Google" });
  }
  return page("Nothing here", ["Ask Trainee for a link by texting \"connect gmail\"."], 404);
}

// The address that granted access: the ID token Google returned with the code (over TLS, from Google's own token
// endpoint), else Google's userinfo for this token.
// deno-lint-ignore no-explicit-any
async function emailOf(d: FlowDeps, tok: any): Promise<string | null> {
  if (typeof tok.id_token === "string") {
    try {
      const part = tok.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const claims = JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
      if (typeof claims.email === "string") return claims.email;
    } catch { /* fall through to userinfo */ }
  }
  try {
    const r = await d.fetch(GOOGLE_USERINFO, { headers: { authorization: `Bearer ${tok.access_token}` } });
    const me = await r.json().catch(() => ({}));
    return r.ok && typeof me.email === "string" ? me.email : null;
  } catch { return null; }
}

// The answer in the channel the link was asked for in: a channel's outbox row (written into the thread when delivered),
// or, on the web, the thread's own message.
// deno-lint-ignore no-explicit-any
async function tell(d: FlowDeps, link: any, linkId: string, text: string, now: number) {
  const at = new Date(now).toISOString();
  if (link.channel === "web") {
    if (!link.thread_id) return;
    const r = await d.admin.from("agent_messages").insert({ thread_id: link.thread_id, role: "assistant", content: text, meta: { career: true, intent: "career_connect_done", link: linkId } });
    if (r.error) d.log?.(`career-connect: the chat message was not written: ${r.error.message}`);
    return;
  }
  const key = `status:connect:${linkId}`;
  const r = await d.admin.from("career_outbox").insert({ user_id: link.user_id, key, kind: "status", text, deliver_at: at, channel: link.channel === "home" ? null : link.channel });
  if (r.error) { d.log?.(`career-connect: the channel message was not queued: ${r.error.message}`); return; }
  await d.deliver?.({ userId: link.user_id, key, now }).catch((e) => d.log?.(`career-connect: delivery waits for the schedule: ${String((e as Error)?.message ?? e).slice(0, 120)}`));
}
