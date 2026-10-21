"use strict";
/* simulate-drain.cjs — drain simulator for Throughput Fix Package A
   (serial drain). Zero dependencies. Seeded, reproducible.

   WHAT IS MODELED
   The batch executor's drain (workers/career-browser/batch-executor.cjs
   runBatchPending) is a single process that claims queued intents one
   at a time and, inside one approve intent, drives applications one at
   a time (packages/domain/155-career-batch-apply.js executeRun). This
   simulator measures the makespan of draining a queue of JOBS under:
     - N parallel workers (N = 1 is today's serial drain), and
     - two contention models:
         ideal    — workers never slow each other down;
         ps2      — processor sharing on C = 2 cores (this VM's
                    measured shape: `nproc` = 2, 8 GB RAM): when k
                    jobs are active, each progresses at rate
                    min(1, C/k). Chromium drives are CPU-heavy, so
                    ps2 is the honest planning model past N = 2.

   SERVICE-TIME DISTRIBUTION (stated, not measured — the throughput
   measurement lane's live-host baseline replaces these parameters
   when it lands):
     per application drive (session create + form fill + submit):
       triangular(min 20 s, mode 45 s, max 120 s), mean = 61.7 s
     per-job fixed overhead (claim + finish RPC, session bookkeeping):
       0.5 s, added to every job, parallelizable with the drive.
   Sensitivity rows rerun the headline scenario with fixed service
   times of 30 / 60 / 90 s so the table survives a wrong guess at
   the distribution's center.

   SCENARIOS
     A) 50 application-jobs (the owner's benchmark batch: one approve
        intent, 50 applications) — N parallel drive chains.
     B) 50 intent-jobs (a multi-user queue: 50 queued intents, each a
        batch of 10 applications; service = sum of 10 draws) —
        N parallel executor processes.

   METHOD: discrete-event simulation, fluid processor-sharing for the
   ps2 model; mulberry32 PRNG, fixed seed; 300 trials per cell;
   makespan statistics are over trials. Jobs/min = 60 * jobs / mean
   makespan. Run: node tools/drain-simulator/simulate-drain.cjs
   [--trials N] [--seed N] [--json]                                    */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OVERHEAD_S = 0.5;
