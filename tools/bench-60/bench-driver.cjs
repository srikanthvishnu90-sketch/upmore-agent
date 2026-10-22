"use strict";
/* BENCH-60 harness — the timed bench driver (harness code, NOT product
   code). Issues prepares for ONE user (the TEST user, inside
   bench-leg.cjs) through the production composition at a bounded
   concurrency, against the REAL board service, inside a hard wall
   window. A leg counts as COMPLETED when its drive finishes with a
   named outcome recorded in its run record (doorstep, a named stop,
   a captcha handoff — the outcome mix is reported, never hidden).
   Legs still in flight at the window's end are killed and recorded
   as in_flight_at_window_end — never counted, never silently
   restarted.
   Usage: node bench-driver.cjs --list <file> --concurrency <n>
          --window-sec <s: 0 = until all legs finish> --outdir <dir>
          --label <name> [--family <text>] */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
const LIST = JSON.parse(fs.readFileSync(args.list, "utf8"));
const CONC = Math.max(1, parseInt(args.concurrency || "4", 10));
const TARGET = Math.max(0, parseInt(args.target || "0", 10));
const WINDOW_MS = Math.max(0, parseInt(args["window-sec"] || "0", 10)) * 1000;
const OUTDIR = args.outdir;
const LABEL = args.label || "bench";
const FAMILY = args.family || "software engineering intern roles";
fs.mkdirSync(path.join(OUTDIR, "legs"), { recursive: true });
const bootId = (() => { try { return fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim(); } catch (_) { return null; } })();
const record = {
  label: LABEL, concurrency: CONC, windowMsPlanned: WINDOW_MS || null, familyText: FAMILY,
  bootIdAtStart: bootId, startedAt: new Date().toISOString(), endedAt: null, wallMs: null,
  completedCount: 0, appsPerMin: null, driveWindowMs: null, slices: [], legs: [], probes: null, cpu: null,
};
const recordFile = path.join(OUTDIR, `${LABEL}-record.json`);
const persist = () => fs.writeFileSync(recordFile, JSON.stringify(record, null, 1));
persist();

// probes (service availability from outside any drive) + CPU sampler
const probeFile = path.join(OUTDIR, `${LABEL}-probes.jsonl`);
const probe = spawn(process.execPath, [path.join(__dirname, "probe.cjs"), String((WINDOW_MS || 1800000) + 120000), probeFile], { stdio: "ignore" });
const cpuFile = path.join(OUTDIR, `${LABEL}-cpu.jsonl`);
let lastCpu = null;
const readCpu = () => { const l = fs.readFileSync("/proc/stat", "utf8").split("\n")[0].split(/\s+/).slice(1).map(Number); const idle = l[3] + l[4]; const total = l.reduce((a, b) => a + b, 0); return { idle, total }; };
lastCpu = readCpu();
const cpuTimer = setInterval(() => {
  try {
    const now = readCpu();
    const dT = now.total - lastCpu.total, dI = now.idle - lastCpu.idle;
    fs.appendFileSync(cpuFile, JSON.stringify({ t: new Date().toISOString(), busyPct: dT > 0 ? +((1 - dI / dT) * 100).toFixed(1) : null }) + "\n");
    lastCpu = now;
  } catch (_) {}
}, 5000);

const t0 = Date.now();
const deadline = WINDOW_MS > 0 ? t0 + WINDOW_MS : Infinity;
let nextIdx = 0, inFlight = 0, finalized = false;
const running = new Map();

function legRecord(i, item, startISO, endISO, exitCode) {
  const outp = path.join(OUTDIR, "legs", `leg-${String(i).padStart(3, "0")}`);
  let result = null, fills = 0, callErrors = [], boardCalls = 0;
  try { result = JSON.parse(fs.readFileSync(outp + "-result.json", "utf8")); } catch (_) {}
  try {
    const rows = fs.readFileSync(outp + "-progress.jsonl", "utf8").trim().split("\n").map(JSON.parse);
    const calls = rows.filter((r) => r.board_call);
    boardCalls = calls.length;
    fills = calls.filter((r) => r.board_call === "fill").length;
    callErrors = calls.filter((r) => r.error).map((r) => r.error.code);
  } catch (_) {}
  const run = result && result.stored && result.stored.run ? result.stored.run : null;
  const app = run && run.apps ? Object.values(run.apps)[0] : null;
  const sm = run && run.summary ? run.summary : null;
  // A leg DROVE when the board was actually driven (calls > 0) and the
  // application reached a named outcome. Family-filtered / screened
  // legs complete in <1s with zero board calls — they are pipeline
  // outcomes, never prepares, and never counted toward the target.
  const drove = boardCalls > 0 && !!(app && (app.stage || (app.stop && app.stop.code)));
  const outcomeClass = drove
    ? (app.stage === "doorstep" ? "doorstep" : app.stage === "awaiting_attestation" ? "awaiting_attestation" : app.stage === "captcha_handoff" ? "captcha_handoff" : app.stage === "deferred_cap" ? "deferred_cap" : `stopped:${(app.stop && app.stop.code) || "?"}`)
    : (sm && sm.familyFound === 0 ? "no_drive:family_filtered" : sm && sm.selected === 0 ? "no_drive:screened_out" : "no_drive:no_board_calls");
  return {
    idx: i, key: item.key, company: item.company, title: item.title, url: item.url,
    startISO, endISO, exitCode,
    drainMs: result ? result.ms : null,
    fills, boardCalls, callErrors, drove, outcomeClass,
    familyFound: sm ? sm.familyFound : null, selected: sm ? sm.selected : null,
    runId: run ? run.id : null, runStatus: run ? run.status : null,
    stage: app ? app.stage : null,
    stopCode: app && app.stop ? app.stop.code : null,
    cardSha256: run ? run.cardSha256 : null,
    resultPath: outp + "-result.json",
  };
}

