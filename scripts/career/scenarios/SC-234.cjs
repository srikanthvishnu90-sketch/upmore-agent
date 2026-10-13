"use strict";
// SC-234 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-234","big-law-path");
  s.user('Big Law path — ABA employment data, debt stated honestly');
  const p=L.pathRun(s,"big-law",L.SOPHOMORE);
  await L.finish(s,p.ok,"Big Law answered via the labeled general ladder (no law CIR exists): LSAT/GPA admissions reality, school-driven OCI, ABA Standard 509 employment data as the decision tool, and debt stated honestly — verified + lint-clean, labeled not legal advice.","Verification failed; see evidence.","Fix and rerun SC-234.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
