"use strict";
// SC-221 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-221","palantir-thesis");
  s.user('"How do I get a job at Palantir?" — full thesis with sample size and date');
  const r=L.thesisRun(s,"palantir",L.SOPHOMORE);
  await L.finish(s,r.ok,"Palantir thesis produced by the real 125 composer for the canonical sophomore: ten sections, sample size and as-of date stated in the text itself (curated-qualitative record, no population sample — labeled in the answer), every number traced by verifyThesis and lintAdvice clean.","verifyThesis or lintAdvice failed on the Palantir thesis; see verification evidence.","Fix the failing claim/lint in 125-career-intel or the palantir CIR and rerun SC-221.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