function launch() {
  if (finalized) return;
  const droveCount = record.legs.filter((l) => l.drove).length;
  while (inFlight < CONC && nextIdx < LIST.length && Date.now() < deadline) {
    if (TARGET > 0 && droveCount + inFlight >= TARGET) break;
    const i = nextIdx++; const item = LIST[i];
    const outp = path.join(OUTDIR, "legs", `leg-${String(i).padStart(3, "0")}`);
    const startISO = new Date().toISOString();
    const child = spawn(process.execPath, [path.join(__dirname, "bench-leg.cjs"), item.key, FAMILY, outp], { stdio: ["ignore", "ignore", "inherit"] });
    running.set(child, { i, item, startISO });
    inFlight++;
    child.on("exit", (code) => {
      running.delete(child); inFlight--;
      record.legs.push(legRecord(i, item, startISO, new Date().toISOString(), code));
      record.legs.sort((a, b) => a.idx - b.idx);
      persist();
      maybeFinish(); launch();
    });
  }
}

function summarizeProbes() {
  try {
    const rows = fs.readFileSync(probeFile, "utf8").trim().split("\n").map(JSON.parse);
    const ms = rows.map((r) => r.ms).filter((n) => typeof n === "number").sort((a, b) => a - b);
    const q = (p) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] : null);
    return { n: rows.length, p50: q(0.5), p99: q(0.99), max: ms.length ? ms[ms.length - 1] : null, timeouts: rows.filter((r) => r.status === "timeout").length, errors: rows.filter((r) => typeof r.status === "string" && r.status.startsWith("error")).length };
  } catch (_) { return null; }
}
function summarizeCpu() {
  try {
    const rows = fs.readFileSync(cpuFile, "utf8").trim().split("\n").map(JSON.parse).map((r) => r.busyPct).filter((n) => typeof n === "number");
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => a - b);
    return { samples: rows.length, avgPct: +(rows.reduce((a, b) => a + b, 0) / rows.length).toFixed(1), p95Pct: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))], maxPct: sorted[sorted.length - 1] };
  } catch (_) { return null; }
}

function finish(reason) {
  if (finalized) return; finalized = true;
  clearInterval(cpuTimer);
  try { probe.kill("SIGTERM"); } catch (_) {}
  const endMs = Date.now();
  record.endedAt = new Date(endMs).toISOString();
  record.wallMs = endMs - t0;
  record.finishReason = reason;
  record.bootIdAtEnd = (() => { try { return fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim(); } catch (_) { return null; } })();
  const done = record.legs.filter((l) => l.drove);
  record.completedCount = done.length;
  record.launchedCount = record.legs.length;
  record.target = TARGET || null;
  if (done.length) {
    const starts = done.map((l) => Date.parse(l.startISO)); const ends = done.map((l) => Date.parse(l.endISO));
    record.driveWindowMs = Math.max(...ends) - Math.min(...starts);
    record.appsPerMin = +(done.length / (record.driveWindowMs / 60000)).toFixed(2);
    for (let s = 0; s * 300000 < record.wallMs; s++) {
      const a = t0 + s * 300000, b = a + 300000;
      record.slices.push({ sliceMin: `${s * 5}-${s * 5 + 5}`, completed: done.filter((l) => { const e = Date.parse(l.endISO); return e >= a && e < b; }).length });
    }
  }
  record.probes = summarizeProbes();
  record.cpu = summarizeCpu();
  persist();
  console.log("BENCH_DONE " + JSON.stringify({ label: LABEL, reason, completed: record.completedCount, of: LIST.length, wallMs: record.wallMs, appsPerMin: record.appsPerMin, inFlightAtEnd: record.legs.filter((l) => l.inFlightAtWindowEnd).length }));
  process.exit(0);
}

function maybeFinish() {
  if (finalized) return;
  if (TARGET > 0 && record.legs.filter((l) => l.drove).length >= TARGET) {
    for (const [child, meta] of running) {
      try { child.kill("SIGTERM"); } catch (_) {}
      record.legs.push(Object.assign(legRecord(meta.i, meta.item, meta.startISO, new Date().toISOString(), null), { surplusInFlightAtTarget: true }));
    }
    running.clear(); inFlight = 0;
    record.legs.sort((a, b) => a.idx - b.idx);
    finish("target_reached");
    return;
  }
  if (nextIdx >= LIST.length && inFlight === 0) finish(TARGET > 0 ? "list_exhausted" : "all_legs_done");
}
if (WINDOW_MS > 0) {
  setTimeout(() => {
    for (const [child, meta] of running) {
      try { child.kill("SIGTERM"); } catch (_) {}
      record.legs.push(Object.assign(legRecord(meta.i, meta.item, meta.startISO, new Date().toISOString(), null), { inFlightAtWindowEnd: true }));
    }
    running.clear(); inFlight = 0;
    record.legs.sort((a, b) => a.idx - b.idx);
    setTimeout(() => finish("window_end"), 500);
  }, WINDOW_MS);
}
launch(); maybeFinish();
