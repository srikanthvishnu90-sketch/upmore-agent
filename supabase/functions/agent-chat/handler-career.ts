// Upmore agent-chat edge function — CAREER-ONLY entry handler.
//
// Owner decision 2026-10-15: "Prune the shelved finance half from the
// bundle, re-measure, then deploy" / "yes, or even remove the finance
// portion entirely." The deployed agent-chat artifact therefore contains
// ZERO finance code: this handler's static import graph reaches only the
// career chain (120 access → 130 onboarding → 142 router → 141 doorstep,
// inside 143 containment, through _shared/career_host.js) plus the small
// shared leaves the career path uses (CORS, chat input, thread ownership,
// identity redaction) and the career-only bundle
// (_shared/router_core.career.js, built by
// scripts/build-router-core.py --career-only).
//
// The finance pipeline remains in the repo, shelved behind PRODUCT_MODE in
// agent-chat/handler.ts (pivot mechanics: shelved, not deleted — tag
// finance-final); it is simply not part of this deployed artifact anymore.
//
// Behavior contract: every line below that a career turn can reach is
// copied verbatim from handler.ts (auth, bridge override, profile upsert,
// rate limiting, input parsing, thread ownership, the PRODUCT_MODE career
// branch, the redaction-note prefix). The only handler.ts machinery not
// carried over is the model-cost meter block in the wrapper: career turns
// make zero model calls (the chain is deterministic code), so in
// handler.ts that block is unreachable on every career turn — meter.calls
// stays 0 and no agent_turn_costs row is ever written for a career turn.
// Dropping it here changes no observable career behavior.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { redactionNote } from "../_shared/identity_redact.ts";
import { corsFor } from "./_shared/chat_cors.ts";
import { chatInput } from "./_shared/chat_input.ts";
import { ownerThread, ChatThreadError } from "./_shared/chat_session.ts";
import { CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment } from "../_shared/router_core.career.js";
import { CareerHost } from "../_shared/career_host.js";

const MAX_MESSAGE_LEN = 4000; // M2: cap input size (same cap as handler.ts)

type TurnCtx = { note: string | null; user: string | null; thread: string | null };

export async function handleChat(req: Request): Promise<Response> {
  const ctx: TurnCtx = { note: null, user: null, thread: null };
  const res = await handleChatInner(req, ctx);
  if (!ctx.note || res.status !== 200) return res;
  try {
    const body = await res.clone().json();
    if (!body || typeof body.reply !== "string") return res;
    body.reply = `${ctx.note} ${body.reply}`;
    const headers = new Headers(res.headers); headers.delete("content-length");
    return new Response(JSON.stringify(body), { status: 200, headers });
  } catch { return res; }
}

