"use strict";
/* measure-proxy-variants.cjs — M3 diagnostic: which proxy shape lets
   THIS host's Chromium reach a Greenhouse posting? Production shape
   (env vars only) fails with ERR_TUNNEL_CONNECTION_FAILED while curl
   through the same proxy returns 200. Variants:
   A env-only (production) · B explicit launch proxy · C local
   CONNECT relay -> upstream proxy, explicit proxy to the relay ·
   D no proxy (control). Read-only page loads; nothing filled. */
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const pw = require("/home/hatch/workspace/sporve-agent-clone/node_modules/playwright");
const EXE = "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux/chrome";
const URL = "https://job-boards.greenhouse.io/gusto/jobs/8257115";
const UPSTREAM = { host: "hatch-egress-proxy", port: 3128 };

function startRelay(port) {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.on("connect", (req, clientSocket, head) => {
      const upstream = net.connect(UPSTREAM.port, UPSTREAM.host, () => {
        upstream.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\n\r\n`);
      });
      let buf = Buffer.alloc(0);
      const onData = (d) => {
        buf = Buffer.concat([buf, d]);
        const idx = buf.indexOf("\r\n\r\n");
        if (idx === -1) return;
        upstream.removeListener("data", onData);
        const statusLine = buf.slice(0, buf.indexOf("\r\n")).toString();
        if (!/^HTTP\/1\.[01] 200/.test(statusLine)) { clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"); upstream.end(); return; }
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        const rest = buf.slice(idx + 4);
        if (rest.length) clientSocket.write(rest);
        if (head && head.length) upstream.write(head);
        upstream.pipe(clientSocket); clientSocket.pipe(upstream);
      };
      upstream.on("data", onData);
      upstream.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => upstream.destroy());
    });
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

async function trial(name, launchOpts, envProxy) {
  const saved = {};
  for (const k of ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"]) { saved[k] = process.env[k]; if (envProxy) process.env[k] = "http://hatch-egress-proxy:3128"; else delete process.env[k]; }
  const a = Date.now();
  let out;
  try {
    const browser = await pw.chromium.launch({ headless: true, executablePath: EXE, args: ["--no-sandbox"], ...launchOpts });
    const page = await (await browser.newContext()).newPage();
    try {
      const res = await page.goto(URL, { timeout: 25000, waitUntil: "domcontentloaded" });
      out = { name, ok: true, status: res && res.status(), ms: Date.now() - a };
    } catch (e) { out = { name, ok: false, error: String(e.message).split("\n")[0].slice(0, 140), ms: Date.now() - a }; }
    await browser.close();
  } catch (e) { out = { name, ok: false, error: "LAUNCH: " + String(e.message).split("\n")[0].slice(0, 120), ms: Date.now() - a }; }
  for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  console.log(JSON.stringify(out));
}

(async () => {
  await trial("A env-only (production shape)", {}, true);
  await trial("B explicit launch proxy", { proxy: { server: "http://hatch-egress-proxy:3128" } }, false);
  const relay = await startRelay(18080);
  await trial("C local CONNECT relay", { proxy: { server: "http://127.0.0.1:18080" } }, false);
  relay.close();
  await trial("D no proxy (control)", {}, false);
  process.exit(0);
})();
