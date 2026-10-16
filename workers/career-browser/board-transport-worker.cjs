"use strict";
/* board-transport-worker.cjs — the fetch pump for board-transport.cjs.

   Runs in a worker thread so the main thread can block on
   Atomics.wait for a synchronous result (the shape of module 150's own
   sync bridge to its helper process). Receives {id, url, method,
   headers, body} on parentPort, performs the one HTTP request with
   fetch, and posts {id, status, body} (or {id, transportError}) back
   on the transferred response port. It decides nothing: no headers are
   added, no status is reinterpreted — the wire only. */
const { parentPort, workerData } = require("node:worker_threads");

const responsePort = workerData && workerData.responsePort;
if (!responsePort) throw new Error("board-transport-worker: workerData.responsePort is required");

parentPort.on("message", async (req) => {
  try {
    const res = await fetch(req.url, {
      method: req.method || "POST",
      headers: req.headers || {},
      body: req.body == null ? undefined : JSON.stringify(req.body),
    });
    const text = await res.text();
    let body = null;
    if (text) { try { body = JSON.parse(text); } catch (_) { body = { error: "bad_worker_response" }; } }
    responsePort.postMessage({ id: req.id, status: res.status, body });
  } catch (e) {
    responsePort.postMessage({ id: req.id, transportError: String((e && e.message) || e) });
  }
});
