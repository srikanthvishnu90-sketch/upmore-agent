"use strict";
// Operator-owned configuration only, never loaded from chat. Provides the
// existing JWT verifier and owned artifact resolver; no new credentials.
const http = require("node:http");
const path = require("node:path");
const { createFileTaskStore } = require("./store.cjs");
const { createWorker } = require("./service.cjs");
const { createHttpHandler } = require("./http.cjs");
const { createPullRunner } = require("./pull-runner.cjs");
function start(config) {
  if(config.mode === "pull_only" && typeof process.getuid === "function" && process.getuid()===0)throw new Error("PULL_WORKER_REQUIRES_UNPRIVILEGED_USER");
  const store=createFileTaskStore(config.storeRoot);
  const worker = createWorker({ ...config, store });
  if(config.mode === "pull_only") {
    const runner=createPullRunner({...config.runner,worker,store,
      emit:config.emit || (event=>console.log(JSON.stringify(event))),
      onStop:()=>{require("../../packages/domain/150-career-portal-browser.js").shutdownAll();config.close?.();}});
    runner.start();return {worker,runner,stop:()=>runner.stop()};
  }
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
  const running = start(require(process.argv[2]));
  if(running.runner) {
    process.once("SIGTERM",running.stop);process.once("SIGINT",running.stop);
  }
  const {server}=running;
  server?.on("listening", () => console.log("Owned local career worker listening on", server.address().port));
}
module.exports = { start };
