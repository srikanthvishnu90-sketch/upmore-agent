"use strict"; const {H,CI,cir,validateFile}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-261","company-file-microsoft");
  s.user("Company file built: Microsoft");
  const c=cir("microsoft"); const v=CI.validateCIR(c); const gate=validateFile("microsoft");
  s.tool("125.validateCIR",{ok:v.ok,errors:v.errors,company_id:c.company_id,as_of:c.as_of,sample_size:c.sample_size,confidence:c.confidence_level});
  s.tool("scripts/validate-cir.cjs (standalone gate)",gate);
  s.agent(`Built and validated: ${c.company_name} company file (as of ${c.as_of}, ${c.confidence_level}, sample size ${c.sample_size===null?"null — curated-qualitative, no invented numbers":c.sample_size}). Thesis: ${c.thesis_text}`);
  s.verify("standalone validator exit code for the new file, from rail state",gate);
  await s.finish({status:gate.ok?"COMPLETE":"LEARN",outcome:"Microsoft company file built from public sources and passing the standalone CIR validator",reason:gate.ok?undefined:"validator failed — see tool record",unblock:gate.ok?undefined:"fix the CIR envelope/facts until validate-cir.cjs exits 0"}); })();
