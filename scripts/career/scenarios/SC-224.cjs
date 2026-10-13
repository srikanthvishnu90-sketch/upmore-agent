"use strict";
// SC-224 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-224","gpa-34-ib");
  s.user('"Is a 3.4 GPA fatal for IB?" — cutoffs checked firm by firm on my list');
  const r=L.thesisRun(s,"goldman-sachs-ibd",L.GPA34);
  const cir=L.CI.getCIR(L.store,"goldman-sachs-ibd");
  const para="Firm-by-firm on the list this corpus can check: Goldman Sachs — the firm publishes no GPA cutoff on the programme pages checked for its CIR (checked 2026-10-12); the screen students cite is a community-reported soft norm around 3.5, labeled reported, not policy. Your stated 3.4 sits just under that reported norm: not fatal and not a ban, but the file needs the compensating stack — a relevant internship, technical readiness, and a referral who can move it past a first-pass screen. For the other firm types on a typical list (elite boutiques, middle-market banks) this corpus holds no CIR with a published cutoff either, so the honest per-firm answer is: no published cutoff found in the records checked; where an application form asks for GPA, answer truthfully — never round it up.";
  s.agent(para);
  const claims=[...r.th.claims,{text:"user-stated GPA",value:3.4,unit:null,source_url:cir.hiring_bar_summary.source_url,as_of:cir.as_of,sample_size:null},{text:"community-reported soft norm",value:3.5,unit:null,source_url:"https://www.finbound.org/blog/goldman-sachs-application-process-guide",as_of:"2026-10-12",sample_size:null}];
  const v=L.CI.verifyClaims(r.th.text+"\n\n"+para,claims,{allowedNumbers:r.th.allowed_numbers});
  const lint=L.CI.lintAdvice(para);
  s.verify("GPA answer verified: 3.4 (user-stated) and 3.5 (community-reported norm, labeled reported not policy) both carry ledger claims; the CIR's own fact — Goldman publishes no cutoff — is quoted from hiring_bar_summary",{verify_ok:v.ok,errors:v.errors,lint_ok:lint.ok,bar_fact:cir.hiring_bar_summary.statement});
  await L.finish(s,r.ok&&v.ok&&lint.ok,"3.4-GPA answer: not fatal — Goldman CIR states the firm publishes no GPA cutoff; the 3.5 figure is labeled a community-reported soft norm, the compensating stack is named, and 'never round it up' is stated. Verified + lint-clean.","GPA verification failed; see evidence.","Fix the failing claim and rerun SC-224.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
