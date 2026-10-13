"use strict"; const {H,OS,cir}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-277","return-offer-playbook");
  s.user("Return-offer playbook for my internship summer");
  const pb=OS.returnOfferPlaybook({cir:cir("microsoft"),offer:{company:"Microsoft"}}); s.tool("129.returnOfferPlaybook (Microsoft CIR)",pb);
  const tl=OS.internTimeline({endDate:"2027-08-15"}); s.tool("129.internTimeline",tl);
  s.agent(`Your return-offer playbook for ${pb.company}:\n${pb.steps.map(x=>`\u2022 ${x}`).join("\n")}\nDated milestones (internship ends ${tl.internship_end}):\n${tl.milestones.map(m=>`\u2022 ${m.date} \u2014 ${m.action}`).join("\n")}\n${pb.disclaimer}`);
  s.verify("playbook grounded in the Microsoft CIR in rail state; 6 dated milestones",{company:pb.company,milestones:tl.milestones.length});
  await s.finish({status:"COMPLETE",outcome:"Return-offer playbook + dated intern timeline delivered, grounded in the new Microsoft CIR"}); })();
