// Upmore iMessage test bridge (TEST ONLY).
//
// LoopMessage is a relay Apple can ban at any time; this bridge exists only
// so Vishnu can test the Upmore agent inside the Messages app. Production is
// the separate Apple Messages for Business track.
//
// One function serves both test agents; the agent is the trailing path
// segment:
//   POST /functions/v1/imessage-inbound/ruwe
//   POST /functions/v1/imessage-inbound/upmore
// Each LoopMessage sandbox account points its inbound webhook at its own URL,
// and replies go out through THAT account's API key — the streams never cross.
//
// Flow: verify sender is Vishnu -> load/create persistent thread ->
// agent-chat (service-role bearer + as_user_id) -> bubble-format reply ->
// LoopMessage send (skipped entirely in dry-run).
//
// Secrets (set via sb.py secrets-set once Vishnu provides the keys):
//   LOOPMESSAGE_RUWE_API_KEY, LOOPMESSAGE_UPMORE_API_KEY
// Until set, the function fails cleanly with "not configured" (no crash).
// Mandatory shared-secret gate (standard webhook pattern, like Stripe).
// The request must carry it as ?secret= or the x-imessage-secret header.
// verify_jwt is OFF for this ingress function on purpose: LoopMessage's
// webhook config cannot send custom Authorization headers, and the anon key
// is public by design (it ships in the web app) so it was never a real
// secret. The 256-bit secret + sender-number check below are the actual
// security boundary.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm";

