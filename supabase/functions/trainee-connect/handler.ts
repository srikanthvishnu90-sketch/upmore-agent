// trainee-connect: the hosted account-connect page. Tests: tests/architect/connect-page.test.ts.
//
// The bot sends one short line and a link; the link opens this one page; the person does one thing (Continue with Google or
// Microsoft); the provider's own page takes the password (never this page, never the chat); the OAuth callback (gmail-oauth /
// outlook-oauth, unchanged redirect URIs) lands on a calm done state with a way back to Telegram.
//
// Login is the jobs page's (trainee-file): Telegram's signed Mini App initData mapped to the linked account, or the signed,
// expiring, single-use link (../_shared/connect_link.ts) exchanged once for an HttpOnly session cookie. Every read and action is
// scoped to the user id inside the verified claims; a user id in a form is never read.
import { CONNECT_SESSION_TTL_MS, connectSecret, mintConnectToken, reasonKey, verifyConnectToken } from "../_shared/connect_link.ts";
import { verifyInitData } from "../_shared/telegram_webapp.ts";
import { CONNECT_BOOT, CONNECT_SCRIPT, previewOg, renderBootstrap, renderConnect, renderDone, renderPreview, renderState, type PState, type ProviderId, type ProviderView } from "../_shared/connect_page.ts";

export type { ProviderId } from "../_shared/connect_page.ts";
export interface ProviderInfo { configured: boolean; scopes: string[] } // scopes: what the consent URL asks for, from the code that builds it
export interface ProviderState { state: PState; email: string | null }
export interface ConnectDeps {
  env: { get(k: string): string | undefined };
  now: () => number;
  providers(): Record<ProviderId, ProviderInfo>;
  status(userId: string): Promise<Record<ProviderId, ProviderState>>;
  start(provider: ProviderId, userId: string, channel: string): Promise<string | null>; // the provider's consent URL for this person, or null when it can't be made
  disconnect(provider: ProviderId, userId: string): Promise<{ ok: boolean; reply: string }>;
  claimLink(userId: string, jti: string, at: number): Promise<boolean>; // true only the first time a link token id is taken
  userOfTelegram?: (telegramId: string) => Promise<string | null>; // channel_contacts: 'tg:<id>' -> the linked account
}

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64 = (h: string) => btoa(h.match(/../g)!.map((x) => String.fromCharCode(parseInt(x, 16))).join(""));
const scriptHashes = (async () => `'sha256-${b64(await sha(CONNECT_SCRIPT))}' 'sha256-${b64(await sha(CONNECT_BOOT))}'`)();
const FRAMES = "https://web.telegram.org https://*.telegram.org";
async function headers(type: string): Promise<Record<string, string>> {
  return { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff", "content-type": type,
    "content-security-policy": `default-src 'none'; script-src ${await scriptHashes} https://telegram.org; connect-src 'self'; img-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'self' https://accounts.google.com https://login.microsoftonline.com; base-uri 'none'; frame-ancestors ${FRAMES}` };
}
const PROVIDERS: ProviderId[] = ["google", "microsoft"];
const CRAWLER = /TelegramBot|Twitterbot|facebookexternalhit|Slackbot|WhatsApp|Discordbot|LinkedInBot/i;
const cookieOf = (req: Request, name: string) => {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) { const [k, ...v] = part.trim().split("="); if (k === name) return v.join("="); }
  return "";
};
const NEW_LINK = "Ask Trainee in Telegram to connect your email again and open the new link.";

