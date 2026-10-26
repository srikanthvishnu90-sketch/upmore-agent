// Texts coming in over Telegram (WO-038), as a function of its inputs so it is testable without a database, Telegram or a
// model. Telegram posts every update here (setWebhook with secret_token: docs/launch/TRAINEE-GO-LIVE.md). The door is
// Telegram's own secret header; the rest is the same core as iMessage and WhatsApp (_shared/channel_inbound.ts).
// FEATURE 16 (2026-10-26): with the service client (`admin`), a resume sent as a PDF or .docx is downloaded and read as
// the person's upload (channel_resume_upload.ts), and a tap on a card's Approve or Decline answers the card exactly as
// the web tap does (channel_card_tap.ts). Without it, both are said plainly and nothing is read or approved.
import { addressOf, type ChannelAdapter } from "../_shared/channel_adapters.ts";
import { handleChannelWebhook, type CoreDeps, type InboundStore } from "../_shared/channel_inbound.ts";
import { telegramAdapter } from "../_shared/telegram.ts";
import { ingestResumeFile, supabaseUploadRecorder } from "../_shared/channel_resume_upload.ts";
import { supabaseTapStore, tapCard } from "../_shared/channel_card_tap.ts";
import { supabaseEventStore } from "../_shared/agent/timeline.ts";

export interface ProviderWebhookDeps {
  env: { get(k: string): string | undefined };
  now: () => number;
  store: () => InboundStore;
  chat: CoreDeps["chat"];
  deliver: CoreDeps["deliver"];
  adapter?: (env: ProviderWebhookDeps["env"]) => ChannelAdapter; // tests inject one over a fake fetch
  // deno-lint-ignore no-explicit-any
  admin?: any; // FEATURE 16: the service client, for the resume file and the card's buttons
}
export function webhookDeps(adapter: ChannelAdapter, d: ProviderWebhookDeps): CoreDeps {
  const admin = d.admin;
  return {
    env: d.env, now: d.now, store: d.store(), render: adapter.render, chat: d.chat, deliver: d.deliver,
    reply: async (contact, bubbles, opts) => await adapter.send(addressOf(contact), bubbles, opts),
    ...(admin && adapter.fetchFile ? {
      resumeFile: async (a: Parameters<NonNullable<CoreDeps["resumeFile"]>>[0]) =>
        await ingestResumeFile({ userId: a.userId, channel: "telegram", doc: a.doc, fetchFile: (id, max) => adapter.fetchFile!(id, max), record: supabaseUploadRecorder(admin) }),
    } : {}),
    ...(admin ? { cardTap: async (a: { userId: string; data: string; now: number }) => await tapCard({ ...a, store: supabaseTapStore(admin), events: supabaseEventStore(admin) }) } : {}),
    ...(adapter.answerCallback ? { answerCallback: (id: string, text: string) => adapter.answerCallback!(id, text) } : {}),
  };
}

export async function handleTelegram(req: Request, d: ProviderWebhookDeps): Promise<Response> {
  const adapter = d.adapter ? d.adapter(d.env) : telegramAdapter({ token: d.env.get("TELEGRAM_BOT_TOKEN") || "", webhookSecret: d.env.get("TELEGRAM_WEBHOOK_SECRET") || "" });
  return await handleChannelWebhook(req, adapter, webhookDeps(adapter, d));
}
