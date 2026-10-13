"use strict";
// SC-232 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-232","apm-reality");
  s.user('PM straight out of college — APM reality + the build-something plan');
  const p=L.pathRun(s,"apm",L.SOPHOMORE);
  await L.finish(s,p.ok,"APM reality delivered as the labeled general ladder (no APM CIR in corpus): the few structured programmes (Google's two-year rotational APM), the sideways majority route, and the build-something plan — verified + lint-clean, no seat counts claimed.","Verification failed; see evidence.","Fix and rerun SC-232.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
