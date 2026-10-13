"use strict"; const { H, P, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-184", "canonical-system-design-experienced-hire");
  await s.user("System-design prep for an experienced-hire round — Snowflake.");
  const prep = P.systemDesignPrep({ cir: cirForPrep("snowflake"), level: "experienced-hire" });
  await s.tool("127-career-prep.systemDesignPrep(Snowflake company file, experienced-hire)", prep);
  await s.agent(`Snowflake system-design prep for an experienced-hire round (grounded in the company file: ${prep.cir_grounded}; prompts drawn from the company file record):\n\nPROMPTS TO REHEARSE:\n${prep.prompts.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nFRAMEWORK:\n${prep.framework.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\nEXPERIENCED-HIRE BAR:\n${prep.level_notes.map((n) => `- ${n}`).join("\n")}\n\nSnowflake's company file stages say design appears for experienced levels with a 3–5 person panel reported — so rehearse out loud, driving the design yourself, not waiting to be led.`);
  s.verify("system design prep state", { prompts: prep.prompts.length, framework: prep.framework.length, level: prep.level, cir_grounded: prep.cir_grounded });
  await s.finish({ status: "COMPLETE", outcome: "Experienced-hire system-design prep delivered for Snowflake: company file-sourced design prompts, a 5-step framework, and explicit experienced-hire level notes, verified from rail output." });
})();
