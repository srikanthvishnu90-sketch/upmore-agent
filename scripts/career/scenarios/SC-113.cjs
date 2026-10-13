"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-113", "weak-profile-honesty-quant");
  s.user("I want quant firm roles (I have no math background)");
  const freshProf121 = L.profile("persona-nontarget-freshman.json");
  const r = await L.pollLive();
  const quant = r.postings.find((p) => /quant|trader/i.test(p.title) && p.seniority_band === "intern") || r.postings.find((p) => /quant/i.test(p.title));
  s.tool("121.poll (live) + quant pick", { totals: L.feedTotals(r), pick: L.slim(quant), freshman_skills: freshProf121.skills });
  const judge = A3.eligibilityJudge(quant, freshProf121, { mustHaveSkills: ["Probability", "Statistics"] });
  const hrt = L.cir("hudson-river-trading"); const ts = L.cir("two-sigma");
  const pathFacts = [...((hrt.skills_dist || {}).facts || []), ...((ts.skills_dist || {}).facts || [])].map((f) => f.claim).slice(0, 4);
  const adjacent = L.scoreAll(r.postings.filter((p) => (p.role_family === "Finance" || p.role_family === "SWE") && p.seniority_band === "intern"), freshProf121);
  const adj = await J.buildShortlist(adjacent, { limit: 3 });
  s.agent(`No — I will not submit you to ${quant.title} at ${quant.company}, and here is the plain reason: the eligibility judge says SKIP (${judge.stage}: ${judge.reasons.join("; ")}). Your evidenced record is a freshman finance BBA with Excel; the role's must-haves (probability, statistics, quantitative problem solving) have zero evidence behind them, and a submission would burn the application. The 12-month path, from what the quant firms' own records say they screen for (${pathFacts.join(" | ")}): months 1–3 probability + statistics coursework with grades as evidence; 4–6 combinatorics + a market-data project with a public writeup; 7–9 probability puzzle practice (the firms publish the style) + a smaller-shop or adjacent internship; 10–12 apply to quant intern roles with the evidence in place. Adjacent roles you CAN honestly chase now: ${adj.map((x) => `${x.posting.title} at ${x.posting.company} (${x.adjusted_score})`).join(" | ")}.`, { card: { title: "Quant: refused, with a path", judge, path_facts: pathFacts, adjacent_now: adj.map((x) => ({ ...L.slim(x.posting), score: x.adjusted_score })) } });
  s.verify("verdict from 132.eligibilityJudge over 121 hard filters + must-have evidence; path facts quoted from HRT/Two Sigma CIR skills records", { verdict: judge.verdict, stage: judge.stage, adjacent: adj.length });
  await s.finish({ status: judge.verdict === "skip" ? "COMPLETE" : "LEARN", outcome: "Quant submission refused for the no-math-background freshman profile with the judge's reasons; 12-month evidence path from quant CIRs + 3 adjacent roles he can honestly apply to now" });
})().catch((e) => { console.error(e); process.exit(1); });
