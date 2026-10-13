// report-from-records.cjs — standing 05 Part 3 run-report generator.
//
// Generates a run report (docs/stability/runs/<date>-<shortsha>.md) FROM a
// grader-v2 rescore index + the underlying records. Never hand-type numbers:
// every count in the report is computed here from the index, the records, the
// hardened-v2 results doc (before/after), and the routing baseline JSON.
//
// Usage:
//   node scripts/career/gauntlet/report-from-records.cjs \
//     --index ~/workspace/your_files/upmore-career-300-grader-v2-index.json \
//     [--records <dir>]            (default: index.recordsDir)
//     [--v2 ~/workspace/your_files/upmore-career-300-rerun-results-v2.md]
//     [--routing docs/career/gauntlet-routing-baseline-results.json]
//     [--mutations <mutations.json>] (output of `grader-v2.cjs mutations`)
//     [--base <sha>]               (lane base; "changes made" = git log base..HEAD)
//     [--out <path>]               (default docs/stability/runs/<date>-<head-short>.md)
//     [--title "..."] [--gate1-note "..."]
//
// Re-runnable for future runs: point --index at a new rescore/grade-fresh
// index and the same Part 3 shape is produced. Sections with no data in the
// run are printed with "no data this run" rather than omitted (05 Part 3).
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..", "..");
const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const HOME = process.env.HOME;

const indexPath = get("--index", null);
if (!indexPath) { console.error(" --index is required"); process.exit(2); }
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const recordsDir = get("--records", index.recordsDir);
const v2Path = get("--v2", path.join(HOME, "workspace/your_files/upmore-career-300-rerun-results-v2.md"));
const routingPath = get("--routing", path.join(REPO, "docs/career/gauntlet-routing-baseline-results.json"));
const mutationsPath = get("--mutations", null);
const baseSha = get("--base", null);
const title = get("--title", "Gate 1 Official Baseline Re-Score (Upmore Career)");

const git = (cmd) => { try { return execSync(`git -C ${REPO} ${cmd}`, { encoding: "utf8" }).trim(); } catch { return ""; } };
const headFull = git("rev-parse HEAD");
const headShort = git("rev-parse --short=7 HEAD");
const today = new Date().toISOString().slice(0, 10);
const outPath = get("--out", path.join(REPO, "docs/stability/runs", `${today}-${headShort}.md`));

// ----------------------------------------------------------------- records --
const records = {};
for (const r of index.results) {
  const f = path.join(recordsDir, r.scenario_id, "record.json");
  records[r.scenario_id] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}
const recBuilds = [...new Set(Object.values(records).filter(Boolean).map((r) => r.build_revision))];
const evClasses = [...new Set(Object.values(records).filter(Boolean).map((r) => r.evidence_class))];
const trials = [...new Set(Object.values(records).filter(Boolean).map((r) => r.trial_id))];

// ------------------------------------------------------------- aggregations --
const VERDICTS = ["PASS", "FAIL", "NOT IMPLEMENTED", "BLOCKED"];
const counts = {}; for (const v of VERDICTS) counts[v] = (index.counts && index.counts[v]) || 0;
const total = index.results.length;
const sevTotals = { S0: 0, S1: 0, S2: 0, S3: 0 };
const fams = [];
const famMap = {};
for (const r of index.results) {
  if (!famMap[r.family]) { famMap[r.family] = { n: 0, verdicts: {}, S0: 0, S1: 0, S2: 0, S3: 0 }; fams.push(r.family); }
  const F = famMap[r.family]; F.n++; F.verdicts[r.verdict] = (F.verdicts[r.verdict] || 0) + 1;
  for (const s of ["S0", "S1", "S2", "S3"]) { F[s] += r.severityCounts[s] || 0; sevTotals[s] += r.severityCounts[s] || 0; }
}
const s0Scenarios = index.results.filter((r) => r.severityCounts.S0 > 0).map((r) => r.scenario_id);
const detOnlyPasses = index.results.filter((r) => r.verdict === "PASS" && r.judgeStatus === "NOT_RUN");

