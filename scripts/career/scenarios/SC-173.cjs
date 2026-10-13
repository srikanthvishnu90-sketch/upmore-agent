"use strict"; const { H, P, cirById } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-173", "coffee-chat-prep-duolingo");
  await s.user("I booked a coffee chat with a Duolingo engineer through outreach — how do I prep?");
  const cc = P.coffeeChatBrief({ contact: { name: "Jamie Lee (TEST)", role: "Software Engineer", company: "Duolingo" }, cir: cirById("duolingo") });
  await s.tool("127-career-prep.coffeeChatBrief (OUTE-012 seam)", cc);
  await s.agent(`Coffee-chat prep is lighter than interview prep — the goal is a good conversation and what you learn, not performing. Brief for ${cc.contact.name}, ${cc.contact.role} at Duolingo:\n\nCompany context (from the Duolingo CIR): ${cc.company_context.bar}\n\nQuestions that work:\n${cc.good_questions.map((q) => `- ${q}`).join("\n")}\n\nDon't:\n${cc.do_not.map((q) => `- ${q}`).join("\n")}\n\nAfter the chat, tell me how it went and I'll capture it as a debrief and queue any follow-up.`, { card: { title: "Coffee chat brief — Duolingo", ...cc } });
  s.verify("chat brief state", { kind: cc.kind, lighter: cc.lighter_than_interview_prep, cir_grounded: cc.cir_grounded, questions: cc.good_questions.length });
  await s.finish({ status: "COMPLETE", outcome: "Coffee-chat brief generated from the contact + Duolingo CIR via the OUTE-012 seam: lighter than interview prep, with company context, four grounded questions and explicit do-nots.", reason: null, unblock: null });
})();
