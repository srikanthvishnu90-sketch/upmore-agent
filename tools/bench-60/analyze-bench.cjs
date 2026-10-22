"use strict";
/* BENCH-60 harness — final analysis (harness code, NOT product code).
   Reclassifies every leg of a bench-driver record into the bench's
   honest outcome classes, from the record's own fields only:
     drove:<outcomeClass>  — board driven, application-level outcome
     crashed:DRIVER_ERROR  — board driven (calls > 0) but the drive
                             died mid-flight (executor blocked the
                             intent DRIVER_ERROR; no run record exists)
     no_drive:screened_out / no_drive:family_filtered — pipeline gates
     in_flight_at_window_end / surplus_in_flight_at_target
   Emits bench60-record-final.json (record + benchClass per leg, the
   input render-cards.cjs consumes) and bench-analysis.json (the
   numbers the bench note cites).
   Usage: node analyze-bench.cjs <bench-record.json> <outDir> */
const fs = require("node:fs");
const path = require("node:path");
const record = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const OUTDIR = process.argv[3];
const legs = record.legs.map((l) => {
  let benchClass;
  if (l.drove) benchClass = `drove:${l.outcomeClass}`;
  else if (l.inFlightAtWindowEnd) benchClass = "in_flight_at_window_end";
  else if (l.surplusInFlightAtTarget) benchClass = "surplus_in_flight_at_target";
  else if ((l.callErrors || []).includes("DRIVER_ERROR")) benchClass = "crashed:DRIVER_ERROR";
  else if (l.stopCode === "BOARD_NOT_WIRED") benchClass = "no_drive:board_not_wired";
  else benchClass = l.outcomeClass; // no_drive:screened_out / no_drive:family_filtered / no_drive:no_board_calls
  return Object.assign({}, l, { benchClass });
});
const t0 = Date.parse(record.startedAt);
const drove = legs.filter((l) => l.drove);
const slices = [];
for (let s = 0; s < 6; s++) {
  const a = t0 + s * 300000, b = a + 300000;
  slices.push({
    sliceMin: `${s * 5}-${s * 5 + 5}`,
    launched: legs.filter((l) => { const t = Date.parse(l.startISO); return t >= a && t < b; }).length,
    droveCompleted: drove.filter((l) => { const t = Date.parse(l.endISO); return t >= a && t < b; }).length,
    crashed: legs.filter((l) => l.benchClass === "crashed:DRIVER_ERROR" && Date.parse(l.endISO) >= a && Date.parse(l.endISO) < b).length,
  });
}
const drains = drove.map((l) => l.drainMs).filter((n) => typeof n === "number").sort((a, b) => a - b);
const med = drains.length ? drains[Math.floor(drains.length / 2)] : null;
const mix = {};
for (const l of legs) mix[l.benchClass] = (mix[l.benchClass] || 0) + 1;
const analysis = {
  label: record.label, startedAt: record.startedAt, endedAt: record.endedAt, wallMs: record.wallMs,
  finishReason: record.finishReason, target: record.target || 60,
  bootIdAtStart: record.bootIdAtStart, bootIdAtEnd: record.bootIdAtEnd, bootChanged: record.bootIdAtStart !== record.bootIdAtEnd,
  launched: legs.length, droveCompleted: drove.length,
  appsPerMinOverWall: record.wallMs ? +(drove.length / (record.wallMs / 60000)).toFixed(2) : null,
  appsPerMinDriveWindow: record.appsPerMin,
  drainMsMedianDrove: med, drainMsMinDrove: drains[0] || null, drainMsMaxDrove: drains[drains.length - 1] || null,
  slices, outcomeMix: mix, probes: record.probes, cpu: record.cpu,
  captchaLegs: legs.filter((l) => l.outcomeClass === "captcha_handoff").length,
};
const final = Object.assign({}, record, { legs });
fs.writeFileSync(path.join(OUTDIR, "bench60-record-final.json"), JSON.stringify(final, null, 1));
fs.writeFileSync(path.join(OUTDIR, "bench-analysis.json"), JSON.stringify(analysis, null, 1));
console.log("ANALYSIS_DONE " + JSON.stringify({ drove: analysis.droveCompleted, launched: analysis.launched, mix, slices }));
