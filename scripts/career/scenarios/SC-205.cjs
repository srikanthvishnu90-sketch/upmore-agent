"use strict"; const { H, P, X, persona } = require("./w11-lib.cjs");
(async () => { const s = H.session("SC-205", "bar-raiser-panel-prep");
  s.user("Panel with a bar-raiser-style interviewer: prep for the hardest questioner");
  const store = P.makePrepStore(); P.mineStories(persona().facts).forEach((x) => P.captureStory(store, x));
  const prep = X.barRaiserPrep({ stories: store.stories });
  s.tool("130.barRaiserPrep (story bank mined from TEST persona facts)", prep);
  const bank = P.questionBank({}); // no CIR — generic bank only, honestly
  const m = P.startMock(store, { bank, count: 2 });
  let r; for (let i = 0; i < 2; i++) r = P.answerMock(store, m.mock_id, "First the situation was a manual spreadsheet process used by 200 internal users. Then I built a dashboard in React and Python, specifically automating PostgreSQL pulls. The result was weekly reporting time cut by 40% over the summer, measured because we tracked it weekly.");
  const sum = P.mockSummary(store, m.mock_id);
  s.tool("127 mock under panel conditions (scored)", { summary: sum, done: r.done });
  s.agent(`Bar-raiser panel prep.\n\nFIRST, THE HONEST GROUNDING: ${prep.cir_note}\n\nTHE HARDEST QUESTIONS (rehearse the follow-up layer for each):\n${prep.hardest_questions.map((q) => `• ${q}`).join("\n")}\n\nRULES FOR THIS PANEL:\n${prep.rules.map((q) => `• ${q}`).join("\n")}\n\nMOCK PLAN: ${prep.mock_plan}\nWarm-up mock just run on your story bank (${prep.stories_supplied} stories mined from your profile): ${sum.answered} answers scored, average total ${sum.average_scores.total}/15, weakest dimension: ${sum.fix_first} — drill that first.`);
  s.verify("cir_grounded false and stated to the user; mock completed and scored from the stored store", { cir_grounded: prep.cir_grounded, stories: prep.stories_supplied, mock_status: sum.status, answered: sum.answered });
  await s.finish({ status: "COMPLETE", outcome: "Bar-raiser panel prep delivered without inventing a company record: hardest-question set with follow-up rules, story bank mined from the user's real profile facts, and a scored warm-up mock naming the weakest dimension" }); })();
