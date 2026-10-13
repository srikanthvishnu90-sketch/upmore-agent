// Career access layer for gmail-oauth (Appendix A, ACCS-001/002): pure helpers, no I/O, no env reads, no logging.
// Imported by index.ts as ./career.ts so the function still deploys standalone from its own directory.
//
// Two grants, two vault entries, two connection rows:
//   legacy  provider "gmail"         vault oauth_gmail_<uid>          scopes: gmail.readonly only (untouched)
//   career  provider "google_career" vault oauth_google_career_<uid>  scopes: gmail.readonly + gmail.send +
//           calendar.freebusy + calendar.events (the minimal career set; the user's own Gmail is THE send
//           rail, owner ruling 2026-10-12)
// The provider string is load-bearing: migration 20261012060000 requires vault_name = 'oauth_' || provider ||
// '_' || user_id and derives the vault name the same way on row delete, so "google_career" is the only
// provider value whose career vault entry the existing guard accepts and the cascade cleanup can find.

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const CALENDAR_FREEBUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";
export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const CAREER_SCOPES: string[] = [GMAIL_SCOPE, GMAIL_SEND_SCOPE, CALENDAR_FREEBUSY_SCOPE, CALENDAR_EVENTS_SCOPE];
export const CAREER_SCOPE_STRING = CAREER_SCOPES.join(" ");

export type Purpose = "gmail" | "career";
export const PURPOSES: Purpose[] = ["gmail", "career"];

export function purposeForAction(action: string): Purpose | null {
  if (action === "start") return "gmail";
  if (action === "start_career") return "career";
  return null;
}
export function providerForPurpose(purpose: Purpose): string {
  return purpose === "career" ? "google_career" : "gmail";
}
export function vaultNameFor(userId: string, purpose: Purpose): string {
  return `oauth_${providerForPurpose(purpose)}_${userId}`;
}
export function scopesForPurpose(purpose: Purpose): string[] {
  return purpose === "career" ? [...CAREER_SCOPES] : [GMAIL_SCOPE];
}

