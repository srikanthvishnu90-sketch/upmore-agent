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
// PRESENTATION (channel_present.ts — the channel IS the product surface):
// replies render as Telegram HTML with structure intact (parse errors fall
// back to a plain send of the same content), a typing action shows while
// the agent works, document artifacts go out via sendDocument, and a batch
// approval card becomes a real inline keyboard whose taps resolve through
// the identical hash-bound approval the app client sends.
//
// Operator config (later, never in the repo): TELEGRAM_BOT_TOKEN,
// TELEGRAM_WEBHOOK_SECRET, TELEGRAM_ALLOWED_CHAT_IDS (comma list),
// CHANNEL_TEST_USER_ID (the only user test-phase senders resolve to),
// CHANNEL_APPROVAL_TTL_MIN (optional; approval-button lifetime).

import {
  ChannelDeps,
  NOT_AUTHORIZED_TEXT,
  json,
  resolveTestUser,
  runChannelApproval,
  runChannelTurnRich,
  sendParts,
  timingSafeEqual,
} from "./channel_bridge.ts";
import {
  VOICE,
  detectBatchCard,
  extractArtifacts,
  offerApproval,
  presentReply,
  takeApproval,
} from "./channel_present.ts";

export const TELEGRAM_LIMIT = 4096; // Telegram sendMessage text limit

// Recorded-shape parse: only a plain `message` update with text is an
// inbound text. Edited messages, channel posts, photos -> null (approval
// callbacks parse separately, below).
export function parseTelegramUpdate(raw: any): { chatId: string; text: string; messageId: string } | null {
  const msg = raw?.message;
  if (!msg || typeof msg.text !== "string" || !msg.chat?.id) return null;
  return {
    chatId: String(msg.chat.id),
    text: msg.text,
    messageId: msg.message_id != null ? String(msg.message_id) : "",
  };
}

// An approval-button tap arrives as a callback_query update carrying our
// opaque token in `data` — never the run id or the card hash.
export function parseTelegramCallback(raw: any): { callbackId: string; chatId: string; data: string } | null {
  const cb = raw?.callback_query;
  if (!cb || cb.id == null || typeof cb.data !== "string" || !cb.message?.chat?.id) return null;
  return { callbackId: String(cb.id), chatId: String(cb.message.chat.id), data: cb.data };
}

export function telegramSecretOk(headerValue: string | null, envSecret: string | undefined): boolean {
  if (!envSecret) return false; // fail closed: no configured secret, no webhook
  if (!headerValue) return false;
  return timingSafeEqual(headerValue, envSecret);
}

const chatIdValue = (chatId: string) => (/^-?\d+$/.test(chatId) ? Number(chatId) : chatId);

async function botApi(
  deps: ChannelDeps,
  token: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<any> {
  const res = await deps.fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok !== true) {
    throw new Error(`telegram ${method} failed HTTP ${res.status}: ${JSON.stringify(body).slice(0, 160)}`);
  }
  return body;
}

export function createTelegramSend(deps: ChannelDeps, token: string) {
  return async (chatId: string, text: string): Promise<void> => {
    await botApi(deps, token, "sendMessage", { chat_id: chatIdValue(chatId), text });
  };
}

const stripHtml = (s: string) =>
  s.replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&");

// Send one rendered (HTML) part. If Telegram rejects the markup, the SAME
// content goes out again as plain text — a rendering failure must never
// swallow the product's answer.
async function sendTelegramRendered(deps: ChannelDeps, token: string, chatId: string, html: string): Promise<void> {
  try {
    await botApi(deps, token, "sendMessage", { chat_id: chatIdValue(chatId), text: html, parse_mode: "HTML" });
  } catch (e) {
    if (!/parse|entit/i.test(String((e as Error)?.message ?? e))) throw e;
    await botApi(deps, token, "sendMessage", { chat_id: chatIdValue(chatId), text: stripHtml(html) });
  }
}

async function sendTelegramTyping(deps: ChannelDeps, token: string, chatId: string): Promise<void> {
  try {
    await botApi(deps, token, "sendChatAction", { chat_id: chatIdValue(chatId), action: "typing" });
  } catch { /* presence is cosmetic; never fail a turn over it */ }
}

async function answerTelegramCallback(deps: ChannelDeps, token: string, callbackId: string, text: string): Promise<void> {
  try {
    await botApi(deps, token, "answerCallbackQuery", { callback_query_id: callbackId, text });
  } catch { /* the resolution itself already happened or failed closed */ }
}

