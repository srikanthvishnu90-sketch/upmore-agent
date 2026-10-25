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

// agent-chat's 429: the person's hourly turn limit (agent_rl_bump_as), not a failure. The channels speak it as the
// limit (VOICE.rateLimited) and answer the webhook 200, so the provider does not retry it.
export class TurnLimitError extends Error {
  constructor() { super("agent-chat turn limit"); this.name = "TurnLimitError"; }
}

// One agent-chat call, the bridge's exact wire shape: service-role bearer
// + as_user_id, Authorization header ONLY (the gateway rejects conflicting
// apikey/Authorization pairs — same note as imessage-inbound).
async function callAgentChat(
  deps: ChannelDeps,
  args: { userId: string; threadId: string; message: string; turnKey?: string; careerBatch?: unknown; replyToMessageId?: string | null },
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
        // SERIAL-1462: the provider's reply-to id travels to the turn; a card's text yes counts only in reply to the card.
        ...(args.replyToMessageId ? { reply_to_message_id: args.replyToMessageId } : {}),
      }),
      signal: ctrl.signal,
    });
    const chat = await res.json().catch(() => ({}));
    if (res.status === 429) throw new TurnLimitError();
    if (!res.ok) throw new Error(`agent-chat HTTP ${res.status}: ${JSON.stringify(chat).slice(0, 200)}`);
    if (chat.error) throw new Error("agent-chat: " + String(chat.error).slice(0, 200));
    return chat;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------
// F-037 CARD READBACK. The batch approval card exists only as a field
// on an agent-chat response — channel_present.detectBatchCard fires
// when chat.batch is a batch_run at awaiting_approval — and the only
// producer of that object is the core planner's status branch, which
// runs solely on a structured career_batch request. Before this block,
// the bridge sent that request ONLY from runChannelApproval (the
// approve path), so after a prepare completed, no text turn could ever
// surface the card: the approval machinery was built and unreachable,
// and a status ask fell to the generic fallback (F-002's symptom).
//
// The fix is a readback, composed here in the turn core so both
// channels get it and neither handler changes:
//   1. The pending run id is REMEMBERED already — by the product, not
//      by a bridge-side copy. The ask turn's prepare intent is
//      committed transactionally with the reply into
//      career_batch_intents_v1, keyed by (user_id, thread_id, run_id)
//      with binding.action = "prepare" (migration 20261016010000).
//      This bridge maps (channel, sender_key) -> thread_id in
//      channel_threads, so the sender's pending run resolves with one
//      select: the thread's LATEST prepare intent.
//   2. The stored run is read through the same owner-scoped RPC the
//      handler and presentation layers use (career_batch_result_v1),
//      validated the way channel_present.readCardHash validates it.
//      Only status awaiting_approval — the one state that has a card —
//      proceeds. A foreign record reads as nothing (the RPC filters by
//      user) and is never selected by another thread anyway (the
//      intent query is scoped to this user AND this thread).
//   3. runChannelStatus issues the structured status request and its
//      response becomes the turn outcome, rendered by the handlers
//      through the EXISTING detectBatchCard / offerApproval path,
//      unchanged. The core's status branch is read-only (it returns
//      intent: null and commits nothing); nothing here mints,
//      verifies, or resolves an approval.
//
// Failure posture: the readback fails OPEN to the plain turn — any
// error, any doubt, even the agent-chat turn limit on the extra call,
// returns the plain outcome untouched (worst case = the pre-fix
// product). Authorization stays fail-closed where it already was:
// offerApproval re-reads the card hash from the stored run before
// binding a token, and the core re-verifies it at approve time.

const BATCH_INTENT_VERSION = "career_batch_intent/v1";
const BATCH_RUN_ID_OK = /^batch-[A-Za-z0-9-]{4,96}$/;

