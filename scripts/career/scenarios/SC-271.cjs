"use strict"; const {H,OS,cir,fixture}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-271","market-value-with-evidence");
  s.user("What am I worth now? \u2014 answered with evidence, and it updates over time");
  const fx=fixture("test-career-os-w14.json"); const mv=OS.marketValue({cirs:[cir("microsoft"),cir("amazon")],postings:fx.postings_current,as_of:"2026-10-13"}); s.tool("129.marketValue (TEST postings + new CIRs)",mv);
  s.agent(mv.estimate?`Your market value from sourced figures only: $${mv.estimate.low.toLocaleString()}\u2013$${mv.estimate.high.toLocaleString()} (median midpoint $${mv.estimate.median_midpoint.toLocaleString()}). Evidence (${mv.evidence.length} figure(s), each with source + date):\n${mv.evidence.map(e=>`\u2022 ${e.company} \u2014 $${e.low.toLocaleString()}\u2013$${e.high.toLocaleString()} (${e.kind}, as of ${e.as_of})`).join("\n")}\n${mv.statement} It updates automatically as new sourced postings and CIR figures land.`:"No sourced figure exists yet, so no number is claimed \u2014 exactly as the honesty law requires.");
  s.verify("estimate derived only from evidence array in rail output; every evidence row carries source_url/as_of",mv);
  await s.finish({status:mv.estimate?"COMPLETE":"LEARN",outcome:"Market value answered from 3 sourced TEST posting ranges with per-figure evidence and as_of; updates as new sourced figures arrive"}); })();
