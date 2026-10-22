"use strict";
/* board-service-shard.cjs — one shard of the board service (chunk
   70%, 2026-10-22). Runs in a worker thread of the board-service
   process: owns a complete, unmodified createBoardService core (its
   own sessions map, its own module-150 boards, its own helper
   processes) and answers {seq, request} messages with {seq,
   response} by running the core's synchronous handle() HERE, in
   this thread — a blocking board call blocks this thread only,
   never the router and never a sibling shard. The shard also runs
   the core's idle-expiry sweep on the same cadence the
   single-process service uses.

   Config arrives one of two ways: (a) workerData.configModule — an
   operator config module path (the production shape): the shard
   require()s the very module the service was started with, so every
   function-valued field (resolveResumePath above all) is the
   operator's own code, single-sourced; the router's per-shard
   session-cap division (workerData.maxSessionsPerUser) is overlaid.
   (b) workerData.config — data-only config for inline callers
   (tests), where the two function seams arrive as MODULE PATHS and
   are resolved here: boardFactoryModule (a module exporting the
   factory function, or { createBoard } / { boardFactory }) and
   resolveResumePathModule (a module exporting the function, or
   { resolveResumePath }). Absent both, the core's defaults apply
   (module 150's factory and host gate, no resume path). */
const { parentPort, workerData } = require("node:worker_threads");
const { createBoardService } = require("./board-service.cjs");

let cfg;
if (workerData && typeof workerData.configModule === "string" && workerData.configModule) {
  cfg = Object.assign({}, require(workerData.configModule));
  delete cfg.port; delete cfg.boardShards; delete cfg.configModule;
  if (typeof workerData.maxSessionsPerUser === "number" && workerData.maxSessionsPerUser > 0) cfg.maxSessionsPerUser = workerData.maxSessionsPerUser;
} else {
  cfg = Object.assign({}, (workerData && workerData.config) || {});
}
if (cfg.boardFactoryModule) {
  const m = require(cfg.boardFactoryModule);
  cfg.boardFactory = typeof m === "function" ? m : (m && (m.createBoard || m.boardFactory));
  if (typeof cfg.boardFactory !== "function") throw new Error("board-service-shard: boardFactoryModule did not export a factory function");
  delete cfg.boardFactoryModule;
}
if (cfg.resolveResumePathModule) {
  const m = require(cfg.resolveResumePathModule);
  cfg.resolveResumePath = typeof m === "function" ? m : (m && m.resolveResumePath);
  if (typeof cfg.resolveResumePath !== "function") throw new Error("board-service-shard: resolveResumePathModule did not export a function");
  delete cfg.resolveResumePathModule;
}

const service = createBoardService(cfg);
const sweepMs = cfg.sweepMs != null ? cfg.sweepMs : 30000;
if (sweepMs > 0) {
  const timer = setInterval(() => { try { service.sweep(); } catch (_) { /* a failed sweep retries next tick */ } }, sweepMs);
  if (timer.unref) timer.unref();
}

parentPort.on("message", (msg) => {
  if (!msg || typeof msg.seq !== "number") return;
  try {
    const response = service.handle(msg.request || {});
    parentPort.postMessage({ seq: msg.seq, response });
  } catch (e) {
    parentPort.postMessage({ seq: msg.seq, response: { status: 500, body: { error: "shard_error", reason: String((e && e.message) || e).slice(0, 200) } } });
  }
});
