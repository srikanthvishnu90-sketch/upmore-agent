// FEATURE NEEDS (2026-10-26): the connect link's HTTP side, served by the career-connect edge function, the OAuth
// client's redirect URI after go-live (public, verify_jwt off: a link in a chat and the provider's redirect carry no
// Upmore JWT; the one-time token and the signed state are the authentication).
//   GET  ?t=<token>          peek only (message previews fetch links): a Trainee page that says which account the mailbox
//                            would join and exactly what the provider will be asked for, with a "Continue" button (a form
//                            POST to this same URL). Used, expired and unknown tokens get their own page.
//   POST t=<token> (form)    the person's tap: the token is used once (career_connect_link_open) and the browser goes to
//                            the link's connector's consent page for only the link's scopes, with a state signed for this
//                            link that expires with it.
//   GET  ?state&code|error   the provider's callback: the state verified, the link finished once
//                            (career_connect_link_finish), the code exchanged by the connector, the grant stored
//                            (connectors/grant_store.ts: tokens only in the person's vault entry), and the person told in
//                            the same channel what was granted and how to carry on with what they were doing.
// No token, code or secret is logged, put in a URL Trainee shows, or returned. The person is only ever the one the link
// was minted for; nothing in a query string can name another.
import { connectorOf } from "./connectors/index.ts";
import type { Connector } from "./connectors/types.ts";
import { storeGrant } from "./connectors/grant_store.ts";
import { linkBase } from "./career_connectors.ts";

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

// How to carry on with what the person was doing when they asked for the link, said only when what it needs was granted.
const CARRY_ON: Record<string, { cap: "read" | "send"; text: string }> = {
  track_replies: { cap: "read", text: "Text \"check my email now\" and I'll look for employers' replies." },
  email_code: { cap: "read", text: "On your next applications, I'll read the code an application system emails you, while the application you approved is being sent." },
  send_email: { cap: "send", text: "Go back to the message you were sending and approve it again; I'll send exactly that message." },
  outreach: { cap: "send", text: "Go back to the drafts you were sending and approve them again; I'll send exactly those messages." },
};
// What the person is told in the chat once the provider answered: what was granted, in plain words, how to carry on, and
// how to undo it.
// asked: the scopes the link asked for (only those are said as not allowed; nothing never asked for is mentioned).
export function connectedMessage(email: string | null, granted: string[], o: { c?: Connector; purpose?: string; asked?: string[] } = {}): string {
  const c = o.c ?? connectorOf("google")!;
  const asked = o.asked ?? [c.scopes.read, c.scopes.send];
  const has = (k: "read" | "send") => granted.includes(c.scopes[k]);
  const can = [has("read") ? "read your mail, for employers' replies and application codes" : null,
    has("send") ? `send from your ${c.label}, only messages you approve word for word` : null].filter(Boolean);
  const not = [asked.includes(c.scopes.read) && !has("read") ? "reading mail" : null, asked.includes(c.scopes.send) && !has("send") ? "sending" : null].filter(Boolean);
  const next = o.purpose ? CARRY_ON[o.purpose] : undefined;
  return `${c.label} connected: ${email ?? "your account"}.${can.length ? ` You allowed me to ${can.join(", and to ")}.` : ""}` +
    `${not.length ? ` You didn't allow ${not.join(" or ")}, so I won't do that.` : ""}${next && has(next.cap) ? ` ${next.text}` : ""} Say "disconnect gmail" any time to remove it.`;
}

