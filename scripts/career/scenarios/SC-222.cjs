"use strict";
// SC-222 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-222","ib-recruiting-ladder");
  s.user('"What does IB recruiting actually require?" — the real ladder, no sugarcoating');
  const r=L.thesisRun(s,"goldman-sachs-ibd",L.FRESHMAN);
  const p=L.pathRun(s,"ib-ladder",L.FRESHMAN);
  await L.finish(s,r.ok&&p.ok,"IB ladder answered two ways from rail state: the Goldman CIR thesis (firm-published screen vs revealed screen, rolling timing) plus the 134 general IB ladder (freshman small rung -> sophomore step-up -> junior-summer converting internship), both verified and lint-clean.","One of the two verified answers failed its rail-state check; see verification evidence.","Fix the failing module output and rerun SC-222.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
