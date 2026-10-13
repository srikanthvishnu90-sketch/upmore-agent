"use strict";
// SC-229 — Intelligence & Honest Advice (worker w12). Canonical text from upmore-career-300-scenarios.md governs.
const L=require("./_w12-lib.cjs");
(async()=>{
  const s=L.H.session("SC-229","swe-market-now");
  s.user('"Is the SWE market bad right now?" — current data; known vs anecdotal kept separate');
  const gate=L.CI.respondToRequest(s.messages[0].text); s.tool("125.respondToRequest gate",gate);
  const read=L.CP.sweMarketRead(L.store,{now:L.NOW});
  s.tool("134.sweMarketRead(corpus)",{companies_checked:read.companies_checked,known:read.known_vs_anecdotal});
  s.agent(read.text);
  const v=L.CI.verifyClaims(read.text,read.claims,{allowedNumbers:read.allowed_numbers});
  const lint=L.CI.lintAdvice(read.text);
  s.verify("market read verified: built only from the CIR corpus's dated hiring-cadence facts; every number traces; zero anecdotal claims made; known vs anecdotal separated in the text",{verify_ok:v.ok,errors:v.errors,lint_ok:lint.ok,companies:read.companies_checked});
  await L.finish(s,v.ok&&lint.ok,"SWE-market answer with known vs anecdotal kept separate: the known side is the corpus's own dated cadence facts from the SWE CIRs checked in October 2026 (hiring running, posting-driven, windows closing per posting); no market-wide statistic is claimed because no source in the corpus supports one.","Verification failed; see evidence.","Fix and rerun SC-229.");
})().catch(async(e)=>{console.error(e);process.exit(1);});
