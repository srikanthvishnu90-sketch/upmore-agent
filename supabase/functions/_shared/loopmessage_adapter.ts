// LoopMessage (iMessage) behind the channel interface (WO-038). Nothing about it changes: the same secret (?secret= or
// x-trainee-secret, 32+ characters), the same NOT_WIRED without the key, the same parse (loopmessage.ts parseLoopInbound),
// the same bubbles (toBubbles), one request per bubble (loopSend). Kept out of loopmessage.ts, which stays import-free so
// tests/trainee-go-live.test.cjs can load it on its own.
import type { Send } from "./channel.ts";
import { equalSecret } from "./message_service.ts";
import { normalizeContact, toBubbles } from "./conversation.ts";
import { loopSend, parseLoopInbound } from "./loopmessage.ts";
import type { ChannelAdapter, ParseResult } from "./channel_adapters.ts";

// The webhook's secret: LoopMessage sends the Authorization header set in its dashboard on every webhook ("You can
// configure the authorization header used for webhook requests via the dashboard"; "Your server should verify the
// validity of the authorization header for every event": https://loopmessage.com/apidocs/conversation-api-webhooks),
// as the value itself or "Bearer <value>"; ?secret= and x-trainee-secret still work (older setups, the smoke).
export function inboundSecretOf(req: Request): string {
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return new URL(req.url).searchParams.get("secret") || req.headers.get("x-trainee-secret") || auth || "";
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function loopMessageAdapter(o: { apiKey: string; inboundSecret?: string; dailyContacts?: number; send?: Send; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> }): ChannelAdapter {
  const send = o.send ?? loopSend({ apiKey: o.apiKey, fetch: o.fetch, sleep: o.sleep });
  return {
    channel: "imessage", provider: "loopmessage",
    limits: { chars: 5000, packChars: 700, perChatGapMs: 250, overallPerSecond: null, windowMs: null, dailyContacts: o.dailyContacts ?? null, dailyTemplates: null },
    capabilities: { buttons: false, documents: false, previews: true, templates: false },
    render: toBubbles,
    send: (address, bubbles) => send(address, bubbles),
    async parseInbound(req): Promise<ParseResult> {
      if (req.method !== "POST") return { response: json({ error: "Method not allowed" }, 405) };
      const secret = o.inboundSecret || "";
      if (secret.length < 32) return { response: json({ error: "not configured: TRAINEE_INBOUND_SECRET must be set, 32 characters or more" }, 503) };
      const got = inboundSecretOf(req);
      if (!equalSecret(got, secret)) return { response: json({ error: "forbidden" }, 403) };
      if (!o.apiKey) return { response: json({ error: "NOT_WIRED: LOOPMESSAGE_API_KEY is not set; no turn was run" }, 503) };
      const msg = parseLoopInbound(await req.json().catch(() => null));
      if (msg.kind === "ignored") return { messages: [], ignored: [msg.why] };
      if (msg.kind === "file") {
        // A file with no words (message_type "attachments"): not read here, but answered (channel_inbound FILE_NOT_READ_REPLY).
        if (!msg.messageId) return { messages: [], ignored: ["no message id, so a retry could not be told apart; nothing was run"] };
        let c: string;
        try { c = normalizeContact(msg.sender); } catch { return { messages: [], ignored: ["not a phone number or address"] }; }
        return { messages: [{ provider: "loopmessage", channel: "imessage", messageId: msg.messageId, kind: "seen", file: true, contact: c, address: c, phone: c.startsWith("+") ? c : null, text: "" }] };
      }
      if (!msg.messageId) return { messages: [], ignored: ["no message id, so a retry could not be told apart; nothing was run"] };
      let contact: string;
      try { contact = normalizeContact(msg.sender); } catch { return { messages: [], ignored: ["not a phone number or address"] }; }
      return { messages: [{ provider: "loopmessage", channel: "imessage", messageId: msg.messageId, kind: "text", contact, address: contact,
        // The documented reply thread (thread.initial_message_id: "First message ID to which 'reply to' was applied"),
        // matched against the ids LoopMessage gave the card's texts (loopSend returns every bubble's id). Documented,
        // not verified live; the card's code is what the card names on iMessage.
        replyToMessageId: msg.replyTo ?? null,
        phone: contact.startsWith("+") ? contact : null, text: msg.text }] };
    },
  };
}
