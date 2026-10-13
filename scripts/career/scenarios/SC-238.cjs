"use strict";
// SC-238 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-238","data-science-entry");
  s.user("Data science entry — master's reality vs applied roles");
  const p=L.pathRun(s,"data-science",L.SOPHOMORE);
  await L.finish(s,p.ok,"Data-science entry via the labeled general ladder (no DS CIR exists): research-track roles' graduate-degree reality split from applied analyst / analytics-engineering rungs that hire bachelor's graduates on shipped work — verified + lint-clean.","Verification failed; see evidence.","Fix and rerun SC-238.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
