// Wedge paraphrase battery (routing fix, 2026-10-13): every one of the 30
// wedge release-gate scenarios on its canonical ask + the routing grader's
// own 4 deterministic paraphrase classes (short-casual, typo-laden,
// indirect, stressed-text — entities preserved by construction in
// run-routing-grade.paraphrases). Judged with the grader's OWN isCorrect —
// never a private copy. Writes a JSON report; failing turns carry their
// full delivered text so failures can be quoted verbatim.
// Usage: node run-wedge-battery.cjs [--out <path.json>]
"use strict";
const fs = require("fs");
const path = require("path");
const L = require("./pilot-lib.cjs");
const RG = require("./run-routing-grade.cjs");

const WEDGE = ["SC-286", "SC-287", "SC-011", "SC-146", "SC-148", "SC-023",
  "SC-012", "SC-007", "SC-020", "SC-049", "SC-050", "SC-046",
  "SC-025", "SC-040", "SC-041", "SC-042", "SC-043",
  "SC-031", "SC-032", "SC-033", "SC-038", "SC-034",
  "SC-036", "SC-037", "SC-044", "SC-045", "SC-151", "SC-157",
  "SC-035", "SC-300"];

function main() {
  const args = process.argv.slice(2);
  const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const expectations = JSON.parse(fs.readFileSync(RG.EXPECTATIONS_PATH, "utf8"));
  const byId = new Map(expectations.entries.map((e) => [e.id, e]));
  const profile = L.gauntletProfile("p1-early-career-swe");
  const rows = [];
  let canonOk = 0, paraOk = 0, paraTotal = 0;
  for (const id of WEDGE) {
    const exp = byId.get(id);
    const run = (slug, text) => {
      const s = L.H.session(id, slug);
      const r = L.chatTurn(s, text, { profile });
      const delivered = (r.delivered || []).join("\n");
      return { r, delivered, correct: RG.isCorrect(exp, r, delivered), tool: RG.observedTool(r) };
    };
    const canon = run("battery-canonical", exp.ask);
    if (canon.correct) canonOk++;
    rows.push({ id, kind: "canonical", ask: exp.ask, correct: canon.correct, tool: canon.tool, delivered: canon.delivered });
    for (const p of RG.paraphrases(id, exp.ask)) {
      const got = run(`battery-${p.cls}`, p.text);
      paraTotal++;
      if (got.correct) paraOk++;
      rows.push({ id, kind: p.cls, ask: p.text, correct: got.correct, tool: got.tool, delivered: got.delivered });
    }
  }
  const failures = rows.filter((r) => !r.correct);
  const report = {
    generated_at: new Date().toISOString(),
    wedge_total: WEDGE.length,
    canonical: { correct: canonOk, total: WEDGE.length, pct: Math.round((canonOk / WEDGE.length) * 1000) / 10 },
    paraphrase: { correct: paraOk, total: paraTotal, pct: Math.round((paraOk / paraTotal) * 1000) / 10 },
    failures,
    rows,
  };
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ canonical: report.canonical, paraphrase: report.paraphrase, failure_count: failures.length, failures: failures.map((f) => ({ id: f.id, kind: f.kind, tool: f.tool })) }, null, 2));
}
if (require.main === module) main();
module.exports = { WEDGE };
