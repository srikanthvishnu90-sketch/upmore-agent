// WO-101: the signed connect link (GET ?t=<token>) and the pages a Trainee consent ends on. No env reads and no I/O of
// its own: index.ts passes the token store and the OAuth settings, so tests drive it without a server or Google.
//
// The token is minted by the chat for the person of that turn (_shared/agent/integrations.ts mintConnectLink), stored only
// as its hash, and consumed here once (connect_link_consume). The OAuth state is signed for the user the TOKEN names; no
// query parameter can name a user.
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

// Trainee's own page: a light grey card, the wordmark in purple, the message in plum. No other product's name or link.
export function pageHtml(kind: PageKind): string {
  const p = PAGES[kind];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Trainee</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #FFFFFF; color: #4A2F5E;
    font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
  main { width: min(360px, calc(100vw - 32px)); box-sizing: border-box; padding: 28px 24px; border-radius: 18px; background: #F2F2F4; text-align: center; }
  .word { font: 400 30px/1 Georgia, "Times New Roman", serif; letter-spacing: 0.3px; color: #9B7BB8; margin: 0 0 18px; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
  p { margin: 0; color: #4A2F5E; opacity: 0.85; }
</style></head>
<body><main><div class="word">Trainee</div><h1>${p.title}</h1><p>${p.body}</p></main></body></html>`;
}
export function page(kind: PageKind): Response {
  return new Response(pageHtml(kind), {
    status: PAGES[kind].status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" },
  });
}

export interface LinkDeps {
  consume(token: string, purpose: string): Promise<{ user_id?: string; error?: string }>;
  clientId: string;
  stateSecret: string;
  redirectUri: string;
  now?: number;
}
// GET ?t=<token>: consume it once, then send that token's user to Google's consent for the career grant.
export async function startFromLink(token: string, d: LinkDeps): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return page("invalid");
  if (!d.clientId || !d.stateSecret) return page("unavailable");
  let r: { user_id?: string; error?: string };
  try {
    r = await d.consume(token, CONNECT_PURPOSE);
  } catch {
    return page("error");
  }
  if (r?.error === "expired") return page("expired");
  if (r?.error === "used") return page("used");
  if (!r?.user_id) return page("invalid");
  const url = await consentUrl({ userId: r.user_id, purpose: "career", clientId: d.clientId, stateSecret: d.stateSecret, redirectUri: d.redirectUri, now: d.now });
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
