<<<<<<< HEAD
"use strict"; const { H, P, cirById, briefText } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-172", "ramp-final-round-no-cir");
  await s.user("I have a final round at Ramp — what decides it?");
  const cir = cirById("ramp"); await s.tool("127-career-prep.findCir", { company: "Ramp", cir_found_on_this_branch: !!cir, note: "ramp.json exists on origin/career/cir-b1, not merged into pivot/career" });
  const brief = P.composeBrief({ company: "Ramp", cir, round: "final round" });
  await s.agent(`${briefText(brief)}\n\nSo I can't honestly weight Ramp's final-round signals — that is exactly what their CIR would carry (final-round stages + screening signals). What I can do today: run a final-round-style mock from the generic bank and your story bank, and drill the JD if you paste it. But "what decides it at Ramp" needs the Ramp record, and I won't dress up guesses as their signals.`);
  s.verify("brief state", { status: brief.status, stages: brief.stages.length });
  await s.finish({ status: "LEARN", outcome: "Agent declined to fabricate Ramp final-round signals: no Ramp CIR is merged on this branch, so the weighted final-round brief + targeted mock could not be grounded.", reason: "ramp.json exists only on origin/career/cir-b1; pivot/career carries 15 CIRs without Ramp.", unblock: "Merge origin/career/cir-b1's packages/career-data/cirs/ramp.json into pivot/career; composeBrief + questionBank then weight the final round from its CIR automatically." });
=======
"use strict"; const { H, G, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-172", "recruiter-vs-practitioner-asks");
  await s.user("Recruiter vs practitioner at the same firm — different asks, drafted accordingly");
  const rec = T("Rae Recruiter", { current_firm: "Stripe", title: "University Recruiter", role_kind: "recruiter", work_email: "rae@example.test" });
  const prac = T("Pete Practitioner", { current_firm: "Stripe", title: "Software Engineer", role_kind: "practitioner", work_email: "pete@example.test" });
  const a = G.draftReferralAsk(rec, profile, { hadGoodChat: true, role: "Software Engineering Intern", blurb: "BLURB" });
  const b = G.draftReferralAsk(prac, profile, { hadGoodChat: true, role: "Software Engineering Intern", blurb: "BLURB", chatNote: "your point about Stripe's writing culture" });
  await s.tool("135-career-graph.draftReferralAsk(recruiter)", a); await s.tool("135-career-graph.draftReferralAsk(practitioner)", b);
  await s.agent(`Same firm, two different asks — because they do two different jobs:\n\nRECRUITER (Rae) — a ROUTING ask: confirm the right requisition and whether the referral attaches before you submit. She can't endorse your engineering; asking her to wastes the ask.\n\n${a.draft.body}\n\nPRACTITIONER (Pete) — an ENDORSEMENT ask: refer me, with the blurb doing the work, grounded in your actual chat.\n\n${b.draft.body}\n\nBoth held draft_only for your yes.`);
  s.verify("ask kinds + bodies differ", { kinds: [a.kind, b.kind], bodies_differ: a.draft.body !== b.draft.body });
  await s.finish({ status: "COMPLETE", outcome: "Recruiter ask (process/routing: right requisition, referral attached pre-submit) and practitioner ask (endorsement + blurb) drafted differently for the same firm, both draft_only." });
>>>>>>> origin/career/sc-w09
})();