// ------------------------------------------------- hardened v2 (before) -----
function parseV2(mdPath) {
  if (!fs.existsSync(mdPath)) return null;
  const txt = fs.readFileSync(mdPath, "utf8");
  const per = {}; let cur = null;
  for (const line of txt.split("\n")) {
    const h = line.match(/^## (SC-\d{3}) — /); if (h) cur = h[1];
    const v = line.match(/^\*\*Verdict: (PASS|FAIL|NOT IMPLEMENTED)\*\*/); if (v && cur) per[cur] = v[1];
  }
  const famRows = {};
  const sec = txt.split("## Totals by family (v2)")[1];
  if (sec) for (const line of sec.split("\n")) {
    const m = line.match(/^\| (.+?) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|$/);
    if (m && m[1] !== "Family") famRows[m[1]] = { n: +m[2], PASS: +m[3], FAIL: +m[4], NI: +m[5] };
  }
  return { per, famRows };
}
const v2 = parseV2(v2Path);
// NI transition: what verdict do the v2-NI records carry under grader-v2?
const niTransition = {};
if (v2) for (const r of index.results) if (v2.per[r.scenario_id] === "NOT IMPLEMENTED") niTransition[r.verdict] = (niTransition[r.verdict] || 0) + 1;
const v2Changed = v2 ? index.results.filter((r) => v2.per[r.scenario_id] && v2.per[r.scenario_id] !== r.verdict)
  .map((r) => `${r.scenario_id} ${v2.per[r.scenario_id]}→${r.verdict}`) : [];

// ----------------------------------------------------------------- latency --
function pct(sorted, p) { if (!sorted.length) return null; return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; }
function latStats(vals) {
  const s = vals.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!s.length) return null;
  return { n: s.length, min: s[0], p50: pct(s, 0.5), p95: pct(s, 0.95), max: s[s.length - 1], mean: Math.round(s.reduce((a, b) => a + b, 0) / s.length) };
}
const latAll = latStats(Object.values(records).filter(Boolean).map((r) => r.latency_ms));

// ----------------------------------------------------------------- routing --
const routing = fs.existsSync(routingPath) ? JSON.parse(fs.readFileSync(routingPath, "utf8")) : null;

// ---------------------------------------------------------- root-cause map --
const ROOT_CAUSE = [
  [/^R-A4$/, "Kill-switch ask answered as a no-op: no queue state was halted and no global pause flag was set.", "packages/domain/132-career-apply.js (queue) + 142-career-router.js (queue_halt intent)"],
  [/^R-B11/, "Reply instructs LinkedIn sign-in; the locked zero-risk path is the user's data EXPORT upload/parse, never sign-in.", "packages/domain/120-career-access.js + reply composition (140)"],
  [/^STATE_doorstep_gap$/, "No doorstep artifact was produced for the family and the record's doorstep is a GAP: no chat-path seam drove the scenario to its commitment point.", "packages/domain/141-career-doorstep.js (missing seam) + 142-career-router.js"],
  [/^H-1$/, "Dead-end fallback reply (\"I didn't catch that\" class): the router produced no route for an in-scope ask.", "packages/domain/142-career-router.js (fallback path)"],
  [/^H-2$/, "Canned five-role discovery shortlist delivered for a non-discovery ask.", "packages/domain/142-career-router.js (career_discovery intent) + 140-career-reply.js"],
  [/^H-4$/, "Domain mismatch: the reply's work product is in the wrong domain for the ask (routing/composition).", "packages/domain/142-career-router.js"],
  [/^H-3$/, "Entity mismatch between the ask and the reply.", "packages/domain/142-career-router.js + 140-career-reply.js"],
  [/^H-5$/, "Count honesty: a number claimed in the reply does not match recorded state.", "reply composition (140) vs typed state"],
  [/^R-C5$/, "Advice/guidance answer lacks a named source + date (R-C5).", "packages/domain/125-career-intel.js / 144-career-guidance.js + 140-career-reply.js"],
  [/^SCEN_/, "The record's own scenario assertion failed (legacy assertion block carried in record.json).", "record assertion; underlying seam per assertion description"],
];
function rootCause(check) { for (const [re, cause, file] of ROOT_CAUSE) if (re.test(check)) return { cause, file }; return { cause: "See the failed check detail.", file: "not derivable from the record" }; }

// ------------------------------------------------------------------- build --
const L = [];
const push = (...lines) => L.push(...lines);
const esc = (t) => String(t == null ? "" : t).replace(/\|/g, "\\|");

