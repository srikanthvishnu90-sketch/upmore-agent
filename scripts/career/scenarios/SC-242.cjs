// SC-242 "Will AI take my job?" — evidence and uncertainty, no fluff either direction.
"use strict";
const L = require("./_w13-lib.cjs");
const { CI, H } = L;
(async () => {
  const s = H.session("SC-242", "will-ai-take-my-job");
  s.user("Will AI take my job?");
  const st = L.store();
  const cirCount = Object.keys(st.byId).length;
  s.tool("corpus scan for labor-market evidence", { cirs_loaded: cirCount, labor_market_dataset_in_125: false, note: "The 125 corpus is company hiring records (CIRs). No CIR type holds macro labor-market or automation-exposure data; a search of the corpus for an AI-displacement evidence base returns nothing to cite." });
  const reply = ["Honest answer: I do not have an evidence base in my company records that can settle that question, and anyone who gives you a confident yes or no is performing, not informing.",
    "What is actually known, kept separate from anecdote: automation pressure lands on tasks before it lands on whole jobs, and how much of a given role is exposed depends on the specific work — judgment, accountability, client trust and messy real-world context have historically been the durable parts, while routine production of standard artifacts is the exposed part. Those are patterns from how prior automation waves played out, labeled as patterns, not as measurements of your role.",
    "What is anecdotal: individual viral stories of replacement or of total safety. Neither is a base rate, and I will not dress either up as one.",
    "The useful move is not a prediction, it is positioning: get demonstrably good at the parts of your field that involve judgment under ambiguity and at directing the tools themselves, and keep proof of real outcomes. If you tell me your exact role, I will map which of its tasks sit in the exposed bucket and build the plan around the durable ones."].join("\n\n");
  s.agent(reply);
  const lint = CI.lintAdvice(reply);
  s.tool("lintAdvice", lint);
  s.verify(`Reply linted clean (ok=${lint.ok}): no false-precision odds, no guarantee in either direction, known vs anecdotal kept separate in the text itself. But the scenario asks for an evidence-based answer, and the rail holds no labor-market evidence base to cite — the corpus scan above is the proof. An opinion, however honest, is not the scenario's outcome.`, { cirs_loaded: cirCount });
  await s.finish({ status: "LEARN", outcome: "Uncertainty-honest answer served and lint-clean, but no evidence base exists in the rail to answer from.", reason: "Module 125's corpus is company CIRs only; there is no sourced labor-market / automation-exposure dataset, so any verdict would be unsourced — the exact failure Doc 3 §0 forbids.", unblock: "Owner approves a public labor data source (e.g. BLS occupational data, WEF Future of Jobs, or company disclosure reporting) to ingest as dated, sourced facts into 125; then rerun SC-242 and the answer can cite sample and date." });
})();
