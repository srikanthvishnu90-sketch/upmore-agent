// Depth Lane D (2026-10-16) — the 48-hour proof auditor for the alerts
// scheduler. Reads the JSONL cycle log the scheduler appends to and checks
// it against the cadence grid the systemd timer fires on:
//   - a STARRED tick is due every 15 minutes; a DEFAULT tick every hour.
//   - a tick is ON TIME when a run covering that cadence started within
//     [tick, tick + 5 min]; a LATE COVER when the first covering run
//     started later but before the next tick of that cadence (the
//     Persistent=true catch-up shape after downtime); MISSED when no run
//     covered the cadence before its next tick.
//   - duplicate deliveries: the same reminder_id delivered in two
//     different cycle records is a hard failure (exactly-once is the
//     host ledger's contract; this is the independent check on it).
// Usage: node scripts/career/alerts-scheduler-audit.mjs [--log <path>]
//        [--from <ISO>] [--to <ISO>] [--json]
// Exit 0 = no missed ticks and no duplicates in the window; 1 otherwise.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const LOG = opt("--log", "/home/hatch/workspace/alerts-scheduler/logs/cycles.jsonl");
const AS_JSON = args.includes("--json");

const lines = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean) : [];
const cycles = [];
for (const l of lines) { try { const o = JSON.parse(l); if (o.type === "career_alert_scheduler_cycle") cycles.push(o); } catch { /* torn last line during an append — skip */ } }
cycles.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

const from = opt("--from", cycles.length ? cycles[0].at : new Date().toISOString());
const to = opt("--to", new Date().toISOString());
const fromMs = Date.parse(from), toMs = Date.parse(to);
const inWindow = cycles.filter((c) => Date.parse(c.at) >= fromMs && Date.parse(c.at) <= toMs);

function coverage(cadence, everyMin) {
  const runs = inWindow.filter((c) => (c.cadences_run || []).includes(cadence)).map((c) => Date.parse(c.at)).sort((a, b) => a - b);
  // ticks aligned to the wall-clock grid the timer fires on
  const step = everyMin * 60000;
  const firstTick = Math.ceil(fromMs / step) * step;
  let onTime = 0, late = 0; const missed = [];
  for (let tick = firstTick; tick + step <= toMs + 1; tick += step) {
    const cover = runs.find((r) => r >= tick - 60000 && r < tick + step);
    if (cover == null) missed.push(new Date(tick).toISOString());
    else if (cover <= tick + 5 * 60000) onTime += 1;
    else late += 1;
  }
  return { cadence, ticks: onTime + late + missed.length, on_time: onTime, late_cover: late, missed };
}

const starred = coverage("starred", 15);
const hourly = coverage("default", 60);

const deliveredSeen = new Map();
const duplicates = [];
let deliveredTotal = 0;
for (const c of inWindow) for (const p of c.passes || []) for (const id of p.delivered_ids || []) {
  deliveredTotal += 1;
  if (deliveredSeen.has(id)) duplicates.push({ reminder_id: id, first: deliveredSeen.get(id), again: c.at });
  else deliveredSeen.set(id, c.at);
}
const crashed = inWindow.filter((c) => c.status === "crashed" || c.status === "not_wired");
const errorCycles = inWindow.filter((c) => (c.passes || []).some((p) => (p.errors || []).length));

const report = {
  log: LOG, window: { from, to },
  cycles_logged: inWindow.length,
  starred, default: hourly,
  delivered_total: deliveredTotal, duplicate_deliveries: duplicates,
  crashed_or_not_wired: crashed.map((c) => ({ at: c.at, status: c.status })),
  cycles_with_errors: errorCycles.length,
  verdict: (starred.missed.length === 0 && hourly.missed.length === 0 && duplicates.length === 0) ? "CLEAN so far" : "ISSUES — see missed/duplicates",
};
if (AS_JSON) console.log(JSON.stringify(report, null, 1));
else {
  console.log(`alerts scheduler audit — ${report.window.from} .. ${report.window.to}`);
  console.log(`cycles logged: ${report.cycles_logged}`);
  for (const c of [starred, hourly]) console.log(`  ${c.cadence}: ${c.ticks} ticks — on time ${c.on_time}, late cover ${c.late_cover}, missed ${c.missed.length}${c.missed.length ? " (" + c.missed.slice(0, 5).join(", ") + (c.missed.length > 5 ? ", …" : "") + ")" : ""}`);
  console.log(`deliveries: ${deliveredTotal} total, ${duplicates.length} duplicates`);
  console.log(`crashed/not-wired cycles: ${crashed.length}; cycles with per-board errors: ${errorCycles.length}`);
  console.log(`verdict: ${report.verdict}`);
}
process.exit(report.verdict.startsWith("CLEAN") ? 0 : 1);
