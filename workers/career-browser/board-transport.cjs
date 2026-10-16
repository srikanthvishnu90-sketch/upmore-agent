"use strict";
/* board-transport.cjs — the synchronous HTTP transport for the worker
   board provider (LOOP J9, Crew B, 2026-10-15).

   The board provider (career_task_bridge's createWorkerBoardProvider)
   takes an injected SYNCHRONOUS transport —
     transport({method, path, headers, body}) -> {status, body}
   — because the drive stack it serves (155 -> 149 -> the board
   contract) is synchronous end to end. This module is that transport
   for Node composition roots whose board service runs in the worker
   process across a loopback HTTP hop: a worker_threads fetch pump
   (board-transport-worker.cjs) performs the request while the calling
   thread waits on Atomics.wait / receiveMessageOnPort — the same
   sync-over-async shape module 150 uses to reach its helper process.
   No new dependencies.

   Failure honesty: an unreachable service throws WORKER_UNREACHABLE; a
   service that never answers throws WORKER_TRANSPORT_TIMEOUT whose
   message states the consequence (for a submit call the outcome must
   be reconciled, never retried blind). A late answer to a timed-out
   call is dropped by id, never mistaken for the next call's reply. */
const { Worker, MessageChannel, receiveMessageOnPort } = require("node:worker_threads");
const path = require("node:path");

const coded = (code, message) => Object.assign(new Error(message), { code });

function createSyncHttpTransport(opts) {
  const o = opts || {};
  if (!o.baseUrl || typeof o.baseUrl !== "string") throw new Error("createSyncHttpTransport: baseUrl (the worker board service origin) is required");
  const base = o.baseUrl.replace(/\/$/, "");
  const timeoutMs = typeof o.timeoutMs === "number" && o.timeoutMs > 0 ? o.timeoutMs : 300000;
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(path.join(__dirname, "board-transport-worker.cjs"), {
    workerData: { responsePort: port2 },
    transferList: [port2],
  });
  if (worker.unref) worker.unref();
  if (port1.unref) port1.unref();
  let seq = 0;
  let closed = false;
  const waitBuf = new Int32Array(new SharedArrayBuffer(4));

  function transport(request) {
    const req = request || {};
    if (closed) throw coded("WORKER_TRANSPORT_CLOSED", "the worker board transport is closed");
    seq += 1;
    const id = seq;
    worker.postMessage({
      id,
      url: base + String(req.path || ""),
      method: req.method || "POST",
      headers: req.headers || {},
      body: req.body == null ? null : req.body,
    });
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const msg = receiveMessageOnPort(port1);
      if (msg && msg.message) {
        const m = msg.message;
        if (m.id !== id) continue; // a late answer to a timed-out call: drop it, never misattribute it
        if (m.transportError) throw coded("WORKER_UNREACHABLE", `the career worker board service could not be reached (${m.transportError})`);
        return { status: m.status, body: m.body };
      }
      if (Date.now() > deadline) {
        throw coded("WORKER_TRANSPORT_TIMEOUT", `the career worker board service did not answer in ${timeoutMs}ms — for a submit call the outcome is unknown and must be reconciled, never retried blind`);
      }
      Atomics.wait(waitBuf, 0, 0, 10);
    }
  }

  transport.close = () => {
    if (closed) return;
    closed = true;
    try { worker.terminate(); } catch (_) { /* already gone */ }
  };
  return transport;
}

module.exports = { createSyncHttpTransport };
