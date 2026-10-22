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
// REAP-ON-CRASH (bench-60 fix round, 2026-10-22; root-cause note
// docs/apply/ROOT-CAUSE-BENCH60-FIX-2026-10-22.md): a board call that
// throws one of these signatures means the session's PAGE IS GONE —
// module 150's helper answered with a crash signature, or the helper
// itself was killed on a timeout (150 terminates it; every page it
// held dies with it), or the board was already closed. Such a
// session is destroyed at the failing call, freeing its per-user
// cap slot immediately, instead of squatting it until the idle TTL
// (measured in the bench: crash zombies filled the cap, new creates
// were refused 409 SESSION_LIMIT, and the bridge mislabeled the
// saturation BOARD_NOT_WIRED). Any OTHER throw is a live board
// declining a call and never reaps.
const BOARD_DEATH_CODES = new Set(["BOARD_CLOSED", "DRIVER_TIMEOUT"]);
const BOARD_DEATH_MESSAGE = /target crashed|target page, context or browser has been closed|browser has been closed|page crashed|page has been closed|session closed/i;
function boardDied(code, message) {
  if (BOARD_DEATH_CODES.has(code)) return true;
  return BOARD_DEATH_MESSAGE.test(message || "");
}
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_SESSIONS_PER_USER = 32;
const DEFAULT_MAX_BODY_BYTES = 65536;

function secretMatches(given, secret) {
  if (typeof given !== "string" || !given || typeof secret !== "string" || !secret) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

// A board's rendered-values snapshot, deep-copied for the wire; null
// when the board does not render (or renders nothing yet).
function renderedSnapshot(board) {
  try {
    const rv = board && board.renderedValues;
    if (!rv || typeof rv !== "object" || Array.isArray(rv)) return null;
    const keys = Object.keys(rv);
    if (!keys.length) return null;
    return JSON.parse(JSON.stringify(rv));
  } catch (_) { return null; }
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
    sessionsCreated: 0, callsServed: 0, reaped: 0,
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
      const responseBody = { ok: true, result: result === undefined ? null : result };
      // FR-395 rendered-values carriage: module 150 boards expose a
      // renderedValues snapshot (the widget's own single-value
      // rendering of each fill — e.g. "+1" for "United States").
      // Module 149's answer-observation hatch compares the readback
      // against that rendering, but the values live on THIS side of
      // the wire; without carriage the hatch can never fire on the
      // production path and correct fills get rejected on vocabulary
      // alone. The snapshot rides every successful call response
      // (small, additive; boards without renderings omit it).
      const rv = renderedSnapshot(board);
      if (rv) responseBody.renderedValues = rv;
      return respond(200, responseBody);
    } catch (e) {
      counters.callsServed += 1;
      const code = (e && e.code) || "BOARD_ERROR";
      const message = String((e && e.message) || e).slice(0, 300);
      if (boardDied(code, message)) {
        // The page is gone: reap NOW and say so on the response, so
        // the sharded router drops its ownership entry at once. The
        // caller still receives the board's own error, unchanged; a
        // later call on this id answers the ordinary 404, which the
        // client board surfaces as WORKER_SESSION_GONE (module 155's
        // session-death path — resume falls back to a fresh drive).
        destroy(session);
        counters.reaped += 1;
        return respond(200, { ok: false, code, message, sessionReaped: true });
      }
      session.lastActivityAt = now();
      return respond(200, { ok: false, code, message });
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
    const request = { method: req.method, path: String(req.url || "").split("?")[0], headers, body };
    const out = typeof service.handleAsync === "function" ? await service.handleAsync(request) : service.handle(request);
    res.writeHead(out.status, { "content-type": "application/json" });
    res.end(JSON.stringify(out.body));
  });
  // F-033 (2026-10-22, chunk 70%): the default 5s keep-alive timeout
  // races QUEUED requests. A board call blocks this process's loop
  // for seconds; meanwhile another client's next request can sit
  // UNPARSED in its socket buffer. That socket's keep-alive timer —
  // armed at its previous response — expires during the block, and
  // when the loop frees, the expired timer fires before the parser
  // reads the queued request: the socket is destroyed and the
  // client dies with ECONNRESET (surfaced as WORKER_UNREACHABLE).
  // Measured live: two concurrent drives lost a leg 2 runs out of 2
  // (each ~6.6s into the queued call, the instant the in-flight call
  // completed); solo drives never hit it (no outstanding request
  // ever spans an expiry). This server is loopback-only and every
  // client is our own transport, so idle keep-alive sockets are
  // bounded by our own clients: the idle timeout buys nothing and
  // costs drives. Disabled.
  server.keepAliveTimeout = 0;
  return server;
}

