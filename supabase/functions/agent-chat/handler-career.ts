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
import { CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment, CareerBatchApply, CareerJobs, CareerConnectorGate } from "../_shared/router_core.career.js";
import { planCareerTaskIntent, normalizeCareerTaskRequest, createCareerBoardFor, createWorkerBoardProvider, planCareerBatchIntent, planCareerBatchPrepare, normalizeCareerBatchRequest } from "../_shared/career_task_bridge.js";
import { CareerHost } from "../_shared/career_host.js";
import { CareerPool } from "../_shared/career_pool.js";
import { createCareerPersistence, careerRequestHash } from "../_shared/career_persistence.js";
import { documentsOf, materializeArtifacts } from "../_shared/channel_artifacts.ts";

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

    const turnKey = body.turn_key == null ? crypto.randomUUID() : body.turn_key;
    if (typeof turnKey !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(turnKey)) return json(cors, { error: "invalid_turn_key" }, 400);

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
    // J8 + J9 (LOOP ACCEPTANCE): module 155's drive stage takes its
    // board adapter from ctx.batchDeps.boardFor, which the host
    // supplies from this composition root. Resolution lives in
    // career_task_bridge: createCareerBoardFor validates a provider's
    // boards against module 149's contract and converts every failure
    // mode to null — the named BOARD_NOT_WIRED stop; no board is ever
    // faked.
    // J9 installs the real provider at this call site:
    // createWorkerBoardProvider, bound to THIS request's authenticated
    // user, gated on the worker's env (UPMORE_CAREER_WORKER_URL +
    // UPMORE_CAREER_WORKER_SECRET). Behind it, the owned browser
    // worker's board service (workers/career-browser/board-service.cjs)
    // vends live module-150 board sessions. The provider needs a
    // SYNCHRONOUS transport — the drive stack (155/149/150) is
    // synchronous end to end — and this Edge runtime has none today
    // (Node composition roots inject workers/career-browser/
    // board-transport.cjs), so the factory resolves null here with or
    // without env present: the seam stays wired, the stop stays
    // honest, and no WIRED claim is made for a path that cannot vend.
    // J10 (the deployed-runtime transport, design of record in the
    // loop joins doc): the batch loop does not wait for a synchronous
    // transport in this runtime — it DELEGATES. When the worker env
    // is present, the host is built with delegateBatch and the router
    // seam hands each batch ask to the owned browser worker as a
    // committed career_batch_intent/v1 (prepare -> the worker runs
    // module 155 in its own process -> the prepared run reads back
    // through the structured career_batch status request -> the yes
    // commits an approve intent -> the worker executes). No browser
    // effect happens in a chat turn; the in-turn provider above is
    // unchanged (still null-resolving here), so the single-application
    // doorstep paths keep their exact J8/J9 behavior.
    const workerUrl = Deno.env.get("UPMORE_CAREER_WORKER_URL") ?? "";
    const workerSecret = Deno.env.get("UPMORE_CAREER_WORKER_SECRET") ?? "";
    const boardFor = createCareerBoardFor(createWorkerBoardProvider({ workerUrl, secret: workerSecret, userId: user.id }));
    const delegateBatch = workerUrl !== "" && workerSecret !== "";
    // LANE B CONNECTOR (assembled): the gate is module 156 —
    // CareerConnectorGate.decide reads CONNECTOR_ENABLED +
    // CONNECTOR_ALLOWLIST from env, computed per turn below at
    // createTurnCtx from the authenticated user.id; the host carries
    // the decision as ctx.connectorGate and the router's connector
    // claim runs only when it allows. No connectorPool is installed
    // in this runtime this round: the production pool over the
    // account store is the connections-registry seam (design note,
    // docs/connector/connector-v1-design.md), so gate-allowed
    // accounts get the router's honest not-wired reply and every
    // other account keeps the unchanged people-matching stop. No
    // WIRED claim is made for a pool that is not installed.
    const host = CareerHost.createCareerHost({ CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment, boardFor, delegateBatch });
    let careerTask;
    try { careerTask = normalizeCareerTaskRequest(body.career_task); }
    catch (_) { return json(cors, { error: "invalid_career_task", action: null, turn_key: turnKey }, 400); }
    let careerBatch;
    try { careerBatch = normalizeCareerBatchRequest(body.career_batch); }
    catch (_) { return json(cors, { error: "invalid_career_batch", action: null, turn_key: turnKey }, 400); }
    const requestHash = await careerRequestHash(rawMessage, imageBlocks, careerTask ?? (careerBatch ? { batch: careerBatch } : null));
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const persistence = createCareerPersistence(admin);
    // POOL LOADER (Lane E, Feature Depth Program v2 — closes the gap
    // diagnosed in the Lane D operator checklist §8): ctx.postings is
    // the discovery pool, a per-turn host input. Until this wiring
    // the handler never passed it, so the host defaulted the pool to
    // [] for every user on every turn and discovery answered its
    // honest-empty reply forever ("today it holds no roles at all")
    // while career_kb_postings held 21,688 real postings one read
    // away. The loader (_shared/career_pool.js) reads the KB through
    // this request's service-role client — bounded, recency-ordered,
    // mapped to the corpus shape 142 consumes, every posting
    // carrying its snapshot fetched_on (the KB is an Oct 2026
    // snapshot, not a live feed; freshness of content is the watcher
    // lane's remainder, never implied here). The loader never
    // throws: a failed read degrades to the empty pool and the
    // product's designed honest-empty reply — never a crashed turn,
    // never an invented role. The worker's postingsFor reads through
    // the same loader, so the two pools cannot disagree.
    const poolLoader = CareerPool.createKbPoolLoader({
      readRows: async (spec: any) => {
        let q = admin.from(spec.table).select(spec.select)
          .order(spec.order.column, { ascending: spec.order.ascending, nullsFirst: spec.order.nullsFirst });
        for (const f of (spec.filters ?? [])) {
          if (f.op === "ilike") q = q.ilike(f.column, f.value);
          else if (f.op === "eq") q = q.eq(f.column, f.value);
        }
        const { data, error } = await q.limit(spec.limit);
        if (error) throw new Error(`career_kb_postings read failed: ${error.message}`);
        return data ?? [];
      },
      jobs: { roleFamily: CareerJobs.roleFamily, seniorityBand: CareerJobs.seniorityBand, stripHtml: CareerJobs.stripHtml },
    });
    try {
      const loaded = await persistence.load({ userId: user.id, threadId: tid, turnKey, requestHash });
      if (loaded.replay) { flowCtx.note = null; return json(cors, loaded.replay, 200); }
      const pool = await poolLoader.loadPool();
      if (pool.error) console.error("career pool load failed:", pool.error);
      // V240 LIVE-FIX (probe f2): the window is a discovery slice,
      // not the shelf — when the turn names a specific company/title
      // (the router's OWN parser decides; no second parser lives
      // here), supplement the window with the loader's targeted
      // lookup so a named posting the KB holds beyond the window is
      // findable in-turn. Merged by posting id; the supplement never
      // throws (loader contract), and any failure here leaves the
      // window pool standing on its own — the turn keeps its honest
      // named stop, never a crash, never an invented role.
      let postings = pool.postings;
      try {
        const target = typeof (CareerRouter as any).namedRoleTargetOf === "function" ? (CareerRouter as any).namedRoleTargetOf(message, null) : null;
        if (target && target.company) {
          const extra = await poolLoader.loadTargeted(target);
          if (extra.postings.length) {
            const seen = new Set(postings.map((p: any) => p.job_id));
            postings = postings.concat(extra.postings.filter((p: any) => !seen.has(p.job_id)));
          }
        }
      } catch { /* the window pool stands on its own */ }
      // The connector gate decision is computed ONCE per turn from
      // the authenticated request's user id — never from a channel
      // bridge's resolved test identity (gate integration note,
      // docs/connector/gate-integration-note-2026-10-21.md).
      const connectorGate = CareerConnectorGate.decide((name: string) => Deno.env.get(name), user.id);
      const ctx = host.createTurnCtx({ userId: user.id, threadId: tid, now: Date.now(), accountPersistence: true, snapshot: loaded.snapshot, account: loaded.account, watchState: loaded.watchState, postings, connectorGate });
      let out = host.runTurn(message, ctx);
      let taskIntent = null;
      let batchIntent = null;
      const pausedReadback = careerTask && ["status", "reconcile"].includes(careerTask.action) && out.intent === "career_paused" && !ctx._hostPatch;
      if (careerTask && (out.handler !== "CareerHostControl" || pausedReadback)) {
        const plan = await planCareerTaskIntent({ taskRequest: careerTask, message, userId: user.id, threadId: tid,
          turnKey, requestHash, ctx, accountVersion: loaded.accountVersion, account: loaded.account, persistence });
        out = plan.out; taskIntent = plan.intent;
      }
      // J10 batch delegation: a structured career_batch request
      // (status readback / approve) plans exactly like the task path
      // above; a plain batch ASK in delegate mode is detected from
      // the seam's outcome + the skeleton it left on ctx, and its
      // prepare intent is planned from that skeleton. Either way the
      // intent commits transactionally with the reply below, and the
      // reply never claims a state the worker has not written.
      const pausedBatchReadback = careerBatch && careerBatch.action === "status" && out.intent === "career_paused" && !ctx._hostPatch;
      if (careerBatch && (out.handler !== "CareerHostControl" || pausedBatchReadback)) {
        const plan = await planCareerBatchIntent({ batchRequest: careerBatch, message, userId: user.id, threadId: tid,
          turnKey, requestHash, ctx, accountVersion: loaded.accountVersion, account: loaded.account, persistence,
          summarizeRun: (run) => { const r = CareerBatchApply.restoreRun(run); return r ? CareerBatchApply.speakSummary(r).join("\n") : null; } });
        out = plan.out; batchIntent = plan.intent;
      } else if (delegateBatch && !careerBatch && out.intent === "career_batch_apply" && out.result && out.result.batchDelegate && ctx.batchApplyState) {
        const plan = await planCareerBatchPrepare({ run: ctx.batchApplyState, userId: user.id, threadId: tid,
          turnKey, requestHash, accountVersion: loaded.accountVersion, account: loaded.account });
        if (plan) { batchIntent = plan.intent; out = { ...out, batch: plan.batch }; }
      }
      for (const rec of ctx.containmentRecords ?? []) console.error("career containment:", JSON.stringify(rec));
      // CHANNEL-DOC-1: documents the turn produced (the tailored
      // resume PDF; the delivery handler's documents) are materialized
      // into the owner-scoped artifact store and ride the reply as
      // bytes-refs — the bytes never ride the reply itself. A document
      // that fails to store is dropped from the contract and said so
      // on the reply; it is never claimed attached.
      let artifactsField: any[] | undefined;
      let artifactNote = "";
      {
        const docs = documentsOf(out.result);
        if (docs.length) {
          const m = await materializeArtifacts(admin, { userId: user.id, threadId: tid, documents: docs });
          if (m.artifacts.length) artifactsField = m.artifacts;
          if (m.failed > 0) artifactNote = "One file from this turn couldn't be attached here — ask me to send it again and I'll rebuild it.";
        }
      }
      const reply = (flowCtx.note ? `${flowCtx.note} ${out.reply}` : out.reply) + (artifactNote ? `\n${artifactNote}` : "");
      const reminders = Array.isArray(loaded.reminders) ? loaded.reminders : [];
      const visibleReply = [reply, ...reminders.map((r:any) => typeof r.speak_line === "string" ? r.speak_line.slice(0,2000) : "")].filter(Boolean).join("\n");
      const response = { thread_id: tid, reply: visibleReply, action: null, capabilities: out.capabilities, turn_key: turnKey, reminders, ...(out.task ? { task: out.task } : {}), ...(out.batch ? { batch: out.batch } : {}), ...(artifactsField ? { artifacts: artifactsField } : {}), meta: { career: true, intent: out.intent, result_status: out.resultStatus, contained: out.contained } };
      const saved = await persistence.commit({ userId: user.id, threadId: tid, turnKey, requestHash, revision: loaded.revision, accountVersion: loaded.accountVersion, snapshot: host.extractSnapshot(ctx), patch: ctx._hostPatch, input: userContent, response, taskIntent, batchIntent });
      flowCtx.note = null;
      return json(cors, saved.response, 200);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "storage_unavailable";
      const conflict = ["turn_key_conflict", "task_event_conflict", "revision_conflict", "privacy_epoch_changed", "watch_profile_conflict"].includes(code);
      return json(cors, { error: code, reply: conflict ? "The saved career context changed or this request key conflicts. Reload your owned conversation before retrying. Nothing new was started." : "I could not confirm that your career reply or changes were saved. Retry with the same request key; do not repeat an uncertain external action.", action: null, turn_key: turnKey }, conflict ? 409 : 503);
    }
  } catch (e) {
    console.error(e);
    return json(cors, { error: "internal" }, 500);
  }
}

function json(cors: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}
