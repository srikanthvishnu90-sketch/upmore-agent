// LoopMessage as the texting channel's Send (WO-013b-1). The request shape is the one the owner's test bridge used live
// (2026-10-08..11): POST, the raw key in Authorization, body { contact, text }, one request per bubble, 250 ms apart so
// iMessage keeps their order. NOT verified against LoopMessage's documentation (unreachable from the build environment):
// the owner checks the fields and which statuses LoopMessage retries before go-live.
//
// Retry only when the message certainly did not go out: a connection that never opened, 429, 502, 503. A timeout, 500 or
// 504 may have been delivered, and a failure after the first bubble would resend the earlier ones, so those are final:
// the channel's rule is at most once, and a final failure is recorded, never silent.
import type { Send } from "./channel.ts";

export const LOOPMESSAGE_SEND_URL = "https://a.loopmessage.com/api/v1/message/send/";
const RETRYABLE_STATUS = new Set([429, 502, 503]);
const MAX_TEXT = 5000;

export function loopSend(o: { apiKey: string; fetch?: typeof fetch; pauseMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> }): Send {
  const f = o.fetch ?? fetch, pause = o.pauseMs ?? 250, timeout = o.timeoutMs ?? 15000;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  return async (contact, bubbles) => {
    if (!bubbles.length) return { ok: false, error: "nothing to send: the message has no text", retryable: false };
    let id: string | null = null;
    for (let i = 0; i < bubbles.length; i++) {
      if (i > 0) await sleep(pause);
      const after = i ? ` after ${i} of ${bubbles.length} bubbles went out` : "";
      let res: Response;
      try {
        res = await f(LOOPMESSAGE_SEND_URL, { method: "POST", headers: { Authorization: o.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ contact, text: bubbles[i].slice(0, MAX_TEXT) }), signal: AbortSignal.timeout(timeout) });
      } catch (e) {
        const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
        return timedOut ? { ok: false, error: `LoopMessage timed out (it may have been delivered)${after}`, retryable: false }
          : { ok: false, error: `LoopMessage unreachable: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200) + after, retryable: i === 0 };
      }
      if (!res.ok) {
        await res.body?.cancel();
        return { ok: false, error: `LoopMessage HTTP ${res.status}${after}`, retryable: i === 0 && RETRYABLE_STATUS.has(res.status) };
      }
      const body = await res.json().catch(() => null) as Record<string, unknown> | null;
      const got = body?.message_id ?? body?.id;
      if (id === null && (typeof got === "string" || typeof got === "number")) id = String(got);
    }
    return { ok: true, id };
  };
}
