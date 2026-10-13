<<<<<<< HEAD
"use strict"; const { H, P, cirById } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-173", "coffee-chat-prep-duolingo");
  await s.user("I booked a coffee chat with a Duolingo engineer through outreach — how do I prep?");
  const cc = P.coffeeChatBrief({ contact: { name: "Jamie Lee (TEST)", role: "Software Engineer", company: "Duolingo" }, cir: cirById("duolingo") });
  await s.tool("127-career-prep.coffeeChatBrief (OUTE-012 seam)", cc);
  await s.agent(`Coffee-chat prep is lighter than interview prep — the goal is a good conversation and what you learn, not performing. Brief for ${cc.contact.name}, ${cc.contact.role} at Duolingo:\n\nCompany context (from the Duolingo CIR): ${cc.company_context.bar}\n\nQuestions that work:\n${cc.good_questions.map((q) => `- ${q}`).join("\n")}\n\nDon't:\n${cc.do_not.map((q) => `- ${q}`).join("\n")}\n\nAfter the chat, tell me how it went and I'll capture it as a debrief and queue any follow-up.`, { card: { title: "Coffee chat brief — Duolingo", ...cc } });
  s.verify("chat brief state", { kind: cc.kind, lighter: cc.lighter_than_interview_prep, cir_grounded: cc.cir_grounded, questions: cc.good_questions.length });
  await s.finish({ status: "COMPLETE", outcome: "Coffee-chat brief generated from the contact + Duolingo CIR via the OUTE-012 seam: lighter than interview prep, with company context, four grounded questions and explicit do-nots.", reason: null, unblock: null });
=======
"use strict"; const { H, G, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-173", "cross-city-alumni-warmth");
  await s.user("Alumni in a different city than the role — warmth ranked honestly, not inflated");
  const local = G.rankWarmth(T("Local Alum", { current_firm: "Stripe", schools: ["TEST University"], geography: "New York, NY" }), profile, { roleCity: "New York, NY" });
  const remote = G.rankWarmth(T("Far Alum", { current_firm: "Stripe", schools: ["TEST University"], geography: "San Francisco, CA" }), profile, { roleCity: "New York, NY" });
  await s.tool("135-career-graph.rankWarmth(same-city)", local); await s.tool("135-career-graph.rankWarmth(cross-city)", remote);
  await s.agent(`Honest ranking for the New York role:\n\n1. Local Alum — warmth ${local.score} (alumni, same city as the role)\n2. Far Alum — warmth ${remote.score} (alumni 40, minus 15 cross-city discount: they're in San Francisco, the role is in New York)\n\nI did NOT rank them equal just because both are alumni. The cross-city discount is disclosed in the record, not buried: a San Francisco alum can still refer you, but they can't speak to the New York team, grab coffee with the hiring manager, or vouch locally — pretending otherwise inflates the path and mis-sequences your asks.`);
  s.verify("warmth state", { local: local.score, cross_city: remote.score, discount_disclosed: remote.adjustments.some((a) => a.delta === -15) });
  await s.finish({ status: "COMPLETE", outcome: "Cross-city alumnus ranked honestly below the same-city alumnus (25 vs 40) with the −15 cross-city discount disclosed in the rail record." });
>>>>>>> origin/career/sc-w09
})();