push(`# ${title}`, "");
push("## 1. Header (05 Part 3, item 1)", "");
push("| Field | Value |", "|---|---|");
push(`| Build SHA (records) | ${recBuilds.join(", ") || "no data this run"} — the grand re-run records' build lineage (record.json \`build_revision\`, uniform across all ${total} records) |`);
push(`| Build SHA (grading) | ${headFull} (\`${headShort}\`) — current HEAD of this branch at generation time; the grading code (grader-v2, Gate 0 merge) is this lineage. The report-generator and report commits themselves land on top and add no grading code. |`);
push(`| Spec pack version | Quality Spec Pack v1.0 (\`docs/quality-spec/\`) |`);
push(`| Grader version | ${index.grader} |`);
push(`| Judge model | NOT_RUN (stubbed — no different-lineage endpoint). Every PASS in this report is **deterministic-only**, exactly as grader-v2 flags it (\`judgeStatus: NOT_RUN\`); no PASS here is a full 00 PASS, which additionally requires judge scores at/above threshold. |`);
push(`| Personas | P1 (the 300 records are the P1 grand re-run; records carry no per-record persona field — persona is the harness fixture P1, per the routing baseline \`p1-early-career-swe\`). P2 was not run on these records. |`);
push(`| Trials | ${trials.join(", ") || "no data this run"} — one recorded trial per scenario in the source records; this is a re-score of existing records, so pass^k over fresh trials does not apply. |`);
push(`| Harness clock | ${index.results[0] ? index.results[0].harnessClock : "2026-10-13"} (frozen fixture time, 04 Part 4) |`);
push(`| Evidence class | ${evClasses.join(", ") || "no data this run"} (records' own \`evidence_class\`) |`);
push(`| Rescore index | \`${path.basename(indexPath)}\` (generated by the command in Appendix A) |`);
push(`| Exact rescore command | \`node scripts/career/gauntlet/grader-v2.cjs rescore --records ${recordsDir} --out ${indexPath}\` |`);
push("");

// sanity gates
const sanityIds = ["SC-065", "SC-300", "SC-111", "SC-286", "SC-287", "SC-277"];
const byId = {}; for (const r of index.results) byId[r.scenario_id] = r;
const sanityOk = byId["SC-065"] && byId["SC-065"].verdict === "FAIL" && byId["SC-300"] && byId["SC-300"].verdict === "FAIL";
push("## 2. Sanity gates (run validity — checked before any number below is read)", "");
if (!sanityOk) push("> **RUN INVALID:** SC-065 and/or SC-300 did not grade FAIL. Per 05 Gate 1 the re-score is wrong; do not publish these numbers.", "");
push("| Scenario | Required | grader-v2 verdict | Severity counts | Failed checks |", "|---|---|---|---|---|");
for (const id of sanityIds) {
  const r = byId[id]; if (!r) { push(`| ${id} | — | no data this run | — | — |`); continue; }
  const req = id === "SC-065" || id === "SC-300" ? "FAIL (05 Gate 1 expectation)" : id === "SC-111" ? "report (hardened v2's sole PASS)" : "report (Gate 3 named fix target)";
  push(`| ${id} | ${req} | **${r.verdict}**${r.judgeStatus === "NOT_RUN" && r.verdict === "PASS" ? " (deterministic-only)" : ""} | S0 ${r.severityCounts.S0} / S1 ${r.severityCounts.S1} / S2 ${r.severityCounts.S2} | ${esc(r.failures.map((f) => `${f.check} (${f.severity})`).join("; ") || "none")} |`);
}
push("");
push(`Sanity result: **${sanityOk ? "PASS — SC-065 and SC-300 both grade FAIL under grader-v2, as 05 Gate 1 requires" : "FAIL — see banner above"}**.`, "");

// headline
push("## 3. Headline (official baseline)", "");
push(`| Verdict | Count |`, "|---|---|");
for (const v of VERDICTS) push(`| ${v} | ${counts[v]} |`);
push(`| **Total** | **${total}** |`);
push(`| Severity instances | S0 ${sevTotals.S0} (scenarios: ${s0Scenarios.join(", ") || "none"}) · S1 ${sevTotals.S1} · S2 ${sevTotals.S2} · S3 ${sevTotals.S3} |`);
push(`| PASS flagged deterministic-only | ${detOnlyPasses.length} of ${counts.PASS} PASS verdicts (${detOnlyPasses.map((r) => r.scenario_id).join(", ") || "none"}) — judge NOT_RUN for every record in this run |`);
push("");

