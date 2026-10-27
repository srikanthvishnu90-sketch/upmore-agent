// Texts coming in over WhatsApp (WO-038), through Meta's Cloud API directly. Meta checks the endpoint with a GET (the
// verify token answers its challenge) and signs every POST with the app secret (X-Hub-Signature-256); one POST may carry
// several messages and status callbacks. Messages run through the same core as iMessage and Telegram
// (_shared/channel_inbound.ts); a "failed" status for the window (131047) or the per-user limit (131049) puts the message
// back to held, so the person's next message sends it whole.
import { handleChannelWebhook, turnKeyFor } from "../_shared/channel_inbound.ts";
import { mediaHosts } from "../_shared/sms_media.ts";
import { readWhatsAppMedia, type WaMedia, type WhatsAppInboundMessage } from "../_shared/whatsapp_media.ts";
import { whatsappAdapter } from "../_shared/whatsapp.ts";
import { type ProviderWebhookDeps, webhookDeps } from "../trainee-telegram/handler.ts";

// FEATURE 16 (a resume sent as a WhatsApp document): mediaFetch is the fetch for Meta's media requests (default: the runtime's);
// optedOut says whether a contact texted STOP (their documents are not fetched); WHATSAPP_MEDIA_HOSTS lists the hosts a media
// address may be on (exact names; unset: nothing is fetched).
export type WhatsAppDeps = ProviderWebhookDeps & { mediaFetch?: typeof fetch; mediaTimeoutMs?: number; optedOut?: (contact: string) => Promise<boolean> };
export async function handleWhatsApp(req: Request, d: WhatsAppDeps): Promise<Response> {
  const adapter = d.adapter ? d.adapter(d.env) : whatsappAdapter({
    token: d.env.get("WHATSAPP_TOKEN") || "", phoneNumberId: d.env.get("WHATSAPP_PHONE_NUMBER_ID") || "",
    appSecret: d.env.get("WHATSAPP_APP_SECRET") || "", verifyToken: d.env.get("WHATSAPP_VERIFY_TOKEN") || "", version: d.env.get("WHATSAPP_GRAPH_VERSION"),
  });
  // The documents of this POST by the turn key the core will give each (provider-scoped message id): fetched only when that
  // turn is about to run, as the person it belongs to. A STOPped contact's document is dropped before the message is claimed.
  const media = new Map<string, WaMedia>();
  const wrapped = { ...adapter, parseInbound: async (r: Request) => {
    const p = await adapter.parseInbound(r);
    if ("response" in p) return p;
    const keep = [];
    for (const m of p.messages) {
      const wm = (m as WhatsAppInboundMessage).waMedia;
      if (wm && d.optedOut && await d.optedOut(m.contact).catch(() => false)) continue;
      if (wm) media.set(await turnKeyFor(`${m.provider}:${m.messageId}`), wm);
      keep.push(m);
    }
    return { ...p, messages: keep, ignored: keep.length < p.messages.length ? [...(p.ignored ?? []), "opted out: the document was not opened"] : p.ignored };
  } };
  const deps = webhookDeps(wrapped, d);
  const plain = deps.chat;
  deps.chat = async (a) => {
    const wm = media.get(a.turnKey);
    if (!wm) return await plain(a);
    const got = await readWhatsAppMedia(wm, { token: d.env.get("WHATSAPP_TOKEN") || "", version: d.env.get("WHATSAPP_GRAPH_VERSION"), hosts: mediaHosts(d.env.get("WHATSAPP_MEDIA_HOSTS")), fetch: d.mediaFetch, timeoutMs: d.mediaTimeoutMs });
    if (!got.ok) { console.error(`whatsapp: document not read (${got.why})`); return { status: 200, reply: got.reply, threadId: a.threadId }; }
    return await plain({ ...a, file: got.upload });
  };
  return await handleChannelWebhook(req, wrapped, deps);
}