function triangular(rng, min, mode, max) {
  const u = rng();
  const c = (mode - min) / (max - min);
  if (u < c) return min + Math.sqrt(u * (max - min) * (mode - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}
const appService = (rng) => triangular(rng, 20, 45, 120) + OVERHEAD_S;
const batchOf10Service = (rng) => {
  let s = 0;
  for (let i = 0; i < 10; i++) s += appService(rng);
  return s;
};
const fixedService = (seconds) => () => seconds + OVERHEAD_S;

/* One trial: `jobs` service times, `workers` servers, contention
   model "ideal" | "ps2" (C = 2 cores). Returns makespan seconds. */
function runTrial(serviceTimes, workers, model) {
  const remaining = serviceTimes.slice();
  const active = []; // indices into remaining
  let next = 0;
  let done = 0;
  let t = 0;
  const C = 2;
  const fill = () => {
    while (active.length < workers && next < remaining.length) {
      active.push(next++);
    }
  };
  fill();
  while (done < remaining.length) {
    const k = active.length;
    const rate = model === "ps2" ? Math.min(1, C / k) : 1;
    // time until the soonest active job completes at current rates
    let dt = Infinity;
    for (const i of active) dt = Math.min(dt, remaining[i] / rate);
    t += dt;
    const finished = [];
    for (const i of active) {
      remaining[i] -= rate * dt;
      if (remaining[i] <= 1e-9) finished.push(i);
    }
    for (const i of finished) {
      active.splice(active.indexOf(i), 1);
      done++;
    }
    fill();
  }
  return t;
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function simulate({ jobs, sampler, workersList, models, trials, seed }) {
  const rows = [];
  for (const model of models) {
    for (const workers of workersList) {
      const rng = mulberry32(seed + workers * 131 + (model === "ps2" ? 7 : 0));
      const makespans = [];
      for (let trial = 0; trial < trials; trial++) {
        const services = Array.from({ length: jobs }, () => sampler(rng));
        makespans.push(runTrial(services, workers, model));
      }
      makespans.sort((a, b) => a - b);
      const mean = makespans.reduce((a, b) => a + b, 0) / trials;
      rows.push({
        model, workers, jobs,
        meanMakespanS: mean,
        p50MakespanS: percentile(makespans, 0.5),
        p95MakespanS: percentile(makespans, 0.95),
        jobsPerMin: (60 * jobs) / mean,
      });
    }
  }
  return rows;
}

function fmt(n, digits = 1) {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function table(title, rows, serialMean) {
  const lines = [`### ${title}`, "", "| Model | Workers | Mean drain | p50 | p95 | Jobs/min | Speedup vs serial |", "|---|---|---|---|---|---|---|"];
  for (const r of rows) {
    lines.push(`| ${r.model} | ${r.workers} | ${fmt(r.meanMakespanS)} s (${fmt(r.meanMakespanS / 60)} min) | ${fmt(r.p50MakespanS)} s | ${fmt(r.p95MakespanS)} s | ${fmt(r.jobsPerMin, 2)} | ${fmt(serialMean / r.meanMakespanS, 2)}x |`);
  }
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 ? Number(args[i + 1]) : dflt;
  };
  const trials = opt("--trials", 300);
  const seed = opt("--seed", 20261021);
  const asJson = args.includes("--json");
  const workersList = [1, 2, 4, 8];
  const models = ["ideal", "ps2"];

  const scenarioA = simulate({ jobs: 50, sampler: appService, workersList, models, trials, seed });
  const scenarioB = simulate({ jobs: 50, sampler: batchOf10Service, workersList, models, trials, seed: seed + 1000 });
  const sensitivity = [];
  for (const fixed of [30, 60, 90]) {
    sensitivity.push(...simulate({ jobs: 50, sampler: fixedService(fixed), workersList: [1, 4], models, trials, seed: seed + fixed }));
  }

  if (asJson) {
    console.log(JSON.stringify({ trials, seed, scenarioA, scenarioB, sensitivity }, null, 2));
    return;
  }
  const serialA = scenarioA.find((r) => r.model === "ideal" && r.workers === 1).meanMakespanS;
  const serialB = scenarioB.find((r) => r.model === "ideal" && r.workers === 1).meanMakespanS;
  console.log(`# Drain simulator — ${trials} trials/cell, seed ${seed}`);
  console.log("");
  console.log("Service time per application: triangular(20 s, 45 s, 120 s), mean 61.7 s, + 0.5 s/job overhead. ps2 = processor sharing on 2 cores.");
  console.log("");
  console.log(table("Scenario A — 50 application-jobs (one benchmark batch)", scenarioA, serialA));
  console.log("");
  console.log(table("Scenario B — 50 intent-jobs (multi-user queue, batch of 10 each = 500 applications)", scenarioB, serialB));
  console.log("");
  console.log("### Sensitivity — Scenario A shape (50 application-jobs) at fixed service times");
  console.log("");
  console.log("| Fixed service | Model | Workers | Mean drain of 50 | Jobs/min |");
  console.log("|---|---|---|---|---|");
  let si = 0;
  for (const fixed of [30, 60, 90]) {
    // 4 rows per fixed value: models (ideal, ps2) x workers (1, 4)
    for (let k = 0; k < 4; k++) {
      const r = sensitivity[si++];
      console.log(`| ${fixed} s | ${r.model} | ${r.workers} | ${fmt(r.meanMakespanS)} s (${fmt(r.meanMakespanS / 60)} min) | ${fmt(r.jobsPerMin, 2)} |`);
    }
  }
}

if (require.main === module) main();
module.exports = { simulate, runTrial, mulberry32 };
