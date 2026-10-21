// Synthetic regression: approved structured facts survive desktop/cloud replay by source identity.
import { factsFromPayload, prepare, runApproved } from '../../workers/career-browser/approve-first.ts';
import { planBatch } from '../../supabase/functions/_shared/career_apply.ts';
import { hashApplyPayload } from '../../supabase/functions/_shared/career_apply_store.ts';
import { applicationApprovalHash, approvalSources, planApplication, trustedFacts } from '../../scripts/apply.ts';
import { contractFill, planForm, trustedManifest } from '../../extension/src/apply_core.ts';
const OWNER='SYNTHETIC-row-owner', JOB='workday:synthetic.test:R1';
const ARTIFACT={filename:'synthetic.pdf',sha256:'b'.repeat(64)};
const SOURCE={value:JSON.stringify([{employer:'Synthetic Analytics',title:'Analyst',start:'2023',end:'present'},{employer:'Synthetic Retail',title:'Associate',start:'2020',end:'2022'}]),factId:'TEST-row-history',confirmed:true,provenance:'owner stated these synthetic work entries',confirmation_event_id:'evt-synthetic-work'};
const SCHEMA=[1,2].flatMap(row=>['employer','title'].map(part=>({name:`work-${row}--${part}`,label:part==='employer'?'Company':'Job title',type:'text',required:true,options:[],section:{kind:'work',row,part,anchor:''}})));
function assert(ok:unknown,why='assertion failed'):asserts ok {if(!ok)throw Error(why)}
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
function planned(file:any,schema=SCHEMA) {const manifest=trustedFacts(file,ARTIFACT);const p=planApplication({manifest,userId:OWNER,jobId:JOB,employer:'Synthetic hiring',schema,artifact:ARTIFACT,now:0});return{manifest,fields:p.ready?p.fields:[],p};}
async function engineHash(fields:any[],manifest:any,schema=SCHEMA){return applicationApprovalHash({userId:OWNER,posting:JOB,destination:'https://synthetic.test/apply',fields,resumeSha256:ARTIFACT.sha256,schemaHash:await hashApplyPayload(schema),pageFieldNames:[],manifest});}
async function fixture(extraAnswers:Record<string,unknown>={}){
 const original=planned({user_id:OWNER,answers:{work_history:SOURCE,...extraAnswers},saved:{}});assert(original.fields.length===4,'initial two-row plan control');
 const approval=await engineHash(original.fields,original.manifest);
 const result=await prepare({url:'https://synthetic.test/apply',factsPath:'unit-facts',resumePath:'unit-resume',account:{epoch:1,version:1},now:0,runEngine:async()=>({result:{state:'not_submitted',reason:'dry_run'},evidence:{approval_hash:approval,fields:original.fields,sources:{[SOURCE.factId]:original.manifest.byFactId[SOURCE.factId]},replay_sources:Object.values(original.manifest.byFactId),trust:{quarantine_version:original.manifest.version,manifest_hash:original.manifest.hash},payload:{user_id:OWNER,posting:JOB,company:'Synthetic hiring',destination:'https://synthetic.test/apply',resume:ARTIFACT,page_fields:{},schema_hash:await hashApplyPayload(SCHEMA)}}})});
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
  assert(calls===0&&finish.state==='not_submitted'&&/APPROVED_APPLICATION_CHANGED|APPROVED_MANIFEST_CHANGED|CONFLICTING_APPROVED_SOURCE/.test(finish.evidence.reason),JSON.stringify(finish));
 }
});
const profileFact=(id:string,text:string,extra:any={})=>({id,kind:'other',text,user_id:OWNER,source:'user',status:'confirmed',needs_confirmation:false,provenance:'owner stated these exact synthetic words',confirmation_event_id:'evt-'+id,...extra});
Deno.test('typed profile hook: raw owned facts reach real form planning and contract through the existing allowlist',()=>{
 const raw={user_id:OWNER,facts:[profileFact('TEST-country','My country is United States.'),profileFact('TEST-auth','I am authorized to work in the US.'),profileFact('TEST-phone','My phone is +1 202 555 0147.')]},before=JSON.stringify(raw);
 const m=trustedManifest({owner:OWNER,file:raw,rows:[],resume:null});
 assert(m.answers.country?.value==='United States'&&m.answers.work_authorization?.value==='Yes'&&m.answers.phone?.value==='+1 202 555 0147','raw profile was not projected');
 const schema=[{name:'phone',label:'Phone',type:'text',required:true,options:[]},{name:'auth',label:'Are you legally authorized to work in the United States?',type:'radio',required:true,options:[{label:'Yes',value:'Y'},{label:'No',value:'N'}]}];
 const plan=planForm({userId:OWNER,jobId:JOB,company:'Synthetic hiring',family:'greenhouse',schema,answers:m.answers,saved:m.saved,now:0,location:'New York, NY'});
 const c=contractFill({schema,plan,manifest:m,resume:null});assert(c.fill.length===2&&c.asks.length===0,'projected facts did not reach canonical form contract');assert(JSON.stringify(raw)===before,'raw bank mutated');
});
Deno.test('typed profile hook: missing evidence, quarantine and foreign context remain excluded by canonical contract',()=>{
 for(const f of [profileFact('TEST-missing','My phone is +1 202 555 0147.',{confirmation_event_id:undefined}),profileFact('F-033','My phone is +1 202 555 0147.'),profileFact('TEST-foreign','I am authorized to work in the UK.')]){
  const m=trustedManifest({owner:OWNER,file:{user_id:OWNER,facts:[f]},rows:[],resume:null});assert(Object.keys(m.answers).length===0,'unsupported raw fact promoted');assert(m.excluded.some(x=>x.factId===f.id),'projection question was not preserved');
 }
});
Deno.test('row source binding: unseen original JSON and manifest mutations stop before any effects',async()=>{
 const{payload}=await fixture();for(const change of [(p:any)=>{const rows=JSON.parse(SOURCE.value);rows[1].start='1990';for(const f of p.fields)f.source.value=JSON.stringify(rows)},(p:any)=>p.manifest_hash='0'.repeat(64)]){
  const changed=clone(payload);change(changed);let effects=0,finish:any;
  await runApproved({claim:async()=>[{id:'SYN-QUEUE',lease_token:'SYN-LEASE',url:'https://synthetic.test/apply',payload:changed}],finish:async(_id,_lease,state,evidence)=>{finish={state,evidence}},resumeFor:async()=>{effects++;return{path:'synthetic.pdf',sha256:ARTIFACT.sha256}},writeFacts:async()=>{effects++;return'synthetic.json'},runEngine:async()=>{effects++;return null}});
  assert(effects===0&&finish.state==='not_submitted','changed original source/manifest reached an effect: '+JSON.stringify(finish));
 }
});
Deno.test('typed profile hook: mixed canonical history survives projection and conflicting phone sources are both excluded',()=>{
 const file={user_id:OWNER,answers:{work_history:SOURCE},saved:{},facts:[profileFact('TEST-raw-phone','My phone is +1 202 555 0147.')]};
 const mixed=planned(file);assert(mixed.fields.length===4&&mixed.manifest.answers.phone?.value==='+1 202 555 0147','projection dropped existing history');
 const conflict=planned({...file,answers:{...file.answers,phone:{...SOURCE,factId:'TEST-canonical-phone',value:'+1 303 555 0148'}}});
 assert(conflict.fields.length===4&&!conflict.manifest.answers.phone&&conflict.manifest.conflicts.some(x=>x.key==='phone'),'mixed conflict was silently chosen');
});
Deno.test('row source binding: unused confirmed sources survive persisted replay so the full original manifest reproduces',async()=>{
 const{payload,original}=await fixture({country:{...SOURCE,factId:'TEST-unused-country',value:'United States'}});
 const rebuilt=factsFromPayload(JSON.parse(JSON.stringify(payload))),again=planned(rebuilt);
 assert(again.manifest.answers.country?.value==='United States'&&again.manifest.hash===original.manifest.hash,'full source manifest lost an unprinted source');
 assert(await engineHash(again.fields,again.manifest)===payload.engine_approval,'original approval did not reproduce with extra source');
});
Deno.test('row source binding: missing modern schema cannot downgrade to the legacy path before effects',async()=>{
 const{payload}=await fixture();for(const strip of [false,true]){
  const p=clone(payload) as any;delete p.schema_hash;if(strip){delete p.manifest_hash;delete p.quarantine_version;delete p.replay_sources;}
  let effects=0,finish:any;await runApproved({claim:async()=>[{id:'SYN-QUEUE',lease_token:'SYN-LEASE',url:'https://synthetic.test/apply',payload:p}],finish:async(_id,_lease,state,evidence)=>{finish={state,evidence}},resumeFor:async()=>{effects++;return{path:'synthetic.pdf',sha256:ARTIFACT.sha256}},writeFacts:async()=>{effects++;return'synthetic.json'},runEngine:async()=>{effects++;return null}});
  assert(effects===0&&finish.state==='not_submitted'&&finish.evidence.reason==='INVALID_APPROVED_SCHEMA','modern schema omission reached effects: '+JSON.stringify(finish));
 }
});
Deno.test('calendar producers: actual open questions preserve section month/year precision',()=>{
 for(const[format,type]of[['MM/YYYY','month'],['YYYY','year']]){
  const schema=[{name:'work-1--start',label:'From',type:'date',required:true,options:[],section:{kind:'work',row:1,part:'start',anchor:'',format}}];
  const p=planForm({userId:OWNER,jobId:JOB,company:'Synthetic hiring',family:'workday',workdayFlow:true,schema,answers:{},saved:{},now:0});assert(p.needs[0]?.type===type,'planner lost '+format+' precision');
  const manifest=trustedFacts({user_id:OWNER,answers:{work_history:SOURCE},saved:{}},ARTIFACT);
  const c=contractFill({schema,manifest,resume:ARTIFACT,plan:{fill:[{name:schema[0].name,label:'From',value:'unsupported',factId:SOURCE.factId}],needs:[],identity:[],ambiguous:[]}});assert(c.asks[0]?.type===type,'contract question lost '+format+' precision');
 }
});
Deno.test('calendar contract: a fully stated personal native date/month may use equivalent ISO without adding precision',()=>{
 for(const[type,value,want]of[['date','February 29, 2028','2028-02-29'],['month','February 2028','2028-02']]){
  const schema=[{name:'start',label:'Available start date',type,required:true,options:[]}],manifest=trustedFacts({user_id:OWNER,answers:{start_date:{...SOURCE,factId:'TEST-start',value}},saved:{}},ARTIFACT);
  const p=planForm({userId:OWNER,jobId:JOB,company:'Synthetic hiring',family:'greenhouse',schema,answers:manifest.answers,saved:manifest.saved,now:0});assert(p.fill[0]?.value===want,'planner native representation');
  const c=contractFill({schema,plan:p,manifest,resume:ARTIFACT});assert(c.fill[0]?.value===want&&c.asks.length===0,'contract lost exact calendar meaning');
  const invented=contractFill({schema,plan:{...p,fill:[{...p.fill[0],value:type==='date'?'2028-03-01':'2028-03'}]},manifest,resume:ARTIFACT});assert(invented.asks.length===1,'changed date was treated as equivalent');
 }
 const schema=[{name:'work-1--start',label:'From',type:'date',required:true,options:[],section:{kind:'work',row:1,part:'start',anchor:''}}],manifest=trustedFacts({user_id:OWNER,answers:{start_date:{...SOURCE,factId:'TEST-personal-start',value:'February 29, 2028'}},saved:{}},ARTIFACT);
 const borrowed=contractFill({schema,plan:{fill:[{name:schema[0].name,label:'From',value:'2028-02-29',factId:'TEST-personal-start'}],needs:[],identity:[],ambiguous:[]},manifest,resume:ARTIFACT});assert(borrowed.asks.length===1,'native equivalence borrowed a personal date for a work row');
});
