// Synthetic regression: approved structured facts survive desktop/cloud replay by source identity.
import { factsFromPayload, prepare, runApproved } from '../../workers/career-browser/approve-first.ts';
import { planBatch } from '../../supabase/functions/_shared/career_apply.ts';
import { hashApplyPayload } from '../../supabase/functions/_shared/career_apply_store.ts';
import { approvalSources, planApplication, trustedFacts } from '../../scripts/apply.ts';
import { contractFill } from '../../extension/src/apply_core.ts';
const OWNER='SYNTHETIC-row-owner', JOB='workday:synthetic.test:R1';
const ARTIFACT={filename:'synthetic.pdf',sha256:'b'.repeat(64)};
const SOURCE={value:JSON.stringify([{employer:'Synthetic Analytics',title:'Analyst',start:'2023',end:'present'},{employer:'Synthetic Retail',title:'Associate',start:'2020',end:'2022'}]),factId:'TEST-row-history',confirmed:true,provenance:'owner stated these synthetic work entries',confirmation_event_id:'evt-synthetic-work'};
const SCHEMA=[1,2].flatMap(row=>['employer','title'].map(part=>({name:`work-${row}--${part}`,label:part==='employer'?'Company':'Job title',type:'text',required:true,options:[],section:{kind:'work',row,part,anchor:''}})));
function assert(ok:unknown,why='assertion failed'):asserts ok {if(!ok)throw Error(why)}
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
function planned(file:any,schema=SCHEMA) {const manifest=trustedFacts(file,ARTIFACT);const p=planApplication({manifest,userId:OWNER,jobId:JOB,employer:'Synthetic hiring',schema,artifact:ARTIFACT,now:0});return{manifest,fields:p.ready?p.fields:[],p};}
async function engineHash(fields:any[],manifest:any,schema=SCHEMA){return hashApplyPayload({user_id:OWNER,posting:JOB,destination:'https://synthetic.test/apply',fields,resume:ARTIFACT.sha256,schema_hash:await hashApplyPayload(schema),page_field_names:[],sources:approvalSources(fields,manifest)});}
async function fixture(){
 const original=planned({user_id:OWNER,answers:{work_history:SOURCE},saved:{}});assert(original.fields.length===4,'initial two-row plan control');
 const approval=await engineHash(original.fields,original.manifest);
 const result=await prepare({url:'https://synthetic.test/apply',factsPath:'unit-facts',resumePath:'unit-resume',account:{epoch:1,version:1},now:0,runEngine:async()=>({result:{state:'not_submitted',reason:'dry_run'},evidence:{approval_hash:approval,fields:original.fields,sources:{[SOURCE.factId]:original.manifest.byFactId[SOURCE.factId]},trust:{quarantine_version:original.manifest.version,manifest_hash:original.manifest.hash},payload:{user_id:OWNER,posting:JOB,company:'Synthetic hiring',destination:'https://synthetic.test/apply',resume:ARTIFACT,page_fields:{},schema_hash:await hashApplyPayload(SCHEMA)}}})});
 assert(result.ready);return{payload:result.payload,original,approval};
}
Deno.test('row replay: prepare binds original structured source and exact schema hash',async()=>{
 const{payload}=await fixture();assert((payload as any).schema_hash===await hashApplyPayload(SCHEMA),'schema identity was dropped');
 for(const f of payload.fields)assert(f.source?.table==='answers'&&f.source.key==='work_history'&&f.source.value===SOURCE.value,'original structured source was dropped');
});
Deno.test('row replay: same-label two rows round trip without collapse and keep original manifest and engine approval',async()=>{
 const{payload,original,approval}=await fixture();const rebuilt=factsFromPayload(payload);const replay=planned(rebuilt);
 assert(replay.fields.length===4,'replay lost structured rows');assert(JSON.stringify(replay.fields)===JSON.stringify(original.fields),'row bindings or values changed');
 assert(replay.manifest.hash===original.manifest.hash,'original source manifest must reproduce');assert(await engineHash(replay.fields,replay.manifest)===approval,'engine approval must reproduce');
 assert((rebuilt as any).answers.work_history.value===SOURCE.value&&Object.keys(rebuilt.saved).length===0,'rows must not become ambiguous label answers');
});
Deno.test('row replay: real submission contract admits only the exact source JSON row and property',async()=>{
 const{original}=await fixture();const call=(schema:any,manifest=original.manifest)=>planApplication({manifest,userId:OWNER,jobId:JOB,employer:'Synthetic hiring',schema,artifact:ARTIFACT,now:0});
 const clean=call(SCHEMA);assert(clean.ready&&clean.fields.length===4,JSON.stringify(clean));
 // A different trusted fact cannot lend its id to an otherwise valid row value.
 const forged=clone(original.manifest);forged.byFactId[SOURCE.factId].key='school';assert(!call(SCHEMA,forged).ready,'wrong original table/key admitted');
 const wrong=clone(original.manifest);wrong.byFactId[SOURCE.factId].value='[]';assert(!call(SCHEMA,wrong).ready,'a stale cached JSON source admitted');
 const broken=clone(SCHEMA);broken[0].section.row=0;assert(!call(broken).ready,'unbound row admitted');
 const options=clone(SCHEMA);options[0].options=[{label:'Different employer',value:'wrong'}] as any;assert(!call(options).ready,'nonmatching employer option admitted');
 const fields=clone(original.fields);fields[1].value='Associate';const rejected=contractFill({schema:SCHEMA,manifest:original.manifest,resume:ARTIFACT,plan:{fill:fields,needs:[],identity:[],ambiguous:[]}});assert(rejected.asks.length===1,'a value from the wrong source row/property admitted');
});
Deno.test('row replay: conflicting source coordinates or original values are refused',async()=>{
 const{payload}=await fixture();for(const change of [(f:any)=>f.source.value='[]',(f:any)=>f.source.key='school',(f:any)=>f.source.table='invalid']){
  const bad=clone(payload);bad.fields[1].source??={table:'answers',key:'work_history',value:SOURCE.value};change(bad.fields[1]);let stopped=false;try{factsFromPayload(bad)}catch{stopped=true}assert(stopped,'conflicting or malformed source binding accepted');
 }
});
Deno.test('row replay: schema, options, source and answer changes stay bound to approval hash',async()=>{
 const{payload}=await fixture();const hash=await hashApplyPayload(payload);for(const change of [(p:any)=>p.schema_hash='0'.repeat(64),(p:any)=>p.fields[0].value='Changed',(p:any)=>p.fields[0].source.value='[]']){const changed=clone(payload);change(changed);assert(await hashApplyPayload(changed)!==hash,'queue approval omitted changed data');}
 const options=clone(SCHEMA);options[0].options=[{label:'Different employer',value:'x'}] as any;assert(await hashApplyPayload(options)!==(payload as any).schema_hash,'option/schema changes must require approval again');
});
Deno.test('row replay: unchanged approved worker run reproduces fields; changed live schema stops at engine approval',async()=>{
 const{payload,approval}=await fixture();for(const changed of [false,true]){let facts:any,observed='',finish:any;const schema=clone(SCHEMA);if(changed)schema[0].label='Changed company label';
  await runApproved({claim:async()=>[{id:'SYNTHETIC-job',lease_token:'SYNTHETIC-lease',url:'https://synthetic.test/apply',payload}],finish:async(_id,_lease,state,evidence)=>{finish={state,evidence}},resumeFor:async()=>({path:'synthetic.pdf',sha256:ARTIFACT.sha256}),writeFacts:async(_job,f)=>{facts=f;return'synthetic.json'},runEngine:async(args)=>{const replay=planned(facts,schema);observed=await engineHash(replay.fields,replay.manifest,schema);assert(args[args.indexOf('--approved')+1]===approval,'worker lost original engine approval');return{result:{state:observed===approval?'confirmed':'not_submitted',reason:observed===approval?'synthetic-only fixture':'APPROVED_APPLICATION_CHANGED'},evidence:{}}}});
  assert(finish.state===(changed?'not_submitted':'confirmed'),JSON.stringify(finish));
 }
});
Deno.test('row replay: changed queued value, source event or schema stops before the engine starts',async()=>{
 const{payload}=await fixture();for(const change of [(p:any)=>p.fields[0].value='Changed employer',(p:any)=>p.fields[0].confirmation_event_id='changed-event',(p:any)=>p.schema_hash='0'.repeat(64)]){
  const bad=clone(payload);change(bad);let calls=0,finish:any;await runApproved({claim:async()=>[{id:'SYNTHETIC-job',lease_token:'SYNTHETIC-lease',url:'https://synthetic.test/apply',payload:bad}],finish:async(_id,_lease,state,evidence)=>{finish={state,evidence}},resumeFor:async()=>({path:'synthetic.pdf',sha256:ARTIFACT.sha256}),writeFacts:async()=>{throw Error('should not write facts')},runEngine:async()=>{calls++;return null}});
  assert(calls===0&&finish.state==='not_submitted'&&finish.evidence.reason==='APPROVED_APPLICATION_CHANGED',JSON.stringify(finish));
 }
});
