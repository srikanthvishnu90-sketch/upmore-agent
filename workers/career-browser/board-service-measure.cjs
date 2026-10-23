"use strict";
/* board-service-measure.cjs — the MEASUREMENT host board service
   (owner-directed preparation, 2026-10-23). A sibling of
   board-service.cjs with the same wire contract, the same auth, the
   same creation gates and the same session lifecycle — and a write
   surface that is absent BY CONSTRUCTION, not by configuration.

   Why this exists: the production board service was ruled out as a
   measurement-host restore because its call dispatcher will execute
   armForSubmit / submit on a caller's self-asserted approval context
   — the driver (module 150) checks the arm's SHAPE (approvedByUser
   plus a non-empty reference), never a product record behind it, so
   loopback plus the board secret is a live submit path, not a
   read-only guarantee. Module 150's own gate (BUG-063) made
   REAL_SUBMIT_DISABLED the default and arming the exception; a
   measurement host must have no exception. This variant removes the
   arming wire from the process entirely, in three layers:

   1. DISPATCH DENY. The call dispatcher refuses the six write-surface
      methods — fill, answers, atReview, armForSubmit, submit,
      submissionState — with a named 403 (MEASURE_HOST_METHOD_DISABLED)
      BEFORE any session lookup, ownership check, or board touch.
      The deny is unconditional: it does not inspect the caller, the
      session, the arguments, or any configuration value, so no config
      — including one copied field-for-field from the production board
      config — can re-open a write path. There is no flag to flip
      because the code that would honor one does not exist here.
   2. RESTRICTED FACADE. Every board this service creates — from the
      default module-150 factory or an injected one — is wrapped in
      restrictBoard(): the object the service holds exposes open,
      form, screenshot and close plus the read-only session metadata,
      and does NOT have the write methods as properties at all. Even a
      future dispatcher bug would find nothing to invoke.
   3. NO PRODUCTION CREDENTIAL SURFACE. This file never reads an
      operator environment file, never loads the executor's config
      module or env file, and holds no production-database credential
      of any kind; its only secret is the board API secret in the
      operator config module, exactly as in the production service.
      The companion unit (scripts/career/systemd/
      upmore-career-board-measure.service) runs it as a dedicated
      unprivileged user with no environment file, so the executor's
      root-owned env file is unreadable to the process by filesystem
      construction as well.

   What remains is the measurement surface the engine lane consumes:
   session create/close under the §6.3 host gate and the family-
   verdict gate, open + form (the read-only form map, driven through
   the egress relay by module 150's board underneath the facade),
   and the evidence those drives produce (module 150's captcha-stop
   screenshots and logs ride the open/form results unchanged).

   Single-core only: the sharded mode of the production service is
   not reproduced here — a boardShards value in the config is never
   read, so a production-shaped config cannot change this service's
   shape. The HTTP adapter is the production service's own
   (createBoardHttpServer, with its F-033 keep-alive fix); requiring
   board-service.cjs loads no driver — module 150 stays a lazy
   require behind the default factory, exactly as there. */
const crypto = require("node:crypto");
const { createBoardHttpServer } = require("./board-service.cjs");

const MEASURE_ALLOWED_METHODS = ["open", "form"];
const MEASURE_DENIED_METHODS = ["fill", "answers", "atReview", "armForSubmit", "submit", "submissionState"];
const MEASURE_DENY_ERROR = "MEASURE_HOST_METHOD_DISABLED";
// REAP-ON-CRASH, inherited from the production service (bench-60 fix
// round, 2026-10-22): a board call throwing one of these signatures
// means the session's page is gone, so the session is destroyed at
// the failing call instead of squatting its per-user cap slot until
// the idle TTL. Any other throw is a live board declining a call.
const BOARD_DEATH_CODES = new Set(["BOARD_CLOSED", "DRIVER_TIMEOUT"]);
const BOARD_DEATH_MESSAGE = /target crashed|target page, context or browser has been closed|browser has been closed|page crashed|page has been closed|session closed/i;
function boardDied(code, message) {
  if (BOARD_DEATH_CODES.has(code)) return true;
  return BOARD_DEATH_MESSAGE.test(message || "");
}
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_SESSIONS_PER_USER = 32;

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

