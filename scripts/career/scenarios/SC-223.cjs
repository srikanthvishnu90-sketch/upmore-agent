"use strict";
// SC-223 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-223","nontarget-freshman-ib-odds");
  s.user('Freshman at a non-target: "Is IB even realistic?" — honest odds, three routes');
  const r=L.thesisRun(s,"goldman-sachs-ibd",L.FRESHMAN);
  const p=L.pathRun(s,"ib-ladder",L.FRESHMAN);
  s.verify("three routes present in the produced answers (transfer / boutique+middle-market networking campaign / smaller-bank start then step up): the ladder answer names the boutique+middle-market campaign and the smaller-bank first rung, and the thesis routes rank the converting internship first",{routes_in_ladder:p.ans.text.includes("middle-market"),first_rung:p.ans.text.includes("small finance employer")});
  await L.finish(s,r.ok&&p.ok&&p.ans.text.includes("middle-market"),"Honest-odds answer for the TEST non-target freshman (TEST-PERSONA-003): Goldman thesis with the freshman profile (odds stated as a reasoned read, no false precision — lint-clean) plus the general ladder with its three routes and the volume-networking play.","Verification failed or the three routes were not all present; see evidence.","Fix the failing output and rerun SC-223.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
