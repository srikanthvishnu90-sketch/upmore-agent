// WO-101: the signed connect link (GET ?t=<token> shows it, the person's POST uses it) and the pages a Trainee consent
// ends on. No env reads and no I/O of its own: index.ts passes the token store and the OAuth settings, so tests drive it
// without a server or Google.
//
// The token is minted by the chat for the person of that turn (_shared/agent/integrations.ts mintConnectLink), stored only
// as its hash, peeked at by GET (connect_link_peek) and consumed once by the person's POST (connect_link_consume).
// - GET never uses the token: Telegram, iMessage and WhatsApp fetch a link to build its preview as soon as it is delivered.
// - The GET page names the account by a masked hint before anyone consents, so a forwarded link shows whose Trainee
//   account the Gmail would join.
// - The OAuth state is signed for the user the TOKEN names; no query parameter can name a user.
import { issueState, scopesForPurpose, type Purpose } from "./career.ts";

export const CONNECT_PURPOSE = "connect_google_career";

// The Google consent URL for one user and purpose (the same one the POST start actions return).
export async function consentUrl(
  o: { userId: string; purpose: Purpose; clientId: string; stateSecret: string; redirectUri: string; now?: number },
): Promise<string> {
  const state = await issueState(o.userId, o.purpose, o.stateSecret, o.now);
  const q = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: scopesForPurpose(o.purpose).join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + q.toString();
}

export type PageKind = "connected" | "declined" | "expired" | "used" | "invalid" | "unavailable" | "error";
const PAGES: Record<PageKind, { status: number; title: string; body: string }> = {
  connected: { status: 200, title: "Gmail is connected to Trainee.", body: "You can close this tab and go back to the chat." },
  declined: { status: 200, title: "Gmail was not connected.", body: "You didn't allow access, so nothing changed. To try again, text Trainee \"connect my gmail\" for a new link." },
  expired: { status: 410, title: "This link has expired.", body: "Connect links work for 15 minutes. Text Trainee \"connect my gmail\" for a new one." },
  used: { status: 410, title: "This link was already used.", body: "Each connect link works once. Text Trainee \"connect my gmail\" for a new one." },
  invalid: { status: 400, title: "This link doesn't work.", body: "Text Trainee \"connect my gmail\" for a new one." },
  unavailable: { status: 503, title: "Connecting Gmail isn't available yet.", body: "Nothing changed. Please try again later." },
  error: { status: 500, title: "Gmail was not connected.", body: "Something went wrong on our side, and nothing was saved. Text Trainee \"connect my gmail\" to try again." },
};

// Trainee's own page: a light grey card, the wordmark in purple, the message in plum. No other product's name or link,
// no script. Every page is uncached and cannot be framed, so its "Continue" button cannot be clickjacked.
const HEADERS = {
  "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
};
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`); // text and double-quoted attributes
function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Trainee</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #FFFFFF; color: #4A2F5E;
    font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
  main { width: min(360px, calc(100vw - 32px)); box-sizing: border-box; padding: 28px 24px; border-radius: 18px; background: #F2F2F4; text-align: center; }
  .word { font: 400 30px/1 Georgia, "Times New Roman", serif; letter-spacing: 0.3px; color: #9B7BB8; margin: 0 0 18px; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
  p { margin: 0 0 8px; color: #4A2F5E; opacity: 0.85; }
  button { margin-top: 12px; padding: 12px 20px; border: 0; border-radius: 12px; background: #4A2F5E; color: #FFFFFF; font: inherit; font-weight: 600; cursor: pointer; }
</style></head>
<body><main><div class="word">Trainee</div><h1>${title}</h1>${bodyHtml}</main></body></html>`;
}
export function pageHtml(kind: PageKind): string {
  return shell(PAGES[kind].title, `<p>${PAGES[kind].body}</p>`);
}
export function page(kind: PageKind): Response {
  return new Response(pageHtml(kind), { status: PAGES[kind].status, headers: HEADERS });
}

// Only an already-masked hint is shown (connect_link_peek's "•••0101" or "c•••@example.com"); anything else, plain words.
const MASKED_PHONE = /^•••[0-9]{4}$/, MASKED_EMAIL = /^[A-Za-z0-9]•••@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
// The link's GET page: whose account this is, and a button that POSTs the token. Nothing is used until the person taps it.
export function confirmHtml(token: string, actionUrl: string, hint: string | null | undefined): string {
  const who = hint && MASKED_PHONE.test(hint) ? `the Trainee account that texts from ${hint}`
    : hint && MASKED_EMAIL.test(hint) ? `the Trainee account for ${hint}` : "the Trainee account you're texting from";
  return shell("Connect Gmail to Trainee?", `<p>This connects Gmail to ${esc(who)}.</p>
<p>Only continue if you asked Trainee for this link in the last 15 minutes.</p>
<form method="post" action="${esc(actionUrl)}"><input type="hidden" name="t" value="${esc(token)}"><button type="submit">Continue to Google</button></form>`);
}

type Peek = { status?: string; hint?: string | null };
export interface LinkDeps {
  peek(token: string, purpose: string): Promise<Peek>;
  consume(token: string, purpose: string): Promise<{ user_id?: string; error?: string }>;
  clientId: string;
  stateSecret: string;
  redirectUri: string; // the function's own public URL: Google's redirect and the form's action
  now?: number;
}
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const refusal = (s: string | undefined) => page(s === "expired" ? "expired" : s === "used" ? "used" : "invalid");

// The link's two requests, or null when the request is not the link's (the Google callback and the signed-in actions).
//   GET ?t=<token>   peeks only and shows whose account it is; message previews fetch it too, so it never uses the token.
//   POST t=<token>   a form body (a token in the query is ignored): consumes it once, then 303 to Google's consent for the
//                    career grant, with the state signed for the user the token names.
export async function handleLinkRequest(req: Request, d: LinkDeps): Promise<Response | null> {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.has("t") && !url.searchParams.has("code") && !url.searchParams.has("error")) {
    const token = url.searchParams.get("t") || "";
    if (!TOKEN_RE.test(token)) return page("invalid");
    if (!d.clientId || !d.stateSecret) return page("unavailable");
    let p: Peek;
    try { p = await d.peek(token, CONNECT_PURPOSE); } catch { return page("error"); }
    if (p?.status !== "ok") return refusal(p?.status);
    return new Response(confirmHtml(token, d.redirectUri, p.hint), { status: 200, headers: HEADERS });
  }
  if (req.method !== "POST" || !(req.headers.get("content-type") || "").toLowerCase().startsWith("application/x-www-form-urlencoded")) return null;
  const token = new URLSearchParams(await req.text()).get("t") || "";
  if (!TOKEN_RE.test(token)) return page("invalid");
  if (!d.clientId || !d.stateSecret) return page("unavailable");
  let r: { user_id?: string; error?: string };
  try { r = await d.consume(token, CONNECT_PURPOSE); } catch { return page("error"); }
  if (!r?.user_id) return refusal(r?.error);
  const to = await consentUrl({ userId: r.user_id, purpose: "career", clientId: d.clientId, stateSecret: d.stateSecret, redirectUri: d.redirectUri, now: d.now });
  return new Response(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
