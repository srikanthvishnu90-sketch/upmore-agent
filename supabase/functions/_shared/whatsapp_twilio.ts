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
// PRESENTATION (channel_present.ts — the channel IS the product surface):
// replies render in WhatsApp's native markup (*bold*, _italic_, ~strike~,
// ```mono```, bare tappable links), document artifacts go out as media,
// and a batch approval card becomes numbered choices ("Reply 1 or 2")
// that resolve through the identical hash-bound approval the app client
// sends. PRODUCTION FOLLOW-UP (not built here): WhatsApp interactive
// buttons via Twilio Content Templates replace the numbered replies when
// WhatsApp leaves the sandbox — the resolution path (single-use token ->
// structured career_batch approve + exact message) does not change. The
// Twilio Messages API has no typing indicator; presence on this transport
// is limited to the reply itself (the LoopMessage variant below offers
// typing/read semantics).
//
// Operator config (later, never in the repo): TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886),
// WHATSAPP_ALLOWED_NUMBERS (comma list), CHANNEL_TEST_USER_ID, optionally
// TWILIO_WEBHOOK_URL when the public webhook URL differs from the request
// URL Twilio signed, CHANNEL_APPROVAL_TTL_MIN (approval-choice lifetime).
//
// PRODUCTION-PARITY FOLLOW-UP (not built here): the iMessage bridge's vendor,
// LoopMessage, also offers WhatsApp on the same account/API family. When
// WhatsApp graduates from the Twilio sandbox test surface to production, the
// parity move is a LoopMessage WhatsApp variant of this bridge (same vendor
// as imessage-inbound, same per-agent API-key posture) — a new sender +
// payload parser against this same shared turn core, not a rewrite.

import {
  type ChannelDeps,
  ChannelRateLimitError,
  NOT_AUTHORIZED_TEXT,
  digitsOf,
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
  peekApproval,
  presentReply,
  takeApproval,
} from "./channel_present.ts";
import { fetchArtifactBytes, signedArtifactUrl, verifyArtifactUrl } from "./channel_artifacts.ts";

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
  return async (to: string, text: string, mediaUrls?: string[]): Promise<void> => {
    const form: Record<string, string> = { From: cfg.from, To: to, Body: text };
    if (mediaUrls && mediaUrls.length) form.MediaUrl = mediaUrls[0];
    const res = await deps.fetchFn(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + btoa(`${cfg.accountSid}:${cfg.authToken}`),
        },
        body: new URLSearchParams(form).toString(),
      },
    );
    if (!res.ok) {
      const eb = await res.text().catch(() => "");
      throw new Error(`twilio send failed HTTP ${res.status}: ${eb.slice(0, 160)}`);
    }
  };
}

