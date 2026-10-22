// Intent planning only. SQL commits this intent with the reply receipt.
// No HTTP worker transport or browser effect is permitted in a chat turn.
const VERSION = "career_task_intent/v1";
const fail = () => { throw Object.assign(new Error("invalid_career_task"), { code: "invalid_career_task" }); };
const hash64 = v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const id32 = v => typeof v === "string" && /^[a-f0-9]{32}$/.test(v);
export function normalizeCareerTaskRequest(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return fail();
  const fields = {
    prepare: ["action", "version", "eventId", "artifactId", "resumeSha256"],
    approve: ["action", "version", "eventId", "taskId", "payloadSha256", "resumeSha256", "profileSha256", "destination"],
    status: ["action", "version", "taskId", "intentId"],
    reconcile: ["action", "version", "eventId", "taskId"],
  }[value.action];
  if (!fields || Object.keys(value).some(k => !fields.includes(k)) || (value.version && value.version !== VERSION)) return fail();
  const out = { version: VERSION, action: value.action };
  for (const key of fields) if (key !== "version" && value[key] !== undefined) out[key] = value[key];
  if (out.action !== "status" && (typeof out.eventId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(out.eventId))) return fail();
  if (out.action === "prepare" && (!/^[A-Za-z0-9_-]{1,160}$/.test(out.artifactId || "") || !hash64(out.resumeSha256))) return fail();
  if (["approve", "reconcile"].includes(out.action) && !id32(out.taskId)) return fail();
  if (out.action === "status" && ((!id32(out.taskId) && !hash64(out.intentId)) || (out.taskId && out.intentId))) return fail();
  if (out.action === "approve") {
    if (!hash64(out.payloadSha256) || !hash64(out.resumeSha256) || (out.profileSha256 != null && !hash64(out.profileSha256))) return fail();
    let url; try { url = new URL(out.destination); } catch (_) { return fail(); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash || url.href !== out.destination) return fail();
  }
  return out;
}
export async function planCareerTaskIntent({ taskRequest, message, userId, threadId, turnKey, requestHash, ctx, accountVersion, account, persistence }) {
  const reply = (text, status, task = null) => ({ reply: text, intent: "career_browser_task", resultStatus: status,
    contained: false, task, capabilities: ctx.workerCapabilities, result: { task, sends: 0 } });
  if (taskRequest.action === "status") {
    const task = await persistence.readTask({ userId, taskId: taskRequest.taskId || null, intentId: taskRequest.intentId || null });
    return { intent: null, out: reply(task ? "The owned browser task's saved evidence is attached. No new browser action was started." : "No owned task evidence is available for that reference.", task?.status || "awaiting_user", task) };
  }
  if (taskRequest.action === "approve" && message !== "Approve browser task " + taskRequest.taskId) {
    return { intent: null, out: reply("Approve the specific browser task explicitly from its exact review; a bare yes authorizes nothing.", "awaiting_user") };
  }
  if (taskRequest.action === "prepare" && (!ctx.posting?.url || !ctx.posting?.canonicalKey)) {
    return { intent: null, out: reply("Choose the posting and existing owned resume artifact before queuing browser preparation.", "awaiting_user") };
  }
  const bytes = new TextEncoder().encode(JSON.stringify([VERSION, userId, threadId, turnKey, requestHash]));
  const intentId = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
  const intent = { version: VERSION, intent_id: intentId, user_id: userId, thread_id: threadId, turn_key: turnKey,
    request_hash: requestHash, action: taskRequest.action, task_id: taskRequest.taskId || null, event_id: taskRequest.eventId,
    artifact_id: taskRequest.artifactId || null, resume_sha256: taskRequest.resumeSha256 || null,
    payload_sha256: taskRequest.payloadSha256 || null, profile_sha256: taskRequest.profileSha256 || null,
    destination: taskRequest.action === "prepare" ? ctx.posting.url : taskRequest.destination || null,
    authority_account_version: accountVersion + 1, privacy_epoch: account.epoch || 0 };
  const task = { version: VERSION, id: intent.task_id, userId, status: "queued", kind: "pending_task_intent",
    intent_id: intentId, bindings: intent, provenance: { source: "atomic_career_task_intent", threadId, turnKey } };
  return { intent, out: reply("The browser task intent is queued for a separate worker. No browser action is claimed by this chat reply; its immutable intent reference is attached.", "queued", task) };
}