async function handleChatInner(req: Request, flowCtx: TurnCtx): Promise<Response> {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const authM = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!authM) return json(cors, { error: "unauthorized" }, 401);
    // Read the body once up front: the bridge override below needs as_user_id
    // and the main flow needs thread_id/message/images.
    const body = await req.json().catch(() => ({}));

    // TEST BRIDGE ONLY (iMessage): when the bearer token is EXACTLY the
    // service_role key, the caller may run the turn as a specific user via
    // `as_user_id`. This exists solely for the first-party iMessage test
    // bridge. The normal user-JWT path below is completely unchanged.
    // The key itself is never logged.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isBridgeCall = serviceKey !== "" && authM[1] === serviceKey;
    const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let bridgeUserId: string | null = null;
    if (isBridgeCall) {
      const raw = typeof body.as_user_id === "string" ? body.as_user_id : "";
      if (!UUID_RX.test(raw)) return json(cors, { error: "as_user_id must be a valid UUID" }, 400);
      bridgeUserId = raw;
    }

    // The gateway already verified the JWT signature (verify_jwt=true). Extract
    // the user token and pass it EXPLICITLY: auth.getUser() with no argument
    // reads the client session, which does not exist in an edge function, so it
    // would always return null and every signed-in user would get a 401.
    let supabase: any;
    let user: { id: string; email?: string | null };
    if (bridgeUserId) {
      // Bridge path: service_role client (bypasses RLS); every query below is
      // still explicitly scoped with .eq("user_id", user.id).
      supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
      user = { id: bridgeUserId };
    } else {
      supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user: u } } = await supabase.auth.getUser(authM[1]);
      if (!u) return json(cors, { error: "unauthorized" }, 401);
      user = u;
    }

    // The rate limiter FKs to profiles — make sure a profile row exists first
    // (the app upserts on sign-in, but API/test callers may not). Without this
    // a missing profile would make the RPC error and look like rate limiting.
    const profileWrite = await supabase.from("profiles").upsert({ id: user.id }, { onConflict: "id" });
    if (profileWrite.error) throw new Error("Account profile unavailable.");

    // Rate limiting: 60 chat requests per fixed 60-minute window per user,
    // enforced on EVERY request (deterministic capabilities included) via
    // the agent_rl_bump RPC — atomic row-locked increment so concurrent
    // requests can't double-spend. A false return is a real 429 (with
    // Retry-After); an RPC *error* is a 500, never a fake "slow down".
    // Bridge path: the hardened agent_rl_bump derives the user from
    // auth.uid(), which is null for service_role callers, so it would always
    // 429. agent_rl_bump_as takes the user explicitly and is executable ONLY
    // by service_role (our own backend) — same window math, same limit.
    const rlFn = bridgeUserId ? "agent_rl_bump_as" : "agent_rl_bump";
    const RATE_LIMIT = 60;
    const { data: rlOk, error: rlErr } = await supabase.rpc(rlFn, { p_user: user.id, p_limit: RATE_LIMIT });
    if (rlErr) {
      console.error("agent_rl_bump failed:", rlErr.message);
      return json(cors, { error: "internal" }, 500);
    }
    if (!rlOk) {
      return new Response(
        JSON.stringify({ error: "rate_limited", message: "Slow down a little — try again in a bit." }),
        { status: 429, headers: { ...cors, "content-type": "application/json", "Retry-After": "3600" } }
      );
    }

    const { thread_id, message: rawMessage, images } = body as { thread_id?: unknown; message?: unknown; images?: unknown };
    // Text, photos, or both (a photo alone is a message: spec 16 item 12).
    const input = chatInput(rawMessage, images, MAX_MESSAGE_LEN);
    if (!input.ok) return json(cors, { error: input.error }, 400);
    const { message, userContent, imageBlocks } = input;
    flowCtx.note = redactionNote(input.redacted);
    // L4: thread_id must be a string when provided (non-string truthy values
    // would otherwise cause a DB error → noisy 500).
    if (thread_id !== undefined && thread_id !== null && typeof thread_id !== "string")
      return json(cors, { error: "thread_id must be a string" }, 400);

    // Scope both JWT and service-role bridge histories to the verified owner.
    let tid: string;
    try { tid = await ownerThread(supabase, user.id, thread_id, message); }
    catch (error) {
      if (error instanceof ChatThreadError) return json(cors, { error: error.code }, error.status);
      throw error;
    }
    flowCtx.user = user.id; flowCtx.thread = tid;

    // GO-LIVE FLIP (2026-10-13, owner ruling: "the career version is the
    // final switch" — the money version is gone from live). Career is the
    // product served here. Career turns run the bundled chain in harness
    // order (120 access → 130 onboarding → 142 router → 141 doorstep)
    // inside 143 containment, through _shared/career_host.js — the same
    // dispatch the gauntlet grades (tests/career-http-host.test.cjs).
    // Per-thread career state rides agent_flow_state.state under the
    // "career" key, mirroring the flow router's own use of that table.
    const host = CareerHost.createCareerHost({ CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment });
    await supabase.from("agent_messages").insert({ thread_id: tid, role: "user", content: userContent });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let flowState: Record<string, unknown> = {};
    const { data: fsRow, error: fsErr } = await admin.from("agent_flow_state").select("state").eq("thread_id", tid).eq("user_id", user.id).maybeSingle();
    if (fsErr) console.error("career state load failed:", fsErr.message);
    if (fsRow && fsRow.state && typeof fsRow.state === "object") flowState = fsRow.state as Record<string, unknown>;
    const ctx = host.createTurnCtx({ userId: user.id, threadId: tid, now: Date.now(), snapshot: (flowState.career as any) ?? null });
    const out = host.runTurn(message, ctx);
    for (const rec of ctx.containmentRecords ?? []) console.error("career containment:", JSON.stringify(rec));
    const { error: saveErr } = await admin.from("agent_flow_state").upsert(
      { thread_id: tid, user_id: user.id, state: { ...flowState, career: host.extractSnapshot(ctx) }, updated_at: new Date().toISOString() },
      { onConflict: "thread_id" },
    );
    if (saveErr) console.error("career state save failed:", saveErr.message);
    await supabase.from("agent_messages").insert({ thread_id: tid, role: "assistant", content: out.reply, meta: { career: true, intent: out.intent, result_status: out.resultStatus, contained: out.contained } });
    return json(cors, { thread_id: tid, reply: out.reply, action: null, capabilities: out.capabilities });
  } catch (e) {
    console.error(e);
    return json(cors, { error: "internal" }, 500);
  }
}

function json(cors: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}
