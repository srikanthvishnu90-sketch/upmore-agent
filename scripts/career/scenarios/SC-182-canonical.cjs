"use strict"; const { H, P, profile, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-182", "canonical-coffee-chat-prep-brief");
  await s.user("Coffee-chat prep brief: who, their path, 3 talking points, 5 sharp questions, what not to ask. (The contact is a labeled TEST fixture.)");
  const brief = P.coffeeChatPrep({ cir: cirForPrep("datadog"), profile, contact: { name: "Priya Nair (TEST)", role: "Software Engineer", company: "Datadog", path: ["B.S. CS, TEST University", "SWE intern (TEST)", "Software Engineer, Datadog backend"], publicFacts: [{ text: "Priya Nair is a TEST University alum on Datadog's backend team.", source: "TEST fixture" }] } });
  await s.tool("127-career-prep.coffeeChatPrep(Datadog CIR, TEST contact)", brief);
  await s.agent(`Your coffee-chat brief — Priya Nair (TEST fixture), Datadog backend:\n\nWHO / PATH: ${brief.path.join(" -> ")}\n\n3 TALKING POINTS:\n${brief.talking_points.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\n5 SHARP QUESTIONS:\n${brief.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nWHAT NOT TO ASK:\n${brief.do_not_ask.map((d) => `- ${d}`).join("\n")}\n\nDatadog context is grounded in its CIR (cir_grounded: ${brief.cir_grounded}); Priya's facts are the labeled TEST fixture, not a real bio.`);
  s.verify("coffee prep state", { talking_points: brief.talking_points.length, questions: brief.questions.length, do_not_ask: brief.do_not_ask.length, path: brief.path.length, cir_grounded: brief.cir_grounded });
  await s.finish({ status: "COMPLETE", outcome: "Full coffee-chat prep brief delivered: who + path, exactly 3 talking points, exactly 5 sharp questions, and a 4-item what-not-to-ask list, CIR-grounded with the contact labeled TEST." });
})();