export async function handleConnect(req: Request, d: ConnectDeps): Promise<Response> {
  const html = async (body: string, status = 200, extra: Record<string, string> = {}) => new Response(body, { status, headers: { ...(await headers("text/html; charset=utf-8")), ...extra } });
  const json = async (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: await headers("application/json; charset=utf-8") });
  const botUrl = (d.env.get("TRAINEE_BOT_URL") || "").trim();
  const bot = /^https:\/\//.test(botUrl) ? botUrl : null;
  const state = (title: string, paras: string[], status: number) => html(renderState(title, paras, bot), status);
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") return state("Not supported", ["This page only opens and answers."], 405);
  const url = new URL(req.url);
  let fields: URLSearchParams = url.searchParams;
  if (req.method === "POST") { try { fields = new URLSearchParams(await req.text()); } catch { fields = new URLSearchParams(); } }
  const secret = connectSecret(d.env);
  const unavailable = (status = 503) => state("Not available yet", ["Connecting your email isn't switched on yet, so nothing was connected."], status);
  const bad = (why: string) => why === "not_configured" ? state("Links aren't set up yet", ["The connect page isn't switched on yet, so nothing can be opened. Nothing was connected."], 503)
    : why === "expired" ? state("This link has expired", ["Links last an hour so a forwarded one stops working. " + NEW_LINK], 410)
    : state("This link isn't valid", ["It may be cut short or changed. " + NEW_LINK], 403);

  let token = "";
  const given = fields.get("t") ?? "";
  if (req.method === "POST") {
    if (given) token = given; // a session token in a form field (never the single-use link)
    else {
      if (!fields.get("init")) return state("This link isn't valid", ["It may be cut short or changed. " + NEW_LINK], 403);
      // Mini App login: Telegram's signed initData, then the account that Telegram identity is linked to.
      const init = await verifyInitData(fields.get("init"), d.env.get("TELEGRAM_BOT_TOKEN"), d.now());
      if (!init.ok) {
        if (init.why === "not_configured") return state("Sign-in isn't set up yet", ["Telegram sign-in isn't switched on yet, so nothing can be opened. Nothing was connected."], 503);
        if (init.why === "stale") return state("This sign-in has expired", ["Close this screen and open the page again from Telegram."], 410);
        return state("Telegram couldn't verify this sign-in", ["Nothing was opened. Open the page again from the button in Telegram."], 403);
      }
      const user = d.userOfTelegram ? await d.userOfTelegram(init.telegramId).catch(() => null) : null;
      if (!user) return state("This Telegram account isn't linked", ["Share your phone number with Trainee in the Telegram chat first, then open this page again."], 403);
      const minted = await mintConnectToken({ secret, userId: user, reason: fields.get("w") ?? "", channel: "telegram", now: d.now(), ttlMs: CONNECT_SESSION_TTL_MS, kind: "s" });
      if (!minted) return state("Sign-in isn't set up yet", ["The page's link signing isn't switched on yet, so nothing can be opened."], 503);
      token = minted;
    }
  } else if (given) {
    // The link: taken ONCE, exchanged for an HttpOnly session cookie, then redirected to a clean URL. The token never stays in a URL.
    const c = await verifyConnectToken(given, secret, d.now());
    if (!c.ok) return bad(c.why);
    if (c.claims.k !== "l") return bad("malformed");
    if (CRAWLER.test(req.headers.get("user-agent") ?? "")) {
      // A link preview fetch must not use up the link: it gets the preview card and nothing about any person.
      return html(renderPreview(previewOg(c.claims.w)));
    }
    const first = await d.claimLink(c.claims.u, c.claims.j, d.now()).catch(() => null);
    if (first === null) return state("Couldn't open this just now", ["Nothing was used up. Try the link again in a minute."], 503);
    if (!first) return state("This link was already used", ["A link opens this page once, so a forwarded copy can't. " + NEW_LINK], 410);
    const session = await mintConnectToken({ secret, userId: c.claims.u, reason: c.claims.w, channel: c.claims.ch, now: d.now(), ttlMs: CONNECT_SESSION_TTL_MS, kind: "s" });
    if (!session) return bad("not_configured");
    return html("", 303, { location: url.pathname, "set-cookie": `tc_s=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(CONNECT_SESSION_TTL_MS / 1000)}` });
  } else {
    if (url.searchParams.has("w")) return html(renderBootstrap(url.searchParams.get("w") ?? "")); // the Mini App page: reads Telegram's signed data and posts it back
    token = cookieOf(req, "tc_s");
    if (!token) return state("This link isn't valid", ["It may be cut short or changed. " + NEW_LINK], 403);
  }

  const check = await verifyConnectToken(token, secret, d.now());
  if (!check.ok) return bad(check.why);
  if (check.claims.k !== "s") return bad("malformed");
  const claims = check.claims;
  const u = claims.u;
  const action = req.method === "POST" && !fields.get("init") ? (fields.get("action") ?? "") : "";
  const provider = fields.get("provider") ?? "";

  try {
    if (action) {
      if (!["start", "disconnect", "refresh"].includes(action)) return state("Not done", ["That is not something this page can do. Nothing was changed."], 400);
      if (action !== "refresh" && !PROVIDERS.includes(provider as ProviderId)) return state("Not done", ["That is not something this page can do. Nothing was changed."], 400);
      const p = provider as ProviderId;
      if (action === "start") {
        if (!d.providers()[p].configured) return unavailable();
        const to = await d.start(p, u, claims.ch);
        if (!to) return unavailable();
        if ((req.headers.get("accept") ?? "").includes("application/json")) return json({ url: to });
        return html("", 303, { location: to });
      }
      if (action === "disconnect") {
        const r = await d.disconnect(p, u);
        if (!r.ok) return state("Not disconnected", [r.reply, "Nothing is confirmed removed. Try again from this page."], 500);
        return html(renderDone({ outcome: "disconnected", provider: p, email: null, botUrl: bot, message: r.reply }));
      }
    }
    const info = d.providers(), st = await d.status(u);
    const providers: ProviderView[] = PROVIDERS.map((id) => ({ id, configured: info[id].configured, state: st[id].state, email: st[id].email, scopes: info[id].scopes }));
    return html(renderConnect({ token, reason: reasonKey(claims.w), providers, botUrl: bot }));
  } catch (e) {
    console.error("[trainee-connect]", String((e as Error)?.message ?? e).slice(0, 160));
    return state("Couldn't do that just now", ["Nothing was changed that I can confirm. Try again in a minute."], 503);
  }
}

// Where an OAuth callback (gmail-oauth, outlook-oauth) sends the person: the page's calm done state, with the way back to
// Telegram. Null until the owner has switched the connect page on (TRAINEE_CONNECT_BASE_URL), so the callbacks keep their own
// plain pages until then.
export function connectLanding(env: { get(k: string): string | undefined }, o: { provider: ProviderId; ok: boolean; denied: boolean; email: string | null }): Promise<Response> | null {
  const base = (env.get("TRAINEE_CONNECT_BASE_URL") || "").trim();
  if (!/^https:\/\/[^\s?#]+$/.test(base)) return null;
  const botUrl = (env.get("TRAINEE_BOT_URL") || "").trim();
  const outcome = o.ok ? "connected" : o.denied ? "denied" : "failed";
  return headers("text/html; charset=utf-8").then((h) => new Response(renderDone({ outcome, provider: o.provider, email: o.email, botUrl: /^https:\/\//.test(botUrl) ? botUrl : null }), { status: o.ok || o.denied ? 200 : 400, headers: h }));
}
