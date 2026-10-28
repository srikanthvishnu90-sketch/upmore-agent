// Signed, expiring, single-user link tokens for the hosted file pages (job match file, application proof file).
//
// The bot mints a token only for the person whose linked channel identity (Telegram phone share) it already resolved, so the
// token is never the first proof of who someone is; it is a capability for ONE person's ONE file. Nothing about the person is
// readable from it (the claims are an opaque user id, a card reference, a kind and two times), and every page read is scoped
// to the user id inside the signed claims, never to anything the browser adds. No password, no code typed anywhere.
//
//   v1.<base64url claims JSON>.<base64url HMAC-SHA-256("v1." + claims, TRAINEE_FILE_LINK_SECRET)>
export const FILE_TTL_MS = 24 * 3600_000;
export type FileKind = "match" | "proof";
export interface FileClaims { u: string; r: string; k: FileKind; i: number; e: number }
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

// null when no secret is configured (the bot then shows no link at all).
export async function mintFileToken(o: { secret: string | undefined; userId: string; ref: string; kind: FileKind; now: number; ttlMs?: number }): Promise<string | null> {
  if (!o.secret || o.secret.length < SECRET_MIN || !o.userId || !/^[0-9a-f]{12}$/.test(o.ref)) return null;
  const claims: FileClaims = { u: o.userId, r: o.ref, k: o.kind, i: o.now, e: o.now + Math.min(o.ttlMs ?? FILE_TTL_MS, 72 * 3600_000) };
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
  if (typeof c.u !== "string" || !c.u || !/^[0-9a-f]{12}$/.test(String(c.r)) || (c.k !== "match" && c.k !== "proof") || !Number.isFinite(c.i) || !Number.isFinite(c.e)) return { ok: false, why: "malformed" };
  if (now >= (c.e as number) || (c.i as number) > now + 60_000) return { ok: false, why: "expired" };
  return { ok: true, claims: c as FileClaims };
}

// The URL the bot puts under a card: <TRAINEE_FILE_BASE_URL>?t=<token>. Null unless both settings exist and the base is https.
export async function fileUrlFor(env: { get(k: string): string | undefined }, userId: string, ref: string, kind: FileKind, now: number): Promise<string | null> {
  const base = (env.get("TRAINEE_FILE_BASE_URL") || "").trim();
  if (!/^https:\/\/[^\s?#]+$/.test(base)) return null;
  const t = await mintFileToken({ secret: env.get("TRAINEE_FILE_LINK_SECRET"), userId, ref, kind, now });
  return t ? `${base}?t=${t}` : null;
}
