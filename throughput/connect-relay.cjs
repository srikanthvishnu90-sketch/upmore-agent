"use strict";
/* connect-relay.cjs — worker-host egress relay (operator tooling).
   Why this exists (measured 2026-10-21, throughput lane): this VM's
   Chromium cannot CONNECT through the egress proxy directly
   (ERR_TUNNEL_CONNECTION_FAILED for env-proxy, explicit proxy, and
   transparent paths alike), while a minimal re-issued CONNECT is
   accepted. This relay accepts plain CONNECTs on loopback and
   re-issues them upstream in that minimal shape. Loopback only.
   Usage: node connect-relay.cjs <port> <upstreamHost> <upstreamPort> */
const http = require("node:http");
const net = require("node:net");
const port = Number(process.argv[2] || 8474);
const upHost = process.argv[3] || "hatch-egress-proxy";
const upPort = Number(process.argv[4] || 3128);
const srv = http.createServer();
srv.on("connect", (req, clientSocket, head) => {
  const upstream = net.connect(upPort, upHost, () => {
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
  upstream.setTimeout(120000, () => upstream.destroy());
});
srv.listen(port, "127.0.0.1", () => console.log(`connect relay on 127.0.0.1:${port} -> ${upHost}:${upPort}`));
