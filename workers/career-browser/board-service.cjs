"use strict";
/* board-service.cjs — the worker board provider service (LOOP J9, Crew B,
   2026-10-15; design of record: joins doc "J9 — THE WORKER BOARD
   PROVIDER: DESIGN").

   What this is: a session service that lives in the owned browser
   worker's process, alongside the career_task_intent/v1 task worker
   (service.cjs / http.cjs / run.cjs — untouched by this build). It vends
   LIVE board sessions for module 155's batch-apply drive stage: each
   session is one module-150 browser board (the shared module's
   createBrowserBoard — never a fork, so the R-1 lane's widget
   primitives land here the day they land in 150), driven through
   module 149's board contract — open / form / fill / answers /
   atReview / armForSubmit / submit / submissionState.

   The drive stack is synchronous at every layer (155, 149, and 150's
   own helper bridge, which waits on files with Atomics.wait), so this
   core is synchronous too: `handle({method, path, headers, body}) ->
   {status, body}`, framework-free. createBoardHttpServer adapts
   node:http in run.cjs's pattern (loopback bind only).

   Security shape (each rule mirrors an existing worker precedent):
   - Caller auth is a shared secret in the `x-upmore-board-secret`
     header, compared timing-safe (the agent-message-worker's
     x-upmore-message-secret / AGENT_MESSAGE_WORKER_SECRET pattern).
     No secret configured -> every request is refused. The secret is
     never logged.
   - A session binds the userId that created it. EVERY later call must
     present the same userId or it is refused 403 user_mismatch WITHOUT
     touching the board (http.cjs's rule). An unknown session id is a
     bare 404 — no owner information crosses (the reachability suite's
     cross-owner standard). Session ids are 128-bit random hex.
   - Session creation passes module 150's own host gate (the §6.3
     allowlist) and then the FAMILY-VERDICT gate: the posting's ATS
     family must carry a driveable verdict from the injected verdict
     source (the R-1 lane's per-family verdict board). Fail-closed:
     no verdict => not driveable => FAMILY_NOT_DRIVEABLE. The gate
     lives here, at the one point no client can bypass.
   - Sessions expire on an idle TTL (default 10 minutes — the task
     worker's review-expiry precedent), refreshed by each call, and
     are closed on expiry / explicit close / sweep. An expired session
     answers 410 session_expired and can never be driven again: no
     stale-session submit is constructible. A per-user cap refuses
     excess sessions named SESSION_LIMIT.

   Board semantics cross the wire faithfully: a board method's return
   value crosses as {ok:true, result}; a board throw crosses as
   {ok:false, code, message} on a 200 (the CALL succeeded; the board
   refused) and the client board rethrows it with the same .code, so
   149/155 see exactly what a local 150 board would have produced.
   armForSubmit on a board that lacks it is a no-op success — 149 only
   calls it when present, and the proxy is always present, so the
   service reproduces the absent-method semantics rather than inventing
   an error. Employer execution truth is unchanged from the worker doc:
   boards open only what 150's gates allow, a captcha is a handoff
   outcome surfaced by the board itself, and nothing here solves,
   disguises, or retries anything. */
const http = require("node:http");
const crypto = require("node:crypto");

const BOARD_CALL_METHODS = ["open", "form", "fill", "answers", "atReview", "armForSubmit", "submit", "submissionState"];
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_SESSIONS_PER_USER = 32;
const DEFAULT_MAX_BODY_BYTES = 65536;

