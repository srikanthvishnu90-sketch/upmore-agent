// LoopMessage as the texting channel's Send (WO-013b-1). POST https://a.loopmessage.com/api/v1/message/send/, the API key
// in Authorization, body { contact, text } ("contact" required: "Phone number or iMessage email"; text under 10,000
// characters), success 200 with message_id ("this does not mean that the message was delivered"), failure
// {success:false, code, message} with 400 or 402: VERIFIED 2026-10-26 against https://loopmessage.com/apidocs/send-message/.
// One request per bubble, 250 ms apart so iMessage keeps their order. Which HTTP statuses are safe to retry is not stated
// there; the rule below keeps the channel's at-most-once.
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
    const ids: string[] = [];
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
      if (typeof got === "string" || typeof got === "number") { if (id === null) id = String(got); ids.push(String(got)); }
    }
    // Every bubble's id: a reply in a thread names the bubble it was applied to (thread.initial_message_id).
    return { ok: true, id, ids };
  };
}

// An inbound webhook body. LoopMessage posts inbound messages AND delivery callbacks to the same webhook; only real
// inbound text reaches the agent. VERIFIED 2026-10-26 against https://loopmessage.com/apidocs/conversation-api-webhooks:
// the body is flat: event ("message_inbound", and also message_delivered, message_failed, message_reaction,
// inbound_call, ...), contact (the person: "a phone number or email address", E.164, emails lowercase), text,
// message_type (text, reaction, audio, attachments, sticker, location), message_id, webhook_id, attachments (download
// URLs, message_inbound only), thread {thread_id, initial_message_id} ("Present when the message belongs to a reply-to
// conversation thread"), group (an iMessage group). `sender` is "Dedicated sender name ID": Trainee's own sender, never
// the person, so it is never read as the contact. The older shape the owner's test bridge saw (alert_type, recipient) is
// still read. Only message_inbound runs anything: a reaction ("like") carries the reacted-to text and is not a message.
// A group message is not a conversation with one person and runs nothing.
export type LoopInbound =
  | { kind: "text"; text: string; sender: string; messageId: string | null; replyTo?: string | null }
  | { kind: "file"; sender: string; messageId: string | null }
  | { kind: "ignored"; why: string };
export function parseLoopInbound(raw: unknown): LoopInbound {
  // deno-lint-ignore no-explicit-any
  const b: any = raw && typeof raw === "object" ? raw : {};
  const event = String(b.event ?? b.alert_type ?? "").toLowerCase();
  if (event !== "message_inbound") return { kind: "ignored", why: event ? `not an inbound message (${event.slice(0, 40)})` : "no text (not a LoopMessage inbound message)" };
  if (b.group && typeof b.group === "object") return { kind: "ignored", why: "a group message (Trainee answers one person)" };
  const sender = b.contact ?? b.recipient ?? "";
  const id = b.message_id ?? null;
  const messageId = id === null || id === undefined || id === "" ? null : String(id).slice(0, 200);
  if (typeof sender !== "string" || !sender.trim()) return { kind: "ignored", why: "no sender" };
  const text = typeof b.text === "string" ? b.text : "";
  if (!text.trim()) {
    const files = Array.isArray(b.attachments) && b.attachments.length > 0;
    if (files || b.message_type === "attachments") return { kind: "file", sender, messageId };
    return { kind: "ignored", why: `no text (a ${String(b.message_type ?? "message").slice(0, 20)} message)` };
  }
  const t = b.thread && typeof b.thread === "object" ? b.thread.initial_message_id : null;
  const replyTo = typeof t === "string" && t ? t.slice(0, 200) : null;
  return { kind: "text", text, sender, messageId, replyTo };
}