// ---------------------------------------------------------------------------
// J8 (LOOP ACCEPTANCE tier-1 join, Crew B 2026-10-15): board resolution
// for the batch-apply drive stage (module 155). 155's deps take a
// SYNCHRONOUS boardFor(posting) -> board | null, where a board is
// module 149's contract — the methods open/form/fill/answers/atReview/
// submit — and null is the named stop BOARD_NOT_WIRED.
//
// The owned browser worker supplies board sessions inside its own
// process (150's board factory, executed from committed
// career_task_intent/v1 intents — the asynchronous path above). A
// composition root that can supply sessions synchronously installs a
// PROVIDER here: an object { boardFor(posting), transport? }. This
// factory is the single resolution point every composition root (the
// Edge handler, the harness) goes through, so the wiring cannot drift.
//
// Fail-closed, always: no provider, a provider whose boardFor throws
// (worker unreachable), a provider that returns nothing, or a returned
// object missing any of 149's board methods all resolve to null and no
// board is ever faked into existence. The stop's NAME follows the
// reason (F-035): a provider throw is recorded on the wrapper
// (careerBoardFor.lastRefusal) and module 155 names the stop by that
// code; BOARD_NOT_WIRED is reserved for the no-adapter case. A bare UPMORE_CAREER_WORKER_URL is NOT a provider: it
// addresses the worker's asynchronous task API (the intent path at the
// top of this file); it cannot vend synchronous board sessions and is
// never treated as one.
const BOARD_METHODS = ["open", "form", "fill", "answers", "atReview", "submit"];
export function createCareerBoardFor(provider) {
  if (!provider || typeof provider.boardFor !== "function") return null;
  // F-035 (bench-60 fix round, 2026-10-22): the catch below used to
  // erase the provider's coded refusal (SESSION_LIMIT 409,
  // DRIVER_HOST_REFUSED 403, shard_unavailable 502,
  // WORKER_UNREACHABLE…) into a bare null, and module 155 could only
  // name the resulting stop BOARD_NOT_WIRED — a saturation refusal
  // was indistinguishable from a genuinely unwired family. The
  // wrapper still fails closed to null (every composition root
  // relies on that contract), but the refusal is RECORDED on the
  // wrapper itself — careerBoardFor.lastRefusal = {code, message},
  // cleared at the start of every call and set only when that call
  // threw — so the caller can name the stop by the refusal's own
  // code. The constructed-without-transport case never reaches this
  // function (the factory above returns null), so it records
  // nothing and BOARD_NOT_WIRED keeps its one meaning.
  const careerBoardFor = function (posting, boardOpts) {
    careerBoardFor.lastRefusal = null;
    let board = null;
    try { board = provider.boardFor(posting, boardOpts); } catch (e) {
      careerBoardFor.lastRefusal = {
        code: (e && e.code) || "WORKER_BOARD_REFUSED",
        message: String((e && e.message) || e).slice(0, 300),
      };
      return null;
    }
    if (!board || typeof board !== "object") return null;
    for (const m of BOARD_METHODS) if (typeof board[m] !== "function") return null;
    return board;
  };
  careerBoardFor.lastRefusal = null;
  return careerBoardFor;
}

