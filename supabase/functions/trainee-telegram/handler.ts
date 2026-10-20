// Texts coming in over Telegram (WO-038), as a function of its inputs so it is testable without a database, Telegram or a
// model. Telegram posts every update here (setWebhook with secret_token: docs/launch/TRAINEE-GO-LIVE.md). The door is
// Telegram's own secret header; the rest is the same core as iMessage and WhatsApp (_shared/channel_inbound.ts).
import { addressOf, type ChannelAdapter } from "../_shared/channel_adapters.ts";
import { handleChannelWebhook, type CoreDeps, type InboundStore } from "../_shared/channel_inbound.ts";
import { telegramAdapter } from "../_shared/telegram.ts";

export interface ProviderWebhookDeps {
  env: { get(k: string): string | undefined };
  now: () => number;
  store: () => InboundStore;
  chat: CoreDeps["chat"];
  deliver: CoreDeps["deliver"];
  adapter?: (env: ProviderWebhookDeps["env"]) => ChannelAdapter; // tests inject one over a fake fetch
}
export function webhookDeps(adapter: ChannelAdapter, d: ProviderWebhookDeps): CoreDeps {
  return {
    env: d.env, now: d.now, store: d.store(), render: adapter.render, chat: d.chat, deliver: d.deliver,
    reply: async (contact, bubbles) => await adapter.send(addressOf(contact), bubbles),
  };
}

export async function handleTelegram(req: Request, d: ProviderWebhookDeps): Promise<Response> {
  const adapter = d.adapter ? d.adapter(d.env) : telegramAdapter({ token: d.env.get("TELEGRAM_BOT_TOKEN") || "", webhookSecret: d.env.get("TELEGRAM_WEBHOOK_SECRET") || "" });
  return await handleChannelWebhook(req, adapter, webhookDeps(adapter, d));
}
