"use strict";
// SC-225 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-225","goldman-vs-boutique");
  s.user('Goldman vs a boutique for me — brand, exits, hiring volume, fit compared');
  const r=L.thesisRun(s,"goldman-sachs-ibd",L.TARGET_JUNIOR);
  const p=L.pathRun(s,"boutique-vs-bulge-bracket",L.TARGET_JUNIOR);
  await L.finish(s,r.ok&&p.ok,"Comparison delivered from rail state: the full Goldman CIR thesis for the TEST target junior plus the 134 structural boutique-vs-bulge-bracket comparison (brand, exits, hiring volume, fit) — boutique side labeled qualitative because no boutique CIR exists in the corpus, and no boutique numbers are claimed.","Verification failed; see evidence.","Fix the failing output and rerun SC-225.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
