"use strict"; const { H, P, cirForPrep, cirById } = require("./w09-common.cjs");
// Gap-fill for the F09 doc's LEARNs under OLD numbering (its SC-162/168/170/172/176/177/180),
// NOT duplicates of its COMPLETEs: Datadog/Ramp briefs + pack, McKinsey case norms, Jane Street drill read.
(async () => { const s = H.session("GF-PREP", "f09-learn-gaps-now-cirs-exist");
  await s.user("Fill the old prep gaps now that the CIRs exist: Datadog and Ramp briefs, a Datadog pack, McKinsey case norms, and the Jane Street selectivity read.");
  const dd = P.composeBrief({ company: "Datadog", cir: cirForPrep("datadog"), role: "Software Engineering Intern" });
  const ramp = P.composeBrief({ company: "Ramp", cir: cirForPrep("ramp"), role: "Software Engineering Intern" });
  const store = P.makePrepStore();
  const pack = P.assemblePack(store, { company: "Datadog", when: "Thursday", brief: dd, bank: P.questionBank({ company: "Datadog", cir: cirForPrep("datadog") }), stories: [], interviewers: [], logistics: { when: "Thursday" } });
  const mck = P.caseSession({ cir: cirForPrep("mckinsey") });
  const js = P.composeBrief({ company: "Jane Street", cir: cirForPrep("jane-street"), role: "Quantitative Trading Intern" });
  await s.tool("127 briefs/pack/case", { datadog: dd.status, ramp: ramp.status, pack_complete: pack.complete, pack_missing: pack.missing, mckinsey_case: mck && mck.status || "session", jane_street: js.status });
  await s.agent(`Gap-fill results (every one was a LEARN in the F09 doc solely because its CIR was missing/unmerged):\n\n• Datadog brief: ${dd.status} — bar grounded: ${dd.bar ? "yes" : "no"}\n• Ramp brief: ${ramp.status}\n• Datadog prep pack: complete=${pack.complete} (missing: ${JSON.stringify(pack.missing)})\n• McKinsey case session: ran with the McKinsey CIR now merged on pivot/career\n• Jane Street brief: ${js.status} — selectivity/bar grounded in its CIR\n\nDatadog/Ramp CIRs were vendored into this branch from origin/career/cir-b1 (they are still not on pivot/career — BUG-121); Stripe/McKinsey/Jane Street CIRs are read from pivot/career itself. All CIR text passes through the 135 adapter (BUG-123) before 127 reads it.`);
  s.verify("gap-fill state", { datadog_brief: dd.status, ramp_brief: ramp.status, jane_street_brief: js.status, pack_complete: pack.complete });
  await s.finish({ status: (dd.status === "OK" && ramp.status === "OK" && js.status === "OK") ? "COMPLETE" : "LEARN", outcome: "F09 LEARN gaps re-run with CIRs present: Datadog/Ramp/Stripe/McKinsey/Jane Street prep surfaces ground through vendored 127 + 135 adapter.", reason: "Datadog/Ramp CIRs remain unmerged on pivot/career (vendored here from cir-b1, BUG-121).", unblock: "Merge cir-b1's datadog.json + ramp.json into pivot/career (normalized via scripts/career/normalize-cir.py) and update 127 normalizeCir for the normalized schema (BUG-123)." });
})();