function secretMatches(given, secret) {
  if (typeof given !== "string" || !given || typeof secret !== "string" || !secret) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

function createBoardService(config) {
  const cfg = config || {};
  const secret = typeof cfg.secret === "string" && cfg.secret ? cfg.secret : null;
  const now = typeof cfg.now === "function" ? cfg.now : () => Date.now();
  const ttlMs = typeof cfg.sessionTtlMs === "number" && cfg.sessionTtlMs > 0 ? cfg.sessionTtlMs : DEFAULT_TTL_MS;
  const maxPerUser = typeof cfg.maxSessionsPerUser === "number" && cfg.maxSessionsPerUser > 0 ? cfg.maxSessionsPerUser : DEFAULT_MAX_SESSIONS_PER_USER;
  const verdicts = cfg.familyVerdicts != null ? cfg.familyVerdicts : null;
  const resolveResumePath = typeof cfg.resolveResumePath === "function" ? cfg.resolveResumePath : () => null;

  // The default factory and host gate ARE module 150 (shared, never
  // forked). Required lazily so this file loads in a bare checkout and
  // tests can inject both seams without Chromium existing at all.
  let portalBrowser = null;
  const loadPortalBrowser = () => {
    if (!portalBrowser) portalBrowser = require("../../packages/domain/150-career-portal-browser.js");
    return portalBrowser;
  };
  const boardFactory = typeof cfg.boardFactory === "function" ? cfg.boardFactory
    : (opts) => loadPortalBrowser().createBrowserBoard(opts);
  const hostGate = typeof cfg.hostAllowed === "function" ? cfg.hostAllowed
    : (url) => loadPortalBrowser().hostAllowed(url);

  const sessions = new Map(); // id -> {id, userId, board, family, createdAt, lastActivityAt}
  const counters = {
    sessionsCreated: 0, callsServed: 0,
    refused: { auth: 0, host: 0, verdict: 0, userMismatch: 0, expired: 0, sessionLimit: 0, notFound: 0 },
  };
  const respond = (status, body) => ({ status, body });
  const isExpired = (s) => now() - s.lastActivityAt > ttlMs;

  function verdictFor(familyKey) {
    if (!verdicts || !familyKey) return false;
    const v = typeof verdicts === "function" ? verdicts(familyKey) : verdicts[familyKey];
    return v === true || v === "driveable";
  }

  function destroy(session) {
    sessions.delete(session.id);
    try { if (session.board && typeof session.board.close === "function") session.board.close(); } catch (_) { /* a board that will not close is reaped here regardless */ }
  }

  function sweep() {
    let swept = 0;
    for (const s of Array.from(sessions.values())) if (isExpired(s)) { destroy(s); swept += 1; }
    return swept;
  }

  function createSession(body) {
    const userId = typeof body.userId === "string" && body.userId ? body.userId : null;
    const url = typeof body.url === "string" && body.url ? body.url : null;
    if (!userId || !url) return respond(400, { error: "bad_request", reason: "userId and url are required to open a board session" });
    const gate = hostGate(url);
    if (!gate || !gate.allowed) {
      counters.refused.host += 1;
      return respond(403, { error: "DRIVER_HOST_REFUSED", reason: "the posting host is outside the tested ATS families and localhost test pages (§6.3) — the driver refuses before any navigation" });
    }
    const familyKey = gate.atsFamily || (gate.kind === "local_test" ? "local" : null);
    if (!verdictFor(familyKey)) {
      counters.refused.verdict += 1;
      return respond(403, { error: "FAMILY_NOT_DRIVEABLE", family: familyKey, reason: `no driveable verdict stands for the ${familyKey || "unknown"} family today — the provider drives only families whose widget reality is measured driveable (R-1 verdict board)` });
    }
    let active = 0;
    for (const s of sessions.values()) if (s.userId === userId && !isExpired(s)) active += 1;
    if (active >= maxPerUser) {
      counters.refused.sessionLimit += 1;
      return respond(409, { error: "SESSION_LIMIT", reason: `this user already holds ${active} live board sessions (cap ${maxPerUser})` });
    }
    let resumePath = null;
    try { resumePath = resolveResumePath(userId) || null; } catch (_) { resumePath = null; }
    let board;
    try { board = boardFactory({ url, userId, resumePath, atsFamily: gate.atsFamily || null }); }
    catch (e) { return respond(409, { error: (e && e.code) || "BOARD_CREATE_FAILED", reason: String((e && e.message) || e).slice(0, 200) }); }
    if (!board || typeof board !== "object") return respond(409, { error: "BOARD_CREATE_FAILED", reason: "the board factory returned no board" });
    const id = crypto.randomBytes(16).toString("hex");
    const t = now();
    sessions.set(id, { id, userId, board, family: familyKey, createdAt: t, lastActivityAt: t });
    counters.sessionsCreated += 1;
    return respond(201, {
      sessionId: id,
      atsFamily: board.atsFamily || gate.atsFamily || null,
      host: board.host || gate.host || "",
      kind: board.kind || "browser",
      browserDriver: board.browserDriver === true,
      sandbox: board.sandbox === true,
      accountName: board.accountName || null,
      family: familyKey,
    });
  }

  function ownedSession(id, body) {
    const session = sessions.get(id);
    if (!session) { counters.refused.notFound += 1; return { failure: respond(404, { error: "session_not_found" }) }; }
    if (typeof body.userId !== "string" || body.userId !== session.userId) {
      counters.refused.userMismatch += 1;
      return { failure: respond(403, { error: "user_mismatch", reason: "board sessions are per-user — a session is only ever addressed by the user who created it" }) };
    }
    if (isExpired(session)) {
      destroy(session);
      counters.refused.expired += 1;
      return { failure: respond(410, { error: "session_expired", reason: "the board session expired — a fresh session must be prepared; a stale session is never driven" }) };
    }
    return { session };
  }

  function callBoard(id, body) {
    const { session, failure } = ownedSession(id, body);
    if (failure) return failure;
    const method = typeof body.method === "string" ? body.method : "";
    if (!BOARD_CALL_METHODS.includes(method)) return respond(400, { error: "method_not_allowed", method: method || null });
    const board = session.board;
    if (typeof board[method] !== "function") {
      if (method === "armForSubmit") { session.lastActivityAt = now(); return respond(200, { ok: true, result: { armed: false, absent: true } }); }
      return respond(200, { ok: false, code: "BOARD_METHOD_MISSING", message: `the worker board has no ${method}()` });
    }
    const args = Array.isArray(body.args) ? body.args : [];
    try {
      const result = board[method](...args);
      session.lastActivityAt = now();
      counters.callsServed += 1;
      return respond(200, { ok: true, result: result === undefined ? null : result });
    } catch (e) {
      session.lastActivityAt = now();
      counters.callsServed += 1;
      return respond(200, { ok: false, code: (e && e.code) || "BOARD_ERROR", message: String((e && e.message) || e).slice(0, 300) });
    }
  }

  function closeSession(id, body) {
    const session = sessions.get(id);
    if (!session) { counters.refused.notFound += 1; return respond(404, { error: "session_not_found" }); }
    if (typeof body.userId !== "string" || body.userId !== session.userId) {
      counters.refused.userMismatch += 1;
      return respond(403, { error: "user_mismatch", reason: "board sessions are per-user — a session is only ever addressed by the user who created it" });
    }
    destroy(session);
    return respond(200, { ok: true, closed: true });
  }

  function handle(request) {
    const req = request || {};
    const headers = req.headers || {};
    if (!secret || !secretMatches(headers["x-upmore-board-secret"], secret)) {
      counters.refused.auth += 1;
      return respond(401, { error: "unauthorized" });
    }
    if ((req.method || "") !== "POST") return respond(405, { error: "method_not_allowed" });
    const path = String(req.path || "");
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (path === "/board-sessions") return createSession(body);
    const m = path.match(/^\/board-sessions\/([a-f0-9]{32})\/(call|close)$/);
    if (m) return m[2] === "call" ? callBoard(m[1], body) : closeSession(m[1], body);
    return respond(404, { error: "not_found" });
  }

  return {
    handle, sweep,
    sessionCount: () => sessions.size,
    counters: () => JSON.parse(JSON.stringify(counters)),
  };
}

// node:http adapter — run.cjs's pattern: read the body with a cap,
// hand the framework-free core a plain request, write its plain reply.
function createBoardHttpServer(service, opts) {
  const o = opts || {};
  const maxBodyBytes = typeof o.maxBodyBytes === "number" ? o.maxBodyBytes : DEFAULT_MAX_BODY_BYTES;
  const server = http.createServer(async (req, res) => {
    let size = 0; const chunks = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBodyBytes) { res.writeHead(413, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "body_too_large" })); return; }
        chunks.push(chunk);
      }
    } catch (_) { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "bad_request" })); return; }
    let body = {};
    const text = Buffer.concat(chunks).toString("utf8");
    if (text) {
      try { body = JSON.parse(text); } catch (_) { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "bad_json" })); return; }
    }
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = v;
    const out = service.handle({ method: req.method, path: String(req.url || "").split("?")[0], headers, body });
    res.writeHead(out.status, { "content-type": "application/json" });
    res.end(JSON.stringify(out.body));
  });
  return server;
}

function startBoardService(config) {
  const cfg = config || {};
  const service = createBoardService(cfg);
  const server = createBoardHttpServer(service, cfg);
  const sweepMs = cfg.sweepMs != null ? cfg.sweepMs : 30000;
  let timer = null;
  if (sweepMs > 0) { timer = setInterval(() => { try { service.sweep(); } catch (_) { /* a failed sweep retries next tick */ } }, sweepMs); if (timer.unref) timer.unref(); }
  server.on("close", () => { if (timer) clearInterval(timer); });
  server.listen(cfg.port || 0, "127.0.0.1");
  return { server, service };
}

if (require.main === module) {
  // Operator-owned configuration only, never loaded from chat (the
  // run.cjs pattern): the config module exports { port, secret,
  // familyVerdicts, resolveResumePath?, sessionTtlMs? }.
  const path = require("node:path");
  if (!process.argv[2] || !path.isAbsolute(process.argv[2])) throw new Error("usage: node board-service.cjs /absolute/operator-config.cjs");
  const { server } = startBoardService(require(process.argv[2]));
  server.on("listening", () => console.log("Career board service listening on", server.address().port));
}

module.exports = { createBoardService, createBoardHttpServer, startBoardService, BOARD_CALL_METHODS };
