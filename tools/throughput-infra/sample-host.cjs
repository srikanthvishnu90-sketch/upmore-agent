"use strict";
/* sample-host.cjs — TP-INFRA (2026-10-21). External CPU/network sampler
   for one board-service drive. Spawned as a SEPARATE process by
   profile-drive.cjs because the driver's board calls are synchronous
   (Atomics.wait) and would starve an in-process sampler.

   Every interval it scans /proc and aggregates utime+stime per process
   CLASS (chromium renderer/gpu/main/other, the portal helper, the board
   node, the egress relay, the driver), plus /proc/loadavg and loopback
   byte counters (Chromium <-> relay :8474 and driver <-> board :8471
   traffic both ride loopback). Writes JSONL; the analyzer joins it
   against the drive's per-call wall-clock windows.

   Usage: node sample-host.cjs <out.jsonl> <boardPid> <relayPid> <driverPid> [intervalMs] */
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const out = process.argv[2];
const boardPid = Number(process.argv[3] || 0);
const relayPid = Number(process.argv[4] || 0);
const driverPid = Number(process.argv[5] || 0);
const interval = Number(process.argv[6] || 100);
const CLK = Number(execFileSync("getconf", ["CLK_TCK"]).toString().trim()) || 100;

function classify(pid, cmd) {
  if (pid === boardPid) return "board";
  if (pid === relayPid) return "relay";
  if (pid === driverPid) return "driver";
  if (cmd.includes("portal-browser-helper")) return "helper";
  if (cmd.includes("chrome") || cmd.includes("chromium")) {
    if (cmd.includes("--type=renderer")) return "chrome-renderer";
    if (cmd.includes("--type=gpu-process")) return "chrome-gpu";
    if (cmd.includes("--type=")) return "chrome-other";
    return "chrome-main";
  }
  return null;
}

function sample() {
  const classes = {};
  let pids = [];
  try { pids = fs.readdirSync("/proc").filter((d) => /^\d+$/.test(d)); } catch (_) { return; }
  for (const d of pids) {
    const pid = Number(d);
    let cmd = "";
    try { cmd = fs.readFileSync(`/proc/${d}/cmdline`, "utf8").replace(/\0/g, " "); } catch (_) { continue; }
    const cls = classify(pid, cmd);
    if (!cls) continue;
    let stat = "";
    try { stat = fs.readFileSync(`/proc/${d}/stat`, "utf8"); } catch (_) { continue; }
    const close = stat.lastIndexOf(")");
    const f = stat.slice(close + 2).split(" ");
    const utime = Number(f[11]), stime = Number(f[12]); // fields 14,15 overall
    if (!Number.isFinite(utime + stime)) continue;
    const c = classes[cls] || (classes[cls] = { n: 0, ticks: 0 });
    c.n += 1; c.ticks += utime + stime;
  }
  let lo = null;
  try {
    for (const line of fs.readFileSync("/proc/net/dev", "utf8").split("\n")) {
      const m = line.match(/^\s*lo:\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
      if (m) { lo = { rx: Number(m[1]), tx: Number(m[2]) }; break; }
    }
  } catch (_) { /* loopback counters are best-effort */ }
  let load = null;
  try { load = Number(fs.readFileSync("/proc/loadavg", "utf8").split(" ")[0]); } catch (_) { /* best-effort */ }
  fs.appendFileSync(out, JSON.stringify({ t: Date.now(), clk: CLK, load, classes, lo }) + "\n");
}

fs.writeFileSync(out, "");
const timer = setInterval(sample, interval);
sample();
process.on("SIGTERM", () => { clearInterval(timer); process.exit(0); });
process.on("SIGINT", () => { clearInterval(timer); process.exit(0); });
