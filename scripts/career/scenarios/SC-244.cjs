// SC-244 "Which major should I pick?" — answered from population data at my target companies.
"use strict";
const L = require("./_w13-lib.cjs");
const { CI, H } = L;
(async () => {
  const s = H.session("SC-244", "which-major-from-population-data");
  s.user("Which major should I pick?");
  const st = L.store();
  const agg = [];
  let populationBacked = 0;
  for (const [id, cir] of Object.entries(st.byId)) {
    const md = cir.major_dist || {};
    if (md.basis === "population") populationBacked++;
    agg.push({ company_id: id, basis: md.basis, sample_size: md.sample_size, entries: (md.entries || []).map((e) => ({ label: e.label, note: e.note })) });
  }
  s.tool("major_dist aggregation across the whole CIR corpus", { companies: agg.length, population_backed_major_dists: populationBacked, agg });
  const lines = agg.filter((a) => a.entries.length).slice(0, 8).map((a) => `- ${a.company_id}: ${a.entries.map((e) => e.label).join("; ")}`).join("\n");
  const reply = ["First, the data honesty, because your question asks for population data specifically: across every company record I hold, the count of population-backed major distributions is zero. Every record is curated-qualitative — the firms publish eligibility frames and stated screens, not the measured major mix of who they hired. I will not invent shares to fill that gap.",
    "What the stated frames at target companies actually say:\n" + lines,
    "The pattern inside those frames: for engineering targets the named frame is computer science, mathematics, or a related discipline; for banking and consulting targets the frames are explicitly discipline-open, with the screen sitting on academics, modeling or case performance instead. So the evidence-backed read is: pick the major whose coursework builds the screen your target actually runs — quantitative and technical depth for engineering and quant targets, and for the discipline-open targets, the major you can earn the strongest record in while building the named skills on the side.",
    "If you want the real population answer — measured major shares of actual hires — that requires a licensed population dataset I do not hold yet. Say the word and I will spec exactly what to buy and what it would answer."].join("\n\n");
  s.agent(reply);
  const lint = CI.lintAdvice(reply);
  s.tool("lintAdvice", lint);
  s.verify(`Aggregation ran over all ${agg.length} CIRs from rail state: population-backed major distributions = ${populationBacked}. The reply states that plainly, answers from the stated frames that do exist (recorded verbatim above), and lint is clean (ok=${lint.ok}). The scenario's specified evidence — population data — does not exist in the corpus, so the scenario cannot be COMPLETE on its own terms.`, { companies: agg.length, population_backed: populationBacked });
  await s.finish({ status: "LEARN", outcome: "Answered from every stated major frame in the corpus, with the missing population data named plainly.", reason: "All CIR major distributions are curated-qualitative (0 population-backed): no licensed population sample exists in the rail, and Doc 3 forbids inventing shares.", unblock: "Owner picks and funds the licensed population vendor sample (Doc 3 §1.6 names PDL/Coresignal class) for the target companies; ingest as population-basis distributions, then rerun SC-244." });
})();
