// census-300.cjs — Lane A census for the 300/300 campaign.
// Classifies all 300 canonical scenarios by root cause of their FAIL in the
// corrected Gate-1 baseline (grader-v2 re-score of the grand records),
// using ONLY recorded evidence: the corrected index (failed checks), each
// record's final_state (handler/intent/containment), its doorstep block,
// and routing-expectations.json (expected tool + acceptable intents).
// No verdict is altered; this is a decomposition of the existing FAILs.
//
// Buckets (first blocker in the causal chain wins):
//   (d) CAPABILITY-ABSENT-LISTED — the graded ask IS the absent capability;
//       terminal verdict today is NI with the entry's exact honest reply.
//   (c) MISSING/WEAK TOOL OR ENGINE (Muse lane) — the right handler/intent
//       ran, but a seam/state in Muse's modules stopped completion.
//   (a) ROUTING (Codex lane) — containment, fallback intent, or an intent
//       outside the scenario's acceptable set: 142/120 never handed the
//       turn to the owning tool (includes the named SC-277/286/287 trio).
//   (b) REPLY-CONTRACT (Muse lane) — right route + doorstep reached, only
//       reply checks fail. (Measured; may be 0 as a PRIMARY cause.)
//   (e) OWNER-GATED — PASS impossible today even with perfect code because
//       it needs the owner's deploy/vendor/inputs. (Measured as PRIMARY;
//       owner-gated legs on otherwise-routable scenarios are annotated.)
// Usage: node census-300.cjs [--md]   (default: JSON summary to stdout)
"use strict";
const fs = require("fs");
const path = require("path");
const HOME = process.env.HOME;
const ROOT = path.join(HOME, "workspace/upmore-career");
const INDEX = path.join(HOME, "workspace/your_files/upmore-career-300-grader-v2-index-corrected.json");
const RECORDS = path.join(HOME, "workspace/your_files/upmore-career-gauntlet-300");
const EXPECT = path.join(ROOT, "scripts/career/gauntlet/routing-expectations.json");
const ABSENT = path.join(ROOT, "docs/quality-spec/capability-absent.json");

const WEDGE = new Set(["SC-286","SC-287","SC-011","SC-146","SC-148","SC-023","SC-012","SC-007","SC-020","SC-049","SC-050","SC-046","SC-025","SC-040","SC-041","SC-042","SC-043","SC-031","SC-032","SC-033","SC-038","SC-034","SC-036","SC-037","SC-044","SC-045","SC-151","SC-157","SC-035","SC-300"]);
// (d): the graded ask itself is the absent capability (CA-03 portal read,
// CA-01-class voice mock per routing-expectations R-C7 override, CA-04
// population-data answer). SC-174 is NOT here: its canonical ask is a
// dedupe scenario, not voice — see discrepancy note in the output.
const ABSENT_TERMINAL = { "SC-105": "CA-03", "SC-179": "CA-01 (voice; via routing-expectations R-C7 override)", "SC-244": "CA-04 (T-05 population data)" };
// Owner-gated legs (annotated, not primary unless nothing else blocks):
const OWNER_GATED_LEGS = { "SC-084": "live proof needs a named person who can confirm a referral was received", "SC-196": "real-content proof needs one real setback fact from the owner", "SC-105": "real read needs the owner's signed-in portal session" };

const idx = JSON.parse(fs.readFileSync(INDEX, "utf8"));
const exp = new Map(JSON.parse(fs.readFileSync(EXPECT, "utf8")).entries.map((e) => [e.id, e]));
const absent = JSON.parse(fs.readFileSync(ABSENT, "utf8"));
const caByScenario = new Map();
for (const e of absent.entries) for (const sid of e.scenario_ids || []) {
  if (/^SC-\d{3}$/.test(sid)) caByScenario.set(sid, e.id);
}

