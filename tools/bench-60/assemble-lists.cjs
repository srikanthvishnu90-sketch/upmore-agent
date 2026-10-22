"use strict";
/* BENCH-60 harness — assemble calibration + bench lists from the
   pre-flight results (harness code, NOT product code). Retest results
   override first-pass results per posting key. Driveable = pre-flight
   code DRIVEABLE. Order = the candidate picker's company round-robin
   order, so every list is company-mixed. Slices: calibA 6, calibB 6,
   bench 60, reserves the rest.
   Usage: node assemble-lists.cjs <harnessDir> */
const fs = require("node:fs");
const path = require("node:path");
const H = process.argv[2];
const cands = JSON.parse(fs.readFileSync(path.join(H, "candidates.json"), "utf8"));
const byKey = new Map(cands.map((c) => [c.key, c]));
const verdict = new Map();
for (const f of ["preflight/pool-results.json", "preflight2/pool-results.json"]) {
  try {
    for (const r of JSON.parse(fs.readFileSync(path.join(H, f), "utf8"))) verdict.set(r.key, r);
  } catch (_) {}
}
const driveable = cands.filter((c) => { const v = verdict.get(c.key); return v && v.code === "DRIVEABLE"; });
const rejected = cands.filter((c) => !driveable.includes(c)).map((c) => { const v = verdict.get(c.key) || {}; return { key: c.key, company: c.company, code: v.code || "NOT_TESTED", httpStatus: v.httpStatus || null, serviceError: v.serviceError || null }; });
const slice = (a, b) => driveable.slice(a, b);
const out = {
  driveableCount: driveable.length,
  calibA: slice(0, 6), calibB: slice(6, 12), bench: slice(12, 72), reserves: slice(72),
  rejected,
};
for (const name of ["calibA", "calibB", "bench", "reserves"]) fs.writeFileSync(path.join(H, `list-${name}.json`), JSON.stringify(out[name], null, 1));
fs.writeFileSync(path.join(H, "lists-summary.json"), JSON.stringify({ driveableCount: out.driveableCount, calibA: out.calibA.length, calibB: out.calibB.length, bench: out.bench.length, reserves: out.reserves.length, rejected: out.rejected }, null, 1));
console.log(JSON.stringify({ driveable: out.driveableCount, calibA: out.calibA.length, calibB: out.calibB.length, bench: out.bench.length, reserves: out.reserves.length, rejected: out.rejected.length }));