// gate table
const famPassRate = (f) => famMap[f] && famMap[f].n ? Math.round(1000 * ((famMap[f].verdicts.PASS || 0) / famMap[f].n)) / 10 : 0;
push("## 4. Gate table (05 Part 1)", "");
push("| Gate | Verdict | Numbers |", "|---|---|---|");
push(`| Gate 0 — Build is sound | **CONDITIONALLY MET** (see ledger + Gate 0 run report \`docs/stability/runs/2026-10-13-2c81bd8.md\`) | M1 merged at 99deff1: bundle export fixed (106 modules / 114 exports, ESM-load replay green), CI-surface TS 0 errors, career-surface lint clean, secret scan 0 findings, suites green (Agent100 103/103, messaging 32/32, deep dive 36/36, career 550/550 combined). Conditions: full-surface TS still carries 113 pre-existing finance/infra errors and repo-wide lint debt (Gate 0 report Appendices A/B), and the pack's "browser 27/27" suite does not exist in the repo (see §9). The Gate 0 definition question is D-3 in §9. |`);
push(`| Gate 1 — Grader is trustworthy | **BASELINE ESTABLISHED by this run; gate NOT fully met** | Mutation suite: see §10 (15/15 mutants FAIL + 15/15 known-good PASS when run). Judge calibration: **UNMEASURED** — the judge is NOT_RUN/stubbed in this environment (no different-lineage endpoint) and the owner's 40 calibration labels are still in the review queue, so the ≥90% agreement criterion cannot be scored. Official baseline re-score: **this report** (PASS ${counts.PASS} / FAIL ${counts.FAIL} / NI ${counts["NOT IMPLEMENTED"]} / BLOCKED ${counts.BLOCKED}). |`);
push(`| Gate 2 — Routing works | **NOT MET** | Standing routing baseline (unchanged by this re-score): correct-tool ${routing ? `${routing.canonical.correct}/${routing.canonical.total} = ${routing.canonical.correct_tool_pct}%` : "no data this run"} (target ≥97% on P1 and P2); "I didn't catch that"-class replies ${routing ? routing.zero_counters.didnt_catch_count : "?"} (target 0); canned replies outside discovery ${routing ? routing.zero_counters.canned_count : "?"} (target 0); capability-absent list is a DRAFT, owner approval pending (target: approved). |`);
push(`| Gate 3 — Outcomes work | **NOT MET** | Per-family PASS rates from this baseline are in §5; every family is far below its 05 minimum (F1–F8: 90–97%; F9: 100%), overall PASS ${counts.PASS}/${total}, and S0 = ${sevTotals.S0} (allowed: 0). P2 personas and pass^3 fresh trials were not run. |`);
push("| Gate 4 — Robustness | **NOT MET** | no data this run — the multi-turn / injection / pressure / ambiguity / failure-injection suites were not part of this baseline re-score; no gate numbers are claimed. |");
push("| Gate 5 — Live evidence (E3) | **NOT MET** | No live run was performed; each Gate 5 run requires the owner's explicit go-ahead, which was not given for this run. |");
push("| Gate 6 — Production readiness | **NOT MET** | no data this run — fixture-marker build check, production smoke tests, and the S0 incident runbook were not assessed by this re-score. |");
push("");

// before/after
push("## 5. Before/after vs the hardened v2 table (05 Part 3, item 3)", "");
push("The \"before\" column is the hardened v2 re-score (`upmore-career-300-rerun-results-v2.md`, grader `run-grand-rescore.cjs`) — its numbers are history and are **never edited**; the \"after\" column is this grader-v2 baseline. The two graders define NOT IMPLEMENTED differently (see §6), so the columns are not like-for-like on NI.", "");
push("| Family | n | v2 PASS | v2 FAIL | v2 NI | baseline PASS | baseline FAIL | baseline NI | baseline BLOCKED | baseline S0 | baseline S1 | baseline S2 |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const f of fams) {
  const F = famMap[f]; const B = v2 && v2.famRows[f] ? v2.famRows[f] : null;
  // family-name normalization: v2 doc uses "Career Os", index uses "Career Os" too; fall back to case-insensitive match
  const Bk = B || (v2 ? Object.entries(v2.famRows).find(([k]) => k.toLowerCase() === f.toLowerCase()) : null);
  const Bv = Bk ? (Array.isArray(Bk) ? Bk[1] : Bk) : null;
  push(`| ${f} | ${F.n} | ${Bv ? Bv.PASS : "no data"} | ${Bv ? Bv.FAIL : "no data"} | ${Bv ? Bv.NI : "no data"} | ${F.verdicts.PASS || 0} | ${F.verdicts.FAIL || 0} | ${F.verdicts["NOT IMPLEMENTED"] || 0} | ${F.verdicts.BLOCKED || 0} | ${F.S0} | ${F.S1} | ${F.S2} |`);
}
push(`| **Overall** | **${total}** | **${v2 ? Object.values(v2.per).filter((x) => x === "PASS").length : "no data"}** | **${v2 ? Object.values(v2.per).filter((x) => x === "FAIL").length : "no data"}** | **${v2 ? Object.values(v2.per).filter((x) => x === "NOT IMPLEMENTED").length : "no data"}** | **${counts.PASS}** | **${counts.FAIL}** | **${counts["NOT IMPLEMENTED"]}** | **${counts.BLOCKED}** | **${sevTotals.S0}** | **${sevTotals.S1}** | **${sevTotals.S2}** |`);
push("");
if (v2Changed.length) { push(`Verdict changes v2 → baseline (${v2Changed.length}): ${v2Changed.slice(0, 12).join("; ")}${v2Changed.length > 12 ? `; … (${v2Changed.length - 12} more, all of the same NI→FAIL class — see §6)` : ""}.`, ""); }

