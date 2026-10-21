"use strict";
/* analyze.cjs — DROPDOWN-MEASURE lane (2026-10-21). Aggregates every
   results/run-*\/records.jsonl into the deliverable: per-widget-type
   table, the full mismatch list, and a root-cause readout.
   Verdict rules (mirroring module 149's own observation comparison,
   extended with the FR-395 rendering case):
   - correct:          readback == intended (normalized).
   - correct_rendered: readback is the board's own rendering of the
                       same value (prefix/substring relation, both
                       decline-class, or a bare dial code "+1" for a
                       country name) — value-format, not a failure of
                       the pick itself.
   - mismatch:         a genuinely different value observed.
   - vanished:         fill reported success (helper-verified) but the
                       final readback holds nothing (remount drop).
   - not_observed:     fill failed and nothing was observed.
   Poll-ladder depth is DERIVED from fill wall time (the helper does
   not return it across the board-service protocol): driveWidget's
   fixed prefix (click + clear + type at ~30ms/char) + cmdFill's
   ~750ms settle/readback, then one 500ms poll + ~50ms of evaluates
   per rung. Reported as approximate, bucketed by ladder zone.
   Usage: node analyze.cjs <resultsRoot> <reportOut.md> */
const fs = require("node:fs");
const path = require("node:path");

const resultsRoot = process.argv[2];
const reportOut = process.argv[3];
const norm = (v) => String(v == null ? "" : v).toLowerCase().replace(/\s+/g, " ").trim();
/* Loose norm: punctuation stripped (the helper's own matcher norm) —
   "Decline To Self Identify" and "Decline to self-identify" are the
   same value under it, and "don't wish" becomes "don t wish", which
   is the form the decline patterns are written against. */
const normLoose = (v) => norm(v).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const declineClass = (v) => /decline|prefer not|do not wish|don t wish|not (to )?answer|not (to )?disclose|no answer/.test(normLoose(v));

function verdict(r) {
  const intended = r.intended, observed = r.observedFinal !== null && r.observedFinal !== undefined ? r.observedFinal : r.observedInternal;
  if (intended === null || intended === undefined) return { verdict: "no_intended", observed };
  if (observed === null || observed === undefined || String(observed).trim() === "") {
    return { verdict: r.fillOk ? "vanished" : "not_observed", observed: null };
  }
  const ni = norm(intended), no = norm(observed);
  if (ni === no || normLoose(intended) === normLoose(observed)) return { verdict: "correct", observed };
  if (declineClass(intended) && declineClass(observed)) return { verdict: "correct_rendered", observed };
  if ((ni.length >= 2 && no.startsWith(ni)) || (no.length >= 2 && ni.startsWith(no))) return { verdict: "correct_rendered", observed };
  if (/^\+\d+$/.test(String(observed).trim()) && ni.length >= 4) return { verdict: "correct_rendered", observed };
  if (ni.includes(no) && no.length >= 3) return { verdict: "correct_rendered", observed };
  return { verdict: "mismatch", observed };
}

function rootCause(r, v) {
  if (r.phase === "probe" && r.kind !== "eeo" && r.intended === "Decline to self-identify") return "harness probe mis-target (EEO default sent to a non-EEO screening widget) — not product evidence";
  if (v.verdict === "correct_rendered") return "value-format";
  if (v.verdict === "mismatch") {
    const hi = norm(r.intended).split(" ")[0], ho = norm(v.observed).split(" ")[0];
    return hi && hi === ho ? "value-format (option text drift)" : "widget-behavior (wrong pick)";
  }
  if (v.verdict === "vanished") return "widget-behavior (verified at fill, dropped before readback)";
  if (v.verdict === "not_observed") {
    if (/mark all that apply|select all that apply/i.test(r.label || "")) return "widget-behavior (multi-select driven by the single-value widget drive)";
    if (r.widgetType === "react-select") {
      const d = pollDepth(r);
      if (d !== null && d >= 30) return "poll-ladder exhausted (no option matched in 34 polls — widget variant)";
      return r.ms >= 9000 ? "timing/poll-ladder (no pick inside the ladder)" : "timing/other (fast fill failure)";
    }
    return "widget-behavior/persist (helper could not land or persist the option)";
  }
  return "n/a";
}

function pollDepth(r) {
  if (r.widgetType !== "react-select" || r.intended == null) return null;
  const prefix = 900 + 30 * String(r.intended).length + 750;
  const d = Math.max(0, Math.min(34, Math.round((r.ms - prefix) / 550)));
  return d;
}
function ladderZone(d) {
  if (d === null) return "";
  if (d <= 5) return "initial poll (pre-retype)";
  if (d <= 10) return "segment-retype zone";
  if (d <= 16) return "word-retype zone";
  if (d < 34) return "cleared-search zone";
  return "ladder exhausted";
}
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const median = (arr) => pct(arr, 0.5);

