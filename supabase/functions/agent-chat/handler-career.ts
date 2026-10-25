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
import { CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment, CareerBatchApply, CareerJobs, CareerProfile } from "../_shared/router_core.career.js";
import { planCareerTaskIntent, normalizeCareerTaskRequest, createCareerBoardFor, createWorkerBoardProvider, planCareerBatchIntent, planCareerBatchPrepare, normalizeCareerBatchRequest } from "../_shared/career_task_bridge.js";
import { CareerHost } from "../_shared/career_host.js";
import { CareerPool } from "../_shared/career_pool.js";
import { createCareerPersistence, careerRequestHash } from "../_shared/career_persistence.js";
import { callModel, modelConfig, newMeter } from "../_shared/model_gateway.ts";
import { linkChecker } from "../_shared/link_check.ts";
import { AGENT_BRAIN_RELEASED, chooseBrain, agentTurn, HISTORY_WINDOW, historyWindow, summaryFor } from "./career_brain.ts";
import { supabaseEventStore } from "../_shared/agent/timeline.ts";
import { CARD_INTENT, cardTurn, supabaseCardStore } from "../_shared/career_apply_cards.ts";
import { mockTurn, supabaseMockStore } from "../_shared/career_mock.ts";
import { hiredSourceFromEnv } from "../_shared/career_hired.ts";
import { QUESTIONS_INTENT, questionsTurn, supabaseQuestionStore } from "../_shared/career_apply_questions.ts";
import { applicationsTurn, supabaseApplications } from "../_shared/career_apply_status.ts";
import { applyTurn } from "../_shared/career_apply_chat.ts";
import { evidenceResumeConfirmation, heldReply, resumeConfirmationContext } from "../_shared/career_router_evidence.ts";
import { cloudTurn, supabaseCloudOptinStore } from "../_shared/career_cloud_optin.ts";
import { CLOUD_CARD_INTENT, cloudCardYesTurn, personCloudCardStore } from "../_shared/career_cloud_card_chat.ts";
import { supabasePostingsDb, searchWords } from "../_shared/career_ingest.ts";
import { supabaseAlertStore } from "../_shared/career_alert_store.ts";
import { supabaseWantStore } from "../_shared/career_apply_want.ts";
import { supabaseMemoryStore } from "../_shared/agent/memory.ts";
import { codePending, readSituation } from "../_shared/career_situation.ts";
import { statusRecordsFrom } from "../_shared/career_capabilities.ts";
import { edgeRenderer, supabasePersonaStore, supabaseResumeStore } from "../_shared/career_tailor.ts";
import { supabaseMailStore } from "../_shared/career_mail_store.ts";
import { CONFIRM_INTENT, confirmWhichTurn, supabaseConfirmStore } from "../_shared/career_apply_confirm.ts";
import { EMAIL_INTENT, emailTurn, supabaseEmailStore, supabaseResumes } from "../_shared/career_apply_email.ts";
import { CAREER_SEND_SCOPE, careerTokenFor, sendMail } from "../_shared/career_mail_gmail.ts";
import { supabaseDigestStore, supabaseInterviewStore } from "../_shared/career_brief_store.ts";
import { draftFor, outreachTurn, supabaseOutreachStore } from "../_shared/career_outreach.ts";
import { hunterVerifier, supabaseCheckCache } from "../_shared/career_contacts.ts";
import { GMAIL_SEND_SCOPE } from "../_shared/career_outreach_gmail.ts";
import { missingIntegration } from "../_shared/agent/integrations.ts";
import { documentsOf, materializeArtifacts } from "../_shared/channel_artifacts.ts";

