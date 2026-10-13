"use strict"; const { H, P, persona, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-178", "full-text-mock-scored");
  await s.user("Full text mock: behavioral round, scored feedback at the end");
  const store = P.makePrepStore();
  const bank = P.questionBank({ company: "Stripe", cir: cirForPrep("stripe"), stories: P.mineStories(persona.facts) });
  const mock = P.startMock(store, { bank, count: 4 });
  const answers = [
    "First, the situation: at TEST Systems I owned a manual spreadsheet report. My task was to automate it. So I built a React and Python dashboard pulling from PostgreSQL, specifically for 200 internal users. In the end the result was a 40% cut in weekly reporting time, measured against the old workflow over a month.",
    "First, the context: I led the TEST University Investing Club of 45 members. Then I organised a stock-pitch competition with 20 participants, because members wanted real reps. The result: 20 participants pitched and 45 members got a repeatable format we still use each semester.",
    "The situation was DeployBoard, my Go and Kubernetes project. I built it so 12 student teams could deploy containerised apps on AWS EKS. Then I wrote the onboarding docs myself. The outcome: 12 teams deployed without my help by the end of the semester.",
    "First, at Example Capital I built a three-statement model in Excel for a fictional retailer. My task included 10 pages of investment committee materials. I modelled the statements and presented the conclusions. The result was materials the team used in the mock IC that summer."];
  let last = null;
  for (const a of answers) { await s.user(a); last = P.answerMock(store, mock.mock_id, a); await s.tool("127-career-prep.answerMock", { scores: last.graded.scores, done: last.done }); }
  const sum = P.mockSummary(store, mock.mock_id);
  await s.tool("127-career-prep.mockSummary", sum);
  await s.agent(`Mock complete — scored feedback, stored in your prep record:\n\nAverage scores (0–5 each): structure ${sum.average_scores.structure}, evidence ${sum.average_scores.evidence}, specificity ${sum.average_scores.specificity} (total ${sum.average_scores.total}/15).\nLanded: ${sum.what_landed.length} answer(s) at 12+. Didn't land: ${sum.what_didnt.length}. Fix first: ${sum.fix_first}.\n\n${sum.what_didnt.map((w) => `• ${w.q} — ${w.fix.join(" ")}`).join("\n") || "Nothing below the bar — keep these stories as primaries."}`);
  s.verify("mock state in prep store", { mocks: store.mocks.length, status: store.mocks[0].status, answered: sum.answered, average_total: sum.average_scores.total });
  await s.finish({ status: "COMPLETE", outcome: "Full 4-question text behavioral mock run in chat; every answer scored on structure/evidence/specificity; summary (landed / didn't / fix-first) stored in the prep store." });
})();
