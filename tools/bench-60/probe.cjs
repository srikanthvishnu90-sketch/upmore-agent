"use strict";
/* PARALLEL-DRIVES probe — measures board-service event-loop availability
   from OUTSIDE any drive: sequential cheap requests against :8471.
   Two shapes alternate:
     refused-host: valid secret + example.com URL -> 403 DRIVER_HOST_REFUSED
       (runs the service's handle() + host gate; creates NOTHING)
     bad-secret:   wrong secret -> 401 (the shallowest possible handling)
   Each request's latency is the time the service took to even look at
   it — while a synchronous board call blocks the loop, probes queue
   behind it. The secret is read transiently from the operator config
   and never printed or written.
   Usage: node probe.cjs <duration_ms> <out_file> */
const http = require("node:http");
const fs = require("node:fs");
const cfg = require("/home/hatch/worker-config/board-config.cjs");
const SECRET = cfg.secret;
const DUR = Number(process.argv[2] || 30000);
const OUT = process.argv[3];
if (!SECRET || !OUT) { console.error("probe: config/out missing"); process.exit(2); }

function once(kind) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const body = kind === "bad-secret"
      ? JSON.stringify({ userId: "probe", url: "https://example.com/x" })
      : JSON.stringify({ userId: "probe", url: "https://example.com/jobs/1" });
    const req = http.request({
      host: "127.0.0.1", port: 8471, path: "/board-sessions", method: "POST",
      headers: { "content-type": "application/json", "x-upmore-board-secret": kind === "bad-secret" ? "wrong-secret" : SECRET },
      agent: false, timeout: 45000,
    }, (res) => {
      res.resume();
      res.on("end", () => resolve({ kind, ms: Date.now() - t0, status: res.statusCode }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ kind, ms: Date.now() - t0, status: "timeout" }); });
    req.on("error", (e) => resolve({ kind, ms: Date.now() - t0, status: "error:" + (e && e.code) }));
    req.end(body);
  });
}

(async () => {
  const until = Date.now() + DUR;
  let i = 0;
  while (Date.now() < until) {
    const kind = i % 2 ? "bad-secret" : "refused-host";
    const r = await once(kind); await new Promise((res) => setTimeout(res, 50));
    fs.appendFileSync(OUT, JSON.stringify(Object.assign({ t: new Date().toISOString() }, r)) + "\n");
    i += 1;
  }
  process.exit(0);
})();
