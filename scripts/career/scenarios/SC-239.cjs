"use strict";
// SC-239 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-239","startup-entry");
  s.user('Startup entry — the build-or-sell proof route');
  const p=L.pathRun(s,"startups",L.SOPHOMORE);
  await L.finish(s,p.ok,"Startup entry via the labeled general ladder: proof artifact first, the small paid project offer, boards + direct founder outreach — with the honest equity/variance note. Verified + lint-clean.","Verification failed; see evidence.","Fix and rerun SC-239.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
