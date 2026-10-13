"use strict"; const { H, OS, N, cir, fixture, NOW } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-193", "return-offer-playbook");
  s.user("I got the return offer — now what?");
  const store = N.createStore(); const o = N.storeOffer(store, N.parseOffer(fixture("test-offer-a.txt"), { now: NOW }));
  const pb = OS.returnOfferPlaybook({ offer: o, cir: cir("airbnb") }); s.tool("129.returnOfferPlaybook", pb);
  s.agent(`Here's your playbook (grounded in the ${o.company} return offer now in your log):\n${pb.steps.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nFirst 90 days after you start:\n${pb.first_90_days.map((x) => `• ${x}`).join("\n")}\n\n${pb.disclaimer}`);
  s.verify("playbook generated from the stored offer + Airbnb CIR; first-90 has 3 phases", { company: pb.company, steps: pb.steps.length });
  await s.finish({ status: "COMPLETE", outcome: "Return-offer playbook + first-90-days plan generated in chat from the stored role + company CIR" }); })();
