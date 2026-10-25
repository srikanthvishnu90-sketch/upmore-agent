// Telegram as a texting channel (WO-038), over the Bot API. The official pages (core.telegram.org/bots/api,
// core.telegram.org/bots/faq) did not load from the build environment (DNS failure, proxy 403, 2026-10-20); each shape
// below is labeled with where it comes from, and the owner's smoke run checks them against the live bot.
//
// - Webhook: setWebhook's secret_token comes back on every update in X-Telegram-Bot-Api-Secret-Token, 1-256 of
//   A-Z a-z 0-9 _ - (SECONDARY: aiogram's mirror of https://core.telegram.org/bots/api#setwebhook).
// - Update: update_id is the update's unique id, the dedupe key (VERIFIED-S: https://core.telegram.org/bots/api#update).
//   message_id is unique only inside one chat, so it is never the key (ASSUMED: https://core.telegram.org/bots/api#message).
// - sendMessage: text 1-4,096 characters; no parse_mode, so the text is plain and nothing needs escaping (in MarkdownV2 an
//   unescaped "." fails the whole send); link_preview_options.is_disabled false keeps the preview of the first link
//   (ASSUMED field names: https://core.telegram.org/bots/api#sendmessage, #linkpreviewoptions).
// - Errors: {ok:false, error_code, description, parameters.retry_after}; 403 "Forbidden: bot was blocked by the user"
//   (SECONDARY) is the person's opt-out. A my_chat_member update whose new status is "kicked" is the same act, seen as it
//   happens (ASSUMED: https://core.telegram.org/bots/api#chatmemberupdated).
// - Pacing: no more than one message a second in one chat, about 30 a second overall (VERIFIED-S:
//   https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this).
// - Deep links: t.me/<bot>?start=<payload>, payload up to 64 of A-Z a-z 0-9 _ -, arrives as "/start <payload>"
//   (SECONDARY: https://core.telegram.org/bots/features#deep-linking).
// Only private chats are read; a group's messages are ignored.
import { equalSecret } from "./message_service.ts";
import { type ChannelAdapter, type InboundMessage, packMessages, pacer, type ParseResult, type SendResult } from "./channel_adapters.ts";

export const TELEGRAM_API = "https://api.telegram.org";
export const TELEGRAM_CHARS = 4096;
const PACK = 1500; // the texting rule: one message carries at most 1,500 characters, longer text is split on purpose
const SECRET_RE = /^[A-Za-z0-9_-]{32,256}$/;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function telegramDeepLink(botUsername: string, nonce: string): string {
  return `https://t.me/${botUsername.replace(/^@/, "")}?start=${nonce}`;
}

// A Telegram update as zero or one inbound message. Exported for tests and the smoke check.
// deno-lint-ignore no-explicit-any
export function parseTelegramUpdate(u: any): { message: InboundMessage | null; ignored?: string } {
  if (!u || typeof u !== "object" || !Number.isSafeInteger(u.update_id)) return { message: null, ignored: "not a Telegram update" };
  const messageId = String(u.update_id);
  const member = u.my_chat_member;
  if (member && typeof member === "object") {
    const chat = member.chat;
    if (chat?.type !== "private" || !Number.isSafeInteger(chat.id) || chat.id <= 0) return { message: null, ignored: "not a private chat" };
    if (member.new_chat_member?.status !== "kicked") return { message: null, ignored: `chat member status ${String(member.new_chat_member?.status ?? "").slice(0, 20)}` };
    return { message: { provider: "telegram", channel: "telegram", messageId, kind: "blocked", contact: `tg:${chat.id}`, address: String(chat.id), text: "" } };
  }
  const m = u.message;
  if (!m || typeof m !== "object") return { message: null, ignored: "not a new message" }; // edits, callbacks, channel posts
  if (m.chat?.type !== "private" || !Number.isSafeInteger(m.chat.id) || m.chat.id <= 0) return { message: null, ignored: "not a private chat" };
  if (m.from?.is_bot) return { message: null, ignored: "from a bot" };
  // SERIAL-1462: a reply in Telegram carries the replied-to message as message.reply_to_message (Bot API); its message_id
  // is the id sendMessage returned when that message went out.
  const repliedTo = m.reply_to_message && typeof m.reply_to_message === "object" && Number.isSafeInteger(m.reply_to_message.message_id) ? String(m.reply_to_message.message_id) : null;
  const base = { provider: "telegram" as const, channel: "telegram" as const, messageId, contact: `tg:${m.chat.id}`, address: String(m.chat.id), replyToMessageId: repliedTo };
  if (typeof m.text !== "string" || !m.text.trim()) return { message: { ...base, kind: "seen", text: "", file: !!(m.document || m.photo) }, ignored: "no text (attachments are not read yet)" };
  const cmd = /^\/(start|stop|help)(?:@[A-Za-z0-9_]{1,64})?(?:\s+(\S+))?\s*$/i.exec(m.text.trim());
  if (cmd) {
    const command = cmd[1].toLowerCase() as "start" | "stop" | "help";
    const payload = command === "start" && cmd[2] && /^[A-Za-z0-9_-]{1,64}$/.test(cmd[2]) ? cmd[2] : null;
    return { message: { ...base, kind: "text", text: m.text, command, startPayload: payload } };
  }
  return { message: { ...base, kind: "text", text: m.text } };
}

