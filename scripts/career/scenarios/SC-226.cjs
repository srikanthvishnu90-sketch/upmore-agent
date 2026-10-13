"use strict";
// SC-226 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-226","search-fund-internships");
  s.user('"Do search-fund internships actually help for BB?" — answered from the pattern evidence');
  const p=L.pathRun(s,"search-fund-internships",L.FRESHMAN);
  const cir=L.CI.getCIR(L.store,"goldman-sachs-ibd");
  s.tool("goldman-sachs-ibd CIR path_patterns (pattern evidence)",cir.path_patterns);
  s.verify("the Goldman CIR's own first path pattern names the search-fund freshman rung — the pattern evidence the answer rests on",{pattern:cir.path_patterns[0].pattern,evidence:cir.path_patterns[0].evidence});
  await L.finish(s,p.ok&&cir.path_patterns[0].pattern.includes("search fund"),"Search-fund answer from the pattern evidence: the Goldman CIR's documented ladder pattern literally names a search fund as the freshman-summer rung; the 134 answer states what it proves, what it does not replace, and the no-substance trap — verified + lint-clean.","Verification failed or the CIR pattern did not name search funds; see evidence.","Fix and rerun SC-226.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