// ---------------------------------------------------------------------------
// J9 (LOOP ACCEPTANCE — the worker board provider, Crew B 2026-10-15):
// the real provider behind createCareerBoardFor. It talks to the owned
// browser worker's board service (workers/career-browser/
// board-service.cjs), which vends LIVE module-150 board sessions inside
// the worker process — per-user, expiring, verdict-gated at creation.
//
// The drive stack this serves (155 -> 149 -> the board contract) is
// synchronous end to end, so the provider takes an injected SYNCHRONOUS
// transport: transport({method, path, headers, body}) -> {status,
// body}. Node composition roots inject workers/career-browser/
// board-transport.cjs (a worker_threads HTTP pump); tests inject an
// in-process call into the service core — the double sits at the wire,
// never at the board. A runtime with no synchronous channel (the Deno
// Edge runtime today) injects nothing, and this factory returns null:
// not a provider, the bridge resolves null, the drive stops named
// BOARD_NOT_WIRED — an honest stop, never a WIRED claim for a path
// that cannot vend. workerUrl + secret (env UPMORE_CAREER_WORKER_URL /
// UPMORE_CAREER_WORKER_SECRET) + userId (the composition root's
// authenticated user — the provider is constructed per request, bound
// to that user) are likewise all required; any gap resolves null.
//
// boardFor(posting) creates the worker session synchronously. Any
// failure throws a CODED error (WORKER_UNREACHABLE, the service's own
// refusal code such as FAMILY_NOT_DRIVEABLE, WORKER_AUTH_REFUSED),
// which createCareerBoardFor already converts to null for the loop;
// the codes stay exact at this boundary for evidence and logs. The
// returned board declares kind "browser" / browserDriver true /
// sandbox false and the session's real atsFamily / host / accountName
// from the service's create response — 149's attested-board checks run
// against the worker's truth. Board-method failures rethrow with the
// worker board's own .code; a terminal failure (session expired,
// forbidden, gone, transport down) is cached on the board and
// rethrown on later calls WITHOUT touching the wire — nothing is
// retried blind at any layer.
// ---------------------------------------------------------------------------
// J10 (LOOP ACCEPTANCE — Leg 2, the deployed-runtime transport, Crew B
// 2026-10-15; design of record: joins doc "J10 — THE DEPLOYED-RUNTIME
// TRANSPORT: DESIGN"): batch intent planning, the career_task_intent/v1
// pattern batch-sized. The drive stack is synchronous and this Edge
// runtime has no synchronous transport, so the batch loop does NOT
// drive inside a chat turn (this file's standing law). Instead:
//
//   ask turn    -> the router seam (delegate mode) creates the run
//                  skeleton; planCareerBatchPrepare turns it into a
//                  prepare intent the handler commits transactionally
//                  with the reply.
//   worker      -> the batch executor (workers/career-browser/
//                  batch-executor.cjs) claims intents and runs module
//                  155 in its own process, writing user-scoped batch
//                  run records (career_batch_run/v1).
//   status turn -> a structured career_batch status request reads the
//                  worker-written record back (owner-scoped; a foreign
//                  or unknown run id reads as nothing).
//   yes turn    -> a structured career_batch approve request + the
//                  exact message "Approve batch <runId>" commits an
//                  approve intent carrying the card set hash; the
//                  executor re-verifies it against the stored run
//                  before anything executes.
//
// The chat layer never claims a state the worker has not written:
// queued is queued, a prepared card is the worker's record, and a
// submission exists only when the worker's final run record says so.
const BATCH_VERSION = "career_batch_intent/v1";
const BATCH_RUN_VERSION = "career_batch_run/v1";
const batchRunIdOk = v => typeof v === "string" && /^batch-[A-Za-z0-9-]{4,96}$/.test(v);
const cardHashOk = v => typeof v === "string" && (/^[a-f0-9]{64}$/.test(v) || /^fnv1a-[a-f0-9]{1,16}$/.test(v));
const batchEventIdOk = v => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
export function normalizeCareerBatchRequest(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return fail();
  const fields = {
    approve: ["action", "version", "eventId", "runId", "cardSha256"],
    status: ["action", "version", "runId"],
  }[value.action];
  if (!fields || Object.keys(value).some(k => !fields.includes(k)) || (value.version && value.version !== BATCH_VERSION)) return fail();
  const out = { version: BATCH_VERSION, action: value.action };
  for (const key of fields) if (key !== "version" && value[key] !== undefined) out[key] = value[key];
  if (!batchRunIdOk(out.runId)) return fail();
  if (out.action === "approve" && (!batchEventIdOk(out.eventId) || !cardHashOk(out.cardSha256))) return fail();
  return out;
}
async function batchIntentId(userId, threadId, turnKey, requestHash) {
  const bytes = new TextEncoder().encode(JSON.stringify([BATCH_VERSION, userId, threadId, turnKey, requestHash]));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
}
export async function planCareerBatchPrepare({ run, userId, threadId, turnKey, requestHash, accountVersion, account }) {
  if (!run || typeof run !== "object" || !batchRunIdOk(run.id) || run.userId !== userId
    || typeof run.familyText !== "string" || !run.familyText || !Number.isSafeInteger(run.requested) || run.requested < 1
    || run.status !== "queued_prepare") return null;
  const intent = { version: BATCH_VERSION, intent_id: await batchIntentId(userId, threadId, turnKey, requestHash), user_id: userId, thread_id: threadId, turn_key: turnKey,
    request_hash: requestHash, action: "prepare", event_id: "prepare-" + run.id, run_id: run.id,
    family_text: run.familyText, count: run.requested, run,
    authority_account_version: accountVersion + 1, privacy_epoch: account.epoch || 0 };
  const batch = { version: BATCH_VERSION, id: run.id, userId, status: "queued", kind: "pending_batch_intent",
    intent_id: intent.intent_id, bindings: intent };
  return { intent, batch };
}
export async function planCareerBatchIntent({ batchRequest, message, userId, threadId, turnKey, requestHash, ctx, accountVersion, account, persistence, summarizeRun }) {
  const reply = (text, status, batch = null) => ({ reply: text, intent: "career_batch_apply", resultStatus: status,
    contained: false, batch, capabilities: ctx.workerCapabilities, result: { batch, sends: 0 } });
  if (batchRequest.action === "status") {
    const record = await persistence.readBatchRun({ userId, runId: batchRequest.runId });
    if (!record) return { intent: null, out: reply("No batch run is readable under that reference. A batch is only ever readable by its owner, and only once the browser worker has written it.", "awaiting_user") };
    const batch = { version: BATCH_RUN_VERSION, id: record.runId, userId, status: record.status, kind: "batch_run", summary: record.summary || null };
    let text = null;
    if (typeof summarizeRun === "function") { try { text = summarizeRun(record.run); } catch (_) { text = null; } }
    if (!text) text = `Batch ${record.runId}: status ${record.status}.`;
    return { intent: null, out: reply(text, typeof record.status === "string" ? record.status : "awaiting_user", batch) };
  }
  // action === "approve": the structured request carries the yes for
  // ONE named batch at ONE card hash; the message must name it too —
  // a bare yes authorizes nothing (the task path's discipline).
  if (message !== "Approve batch " + batchRequest.runId) {
    return { intent: null, out: reply("Approve the specific batch explicitly from its card; a bare yes authorizes nothing.", "awaiting_user") };
  }
  const record = await persistence.readBatchRun({ userId, runId: batchRequest.runId });
  if (!record || !record.run) {
    return { intent: null, out: reply("That batch is not readable yet — the browser worker has not written a prepared run under that reference, so there is no card to approve.", "awaiting_user") };
  }
  if (record.status !== "awaiting_approval" || !record.run.cardSha256) {
    return { intent: null, out: reply(`That batch is not waiting at a card (its status is ${record.status || "unknown"}) — ask for its status and approve only the card that is shown.`, "blocked") };
  }
  if (record.run.cardSha256 !== batchRequest.cardSha256) {
    return { intent: null, out: reply("The batch changed since the card you approved (its set hash no longer matches) — nothing was queued. Ask for the batch status, review the current card, and approve that one.", "blocked") };
  }
  const intent = { version: BATCH_VERSION, intent_id: await batchIntentId(userId, threadId, turnKey, requestHash), user_id: userId, thread_id: threadId, turn_key: turnKey,
    request_hash: requestHash, action: "approve", event_id: batchRequest.eventId, run_id: batchRequest.runId, card_sha256: batchRequest.cardSha256,
    authority_account_version: accountVersion + 1, privacy_epoch: account.epoch || 0 };
  const batch = { version: BATCH_VERSION, id: batchRequest.runId, userId, status: "queued", kind: "pending_batch_intent",
    intent_id: intent.intent_id, bindings: intent };
  return { intent, out: reply("Your yes is recorded for this batch exactly as carded — the browser worker will submit it under that approval and the results will read back here. This reply itself submitted nothing.", "queued", batch) };
}

