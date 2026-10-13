"use strict"; const {H,OS,cir}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-278","first-90-days-plan");
  s.user("First-90-days plan at the new job");
  const pb=OS.returnOfferPlaybook({cir:cir("amazon"),offer:{company:"Amazon"}}); s.tool("129.returnOfferPlaybook.first_90_days (Amazon CIR)",pb);
  s.agent(`Your first ninety days at ${pb.company}:\n${pb.first_90_days.map(x=>`\u2022 ${x}`).join("\n")}\nEach phase ends in the wins log, so by day ninety your promotion-evidence file already exists.`);
  s.verify("90-day plan is the rail's first_90_days output (30/60/90 phases), company from the Amazon CIR",{company:pb.company,phases:pb.first_90_days});
  await s.finish({status:"COMPLETE",outcome:"First-90-days plan (30/60/90) delivered for the new job, grounded in the new Amazon CIR"}); })();