export function telegramAdapter(o: {
  token: string; webhookSecret?: string; fetch?: typeof fetch; timeoutMs?: number;
  clock?: () => number; sleep?: (ms: number) => Promise<void>;
}): ChannelAdapter {
  const f = o.fetch ?? fetch, timeout = o.timeoutMs ?? 15000;
  const pace = pacer({ perChatMs: 1000, overallPerSecond: 30, clock: o.clock, sleep: o.sleep });
  // The token rides in the URL; nothing that may be logged carries it.
  const redact = (s: string) => (o.token ? s.split(o.token).join("***") : s);
  const call = async (method: string, body: unknown): Promise<{ status: number; body: any } | { error: unknown }> => {
    try {
      const res = await f(`${TELEGRAM_API}/bot${o.token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      return { status: res.status, body: await res.json().catch(() => null) };
    } catch (e) { return { error: e }; }
  };
  return {
    channel: "telegram", provider: "telegram",
    limits: { chars: TELEGRAM_CHARS, packChars: PACK, perChatGapMs: 1000, overallPerSecond: 30, windowMs: null, dailyContacts: null, dailyTemplates: null },
    capabilities: { buttons: true, documents: true, previews: true, templates: false },
    render: (text) => packMessages(text, PACK),
    async parseInbound(req): Promise<ParseResult> {
      if (req.method !== "POST") return { response: json({ error: "Method not allowed" }, 405) };
      const secret = o.webhookSecret ?? "";
      if (!SECRET_RE.test(secret)) return { response: json({ error: "not configured: TELEGRAM_WEBHOOK_SECRET must be 32 to 256 of A-Z a-z 0-9 _ -" }, 503) };
      if (!equalSecret(req.headers.get("x-telegram-bot-api-secret-token") || "", secret)) return { response: json({ error: "forbidden" }, 403) };
      if (!o.token) return { response: json({ error: "NOT_WIRED: TELEGRAM_BOT_TOKEN is not set; no turn was run" }, 503) };
      const r = parseTelegramUpdate(await req.json().catch(() => null));
      return { messages: r.message ? [r.message] : [], ignored: r.ignored ? [r.ignored] : [] };
    },
    async send(address, bubbles): Promise<SendResult> {
      if (!bubbles.length) return { ok: false, error: "nothing to send: the message has no text", retryable: false };
      const ids: string[] = [];
      for (let i = 0; i < bubbles.length; i++) {
        await pace(address);
        const after = i ? ` after ${i} of ${bubbles.length} messages went out` : "";
        const r = await call("sendMessage", { chat_id: Number(address), text: bubbles[i].slice(0, TELEGRAM_CHARS), link_preview_options: { is_disabled: false } });
        if ("error" in r) {
          const e = r.error, timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
          return timedOut ? { ok: false, error: `Telegram timed out (it may have been delivered)${after}`, retryable: false }
            : { ok: false, error: redact(`Telegram unreachable: ${e instanceof Error ? e.message : String(e)}`).slice(0, 200) + after, retryable: i === 0 };
        }
        if (r.status === 200 && r.body?.ok === true) { const id = r.body?.result?.message_id; if (id !== undefined && id !== null) ids.push(String(id)); continue; }
        const desc = redact(String(r.body?.description ?? "")).slice(0, 120);
        if (r.status === 403 && /blocked|deactivated/i.test(desc)) return { ok: false, error: `Telegram 403: ${desc}${after}`, retryable: false, optOut: true };
        return { ok: false, error: `Telegram HTTP ${r.status}${desc ? `: ${desc}` : ""}${after}`, retryable: i === 0 && (r.status === 429 || r.status === 502 || r.status === 503) };
      }
      return { ok: true, id: ids[0] ?? null, ids };
    },
  };
}
