// WO-101: disconnecting Gmail, by text, only on the person's yes. Code's, like the cloud opt-in: the model never decides it.
//
// "disconnect gmail" asks one question and changes nothing. Only an explicit "yes" on the very next turn, while that
// question is the thread's last word and at most 10 minutes old, removes Trainee's Google grant: revoked at Google, the
// vault entry deleted, the connection row deleted. Every read and write names the person of this turn; nobody else's
// grant is ever read or touched. The reply says what was removed, and says so when Google did not confirm the revoke.
//
// Also here: whether a turn will get the router's Gmail connect reply, so the host mints a signed link only then.
import { disconnectPlan } from "../gmail-oauth/career.ts";

export const DISCONNECT_INTENT = "career_disconnect_ask";
export const DISCONNECT_TTL_MS = 10 * 60_000;
export const DISCONNECT_ASK = "Disconnect Gmail? Trainee will stop reading your job mail and can't draft from it. Reply yes to disconnect.";
const NOT_CONNECTED = "Gmail isn't connected to Trainee, so there's nothing to disconnect.";
const STALE = 'Nothing was disconnected. To disconnect Gmail, text "disconnect gmail" again, then reply yes.';

const norm = (t: string) => String(t ?? "").toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
export function isDisconnectGmail(text: string): boolean {
  return /^(please )?(disconnect|remove|revoke|unlink) (my )?(gmail|google|email|google account|gmail account)( from trainee)?( please)?$/.test(norm(text));
}
// Only an explicit yes: "ok" or "sure" are too easily a reply to something else.
const YES = /^yes(,? disconnect( it| gmail)?|,? please)?$/;

export type Revoked = { google: "revoked" | "not_confirmed" | "no_token"; removed: boolean };
export interface ConnectStore {
  connected(userId: string): Promise<boolean>;
  lastAssistant(threadId: string): Promise<{ intent: string | null; at: number | null }>;
  revoke(userId: string): Promise<Revoked>;
}

export async function disconnectTurn(
  o: { message: string; userId: string; threadId: string; now: number; store: ConnectStore },
): Promise<{ reply: string; status: string; intent: string } | null> {
  if (isDisconnectGmail(o.message)) {
    if (!(await o.store.connected(o.userId))) return { reply: NOT_CONNECTED, status: "not_connected", intent: "career_disconnect_none" };
    return { reply: DISCONNECT_ASK, status: "asked", intent: DISCONNECT_INTENT };
  }
  if (!YES.test(norm(o.message))) return null;
  const last = await o.store.lastAssistant(o.threadId);
  if (last.intent !== DISCONNECT_INTENT) return null; // a yes to something else is not ours
  if (last.at === null || !(o.now - last.at <= DISCONNECT_TTL_MS)) return { reply: STALE, status: "expired", intent: "career_disconnect_refused" };
  if (!(await o.store.connected(o.userId))) return { reply: "Gmail is already disconnected from Trainee.", status: "not_connected", intent: "career_disconnect_none" };
  const r = await o.store.revoke(o.userId);
  const removed = "Trainee deleted its saved Google sign-in token and its record of the connection, and it no longer reads your mail.";
  const reply = r.google === "revoked"
    ? `Gmail is disconnected. Google confirmed Trainee's access is revoked. ${removed}`
    : `Gmail is disconnected from Trainee. ${removed} Google didn't confirm the revoke, so you can also remove the access at myaccount.google.com/permissions.`;
  return { reply, status: r.google, intent: "career_disconnect_done" };
}

// True when the router (CareerAccess.handleChat) would answer this text with its Gmail connect reply. The probe runs the
// router's own routing over an empty context, which reads and writes nothing.
// deno-lint-ignore no-explicit-any
export function wantsConnectLink(access: any, text: string): boolean {
  try {
    return access?.handleChat?.(text, {})?.intent === "connect_google";
  } catch {
    return false;
  }
}

// The store over the edge function's service client. Every query is scoped to the one person.
// deno-lint-ignore no-explicit-any
export function supabaseConnectStore(admin: any, deps: { fetch: typeof fetch }): ConnectStore {
  const PROVIDER = "google_career";
  return {
    async connected(userId) {
      const { data, error } = await admin.from("user_oauth_connections").select("provider").eq("user_id", userId).eq("provider", PROVIDER).maybeSingle();
      if (error) throw new Error(`read the Google connection: ${error.message}`);
      return !!data;
    },
    async lastAssistant(threadId) {
      const { data, error } = await admin.from("agent_messages").select("meta,created_at").eq("thread_id", threadId).eq("role", "assistant")
        .order("id", { ascending: false }).limit(1);
      if (error) throw new Error(`read the last reply: ${error.message}`);
      const at = Date.parse(data?.[0]?.created_at ?? "");
      return { intent: data?.[0]?.meta?.intent ?? null, at: Number.isFinite(at) ? at : null };
    },
    async revoke(userId) {
      const plan = disconnectPlan(userId, PROVIDER);
      // The token to revoke: the refresh token revokes the whole grant; an access token is the fallback.
      let google: Revoked["google"] = "no_token";
      for (const name of plan.vault_names) {
        const { data } = await admin.rpc("oauth_vault_read", { p_name: name });
        let token: string | null = null;
        try { const s = JSON.parse(String(data ?? "")); token = s?.refresh_token || s?.access_token || null; } catch { token = null; }
        if (!token) continue;
        try {
          const res = await deps.fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }),
          });
          google = res.ok ? "revoked" : "not_confirmed";
        } catch {
          google = "not_confirmed";
        }
      }
      for (const name of plan.vault_names) {
        const { error } = await admin.rpc("oauth_vault_delete", { p_name: name });
        if (error) throw new Error("delete the Google token");
      }
      const { error } = await admin.from("user_oauth_connections").delete().eq("user_id", userId).in("provider", plan.providers);
      if (error) throw new Error(`delete the Google connection: ${error.message}`);
      return { google, removed: true };
    },
  };
}

// The same rules over memory, for the simulator and tests: connections by person, the thread's last word by thread.
export function memoryConnectStore(): ConnectStore & {
  connect(userId: string): void; setLast(threadId: string, intent: string | null, at: number): void; revoked: string[];
} {
  const conns = new Set<string>(), last = new Map<string, { intent: string | null; at: number }>(), revoked: string[] = [];
  return {
    revoked,
    connect: (u) => { conns.add(u); },
    setLast: (t, intent, at) => { last.set(t, { intent, at }); },
    connected: async (u) => conns.has(u),
    lastAssistant: async (t) => last.get(t) ?? { intent: null, at: null },
    revoke: async (u) => { conns.delete(u); revoked.push(u); return { google: "revoked", removed: true }; },
  };
}
