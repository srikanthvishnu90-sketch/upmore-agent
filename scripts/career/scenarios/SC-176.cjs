<<<<<<< HEAD
"use strict"; const { H, P, cirById, briefText } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-176", "two-interviews-one-day-no-cirs");
  await s.user("I have Datadog at 10 and Ramp at 2");
  const items = [{ time: "10:00", company: "Datadog", brief: P.composeBrief({ company: "Datadog", cir: cirById("datadog") }) }, { time: "14:00", company: "Ramp", brief: P.composeBrief({ company: "Ramp", cir: cirById("ramp") }) }];
  const plan = P.twoInterviewPlan(items);
  await s.tool("127-career-prep.twoInterviewPlan + calendar order", plan);
  await s.agent(`Order locked: Datadog 10:00 first, Ramp 14:00 second, and here's the honest state of both briefs:\n\n${items.map((x) => `${x.time} — ${x.company}: ${x.brief.status === "NO_CIR" ? "NO grounded brief available — no merged CIR on file for this company on this branch, so I won't invent its stages or bar." : "brief ready"}`).join("\n")}\n\nGap plan (calendar-aware, works regardless): ${plan.gap_plan}\n\nWhat I CAN prep today for both: your story bank, a scored behavioral mock, and JD-grounded emphasis if you paste the two JDs. The company-specific briefs unblock when the Datadog and Ramp CIRs (already authored in the cir-b1 batch) are merged.`);
  s.verify("plan state", { ordered: plan.ordered, brief_statuses: items.map((x) => x.brief.status) });
  await s.finish({ status: "LEARN", outcome: "Both interviews ordered with a gap plan, but neither company brief could be grounded: Datadog and Ramp CIRs are not merged on this branch, and the agent said so for both instead of inventing briefs.", reason: "datadog.json and ramp.json exist only on origin/career/cir-b1; pivot/career carries neither.", unblock: "Merge origin/career/cir-b1's datadog.json + ramp.json into pivot/career; twoInterviewPlan + composeBrief then deliver both grounded briefs in order." });
=======
"use strict"; const { H, P, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-176", "night-before-stripe-brief");
  await s.user("Night-before brief for my Stripe interview: company, role, team signals, bar");
  const brief = P.composeBrief({ company: "Stripe", cir: cirForPrep("stripe"), role: "Software Engineering Intern", round: "onsite" });
  await s.tool("127-career-prep.composeBrief(Stripe, CIR via 135 adapter BUG-123)", brief);
  await s.agent(`Your night-before Stripe brief — grounded in Stripe's merged CIR (as of ${brief.sources[0].as_of}), not vibes:\n\nTHE BAR: ${brief.bar}\n\nPROCESS STAGES:\n${brief.stages.map((x, i) => `${i + 1}. ${x.name}`).join("\n")}\n\nTEAM SIGNALS TO EMPHASIZE:\n${brief.emphasis.map((e) => `- ${e.point}`).join("\n")}\n\nNote for the record: this exact brief was a LEARN in the earlier F09 run because no Stripe CIR existed then. The CIR has since been authored and merged on pivot/career, and tonight the brief grounds end-to-end (the vendored 127 needed the 135 schema adapter, BUG-123, to read the normalized CIR). Sleep; the reps are done.`);
  s.verify("brief state", { status: brief.status, has_bar: !!brief.bar, stages: brief.stages.length, emphasis: brief.emphasis.length });
  await s.finish({ status: "COMPLETE", outcome: "Night-before Stripe brief delivered from the now-merged Stripe CIR: bar, stages, and emphasis/team signals all CIR-grounded (F09's SC-161 LEARN unblocked)." });
>>>>>>> origin/career/sc-w09
})();
