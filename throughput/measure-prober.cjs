"use strict";
/* measure-prober.cjs — M3 companion: probes the board service's
   event-loop availability during a drive. Every ~150ms it POSTs an
   authenticated call for a nonexistent session (a 404 that still
   passes through handle()) and records the round-trip latency.
   If board calls block the event loop, probe latency spikes to the
   blocking call's remaining duration. Read-only; no session created.
   Usage: node measure-prober.cjs <seconds> */
const fs = require("node:fs");
for (const line of fs.readFileSync("/home/hatch/worker-config/executor.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const secret = process.env.WORKER_SECRET || "";
const secs = Number(process.argv[2] || 60);
const lat = [];
const DEAD = "0".repeat(32);
(async () => {
  const end = Date.now() + secs * 1000;
  while (Date.now() < end) {
    const a = Date.now();
    try {
      const res = await fetch(`http://127.0.0.1:8471/board-sessions/${DEAD}/call`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-upmore-board-secret": secret },
        body: JSON.stringify({ userId: "throughput-prober", method: "form", args: [] }),
      });
      await res.text();
      lat.push(Date.now() - a);
    } catch (_) { lat.push(-1); }
    await new Promise((r) => setTimeout(r, 150));
  }
  const ok = lat.filter((x) => x >= 0).sort((x, y) => x - y);
  const pct = (p) => ok[Math.min(ok.length - 1, Math.floor((p / 100) * ok.length))];
  console.log(JSON.stringify({ probes: lat.length, failed: lat.length - ok.length, p50: pct(50), p90: pct(90), p99: pct(99), max: ok[ok.length - 1], over250ms: ok.filter((x) => x > 250).length, over1000ms: ok.filter((x) => x > 1000).length }));
  process.exit(0);
})();
