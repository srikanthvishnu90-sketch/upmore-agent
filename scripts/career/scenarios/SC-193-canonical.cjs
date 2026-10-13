"use strict"; const { H, P, persona, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-193", "final-round-prep-canonical");
  await s.user("Final-round prep: what actually changes versus earlier rounds here? I'm heading to the Goldman Sachs final round");
  const d = P.finalRoundDelta({ cir: cirForPrep("goldman-sachs-ibd") });
  await s.tool("127-career-prep.finalRoundDelta(Goldman CIR)", d);
  await s.agent(`What actually changes in Goldman's final round — grounded in the Goldman CIR's own process stages (as of ${d.sources[0].as_of}), not generic advice:\n\nEarlier stages on record: ${d.earlier_stages.map((x)=>x.name).join(" -> ")}\nFinal stage on record: ${d.final_stage.name}${d.final_stage.detail ? " — " + d.final_stage.detail : ""}\n\n${d.changes.map((c)=>`- ${c}`).join("\n")}\n\nThe Summer Analyst internship stage after it is the job itself, not an interview round — the superday is the last screen. Prep shift: stop broadening, go deep on your own resume and the accounting/valuation core.`);
  s.verify("delta grounded in CIR stages", { status: d.status, final_stage: d.final_stage.name, earlier: d.earlier_stages.length, changes: d.changes.length });
  await s.finish({ status: "COMPLETE", outcome: "Final-round delta for Goldman delivered from its CIR: superday identified as the decision round vs the application/HireVue screens, with CIR style signals and the concrete prep shift." });
})();