// The restricted driver facade (layer 2 above): an object literal
// naming ONLY the read-side surface. The write methods are not
// guarded, wrapped, or renamed — they are not here. Metadata getters
// delegate so session creation reports the driver's own truth.
function restrictBoard(board) {
  if (!board || typeof board !== "object") return board;
  const facade = {
    get kind() { return board.kind; },
    get sandbox() { return board.sandbox; },
    get browserDriver() { return board.browserDriver; },
    get atsFamily() { return board.atsFamily; },
    get host() { return board.host; },
    get accountName() { return board.accountName; },
    get renderedValues() { return board.renderedValues; },
    open(...args) { return board.open(...args); },
    form(...args) { return board.form(...args); },
    screenshot(...args) {
      if (typeof board.screenshot !== "function") {
        throw Object.assign(new Error("the board under this facade has no screenshot()"), { code: "BOARD_METHOD_MISSING" });
      }
      return board.screenshot(...args);
    },
    close(...args) { if (typeof board.close === "function") return board.close(...args); return undefined; },
  };
  return facade;
}

function createMeasureBoardService(config) {
  const cfg = config || {};
  const secret = typeof cfg.secret === "string" && cfg.secret ? cfg.secret : null;
  const now = typeof cfg.now === "function" ? cfg.now : () => Date.now();
  const ttlMs = typeof cfg.sessionTtlMs === "number" && cfg.sessionTtlMs > 0 ? cfg.sessionTtlMs : DEFAULT_TTL_MS;
  const maxPerUser = typeof cfg.maxSessionsPerUser === "number" && cfg.maxSessionsPerUser > 0 ? cfg.maxSessionsPerUser : DEFAULT_MAX_SESSIONS_PER_USER;
  const verdicts = cfg.familyVerdicts != null ? cfg.familyVerdicts : null;
  // Same resume posture as the production service (WO-094): a
  // configured resolver resolves the stored file by the sha256 the
  // session request carries, or the session is refused under the
  // resolver's own name; unconfigured, a request that names a resume
  // is refused RESUME_RESOLVER_NOT_WIRED. (On a measurement host the
  // resolved path can never be uploaded — fill is denied — it only
  // binds the session to the same creation contract.)
  const resolveResumePath = typeof cfg.resolveResumePath === "function" ? cfg.resolveResumePath : null;

  // The default factory and host gate ARE module 150 (shared, never
  // forked), required lazily as in the production service. Whatever
  // factory supplies the board — default or injected — the board is
  // wrapped in the restricted facade before the service keeps it, so
  // no configuration can hand this process an unfacaded board.
  let portalBrowser = null;
  const loadPortalBrowser = () => {
    if (!portalBrowser) portalBrowser = require("../../packages/domain/150-career-portal-browser.js");
    return portalBrowser;
  };
  const rawFactory = typeof cfg.boardFactory === "function" ? cfg.boardFactory
    : (opts) => loadPortalBrowser().createBrowserBoard(opts);
  const boardFactory = (opts) => restrictBoard(rawFactory(opts));
  const hostGate = typeof cfg.hostAllowed === "function" ? cfg.hostAllowed
    : (url) => loadPortalBrowser().hostAllowed(url);

  const sessions = new Map(); // id -> {id, userId, board, family, createdAt, lastActivityAt}
  const counters = {
    sessionsCreated: 0, callsServed: 0, reaped: 0,
    refused: { auth: 0, host: 0, verdict: 0, userMismatch: 0, expired: 0, sessionLimit: 0, notFound: 0, resume: 0, measureDenied: 0 },
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
    const resumeSha256 = typeof body.resumeSha256 === "string" && /^[a-f0-9]{64}$/.test(body.resumeSha256) ? body.resumeSha256 : null;
    let resumePath = null;
    if (resolveResumePath) {
      try { resumePath = resolveResumePath(userId, { resumeSha256 }) || null; }
      catch (e) {
        counters.refused.resume += 1;
        return respond(409, { error: (e && e.code) || "RESUME_FILE_MISSING", reason: String((e && e.message) || e).slice(0, 200) });
      }
      if (!resumePath) {
        counters.refused.resume += 1;
        return respond(409, { error: "RESUME_FILE_MISSING", reason: "the stored resume file could not be resolved — the session is refused rather than opened without a resume" });
      }
    } else if (resumeSha256) {
      counters.refused.resume += 1;
      return respond(409, { error: "RESUME_RESOLVER_NOT_WIRED", reason: "the request names a stored resume but this board service has no resolveResumePath configured" });
    }
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
    const method = typeof body.method === "string" ? body.method : "";
    // THE DENY (layer 1): before the session is even looked up. A
    // write-surface method on this host is refused for every caller,
    // every session, every argument set, every configuration — the
    // refusal names itself and carries no board result.
    if (MEASURE_DENIED_METHODS.includes(method)) {
      counters.refused.measureDenied += 1;
      return respond(403, {
        error: MEASURE_DENY_ERROR, method,
        reason: "this is a measurement host: its board service denies every fill, answer, review, arm and submit method in code — no configuration re-opens them, and no board was touched",
      });
    }
    const { session, failure } = ownedSession(id, body);
    if (failure) return failure;
    if (!MEASURE_ALLOWED_METHODS.includes(method)) return respond(400, { error: "method_not_allowed", method: method || null });
    const board = session.board;
    if (typeof board[method] !== "function") {
      return respond(200, { ok: false, code: "BOARD_METHOD_MISSING", message: `the measure board has no ${method}()` });
    }
    const args = Array.isArray(body.args) ? body.args : [];
    try {
      const result = board[method](...args);
      session.lastActivityAt = now();
      counters.callsServed += 1;
      const responseBody = { ok: true, result: result === undefined ? null : result };
      // FR-395 rendered-values carriage, as in the production
      // service: the snapshot rides every successful call response
      // (boards without renderings omit it). On this host it can only
      // ever reflect what open/form observed — nothing was filled.
      const rv = renderedSnapshot(board);
      if (rv) responseBody.renderedValues = rv;
      return respond(200, responseBody);
    } catch (e) {
      counters.callsServed += 1;
      const code = (e && e.code) || "BOARD_ERROR";
      const message = String((e && e.message) || e).slice(0, 300);
      if (boardDied(code, message)) {
        // The page is gone: reap NOW and say so on the response; a
        // later call on this id answers the ordinary 404.
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

function startMeasureBoardService(config) {
  const cfg = config || {};
  // Single-core by construction: cfg.boardShards is never read here,
  // so the sharded shape of the production service cannot be selected
  // by any config this process is handed.
  const service = createMeasureBoardService(cfg);
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
  // production service's pattern): the config module exports
  // { port, secret, familyVerdicts, resolveResumePath?,
  // sessionTtlMs? }. The measurement config is its OWN module
  // (board-measure-config.cjs), never the production board config —
  // though the deny holds even if it were: it is in the code, not
  // in the config.
  const path = require("node:path");
  if (!process.argv[2] || !path.isAbsolute(process.argv[2])) throw new Error("usage: node board-service-measure.cjs /absolute/operator-config.cjs");
  const userCfg = require(process.argv[2]);
  const { server } = startMeasureBoardService(userCfg);
  server.on("listening", () => console.log("Career board service (measurement, submit-disabled) listening on", server.address().port));
}

module.exports = {
  createMeasureBoardService, startMeasureBoardService, restrictBoard,
  MEASURE_ALLOWED_METHODS, MEASURE_DENIED_METHODS, MEASURE_DENY_ERROR,
};
