"use strict"; const { H, P, cirById } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-165", "technical-prep-swe-snowflake");
  await s.user("help me prep the technical round (SWE)");
  const drills = P.technicalDrills({ cir: cirById("snowflake"), roleFamily: "SWE" });
  await s.tool("127-career-prep.technicalDrills", drills);
  await s.agent(`Using Snowflake as the grounded example (its CIR is on file): its loop is recruiter/HM screen → technical interviews (coding; design for experienced levels) → panel. Your practice sets are matched to those round types, each tagged to the CIR stage that produced it:\n\n${drills.sets.map((x) => `▸ ${x.type.toUpperCase()} [source: ${x.source.type}]\n${x.prompts.map((p) => `  - ${p}`).join("\n")}`).join("\n")}\n\nSnowflake's bar per the CIR: follow-ups push past a first working solution toward performance/trade-off discussion, and database reasoning shows up even in generalist loops — so every coding rep above ends with a 'now scale it / now make it faster' follow-up. Want me to run the coding set as a timed drill?`);
  s.verify("drill sets generated from CIR stage names", { cir_grounded: drills.cir_grounded, set_types: drills.sets.map((x) => x.type) });
  await s.finish({ status: "COMPLETE", outcome: "SWE technical prep delivered: coding + system-design practice sets matched to the Snowflake CIR's actual round types, with the CIR bar (follow-ups past first solution, DB reasoning) built into the reps.", reason: null, unblock: null });
})();