// ------------------------------------------------------------------------------------------------ the handler
export async function handleConnect(req: Request, d: FlowDeps): Promise<Response> {
  const now = (d.now ?? Date.now)();
  const url = new URL(req.url);
  const self = linkBase(d.env) ?? `${url.origin}${url.pathname}`;
  const secret = d.env.get("OAUTH_STATE_SECRET") || "";
  const client = (c: Connector) => ({ id: d.env.get(c.env.clientId) || "", secret: d.env.get(c.env.clientSecret) || "" });

  // The provider's callback.
  if (req.method === "GET" && url.searchParams.has("state")) {
    const linkId = await verifyState(url.searchParams.get("state") ?? "", secret, now);
    if (!linkId) return page("This didn't work", ["The sign-in came back without a valid link, so nothing was connected. Ask Trainee for a new link by texting \"connect gmail\"."], 400);
    const declined = url.searchParams.has("error") || !url.searchParams.get("code");
    const fin = await d.admin.rpc("career_connect_link_finish", { p_link: linkId, p_outcome: declined ? "declined" : "error", p_now: new Date(now).toISOString() });
    const link = fin.error ? null : fin.data;
    if (!link || link.error) return page("This link was already used", [GONE[link?.error] ?? GONE.invalid], 400);
    const c = connectorOf(link.connector);
    if (!c) return page("This didn't work", [GONE.invalid], 400);
    if (declined) {
      await tell(d, link, linkId, `${c.label} wasn't connected: Google's page was closed or declined, so nothing changed. Text "connect gmail" if you want a new link.`, now);
      return page(`${c.label} wasn't connected`, ["Nothing changed. You can close this tab and go back to the chat."]);
    }
    try {
      const { id, secret: clientSecret } = client(c);
      const ex = await c.exchange({ fetch: d.fetch, code: url.searchParams.get("code")!, clientId: id, clientSecret, redirectUri: self });
      const granted = await storeGrant(d.admin, c, { userId: link.user_id, ex, asked: link.scopes as string[], now });
      await d.admin.from("career_connect_links").update({ outcome: "connected" }).eq("id", linkId);
      const text = connectedMessage(ex.email, granted, { c, purpose: link.purpose, asked: link.scopes as string[] });
      await tell(d, link, linkId, text, now);
      return page(`${c.label} connected${ex.email ? `: ${ex.email}` : ""}`, [text.replace(/^\S+ connected: [^\s]*\.\s*/, ""), "You can close this tab and go back to the chat."]);
    } catch (e) {
      d.log?.(`career-connect callback failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
      await tell(d, link, linkId, `${c.label} wasn't connected: something went wrong on the way back from Google, so nothing was saved. Text "connect gmail" for a new link.`, now);
      return page(`${c.label} wasn't connected`, ["Something went wrong on the way back from Google, so nothing was saved. Ask Trainee for a new link by texting \"connect gmail\"."], 502);
    }
  }

  // The person's tap: use the token once and go to the provider.
  if (req.method === "POST") {
    const form = await req.formData().catch(() => null);
    const token = String(form?.get("t") ?? "");
    const peek = await d.admin.rpc("career_connect_link_peek", { p_nonce: token, p_now: new Date(now).toISOString() });
    const c = connectorOf(peek.data?.connector);
    if (peek.error || !peek.data || peek.data.status !== "ok" || !c) return page("This link can't be used", [GONE[peek.data?.status] ?? GONE.invalid], 400);
    const { id, secret: clientSecret } = client(c);
    if (!id || !clientSecret || !secret) return page("Not available yet", [`Connecting ${c.label} isn't switched on yet, so nothing was connected. Your link still works once it is.`], 503);
    const r = await d.admin.rpc("career_connect_link_open", { p_nonce: token, p_now: new Date(now).toISOString() });
    if (r.error || !r.data || r.data.error) return page("This link can't be used", [GONE[r.data?.error] ?? GONE.invalid], 400);
    // The consent asks only what may be asked now (google_scopes.ts): a scope deferred since the link was made is dropped.
    const scopes = c.requestable(r.data.scopes as string[], d.env).scopes;
    const to = c.consentUrl({ clientId: id, redirectUri: self, scopes, state: await issueState(String(r.data.link_id), secret, now) });
    return new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }

  // The link itself, opened (or fetched by a message preview): peek only.
  if (req.method === "GET" && url.searchParams.has("t")) {
    const token = url.searchParams.get("t") ?? "";
    const r = await d.admin.rpc("career_connect_link_peek", { p_nonce: token, p_now: new Date(now).toISOString() });
    const p = r.error ? { status: "invalid" } : r.data ?? { status: "invalid" };
    const c = connectorOf(p.connector);
    if (p.status !== "ok" || !c) return page("This link can't be used", [GONE[p.status] ?? GONE.invalid], 410);
    const whose = p.hint ? `the Trainee account ${p.hint}` : "the Trainee account you're chatting with";
    // The words Google verification wrote for the screen before consent (google_scopes.ts consentNotice).
    const n = c.notice(c.requestable(p.scopes ?? [], d.env).scopes);
    return page(`Connect ${c.label} to Trainee`, [
      `This connects your ${c.label} to ${whose}. Continue only if you asked Trainee for this link in the last 15 minutes.`,
      "With it, Trainee reads:", ...n.reads, ...n.never, ...n.undo,
    ], 200, { action: self, token, label: "Continue to Google" });
  }
  return page("Nothing here", ["Ask Trainee for a link by texting \"connect gmail\"."], 404);
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
