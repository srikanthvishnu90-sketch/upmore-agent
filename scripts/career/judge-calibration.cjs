"use strict";
// A-07 JUDGE CALIBRATION (Crew A, 2026-10-15; protocol §12; master issue
// MI-048-family / adoption A-07). A wording percentage is meaningless until
// the judge is measured against human labels. This harness computes judge
// agreement against the owner's label set (40 transcripts, hand-labeled by
// the owner — ~/workspace/your_files/review/judge-calibration-owner-40.md
// when it lands) per dimension, and it is READY today: the day the labels
// arrive, one command produces the agreement table.
//
// JUDGE DESIGN: one prompt per dimension (never one holistic prompt), each
// with an UNKNOWN escape that counts as "judge abstains", not as agreement.
// The prompts exported below (DIMENSIONS) are the ones the re-judge driver
// uses; a holistic score from any other prompt is not calibratable here.
//
// LABEL FILE FORMAT (markdown, hand-writable):
//   ## SC-0xx (or any item id)
//   - grounded: yes|no|unknown
//   - complete: yes|no|unknown
//   - next-step: yes|no|unknown
//   - tone: yes|no|unknown
// JUDGE FILE FORMAT (JSON): { "<item id>": { "grounded": "yes|no|unknown", ... }, ... }
//
// USAGE:
//   node judge-calibration.cjs --labels <labels.md> --judge <judge.json> [--out <report.md>]
//   node judge-calibration.cjs --self-test     (synthetic fixtures; proves the math, labeled SYNTHETIC)
const fs = require("node:fs");

const DIMENSIONS = {
  grounded: "You are grading ONE dimension of a career-assistant reply: GROUNDED. Answer 'yes' if every factual claim in the reply is supported by the record shown (the user's facts, the tracker, the company file), 'no' if any claim is invented, inflated, or contradicts the record, and 'unknown' if the record shown is insufficient to decide. Output only yes, no, or unknown.",
  complete: "You are grading ONE dimension of a career-assistant reply: COMPLETE. Answer 'yes' if the reply answers the whole ask (every part of a compound ask is addressed), 'no' if any part is silently dropped, and 'unknown' if the ask itself is ambiguous. Output only yes, no, or unknown.",
  "next-step": "You are grading ONE dimension of a career-assistant reply: NEXT STEP. Answer 'yes' if the reply ends with a concrete, usable next step or a clear terminal state (done, with what was produced), 'no' if it trails off, asks a question the record already answers, or promises an action it did not take, and 'unknown' if whether a next step was owed cannot be told from the transcript. Output only yes, no, or unknown.",
  tone: "You are grading ONE dimension of a career-assistant reply: TONE. Answer 'yes' if the reply is plain, direct, and free of internal vocabulary (no system terms, no rule citations, no raw identifiers), 'no' if it leaks machinery or reads as a form letter, and 'unknown' if the sample is too short to judge. Output only yes, no, or unknown.",
};
const DIMS = Object.keys(DIMENSIONS);
const norm = (v) => { const s = String(v == null ? "" : v).trim().toLowerCase(); return ["yes", "no", "unknown"].includes(s) ? s : "unknown"; };

