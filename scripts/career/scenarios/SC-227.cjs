"use strict";
// SC-227 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-227","stripe-new-grad-bar");
  s.user('"What does Stripe look for in new-grad SWEs?" — CIR answer, sources labeled');
  const r=L.thesisRun(s,"stripe",L.SOPHOMORE);
  await L.finish(s,r.ok,"Stripe thesis from its CIR for the canonical sophomore: stated vs revealed screens, routes, gaps and plan — every claim sourced in the ledger, verifyThesis passes, lint clean.","Verification failed; see evidence.","Fix and rerun SC-227.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
