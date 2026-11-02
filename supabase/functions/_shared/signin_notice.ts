// A new sign-in is told in the person's own chat (reqs Q509, Q717; calm, never urgent: Q510). Phone-number identity makes the code
// texted to that number the whole of sign-in security, so every sign-in to a Trainee page by a texted code queues ONE notice into
// the person's thread: when (their clock, the zone named), how (a code to their phone, its last two digits), and the one way to
// undo it from the chat they already trust ("sign out everywhere" ends every open page sign-in; the chat itself is the identity).
//
// Not for a Telegram Mini App opened from the Trainee chat: that sign-in is Telegram's own session in the very chat that would get
// the notice, so it would only repeat itself every time the list opens.
//
// Pure, apart from the store the caller passes. No model, no canned reply from a model: these are fixed system texts.
export const FALLBACK_ZONE = "America/Chicago";
const zoneOk = (tz: unknown): tz is string => {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
};
// "Sunday, Nov 1, 9:04 AM CST" in the person's zone; "(Chicago time)" when their zone is not known.
export function whenWords(at: number, tz?: string | null): string {
  const known = zoneOk(tz), zone = known ? tz as string : FALLBACK_ZONE;
  const p = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).formatToParts(new Date(at));
  const v = (k: string) => p.find((x) => x.type === k)?.value ?? "";
  return `${v("weekday")}, ${v("month")} ${v("day")}, ${v("hour")}:${v("minute")} ${v("dayPeriod")} ${v("timeZoneName")}${known ? "" : " (Chicago time)"}`;
}

export const SIGN_OUT_EVERYWHERE = /^(?:please )?sign ?out (?:of (?:trainee|my jobs page|the jobs page|my pages|trainee pages) )?everywhere(?: please)?[.!]*$/i;
export const signinKey = (sessionHash: string) => `status:signin:${sessionHash}`;
const SESSION_HASH = /^[0-9a-f]{64}$/;

// The notice. `phone` is the number the code went to ("+15125550100"); only its last two digits are said.
export function signinNoticeText(o: { at: number; tz?: string | null; phone: string | null }): string {
  const tail = String(o.phone ?? "").replace(/\D/g, "").slice(-2);
  const how = tail.length === 2 ? `with a code texted to your number ending in ${tail}` : "with a code texted to your phone";
  return `New sign-in to your Trainee jobs page: ${whenWords(o.at, o.tz)}, ${how}. If that was you, there's nothing to do. If it wasn't, reply "sign out everywhere" and every open Trainee page is signed out.`;
}
export function signedOutReply(n: number): string {
  return n > 0
    ? `Signed out everywhere: ${n === 1 ? "1 open Trainee page sign-in was" : `${n} open Trainee page sign-ins were`} ended. Opening a page again needs a new link and a new code. This chat is unchanged.`
    : "No Trainee page was signed in, so nothing changed. This chat is unchanged.";
}

export interface NoticeQueue { queue(userId: string, n: { key: string; text: string; at: number }): Promise<boolean> } // false: queued before
// Queue the notice for one new phone sign-in, once per session (its hash is the key). Never throws: a notice that cannot be queued
// is logged and the sign-in itself still stands.
export async function noticeSignin(q: NoticeQueue | undefined, o: { userId: string; sessionHash: string; at: number; tz?: string | null; phone: string | null }): Promise<boolean> {
  if (!q || !SESSION_HASH.test(o.sessionHash)) return false;
  try { return await q.queue(o.userId, { key: signinKey(o.sessionHash), text: signinNoticeText(o), at: o.at }); }
  catch (e) { console.error("sign-in notice not queued:", e instanceof Error ? e.message.slice(0, 120) : "error"); return false; }
}

// The career_outbox row (kind status: delivered into the person's thread on their channel, held in their quiet hours like any
// status text). One per key, ever.
// deno-lint-ignore no-explicit-any
export function supabaseNoticeQueue(admin: any): NoticeQueue {
  return {
    async queue(userId, n) {
      if (!/^status:signin:[0-9a-f]{64}$/.test(n.key)) throw new Error("a sign-in notice's key is status:signin:<session hash>");
      const got = await admin.from("career_outbox").insert({ user_id: userId, key: n.key, kind: "status", text: n.text.slice(0, 4000), deliver_at: new Date(n.at).toISOString() });
      if (got.error && (got.error.code === "23505" || /duplicate key/i.test(got.error.message))) return false;
      if (got.error) throw new Error(`queue the sign-in notice: ${got.error.message}`);
      return true;
    },
  };
}
