"use strict";
// SC-231 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-231","qr-vs-qt-fit");
  s.user('Quant researcher vs trader — which fits me; day-to-day truth');
  const js=L.CI.getCIR(L.store,"jane-street"), cs=L.CI.getCIR(L.store,"citadel-securities");
  s.tool("citadel-securities entry_routes",cs.entry_routes); s.tool("jane-street entry_routes",js.entry_routes);
  const lines=[];
  lines.push("Bottom line for you (canonical sophomore: CS, probability and statistics coursework, a SWE internship, no research record yet): apply to the trader track first, and to the BS/MS research-analyst track second. Here is the day-to-day truth the records support, and where the PhD door actually is.");
  lines.push("Quantitative trading, day to day: real-time decisions under uncertainty — pricing, expected value, market-making games are the lived interview content (candidate-reported at Citadel Securities; Jane Street tests probability, mental math and market-making games through its trading interviews). The stated screen at Citadel Securities is to think systematically and quantitatively and to deal with uncertainty in a rigorous, statistical way. Entry door: "+cs.entry_routes[0].route+" — "+cs.entry_routes[0].accessibility_note);
  lines.push("Quantitative research, day to day: slower, deeper work — build and test models on data over days and weeks, not seconds. The degree split is explicit in the postings: a BS/MS analyst track ("+cs.entry_routes[1].route+" — "+cs.entry_routes[1].accessibility_note+") and a separate PhD researcher track with distinct postings. Independent research experience and prior work in a data-driven research environment are explicit stated signals for research — the gap in your current profile.");
  lines.push("The fit call: trading rewards fast probabilistic judgment and comfort being wrong in public, in real time; research rewards depth, patience and a written research record. Your profile today (probability coursework, engineering internship, no research artifact) fits the trader screen now and the research-analyst screen after one real research project. Jane Street runs both families through the same internship door: "+js.entry_routes[0].route+".");
  const text=lines.join("\n\n"); s.agent(text);
  const claims=[...L.claimsFromCIR(js),...L.claimsFromCIR(cs)];
  const v=L.CI.verifyClaims(text,claims,{}); const lint=L.CI.lintAdvice(text);
  s.verify("QR-vs-QT answer verified: every number traces to the two CIRs' harvested claim ledgers; the degree split and the stated signals are the CIRs' own facts; lint clean",{verify_ok:v.ok,errors:v.errors,lint_ok:lint.ok});
  await L.finish(s,v.ok&&lint.ok,"QR vs QT answered from the two CIRs' own entry routes and stated signals: the BS/MS-vs-PhD research split, trading's real-time day-to-day vs research's depth, and a fit call for this profile (trader first, research-analyst second, research gap named). Verified + lint-clean.","Verification failed; see evidence.","Fix and rerun SC-231.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
