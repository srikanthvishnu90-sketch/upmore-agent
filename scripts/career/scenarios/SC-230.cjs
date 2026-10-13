"use strict";
// SC-230 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-230","quant-path-jane-citadel");
  s.user('Jane Street / Citadel quant path — competition signals, honest rarity');
  const a=L.thesisRun(s,"jane-street",L.SOPHOMORE);
  const b=L.thesisRun(s,"citadel-securities",L.SOPHOMORE);
  const cs=L.CI.getCIR(L.store,"citadel-securities");
  s.verify("honest-rarity check from the CIR itself: Citadel Securities' bar fact states its official postings do NOT name competition results as requirements — folklore separated from the firm's stated screen in the produced answer's source record",{bar:cs.hiring_bar_summary.statement});
  await L.finish(s,a.ok&&b.ok,"Quant path answered with both firms' full theses (Jane Street + Citadel Securities) for the canonical sophomore — signals, routes, gaps, plans — with the competition-signal folklore explicitly corrected from Citadel's own CIR bar fact. Both verify; lint clean.","Verification failed; see evidence.","Fix and rerun SC-230.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
