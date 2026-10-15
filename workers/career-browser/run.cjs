"use strict";
// Operator-owned configuration only, never loaded from chat. Provides the
// existing JWT verifier and owned artifact resolver; no new credentials.
const http = require("node:http");
const path = require("node:path");
const { createFileTaskStore } = require("./store.cjs");
const { createWorker } = require("./service.cjs");
const { createHttpHandler } = require("./http.cjs");
function start(config) {
  const worker = createWorker({ ...config, store: createFileTaskStore(config.storeRoot) });
  const handle = createHttpHandler({ worker, authenticate: config.authenticate });
  const server = http.createServer(async (req, res) => {
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32000) { res.writeHead(413); res.end(); return; }
      chunks.push(chunk);
    }
    const response = await handle(new Request("http://127.0.0.1" + req.url, {
      method: req.method, headers: req.headers,
      ...(!["GET", "HEAD"].includes(req.method) ? { body: Buffer.concat(chunks) } : {}),
    }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });
  const tick = setInterval(() => { try { worker.runPending(); } catch (e) { console.error("career worker:", e.code || "worker_error"); } }, 1000);
  server.on("close", () => clearInterval(tick));
  server.listen(config.port || 0, "127.0.0.1");
  return { server, worker };
}
if (require.main === module) {
  if (!process.argv[2] || !path.isAbsolute(process.argv[2])) throw new Error("usage: node run.cjs /absolute/operator-config.cjs");
  const { server } = start(require(process.argv[2]));
  server.on("listening", () => console.log("Owned local career worker listening on", server.address().port));
}
module.exports = { start };
