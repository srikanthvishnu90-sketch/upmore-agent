"use strict"; const { H, X, fixtureJson } = require("./w11-lib.cjs");
(async () => { const s = H.session("SC-202", "teaching-demo-prep");
  s.user("Teaching-demo prep for an academic role");
  const fx = fixtureJson("test-research-talk.json");
  const prep = X.teachingDemoPrep({ lesson: fx.lesson });
  s.tool("130.teachingDemoPrep (lesson = TEST fixture)", prep);
  s.agent(`Teaching-demo prep — "${prep.topic}" for ${prep.audience}, ${prep.minutes} minutes.\n\nPLAN (blocks total ${prep.total_block_minutes} min):\n${prep.blocks.map((b) => `• ${b.block} (${b.minutes} min): ${b.do}`).join("\n")}\n\nLIKELY COMMITTEE QUESTIONS:\n${prep.likely_committee_questions.map((q) => `• ${q}`).join("\n")}\n\nMATERIALS: ${prep.materials_checklist.join("; ")}.\n\nHonesty note: ${prep.honesty}`);
  s.verify("block minutes sum to the lesson length (±2); cir_grounded is false — no institution process claimed", { total_block_minutes: prep.total_block_minutes, minutes: prep.minutes, cir_grounded: prep.cir_grounded });
  await s.finish({ status: "COMPLETE", outcome: "Teaching-demo prep delivered: timed 5-block demo plan, 4 committee questions, materials checklist — with the no-CIR honesty stated, no institution process invented" }); })();
