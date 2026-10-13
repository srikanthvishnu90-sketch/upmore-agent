"use strict";
// SC-233 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-233","mbb-path-live-dates");
  s.user('MBB path — screens, case norms, this year\'s dates pulled live');
  const a=L.thesisRun(s,"mckinsey",L.TARGET_JUNIOR);
  const b=L.thesisRun(s,"bain",L.TARGET_JUNIOR);
  const c=L.thesisRun(s,"bcg",L.TARGET_JUNIOR);
  const status="Date status, from the CIRs' date-stamped windows (corpus checked 2026-10-12; today is 2026-10-13): Bain US full-time — the October 11, 2026 deadline has passed, and the intern deadline (August 31, 2026) has passed; the next US window must be re-verified on Bain's official school page for your campus, and candidates who applied in the earlier cycle were not eligible to reapply in the October round. BCG US — closed: both 2027 windows (Summer Associate and full-time Associate) have passed and BCG's official page confirms applications for 2027 opportunities have closed; this cycle's deadlines were in early summer, not fall. McKinsey — the CIR carries no single national date: deadlines are office- and school-specific and set each cycle, so the live check is your school's McKinsey page. Case-prep norm, labeled community-reported (Doc 3 §4.5): dozens of practice cases with partners is the common advice — a reported norm, not a firm requirement. Screens: McKinsey's Solve assessment and personal-experience interview, Bain's online assessment and case interviews, BCG's Consulting Career Assessment and online case — each stated in its CIR thesis above.";
  s.agent(status);
  const claims=[...a.th.claims,...b.th.claims,...c.th.claims];
  const v=L.CI.verifyClaims(status,claims,{allowedNumbers:[30]});
  const lint=L.CI.lintAdvice(status);
  s.verify("MBB date status verified against the CIRs' own dated facts: Bain Oct 11 passed + Aug 31 intern passed + reapplication restriction; BCG closed for 2027 (official page); McKinsey no single date in CIR. All numerals in the status text trace to the three theses' ledgers",{verify_ok:v.ok,errors:v.errors,lint_ok:lint.ok,bain_cadence:L.CI.getCIR(L.store,"bain").hiring_cadence.statement,bcg_red_flag:L.CI.getCIR(L.store,"bcg").red_flags[0].statement});
  await L.finish(s,a.ok&&b.ok&&c.ok&&v.ok&&lint.ok,"MBB path: three full CIR theses (McKinsey, Bain, BCG) with screens and process, plus a date-status answer from the CIRs' date-stamped windows — Bain's US Oct 11 deadline passed, BCG's US windows closed for 2027, McKinsey office/school-specific — and the case-practice norm labeled community-reported. All verified; lint clean.","Verification failed; see evidence.","Fix and rerun SC-233.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
