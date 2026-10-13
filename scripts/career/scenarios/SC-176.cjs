"use strict"; const { H, P, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-176", "night-before-stripe-brief");
  await s.user("Night-before brief for my Stripe interview: company, role, team signals, bar");
  const brief = P.composeBrief({ company: "Stripe", cir: cirForPrep("stripe"), role: "Software Engineering Intern", round: "onsite" });
  await s.tool("127-career-prep.composeBrief(Stripe company file)", brief);
  await s.agent(`Your night-before Stripe brief — grounded in Stripe's company file (as of ${brief.sources[0].as_of}), not vibes:\n\nTHE BAR: ${brief.bar}\n\nPROCESS STAGES:\n${brief.stages.map((x, i) => `${i + 1}. ${x.name}`).join("\n")}\n\nTEAM SIGNALS TO EMPHASIZE:\n${brief.emphasis.map((e) => `- ${e.point}`).join("\n")}\n\nNote for the record: this exact brief was a LEARN in the earlier F09 run because no Stripe company file existed then. The company file has since been authored and merged, and tonight the brief grounds end-to-end. Sleep; the reps are done.`);
  s.verify("brief state", { status: brief.status, has_bar: !!brief.bar, stages: brief.stages.length, emphasis: brief.emphasis.length });
  await s.finish({ status: "COMPLETE", outcome: "Night-before Stripe brief delivered from the now-merged Stripe company file: bar, stages, and emphasis/team signals all grounded in it." });
})();
