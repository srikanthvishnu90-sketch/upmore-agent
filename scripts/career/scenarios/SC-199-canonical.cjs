"use strict"; const { H, P, persona, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-199", "post-rejection-retro-canonical");
  await s.user("Post-rejection retro: what do my debriefs say I keep missing?");
  const store = P.makePrepStore();
  const fixtures = [
    { company: "Goldman Sachs (TEST debrief)", interviewer: "Analyst A (TEST)", wentWell: ["why-banking story landed"], stumbled: ["technical valuation depth — froze on DCF follow-ups"], questionsAsked: ["team day-to-day"] },
    { company: "Evercore (TEST debrief)", interviewer: "Associate B (TEST)", wentWell: ["club leadership story"], stumbled: ["valuation technicals — accretion math under pressure"], questionsAsked: ["deal staffing"] },
    { company: "Stripe (TEST debrief)", interviewer: "HM C (TEST)", wentWell: ["dashboard story with numbers"], stumbled: ["answer structure rambled on the design question", "technical depth on system trade-offs"], questionsAsked: ["team roadmap"] }];
  for (const f of fixtures) P.captureDebrief(store, f);
  const r = P.debriefRetro(store);
  await s.tool("127-career-prep.debriefRetro(TEST debrief fixtures x3)", r);
  await s.agent(`Post-rejection retro — mined only from your ${r.total_debriefs} stored debriefs (labeled TEST fixtures here; nothing read into them that they don't say):\n\n${r.patterns.map((p)=>`- ${p.theme}: in ${p.count} of ${r.total_debriefs} debriefs (${p.companies.join("; ")})`).join("\n")}\n\nWhat you keep missing, in one line: ${r.top_miss} — it appears in all ${r.total_debriefs} debriefs (both banking rejections on valuation, plus technical depth at Stripe), while structure appears once. So the fix is not more mocks in general: it's timed valuation/technical drills (the finance drill set: accounting, DCF, comps, LBO) until the follow-up layer stops freezing, then one re-mock to confirm.`);
  s.verify("retro mined from stored debriefs", { total: r.total_debriefs, top_miss: r.top_miss, recurring: r.recurring.length, patterns: r.patterns.map((p)=>[p.theme,p.count]) });
  await s.finish({ status: "COMPLETE", outcome: "Retro over 3 labeled TEST debriefs: technical/valuation depth recurs in 3 of 3 (both banking rejections plus Stripe technical depth) vs structure once — named as the top recurring miss with the targeted drill fix." });
})();
