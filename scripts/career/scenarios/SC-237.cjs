"use strict";
// SC-237 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-237","vc-seats");
  s.user('VC seats — how few exist and what routes are real');
  const p=L.pathRun(s,"venture-capital",L.TARGET_JUNIOR);
  await L.finish(s,p.ok,"VC answered via the labeled general ladder (no VC CIR exists): seats are scarce and episodic with no published cohort data — so no seat count is claimed — and the three real routes (operator/founder, finance training, visible early-stage surface) are laid out with a plan. Verified + lint-clean.","Verification failed; see evidence.","Fix and rerun SC-237.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
