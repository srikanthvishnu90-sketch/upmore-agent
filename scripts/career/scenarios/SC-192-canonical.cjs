"use strict"; const { H, P, persona, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-192", "take-home-plan-canonical");
  await s.user("Take-home plan: scope and schedule it for me — the work stays mine");
  const p = P.takeHomePlan({ title: "TEST take-home: build a small valuation write-up (TEST assignment)", deliverables: [{ name: "Read the brief + list assumptions", est_min: 20 }, { name: "Build the model skeleton", est_min: 60 }, { name: "Run sensitivities", est_min: 40 }, { name: "Write up conclusions", est_min: 40 }, { name: "Self-check + format for submission", est_min: 20 }], available: [{ label: "Tue 18:00-19:30 (TEST)", minutes: 90 }, { label: "Wed 07:00-08:30 (TEST)", minutes: 90 }] });
  await s.tool("127-career-prep.takeHomePlan(TEST assignment, TEST calendar blocks)", p);
  await s.agent(`Your take-home plan — plan only; I scope and schedule, I do not do, draft or submit any of it. The work stays yours (agent_does_work: ${p.agent_does_work}).\n\nScope: ${p.total_est_min} min estimated against ${p.total_available_min} min you said you have — fits: ${p.fits}.\n\n${p.schedule.map((x)=>`- ${x.deliverable} (${x.est_min} min): ${x.blocks.join("; ")}`).join("\n")}\n\nCheckpoints:\n${p.checkpoints.map((c)=>`- ${c}`).join("\n")}`);
  s.verify("plan state", { fits: p.fits, total_est_min: p.total_est_min, scheduled: p.schedule.length, agent_does_work: p.agent_does_work, work_stays_mine: p.work_stays_mine });
  await s.finish({ status: "COMPLETE", outcome: "Take-home scoped (5 deliverables, 180 min) and scheduled across the two supplied TEST blocks with checkpoints; plan only — no take-home work done or submitted by the agent." });
})();