export function createWorkerBoardProvider(opts) {
  const o = opts || {};
  const workerUrl = typeof o.workerUrl === "string" && o.workerUrl ? o.workerUrl : null;
  const secret = typeof o.secret === "string" && o.secret ? o.secret : null;
  const userId = typeof o.userId === "string" && o.userId ? o.userId : null;
  const transport = typeof o.transport === "function" ? o.transport : null;
  if (!workerUrl || !secret || !userId || !transport) return null;
  const headers = { "content-type": "application/json", "x-upmore-board-secret": secret };
  const codedError = (code, message) => Object.assign(new Error(message || code), { code });
  function callService(path, body) {
    let res;
    try { res = transport({ method: "POST", path, headers, body }); }
    catch (e) {
      if (e && e.code) throw codedError(e.code, e.message || e.code);
      throw codedError("WORKER_UNREACHABLE", `the career worker board service could not be reached (${(e && e.message) || "transport failed"})`);
    }
    if (!res || typeof res.status !== "number") throw codedError("WORKER_UNREACHABLE", "the career worker board service answered with no readable status");
    return res;
  }
  // WORKER RECOVERY (2026-10-21; root-cause note
  // docs/career/worker-unreachable-root-cause-2026-10-21.md): bounded
  // retry at the SESSION-CREATE seam only. The sync pump transport
  // intermittently loses a create whose answer is stuck behind a long
  // board call in the single-threaded board service. Re-asking a create
  // is safe: if it never arrived, no session exists; if it landed but
  // its answer was lost, the extra idle session is reaped by the
  // service's TTL. Board CALLS are never retried — a lost call answer
  // is ambiguous (the call may have executed) and the terminal rule in
  // call() stands. Answered refusals (any HTTP response) and
  // WORKER_TRANSPORT_TIMEOUT (which already waited out the transport's
  // full budget) are never retried either.
  const retryCfg = (o.createRetry && typeof o.createRetry === "object") ? o.createRetry : {};
  const CREATE_MAX_ATTEMPTS = Math.max(1, Math.min(8, retryCfg.maxAttempts || 4));
  // The ladder is deliberately short (0.75s -> 1.5s -> 3s): the retry
  // rides out seconds-scale contention on a LIVE service — each attempt
  // may itself wait behind the blocking call — it does not resurrect a
  // dead worker (the executor's next tick owns that). A long ladder
  // would be paid once per application by a whole batch before the
  // batch could name the worker down.
  const CREATE_BASE_DELAY_MS = Math.max(0, Math.min(10000, retryCfg.baseDelayMs != null ? retryCfg.baseDelayMs : 750));
  const CREATE_DEADLINE_MS = Math.max(0, retryCfg.deadlineMs != null ? retryCfg.deadlineMs : 30000);
  const nowFn = typeof o.now === "function" ? o.now : () => Date.now();
  const sleepSync = typeof o.sleepSync === "function" ? o.sleepSync : (ms) => {
    if (!(ms > 0)) return;
    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
    catch (_) { const end = Date.now() + ms; while (Date.now() < end) { /* bounded fallback spin (retry sleeps are seconds) */ } }
  };
  function createSessionWithRetry(url) {
    const startedAt = nowFn();
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try { return callService("/board-sessions", { userId, url }); }
      catch (e) {
        if (!e || e.code !== "WORKER_UNREACHABLE" || attempt >= CREATE_MAX_ATTEMPTS) throw e;
        const remaining = CREATE_DEADLINE_MS - (nowFn() - startedAt);
        if (remaining <= 0) throw e;
        const ladder = CREATE_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jittered = ladder * (0.75 + Math.random() * 0.5);
        sleepSync(Math.min(jittered, remaining));
      }
    }
  }
  // One client board bound to one board-service session. The create
  // path (boardFor, below) and the session-reuse path (boardFor with a
  // resume option) share this constructor, so a resumed board behaves
  // exactly like a created one — same call discipline, same terminal
  // death codes (410 SESSION_EXPIRED / 403 WORKER_SESSION_FORBIDDEN /
  // 404 WORKER_SESSION_GONE), same close.
  function boardFromSession(sessionId, created) {
    let terminal = null; // {code, message} — once dead, the board stays dead
    let closedBoard = false;
    // FR-395: the service-side board's rendered values (the widget's own
    // rendering of each fill), carried on call responses by the board
    // service and merged here so module 149's answer-observation hatch
    // can read board.renderedValues on the production path exactly as
    // it does on a local board.
    const renderedState = {};
    function call(method, args) {
      if (closedBoard) throw codedError("BOARD_CLOSED", "this worker board session is closed");
      if (terminal) throw codedError(terminal.code, terminal.message);
      let r;
      try { r = callService(`/board-sessions/${sessionId}/call`, { userId, method, args: args || [] }); }
      catch (e) { terminal = { code: e.code || "WORKER_UNREACHABLE", message: e.message || e.code }; throw e; }
      if (r.status === 410) { terminal = { code: "SESSION_EXPIRED", message: "the worker board session expired before this step — the application stops here; a fresh session must be prepared, and a stale session is never driven" }; throw codedError(terminal.code, terminal.message); }
      if (r.status === 403) { terminal = { code: "WORKER_SESSION_FORBIDDEN", message: "the worker refused this session for this user — board sessions are per-user and are never addressed across owners" }; throw codedError(terminal.code, terminal.message); }
      if (r.status === 404) { terminal = { code: "WORKER_SESSION_GONE", message: "the worker no longer holds this board session — it stops here rather than being silently recreated" }; throw codedError(terminal.code, terminal.message); }
      if (r.status !== 200 || !r.body) throw codedError("WORKER_PROTOCOL", `the career worker answered a board call with status ${r.status}`);
      if (r.body.ok === false) throw codedError(r.body.code || "BOARD_ERROR", r.body.message || "the worker board refused the call");
      if (r.body.renderedValues && typeof r.body.renderedValues === "object" && !Array.isArray(r.body.renderedValues)) {
        for (const [k, v] of Object.entries(r.body.renderedValues)) renderedState[k] = v;
      }
      return r.body.result;
    }
    return {
      kind: "browser", browserDriver: true, sandbox: false,
      atsFamily: created.atsFamily || null,
      host: created.host || "",
      accountName: created.accountName || null,
      workerSessionId: sessionId,
      get renderedValues() { return Object.assign({}, renderedState); },
      // FDSE-MISMATCH (2026-10-21): the same renderings through a
      // METHOD. The getter above is frozen at {} by any wrapper that
      // snapshots own properties (the drive harness's observation
      // wrapper did exactly that, and module 149's FR-395 hatch
      // silently never fired — a correct fill stopped as drift).
      // Methods survive delegation wrappers, so 149 prefers this
      // channel when present.
      renderedValue(fieldId) { return renderedState[fieldId]; },
      open() { return call("open", []); },
      form() { return call("form", []); },
      fill(fieldId, value) { return call("fill", [fieldId, value]); },
      answers() { return call("answers", []); },
      atReview() { return call("atReview", []); },
      armForSubmit(ctx) { return call("armForSubmit", [ctx || {}]); },
      submit() { return call("submit", []); },
      submissionState() { return call("submissionState", []); },
      close() {
        if (closedBoard) return;
        closedBoard = true;
        try { transport({ method: "POST", path: `/board-sessions/${sessionId}/close`, headers, body: { userId } }); } catch (_) { /* closing is best-effort; the service reaps by TTL regardless */ }
      },
    };
  }
  function boardFor(posting, boardOpts) {
    const url = posting && typeof posting.url === "string" ? posting.url : null;
    if (!url) throw codedError("BOARD_URL_REQUIRED", "a posting url is required to open a worker board session");
    // Session reuse (chunk 50%): bind to the board-service session a
    // prepare drive left live instead of creating a new one — the
    // filled page, still at its final review. No creation call is
    // made. The id is session material: it is never logged, and the
    // service enforces this user's ownership on every call (a foreign
    // session answers 403). The caller verifies the resumed board's
    // live state against the prepared payload before anything
    // proceeds (module 149's resumeApply); a board that does not
    // match is discarded, never filled on.
    if (boardOpts && boardOpts.resumeSessionId != null) {
      if (typeof boardOpts.resumeSessionId !== "string" || !/^[a-f0-9]{32}$/.test(boardOpts.resumeSessionId)) {
        throw codedError("WORKER_SESSION_ID_INVALID", "a resume session id must be the board service's session id");
      }
      return boardFromSession(boardOpts.resumeSessionId, {
        atsFamily: boardOpts.atsFamily || null, host: boardOpts.host || "", accountName: null,
      });
    }
    const res = createSessionWithRetry(url);
    if (res.status !== 201) {
      const raw = res.body && res.body.error ? String(res.body.error) : "WORKER_SESSION_REFUSED";
      const code = raw === "unauthorized" ? "WORKER_AUTH_REFUSED" : raw;
      throw codedError(code, `the career worker refused a board session (${raw})${res.body && res.body.reason ? `: ${res.body.reason}` : ""}`);
    }
    const created = res.body || {};
    const sessionId = typeof created.sessionId === "string" && created.sessionId ? created.sessionId : null;
    if (!sessionId) throw codedError("WORKER_PROTOCOL", "the career worker answered session creation without a session id");
    return boardFromSession(sessionId, created);
  }
  return { transport: "career_worker_board", boardFor };
}
