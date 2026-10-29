// Signed, expiring, single-user link tokens for the hosted jobs list page.
//
// The bot mints a token only for the person whose linked Telegram identity (phone share) it already resolved, so the token is
// a capability for ONE person's ONE list, never the first proof of who someone is. The claims are opaque (user id, list id,
// two times); every page read is scoped to the user id inside the signed claims. No password, no code typed anywhere.
//
//   v1.<base64url claims JSON>.<base64url HMAC-SHA-256("v1." + claims, TRAINEE_FILE_LINK_SECRET)>
export const FILE_TTL_MS = 24 * 3600_000;
export const SESSION_TTL_MS = 2 * 3600_000; // a Mini App session, minted after Telegram's signed initData checks out
export interface FileClaims { u: string; r: string; i: number; e: number }
export type FileTokenCheck =
  | { ok: true; claims: FileClaims }
  | { ok: false; why: "malformed" | "bad_signature" | "expired" | "not_configured" };

const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => { const p = s.replace(/-/g, "+").replace(/_/g, "/"); return atob(p + "=".repeat((4 - (p.length % 4)) % 4)); };
async function sign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const SECRET_MIN = 24;
const LIST = /^[0-9a-f]{10}$/;

// null when no secret is configured (the bot then shows no link at all).
export async function mintFileToken(o: { secret: string | undefined; userId: string; list: string; now: number; ttlMs?: number }): Promise<string | null> {
  if (!o.secret || o.secret.length < SECRET_MIN || !o.userId || !LIST.test(o.list)) return null;
  const claims: FileClaims = { u: o.userId, r: o.list, i: o.now, e: o.now + Math.min(o.ttlMs ?? FILE_TTL_MS, 72 * 3600_000) };
  const body = b64(enc.encode(JSON.stringify(claims)));
  return `v1.${body}.${await sign(o.secret, `v1.${body}`)}`;
}

export async function verifyFileToken(token: unknown, secret: string | undefined, now: number): Promise<FileTokenCheck> {
  if (!secret || secret.length < SECRET_MIN) return { ok: false, why: "not_configured" };
  const m = /^v1\.([A-Za-z0-9_-]{10,1024})\.([A-Za-z0-9_-]{43})$/.exec(String(token ?? ""));
  if (!m) return { ok: false, why: "malformed" };
  if (!same(await sign(secret, `v1.${m[1]}`), m[2])) return { ok: false, why: "bad_signature" };
  let c: Partial<FileClaims>;
  try { c = JSON.parse(unb64(m[1])); } catch { return { ok: false, why: "malformed" }; }
  if (typeof c.u !== "string" || !c.u || !LIST.test(String(c.r)) || !Number.isFinite(c.i) || !Number.isFinite(c.e)) return { ok: false, why: "malformed" };
  if (now >= (c.e as number) || (c.i as number) > now + 60_000) return { ok: false, why: "expired" };
  return { ok: true, claims: c as FileClaims };
}

// What the bot sends: the Mini App URL (Telegram signs who opened it) and the signed-link fallback. Null for each unless
// TRAINEE_FILE_BASE_URL is https (and, for the link, the secret is set).
export async function feedUrlsFor(env: { get(k: string): string | undefined }, userId: string, list: string, now: number): Promise<{ webApp: string | null; url: string | null }> {
  const base = (env.get("TRAINEE_FILE_BASE_URL") || "").trim();
  if (!/^https:\/\/[^\s?#]+$/.test(base) || !LIST.test(list)) return { webApp: null, url: null };
  const t = await mintFileToken({ secret: env.get("TRAINEE_FILE_LINK_SECRET"), userId, list, now });
  return { webApp: env.get("TELEGRAM_BOT_TOKEN") ? `${base}?list=${list}` : null, url: t ? `${base}?t=${t}` : null };
}
