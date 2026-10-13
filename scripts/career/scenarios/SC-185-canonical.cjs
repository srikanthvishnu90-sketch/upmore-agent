"use strict"; const { H, P, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-185", "canonical-mbb-case-prep-plan");
  await s.user("Case prep plan for MBB: the 30–50 case norm, labeled community-reported, scheduled.");
  const plan = P.casePrepPlan({ cir: cirForPrep("mckinsey"), weeks: 6 }); const sess = P.caseSession({ cir: cirForPrep("mckinsey") });
  await s.tool("127-career-prep.casePrepPlan(McKinsey CIR, 6 weeks)", plan);
  await s.agent(`Your MBB case prep plan (McKinsey CIR on file; BCG/Bain CIRs use the same rail):\n\nTHE NORM — LABELED HONESTLY: ${plan.practice_norm.low}–${plan.practice_norm.high} ${plan.practice_norm.unit} [label: ${plan.practice_norm.label}; official: ${plan.practice_norm.official}]. ${plan.practice_norm.note}\n\nSCHEDULE (${plan.schedule.weeks} weeks, ${plan.schedule.sessions_per_week} cases/week = ${plan.schedule.total_cases} total, inside the norm: ${plan.schedule.inside_norm}):\n${plan.schedule.plan.map((w) => `- ${w}`).join("\n")}\n\nFRAMEWORK EVERY CASE RUNS ON:\n${plan.framework.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\nPractice case ready when you are: \"${sess.case_prompt}\" — responses get scored with scoreCaseResponse and gaps re-drilled.`);
  s.verify("case plan state", { norm_label: plan.practice_norm.label, official: plan.practice_norm.official, total_cases: plan.schedule.total_cases, inside_norm: plan.schedule.inside_norm, cir_grounded: plan.cir_grounded });
  await s.finish({ status: "COMPLETE", outcome: "MBB case prep plan delivered: the 30–50 practice-case norm carried explicitly as community-reported (official:false, firms do not publish it) and a 6-week schedule totaling inside that norm, on McKinsey's CIR framework." });
})();
