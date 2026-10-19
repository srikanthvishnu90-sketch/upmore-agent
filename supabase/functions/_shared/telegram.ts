// Telegram inbound bridge for Trainee (TEST ONLY — mirrors imessage-inbound).
//
// Telegram Bot API webhook -> agent-chat -> sendMessage reply. Auth is the
// X-Telegram-Bot-Api-Secret-Token header ONLY, validated fail-closed against
// TELEGRAM_WEBHOOK_SECRET: Telegram cannot send our other bridges' ?secret=
// query pattern, and a query value must never authenticate this webhook
// (Ring lesson). verify_jwt is off for this ingress on purpose (Telegram
// sends no Supabase JWT); the webhook secret + the config-driven sender
// allowlist are the security boundary, same posture as imessage-inbound.
//
// Operator config (later, never in the repo): TELEGRAM_BOT_TOKEN,
// TELEGRAM_WEBHOOK_SECRET, TELEGRAM_ALLOWED_CHAT_IDS (comma list),
// CHANNEL_TEST_USER_ID (the only user test-phase senders resolve to).

import {
  ChannelDeps,
  NOT_AUTHORIZED_TEXT,
  json,
  resolveTestUser,
  runChannelTurn,
  sendParts,
  timingSafeEqual,
} from "./channel_bridge.ts";

export const TELEGRAM_LIMIT = 4096; // Telegram sendMessage text limit

// Recorded-shape parse: only a plain `message` update with text is an
// inbound text. Edited messages, channel posts, photos, callbacks -> null.
export function parseTelegramUpdate(raw: any): { chatId: string; text: string; messageId: string } | null {
  const msg = raw?.message;
  if (!msg || typeof msg.text !== "string" || !msg.chat?.id) return null;
  return {
    chatId: String(msg.chat.id),
    text: msg.text,
    messageId: msg.message_id != null ? String(msg.message_id) : "",
  };
}

export function telegramSecretOk(headerValue: string | null, envSecret: string | undefined): boolean {
  if (!envSecret) return false; // fail closed: no configured secret, no webhook
  if (!headerValue) return false;
  return timingSafeEqual(headerValue, envSecret);
}

export function createTelegramSend(deps: ChannelDeps, token: string) {
  return async (chatId: string, text: string): Promise<void> => {
    const res = await deps.fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: /^-?\d+$/.test(chatId) ? Number(chatId) : chatId, text }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.ok !== true) {
      throw new Error(`telegram sendMessage failed HTTP ${res.status}: ${JSON.stringify(body).slice(0, 160)}`);
    }
  };
}

export async function handleTelegramWebhook(req: Request, deps: ChannelDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    // Header-only secret gate, before any body parsing or processing.
    if (!telegramSecretOk(req.headers.get("x-telegram-bot-api-secret-token"), deps.env("TELEGRAM_WEBHOOK_SECRET"))) {
      return json({ error: "forbidden" }, 403);
    }
    const url = new URL(req.url);
    const raw = await req.json().catch(() => ({}));
    const dryRun = url.searchParams.get("dry_run") === "1" || raw?.dry_run === true;

    const parsed = parseTelegramUpdate(raw);
    if (!parsed || !parsed.text.trim()) {
      return json({ ok: true, ignored: "not an inbound text message" });
    }

    const token = deps.env("TELEGRAM_BOT_TOKEN") ?? "";
    const send = token ? createTelegramSend(deps, token) : null;

    const userId = resolveTestUser(deps.env, "TELEGRAM_ALLOWED_CHAT_IDS", parsed.chatId);
    if (!userId) {
      // Unknown sender: never reaches the agent. Silence is the bridge's
      // default posture (as imessage-inbound); a polite not-authorized reply
      // is sent only when CHANNEL_UNKNOWN_REPLY=1 is configured.
      if (deps.env("CHANNEL_UNKNOWN_REPLY") === "1" && send) {
        await send(parsed.chatId, NOT_AUTHORIZED_TEXT);
        return json({ ok: true, ignored: "unknown sender", notified: true });
      }
      return json({ ok: true, ignored: "unknown sender" });
    }

    const outcome = await runChannelTurn(deps, {
      channel: "telegram",
      senderKey: parsed.chatId,
      userId,
      text: parsed.text,
      messageId: parsed.messageId || null,
      limit: TELEGRAM_LIMIT,
    });
    if (outcome.kind === "duplicate") return json({ ok: true, ignored: "duplicate webhook" });

    if (dryRun) {
      return json({ ok: true, dry_run: true, channel: "telegram", thread_id: outcome.threadId, parts: outcome.parts });
    }
    if (!send) {
      // Turn ran and persisted; only the outbound send is skipped (imessage
      // posture for a missing provider key). Still 200.
      console.warn("telegram-inbound: TELEGRAM_BOT_TOKEN not configured; send skipped.");
      return json({ ok: true, channel: "telegram", thread_id: outcome.threadId, parts_sent: 0, warning: "telegram token not configured" });
    }
    await sendParts(deps, outcome.parts, (part) => send(parsed.chatId, part));
    return json({ ok: true, channel: "telegram", thread_id: outcome.threadId, parts_sent: outcome.parts.length });
  } catch (e) {
    console.error("telegram-inbound:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
}