// ---- HMAC state (CSRF + user binding + purpose routing). Payload: <userId>.<exp>.<purpose> ----
// Legacy states issued before the career grant existed have no purpose segment (3 parts); they verify as
// purpose "gmail" so a consent started just before a deploy still lands.
function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret || ""),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}
export async function issueState(
  userId: string, purpose: Purpose, secret: string, now: number = Date.now(),
): Promise<string> {
  const exp = now + 10 * 60 * 1000;
  const payload = `${userId}.${exp}.${purpose}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}
export async function verifyState(
  state: string, secret: string, now: number = Date.now(),
): Promise<{ userId: string; purpose: Purpose }> {
  const parts = String(state || "").split(".");
  let userId = "", expS = "", purpose: Purpose = "gmail", sigB64 = "";
  if (parts.length === 3) [userId, expS, sigB64] = parts; // legacy, pre-career
  else if (parts.length === 4) {
    let p = "";
    [userId, expS, p, sigB64] = parts;
    if (!(PURPOSES as string[]).includes(p)) throw new Error("bad state purpose");
    purpose = p as Purpose;
  } else throw new Error("bad state");
  const exp = Number(expS);
  if (!userId || !Number.isFinite(exp) || now > exp) throw new Error("expired state");
  const payload = parts.length === 3 ? `${userId}.${exp}` : `${userId}.${exp}.${purpose}`;
  const sig = unb64url(sigB64);
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, new TextEncoder().encode(payload));
  if (!ok) throw new Error("bad state signature");
  // Canonical-encoding check: a base64url signature's last char carries spare bits, so a different string can
  // decode to the same bytes; re-encoding must reproduce the exact segment or the state is a forgery twin.
  if (b64url(sig) !== sigB64) throw new Error("bad state signature");
  return { userId, purpose };
}

// ---- Scopes / status (ACCS-002) ----
export function parseScopes(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).filter(Boolean);
  if (typeof input === "string") return input.split(/[\s,]+/).filter(Boolean);
  return [];
}
export type ScopeSet = "none" | "readonly" | "career" | "partial";
export function scopeSet(scopes: string[]): ScopeSet {
  if (!scopes.length) return "none";
  const has = (s: string) => scopes.includes(s);
  if (has(GMAIL_SEND_SCOPE) && has(CALENDAR_FREEBUSY_SCOPE) && has(CALENDAR_EVENTS_SCOPE)) return "career";
  if (scopes.length === 1 && has(GMAIL_SCOPE)) return "readonly";
  return "partial";
}

export interface ConnectionRow {
  provider: string;
  email?: string | null;
  scopes?: string | string[] | null;
  connected_at?: string | null;
}

// Per-source status from the user's connection rows. Backwards compatible: top-level connected/email keep
// meaning "the legacy gmail row" exactly as the pre-career status action returned them.
export function buildStatus(rows: ConnectionRow[]) {
  const by = new Map((rows || []).map((r) => [r.provider, r]));
  const legacy = by.get("gmail") || null;
  const career = by.get("google_career") || null;
  const legacyScopes = parseScopes(legacy?.scopes);
  const careerScopes = parseScopes(career?.scopes);
  const granted = [...new Set([...legacyScopes, ...careerScopes])];
  const gmailScopes = career ? careerScopes : legacyScopes;
  const calendarConnected = !!career && (careerScopes.includes(CALENDAR_FREEBUSY_SCOPE) || careerScopes.includes(CALENDAR_EVENTS_SCOPE));
  const email = career?.email ?? legacy?.email ?? null;
  return {
    connected: !!legacy,
    email: legacy?.email ?? null,
    gmail: {
      connected: !!(legacy || career),
      scope_set: career ? scopeSet(careerScopes) : legacy ? scopeSet(legacyScopes) : "none",
      can_read: gmailScopes.includes(GMAIL_SCOPE),
      can_send: gmailScopes.includes(GMAIL_SEND_SCOPE),
      email,
      scopes: gmailScopes,
      connected_at: (career || legacy)?.connected_at ?? null,
    },
    calendar: {
      connected: calendarConnected,
      can_freebusy: !!career && careerScopes.includes(CALENDAR_FREEBUSY_SCOPE),
      can_create_events: !!career && careerScopes.includes(CALENDAR_EVENTS_SCOPE),
      scopes: careerScopes.filter((s) => s.includes("/calendar")),
      connected_at: career?.connected_at ?? null,
    },
    career: {
      connected: !!career,
      provider: "google_career",
      email: career?.email ?? null,
      scopes: careerScopes,
      scope_set: scopeSet(careerScopes),
      connected_at: career?.connected_at ?? null,
    },
    legacy: {
      connected: !!legacy,
      provider: "gmail",
      email: legacy?.email ?? null,
      scopes: legacyScopes,
      scope_set: scopeSet(legacyScopes),
      connected_at: legacy?.connected_at ?? null,
    },
    granted_scopes: granted,
    connected_email: email,
    sources: [
      { source: "gmail", connected: !!(legacy || career), detail: career ? "career scopes (read + send)" : legacy ? "read-only" : "not connected" },
      { source: "calendar", connected: calendarConnected, detail: calendarConnected ? "free/busy + events via the career Google grant" : "not connected" },
    ],
  };
}

// ---- Disconnect per source (ACCS-002). A Google grant is atomic: the career grant is the only holder of the
// calendar scopes and of Gmail send, so removing "calendar" or career-Gmail means removing that grant; the
// legacy read-only row is a separate grant and survives unless it is itself the target (or "all").
export interface DisconnectPlan { source: string; providers: string[]; vault_names: string[]; also_affects: string[]; note: string | null }
export function disconnectPlan(userId: string, rawSource: string | undefined | null): DisconnectPlan {
  const source = String(rawSource || "gmail").toLowerCase().trim();
  const legacy = { provider: "gmail", vault: `oauth_gmail_${userId}` };
  const career = { provider: "google_career", vault: `oauth_google_career_${userId}` };
  if (source === "all") {
    return { source, providers: [legacy.provider, career.provider], vault_names: [legacy.vault, career.vault], also_affects: [], note: null };
  }
  if (source === "calendar") {
    return { source, providers: [career.provider], vault_names: [career.vault], also_affects: ["gmail_career"], note: "Calendar lives in the career Google grant, so disconnecting Calendar also removes Gmail send/read from that grant. A separate read-only Gmail connection, if you have one, stays." };
  }
  if (source === "google_career" || source === "career" || source === "google") {
    return { source: "google_career", providers: [career.provider], vault_names: [career.vault], also_affects: ["calendar"], note: "The career Google grant also held Calendar, so Calendar disconnects with it." };
  }
  // "gmail" (and the pre-career no-source call): the legacy grant only. Career Gmail is removed via "career".
  return { source: "gmail", providers: [legacy.provider], vault_names: [legacy.vault], also_affects: [], note: null };
}
