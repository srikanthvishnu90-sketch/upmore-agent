// Shared turn core for the Trainee messaging-channel test bridges
// (telegram-inbound, whatsapp-inbound). Mirrors supabase/functions/
// imessage-inbound/index.ts: the same agent-chat core call (service-role
// bearer + as_user_id), the same thread mapping shape (a per-sender row
// pointing at an agent_threads row), the same claim-before-work duplicate
// suppression, and the same long-message splitting. iMessage's bubble/link
// presentation is NOT mirrored — it is LoopMessage-specific rendering;
// Telegram and WhatsApp render links inline, so these channels split the
// cleaned reply at the platform character limit only.
//
// TEST PHASE identity: a sender resolves to a user ONLY through a
// config-driven allowlist naming the gauntlet test user
// (CHANNEL_TEST_USER_ID + a per-channel allowlist env). There is no guessed
// or fallback mapping: an unlisted sender, or missing config, resolves to
// nobody and never reaches the agent.

export type EnvGetter = (k: string) => string | undefined;

export interface ChannelDeps {
  env: EnvGetter;
  fetchFn: typeof fetch;
  createAdmin: () => any;
  paceMs?: number; // send pacing between parts (imessage uses 250ms); tests pass 0
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function digitsOf(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

export function parseAllowlist(v: string | undefined): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Test-phase identity resolution: returns the test user's id when the
// sender key is on the channel allowlist AND a test user is configured;
// otherwise null (never a guessed mapping).
export function resolveTestUser(env: EnvGetter, allowlistEnv: string, senderKey: string): string | null {
  const userId = env("CHANNEL_TEST_USER_ID") ?? "";
  if (!userId) return null;
  const list = parseAllowlist(env(allowlistEnv));
  // Exact match, or digit match (an allowlist written as +1… still matches a
  // digits-only sender key, the imessage bridge's comparison shape).
  const listed = list.includes(senderKey) ||
    (digitsOf(senderKey) !== "" && list.map(digitsOf).includes(digitsOf(senderKey)));
  return listed ? userId : null;
}

export function cleanReply(reply: string): string {
  // Strip hidden markers (exec-offer etc.) — they'd render as raw text.
  return reply.replace(/<!--[\s\S]*?-->/g, "").trim();
}

// Long-message splitting, the imessage bridge's algorithm: chunk on existing
// line breaks first, then word-wrap overlong lines; cuts happen ONLY at
// spaces, so numbers, domains and URLs are never split mid-token.
export function splitMessage(text: string, max: number): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= max) return [t];
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

export type TurnOutcome =
  | { kind: "duplicate" }
  | { kind: "done"; threadId: string; parts: string[] };

// Runs one agent turn for an already-identified sender, mirroring
// imessage-inbound: claim the message id BEFORE the work (a retried webhook
// is ignored even if the first attempt crashed), create the thread on first
// contact, call agent-chat as the user, adopt a thread id the agent returns,
// and hand back the reply split at the channel limit. Sending is the
// caller's job (so dry-run can skip it), exactly like the bridge's flow.
export async function runChannelTurn(
  deps: ChannelDeps,
  args: {
    channel: string;
    senderKey: string;
    userId: string;
    text: string;
    messageId: string | null;
    limit: number;
  },
): Promise<TurnOutcome> {
  const supabaseUrl = deps.env("SUPABASE_URL") ?? "";
  const serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = deps.createAdmin();

  let threadId: string | null = null;
  {
    const { data: row } = await admin
      .from("channel_threads")
      .select("thread_id, last_message_id")
      .eq("channel", args.channel)
      .eq("sender_key", args.senderKey)
      .maybeSingle();
    if (row?.thread_id) {
      threadId = row.thread_id as string;
      if (args.messageId && row.last_message_id === args.messageId) {
        return { kind: "duplicate" };
      }
    }
    if (!threadId) {
      const { data: th, error: thErr } = await admin
        .from("agent_threads")
        .insert({ user_id: args.userId, title: `${args.channel} (trainee)` })
        .select("id")
        .single();
      if (thErr || !th) throw new Error("thread create failed: " + (thErr?.message ?? "unknown"));
      threadId = th.id as string;
    }
    await admin.from("channel_threads").upsert(
      {
        channel: args.channel,
        sender_key: args.senderKey,
        thread_id: threadId,
        last_message_id: args.messageId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel,sender_key" },
    );
  }

  // Ask the agent brain. Service-role bearer + as_user_id: agent-chat runs
  // the whole turn as that user (see its TEST BRIDGE block). Send ONLY the
  // Authorization header — the gateway rejects conflicting apikey/Authorization
  // pairs; the service_role bearer alone passes (same note as imessage-inbound).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  let chat: any;
  try {
    const res = await deps.fetchFn(`${supabaseUrl}/functions/v1/agent-chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: args.text.slice(0, 4000),
        thread_id: threadId,
        as_user_id: args.userId,
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
    await admin.from("channel_threads").upsert(
      {
        channel: args.channel,
        sender_key: args.senderKey,
        thread_id: threadId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel,sender_key" },
    );
  }
  const replyText = cleanReply(String(chat.reply ?? ""));
  const parts = splitMessage(replyText || "(I didn't get a reply — try again.)", args.limit);
  return { kind: "done", threadId: threadId as string, parts };
}

export async function sendParts(
  deps: ChannelDeps,
  parts: string[],
  sendOne: (part: string) => Promise<void>,
): Promise<void> {
  const pace = deps.paceMs ?? 250;
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && pace > 0) await new Promise((r) => setTimeout(r, pace));
    await sendOne(parts[i]);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const NOT_AUTHORIZED_TEXT =
  "Hi — this is the Trainee test line, and this sender is not authorized for it yet.";
