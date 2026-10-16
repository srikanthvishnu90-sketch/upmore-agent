'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
function inspect(){
  const expected=['packages/career-contracts/journey-contract-v1.ts','packages/career-contracts/journey-contract-v1.schema.json'];
  const missing=expected.filter(f=>!fs.existsSync(path.join(root,f)));
  const bundle=fs.readFileSync(path.join(root,'supabase/functions/_shared/router_core.career.js'),'utf8');
  const exported=/export\s*\{[^}]*CareerInterviewJourney/s.test(bundle);
  const report={status:'BLOCKED',canonical_contract_files_missing:missing,pure_module_in_career_bundle:exported,consumer_compatibility:missing.length?'BLOCKED_MISSING_A_SCHEMA':'PRESENT_REVIEW_REQUIRED',actual_authenticated_entry:'NOT_RUN',durable_host_state:'NOT_RUN',actual_artifact_delivery:'NOT_RUN',provider_quality:'NOT_RUN',owner:'Spec A / Muse',reason:'B does not own shared contracts, router registration, handler, host persistence, bundle wiring or artifact host. Presence alone cannot establish runtime compatibility.'};
  console.log(JSON.stringify(report,null,2));return report;
}
if(require.main===module){inspect();process.exitCode=2;}module.exports={inspect};
