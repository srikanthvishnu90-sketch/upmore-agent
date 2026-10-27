// What the three inbound webhooks share at deploy time (WO-038): the turn through agent-chat as the person, and the head
// start that sends a just-queued answer at once through whichever channel adapters are wired. Tests inject fakes for both.
import { deliverDue } from "./channel.ts";
import { supabaseChannelStore } from "./channel_store.ts";
import { adaptersFromEnv } from "./channel_registry.ts";

// The turn runs as the person through agent-chat's service-role path, so history, erase, the host's STOP and pause,
// persistence and the hourly turn limit are the chat's own. The channel is never sent: the brain is channel-blind.
// agent-chat may answer with `parts` (a reply in several messages, each at most 4,000 characters: channel_inbound.ts
// replyParts); they are passed on as they are.
export function chatThroughAgent(url: string, key: string) {
  return async (a: { userId: string; threadId: string | null; message: string; turnKey: string; replyToMessageId?: string | null; replyChannel?: string | null }) => {
    const res = await fetch(`${url}/functions/v1/agent-chat`, {
      method: "POST", signal: AbortSignal.timeout(120000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // SERIAL-1462: the provider's reply-to id travels to the turn; a card's text yes counts only in reply to the card.
      body: JSON.stringify({ as_user_id: a.userId, message: a.message, turn_key: a.turnKey, ...(a.threadId ? { thread_id: a.threadId } : {}),
        ...(a.replyToMessageId ? { reply_to_message_id: a.replyToMessageId, ...(a.replyChannel ? { reply_to_channel: a.replyChannel } : {}) } : {}) }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.status === 429) return { status: 429, reply: String(body.message || "Slow down a little, then try again."), threadId: null };
    if (!res.ok) throw new Error(`agent-chat HTTP ${res.status}`);
    const parts = Array.isArray(body.parts) ? body.parts.filter((p): p is string => typeof p === "string") : undefined;
    const meta = body.meta && typeof body.meta === "object" ? body.meta as Record<string, unknown> : {};
    // The card this reply shows (career_apply_cards.ts puts its id on the reply's meta), so the outbox row is recorded against it.
    const cardId = typeof meta.card_id === "string" && meta.card_id ? meta.card_id : null;
    const resultStatus = typeof meta.result_status === "string" ? meta.result_status : null;
    return { status: res.status, reply: String(body.reply ?? ""), threadId: typeof body.thread_id === "string" ? body.thread_id : null, ...(parts ? { parts } : {}), ...(cardId ? { cardId } : {}), ...(resultStatus ? { resultStatus } : {}) };
  };
}

// One request's head-start sender. The adapters are made once per request, so the parts of one reply share Telegram's
// pacing (one message a second to a chat) instead of each part starting a fresh clock.
// key: one row (a reply, or one part of it); wholeUser: everything due for the person, oldest first (WhatsApp: what
// waited for the window, then the answer).
// deno-lint-ignore no-explicit-any
export function deliverer(admin: any, env: { get(k: string): string | undefined }) {
  let adapters: ReturnType<typeof adaptersFromEnv> | null = null;
  return async (a: { userId: string; key?: string; now: number; wholeUser?: boolean }) => {
    adapters ??= adaptersFromEnv(env);
    const store = supabaseChannelStore(admin, a.wholeUser ? { user: a.userId } : { only: { userId: a.userId, key: a.key! } });
    await deliverDue({ store, adapters, now: a.now, limit: a.wholeUser ? 40 : 1 });
    await store.release();
  };
}
