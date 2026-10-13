"use strict"; const { H, P, cirById, persona } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-163", "text-mock-scored-snowflake");
  await s.user("run a mock interview with me");
  const store = P.makePrepStore(); P.mineStories(persona.facts).forEach((x) => P.captureStory(store, x));
  const bank = P.questionBank({ cir: cirById("snowflake"), stories: store.stories });
  const m = P.startMock(store, { bank, count: 4 });
  await s.agent(`Text mock, Snowflake-style loop (questions grounded in the Snowflake CIR). I'll ask one at a time and score each answer on structure, evidence and specificity. Scores are stored.\n\nQuestion 1: ${m.questions[0].q}`);
  const answers = [
    "The situation was my internship at TEST Systems Inc: reporting was a manual spreadsheet process. First I built a reporting dashboard in React and Python for 200 internal users, specifically automating the PostgreSQL data pulls. The result was weekly reporting time cut by 40% over the summer because we measured the old process first.",
    "I did some teamwork stuff on a project and it went fine, various things happened.",
    "At the Investing Club I lead 45 members. The task was running a stock-pitch competition. I organised weekly sessions and got 20 participants to present, specifically preparing feedback for each one. The result was the club's biggest competition that year.",
    "Honestly that one went badly. I had a bug in DeployBoard before a demo for 12 student teams. I debugged it the night before with print statements, which was slow, and the demo worked, but I learned to write tests first because the failure cost me a night of sleep that semester."];
  for (let i = 0; i < answers.length; i++) {
    await s.user(answers[i]);
    const r = P.answerMock(store, m.mock_id, answers[i]);
    await s.tool("127-career-prep.answerMock", { scores: r.graded.scores, feedback: r.graded.feedback });
    if (!r.done) await s.agent(`Scored: structure ${r.graded.scores.structure}/5, evidence ${r.graded.scores.evidence}/5, specificity ${r.graded.scores.specificity}/5. ${r.graded.feedback[0]}\n\nNext: ${r.next_question}`);
    else { const sum = P.mockSummary(store, m.mock_id);
      await s.agent(`Mock complete. Stored summary:\n\nAverage scores — structure ${sum.average_scores.structure}/5, evidence ${sum.average_scores.evidence}/5, specificity ${sum.average_scores.specificity}/5 (total ${sum.average_scores.total}/15).\nWhat landed: ${sum.what_landed.length} answer(s) at 12+.\nWhat didn't: ${sum.what_didnt.map((w) => `"${w.q.slice(0, 60)}…" (${w.scores.total}/15) — fix: ${w.fix[0]}`).join(" ")}\nFix first: ${sum.fix_first}. The full scored transcript is saved to your prep record.`, { card: { title: "Mock summary — Snowflake", ...sum } }); }
  }
  s.verify("stored mock state", { mocks: store.mocks.length, status: store.mocks[0].status, answers: store.mocks[0].answers.length, summary: P.mockSummary(store, m.mock_id) });
  await s.finish({ status: "COMPLETE", outcome: "Full 4-question text mock ran in chat against the Snowflake CIR bank; every answer scored on structure/evidence/specificity and the summary stored in the prep store.", reason: null, unblock: null });
})();
