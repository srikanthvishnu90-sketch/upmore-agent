/* Drive CONNECT relay — the durable form of Lane E's scratch relay
 * (~/workspace/.seam-tmp-r2/connect-relay.cjs, 2026-10-16), rebuilt as
 * maintained repo tooling on branch finish/apply-readiness.
 *
 * WHY THIS EXISTS: this host's egress is proxy-only. The upstream
 * proxy URL in the process environment carries per-connection
 * credentials (userinfo), and Chromium drops URL credentials from its
 * env-derived proxy config, so a directly-launched Chromium fails
 * every tunnel with ERR_TUNNEL_CONNECTION_FAILED. This relay listens
 * on 127.0.0.1, accepts Chromium's credential-less CONNECT, and
 * re-issues it upstream WITH the Proxy-Authorization the env URL
 * carries.
 *
 * CREDENTIAL DISCIPLINE: the upstream URL (credentials included) is
 * read from this process's environment at runtime — the same
 * memory-only sourcing pattern as scripts/career/alerts-scheduler-
 * launch.py. The value is never written to disk, never logged, never
 * printed; the Authorization header exists only inside this process's
 * memory and on the upstream tunnel it authorizes. Nothing in this
 * file contains a credential, a hostname credential, or a secret.
 *
 * Usage: node scripts/career/drive-connect-relay.cjs [port]
 *   port defaults to 0 (ephemeral). Once listening, prints exactly
 *   one stdout line:  RELAY_PORT <n>
 *   DRIVE_RELAY_DEBUG=1 logs tunnel target host:port lines to stderr
 *   (never headers, never the upstream URL).
 * Lifecycle: exits on SIGTERM/SIGINT, or after 15 idle minutes with
 * no tunnel (the portal helper's own idle posture). */
"use strict";
const http = require("node:http");
const net = require("node:net");
const { URL } = require("node:url");

const requestedPort = parseInt(process.argv[2] || process.env.UPMORE_DRIVE_RELAY_PORT || "0", 10);
const upstreamRaw = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.all_proxy || "";
if (!upstreamRaw) {
  console.error("drive-connect-relay: no upstream proxy in env (https_proxy/HTTPS_PROXY/all_proxy) — refusing to start; a relay without an upstream would strand every tunnel");
  process.exit(2);
}
let upstream;
try { upstream = new URL(upstreamRaw); } catch (e) {
  console.error("drive-connect-relay: upstream proxy env value is not a URL — refusing to start");
  process.exit(2);
}
const auth = upstream.username
  ? "Basic " + Buffer.from(decodeURIComponent(upstream.username) + ":" + decodeURIComponent(upstream.password)).toString("base64")
  : null;
const debug = process.env.DRIVE_RELAY_DEBUG === "1";
const IDLE_MS = 15 * 60 * 1000;
let lastTunnelAt = Date.now();

const server = http.createServer((req, res) => { res.writeHead(405); res.end(); });
server.on("connect", (req, clientSocket, head) => {
  lastTunnelAt = Date.now();
  const target = req.url; // host:port
  if (debug) console.error("relay tunnel ->", target);
  const proxySocket = net.connect(Number(upstream.port), upstream.hostname, () => {
    let lines = `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n`;
    if (auth) lines += `Proxy-Authorization: ${auth}\r\n`;
    lines += "Proxy-Connection: keep-alive\r\n\r\n";
    proxySocket.write(lines);
  });
  let buf = Buffer.alloc(0);
  const onData = (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const idx = buf.indexOf("\r\n\r\n");
    if (idx === -1) return;
    proxySocket.removeListener("data", onData);
    const statusLine = buf.slice(0, buf.indexOf("\r\n")).toString("latin1");
    const rest = buf.slice(idx + 4);
    if (!/^HTTP\/1\.[01] 200/.test(statusLine)) {
      if (debug) console.error("relay upstream refused:", statusLine);
      clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      proxySocket.destroy();
      return;
    }
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (rest.length) clientSocket.write(rest);
    if (head && head.length) proxySocket.write(head);
    proxySocket.pipe(clientSocket);
    clientSocket.pipe(proxySocket);
  };
  proxySocket.on("data", onData);
  proxySocket.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => proxySocket.destroy());
});
server.listen(requestedPort, "127.0.0.1", () => {
  console.log("RELAY_PORT " + server.address().port);
});
const idle = setInterval(() => {
  if (Date.now() - lastTunnelAt > IDLE_MS) { server.close(); process.exit(0); }
}, 30000);
idle.unref();
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { server.close(); process.exit(0); });
