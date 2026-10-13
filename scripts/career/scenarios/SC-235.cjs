"use strict";
// SC-235 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-235","pre-med-path");
  s.user('Pre-med path — prereqs, MCAT, clinical ladder, verified timeline');
  const p=L.pathRun(s,"pre-med",L.SOPHOMORE);
  await L.finish(s,p.ok,"Pre-med answered via the labeled general ladder (no medicine CIR exists): prerequisites, MCAT structure and timing, the clinical ladder, and the AMCAS cycle timeline from sourced advising guides — verified + lint-clean, labeled career planning only, not medical advice.","Verification failed; see evidence.","Fix and rerun SC-235.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