/* ---------- sharded mode (chunk 70%, 2026-10-22) ----------
   WHY: the core above is synchronous BY DESIGN (the drive stack is
   synchronous at every layer), so in the single-process service ONE
   board call blocks the process's event loop for its whole duration
   — while a drive runs, every other session's calls and every probe
   queue behind the in-flight call (measured 2026-10-21: probe p99
   27.9s during one drive vs 23–39ms idle; re-measured 2026-10-22 in
   docs/apply/PARALLEL-DRIVES-2026-10-22.md). The blocking itself is
   mostly sleep: a board call waits on its own helper process /
   Chromium / the board site, consuming almost no CPU in this
   process. So the fix is not to make the core async (a rewrite of
   149/150/155's contract) but to run N cores in N worker threads of
   the same process: each thread blocks only itself, sessions are
   sticky to the thread that created them, and the main thread —
   which never touches a board — routes requests and stays free.

   Config: `boardShards` (integer >= 2) in the operator config turns
   sharding on; absent or 1 = the original single-core path,
   byte-for-byte (the kill switch: set boardShards back to 1 and
   restart). The refusal surface is preserved exactly: the router
   applies the same secret + method checks before routing (same
   bodies, same order), and every routed request is re-checked by
   the owning shard's core. maxSessionsPerUser stays a GLOBAL cap:
   each shard enforces ceil(cap / shards) and creation routes to the
   least-loaded shard, so the total a user can hold never exceeds
   the configured cap. Session ids remain 128-bit random hex minted
   inside the shards; the router's id -> shard map lives only in
   this process's memory (a session has never survived a service
   restart, and still does not). If a shard thread dies, the router
   respawns it; that shard's sessions are gone and their ids answer
   the same 404 session_not_found an unknown id gets — never a
   cross-shard spill.
   How config reaches a shard: functions cannot cross to a worker
   thread, so a shard never receives the config object itself. When
   the service is started from an operator config MODULE (the
   production shape — board-service.cjs <config.cjs>), each shard
   simply require()s that same module in its own thread and builds
   its core from it: the config stays single-sourced in the operator
   file, functions and all. Inline-config callers (tests) instead
   pass data-only config plus `boardFactoryModule` /
   `resolveResumePathModule` paths; function-valued config without
   a module route is refused at startup, named (fail-closed). */