// WO-033: whether the person's career Google grant carries a scope (gmail.send for outreach). Read failures say "no".
async function careerGrantHas(admin: any, userId: string, scope: string): Promise<boolean> {
  const { data, error } = await admin.from("user_oauth_connections").select("scopes").eq("user_id", userId).eq("provider", "google_career").maybeSingle();
  if (error || !data) return false;
  const scopes = Array.isArray(data.scopes) ? data.scopes : String(data.scopes ?? "").split(/[\s,]+/);
  return scopes.includes(scope);
}
async function recordTurnCost(admin: any, userId: string, threadId: string, meter: ReturnType<typeof newMeter>) {
  const { error } = await admin.from("agent_turn_costs").insert({ user_id: userId, thread_id: threadId, provider: meter.provider, models: meter.models, calls: meter.calls, failed: meter.failed, input_tokens: meter.input_tokens, output_tokens: meter.output_tokens, cached_tokens: meter.cached_tokens, usd_micros: meter.usd_micros, unpriced: meter.unpriced });
  if (error) console.error("outreach turn cost not recorded:", error.message);
}

// WO-106 (F5): the reply to a batch ask the router would have "handed to the browser worker": what happened, nothing more.
export const BATCH_NOT_STARTED_REPLY = "I haven't started that batch: nothing was searched, prepared or sent. Applying runs in the Trainee extension in your browser, one posting at a time, and it shows you each filled application before anything is sent. Tell me the role and city, and I'll find live postings you can pick from.";
const MAX_MESSAGE_LEN = 4000; // M2: cap input size (same cap as handler.ts)

