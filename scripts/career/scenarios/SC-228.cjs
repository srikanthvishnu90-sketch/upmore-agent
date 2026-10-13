"use strict";
// SC-228 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-228","state-school-faang");
  s.user('State school: "Can I get FAANG?" — what offsets the brand gap + a 90-day plan');
  const p=L.pathRun(s,"faang-state-school",L.SOPHOMORE);
  await L.finish(s,p.ok,"State-school FAANG answer: the labeled general ladder (no FAANG CIR in corpus — stated in the answer) with the brand-gap offsets and an explicit 90-day plan split across the plan horizons; verified + lint-clean.","Verification failed; see evidence.","Fix and rerun SC-228.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
