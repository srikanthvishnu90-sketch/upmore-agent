"use strict"; const { H, P, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-176", "night-before-stripe-brief");
  await s.user("Night-before brief for my Stripe interview: company, role, team signals, bar");
  const brief = P.composeBrief({ company: "Stripe", cir: cirForPrep("stripe"), role: "Software Engineering Intern", round: "onsite" });
  await s.tool("127-career-prep.composeBrief(Stripe, CIR via 135 adapter BUG-123)", brief);
  await s.agent(`Your night-before Stripe brief — grounded in Stripe's merged CIR (as of ${brief.sources[0].as_of}), not vibes:\n\nTHE BAR: ${brief.bar}\n\nPROCESS STAGES:\n${brief.stages.map((x, i) => `${i + 1}. ${x.name}`).join("\n")}\n\nTEAM SIGNALS TO EMPHASIZE:\n${brief.emphasis.map((e) => `- ${e.point}`).join("\n")}\n\nNote for the record: this exact brief was a LEARN in the earlier F09 run because no Stripe CIR existed then. The CIR has since been authored and merged on pivot/career, and tonight the brief grounds end-to-end (the vendored 127 needed the 135 schema adapter, BUG-123, to read the normalized CIR). Sleep; the reps are done.`);
  s.verify("brief state", { status: brief.status, has_bar: !!brief.bar, stages: brief.stages.length, emphasis: brief.emphasis.length });
  await s.finish({ status: "COMPLETE", outcome: "Night-before Stripe brief delivered from the now-merged Stripe CIR: bar, stages, and emphasis/team signals all CIR-grounded (F09's SC-161 LEARN unblocked)." });
})();