// CHANNEL-DOC-1 — the artifact media route. Twilio fetches the
// MediaUrl itself, so the bytes-ref contract becomes a SIGNED,
// EXPIRING URL on this very function: the signature binds (artifact,
// owner, expiry) and is verified before the Twilio signature gate's
// world is even entered — a GET is never an inbound message. Fails
// closed at every doubt: bad/absent signature or expired -> 403;
// validly signed but the artifact is gone or foreign -> 404; and no
// bytes ever leave without both checks passing.
async function serveArtifact(req: Request, deps: ChannelDeps): Promise<Response> {
  const v = await verifyArtifactUrl(deps.env, req.url);
  if (!v) return json({ error: "forbidden" }, 403);
  const got = await fetchArtifactBytes(deps.createAdmin(), { userId: v.userId, ref: v.ref });
  if (!got) return json({ error: "not found" }, 404);
  const safeName = got.filename.replace(/["\r\n]/g, "_");
  return new Response(got.bytes, {
    status: 200,
    headers: {
      "Content-Type": got.mime,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function handleWhatsappWebhook(req: Request, deps: ChannelDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method === "GET") return serveArtifact(req, deps);
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

    // Numbered-choice resolution: a bare "1"/"2" while a batch approval
    // offer is live for this sender is a choice on that card, resolved
    // through the identical structured approval as a Telegram button tap.
    // With no live offer, the same text is an ordinary message, untouched.
    const choice = /^\s*([12])\s*$/.exec(parsed.text);
    if (choice && !dryRun) {
      const pending = await peekApproval(deps, { channel: "whatsapp", senderKey: parsed.senderKey });
      if (pending) {
        // Consume BEFORE any agent call: a choice can never resolve twice.
        const taken = await takeApproval(deps, { channel: "whatsapp", senderKey: parsed.senderKey, token: pending.token });
        if (!taken.ok) {
          if (send) await send(parsed.from, VOICE.choiceExpired);
          return json({ ok: true, ignored: "approval not resolvable", reason: taken.reason });
        }
        const row = taken.row;
        if (choice[1] === "2") {
          if (send) await send(parsed.from, VOICE.dismiss);
          return json({ ok: true, approval: "declined", run_id: row.run_id });
        }
        let outcome;
        try {
          outcome = await runChannelApproval(deps, {
            userId: row.user_id,
            threadId: row.thread_id,
            runId: row.run_id,
            cardSha256: row.card_sha256,
            eventId: `wacb-${row.token}`,
            turnKey: `wacb-${row.token}`,
          });
        } catch (e) {
          console.error("whatsapp-inbound approval:", e);
          if (send) { try { await send(parsed.from, VOICE.error); } catch { /* surfaced below */ } }
          return json({ ok: false, error: "internal" }, 500);
        }
        const parts = presentReply("whatsapp", outcome.replyText || VOICE.empty, WHATSAPP_LIMIT);
        if (!send) {
          return json({ ok: true, channel: "whatsapp", approval: "resolved", parts_sent: 0, warning: "twilio sender not configured" });
        }
        await sendParts(deps, parts, (part) => send(parsed.from, part));
        return json({ ok: true, approval: "resolved", run_id: row.run_id, parts_sent: parts.length });
      }
    }

    let outcome;
    try {
      outcome = await runChannelTurnRich(deps, {
        channel: "whatsapp",
        senderKey: parsed.senderKey,
        userId,
        text: parsed.text,
        messageId: parsed.messageId || null,
      });
    } catch (e) {
      console.error("whatsapp-inbound turn:", e);
      if (e instanceof ChannelRateLimitError) {
        if (send && !dryRun) await send(parsed.from, VOICE.rateLimited);
        return json({ ok: false, error: "rate_limited", retry_after_seconds: e.retryAfterSeconds });
      }
      if (send && !dryRun) { try { await send(parsed.from, VOICE.error); } catch { /* response below still 500 */ } }
      return json({ ok: false, error: "internal" }, 500);
    }
    if (outcome.kind === "duplicate") return json({ ok: true, ignored: "duplicate webhook" });

    const parts = presentReply("whatsapp", outcome.replyText || VOICE.empty, WHATSAPP_LIMIT);
    if (dryRun) {
      const card = detectBatchCard(outcome.chat);
      return json({ ok: true, dry_run: true, channel: "whatsapp", thread_id: outcome.threadId, parts, ...(card ? { approval_run_id: card.runId } : {}) });
    }
    if (!send) {
      console.warn("whatsapp-inbound: TWILIO_ACCOUNT_SID/TWILIO_WHATSAPP_FROM not configured; send skipped.");
      return json({ ok: true, channel: "whatsapp", thread_id: outcome.threadId, parts_sent: 0, warning: "twilio sender not configured" });
    }
    await sendParts(deps, parts, (part) => send(parsed.from, part));

    // Documents as files (CHANNEL-DOC-1, landed). A bytes-ref artifact
    // goes out as media on a signed, expiring URL served by this
    // function itself (the GET route above) — owner-bound, minutes of
    // life, never a permanent public link; a legacy url artifact rides
    // as-is. When no URL can be minted (no signing secret configured)
    // nothing is sent and the failure is spoken instead.
    for (const art of extractArtifacts(outcome.chat)) {
      try {
        if (art.ref) {
          const base = `${deps.env("SUPABASE_URL") ?? ""}/functions/v1/whatsapp-inbound`;
          const mediaUrl = await signedArtifactUrl(deps.env, { base, ref: art.ref, userId });
          if (!mediaUrl) { await send(parsed.from, VOICE.docAttachFailed); continue; }
          await send(parsed.from, art.filename ?? "Document", [mediaUrl]);
        } else if (art.url) {
          await send(parsed.from, art.filename ?? "Document", [art.url]);
        }
      } catch (e) {
        console.warn("whatsapp-inbound media send failed:", String((e as Error)?.message ?? e).slice(0, 160));
      }
    }

    // A batch approval card becomes numbered choices on this channel.
    let approvalOffered = false;
    const card = detectBatchCard(outcome.chat);
    if (card) {
      const offer = await offerApproval(deps, {
        channel: "whatsapp", senderKey: parsed.senderKey, userId, threadId: outcome.threadId, runId: card.runId,
      });
      if (offer) {
        await send(parsed.from, `${VOICE.approvalPrompt(card.runId)}\n${VOICE.choiceFooter}`);
        approvalOffered = true;
      }
    }
    return json({ ok: true, channel: "whatsapp", thread_id: outcome.threadId, parts_sent: parts.length, ...(approvalOffered ? { approval_offered: true } : {}) });
  } catch (e) {
    console.error("whatsapp-inbound:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
}
