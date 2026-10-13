"use strict";
// SC-236 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-236","pe-from-undergrad");
  s.user('PE from undergrad — the bank-first truth, stated plainly');
  const r=L.thesisRun(s,"kkr",L.TARGET_JUNIOR);
  await L.finish(s,r.ok,"PE truth from the KKR CIR thesis: direct undergraduate entry into core PE is rare, the real undergraduate doors (Summer Analyst, K-Star) sit mostly in credit/real-asset strategies, and the flagship PE associate seat is filled overwhelmingly through the bank-analyst-first route — stated in the CIR's own bar summary. Verified + lint-clean.","Verification failed; see evidence.","Fix and rerun SC-236.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
