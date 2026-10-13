"use strict"; const { H, P, persona, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-191", "video-interview-practice-canonical");
  await s.user("Video-interview practice: record answers, feedback on content (never submitted for me) — this is for the Goldman Sachs HireVue stage on my record");
  const store = P.makePrepStore();
  const questions = ["Why investment banking, and why Goldman Sachs?", "Tell me about a time you built a financial model and defended your conclusions."];
  const answers = [
    "First, the situation: at Example Capital I built a three-statement model in Excel for a fictional retailer. My task was the model plus 10 pages of investment committee materials. So I modelled the statements specifically in Excel and presented the conclusions. In the end the result was materials the team used in the mock IC over that summer.",
    "I did various things with models and stuff and presented to people and it was fine."];
  for (const a of answers) await s.user("[TEST recorded-answer transcript] " + a);
  const r = P.videoInterviewPractice(store, { company: "Goldman Sachs", questions, answers });
  await s.tool("127-career-prep.videoInterviewPractice(Goldman, TEST transcripts)", r);
  await s.agent(`Video-interview practice done — labeled TEST: these are transcript answers supplied here, scored on CONTENT only, and explicitly NOT submitted anywhere (submitted: ${r.submitted}; no employer portal was touched).\n\n${r.feedback.map((f,i)=>`Q${i+1}. ${f.q}\nScores: structure ${f.scores.structure}/5, evidence ${f.scores.evidence}/5, specificity ${f.scores.specificity}/5 (total ${f.scores.total}/15). ${f.feedback.join(" ")}`).join("\n\n")}\n\nAverage total ${r.average_total}/15. Q1 lands on your real Example Capital fact; Q2 is the fix-first — no structure, no numbers. Re-record Q2 only, still practice-only, whenever you're ready. If you later do the real HireVue, you record and submit it yourself in Goldman's portal — I never submit for you.`);
  s.verify("practice stored as drill; no submission", { submitted: r.submitted, submission_attempted: r.submission_attempted, feedback: r.feedback.length, drills: store.drills.filter((d)=>d.kind==="video_practice").length });
  await s.finish({ status: "COMPLETE", outcome: "Video-interview practice for Goldman's HireVue stage ran on labeled TEST transcripts: both answers scored on content with fixes, stored as a practice drill, and explicitly never submitted." });
})();
