// GB-01 invite waves (migration 20261026220017_career_invite_waves.sql). Two halves:
//  - sendWave: the owner's approved send. It claims one invite at a time (career_invite_claim_send: approved by the owner,
//    not opted out, inside quiet hours), puts the person's own link into the template the owner approved by its sha256,
//    sends it through the given Send (LoopMessage), and records each result (career_invite_mark_sent). It checks the
//    gates first and every `gateEvery` sends; a failing gate closes the wave and stops. Nothing here runs on a schedule:
//    the owner runs it (scripts/launch/invite-wave.ts) after approving the exact text and count.
//  - the words a channel says when an invite is used (the inbound core, channel_inbound.ts, calls the store's redeem).
import type { Send } from "./channel.ts";

// Telegram's Start carries "inv_<token>" (Telegram's start parameter allows A-Z, a-z, 0-9, _ and -, up to 64).
export const INVITE_PAYLOAD = /^inv_([A-Za-z0-9_-]{32})$/;
export type InviteRefusal = "invalid" | "used" | "expired" | "stopped";
export const INVITE_REFUSED: Record<InviteRefusal, string> = {
  invalid: "That invite link isn't valid. Open the whole link from the text you got, or ask for a new invite.",
  used: "That invite was already used. If it was you, text Trainee from the chat you signed up in.",
  expired: "That invite has expired, so I can't set you up from it. Ask for a new invite.",
  stopped: "That number unsubscribed from Trainee, so its invite was cancelled.",
};
export const INVITE_ALREADY_MEMBER = "This chat already has a Trainee account, so the invite wasn't used. Text here any time.";

export interface Rpc { rpc(name: string, args?: Record<string, unknown>): Promise<{ data: any; error: { message: string } | null }> }
type Env = { get(k: string): string | undefined };

export async function sha256Hex(text: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

// The person's links. {link}: the web sign-up (TRAINEE_APP_URL/?invite=<token>); {telegram}: Telegram's Start
// (https://t.me/<TELEGRAM_BOT_USERNAME>?start=inv_<token>).
export function inviteLinks(env: Env, token: string): { link: string | null; telegram: string | null } {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new Error("invalid invite token");
  const app = (env.get("TRAINEE_APP_URL") || "").trim().replace(/\/+$/, "");
  const bot = (env.get("TELEGRAM_BOT_USERNAME") || "").trim().replace(/^@/, "");
  return {
    link: /^https:\/\/[^\s/?#]+/.test(app) ? `${app}/?invite=${token}` : null,
    telegram: /^[A-Za-z0-9_]{5,64}$/.test(bot) ? `https://t.me/${bot}?start=inv_${token}` : null,
  };
}
// The approved template with this person's links. A placeholder whose link is not configured is an error: the person
// never gets a message with a hole in it.
export function renderInvite(template: string, links: { link: string | null; telegram: string | null }): string {
  let out = template;
  for (const [key, value] of [["link", links.link], ["telegram", links.telegram]] as const) {
    if (!out.includes(`{${key}}`)) continue;
    if (!value) throw new Error(`NOT_WIRED: {${key}} is in the message but ${key === "link" ? "TRAINEE_APP_URL" : "TELEGRAM_BOT_USERNAME"} is not set`);
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

export interface WaveSendResult {
  sent: number; failed: number; stoppedBy: string | null; // why the run ended early: gates_failed, quiet_hours, not_approved, ...
  results: { invite: string; ok: boolean; error?: string }[];
}
export async function sendWave(o: {
  db: Rpc; wave: number; send: Send; env: Env; now: () => number; max?: number; gateEvery?: number;
}): Promise<WaveSendResult> {
  const out: WaveSendResult = { sent: 0, failed: 0, stoppedBy: null, results: [] };
  const gateEvery = Math.max(1, o.gateEvery ?? 50), max = o.max ?? Number.MAX_SAFE_INTEGER;
  const iso = () => new Date(o.now()).toISOString();
  const gatesFail = async () => {
    const r = await o.db.rpc("career_wave_recommendation", { p_now: iso() });
    if (r.error) throw new Error(`read the gates: ${r.error.message}`);
    if (r.data?.status !== "fail") return false;
    const failing = (r.data.gates ?? []).filter((g: any) => g.status === "fail").map((g: any) => g.gate).join(", ");
    const c = await o.db.rpc("career_wave_close", { p_wave: o.wave, p_reason: `a gate failed: ${failing}`, p_now: iso() });
    if (c.error) throw new Error(`close the wave: ${c.error.message}`);
    return true;
  };
  if (await gatesFail()) { out.stoppedBy = "gates_failed"; return out; }
  let n = 0;
  while (n < max) {
    if (n > 0 && n % gateEvery === 0 && await gatesFail()) { out.stoppedBy = "gates_failed"; break; }
    const c = await o.db.rpc("career_invite_claim_send", { p_wave: o.wave, p_now: iso() });
    if (c.error) throw new Error(`claim an invite: ${c.error.message}`);
    const job = c.data ?? {};
    if (job.done) break;
    if (job.stop) { out.stoppedBy = String(job.stop); break; }
    n++;
    let ok = false, providerId: string | null = null, error: string | null = null;
    try {
      // The claimed text is the approved template: its hash is checked here again before anything goes out.
      if (await sha256Hex(String(job.text ?? "")) !== job.text_sha256) throw new Error("the message is not the approved one");
      const text = renderInvite(String(job.text), inviteLinks(o.env, String(job.token ?? "")));
      const r = await o.send(String(job.phone), [text]);
      if (r.ok) { ok = true; providerId = r.id; } else error = r.error;
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
    const m = await o.db.rpc("career_invite_mark_sent", { p_invite: job.invite_id, p_ok: ok, p_provider_id: providerId, p_error: error, p_now: iso() });
    if (m.error) throw new Error(`record the send of ${job.invite_id}: ${m.error.message}`);
    if (ok) out.sent++; else out.failed++;
    out.results.push({ invite: String(job.invite_id), ok, ...(error ? { error } : {}) });
  }
  return out;
}