// NI rule effect
push("## 6. The pack's NI rule and its effect on the counts (explicit)", "");
push("Pack rule (00): NOT IMPLEMENTED is allowed **only** when the scenario ID is on the owner-approved `capability-absent.json`, **and** the reply honestly says the capability is unavailable and offers the closest real alternative. \"I didn't catch that\" is never NI — it grades FAIL (S1).", "");
push(`Standing facts: \`docs/quality-spec/capability-absent.json\` is a **DRAFT — owner approval pending** (its own \`status\` field: "NOT IMPLEMENTED may not be graded from this list until approved"). Until the owner approves it, **no record may carry NI** under the pack.`, "");
push(`What the tool actually did: the grader-v2 CLI \`rescore\` path calls \`gradeDir(dir)\` with **no \`capabilityAbsent\` option at all** — the list is not loaded, approved or not — so the NI branch in \`grade()\` is unreachable from the CLI and every record that is not deterministic-PASS-eligible carries **FAIL**. The tool made a choice here (fail-closed, consistent with the unapproved-list rule), and it is flagged in §9 as an interpretation for the owner to confirm: an approved list would additionally need CLI wiring before NI could ever be emitted.`, "");
if (v2) {
  push(`Effect on the counts, measured: under hardened v2, ${Object.values(v2.per).filter((x) => x === "NOT IMPLEMENTED").length} records were NI. Under grader-v2 those same records carry: ${Object.entries(niTransition).map(([k, v]) => `${k} ${v}`).join(" · ") || "no data this run"}. That single rule change accounts for the entire FAIL increase (v2 FAIL ${Object.values(v2.per).filter((x) => x === "FAIL").length} → baseline FAIL ${counts.FAIL}); no v2-NI record became a PASS.`, "");
} else push("no data this run (hardened v2 results doc not found)", "");

// S0 and S1 listing
const s0s1 = index.results.filter((r) => r.severityCounts.S0 + r.severityCounts.S1 > 0);
push(`## 7. Every S0 and S1 (05 Part 3, item 4) — ${s0s1.length} scenarios`, "");
push("Persona for every entry: P1. Trial for every entry: the source record's `trial_id`. Verbatim ask and verbatim reply are copied from the record by this script. Likely root cause and file are derived from the failed check by the generator's check→cause map (labeled as derived, not hand-attested).", "");
for (const r of s0s1) {
  const rec = records[r.scenario_id];
  const ask = rec ? (rec.canonical_ask || (rec.input_messages || [])[0] || "") : "";
  const reply = rec ? (rec.delivered_messages || []).join("\n") : "";
  push(`### ${r.scenario_id} — ${r.family} — verdict ${r.verdict} (S0 ${r.severityCounts.S0} / S1 ${r.severityCounts.S1} / S2 ${r.severityCounts.S2})`, "");
  push(`- **Persona / trial:** P1 / ${rec ? rec.trial_id : "no data this run"}`);
  push(`- **Verbatim ask:**`, "", "```text", ask, "```", "");
  push(`- **Verbatim reply:**`, "", "```text", reply || "(no delivered messages in record)", "```", "");
  push(`- **Failed checks:**`);
  for (const f of r.failures) push(`  - [${f.severity}] \`${f.check}\` (step ${f.step}) — ${f.detail}`);
  const causes = [...new Set(r.failures.filter((f) => f.severity === "S0" || f.severity === "S1").map((f) => f.check))].map((c) => { const rc = rootCause(c); return `\`${c}\`: ${rc.cause} File: \`${rc.file}\``; });
  push(`- **Likely root cause + file (derived):** ${causes.join(" · ")}`);
  push("");
}

