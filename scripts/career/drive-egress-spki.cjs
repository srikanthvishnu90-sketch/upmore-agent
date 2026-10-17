/* Drive egress SPKI derivation — prints the CURRENT egress CA's
 * SPKI SHA-256 fingerprint (base64) to stdout, nothing else.
 *
 * Why this exists: the egress proxy re-signs TLS with its own CA,
 * and that CA rotates (the fingerprint Lane E recorded on
 * 2026-10-16 was already stale on 2026-10-17). A hardcoded pin
 * silently rots; deriving at launch keeps the durable drive
 * environment correct without anyone hand-tracking the value.
 *
 * Method: an authenticated CONNECT through the env proxy to a
 * probe host, a TLS handshake over the tunnel, then a walk of the
 * presented chain to its self-signed root — that root is the
 * re-signing CA. The fingerprint is a public-key hash (not a
 * secret). The proxy credentials ride the CONNECT inside this
 * process's memory only, exactly like the relay's; they are never
 * printed or written anywhere.
 *
 * Usage: node scripts/career/drive-egress-spki.cjs [host]
 *   host defaults to job-boards.greenhouse.io (any reachable
 *   https host behind the proxy works; the CA is the proxy's,
 *   not the host's).
 * Exit: 0 + the hash on stdout; 2 on any failure (callers fall
 * back to the wrapper's recorded default).
 */
"use strict";
const net = require("node:net");
const tls = require("node:tls");
const crypto = require("node:crypto");

const upstreamRaw = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.all_proxy || "";
if (!upstreamRaw) { console.error("drive-egress-spki: no upstream proxy in env"); process.exit(2); }
const upstream = new URL(upstreamRaw);
const auth = upstream.username
  ? "Basic " + Buffer.from(decodeURIComponent(upstream.username) + ":" + decodeURIComponent(upstream.password)).toString("base64")
  : null;
const target = process.argv[2] || "job-boards.greenhouse.io";

const sock = net.connect(Number(upstream.port), upstream.hostname, () => {
  let lines = `CONNECT ${target}:443 HTTP/1.1\r\nHost: ${target}:443\r\n`;
  if (auth) lines += `Proxy-Authorization: ${auth}\r\n`;
  lines += "\r\n";
  sock.write(lines);
});
let buf = Buffer.alloc(0);
sock.on("data", (ch) => {
  buf = Buffer.concat([buf, ch]);
  const idx = buf.indexOf("\r\n\r\n");
  if (idx === -1) return;
  sock.removeAllListeners("data");
  const statusLine = buf.slice(0, buf.indexOf("\r\n")).toString("latin1");
  if (!/^HTTP\/1\.[01] 200/.test(statusLine)) { console.error("drive-egress-spki: CONNECT refused:", statusLine); process.exit(2); }
  const t = tls.connect({ socket: sock, servername: target, rejectUnauthorized: false }, () => {
    try {
      let c = t.getPeerCertificate(true);
      let root = null, hops = 0;
      const seen = new Set();
      while (c && c.raw && !seen.has(c.fingerprint256) && hops++ < 8) {
        seen.add(c.fingerprint256);
        root = c;
        if (c.issuerCertificate === c) break;
        c = c.issuerCertificate;
      }
      if (!root) { console.error("drive-egress-spki: empty chain"); process.exit(2); }
      const x = new crypto.X509Certificate(root.raw);
      const spki = x.publicKey.export({ format: "der", type: "spki" });
      console.log(crypto.createHash("sha256").update(spki).digest("base64"));
      t.end(); process.exit(0);
    } catch (e) { console.error("drive-egress-spki:", e.message); process.exit(2); }
  });
  t.on("error", (e) => { console.error("drive-egress-spki: tls:", e.message); process.exit(2); });
});
sock.on("error", (e) => { console.error("drive-egress-spki:", e.message); process.exit(2); });
setTimeout(() => { console.error("drive-egress-spki: timeout"); process.exit(2); }, 30000).unref();