type TurnCtx = { note: string | null; user: string | null; thread: string | null };
// Host routes and task/batch planners share this existing JSON reply boundary.
type CareerTurnResult = {
  intent: string; reply: string; handler?: string | null; resultStatus?: string;
  contained?: boolean; capabilities?: unknown; action?: unknown;
  result?: Record<string, unknown>; task?: unknown; batch?: unknown;
  // WO-038: the reply as separate messages (an outreach batch), each delivered whole; `reply` stays the joined text.
  parts?: string[];
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
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // WO-100: the person's situation (every task in flight, the next steps, what Trainee can do), read once per turn,
    // before anything answers; a source that fails is named in it, never guessed. A code an employer emailed them, while
    // waiting, is removed from this text like a labeled one.
    const situation = await readSituation(admin, user.id, Date.now()).catch((e) => { console.error("situation:", e?.message ?? e); return null; });
    // Text, photos, or both (a photo alone is a message: spec 16 item 12).
    const input = chatInput(rawMessage, images, MAX_MESSAGE_LEN, { codePending: codePending(situation) });
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
    // WO-106 (F5): set only where a batch executor runs and drains career_batch_intent; unset, a batch ask is never "handed".
    const batchExecutorLive = Deno.env.get("CAREER_BATCH_EXECUTOR") === "on";
    const host = CareerHost.createCareerHost({ CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment, boardFor, delegateBatch });
    let careerTask;
    try { careerTask = normalizeCareerTaskRequest(body.career_task); }
    catch (_) { return json(cors, { error: "invalid_career_task", action: null, turn_key: turnKey }, 400); }
    let careerBatch;
    try { careerBatch = normalizeCareerBatchRequest(body.career_batch); }
    catch (_) { return json(cors, { error: "invalid_career_batch", action: null, turn_key: turnKey }, 400); }
    const requestHash = await careerRequestHash(rawMessage, imageBlocks, careerTask ?? (careerBatch ? { batch: careerBatch } : null));
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
        let q: any = admin.from(spec.table).select(spec.select)
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
      let postings: any[] = pool.postings;
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
      // MUSE-F-002: the thread's batch, if it has one, read back from the worker's own record so a plain-words status ask
      // answers with its true state. Read only; a failed read leaves the thread's standing state to answer.
      let batchRunRecord: unknown = null;
      const batchRunId = (loaded.snapshot as any)?.stores?.batchApplyState?.id;
      if (typeof batchRunId === "string" && batchRunId) {
        try { batchRunRecord = await persistence.readBatchRun({ userId: user.id, runId: batchRunId }); } catch (e) { console.error("career batch status: run record unreadable", (e as Error)?.message ?? e); }
      }
      const ctx = host.createTurnCtx({ userId: user.id, threadId: tid, now: Date.now(), accountPersistence: true, snapshot: loaded.snapshot, account: loaded.account, watchState: loaded.watchState, postings, batchRunRecord }) as ReturnType<typeof host.createTurnCtx> & {
        _hostPatch?: Record<string, unknown>; batchApplyState?: unknown; statusRecords?: unknown;
      };
      // WO-100: module 120's "what's connected" reads the live grants, the extension and the phone link (no address).
      if (situation) ctx.statusRecords = statusRecordsFrom(situation.capabilities);
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
        ? await questionsTurn({ message, userId: user.id, threadId: tid, now: Date.now(), store: supabaseQuestionStore(admin), situation,
          draft: { model: (payload) => callModel(draftCfg, payload, { meter: draftMeter, role: "chat" }), facts: () => ((ctx as any).profile?.facts ?? []) } })
        : null;
      // WO-032: the number that says which application an employer's email confirmed (only while that ask is the thread's
      // last word), and applying by email: "apply by email to Acme" shows the whole email drafted from confirmed facts,
      // and "yes" while it is the last word sends exactly that email once from the person's Gmail, only with
      // CAREER_EMAIL_SEND=on (WO-091c; off, the yes is told so and the card is kept). Code's, like the card.
      const free = !card && !mock && !asked && !careerTask && !careerBatch && !host.isHostControlled(message, ctx);
      const which = free ? await confirmWhichTurn({ message, userId: user.id, threadId: tid, store: supabaseConfirmStore(admin) }) : null;
      const sendToken = careerTokenFor({
        env: Deno.env, fetch, now: Date.now,
        connection: async (u) => {
          const { data, error } = await admin.from("user_oauth_connections").select("vault_name,scopes").eq("user_id", u).eq("provider", "google_career").maybeSingle();
          if (error) throw new Error(`read the career grant: ${error.message}`);
          return data ?? null;
        },
        readVault: async (name) => {
          const { data, error } = await admin.rpc("oauth_vault_read", { p_name: name });
          if (error) throw new Error("read the career grant's vault entry");
          return data ? String(data) : null;
        },
        writeVault: async (name, secret) => {
          const { error } = await admin.rpc("oauth_vault_store", { p_name: name, p_secret: secret });
          if (error) throw new Error("save the refreshed career grant");
        },
      }, CAREER_SEND_SCOPE);
      // The resume attached is WO-028's, tailored to the posting from confirmed facts, else the person's own file.
      const resumes = supabaseResumes(admin, { profile: () => ((ctx as any).profile ?? {}), tailor: { render: edgeRenderer(), resumes: supabaseResumeStore(admin) } });
      const emailed = free && !which
        ? await emailTurn({ message, userId: user.id, threadId: tid, now: Date.now(), deps: {
          store: supabaseEmailStore(admin), profile: () => ((ctx as any).profile ?? {}), resume: resumes.resume, attachment: resumes.attachment,
          draft: { model: (payload) => callModel(draftCfg, payload, { meter: draftMeter, role: "chat" }), facts: () => ((ctx as any).profile?.facts ?? []) },
          canSend: async (u) => !!(await sendToken(u)), send: (u, m) => sendMail({ fetch, token: sendToken }, u, m),
          // WO-091c: email goes from people's own Gmail only once the owner turns it on, like outreach.
          sendOn: Deno.env.get("CAREER_EMAIL_SEND") === "on",
        } })
        : null;
      if (draftMeter.calls) {
        const m = draftMeter;
        const { error: costErr } = await admin.from("agent_turn_costs").insert({ user_id: user.id, thread_id: tid, provider: m.provider, models: m.models, calls: m.calls, failed: m.failed, input_tokens: m.input_tokens, output_tokens: m.output_tokens, cached_tokens: m.cached_tokens, usd_micros: m.usd_micros, unpriced: m.unpriced });
        if (costErr) console.error("essay draft cost not recorded:", costErr.message);
      }
      // WO-033: the outreach batch and the one text that answers it ("send all", "send 1-7,9", "redo 3", "skip 4", "edit 3:
      // ..."), code's like the card, only while the batch is this thread's last word. The approval binds each exact
      // message; sending is the scheduled run's. A store that cannot be read sends the text on to the brain, never a guess.
      const outreachStore = supabaseOutreachStore(admin), outreachMeter = newMeter();
      const outreachModel = (payload: any) => callModel({ ...modelConfig(Deno.env, "chat"), model: Deno.env.get("CAREER_MODEL") || "gpt-5-mini" }, payload, { meter: outreachMeter, role: "chat" });
      const outreachAns = !card && !mock && !asked && !which && !emailed && !careerTask && !careerBatch && !host.isHostControlled(message, ctx)
        ? await outreachTurn({ message, userId: user.id, threadId: tid, now: Date.now(), store: outreachStore, events, tz: undefined,
            redraft: (d) => draftFor({ model: outreachModel, facts: ((ctx as any).profile?.facts ?? []), r: d.recipient, previous: d.body }),
            gmailConnected: () => careerGrantHas(admin, user.id, GMAIL_SEND_SCOPE), connectAsk: missingIntegration("gmail") })
          .catch((e) => { console.error("outreach turn:", e?.message ?? e); return null; })
        : null;
      if (outreachMeter.calls) await recordTurnCost(admin, user.id, tid, outreachMeter);
      // WO-039: the cloud on and off, code's like the card: "apply for me in the cloud" shows the exact terms, a "yes" while
      // they are the thread's last word (and nothing was texted since) turns it on, and "cloud off" turns it off at any time.
      const cloud = !card && !mock && !asked && !which && !emailed && !outreachAns && !careerTask && !careerBatch && !host.isHostControlled(message, ctx)
        ? await cloudTurn({ message, userId: user.id, threadId: tid, now: Date.now(), store: supabaseCloudOptinStore(admin) })
        : null;
      // Option A (chosen 2026-10-22 under the owner's delegation): a text yes never approves or sends; only the person's
      // tap on the exact payload does. A "yes" while the cloud card is the thread's last word only opens that card, read
      // as the person. Never on a channel's service-role turn.
      const cardYes = !card && !mock && !asked && !which && !emailed && !outreachAns && !cloud && !careerTask && !careerBatch && !host.isHostControlled(message, ctx)
        ? await cloudCardYesTurn({ message, threadId: tid, ownSession: !isBridgeCall, store: personCloudCardStore(supabase) })
        : null;
      // SUBMIT-STEER-1130: "did my application to Acme go through?", "where are my applications": answered from
      // career_apply_jobs, the one record of what was sent, code's like the card. Submitted is said only as recorded;
      // "confirmed" only when the employer confirmed it; an unreadable record is said, never guessed.
      // STEP 4 F1 (2026-10-25): "apply to the <role> role at <Company>" puts the open posting on file into the person's
      // own apply queue (career_apply_wanted), the queue the extension takes from and the server's prepare-ahead run
      // reads; code's, like the card. The reply says what was queued and that nothing is prepared, filled or sent by
      // it. No product ceiling (owner, 2026-10-22; CAPS-1390): only a daily pace the person set themselves is read, and
      // only on an apply ask; the once-per-employer guard and the card's approval stand.
      const queued = !card && !mock && !asked && !which && !emailed && !outreachAns && !cloud && !cardYes && !careerTask && !careerBatch && !host.isHostControlled(message, ctx)
        ? await applyTurn({
          message, userId: user.id, now: Date.now(), postings: supabasePostingsDb(admin), wants: supabaseWantStore(admin),
          apps: () => supabaseApplications(admin)(user.id), facts: CareerProfile.confirmedFacts((ctx as any).profile ?? {}),
          limits: async () => { try { const r: any = await admin.rpc("career_apply_daily_limit", { p_user: user.id }); return { daily: r.error || r.data === null ? undefined : Number(r.data) || undefined }; } catch { return undefined; } },
        })
        : null;
      const status = !card && !mock && !asked && !which && !emailed && !outreachAns && !cloud && !cardYes && !queued && !careerTask && !careerBatch && !host.isHostControlled(message, ctx)
        ? await applicationsTurn({ message, userId: user.id, now: Date.now(), read: supabaseApplications(admin) })
        : null;
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
      } else if (which) {
        // A number not on the list leaves the ask waiting; anything else answered it.
        out = { reply: which.reply, intent: which.status === "not_on_list" ? CONFIRM_INTENT : "career_apply_confirm_answer", resultStatus: which.status, contained: false, handler: "confirm" };
      } else if (emailed) {
        // A card waiting for its yes is this thread's last word, by its id (meta.email_card): a yes counts only for the card
        // this reply showed. Anything else answered it, and leaves no email waiting.
        out = { reply: emailed.reply, intent: emailed.waiting ? EMAIL_INTENT : "career_apply_email_answer", resultStatus: emailed.status, contained: false, handler: "email" };
        if (emailed.waiting && emailed.card_id) agentMeta = { email_card: emailed.card_id };
      } else if (outreachAns) {
        out = { reply: outreachAns.reply, intent: outreachAns.intent, resultStatus: outreachAns.status, contained: false, handler: "outreach", ...(outreachAns.parts ? { parts: outreachAns.parts } : {}) };
      } else if (cloud) {
        out = { reply: cloud.reply, intent: cloud.intent, resultStatus: cloud.status, contained: false, handler: "cloud" };
      } else if (cardYes) {
        // The card stays the last word, so the app shows it again; its Approve is the only way anything is sent.
        out = { reply: cardYes.reply, intent: CLOUD_CARD_INTENT, resultStatus: cardYes.status, contained: false, handler: "cloud_card" };
        agentMeta = { career_approval_card_id: cardYes.card_id, open_card: cardYes.card_id };
      } else if (queued) {
        out = { reply: queued.reply, intent: queued.intent, resultStatus: queued.status, contained: false, handler: "apply_queue" };
      } else if (status) {
        out = { reply: status.reply, intent: status.intent, resultStatus: status.status, contained: false, handler: "status" };
      } else if (!careerTask && !careerBatch && AGENT_BRAIN_RELEASED && chooseBrain(Deno.env) === "agent" && !host.isHostControlled(message, ctx)) {
        const meter = newMeter();
        const cfg = { ...modelConfig(Deno.env, "chat"), model: Deno.env.get("CAREER_MODEL") || "gpt-5-mini" };
        // WO-027 (B5): the last 40 messages after the latest erase; one more row says whether the thread is longer.
        const hist = await admin.from("agent_messages").select("role,content,meta").eq("thread_id", tid).order("id", { ascending: false }).limit(HISTORY_WINDOW + 1);
        if (hist.error) throw new Error(`agent history: ${hist.error.message}`);
        const win = historyWindow((hist.data || []) as any[]), history = win.history;
        const postingsDb = supabasePostingsDb(admin);
        // WO-023: what is known about the person, every turn. Standing instructions are fundamental: if they cannot be
        // read the turn fails rather than answer without them. Alerts say "could not be read" instead; the applications
        // are the situation read at the top of the turn (WO-100), which names what it could not read.
        const memory = supabaseMemoryStore(admin), alertStore = supabaseAlertStore(admin), now = Date.now();
        const standing = await memory.standing(user.id);
        const alertRow = await alertStore.get(user.id).catch((e) => { console.error("agent memory: alerts", e?.message ?? e); return null; });
        // WO-027: the account's timeline, written by the tools and read by recall; past the window, a summary of it written
        // in code. A timeline that cannot be read never fails the turn: the summary says so instead.
        const tz = alertRow?.tz;
        const recent = win.cut ? await events.recall(user.id, { limit: 200 }).catch((e) => { console.error("agent memory: events", e?.message ?? e); return null; }) : null;
        const summary = summaryFor(win.cut, recent, now, tz);
        // WO-066: the person's own daily application limit (the queue's SQL holds the same bound); unread, the default.
        const daily = await admin.rpc("career_apply_daily_limit", { p_user: user.id }).then((r: any) => r.error ? undefined : Number(r.data) || undefined, () => undefined);
        const turn = await agentTurn({ message, history, stores: ctx as unknown as Record<string, unknown>, userId: user.id, threadId: tid, now,
          model: (payload) => callModel(cfg, payload, { meter, role: "chat" }), postings: (q) => postingsDb.search(searchWords(q), 150), alerts: alertStore,
          mail: supabaseMailStore(admin), interviews: supabaseInterviewStore(admin), digest: supabaseDigestStore(admin),
          events, tz, summary, hired: hiredSourceFromEnv(Deno.env, admin),
          // WO-033: drafts from the person's lists (the model writes, the fact-lock checks), and Hunter when its key is set.
          outreach: { store: outreachStore, model: (payload) => callModel(cfg, payload, { meter, role: "chat" }) },
          verifier: hunterVerifier({ fetch, apiKey: Deno.env.get("HUNTER_API_KEY"), cache: supabaseCheckCache(admin), now: Date.now }),
          tailor: { posting: (id) => postingsDb.get(id), personas: supabasePersonaStore(admin), resumes: supabaseResumeStore(admin), render: edgeRenderer() },
          // WO-066: "apply me to these" puts the postings in the person's own queue; the extension prepares each, and each
          // goes only on its card's tap.
          wants: supabaseWantStore(admin), limits: { daily }, posting: (id) => postingsDb.get(id),
          // WO-106 (F4): each job link is checked against its board just before it is shown.
          linkCheck: linkChecker(fetch, { userAgent: `Trainee job link check (contact: ${Deno.env.get("INGEST_CONTACT_EMAIL") || "unset"})` }),
          known: { standing, alerts: alertRow ? { prefs: alertRow.prefs, tz: alertRow.tz } : null, pipeline: null, situation }, memory });
        if (meter.calls) {
          const { error: costErr } = await admin.from("agent_turn_costs").insert({ user_id: user.id, thread_id: tid, provider: meter.provider, models: meter.models, calls: meter.calls, failed: meter.failed, input_tokens: meter.input_tokens, output_tokens: meter.output_tokens, cached_tokens: meter.cached_tokens, usd_micros: meter.usd_micros, unpriced: meter.unpriced });
          if (costErr) console.error("agent turn cost not recorded:", costErr.message);
        }
        if (turn.stopped === "model_error" && !turn.tool_calls.some((t) => t.ok && t.effect === "write_own")) {
          console.error("agent brain: model unavailable, answering with the router");
          out = host.runTurn(message, ctx);
        } else {
          // A batch of outreach drafts is shown by code, and its intent makes the next text an answer to it.
          out = { reply: turn.reply, intent: turn.show?.intent ?? "agent", resultStatus: turn.stopped, contained: false, handler: "agent", ...(turn.show?.parts ? { parts: turn.show.parts } : {}) };
          agentMeta = { brain: "agent", tool_calls: turn.tool_calls, stopped: turn.stopped, pending_approvals: turn.pending_approvals.length };
        }
      } else {
        out = host.runTurn(message, ctx);
      }
      // SUBMIT-STEER-1130: the router's confirm of a pasted resume carries no confirmation event, so no application could
      // ever use it. Each fact this turn confirmed whose words Trainee showed the person, and that is in their own upload,
      // gets its persisted fact_confirmed event and an owner provenance; anything else stays unevidenced. Saved with the
      // turn below. The thread is read only on the router's resume confirm.
      if (out.handler !== "agent" && out.intent === "career_resume_ingest" && out.resultStatus === "completed") {
        const recent = await admin.from("agent_messages").select("id,role,content").eq("thread_id", tid).order("id", { ascending: false }).limit(40);
        if (recent.error) {
          // The thread could not be read, so nothing the router confirmed can be evidenced: held, and said.
          console.error("career evidence: the thread was not read", recent.error.message);
          const ev = await evidenceResumeConfirmation({ userId: user.id, now: Date.now(), message, before: (loaded.snapshot as any)?.stores?.profile ?? null,
            after: (ctx as any).profile ?? null, out, shown: null, upload: null, events });
          const held = heldReply(ev);
          if (held) out = { ...out, reply: held, resultStatus: "not_confirmed" };
        } else {
          const seen = await resumeConfirmationContext((recent.data ?? []) as any[], (ctx as any).profile);
          const ev = await evidenceResumeConfirmation({ userId: user.id, now: Date.now(), message, before: (loaded.snapshot as any)?.stores?.profile ?? null,
            after: (ctx as any).profile ?? null, out, shown: seen.shown, upload: seen.upload, events });
          if (ev.unshown || ev.untraced || ev.refused) console.error(`career evidence: held as drafts: ${ev.unshown} not shown, ${ev.untraced} not in the upload, ${ev.refused} event not recorded`);
          // A confirmation the host could not evidence is not claimed: those facts are drafts again, and the reply says so.
          const held = heldReply(ev);
          if (held) out = { ...out, reply: held, resultStatus: ev.stamped ? "partial" : "not_confirmed" };
        }
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
      } else if (delegateBatch && batchExecutorLive && !careerBatch && out.intent === "career_batch_apply" && out.result && out.result.batchDelegate && ctx.batchApplyState) {
        const plan = await planCareerBatchPrepare({ run: ctx.batchApplyState, userId: user.id, threadId: tid,
          turnKey, requestHash, accountVersion: loaded.accountVersion, account: loaded.account });
        if (plan) { batchIntent = plan.intent; out = { ...out, batch: plan.batch }; }
      } else if (!careerBatch && out.intent === "career_batch_apply" && ((out as any).result?.batchDelegate || (out as any).batchDelegate)) {
        // WO-106 (F5; live 2026-10-21, MUSE-F-001/005): "I've handed this to the browser worker" committed a prepare intent
        // that no deployed process runs (batch-executor.cjs is reached only from tests; the worker's run.cjs never loads
        // it), so the batch sat "queued" forever. Until CAREER_BATCH_EXECUTOR=on says an executor drains the intents,
        // nothing is committed, the run is not kept, and the reply says exactly what happened and where applying runs.
        delete (ctx as any).batchApplyState;
        out = { ...out, reply: BATCH_NOT_STARTED_REPLY, resultStatus: "not_started" };
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
      const reminderLines = reminders.map((r:any) => typeof r.speak_line === "string" ? r.speak_line.slice(0,2000) : "").filter(Boolean);
      const visibleReply = [reply, ...reminderLines].join("\n");
      // The same reply as separate messages for a texting channel: the note, each part whole, then the reminders.
      const parts = out.parts ? [...(flowCtx.note ? [flowCtx.note] : []), ...out.parts, ...(artifactNote ? [artifactNote] : []), ...reminderLines] : null;
      const response = { thread_id: tid, reply: visibleReply, action: null, capabilities: out.capabilities, turn_key: turnKey, reminders, ...(out.task ? { task: out.task } : {}), ...(out.batch ? { batch: out.batch } : {}), ...(parts ? { parts } : {}), ...(artifactsField ? { artifacts: artifactsField } : {}), meta: { career: true, intent: out.intent, result_status: out.resultStatus, contained: out.contained, ...(agentMeta || {}) } };
      const saved = await persistence.commit({ userId: user.id, threadId: tid, turnKey, requestHash, revision: loaded.revision, accountVersion: loaded.accountVersion, snapshot: host.extractSnapshot(ctx), patch: ctx._hostPatch, input: userContent, response, taskIntent, batchIntent });
      // WO-028: "forget everything" also removes the tailored resumes (they carry the person's name and email); best
      // effort, after the erase is recorded, like the rest of the erase's side effects.
      if (ctx._hostPatch?.erase === true) await supabaseResumeStore(admin).removeAll(user.id).catch((e) => console.error("career erase: resumes", e?.message ?? e));
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
