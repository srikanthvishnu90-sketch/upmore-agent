"use strict"; const { H, P, persona, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-188", "canonical-pm-prep-shipped-thing");
  await s.user("PM prep: product sense through my shipped thing, metrics ready. Figma PM track.");
  const stories = P.mineStories(persona.facts); const pm = P.pmPrep({ cir: cirForPrep("figma"), stories });
  await s.tool("127-career-prep.pmPrep(Figma CIR, mined stories)", pm);
  await s.agent(`Your Figma PM prep — product sense anchored to what you actually shipped, not a hypothetical:\n\nYOUR SHIPPED THING: ${pm.shipped_thing.title} — ${pm.shipped_thing.action}; result: ${pm.shipped_thing.result}.\n\nWALK IT AS A PRODUCT:\n${pm.product_sense_walkthrough.map((w, i) => `${i + 1}. ${w}`).join("\n")}\n\nMETRICS READY (copied from your own profile facts — say them exactly):\n${pm.metrics_ready.map((m) => `- ${m}`).join("\n")}\n\nPRODUCT-SENSE QUESTIONS TO REHEARSE:\n${pm.product_sense_questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`);
  s.verify("pm prep state", { shipped: pm.shipped_thing.title, metrics_ready: pm.metrics_ready, questions: pm.product_sense_questions.length, cir_grounded: pm.cir_grounded });
  await s.finish({ status: "COMPLETE", outcome: "PM prep delivered for the Figma track: product-sense walkthrough anchored to the user's shipped dashboard story, its real profile-fact metrics listed ready-to-say, and 4 product-sense rehearsal questions." });
})();
