"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;

(async () => {
  const s = H.session("SC-024", "fit-score-explained");
  const r = await L.pollLive();
  const prof = L.profile("test-persona.json");
  const stripe = r.postings.filter((p) => p.company.toLowerCase() === "stripe");
  const pick = stripe.find((p) => p.role_family === "SWE" && (p.seniority_band === "intern" || p.seniority_band === "new_grad")) || stripe.find((p) => p.role_family === "SWE");
  const senior = stripe.find((p) => p.seniority_band === "senior" || p.seniority_band === "staff");
  s.user(`is this role a fit for me? (${pick ? pick.title + " at Stripe" : "a real Stripe posting"})`);
  s.tool("121.poll (live)", { totals: L.feedTotals(r), stripe_rows: stripe.length });
  const fit = J.scoreFit(pick, prof);
  const seniorFit = senior ? J.scoreFit(senior, prof) : null;
  s.agent(fit.excluded ? `No — and it is not scored at all, because a hard filter excludes it: ${fit.reasons.join("; ")}` : `Fit score ${fit.score}/100 (${fit.bucket} vs the neutral bar ${fit.bar} — no Stripe company record yet, so no company bar is claimed). Why: ${fit.reasons.join("; ")}. Gaps: ${fit.gaps.join("; ") || "none named"}. Matched skills: ${fit.matched_skills.join(", ") || "none"}.`, { card: { title: "Fit explained — real Stripe posting", posting: L.slim(pick), fit } });
  if (seniorFit) s.agent(`For contrast, this senior Stripe role (${senior.title}) is ${seniorFit.excluded ? "excluded before scoring" : "scored " + seniorFit.score}: ${seniorFit.reasons.join("; ")}`, { card: { title: "Hard-filter contrast (senior Stripe role)", posting: L.slim(senior), fit: seniorFit } });
  s.verify("score, reasons, gaps and any exclusion come from scoreFit over the persona's real fixture facts, on a posting row pulled live from Stripe's Greenhouse board", { posting_id: pick.job_id, excluded: fit.excluded, score: fit.score, senior_excluded: seniorFit ? seniorFit.excluded : null });
  await s.finish({ status: fit ? "COMPLETE" : "LEARN", outcome: `Real live Stripe posting (${pick.title}) fit-explained: ${fit.excluded ? "excluded with reason" : "score " + fit.score + " " + fit.bucket} with reasons + gaps from the persona's facts`, reason: fit.excluded ? "the best-matching live Stripe SWE posting is itself hard-filter excluded for this sophomore persona — explained, not scored" : undefined });
})().catch((e) => { console.error(e); process.exit(1); });
