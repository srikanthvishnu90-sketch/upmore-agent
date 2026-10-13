"use strict";
// SC-240 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-240","government-intel-path");
  s.user('Government / intel path — clearance timelines and citizenship rules, honestly');
  const p=L.pathRun(s,"government-intel",L.SOPHOMORE);
  const note="One profile-specific honesty check, from the TEST fixtures: for the international TEST persona on file (TEST-PERSONA-004, F-1, needs sponsorship), cleared intelligence roles are effectively closed — citizenship is a gating factor examined in the clearance itself, per the Intelligence Community's own clearance page cited above. The realistic adjacent routes for that profile are uncleared federal roles or contractor roles whose announcements state sponsorship terms — checked per announcement, never assumed.";
  s.agent(note);
  const v=L.CI.verifyClaims(p.ans.text+"\n\n"+note,p.ans.claims,{allowedNumbers:p.ans.allowed_numbers});
  s.verify("citizenship gate applied to the F-1 TEST persona from its own fixture constraints (needsSponsorship: true, F-1 student) — the note claims no number and the gate traces to the path's sourced IC fact",{verify_ok:v.ok,errors:v.errors,persona:L.INTERNATIONAL.persona_id,work_authorization:L.INTERNATIONAL.work_authorization});
  await L.finish(s,p.ok&&v.ok,"Government/intel path via the labeled general ladder: USAJobs -> conditional offer -> clearance investigation -> adjudication, with the sourced DCSA processing figures (industry applicants), the citizenship gate from the IC's own clearance page, the 'do not resign on a conditional offer' warning, and the gate honestly applied to the F-1 TEST persona. Verified + lint-clean.","Verification failed; see evidence.","Fix and rerun SC-240.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
