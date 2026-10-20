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
import { CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment, CareerBatchApply } from "../_shared/router_core.career.js";
import { planCareerTaskIntent, normalizeCareerTaskRequest, createCareerBoardFor, createWorkerBoardProvider, planCareerBatchIntent, planCareerBatchPrepare, normalizeCareerBatchRequest } from "../_shared/career_task_bridge.js";
import { CareerHost } from "../_shared/career_host.js";
import { createCareerPersistence, careerRequestHash } from "../_shared/career_persistence.js";
import { callModel, modelConfig, newMeter } from "../_shared/model_gateway.ts";
import { chooseBrain, agentTurn, HISTORY_WINDOW, historyWindow, summaryFor } from "./career_brain.ts";
import { supabaseEventStore } from "../_shared/agent/timeline.ts";
import { CARD_INTENT, cardTurn, supabaseCardStore } from "../_shared/career_apply_cards.ts";
import { mockTurn, supabaseMockStore } from "../_shared/career_mock.ts";
import { QUESTIONS_INTENT, questionsTurn, supabaseQuestionStore } from "../_shared/career_apply_questions.ts";
import { supabasePostingsDb, searchWords } from "../_shared/career_ingest.ts";
import { supabaseAlertStore } from "../_shared/career_alert_store.ts";
import { readPipeline, supabaseMemoryStore } from "../_shared/agent/memory.ts";
import { supabaseMailStore } from "../_shared/career_mail_store.ts";
import { supabaseDigestStore, supabaseInterviewStore } from "../_shared/career_brief_store.ts";

const MAX_MESSAGE_LEN = 4000; // M2: cap input size (same cap as handler.ts)

