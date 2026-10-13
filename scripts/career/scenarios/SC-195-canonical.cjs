"use strict"; const { H, P, persona, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-195", "questions-to-ask-them-canonical");
  await s.user("Questions-to-ask-them, tailored to the interviewer's actual team — my Goldman interviewer is on the Healthcare M&A team (TEST fixture)");
  const r = P.questionsToAsk({ cir: cirForPrep("goldman-sachs-ibd"), interviewer: { name: "Pat Analyst (TEST)", role: "Analyst (TEST)", team: "Healthcare M&A (TEST)", publicFacts: [{ text: "Works on the Healthcare M&A team (TEST fixture).", source: "TEST fixture supplied by user" }] } });
  await s.tool("127-career-prep.questionsToAsk(Goldman CIR + TEST interviewer team)", r);
  await s.agent(`Questions to ask them — tailored first to the interviewer's actual team (Healthcare M&A, per the TEST fixture you supplied; interviewer status: ${r.interviewer_status}), then grounded in Goldman's CIR:\n\n${r.questions.map((q,i)=>`${i+1}. ${q.text}\n   source: ${q.source.type}`).join("\n")}\n\nAsk 1-2 per interviewer, not the whole list — the team question earns its place because it is about THEIR work, not the firm in general.`);
  s.verify("tailored questions state", { questions: r.questions.length, team_unknown: r.team_unknown, first_is_team: /Healthcare M&A/.test(r.questions[0].text), all_sourced: r.questions.every((q)=>q.source) });
  await s.finish({ status: "COMPLETE", outcome: "Questions-to-ask built with the interviewer's actual (TEST-fixture) Healthcare M&A team question first, followed by Goldman CIR stage/values/signals-grounded questions, every one source-tagged." });
})();