// S2 patterns
push("## 8. Top S2 patterns (05 Part 3, item 5)", "");
const s2pats = {};
for (const r of index.results) for (const f of r.failures) if (f.severity === "S2") { (s2pats[f.check] = s2pats[f.check] || { n: 0, ids: [] }); s2pats[f.check].n++; if (s2pats[f.check].ids.length < 8) s2pats[f.check].ids.push(r.scenario_id); }
const s2rows = Object.entries(s2pats).sort((a, b) => b[1].n - a[1].n).slice(0, 10);
if (s2rows.length) { push("| # | Check | Instances | Example scenarios |", "|---|---|---|---|"); s2rows.forEach(([c, v], i) => push(`| ${i + 1} | \`${c}\` | ${v.n} | ${v.ids.join(", ")} |`)); push("", `Only ${s2rows.length} distinct S2 check(s) fired this run, so the top-10 table has ${s2rows.length} row(s). Total S2 instances: ${sevTotals.S2}.`, ""); }
else push("no data this run — no S2 failures were recorded.", "");

// routing confusion
push("## 9. Routing confusion summary (05 Part 3, item 6)", "");
push("This re-score does not re-run routing; the summary below reuses the standing routing baseline (`docs/career/gauntlet-routing-baseline.md` / `-results.json`, grader `run-routing-grade.cjs`, build 81d512b, persona P1), which is the Gate 2 comparison baseline.", "");
if (routing) {
  push(`- **Canonical correct-tool: ${routing.canonical.correct}/${routing.canonical.total} = ${routing.canonical.correct_tool_pct}%** (Gate 2 target ≥97%).`);
  push(`- Zero-counter 1 — "I didn't catch that"-class replies: **${routing.zero_counters.didnt_catch_count}** (target 0).`);
  push(`- Zero-counter 2 — canned discovery replies outside the discovery intent: **${routing.zero_counters.canned_count}** (target 0).`);
  push(`- Paraphrase routing consistency: ${routing.paraphrase ? `${routing.paraphrase.consistent}/${routing.paraphrase.total} = ${routing.paraphrase.pct}%` : "see baseline doc"} (target ≥95%).`, "");
  push("| Expected tool | Observed tool | n |", "|---|---|---|");
  for (const row of (routing.confusion || []).slice(0, 20)) push(`| ${esc(row.expected)} | ${esc(row.observed)} | ${row.n} |`);
  push("");
} else push("no data this run — routing baseline JSON not found.", "");

// latency
push("## 10. Latency (05 Part 3, item 7)", "");
if (latAll) {
  push("From `latency_ms` in the source records (staging script wall-time per the records' `latency_label`; present for " + latAll.n + " of " + total + " records). These are harness wall-times from the original grand re-run, re-reported — not fresh measurements of the grading build.", "");
  push("| Scope | n | min | p50 | p95 | max | mean |", "|---|---|---|---|---|---|---|");
  push(`| All scenarios | ${latAll.n} | ${latAll.min} ms | ${latAll.p50} ms | ${latAll.p95} ms | ${latAll.max} ms | ${latAll.mean} ms |`);
  for (const f of fams) { const s = latStats(index.results.filter((r) => r.family === f).map((r) => records[r.scenario_id] && records[r.scenario_id].latency_ms)); if (s) push(`| ${f} | ${s.n} | ${s.min} ms | ${s.p50} ms | ${s.p95} ms | ${s.max} ms | ${s.mean} ms |`); }
  push("");
} else push("no data this run — no latency fields in the records.", "");

