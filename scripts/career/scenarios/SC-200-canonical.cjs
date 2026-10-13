"use strict"; const { H, P, persona, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-200", "superday-survival-plan-canonical");
  await s.user("Superday survival plan for a banking final round — Goldman Sachs, Friday (TEST date)");
  const p = P.superdayPlan({ cir: cirForPrep("goldman-sachs-ibd"), when: "Friday 09:00 CT (TEST)" });
  await s.tool("127-career-prep.superdayPlan(Goldman CIR)", p);
  await s.agent(`Goldman superday survival plan for Friday 09:00 CT (TEST) — grounded in Goldman's CIR: the final stage on record is "${p.final_stage.name}"${p.final_stage.detail ? " (" + p.final_stage.detail + ")" : ""}, after ${p.earlier_stages.map((x)=>x.name).join(" -> ")}.\n\nTIMELINE:\n${p.schedule.map((x)=>`- ${x.at}: ${x.block}`).join("\n")}\n\nTECHNICAL CORE TO KEEP WARM (the finance drill topics on file):\n${p.drill_topics.map((x)=>`- ${x}`).join("\n")}\n\nSURVIVAL RULES:\n${p.survival_rules.map((x)=>`- ${x}`).join("\n")}`);
  s.verify("superday plan grounded in CIR", { status: p.status, final_stage: p.final_stage.name, schedule: p.schedule.length, drill_topics: p.drill_topics.length, sources: p.sources });
  await s.finish({ status: "COMPLETE", outcome: "Goldman superday survival plan delivered: CIR-grounded final stage, timed day schedule, the 5 finance-drill topics as the technical core, and between-interview/debrief survival rules." });
})();
