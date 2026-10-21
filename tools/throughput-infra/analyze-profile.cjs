"use strict";
/* analyze-profile.cjs — TP-INFRA deliverable 1 (2026-10-21).
   Joins profile-drive.cjs's per-call wall windows against
   sample-host.cjs's per-class CPU snapshots and splits each call:
     wall = chromium CPU (page work) + helper/board/relay/driver CPU
            (host work) + RESIDUAL (fixed sleeps, Playwright
            actionability/poll waits, CDP round-trip latency, network)
   CPU deltas use the samples bracketing each window (<=100ms edge
   error per side). Chromium CPU sums across the browser tree, so it
   is reported in CPU-ms and as a fraction of ONE core's wall time.

   The fixed-sleep floor inside a fill is source-accounted in the
   lane report (portal-browser-helper.cjs cmdFill/driveWidget):
   plain fills settle 450/650/1000ms per attempt (<=3 attempts, each
   with a full readback); a widget fill runs ONE driveWidget whose
   option poll ladder sleeps 500ms x up to 34 iterations.

   Usage: node analyze-profile.cjs <resultsDir> */
const fs = require("node:fs");
const path = require("node:path");

const dir = process.argv[2];
const calls = JSON.parse(fs.readFileSync(path.join(dir, "calls.json"), "utf8"));
const summary = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));
const samples = fs.readFileSync(path.join(dir, "samples.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
if (!samples.length) { console.error("NO_SAMPLES"); process.exit(1); }
const CLK = samples[0].clk || 100;
const CHROME = ["chrome-renderer", "chrome-main", "chrome-gpu", "chrome-other"];

function bracket(t) {
  let before = samples[0], after = samples[samples.length - 1];
  for (const s of samples) { if (s.t <= t) before = s; if (s.t >= t && after === samples[samples.length - 1] && s.t >= t) { after = s; break; } }
  for (const s of samples) { if (s.t >= t) { after = s; break; } }
  return [before, after];
}
function cpuIn(t0, t1, cls) {
  const [a, b] = [bracket(t0)[0], bracket(t1)[1]];
  const ta = a.classes[cls] ? a.classes[cls].ticks : 0;
  const tb = b.classes[cls] ? b.classes[cls].ticks : 0;
  return Math.max(0, ((tb - ta) / CLK) * 1000);
}
function loIn(t0, t1) {
  const a = bracket(t0)[0], b = bracket(t1)[1];
  if (!a.lo || !b.lo) return null;
  return (b.lo.rx - a.lo.rx) + (b.lo.tx - a.lo.tx);
}

const rows = calls.map((c) => {
  const chrome = CHROME.reduce((s, k) => s + cpuIn(c.t0, c.t1, k), 0);
  const renderer = cpuIn(c.t0, c.t1, "chrome-renderer");
  const helper = cpuIn(c.t0, c.t1, "helper");
  const board = cpuIn(c.t0, c.t1, "board");
  const relay = cpuIn(c.t0, c.t1, "relay");
  const driver = cpuIn(c.t0, c.t1, "driver");
  const hostCpu = helper + board + relay + driver;
  return {
    method: c.method, fieldId: c.fieldId || null, valueLen: c.valueLen, ms: c.ms,
    attempts: c.ret && c.ret.attempts, ret: c.ret || undefined, code: c.code,
    chromeCpuMs: Math.round(chrome), rendererCpuMs: Math.round(renderer),
    hostCpuMs: Math.round(hostCpu), helperCpuMs: Math.round(helper),
    loBytes: loIn(c.t0, c.t1),
    residualMs: Math.round(c.ms - chrome - hostCpu),
  };
});

const fills = rows.filter((r) => r.method === "fill");
const sum = (arr, k) => arr.reduce((s, r) => s + (r[k] || 0), 0);
const fieldType = {};
for (const f of summary.formFields || []) fieldType[f.field_id] = f.widget ? `widget:${f.widget}` : (f.inputType || "?");
for (const r of fills) r.fieldType = fieldType[r.fieldId] || "?";

const agg = {
  fills: fills.length,
  wallMs: sum(fills, "ms"),
  chromeCpuMs: sum(fills, "chromeCpuMs"),
  rendererCpuMs: sum(fills, "rendererCpuMs"),
  hostCpuMs: sum(fills, "hostCpuMs"),
  residualMs: sum(fills, "residualMs"),
  loBytes: sum(fills, "loBytes"),
};
agg.chromePctOfWall = agg.wallMs ? Math.round((agg.chromeCpuMs / agg.wallMs) * 1000) / 10 : 0;
agg.hostPctOfWall = agg.wallMs ? Math.round((agg.hostCpuMs / agg.wallMs) * 1000) / 10 : 0;
agg.residualPctOfWall = agg.wallMs ? Math.round((agg.residualMs / agg.wallMs) * 1000) / 10 : 0;

const byMethod = {};
for (const r of rows) {
  const m = byMethod[r.method] || (byMethod[r.method] = { n: 0, wallMs: 0, chromeCpuMs: 0, residualMs: 0 });
  m.n += 1; m.wallMs += r.ms; m.chromeCpuMs += r.chromeCpuMs; m.residualMs += r.residualMs;
}

const out = { target: summary.target, totalMs: summary.totalMs, resultStatus: summary.resultStatus, code: summary.code, stops: summary.stops, byMethod, fillAggregate: agg, fills, allCalls: rows };
fs.writeFileSync(path.join(dir, "analysis.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ target: summary.target, totalMs: summary.totalMs, code: summary.code, byMethod, fillAggregate: agg }, null, 2));
for (const r of fills) console.log(`fill ${r.fieldId} [${r.fieldType}] wall=${r.ms}ms chromeCpu=${r.chromeCpuMs}ms renderer=${r.rendererCpuMs}ms hostCpu=${r.hostCpuMs}ms residual=${r.residualMs}ms loBytes=${r.loBytes} attempts=${r.attempts}`);
