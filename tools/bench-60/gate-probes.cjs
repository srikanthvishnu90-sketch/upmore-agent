"use strict";
const http = require("node:http");
const cfg = require("/home/hatch/worker-config/board-config.cjs");
function post(path, body, secret) {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port: 8471, path, method: "POST", headers: { "content-type": "application/json", "x-upmore-board-secret": secret }, agent: false }, (res) => {
      const c = []; res.on("data", (d) => c.push(d));
      res.on("end", () => { let b = null; try { b = JSON.parse(Buffer.concat(c).toString("utf8")); } catch (_) {} resolve({ status: res.statusCode, body: b }); });
    });
    req.on("error", (e) => resolve({ status: "ERR:" + e.code }));
    req.end(JSON.stringify(body || {}));
  });
}
(async () => {
  console.log("no-secret:", (await post("/board-sessions", { userId: "p", url: "https://boards.greenhouse.io/x/jobs/1" }, "")).status, "(want 401)");
  console.log("wrong-secret:", (await post("/board-sessions", { userId: "p", url: "https://boards.greenhouse.io/x/jobs/1" }, "wrong")).status, "(want 401)");
  const ex = await post("/board-sessions", { userId: "p", url: "https://example.com/jobs/1" }, cfg.secret);
  console.log("example.com:", ex.status, ex.body && ex.body.error, "(want 403 DRIVER_HOST_REFUSED)");
  const ash = await post("/board-sessions", { userId: "p", url: "https://jobs.ashbyhq.com/x/1" }, cfg.secret);
  console.log("ashby:", ash.status, ash.body && ash.body.error, "(want 403 FAMILY_NOT_DRIVEABLE)");
  const lev = await post("/board-sessions", { userId: "b2625909-d67f-41b2-8270-983d212c6052", url: "https://jobs.lever.co/palantir/d5486403-c050-4920-b2e0-91b69b61ebb2" }, cfg.secret);
  console.log("lever create:", lev.status, "(want 201)");
  if (lev.status === 201) {
    const cl = await post(`/board-sessions/${lev.body.sessionId}/close`, { userId: "b2625909-d67f-41b2-8270-983d212c6052" }, cfg.secret);
    console.log("lever close:", cl.status, "(want 200)");
  }
  process.exit(0);
})();
