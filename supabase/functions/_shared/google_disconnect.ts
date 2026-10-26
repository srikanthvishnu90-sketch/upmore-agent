// Google verification (2026-10-26, review of PR #196): "disconnect gmail" really disconnects. One implementation for the
// chat ("disconnect gmail" in agent-chat, any channel) and for gmail-oauth's disconnect action:
//   1. every Google grant the person holds (provider google_career, and the legacy finance grant gmail) is revoked at
//      Google with its refresh token (else its access token): a 5-second timeout per call, up to 3 tries on a network
//      failure, a timeout, a 429 or a 5xx; only Google's 200 counts as revoked;
//   2. the stored tokens (Vault oauth_<provider>_<uid>) and the connection rows are deleted, every result checked;
//      deleting the google_career row also deletes the mail rows read from that Gmail (trigger 20261026200011);
//   3. the state is read back: no Google connection row and no mail-tracking row is left, or the result says what is.
// What the person is told (disconnectReply) is only what that read-back shows, in plain words; a revoke Google did not
// confirm is said so, with where to remove access by hand.
// deno-lint-ignore-file no-explicit-any

export const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_PROVIDERS = ["google_career", "gmail"] as const;
export const REVOKE_TIMEOUT_MS = 5000;
export const REVOKE_TRIES = 3;

// revoked: Google answered 200. refused: Google answered 400 (its error for a token it does not accept, which includes one
// already revoked; not a confirmation). not_confirmed: no answer after every try, or another status. no_token: nothing to send.
export type RevokeOutcome = "revoked" | "refused" | "not_confirmed" | "no_token";

export interface RevokeDeps {
  fetch: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  tries?: number;
}

async function postRevoke(d: RevokeDeps, token: string): Promise<"ok" | "refused" | "failed"> {
  const tries = Math.max(1, d.tries ?? REVOKE_TRIES);
  const sleep = d.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(500 * 2 ** (i - 1));
    try {
      const r = await d.fetch(GOOGLE_REVOKE, {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }), signal: AbortSignal.timeout(d.timeoutMs ?? REVOKE_TIMEOUT_MS),
      });
      await r.body?.cancel().catch(() => {});
      if (r.status === 200) return "ok";
      if (r.status === 400) return "refused";
      if (r.status !== 429 && r.status < 500) return "failed"; // another 4xx: trying again will not change it
    } catch { /* a network failure or the timeout: try again */ }
  }
  return "failed";
}

// The stored secret is the vault JSON {access_token, refresh_token, ...}. The refresh token revokes the whole grant; if
// Google refuses it, the access token is tried (revoking it also revokes its refresh token, per Google's OAuth docs).
export async function revokeAtGoogle(d: RevokeDeps, storedSecret: string | null | undefined): Promise<RevokeOutcome> {
  let tok: any = null;
  try { tok = JSON.parse(String(storedSecret ?? "")); } catch { return "no_token"; }
  const tokens = [tok?.refresh_token, tok?.access_token].filter((t) => typeof t === "string" && t.length > 0) as string[];
  if (!tokens.length) return "no_token";
  let refused = false;
  for (const t of tokens) {
    const r = await postRevoke(d, t);
    if (r === "ok") return "revoked";
    if (r === "refused") refused = true;
  }
  return refused ? "refused" : "not_confirmed";
}

export interface DisconnectResult {
  ok: boolean; // every Google row and token is gone and no mail-tracking row is left
  had: string[]; // the providers the person had connected
  revoke: Record<string, RevokeOutcome>;
  failures: string[]; // what could not be done, in plain words
}

// admin: a service-role supabase-js client.
export async function disconnectGoogle(admin: any, userId: string, d: RevokeDeps, providers: readonly string[] = GOOGLE_PROVIDERS): Promise<DisconnectResult> {
  const failures: string[] = [], revoke: Record<string, RevokeOutcome> = {};
  const rows = await admin.from("user_oauth_connections").select("provider").eq("user_id", userId).in("provider", [...providers]);
  if (rows.error) return { ok: false, had: [], revoke, failures: ["read which Google accounts are connected"] };
  const had: string[] = (rows.data ?? []).map((r: any) => String(r.provider));
  for (const p of had) {
    const name = `oauth_${p}_${userId}`;
    const v = await admin.rpc("oauth_vault_read", { p_name: name });
    revoke[p] = v.error ? "not_confirmed" : await revokeAtGoogle(d, typeof v.data === "string" ? v.data : null);
    if (v.error) failures.push("read the stored Google access to revoke it");
  }
  for (const p of had) {
    const del = await admin.rpc("oauth_vault_delete", { p_name: `oauth_${p}_${userId}` });
    if (del.error) failures.push("delete the stored Google tokens");
  }
  if (had.length) {
    const del = await admin.from("user_oauth_connections").delete().eq("user_id", userId).in("provider", had);
    if (del.error) failures.push("delete the Google connection");
  }
  // Read back what is left: the person is told what is true, not what was attempted.
  const left = await admin.from("user_oauth_connections").select("provider").eq("user_id", userId).in("provider", [...providers]);
  // Mail tracking reads only through the career grant, so its rows are checked when that grant was asked to go.
  const mail = providers.includes("google_career")
    ? await admin.from("career_mail_events").select("id").eq("user_id", userId).limit(1)
    : { data: [], error: null };
  if (left.error || mail.error) failures.push("check that everything was deleted");
  else {
    if ((left.data ?? []).length) failures.push("delete the Google connection");
    if ((mail.data ?? []).length) failures.push("delete the application updates read from your Gmail");
  }
  for (const p of had) {
    const still = await admin.rpc("oauth_vault_read", { p_name: `oauth_${p}_${userId}` });
    if (still.error) failures.push("check that everything was deleted");
    else if (still.data) failures.push("delete the stored Google tokens");
  }
  return { ok: failures.length === 0, had, revoke, failures: [...new Set(failures)] };
}

const PERMISSIONS = "myaccount.google.com/permissions";
export function disconnectReply(r: DisconnectResult): string {
  if (!r.had.length && r.ok) return "No Google account is connected to Trainee, so there was nothing to disconnect.";
  const outcomes = Object.values(r.revoke);
  const google = outcomes.length && outcomes.every((o) => o === "revoked")
    ? "Google confirmed Trainee's access is revoked."
    : `Google didn't confirm that Trainee's access is revoked, so please remove Trainee at ${PERMISSIONS} to be sure.`;
  if (!r.ok) {
    return `I couldn't finish disconnecting Gmail: I wasn't able to ${r.failures.join(", or ")}. ${google} Say "disconnect gmail" again to retry.`;
  }
  return `Gmail is disconnected. ${google} I deleted the stored access and the application updates I had read from your Gmail. Your application tracker and this chat keep their history. Say "connect gmail" any time to connect it again.`;
}

// The chat's ask: "disconnect gmail", "disconnect my google account", "remove access to gmail", "revoke gmail".
export const GOOGLE_DISCONNECT_RE = /^\s*(?:please\s+)?(?:disconnect|unlink|revoke|remove)\s+(?:access\s+to\s+|trainee\s+from\s+)?(?:my\s+)?(?:gmail|google(?:\s+account)?|google\s+mail)\b[\s.!]*$/i;
export function isGoogleDisconnect(text: string): boolean {
  return GOOGLE_DISCONNECT_RE.test(String(text ?? ""));
}
