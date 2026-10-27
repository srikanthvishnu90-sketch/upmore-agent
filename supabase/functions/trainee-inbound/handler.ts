// Texts coming in over iMessage (WO-013b-2), as a function of its inputs so it is testable without a database, a provider
// or a model. LoopMessage posts every inbound text here. Since WO-038 the order and the rules live in the channel-neutral
// core (_shared/channel_inbound.ts runInbound) that WhatsApp and Telegram share; LoopMessage is one adapter
// (_shared/loopmessage_adapter.ts) and this handler keeps its inputs, outputs and tests exactly as they were: the secret,
// then the message id claimed (a retried webhook never runs a second turn), then STOP/START/HELP (answered and recorded
// before any account exists), then who may sign up (the owner's call; closed by default), then the turn through
// agent-chat as that person, whose reply goes out through the outbox so the daily contact cap and the at-most-once rule
// cover it.
import { equalSecret } from "../_shared/message_service.ts";
import type { Send } from "../_shared/channel.ts";
import { loopMessageAdapter } from "../_shared/loopmessage_adapter.ts";
import { runInbound, type InboundStore } from "../_shared/channel_inbound.ts";
import type { InboundUpload } from "../_shared/channel_adapters.ts";
import type { SmsInboundMessage } from "../_shared/loopmessage_adapter.ts";
import { mediaHosts, readSmsAttachments } from "../_shared/sms_media.ts";

export { CHAT_DOWN_REPLY, SIGNUP_CLOSED_REPLY, signupAllows, turnKeyFor } from "../_shared/channel_inbound.ts";
export type { InboundStore, Person } from "../_shared/channel_inbound.ts";
export interface InboundDeps {
  env: { get(k: string): string | undefined };
  now: () => number;
  store: () => InboundStore;
  send: (apiKey: string) => Send; // channel commands and the signup refusal go straight out: no account, no outbox row
  chat: (a: { userId: string; threadId: string | null; message: string; turnKey: string; replyToMessageId?: string | null; file?: InboundUpload | null }) => Promise<{ status: number; reply: string; threadId: string | null }>;
  // FEATURE 16 (a resume sent as a text attachment): the fetch for attachment addresses (default: the runtime's), and whether a
  // contact has texted STOP. The hosts an attachment may come from are LOOPMESSAGE_MEDIA_HOSTS (exact names; unset: none).
  mediaFetch?: typeof fetch;
  mediaTimeoutMs?: number;
  optedOut?: (contact: string) => Promise<boolean>;
  deliverReply: (a: { userId: string; key: string; apiKey: string; now: number }) => Promise<void>;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function handleInbound(req: Request, d: InboundDeps): Promise<Response> {
  // The door, as WO-013b-2 shipped it (the adapter's parse checks the same again).
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = d.env.get("TRAINEE_INBOUND_SECRET") || "";
  if (secret.length < 32) return json({ error: "not configured: TRAINEE_INBOUND_SECRET must be set, 32 characters or more" }, 503);
  const got = new URL(req.url).searchParams.get("secret") || req.headers.get("x-trainee-secret") || "";
  if (!equalSecret(got, secret)) return json({ error: "forbidden" }, 403);
  const apiKey = d.env.get("LOOPMESSAGE_API_KEY") || "";
  if (!apiKey) return json({ error: "NOT_WIRED: LOOPMESSAGE_API_KEY is not set; no turn was run" }, 503);
  const adapter = loopMessageAdapter({ apiKey, inboundSecret: secret, send: async (c, b) => await d.send(apiKey)(c, b) });
  const parsed = await adapter.parseInbound(req);
  if ("response" in parsed) return parsed.response;
  const msg = parsed.messages[0];
  if (!msg) return json({ ok: true, ignored: (parsed.ignored ?? [])[0] ?? "nothing to read" });
  const send = d.send(apiKey);
  // FEATURE 16: attachments. A contact who texted STOP gets nothing fetched and nothing run. Otherwise the turn is the core's
  // (message id claimed once, STOP/START, sign-up rules, the person's thread, the reply through the outbox) and the attachment
  // is fetched only when that turn is about to run, as the person it belongs to.
  const media = (msg as SmsInboundMessage).media ?? [];
  if (media.length && d.optedOut && await d.optedOut(msg.contact).catch(() => false)) return json({ ok: true, ignored: "opted out: the attachment was not opened" });
  const chat: InboundDeps["chat"] = !media.length ? d.chat : async (a) => {
    const got = await readSmsAttachments(media, { hosts: mediaHosts(d.env.get("LOOPMESSAGE_MEDIA_HOSTS")), fetch: d.mediaFetch, timeoutMs: d.mediaTimeoutMs });
    if (!got.ok) { console.error(`inbound: attachment not read (${got.why})`); return { status: 200, reply: got.reply, threadId: a.threadId }; }
    return await d.chat({ ...a, file: got.upload });
  };
  const r = await runInbound(msg, {
    env: d.env, now: d.now, store: d.store(), render: adapter.render, chat,
    reply: (contact, bubbles) => send(contact, bubbles),
    deliver: (a) => d.deliverReply({ userId: a.userId, key: a.key, apiKey, now: a.now }),
  });
  return json(r.body, r.status);
}