function createShardedBoardService(config) {
  const cfg = config || {};
  const { Worker } = require("node:worker_threads");
  const pathMod = require("node:path");
  const shardsWanted = typeof cfg.boardShards === "number" ? Math.floor(cfg.boardShards) : 0;
  if (shardsWanted < 2) throw new Error("createShardedBoardService: boardShards >= 2 is required (omit it for the single-core service)");
  const viaModule = typeof cfg.configModule === "string" && cfg.configModule;
  if (!viaModule) {
    if (typeof cfg.familyVerdicts === "function") throw new Error("createShardedBoardService: familyVerdicts must be an object in sharded mode (functions cannot cross to shard threads)");
    if (typeof cfg.boardFactory === "function" && !cfg.boardFactoryModule) throw new Error("createShardedBoardService: an injected boardFactory cannot cross to shard threads — pass boardFactoryModule (a module path) instead");
    if (typeof cfg.resolveResumePath === "function" && !cfg.resolveResumePathModule) throw new Error("createShardedBoardService: an injected resolveResumePath cannot cross to shard threads — pass resolveResumePathModule (a module path) instead");
  }

  const shardCfg = Object.assign({}, cfg);
  delete shardCfg.port; delete shardCfg.boardShards; delete shardCfg.configModule;
  if (typeof cfg.maxSessionsPerUser === "number" && cfg.maxSessionsPerUser > 0) {
    shardCfg.maxSessionsPerUser = Math.max(1, Math.ceil(cfg.maxSessionsPerUser / shardsWanted));
  }
  const shardData = viaModule ? { configModule: cfg.configModule, maxSessionsPerUser: shardCfg.maxSessionsPerUser } : { config: shardCfg };
  const workerFile = pathMod.join(__dirname, "board-service-shard.cjs");
  const shards = [];
  const owner = new Map(); // sessionId -> shard index
  const counters = { routed: 0, created: 0, unknownSession: 0, shardRestarts: 0 };

  function spawnShard(index) {
    const shard = { index, worker: null, alive: false, stopped: false, seq: 0, pending: new Map(), sessions: 0 };
    const worker = new Worker(workerFile, { workerData: shardData });
    shard.worker = worker;
    shard.alive = true;
    worker.on("message", (msg) => {
      if (!msg || typeof msg.seq !== "number") return;
      const resolve = shard.pending.get(msg.seq);
      if (!resolve) return;
      shard.pending.delete(msg.seq);
      resolve(msg.response || { status: 500, body: { error: "shard_error", reason: "empty shard response" } });
    });
    const onDead = (why) => {
      if (!shard.alive) return;
      shard.alive = false;
      for (const [id, idx] of Array.from(owner.entries())) if (idx === index) owner.delete(id);
      shard.sessions = 0;
      for (const resolve of shard.pending.values()) resolve({ status: 502, body: { error: "shard_unavailable", reason: `board shard ${index} stopped (${why}) — its sessions are closed; prepare a fresh session` } });
      shard.pending.clear();
      if (shard.stopped) return; // an intentional stop (service close) is final — never respawn
      counters.shardRestarts += 1;
      try { console.error(`board-service: shard ${index} ${why}; respawning`); } catch (_) {}
      const fresh = spawnShard(index);
      shards[index] = fresh;
    };
    worker.on("error", (e) => onDead(`error: ${String((e && e.message) || e).slice(0, 120)}`));
    worker.on("exit", (code) => { if (code !== 0) onDead(`exit ${code}`); });
    return shard;
  }
  for (let i = 0; i < shardsWanted; i += 1) shards.push(spawnShard(i));

  function send(index, request) {
    const shard = shards[index];
    if (!shard || !shard.alive) return Promise.resolve({ status: 502, body: { error: "shard_unavailable", reason: `board shard ${index} is not running` } });
    shard.seq += 1;
    const seq = shard.seq;
    return new Promise((resolve) => {
      shard.pending.set(seq, resolve);
      try { shard.worker.postMessage({ seq, request }); }
      catch (e) { shard.pending.delete(seq); resolve({ status: 502, body: { error: "shard_unavailable", reason: String((e && e.message) || e).slice(0, 160) } }); }
    });
  }

  function leastLoadedShard() {
    let best = -1;
    for (let i = 0; i < shards.length; i += 1) {
      if (!shards[i].alive) continue;
      if (best < 0 || shards[i].sessions < shards[best].sessions) best = i;
    }
    return best;
  }

  async function handleAsync(request) {
    const req = request || {};
    const headers = req.headers || {};
    // The refusal surface, identical to the core's (same order, same
    // bodies): auth first, then method — decided here so an
    // unauthenticated caller learns nothing about session existence
    // from routing, exactly as in the single-core service.
    if (!cfg.secret || !secretMatches(headers["x-upmore-board-secret"], cfg.secret)) {
      return { status: 401, body: { error: "unauthorized" } };
    }
    if ((req.method || "") !== "POST") return { status: 405, body: { error: "method_not_allowed" } };
    const path = String(req.path || "");
    if (path === "/board-sessions") {
      const idx = leastLoadedShard();
      if (idx < 0) return { status: 502, body: { error: "shard_unavailable", reason: "no board shard is running" } };
      const out = await send(idx, req);
      counters.routed += 1;
      if (out.status === 201 && out.body && typeof out.body.sessionId === "string") {
        owner.set(out.body.sessionId, idx);
        shards[idx].sessions += 1;
        counters.created += 1;
      }
      return out;
    }
    const m = path.match(/^\/board-sessions\/([a-f0-9]{32})\/(call|close)$/);
    if (m) {
      const idx = owner.get(m[1]);
      if (idx == null || !shards[idx] || !shards[idx].alive) {
        counters.unknownSession += 1;
        return { status: 404, body: { error: "session_not_found" } };
      }
      const out = await send(idx, req);
      counters.routed += 1;
      if ((m[2] === "close" && out.status === 200) || out.status === 410 || out.status === 404
        || (out.body && out.body.sessionReaped === true)) {
        owner.delete(m[1]);
        if (shards[idx].sessions > 0) shards[idx].sessions -= 1;
      }
      return out;
    }
    // Any other path: the first live shard's core produces the
    // canonical refusal (its answers are identical in every shard).
    const idx = leastLoadedShard();
    if (idx < 0) return { status: 502, body: { error: "shard_unavailable", reason: "no board shard is running" } };
    counters.routed += 1;
    return send(idx, req);
  }

  return {
    handleAsync,
    sweep: () => 0, // shards self-sweep inside their threads
    sessionCount: () => owner.size,
    counters: () => JSON.parse(JSON.stringify(counters)),
    shardCount: () => shards.length,
    close: async () => { for (const s of shards) { s.stopped = true; try { await s.worker.terminate(); } catch (_) {} } },
  };
}

function startBoardService(config) {
  const cfg = config || {};
  if (typeof cfg.boardShards === "number" && cfg.boardShards >= 2) {
    const service = createShardedBoardService(cfg);
    const server = createBoardHttpServer(service, cfg);
    server.on("close", () => { service.close().catch(() => {}); });
    server.listen(cfg.port || 0, "127.0.0.1");
    return { server, service };
  }
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
  const userCfg = require(process.argv[2]);
  // configModule lets sharded mode re-resolve this same module inside
  // each shard thread (functions cannot cross thread boundaries).
  const { server } = startBoardService(Object.assign({}, userCfg, { configModule: path.resolve(process.argv[2]) }));
  server.on("listening", () => console.log("Career board service listening on", server.address().port));
}

module.exports = { createBoardService, createBoardHttpServer, createShardedBoardService, startBoardService, BOARD_CALL_METHODS };