const ALLOWED_SENDER_DIGITS = "12246029341"; // Vishnu's phone, E.164 digits
const BRIDGE_USER_ID = "c38e413f-6937-47bc-9e4a-5e19fafb3069"; // Vishnu's Upmore user id (identifier, not a secret)
const LOOPMESSAGE_SEND_URL = "https://a.loopmessage.com/api/v1/message/send/";
const MAX_BUBBLES = 4;
const BUBBLE_CHARS = 700;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function digitsOf(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

// Defensive inbound parsing. LoopMessage posts inbound messages AND
// delivery-status callbacks to the same webhook; only real inbound text
// should ever reach the agent. Candidate fields cover documented and
// observed shapes.
function parseInbound(raw: any): { event: string; text: string; sender: string; messageId: string | null } {
  const b = raw ?? {};
  const msg = b.message ?? b.data ?? b;
  const event = String(b.event ?? b.type ?? msg.event ?? msg.type ?? "").toLowerCase();
  const text = msg.text ?? msg.body ?? msg.content ?? b.text ?? b.body ?? "";
  const sender =
    msg.from ?? msg.sender ?? msg.contact ?? msg.phone ?? msg.from_number ??
    b.from ?? b.sender ?? b.contact ?? b.phone ?? "";
  const messageId = msg.message_id ?? msg.id ?? b.message_id ?? b.id ?? null;
  return {
    event,
    text: String(text ?? ""),
    sender: String(sender ?? ""),
    messageId: messageId ? String(messageId) : null,
  };
}

function isInboundText(event: string): boolean {
  if (!event) return true; // no event field: assume message, sender check still gates
  return /message|inbound|received/.test(event) && !/status|deliver|sent|read|typing/.test(event);
}

// ---- bubble formatting (own implementation) ----
// Short texting-sized bubbles on sentence boundaries; each bare URL gets its
// own bubble so iMessage renders a link preview card; at most 4 bubbles.
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const isLinkBubble = (s: string) => /^https?:\/\/\S+$/.test(s.trim());

function splitLong(text: string, max: number): string[] {
  const t = text.trim();
  if (t.length <= max) return [t];
  // Chunk on existing line breaks first (the model structures replies with
  // newlines), then word-wrap overlong lines. Cuts happen ONLY at spaces,
  // so numbers (15.49), domains (netflix.com) and URLs are never split.
  const out: string[] = [];
  for (const line of t.split("\n")) {
    let rest = line.trim();
    if (!rest) continue;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(" ", max);
      if (cut < max * 0.4) cut = max; // no good break: hard cut (rare)
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out.length ? out : [t.slice(0, max)];
}

function toBubbles(reply: string): string[] {
  // Strip hidden markers (exec-offer etc.) — they'd render as raw text in iMessage.
  const clean = reply.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!clean) return [];
  const urls = clean.match(URL_RE) ?? [];
  if (urls.length > 2) return splitLong(clean, BUBBLE_CHARS).slice(0, MAX_BUBBLES);
  const raw: string[] = [];
  for (const para of clean.split(/\n\s*\n/)) {
    let buf = "";
    const flush = () => {
      const t = buf.trim();
      if (t) raw.push(t);
      buf = "";
    };
    for (const line of para.split("\n")) {
      const lineUrls = line.match(URL_RE);
      if (!lineUrls) {
        buf += (buf ? "\n" : "") + line;
        continue;
      }
      let rest = line;
      for (const u of lineUrls) {
        const i = rest.indexOf(u);
        const before = rest.slice(0, i).replace(/[\s:–—-]+$/, "").trim();
        if (before) buf += (buf ? "\n" : "") + before;
        flush();
        raw.push(u);
        rest = rest.slice(i + u.length).replace(/^[\s.,;)]+/, "");
      }
      if (rest.trim()) buf += (buf ? "\n" : "") + rest.trim();
    }
    flush();
  }
  const sized: string[] = [];
  for (const b of raw) {
    if (isLinkBubble(b) || b.length <= BUBBLE_CHARS) sized.push(b);
    else sized.push(...splitLong(b, BUBBLE_CHARS));
  }
  while (sized.length > MAX_BUBBLES) {
    let k = -1;
    for (let i = 0; i < sized.length - 1; i++) {
      if (!isLinkBubble(sized[i]) && !isLinkBubble(sized[i + 1])) {
        k = i;
        break;
      }
    }
    if (k < 0) break;
    sized.splice(k, 2, sized[k] + "\n\n" + sized[k + 1]);
  }
  return sized;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const url = new URL(req.url);
    const m = url.pathname.match(/\/imessage-inbound\/(ruwe|upmore)\/?$/);
    if (!m) {
      return json(
        { error: "unknown agent; use /imessage-inbound/ruwe or /imessage-inbound/upmore" },
        404,
      );
    }
    const agent = m[1];

    // Mandatory shared-secret gate. Unauthenticated callers get 403 before
    // any body parsing or processing happens.
    const webhookSecret = Deno.env.get("IMESSAGE_WEBHOOK_SECRET") ?? "";
    const got = url.searchParams.get("secret") ?? req.headers.get("x-imessage-secret") ?? "";
    if (!webhookSecret || got !== webhookSecret) return json({ error: "forbidden" }, 403);

    const raw = await req.json().catch(() => ({}));
    const dryRun = url.searchParams.get("dry_run") === "1" || raw.dry_run === true;

    const { event, text, sender, messageId } = parseInbound(raw);
    if (!isInboundText(event) || !text.trim()) {
      return json({ ok: true, ignored: "not an inbound text message" });
    }
    if (digitsOf(sender) !== ALLOWED_SENDER_DIGITS) {
      return json({ ok: true, ignored: "unknown sender" });
    }

    const apiKey =
      Deno.env.get(agent === "ruwe" ? "LOOPMESSAGE_RUWE_API_KEY" : "LOOPMESSAGE_UPMORE_API_KEY") ?? "";
    if (!apiKey && !dryRun) {
      return json({
        ok: false,
        error: "not configured",
        detail: `Set secret ${agent === "ruwe" ? "LOOPMESSAGE_RUWE_API_KEY" : "LOOPMESSAGE_UPMORE_API_KEY"} (sb.py secrets-set), then have Vishnu add this webhook URL in that agent's LoopMessage dashboard.`,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Persistent thread mapping per (agent, phone); webhook dedup on message id.
    // The message id is CLAIMED before doing any work: a retried webhook with
    // the same id is ignored even if the first attempt crashed mid-turn
    // (standard at-least-once handling; a crashed turn simply gets no reply
    // rather than a duplicated one).
    let threadId: string | null = null;
    {
      const { data: row } = await admin
        .from("imessage_threads")
        .select("thread_id, last_message_id")
        .eq("agent", agent)
        .eq("phone", ALLOWED_SENDER_DIGITS)
        .maybeSingle();
      if (row?.thread_id) {
        threadId = row.thread_id as string;
        if (messageId && row.last_message_id === messageId) {
          return json({ ok: true, ignored: "duplicate webhook" });
        }
      }
      if (!threadId) {
        const { data: th, error: thErr } = await admin
          .from("agent_threads")
          .insert({ user_id: BRIDGE_USER_ID, title: `iMessage (${agent})` })
          .select("id")
          .single();
        if (thErr || !th) throw new Error("thread create failed: " + (thErr?.message ?? "unknown"));
        threadId = th.id as string;
      }
      await admin.from("imessage_threads").upsert(
        {
          agent,
          phone: ALLOWED_SENDER_DIGITS,
          thread_id: threadId,
          last_message_id: messageId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "agent,phone" },
      );
    }

    // Ask the agent brain. Service-role bearer + as_user_id: agent-chat runs
    // the whole turn as Vishnu (see its TEST BRIDGE block).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    let chat: any;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/agent-chat`, {
        method: "POST",
        // NOTE: send ONLY the Authorization header. The gateway rejects
        // requests where `apikey` and `Authorization` carry different keys
        // ("Conflicting API keys"); the service_role bearer alone passes
        // verify_jwt and is recognized by agent-chat's bridge check.
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text.slice(0, 4000),
          thread_id: threadId,
          as_user_id: BRIDGE_USER_ID,
        }),
        signal: ctrl.signal,
      });
      chat = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`agent-chat HTTP ${res.status}: ${JSON.stringify(chat).slice(0, 200)}`);
    } finally {
      clearTimeout(timer);
    }
    if (chat.error) throw new Error("agent-chat: " + String(chat.error).slice(0, 200));
    if (chat.thread_id && String(chat.thread_id) !== threadId) {
      threadId = String(chat.thread_id);
      await admin.from("imessage_threads").upsert(
        {
          agent,
          phone: ALLOWED_SENDER_DIGITS,
          thread_id: threadId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "agent,phone" },
      );
    }
    const replyText = String(chat.reply ?? "").trim();
    const bubbles = toBubbles(replyText || "(I didn't get a reply — try again.)");

    if (dryRun) {
      return json({ ok: true, dry_run: true, agent, thread_id: threadId, bubbles });
    }

    const contact = "+1" + ALLOWED_SENDER_DIGITS;
    for (let i = 0; i < bubbles.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 600));
      const sres = await fetch(LOOPMESSAGE_SEND_URL, {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ contact, text: bubbles[i].slice(0, 5000) }),
      });
      if (!sres.ok) {
        const eb = await sres.text().catch(() => "");
        throw new Error(`LoopMessage send failed HTTP ${sres.status}: ${eb.slice(0, 160)}`);
      }
    }
    return json({ ok: true, agent, thread_id: threadId, bubbles_sent: bubbles.length });
  } catch (e) {
    console.error("imessage-inbound:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
