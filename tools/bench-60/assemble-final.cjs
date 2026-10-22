"use strict";
/* BENCH-60 harness — final list assembly (harness code, NOT product
   code). Inputs: the merged pre-flight verdicts (all rounds, later
   rounds win per key) and the selector output over the driveable set.
   Emits, in candidate (company round-robin) order, restricted to
   postings the selector KEEPS for the bench family text:
   calibA (6) + calibB (6) + bench (the rest, with the 12 calibration
   postings appended at the tail as the last reserves — a posting
   prepared in calibration may be prepared again; within the bench
   every leg is a distinct posting until the tail).
   Usage: node assemble-final.cjs <harnessDir> <familyText> */
const fs = require("node:fs");
const path = require("node:path");
const H = process.argv[2];
const TEXT = process.argv[3];
const cands = JSON.parse(fs.readFileSync(path.join(H, "candidates.json"), "utf8"));
const verdict = new Map();
for (const f of ["preflight/pool-results.json", "preflight2/pool-results.json", "preflight3/pool-results.json"]) {
  try { for (const r of JSON.parse(fs.readFileSync(path.join(H, f), "utf8"))) verdict.set(r.key, r); } catch (_) {}
}
const driveable = cands.filter((c) => { const v = verdict.get(c.key); return v && v.code === "DRIVEABLE"; });
fs.writeFileSync(path.join(H, "driveable-final.json"), JSON.stringify(driveable, null, 1));
if (!fs.existsSync(path.join(H, "selection-final.json"))) { console.log(JSON.stringify({ driveable: driveable.length, stage: "driveable-final written; run select-bench next" })); process.exit(3); }
const sel = JSON.parse(fs.readFileSync(path.join(H, "selection-final.json"), "utf8"));
const keepSet = new Set(sel.filter((r) => r[`keep:${TEXT}`]).map((r) => r.key));
const kept = driveable.filter((c) => keepSet.has(c.key));
const calibA = kept.slice(0, 6), calibB = kept.slice(6, 12);
const bench = kept.slice(12).concat(calibA, calibB);
fs.writeFileSync(path.join(H, "list-calibA2.json"), JSON.stringify(calibA, null, 1));
fs.writeFileSync(path.join(H, "list-calibB.json"), JSON.stringify(calibB, null, 1));
fs.writeFileSync(path.join(H, "list-bench.json"), JSON.stringify(bench, null, 1));
console.log(JSON.stringify({ driveable: driveable.length, kept: kept.length, calibA: calibA.length, calibB: calibB.length, benchList: bench.length }));