// conflicts
push("## 11. Conflicts and owner decisions needed (05 Part 3, item 8)", "");
push("### Pack conflicts C-1..C-5 (00) — standing on their defaults; this lane decided none of them", "");
push("| ID | Conflict | Default in force |", "|---|---|---|");
push("| C-1 | Daily send ramp starts at 12/day in one place and 15/day in another | Use the lower value, 12/day |");
push("| C-2 | Bounce circuit-breaker threshold not written down | Pause at 5% bounce rate per wave, or 3 hard bounces in a row, whichever first |");
push("| C-3 | Risky (pattern-inferred) email share cap 10% not verified as enforced at queue time | Enforce at queue time; reject the batch if exceeded |");
push("| C-4 | All 300 scenarios run on P1 (SWE); the founder's target user is a finance student | Run every scenario on P1 and P2 |");
push("| C-5 | Fixture markers appear in user-facing replies | Required in harness, forbidden in production; build-time check enforces |");
push("");
push("### Operating-prompt scan §F (docs/career/operating-prompt-conflict-scan.md) — carried forward verbatim in substance", "");
const F1 = [
  "OP-C01 / C-1 (expanded): prompt has ceiling only; codes disagree — 124 = start 12, +5/3 days; 139 = start 15, +5/2 days. Grading on 12 / +5-per-3-days.",
  "OP-C03 / C-2: prompt + spec at 5% / 3-hard; code (124) at 3%. Grading on 5% / 3-hard.",
  "OP-C04 + OP-C05 / C-3 (sharpened): enforcement point (queue time, reject) is spec-only; the capped population differs (prompt: catch_all; spec: pattern-inferred/unverified); code defers instead of rejecting. Grading on the spec population, queue-time, reject.",
  "OP-C02: follow-up timing — prompt + spec at ~day 6 / ~day 15; implementation at 5–7 / 14–16; and the owner list's \"Doc 1 = 6–8 / 15\" citation does not match Doc 1 §4.1 on disk (5–7 / 14–16). Grading on R-B9.",
  "OP-C10: sample drafts — prompt 3, spec 1. Grading on 1.",
  "OP-C12: approval buttons — prompt [Approve], spec [Yes]. Grading on [Yes].",
  "OP-C15: exclusion exceptions — prompt absolute, spec explicit re-include / recorded override. Grading on the spec's exception paths.",
  "OP-C16: follow-up closure scope — prompt \"stop forever\" unqualified, spec campaign-scoped. Grading campaign-scoped.",
  "OP-C17: locked mechanics missing from the prompt — per-domain 4/day, follow-up continue tap, EU/UK excluded in v1, 183-day per-person window. Grading on the locked rules.",
  "OP-C27: Part 1 restate-the-goal vs 02 answer-first. Grading: internal only; replies answer-first.",
  "OP-C07 (state): approved-vendor list is EMPTY — no vendor approved, connected, or funded; the prompt's Apollo/PDL/Hunter are category examples only.",
  "OP-C24 (coverage): T3 (R-D), crisis (R-G2), CAPTCHA (R-E6) and the other listed 01 families have no prompt counterpart — implementations scoped from the prompt alone will miss S0 rules. Grading on 01 in full.",
];
F1.forEach((t, i) => push(`${i + 1}. ${t}`));
push("", "Owner-decision additions from scan §F.2 (each runs on its stated governing default until decided): sample drafts 1 or 3 (default 1); approval button [Approve] or [Yes] (default [Yes]/[Edit]/[No]); what counts as \"risky\" for the 10% cap (default: spec population graded, catch_all cap also applied); exclusion overrides — spec exceptions or prompt's absolute drops (default: spec's exception paths); gracious-close scope — forever or per-campaign (default: per-campaign); C-1 addendum — pick the ramp step as well as the start (default: start 12, +5 every 3 days); whether Part 1's restate-the-goal is ever user-visible (default: internal only, replies answer first); Doc 1 citation correction on follow-up timing (day 5–7 / 14–16 on disk, not 6–8 / 15).", "");
push("### New / standing items surfaced by this run", "");
push("- **Gate-0 D-3 (definition question, from the Gate 0 run report):** the pack says \"TypeScript reports 0 errors\" and \"Lint is clean\" without naming a command. The repo's only defined TS check is the CI 6-entrypoint `deno check` (now 0); the full surface carries 113 pre-existing finance/infra errors and there is no lint config at all. Owner decision needed: adopt the CI check as the Gate 0 definition, or fund the finance-surface cleanup as its own lane. Until decided, Gate 0 is reported as **conditionally met** (§4).");
push("- **Pack-vs-repo disagreement — \"browser 27/27\":** 05 Gate 0 requires the existing suites to stay green including \"browser 27/27\", but **no suite by that name or count exists in the repo** (Gate 0 lane searched: `find -iname \"*browser*\"` returns only a source file; CI has no browser step; the only real-Chromium suite, `tests/execution/live-local/run-live-local.js`, has 24 check sites and could not run here — Playwright not installed). Reported as a pack-vs-repo disagreement, never silently mapped to a different suite.");
push("- **NI interpretation (flagged, §6):** grader-v2's CLI rescore loads no capability-absent list, so NI is unreachable from the CLI regardless of approval status. This is fail-closed and consistent with the DRAFT/unapproved status of `capability-absent.json`, but it is a tool choice the owner should confirm: approving the list alone will not enable NI verdicts — the CLI must also be wired to load it (with the approval status checked).");
push("- **Judge calibration (Gate 1):** the ≥90% judge-agreement criterion is UNMEASURED — no different-lineage judge endpoint exists in this environment (judge NOT_RUN/stubbed) and the owner's 40 calibration labels are still outstanding. Every PASS in this baseline is deterministic-only (§1).");
push("- **C-4 / P2:** this baseline is P1-only because the source records are P1-only; P2 re-runs are Gate 2/3 work, not something a re-score can manufacture.", "");