const runs = fs.readdirSync(resultsRoot).filter((d) => d.startsWith("run-")).sort();
const all = [];
const runSummaries = [];
for (const run of runs) {
  const dir = path.join(resultsRoot, run);
  const recPath = path.join(dir, "records.jsonl");
  if (fs.existsSync(recPath)) {
    for (const line of fs.readFileSync(recPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      const v = verdict(r);
      r._verdict = v.verdict; r._observed = v.observed; r._cause = rootCause(r, v); r._depth = pollDepth(r);
      all.push(r);
    }
  }
  const sumPath = path.join(dir, "summary.json");
  if (fs.existsSync(sumPath)) runSummaries.push({ run, summary: JSON.parse(fs.readFileSync(sumPath, "utf8")) });
}

const byType = new Map();
for (const r of all) {
  if (!byType.has(r.widgetType)) byType.set(r.widgetType, []);
  byType.get(r.widgetType).push(r);
}
const lines = [];
lines.push("# DROPDOWN MEASURE — results (LANE D, 2026-10-21)");
lines.push("");
lines.push(`Interactions recorded: **${all.length}** across **${runs.length}** forms. Doorstep only — no submit was armed or fired on any run.`);
lines.push("");
lines.push("## Per-form run outcomes (production path, module 149 runApply)");
lines.push("");
lines.push("| form | runApply result | code | dropdowns measured |");
lines.push("|---|---|---|---|");
for (const { run, summary } of runSummaries) {
  const n = all.filter((r) => r.url === summary.target.url).length;
  lines.push(`| ${summary.target.company} — ${String(summary.target.title).slice(0, 44)} | ${summary.runApply ? summary.runApply.resultStatus || "(returned)" : "THREW " + (summary.runApplyErr && summary.runApplyErr.code)} | ${summary.runApply ? summary.runApply.code || "" : ""} | ${n} |`);
}
lines.push("");
lines.push("## Results by widget type");
lines.push("");
lines.push("| widget type | attempted | observed-correct | correct-as-rendered | mismatched (wrong value) | vanished after verified fill | not observed (fill failed) | median fill | p90 fill |");
lines.push("|---|---|---|---|---|---|---|---|---|");
for (const [type, rs] of byType) {
  const c = (v) => rs.filter((r) => r._verdict === v).length;
  const times = rs.map((r) => r.ms);
  lines.push(`| ${type} | ${rs.length} | ${c("correct")} | ${c("correct_rendered")} | ${c("mismatch")} | ${c("vanished")} | ${c("not_observed")} | ${median(times)} ms | ${pct(times, 0.9)} ms |`);
}
lines.push("");
lines.push("## Every non-correct interaction");
lines.push("");
lines.push("| form | field | type | phase | intended | observed | fill | ms | ~poll depth | root cause |");
lines.push("|---|---|---|---|---|---|---|---|---|---|");
for (const r of all) {
  if (r._verdict === "correct") continue;
  lines.push(`| ${r.company} | ${String(r.label).slice(0, 42)} | ${r.widgetType} | ${r.phase} | ${String(r.intended).slice(0, 34)} | ${r._observed === null ? "(nothing)" : String(r._observed).slice(0, 34)} | ${r.fillOk ? "ok" : "FAILED" + (r.fillErr ? ":" + r.fillErr : "")} | ${r.ms} | ${r._depth === null ? "" : r._depth + " (" + ladderZone(r._depth) + ")"} | ${r._cause} |`);
}
lines.push("");
lines.push("## Correct interactions (for the record)");
lines.push("");
for (const r of all) {
  if (r._verdict !== "correct" && r._verdict !== "correct_rendered") continue;
  lines.push(`- ${r.company} · ${String(r.label).slice(0, 42)} · ${r.widgetType} · ${r.phase} · intended "${String(r.intended).slice(0, 34)}" · observed "${String(r._observed).slice(0, 34)}" · ${r.ms} ms${r._depth !== null ? " · ~poll " + r._depth : ""}${r._verdict === "correct_rendered" ? " · rendered-form" : ""}`);
}
lines.push("");
const causeTally = {};
for (const r of all) { if (r._verdict !== "correct") causeTally[r._cause] = (causeTally[r._cause] || 0) + 1; }
lines.push("## Root-cause tally (non-correct interactions)");
lines.push("");
for (const [k, v] of Object.entries(causeTally).sort((a, b) => b[1] - a[1])) lines.push(`- ${k}: ${v}`);
lines.push("");
const depths = all.filter((r) => r._depth !== null);
if (depths.length) {
  lines.push(`Poll-ladder depth (derived, react-select fills): median ~${median(depths.map((r) => r._depth))}, p90 ~${pct(depths.map((r) => r._depth), 0.9)}, max ~${Math.max(...depths.map((r) => r._depth))} of 34.`);
  lines.push("");
}
const report = lines.join("\n");
if (reportOut) fs.writeFileSync(reportOut, report);
console.log(report);
