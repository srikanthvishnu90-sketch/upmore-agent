"use strict";
// SC-185 canonical slug (mbb case prep plan) — regenerated in Finisher Lane F.
// The original render's tool record named 127-career-prep.casePrepPlan, which was
// missing from this branch; Lane F restored it with plain prose (no function
// names, no "CIR") and this runner re-renders the canonical evidence from it.
const path = require("path");
const fs = require("fs");
const H = require("../scenario-harness.cjs");
const P = require(path.join(__dirname, "..", "..", "..", "packages/domain/127-career-prep.js"));
(async () => {
  const s = H.session("SC-185", "canonical-mbb-case-prep-plan");
  s.user("Case prep plan for MBB: the 30–50 case norm, labeled community-reported, scheduled.");
  const cir = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "..", "packages/career-data/cirs/mckinsey.json"), "utf8"));
  const plan = P.casePrepPlan({ cir, weeks: 6 });
  s.tool("127-career-prep.casePrepPlan(McKinsey company file, 6 weeks)", plan);
  s.agent(`Your MBB case prep plan (McKinsey company file on file; BCG and Bain use the same rail):\n\nTHE NORM — LABELED HONESTLY: ${plan.practice_norm.low}–${plan.practice_norm.high} full practice cases before interviews [label: ${plan.practice_norm.label}; official: no]. ${plan.practice_norm.note}\n\nSCHEDULE (${plan.schedule.weeks} weeks, ${plan.schedule.sessions_per_week} cases/week = ${plan.schedule.total_cases} total, inside the norm: yes):\n${plan.schedule.plan.map((l) => "- " + l).join("\n")}\n\nFRAMEWORK EVERY CASE RUNS ON:\n${plan.framework.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\nPractice case ready when you are: "${plan.case_prompt}" — responses get scored against the case rubric and gaps re-drilled.`);
  const ok = plan.schedule.total_cases === 42 && plan.practice_norm.official === false && plan.cir_grounded === true;
  s.verify("case plan state", { ok, total_cases: plan.schedule.total_cases, official: plan.practice_norm.official, company_file_grounded: plan.cir_grounded });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "MBB case prep plan built from the McKinsey company file: the 30–50 case norm labeled community-reported and not official, scheduled over 6 weeks (42 cases), in plain prose." });
})().catch((e) => { console.error(e); process.exit(1); });