function parseLabels(text) {
  const out = {};
  let cur = null;
  for (const line of text.split("\n")) {
    const h = line.match(/^##\s+(\S+)/);
    if (h) { cur = h[1]; out[cur] = {}; continue; }
    const kv = line.match(/^-\s*(grounded|complete|next-step|tone)\s*:\s*(\S+)/i);
    if (kv && cur) out[cur][kv[1].toLowerCase()] = norm(kv[2]);
  }
  return out;
}

function agreement(labels, judge) {
  const per = {};
  for (const d of DIMS) per[d] = { compared: 0, agreed: 0, judgeUnknown: 0, labelUnknown: 0, misses: [] };
  let items = 0;
  for (const [id, lab] of Object.entries(labels)) {
    items++;
    const j = judge[id] || {};
    for (const d of DIMS) {
      const l = norm(lab[d]); const jv = norm(j[d]);
      if (l === "unknown") { per[d].labelUnknown++; continue; }
      if (jv === "unknown") { per[d].judgeUnknown++; continue; }
      per[d].compared++;
      if (l === jv) per[d].agreed++;
      else per[d].misses.push({ id, label: l, judge: jv });
    }
  }
  for (const d of DIMS) per[d].agreementPct = per[d].compared ? Math.round((per[d].agreed / per[d].compared) * 1000) / 10 : null;
  const compared = DIMS.reduce((a, d) => a + per[d].compared, 0);
  const agreed = DIMS.reduce((a, d) => a + per[d].agreed, 0);
  return { items, per, overallPct: compared ? Math.round((agreed / compared) * 1000) / 10 : null, compared, agreed };
}

function render(rep, header) {
  const lines = [header, "", `Items labeled: ${rep.items} · dimension comparisons (both sides decided): ${rep.compared} · agreed: ${rep.agreed} · **overall agreement: ${rep.overallPct}%**`, "", "| Dimension | Compared | Agreed | Agreement | Judge UNKNOWN (abstained) | Label UNKNOWN |", "|---|---|---|---|---|---|"];
  for (const d of DIMS) { const p = rep.per[d]; lines.push(`| ${d} | ${p.compared} | ${p.agreed} | ${p.agreementPct}% | ${p.judgeUnknown} | ${p.labelUnknown} |`); }
  lines.push("", "Rule (protocol §12): a wording figure is quoted only with this table attached; a re-judge whose agreement falls below the last recorded figure is reported as unreliable, not quoted.");
  for (const d of DIMS) for (const m of rep.per[d].misses) lines.push(`- MISS ${d} · ${m.id}: owner=${m.label} judge=${m.judge}`);
  return lines.join("\n") + "\n";
}

function selfTest() {
  const labels = parseLabels(["## T-1", "- grounded: yes", "- complete: yes", "- next-step: no", "- tone: yes", "", "## T-2", "- grounded: no", "- complete: unknown", "- next-step: yes", "- tone: no", "", "## T-3", "- grounded: yes", "- complete: no", "- next-step: unknown", "- tone: unknown"].join("\n"));
  const judge = { "T-1": { grounded: "yes", complete: "no", "next-step": "no", tone: "unknown" }, "T-2": { grounded: "no", complete: "yes", "next-step": "unknown", tone: "no" }, "T-3": { grounded: "unknown", complete: "no", "next-step": "yes", tone: "yes" } };
  const rep = agreement(labels, judge);
  // Expected by hand: grounded compared 2 (T-1, T-2 both agree; T-3 judge abstains) = 100%;
  // complete compared 2 (T-1 disagrees, T-3 agrees; T-2 label unknown) = 50%;
  // next-step compared 1 (T-1 agrees; T-2 judge abstains; T-3 label unknown) = 100%;
  // tone compared 1 (T-2 agrees; T-1 judge abstains; T-3 label unknown) = 100%.
  const exp = { grounded: 100, complete: 50, "next-step": 100, tone: 100 };
  let ok = true;
  for (const d of DIMS) if (rep.per[d].agreementPct !== exp[d]) { ok = false; console.error(`SELF-TEST MISMATCH ${d}: got ${rep.per[d].agreementPct}, want ${exp[d]}`); }
  console.log(render(rep, "# Judge calibration — SYNTHETIC SELF-TEST (fixtures invented for this check; NOT owner labels, NOT a wording verdict)"));
  console.log(ok ? "SELF-TEST: PASS — agreement math verified on hand-computed fixtures." : "SELF-TEST: FAIL");
  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) selfTest();
  else {
    const li = args.indexOf("--labels"); const ji = args.indexOf("--judge"); const oi = args.indexOf("--out");
    if (li < 0 || ji < 0) { console.error("usage: node judge-calibration.cjs --labels <labels.md> --judge <judge.json> [--out <report.md>] | --self-test"); process.exit(2); }
    const labels = parseLabels(fs.readFileSync(args[li + 1], "utf8"));
    const judge = JSON.parse(fs.readFileSync(args[ji + 1], "utf8"));
    const out = render(agreement(labels, judge), "# Judge calibration — owner labels vs judge");
    if (oi >= 0) fs.writeFileSync(args[oi + 1], out);
    console.log(out);
  }
}
module.exports = { DIMENSIONS, parseLabels, agreement, render };
