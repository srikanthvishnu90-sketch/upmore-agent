// WhatsApp inbound bridge for Trainee (TEST ONLY — mirrors imessage-inbound),
// Twilio WhatsApp sandbox shape.
//
// Twilio posts a form-encoded webhook (From=whatsapp:+…, Body, MessageSid);
// authenticity is the X-Twilio-Signature header: base64(HMAC-SHA1(auth token,
// webhook URL + sorted form params)), validated fail-closed against
// TWILIO_AUTH_TOKEN. Replies go out through the Twilio Messages API.
// verify_jwt is off for this ingress on purpose (Twilio sends no Supabase
// JWT); the signature + the config-driven sender allowlist are the security
// boundary, same posture as imessage-inbound.
//
// Operator config (later, never in the repo): TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886),
// WHATSAPP_ALLOWED_NUMBERS (comma list), CHANNEL_TEST_USER_ID, and
// optionally TWILIO_WEBHOOK_URL when the public webhook URL differs from
// the request URL Twilio signed.
//
// PRODUCTION-PARITY FOLLOW-UP (not built here): the iMessage bridge's vendor,
// LoopMessage, also offers WhatsApp on the same account/API family. When
// WhatsApp graduates from the Twilio sandbox test surface to production, the
// parity move is a LoopMessage WhatsApp variant of this bridge (same vendor
// as imessage-inbound, same per-agent API-key posture) — a new sender +
// payload parser against this same shared turn core, not a rewrite.

import {
  ChannelDeps,
  NOT_AUTHORIZED_TEXT,
  digitsOf,
  json,
  resolveTestUser,
  runChannelTurn,
  sendParts,
  timingSafeEqual,
} from "./channel_bridge.ts";

export const WHATSAPP_LIMIT = 4096; // WhatsApp message text limit

export async function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): Promise<string> {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function twilioSignatureOk(
  authToken: string | undefined,
  url: string,
  params: Record<string, string>,
  headerValue: string | null,
): Promise<boolean> {
  if (!authToken || !headerValue) return false; // fail closed
  const expected = await twilioSignature(authToken, url, params);
  return timingSafeEqual(headerValue, expected);
}

export function parseForm(bodyText: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(bodyText)) out[k] = v;
  return out;
}

// Recorded-shape parse: an inbound WhatsApp message carries Body text and a
// whatsapp: From. Status callbacks (MessageStatus, no Body) parse to null.
export function parseWhatsappInbound(
  params: Record<string, string>,
): { senderKey: string; from: string; text: string; messageId: string } | null {
  const from = params.From ?? "";
  const text = params.Body ?? "";
  if (!from.startsWith("whatsapp:") || !text.trim()) return null;
  return {
    senderKey: digitsOf(from),
    from,
    text,
    messageId: params.MessageSid ?? "",
  };
}

export function createTwilioSend(
  deps: ChannelDeps,
  cfg: { accountSid: string; authToken: string; from: string },
) {
  return async (to: string, text: string): Promise<void> => {
    const res = await deps.fetchFn(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + btoa(`${cfg.accountSid}:${cfg.authToken}`),
        },
        body: new URLSearchParams({ From: cfg.from, To: to, Body: text }).toString(),
      },
    );
    if (!res.ok) {
      const eb = await res.text().catch(() => "");
      throw new Error(`twilio send failed HTTP ${res.status}: ${eb.slice(0, 160)}`);
    }
  };
}

export async function handleWhatsappWebhook(req: Request, deps: ChannelDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const params = parseForm(await req.text().catch(() => ""));
    // Signature gate, before any processing. Twilio signs the exact public
    // webhook URL; TWILIO_WEBHOOK_URL overrides when it differs from req.url.
    const hookUrl = deps.env("TWILIO_WEBHOOK_URL") ?? req.url;
    const ok = await twilioSignatureOk(
      deps.env("TWILIO_AUTH_TOKEN"),
      hookUrl,
      params,
      req.headers.get("x-twilio-signature"),
    );
    if (!ok) return json({ error: "forbidden" }, 403);

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "1";

    const parsed = parseWhatsappInbound(params);
    if (!parsed) return json({ ok: true, ignored: "not an inbound text message" });

    const accountSid = deps.env("TWILIO_ACCOUNT_SID") ?? "";
    const authToken = deps.env("TWILIO_AUTH_TOKEN") ?? "";
    const from = deps.env("TWILIO_WHATSAPP_FROM") ?? "";
    const send = accountSid && from
      ? createTwilioSend(deps, { accountSid, authToken, from })
      : null;

    const userId = resolveTestUser(deps.env, "WHATSAPP_ALLOWED_NUMBERS", parsed.senderKey);
    if (!userId) {
      // Unknown sender: never reaches the agent. Silence by default (the
      // bridge posture); polite not-authorized reply only when configured.
      if (deps.env("CHANNEL_UNKNOWN_REPLY") === "1" && send) {
        await send(parsed.from, NOT_AUTHORIZED_TEXT);
        return json({ ok: true, ignored: "unknown sender", notified: true });
      }
      return json({ ok: true, ignored: "unknown sender" });
    }

    const outcome = await runChannelTurn(deps, {
      channel: "whatsapp",
      senderKey: parsed.senderKey,
      userId,
      text: parsed.text,
      messageId: parsed.messageId || null,
      limit: WHATSAPP_LIMIT,
    });
    if (outcome.kind === "duplicate") return json({ ok: true, ignored: "duplicate webhook" });

    if (dryRun) {
      return json({ ok: true, dry_run: true, channel: "whatsapp", thread_id: outcome.threadId, parts: outcome.parts });
    }
    if (!send) {
      console.warn("whatsapp-inbound: TWILIO_ACCOUNT_SID/TWILIO_WHATSAPP_FROM not configured; send skipped.");
      return json({ ok: true, channel: "whatsapp", thread_id: outcome.threadId, parts_sent: 0, warning: "twilio sender not configured" });
    }
    await sendParts(deps, outcome.parts, (part) => send(parsed.from, part));
    return json({ ok: true, channel: "whatsapp", thread_id: outcome.threadId, parts_sent: outcome.parts.length });
  } catch (e) {
    console.error("whatsapp-inbound:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
}
