"use strict"; const {H,CI,cir,validateFile}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-266","archetype-healthtech");
  s.user("Company file built: healthtech startup archetype");
  const c=cir("archetype-healthtech"); const v=CI.validateCIR(c); const gate=validateFile("archetype-healthtech");
  s.tool("125.validateCIR",{ok:v.ok,errors:v.errors,company_id:c.company_id,as_of:c.as_of,sample_size:c.sample_size,confidence:c.confidence_level});
  s.tool("scripts/validate-cir.cjs (standalone gate)",gate);
  s.agent(`ARCHETYPE — not a company: this file describes a typical pattern for planning and must be re-verified against any specific company. Built and validated: ${c.company_name} company file (as of ${c.as_of}, ${c.confidence_level}, sample size ${c.sample_size===null?"null — curated-qualitative, no invented numbers":c.sample_size}). Thesis: ${c.thesis_text}`);
  s.verify("standalone validator exit code for the new file, from rail state",gate);
  await s.finish({status:gate.ok?"COMPLETE":"LEARN",outcome:"healthtech startup archetype company file built from public sources and passing the standalone CIR validator",reason:gate.ok?undefined:"validator failed — see tool record",unblock:gate.ok?undefined:"fix the CIR envelope/facts until validate-cir.cjs exits 0"}); })();
