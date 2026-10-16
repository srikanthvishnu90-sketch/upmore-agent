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
// object missing any of 149's board methods all resolve to null — the
// drive stops named BOARD_NOT_WIRED and no board is ever faked into
// existence. A bare UPMORE_CAREER_WORKER_URL is NOT a provider: it
// addresses the worker's asynchronous task API (the intent path at the
// top of this file); it cannot vend synchronous board sessions and is
// never treated as one.
const BOARD_METHODS = ["open", "form", "fill", "answers", "atReview", "submit"];
export function createCareerBoardFor(provider) {
  if (!provider || typeof provider.boardFor !== "function") return null;
  return function careerBoardFor(posting) {
    let board = null;
    try { board = provider.boardFor(posting); } catch (_) { return null; }
    if (!board || typeof board !== "object") return null;
    for (const m of BOARD_METHODS) if (typeof board[m] !== "function") return null;
    return board;
  };
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
  function boardFor(posting) {
    const url = posting && typeof posting.url === "string" ? posting.url : null;
    if (!url) throw codedError("BOARD_URL_REQUIRED", "a posting url is required to open a worker board session");
    const res = callService("/board-sessions", { userId, url });
    if (res.status !== 201) {
      const raw = res.body && res.body.error ? String(res.body.error) : "WORKER_SESSION_REFUSED";
      const code = raw === "unauthorized" ? "WORKER_AUTH_REFUSED" : raw;
      throw codedError(code, `the career worker refused a board session (${raw})${res.body && res.body.reason ? `: ${res.body.reason}` : ""}`);
    }
    const created = res.body || {};
    const sessionId = typeof created.sessionId === "string" && created.sessionId ? created.sessionId : null;
    if (!sessionId) throw codedError("WORKER_PROTOCOL", "the career worker answered session creation without a session id");
    let terminal = null; // {code, message} — once dead, the board stays dead
    let closedBoard = false;
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
      return r.body.result;
    }
    return {
      kind: "browser", browserDriver: true, sandbox: false,
      atsFamily: created.atsFamily || null,
      host: created.host || "",
      accountName: created.accountName || null,
      workerSessionId: sessionId,
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
  return { transport: "career_worker_board", boardFor };
}