async function handleTelegramCallback(
  deps: ChannelDeps,
  cb: { callbackId: string; chatId: string; data: string },
  token: string,
): Promise<Response> {
  const send = token ? createTelegramSend(deps, token) : null;
  const userId = resolveTestUser(deps.env, "TELEGRAM_ALLOWED_CHAT_IDS", cb.chatId);
  if (!userId || !token) {
    if (token) await answerTelegramCallback(deps, token, cb.callbackId, VOICE.buttonForeign);
    return json({ ok: true, ignored: "unknown sender" });
  }
  const m = /^(appr|apprx):([0-9a-f]{16})$/.exec(cb.data);
  if (!m) {
    await answerTelegramCallback(deps, token, cb.callbackId, VOICE.buttonExpired);
    return json({ ok: true, ignored: "unknown callback" });
  }
  // Consume BEFORE any agent call: a retried callback webhook, a double
  // tap, or a tap on a superseded card can never approve twice.
  const taken = await takeApproval(deps, { channel: "telegram", senderKey: cb.chatId, token: m[2] });
  if (!taken.ok) {
    await answerTelegramCallback(deps, token, cb.callbackId, taken.reason === "foreign" ? VOICE.buttonForeign : VOICE.buttonExpired);
    return json({ ok: true, ignored: "approval not resolvable", reason: taken.reason });
  }
  const row = taken.row;
  if (m[1] === "apprx") {
    await answerTelegramCallback(deps, token, cb.callbackId, VOICE.approvalDeclined);
    if (send) await send(cb.chatId, VOICE.dismiss);
    return json({ ok: true, approval: "declined", run_id: row.run_id });
  }
  await answerTelegramCallback(deps, token, cb.callbackId, VOICE.approvalAck);
  let outcome;
  try {
    outcome = await runChannelApproval(deps, {
      userId: row.user_id,
      threadId: row.thread_id,
      runId: row.run_id,
      cardSha256: row.card_sha256,
      eventId: `tgcb-${row.token}`,
      turnKey: `tgcb-${row.token}`,
    });
  } catch (e) {
    console.error("telegram-inbound approval:", e);
    if (send) { try { await send(cb.chatId, VOICE.error); } catch { /* surfaced below */ } }
    return json({ ok: false, error: "internal" }, 500);
  }
  // The user sees the CORE's answer to the approval (recorded, or the
  // refusal for a moved card) — rendered like any other reply.
  const parts = presentReply("telegram", outcome.replyText || VOICE.empty, TELEGRAM_LIMIT);
  await sendParts(deps, parts, (part) => sendTelegramRendered(deps, token, cb.chatId, part));
  return json({ ok: true, approval: "resolved", run_id: row.run_id, parts_sent: parts.length });
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
    const token = deps.env("TELEGRAM_BOT_TOKEN") ?? "";

    const cb = parseTelegramCallback(raw);
    if (cb) return await handleTelegramCallback(deps, cb, token);

    const parsed = parseTelegramUpdate(raw);
    if (!parsed || !parsed.text.trim()) {
      return json({ ok: true, ignored: "not an inbound text message" });
    }

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

    if (token && !dryRun) await sendTelegramTyping(deps, token, parsed.chatId);

    let outcome;
    try {
      outcome = await runChannelTurnRich(deps, {
        channel: "telegram",
        senderKey: parsed.chatId,
        userId,
        text: parsed.text,
        messageId: parsed.messageId || null,
      });
    } catch (e) {
      console.error("telegram-inbound turn:", e);
      if (send && !dryRun) { try { await send(parsed.chatId, VOICE.error); } catch { /* response below still 500 */ } }
      return json({ ok: false, error: "internal" }, 500);
    }
    if (outcome.kind === "duplicate") return json({ ok: true, ignored: "duplicate webhook" });

    const parts = presentReply("telegram", outcome.replyText || VOICE.empty, TELEGRAM_LIMIT);
    if (dryRun) {
      const card = detectBatchCard(outcome.chat);
      return json({ ok: true, dry_run: true, channel: "telegram", thread_id: outcome.threadId, parts, ...(card ? { approval_run_id: card.runId } : {}) });
    }
    if (!send) {
      // Turn ran and persisted; only the outbound send is skipped (imessage
      // posture for a missing provider key). Still 200.
      console.warn("telegram-inbound: TELEGRAM_BOT_TOKEN not configured; send skipped.");
      return json({ ok: true, channel: "telegram", thread_id: outcome.threadId, parts_sent: 0, warning: "telegram token not configured" });
    }
    await sendParts(deps, parts, (part) => sendTelegramRendered(deps, token, parsed.chatId, part));

    // Documents as files (gap CHANNEL-DOC-1: inert on today's contract).
    for (const art of extractArtifacts(outcome.chat)) {
      try {
        await botApi(deps, token, "sendDocument", { chat_id: chatIdValue(parsed.chatId), document: art.url });
      } catch (e) {
        console.warn("telegram-inbound sendDocument failed:", String((e as Error)?.message ?? e).slice(0, 160));
      }
    }

    // A batch approval card becomes a real control: an inline keyboard
    // bound to a single-use token (the hash never leaves the server).
    let approvalOffered = false;
    const card = detectBatchCard(outcome.chat);
    if (card) {
      const offer = await offerApproval(deps, {
        channel: "telegram", senderKey: parsed.chatId, userId, threadId: outcome.threadId, runId: card.runId,
      });
      if (offer) {
        await botApi(deps, token, "sendMessage", {
          chat_id: chatIdValue(parsed.chatId),
          text: VOICE.approvalPrompt(card.runId),
          reply_markup: {
            inline_keyboard: [
              [{ text: VOICE.approveButton, callback_data: `appr:${offer.token}` }],
              [{ text: VOICE.declineButton, callback_data: `apprx:${offer.token}` }],
            ],
          },
        });
        approvalOffered = true;
      }
    }
    return json({ ok: true, channel: "telegram", thread_id: outcome.threadId, parts_sent: parts.length, ...(approvalOffered ? { approval_offered: true } : {}) });
  } catch (e) {
    console.error("telegram-inbound:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
}
