// Texts coming in over WhatsApp (WO-038), through Meta's Cloud API directly. Meta checks the endpoint with a GET (the
// verify token answers its challenge) and signs every POST with the app secret (X-Hub-Signature-256); one POST may carry
// several messages and status callbacks. Messages run through the same core as iMessage and Telegram
// (_shared/channel_inbound.ts); a "failed" status for the window (131047) or the per-user limit (131049) puts the message
// back to held, so the person's next message sends it whole.
import { handleChannelWebhook } from "../_shared/channel_inbound.ts";
import { whatsappAdapter } from "../_shared/whatsapp.ts";
import { type ProviderWebhookDeps, webhookDeps } from "../trainee-telegram/handler.ts";

export async function handleWhatsApp(req: Request, d: ProviderWebhookDeps): Promise<Response> {
  const adapter = d.adapter ? d.adapter(d.env) : whatsappAdapter({
    token: d.env.get("WHATSAPP_TOKEN") || "", phoneNumberId: d.env.get("WHATSAPP_PHONE_NUMBER_ID") || "",
    appSecret: d.env.get("WHATSAPP_APP_SECRET") || "", verifyToken: d.env.get("WHATSAPP_VERIFY_TOKEN") || "", version: d.env.get("WHATSAPP_GRAPH_VERSION"),
  });
  return await handleChannelWebhook(req, adapter, webhookDeps(adapter, d));
}