// The thread's remembered pending batch run: the latest prepare intent
// the core committed for (user, thread). Null when the thread never
// asked for a batch (the common case — one select, no other reads).
export async function resolveRememberedBatchRun(
  admin: any,
  args: { userId: string; threadId: string },
): Promise<string | null> {
  const { data, error } = await admin
    .from("career_batch_intents_v1")
    .select("run_id, binding, created_at")
    .eq("user_id", args.userId)
    .eq("thread_id", args.threadId)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error || !Array.isArray(data)) return null;
  for (const row of data) {
    if (row?.binding?.action !== "prepare") continue;
    return typeof row.run_id === "string" && BATCH_RUN_ID_OK.test(row.run_id) ? row.run_id : null;
  }
  return null;
}

// The stored run's status, read owner-scoped through the product's own
// RPC and validated like channel_present.readCardHash validates the
// record (version, owner, run id must all match the ask). Null on any
// mismatch — a run that is not verifiably this user's reads as absent.
export async function readStoredBatchRunStatus(
  admin: any,
  args: { userId: string; runId: string },
): Promise<string | null> {
  const { data, error } = await admin.rpc("career_batch_result_v1", {
    p_user: args.userId,
    p_run: args.runId,
  });
  if (error || !data || typeof data !== "object") return null;
  const rec = (data as any).batch;
  if (!rec || rec.version !== "career_batch_run/v1" || rec.userId !== args.userId) return null;
  if (rec.runId !== args.runId || typeof rec.status !== "string") return null;
  return rec.status;
}

// One structured batch STATUS call: the read-only planner branch the
// handler routes on body.career_batch. Mirrors runChannelApproval's
// shape and wire discipline; authorizes nothing and commits nothing —
// it asks the core to read back the worker's stored run for its owner.
export async function runChannelStatus(
  deps: ChannelDeps,
  args: { userId: string; threadId: string; runId: string; message: string },
): Promise<{ threadId: string; replyText: string; chat: any }> {
  const chat = await callAgentChat(deps, {
    userId: args.userId,
    threadId: args.threadId,
    message: args.message,
    careerBatch: { action: "status", version: BATCH_INTENT_VERSION, runId: args.runId },
  });
  return {
    threadId: chat.thread_id ? String(chat.thread_id) : args.threadId,
    replyText: cleanReply(String(chat.reply ?? "")),
    chat,
  };
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
    replyToMessageId?: string | null; // SERIAL-1462: the provider's id of the message the person replied to
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
  let chat = await callAgentChat(deps, { userId: args.userId, threadId: threadId as string, message: args.text, replyToMessageId: args.replyToMessageId ?? null });
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

  // F-037 card readback (design: docs/e2e/H1-CARD-DELIVERY-DESIGN.md).
  // When this thread has a batch whose stored run is waiting at its
  // card, the plain response cannot carry the card (the planner only
  // speaks it to a structured status request) — so ask, and let the
  // status response be the outcome the handlers render through the
  // existing detectBatchCard / offerApproval path. Skipped entirely
  // when the plain response already carries a batch_run object, and
  // fail-open: any readback failure leaves the plain outcome as-is.
  if (chat?.batch?.kind !== "batch_run") {
    try {
      const runId = await resolveRememberedBatchRun(admin, {
        userId: args.userId,
        threadId: threadId as string,
      });
      if (runId) {
        const status = await readStoredBatchRunStatus(admin, { userId: args.userId, runId });
        if (status === "awaiting_approval") {
          const readback = await runChannelStatus(deps, {
            userId: args.userId,
            threadId: threadId as string,
            runId,
            message: args.text,
          });
          const b = readback.chat?.batch;
          if (b && b.kind === "batch_run" && b.status === "awaiting_approval" && b.id === runId) {
            chat = readback.chat; // the status call ran on this same thread; its id stands
          }
        }
      }
    } catch {
      // Readback is best-effort (a TurnLimitError here included): the
      // plain turn already succeeded and stands.
    }
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
    // P1 text yes ("yes but not 2"): posting keys of THIS card left off.
    // Absent/empty = the whole card, byte-identical to the button tap.
    exclude?: string[];
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
      ...(args.exclude && args.exclude.length ? { exclude: args.exclude } : {}),
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