type TurnCtx = { note: string | null; user: string | null; thread: string | null };
// Host routes and task/batch planners share this existing JSON reply boundary.
type CareerTurnResult = {
  intent: string; reply: string; handler?: string | null; resultStatus?: string;
  contained?: boolean; capabilities?: unknown; action?: unknown;
  result?: Record<string, unknown>; task?: unknown; batch?: unknown;
};

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

    // Service-role path (texting channel, WO-013b-2): when the bearer token is
    // EXACTLY the service_role key, our own backend (trainee-inbound) runs the
    // turn as the person a texting contact belongs to via `as_user_id`. The
    // normal user-JWT path below is completely unchanged.
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
    try {
      const loaded = await persistence.load({ userId: user.id, threadId: tid, turnKey, requestHash });
      if (loaded.replay) { flowCtx.note = null; return json(cors, loaded.replay, 200); }
      const ctx = host.createTurnCtx({ userId: user.id, threadId: tid, now: Date.now(), accountPersistence: true, snapshot: loaded.snapshot, account: loaded.account, watchState: loaded.watchState }) as ReturnType<typeof host.createTurnCtx> & {
        _hostPatch?: Record<string, unknown>; batchApplyState?: unknown;
      };
      // WO-002 (D-008): the agent brain answers when CAREER_BRAIN=agent; structured task/batch requests stay on the
      // router path. A model failure falls back to the router so an outage never leaves the person with nothing.
      let out: CareerTurnResult;
      let agentMeta: Record<string, unknown> | null = null;
      const events = supabaseEventStore(admin);
      // WO-022: the card of prepared applications and the one text that answers it are code's, before any brain: "show my
      // applications", and "yes" / "yes but not 2" / "no" / "change 2" while the card is this thread's last word. Account
      // controls stay the host's.
      const card = !careerTask && !careerBatch && !host.isHostControlled(message, ctx)
        ? await cardTurn({ message, userId: user.id, threadId: tid, now: Date.now(), store: supabaseCardStore(admin), events })
        : null;
      // WO-025: the text mock interview, code's like the card: "mock me for <role> at <company>", "end mock", and the answers
      // while the mock's question is this thread's last word. Same guards as the card; the card goes first.
      const mock = !card && !careerTask && !careerBatch && !host.isHostControlled(message, ctx)
        ? await mockTurn({ message, userId: user.id, threadId: tid, now: Date.now(), store: supabaseMockStore(admin) })
        : null;
      // Ask once: "what do you need from me" shows the questions only the person can answer, and the text right after
      // answers them by number. Code checks every answer against the employer's own choices; the model never decides.
      // Each of card, mock and questions answers only while its own prompt is the thread's last word, so they never overlap.
      // WO-030: "draft 2" drafts a written answer from the person's confirmed facts through the same gateway and model the
      // brain uses (the model only writes; code checks the employer's AI policy, every fact and the length), and only
      // "use 2" saves it.
      const draftMeter = newMeter();
      const draftCfg = { ...modelConfig(Deno.env, "chat"), model: Deno.env.get("CAREER_MODEL") || "gpt-5-mini" };
      const asked = !card && !mock && !careerTask && !careerBatch && !host.isHostControlled(message, ctx)
        ? await questionsTurn({ message, userId: user.id, threadId: tid, now: Date.now(), store: supabaseQuestionStore(admin),
          draft: { model: (payload) => callModel(draftCfg, payload, { meter: draftMeter, role: "chat" }), facts: () => ((ctx as any).profile?.facts ?? []) } })
        : null;
      if (draftMeter.calls) {
        const m = draftMeter;
        const { error: costErr } = await admin.from("agent_turn_costs").insert({ user_id: user.id, thread_id: tid, provider: m.provider, models: m.models, calls: m.calls, failed: m.failed, input_tokens: m.input_tokens, output_tokens: m.output_tokens, cached_tokens: m.cached_tokens, usd_micros: m.usd_micros, unpriced: m.unpriced });
        if (costErr) console.error("essay draft cost not recorded:", costErr.message);
      }
      if (card) {
        // A card still waiting for its answer stays this thread's last word; an answered one does not.
        const waiting = ["shown", "not_on_card", "change"].includes(card.status);
        out = { reply: card.reply, intent: waiting ? CARD_INTENT : "career_apply_card_answer", resultStatus: card.status, contained: false, handler: "cards" };
      } else if (mock) {
        // The mock's own intent: MOCK_INTENT while its question waits, so only then is the next text an answer.
        out = { reply: mock.reply, intent: mock.intent, resultStatus: mock.status, contained: false, handler: "mock" };
      } else if (asked) {
        // Questions shown, or some still open after an answer, stay this thread's last word so "2 yes" answers them; so does
        // every draft turn (a draft shown waits for "use 2"; a refused or failed one leaves the question open).
        const waiting = ["shown", "partial"].includes(asked.status) || asked.status.startsWith("draft");
        out = { reply: asked.reply, intent: waiting ? QUESTIONS_INTENT : "career_apply_questions_answer", resultStatus: asked.status, contained: false, handler: "questions" };
      } else if (!careerTask && !careerBatch && chooseBrain(Deno.env) === "agent" && !host.isHostControlled(message, ctx)) {
        const meter = newMeter();
        const cfg = { ...modelConfig(Deno.env, "chat"), model: Deno.env.get("CAREER_MODEL") || "gpt-5-mini" };
        // WO-027 (B5): the last 40 messages after the latest erase; one more row says whether the thread is longer.
        const hist = await admin.from("agent_messages").select("role,content,meta").eq("thread_id", tid).order("id", { ascending: false }).limit(HISTORY_WINDOW + 1);
        if (hist.error) throw new Error(`agent history: ${hist.error.message}`);
        const win = historyWindow((hist.data || []) as any[]), history = win.history;
        const postingsDb = supabasePostingsDb(admin);
        // WO-023: what is known about the person, every turn. Standing instructions are fundamental: if they cannot be
        // read the turn fails rather than answer without them. Alerts and the pipeline say "could not be read" instead.
        const memory = supabaseMemoryStore(admin), alertStore = supabaseAlertStore(admin), now = Date.now();
        const standing = await memory.standing(user.id);
        const [alertRow, pipeline] = await Promise.all([
          alertStore.get(user.id).catch((e) => { console.error("agent memory: alerts", e?.message ?? e); return null; }),
          readPipeline(admin, user.id, now).catch((e) => { console.error("agent memory: pipeline", e?.message ?? e); return null; }),
        ]);
        // WO-027: the account's timeline, written by the tools and read by recall; past the window, a summary of it written
        // in code. A timeline that cannot be read never fails the turn: the summary says so instead.
        const tz = alertRow?.tz;
        const recent = win.cut ? await events.recall(user.id, { limit: 200 }).catch((e) => { console.error("agent memory: events", e?.message ?? e); return null; }) : null;
        const summary = summaryFor(win.cut, recent, now, tz);
        const turn = await agentTurn({ message, history, stores: ctx as unknown as Record<string, unknown>, userId: user.id, threadId: tid, now,
          model: (payload) => callModel(cfg, payload, { meter, role: "chat" }), postings: (q) => postingsDb.search(searchWords(q), 150), alerts: alertStore,
          mail: supabaseMailStore(admin), interviews: supabaseInterviewStore(admin), digest: supabaseDigestStore(admin),
          events, tz, summary,
          known: { standing, alerts: alertRow ? { prefs: alertRow.prefs, tz: alertRow.tz } : null, pipeline }, memory });
        if (meter.calls) {
          const { error: costErr } = await admin.from("agent_turn_costs").insert({ user_id: user.id, thread_id: tid, provider: meter.provider, models: meter.models, calls: meter.calls, failed: meter.failed, input_tokens: meter.input_tokens, output_tokens: meter.output_tokens, cached_tokens: meter.cached_tokens, usd_micros: meter.usd_micros, unpriced: meter.unpriced });
          if (costErr) console.error("agent turn cost not recorded:", costErr.message);
        }
        if (turn.stopped === "model_error" && !turn.tool_calls.some((t) => t.ok && t.effect === "write_own")) {
          console.error("agent brain: model unavailable, answering with the router");
          out = host.runTurn(message, ctx);
        } else {
          out = { reply: turn.reply, intent: "agent", resultStatus: turn.stopped, contained: false, handler: "agent" };
          agentMeta = { brain: "agent", tool_calls: turn.tool_calls, stopped: turn.stopped, pending_approvals: turn.pending_approvals.length };
        }
      } else {
        out = host.runTurn(message, ctx);
      }
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
          summarizeRun: (run: unknown) => { const r = CareerBatchApply.restoreRun(run); return r ? CareerBatchApply.speakSummary(r).join("\n") : null; } });
        out = plan.out; batchIntent = plan.intent;
      } else if (delegateBatch && !careerBatch && out.intent === "career_batch_apply" && out.result && out.result.batchDelegate && ctx.batchApplyState) {
        const plan = await planCareerBatchPrepare({ run: ctx.batchApplyState, userId: user.id, threadId: tid,
          turnKey, requestHash, accountVersion: loaded.accountVersion, account: loaded.account });
        if (plan) { batchIntent = plan.intent; out = { ...out, batch: plan.batch }; }
      }
      for (const rec of ctx.containmentRecords ?? []) console.error("career containment:", JSON.stringify(rec));
      const reply = flowCtx.note ? `${flowCtx.note} ${out.reply}` : out.reply;
      const reminders = Array.isArray(loaded.reminders) ? loaded.reminders : [];
      const visibleReply = [reply, ...reminders.map((r:any) => typeof r.speak_line === "string" ? r.speak_line.slice(0,2000) : "")].filter(Boolean).join("\n");
      const response = { thread_id: tid, reply: visibleReply, action: null, capabilities: out.capabilities, turn_key: turnKey, reminders, ...(out.task ? { task: out.task } : {}), ...(out.batch ? { batch: out.batch } : {}), meta: { career: true, intent: out.intent, result_status: out.resultStatus, contained: out.contained, ...(agentMeta || {}) } };
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
