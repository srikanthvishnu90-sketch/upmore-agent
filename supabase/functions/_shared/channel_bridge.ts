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

export interface RichTurnOutcome {
  kind: "done";
  threadId: string;
  replyText: string; // cleaned reply text ("" when the core answered empty)
  chat: any; // the full agent-chat response (batch/task/meta/artifacts ride it)
}

// One agent-chat call, the bridge's exact wire shape: service-role bearer
// + as_user_id, Authorization header ONLY (the gateway rejects conflicting
// apikey/Authorization pairs — same note as imessage-inbound).
async function callAgentChat(
  deps: ChannelDeps,
  args: { userId: string; threadId: string; message: string; turnKey?: string; careerBatch?: unknown },
): Promise<any> {
  const supabaseUrl = deps.env("SUPABASE_URL") ?? "";
  const serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await deps.fetchFn(`${supabaseUrl}/functions/v1/agent-chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: args.message.slice(0, 4000),
        thread_id: args.threadId,
        as_user_id: args.userId,
        ...(args.turnKey ? { turn_key: args.turnKey } : {}),
        ...(args.careerBatch ? { career_batch: args.careerBatch } : {}),
      }),
      signal: ctrl.signal,
    });
    const chat = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`agent-chat HTTP ${res.status}: ${JSON.stringify(chat).slice(0, 200)}`);
    if (chat.error) throw new Error("agent-chat: " + String(chat.error).slice(0, 200));
    return chat;
  } finally {
    clearTimeout(timer);
  }
}

// Runs one agent turn for an already-identified sender, mirroring
// imessage-inbound: claim the message id BEFORE the work (a retried webhook
// is ignored even if the first attempt crashed), create the thread on first
// contact, call agent-chat as the user, adopt a thread id the agent returns,
// and hand back the cleaned reply text plus the full response (the
// presentation layer renders and splits it per platform). Sending is the
// caller's job (so dry-run can skip it), exactly like the bridge's flow.
export async function runChannelTurnRich(
  deps: ChannelDeps,
  args: {
    channel: string;
    senderKey: string;
    userId: string;
    text: string;
    messageId: string | null;
  },
): Promise<{ kind: "duplicate" } | RichTurnOutcome> {
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
  // the whole turn as that user (see its TEST BRIDGE block).
  const chat = await callAgentChat(deps, { userId: args.userId, threadId: threadId as string, message: args.text });
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
  return { kind: "done", threadId: threadId as string, replyText, chat };
}

// The plain-text turn outcome the first channel lane shipped: same claim,
// same call, reply split by the legacy splitter. Kept for compatibility;
// the presentation handlers use runChannelTurnRich + channel_present.ts.
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
  const rich = await runChannelTurnRich(deps, args);
  if (rich.kind === "duplicate") return rich;
  const parts = splitMessage(rich.replyText || "(I didn't get a reply — try again.)", args.limit);
  return { kind: "done", threadId: rich.threadId, parts };
}

// Resolve a channel approval tap/choice into the core's hash-bound batch
// approval: the EXACT message "Approve batch <runId>" plus the structured
// career_batch approve request — identical authorization semantics to the
// app client (career_task_bridge.planCareerBatchIntent). The core
// re-reads the stored run and refuses a moved card; this call carries
// the card hash the bridge bound at offer time and authorizes nothing on
// its own. No claim/dedup here: the single-use approval token the caller
// consumed before calling is the dedup (channel_present.takeApproval).
export async function runChannelApproval(
  deps: ChannelDeps,
  args: {
    userId: string;
    threadId: string;
    runId: string;
    cardSha256: string;
    eventId: string;
    turnKey: string;
  },
): Promise<{ threadId: string; replyText: string; chat: any }> {
  const chat = await callAgentChat(deps, {
    userId: args.userId,
    threadId: args.threadId,
    message: `Approve batch ${args.runId}`,
    turnKey: args.turnKey,
    careerBatch: {
      action: "approve",
      version: "career_batch_intent/v1",
      eventId: args.eventId,
      runId: args.runId,
      cardSha256: args.cardSha256,
    },
  });
  return {
    threadId: chat.thread_id ? String(chat.thread_id) : args.threadId,
    replyText: cleanReply(String(chat.reply ?? "")),
    chat,
  };
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