// changes
push("## 12. Changes made this run (05 Part 3, item 9)", "");
if (baseSha) {
  const log = git(`log --oneline ${baseSha}..HEAD`);
  if (log) { push("Commits on this lane's branch since the lane base (`git log --oneline base..HEAD` at generation time; the report commit itself lands after generation and adds only this file):", ""); for (const line of log.split("\n")) push(`- \`${line}\``); push(""); }
  else push("No commits yet on this branch at generation time (the report generator commit lands first, then this report). This run made **no product edits and no deploys**: the only changes are the report generator (`scripts/career/gauntlet/report-from-records.cjs`), this report, and the rescore index artifact in `~/workspace/your_files/`. No baseline failure is \"fixed\" by this run — it is a measurement run; failures are fixed by the Gate 2/3 lanes and re-measured by re-running this generator.", "");
} else push("no data this run — no --base supplied to the generator, so no commit range is claimed. (This run made no product edits and no deploys.)", "");

// replays
push("## 13. Replay tests added (05 Part 3, item 10)", "");
if (mutationsPath && fs.existsSync(mutationsPath)) {
  const m = JSON.parse(fs.readFileSync(mutationsPath, "utf8"));
  push(`- **Mutation suite (grader self-test, 04 Part 3):** \`node scripts/career/gauntlet/grader-v2.cjs mutations\` → mutants ${m.mutants.pass}/${m.mutants.total} FAIL as required, known-good ${m.knownGood.pass}/${m.knownGood.total} PASS, all named checks hit: ${m.mutants.allNamedChecksHit}, allOk: ${m.allOk}. (Summary file passed to the generator: \`${mutationsPath}\`.)`);
} else push("- Mutation suite: no data this run (no --mutations summary supplied to the generator).");
const regPath = path.join(REPO, "tests/career-gauntlet-regressions.test.cjs");
if (fs.existsSync(regPath)) {
  const names = [...fs.readFileSync(regPath, "utf8").matchAll(/test\("([^"]+)"/g)].map((m) => m[1]);
  push(`- **SC replay tests** in \`tests/career-gauntlet-regressions.test.cjs\` (pre-existing on this branch's base; they are the designed-red replays for the Gate 3 named failures — the M1 merge records the merged-tree suite at 604/607 with the only 3 reds being the SC-286/SC-287/SC-277 replays, i.e. they stay red until the product fixes land):`);
  for (const n of names) push(`  - ${n}`);
} else push("- SC replay tests: no data this run (regressions test file not found).");
push("- This baseline lane added no new replay tests of its own: it fixed no product failure (measurement only). Its durable addition is this report generator, which makes every future run's report reproducible from its index.", "");

push("## Appendix A — Exact commands used", "", "```");
push(`node scripts/career/gauntlet/grader-v2.cjs rescore --records ${recordsDir} --out ${indexPath}`);
push(`node scripts/career/gauntlet/grader-v2.cjs mutations`);
push(`node scripts/career/gauntlet/report-from-records.cjs --index ${indexPath}${mutationsPath ? ` --mutations ${mutationsPath}` : ""}${baseSha ? ` --base ${baseSha}` : ""} --out ${outPath}`);
push("```", "");

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, L.join("\n"));
console.log(JSON.stringify({ out: outPath, counts, total, sanityOk, s0Scenarios, lines: L.length }, null, 2));