function classify(r) {
  const sid = r.scenario_id;
  const rec = JSON.parse(fs.readFileSync(path.join(RECORDS, sid, "record.json"), "utf8"));
  const fsx = rec.final_state || {};
  const intent = fsx.intent || null;
  const handler = fsx.handler || null;
  const contained = !!fsx.contained;
  const doorstepBy = (rec.doorstep || {}).driven_by || null;
  const checks = r.failures.map((f) => f.check);
  const e = exp.get(sid) || { expected_tool: "?", acceptable_intents: [] };
  const acceptable = intent && e.acceptable_intents.includes(intent);
  const tags = [];
  if (WEDGE.has(sid)) tags.push("wedge");
  if (caByScenario.has(sid)) tags.push("listed:" + caByScenario.get(sid));
  if (OWNER_GATED_LEGS[sid]) tags.push("owner-gated-leg");
  if (r.failures.some((f) => f.severity === "S0")) tags.push("S0");
  const ev = { intent, handler, contained, doorstepBy, expected_tool: e.expected_tool, checks };

  if (ABSENT_TERMINAL[sid]) return { bucket: "d", sub: "absent-terminal", ev, tags, why: `graded ask is the absent capability (${ABSENT_TERMINAL[sid]}); terminal verdict today = NI with the entry's exact honest reply` };
  if (sid === "SC-300") return { bucket: "c", sub: "queue-state-seam", ev, tags, why: "141 ran with the correct queue_halt intent but could not see the outreach queue state (split store, 124/141) — R-A4 S0; seam fix is Muse-lane" };
  if (sid === "SC-286") return { bucket: "a", sub: "module-120-no-typed-result", ev, tags, why: "120-career-access (Codex lane, F9 class) took the turn with the right intent but returned resultStatus=null and no doorstep payload — completion impossible until 120 lands its typed result" };
  if (contained || !intent) return { bucket: "a", sub: "contained-no-intent", ev, tags, why: "containment fallback answered; no handler in the chain owned the turn" };
  if (intent === "career_fallback") return { bucket: "a", sub: "fallback-intent", ev, tags, why: "142 returned career_fallback ('I didn't catch that' class)" };
  if (!acceptable) return { bucket: "a", sub: "wrong-intent:" + intent, ev, tags, why: `142 routed to intent '${intent}', outside the acceptable set for expected tool ${e.expected_tool}` };
  // intent acceptable from here
  if (doorstepBy === "gap" || checks.some((c) => c.startsWith("STATE"))) return { bucket: "c", sub: "doorstep-gap-after-route", ev, tags, why: "right intent, but no doorstep seam drove it to the commitment point" };
  return { bucket: "b", sub: "reply-only", ev, tags, why: "right route and doorstep; only reply-contract checks fail" };
}

const rows = idx.results.map((r) => ({ sid: r.scenario_id, family: r.family, ...classify(r) }));
const byBucket = {}; const byFamily = {}; const bySub = {};
for (const row of rows) {
  byBucket[row.bucket] = (byBucket[row.bucket] || 0) + 1;
  bySub[row.bucket + ":" + row.sub] = (bySub[row.bucket + ":" + row.sub] || 0) + 1;
  byFamily[row.family] = byFamily[row.family] || {};
  byFamily[row.family][row.bucket] = (byFamily[row.family][row.bucket] || 0) + 1;
}
const wedgeRows = rows.filter((r) => r.tags.includes("wedge"));
const wedgeByBucket = {};
for (const r of wedgeRows) wedgeByBucket[r.bucket] = (wedgeByBucket[r.bucket] || 0) + 1;
// secondary (non-primary) reply-contract failure load
const replyChecks = ["H-12", "R-C5", "H-5", "H-3", "H-7", "ARTIFACT_MATCH"];
const secondary = {};
for (const c of replyChecks) secondary[c] = idx.results.filter((r) => r.failures.some((f) => f.check === c)).length;

if (!process.argv.includes("--md")) {
  console.log(JSON.stringify({ total: rows.length, byBucket, bySub, byFamily, wedgeByBucket, secondary }, null, 1));
} else {
  const B = { a: "(a) ROUTING — Codex lane", b: "(b) REPLY-CONTRACT — Muse lane", c: "(c) MISSING/WEAK TOOL OR ENGINE — Muse lane", d: "(d) CAPABILITY-ABSENT-LISTED", e: "(e) OWNER-GATED" };
  let md = "";
  md += "| Bucket | Count |\n|---|---|\n";
  for (const b of ["a", "b", "c", "d", "e"]) md += `| ${B[b]} | ${byBucket[b] || 0} |\n`;
  md += `| **Total** | **${rows.length}** |\n\n`;
  md += "| Family | n | (a) | (b) | (c) | (d) | (e) |\n|---|---|---|---|---|---|---|\n";
  for (const [fam, bs] of Object.entries(byFamily)) {
    const n = Object.values(bs).reduce((x, y) => x + y, 0);
    md += `| ${fam} | ${n} | ${bs.a || 0} | ${bs.b || 0} | ${bs.c || 0} | ${bs.d || 0} | ${bs.e || 0} |\n`;
  }
  md += "\nSub-classes:\n";
  for (const [k, v] of Object.entries(bySub).sort((x, y) => y[1] - x[1])) md += `- ${k}: ${v}\n`;
  md += `\nWedge 30 by bucket: ${JSON.stringify(wedgeByBucket)}\n`;
  md += `\nSecondary reply-contract load (failures riding on top of the primary cause; these become primary only after routing lands): ${JSON.stringify(secondary)}\n`;
  md += "\nPer-scenario (bucket · sub-class · observed intent → expected tool · tags):\n\n";
  for (const r of rows) md += `- ${r.sid} · ${r.bucket} · ${r.sub} · intent=${r.ev.intent || "none"} → ${r.ev.expected_tool}${r.tags.length ? " · " + r.tags.join(", ") : ""}\n`;
  console.log(md);
}
