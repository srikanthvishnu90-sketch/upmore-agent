"use strict"; const { H, P, cirById, briefText } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-172", "ramp-final-round-no-cir");
  await s.user("I have a final round at Ramp — what decides it?");
  const cir = cirById("ramp"); await s.tool("127-career-prep.findCir", { company: "Ramp", cir_found_on_this_branch: !!cir, note: "ramp.json exists on origin/career/cir-b1, not merged into pivot/career" });
  const brief = P.composeBrief({ company: "Ramp", cir, round: "final round" });
  await s.agent(`${briefText(brief)}\n\nSo I can't honestly weight Ramp's final-round signals — that is exactly what their CIR would carry (final-round stages + screening signals). What I can do today: run a final-round-style mock from the generic bank and your story bank, and drill the JD if you paste it. But "what decides it at Ramp" needs the Ramp record, and I won't dress up guesses as their signals.`);
  s.verify("brief state", { status: brief.status, stages: brief.stages.length });
  await s.finish({ status: "LEARN", outcome: "Agent declined to fabricate Ramp final-round signals: no Ramp CIR is merged on this branch, so the weighted final-round brief + targeted mock could not be grounded.", reason: "ramp.json exists only on origin/career/cir-b1; pivot/career carries 15 CIRs without Ramp.", unblock: "Merge origin/career/cir-b1's packages/career-data/cirs/ramp.json into pivot/career; composeBrief + questionBank then weight the final round from its CIR automatically." });
})();
