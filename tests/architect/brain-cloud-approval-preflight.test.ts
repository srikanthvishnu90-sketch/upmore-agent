// Synthetic actual prepare -> queued payload -> cloud worker -> canonical engine replay.
import { prepare } from '../../workers/career-browser/approve-first.ts';
import { runCloudJob } from '../../workers/career-cloud/worker.ts';
import { applicationApprovalHash, planApplication, trustedFacts } from '../../scripts/apply.ts';
import { hashApplyPayload } from '../../supabase/functions/_shared/career_apply_store.ts';
const assert=(ok:unknown,why='assertion failed')=>{if(!ok)throw Error(why)};
const OWNER='SYN-CLOUD-APPROVAL',JOB='lever:synthetic:7',URL='https://synthetic.test/apply';
const bytes=new TextEncoder().encode('%PDF-1.4 SYNTHETIC ONLY');
const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
const artifact={filename:'synthetic.pdf',sha256:sha};
const schema=[{name:'email',label:'Email',type:'email',required:true,options:[]}];
const file={user_id:OWNER,answers:{email:{value:'synthetic@example.test',factId:'SYN-EMAIL',confirmed:true,provenance:'owner stated this email',confirmation_event_id:'SYN-EVENT'}},saved:{}};
function planned(f:any){const manifest=trustedFacts(f,artifact);const p=planApplication({manifest,userId:OWNER,jobId:JOB,employer:'Synthetic',schema,artifact,now:0});assert(p.ready,'synthetic positive did not plan');return{manifest,fields:(p as any).fields};}
async function identity(fields:any[],manifest:any){return await applicationApprovalHash({userId:OWNER,posting:JOB,destination:URL,fields,resumeSha256:sha,schemaHash:await hashApplyPayload(schema),pageFieldNames:[],manifest});}
async function fixture(){const original=planned(file),approval=await identity(original.fields,original.manifest);const p=await prepare({url:URL,factsPath:'synthetic.json',resumePath:'synthetic.pdf',account:{epoch:1,version:1},now:0,runEngine:async()=>({result:{state:'not_submitted',reason:'dry_run'},evidence:{approval_hash:approval,fields:original.fields,sources:original.manifest.byFactId,replay_sources:Object.values(original.manifest.byFactId),trust:{quarantine_version:original.manifest.version,manifest_hash:original.manifest.hash},payload:{user_id:OWNER,posting:JOB,company:'Synthetic',destination:URL,resume:artifact,page_fields:{},schema_hash:await hashApplyPayload(schema)}}})});assert(p.ready);return(p as any).payload;}
async function drive(payload:any){const effects={resume:0,engine:0};let final:any;const job={id:'SYN-JOB',lease_token:'SYN-LEASE',user_id:OWNER,company:'Synthetic',url:URL,payload};
 const result=await runCloudJob(job,{log:()=>{},queue:{claim:async()=>[],gatePresent:async()=>true,resume:async()=>{effects.resume++;return{filename:artifact.filename,sha256:sha,b64:btoa(String.fromCharCode(...bytes))}},finish:async(_j,state,evidence,outcome)=>{final={state,evidence,outcome}}},runEngine:async args=>{effects.engine++;const facts=JSON.parse(await Deno.readTextFile(args[args.indexOf('--facts')+1]));const replay=planned(facts),actual=await identity(replay.fields,replay.manifest);return{result:{state:actual===payload.engine_approval?'confirmed':'not_submitted',reason:actual===payload.engine_approval?'synthetic-only':'APPROVED_APPLICATION_CHANGED'},evidence:{}}}});return{effects,final,result};}
Deno.test('cloud approval binding: unchanged modern approval reaches canonical replay once',async()=>{const r=await drive(await fixture());assert(r.final.state==='confirmed','positive control blocked');assert(r.effects.resume===1&&r.effects.engine===1,'positive control did not reach engine exactly once');});
for(const [name,mutate]of [
 ['printed answer',(p:any)=>p.fields[0].value='changed-after-approval@example.test'],
 ['original source',(p:any)=>{p.fields[0].source.value='changed@example.test';p.replay_sources.find((s:any)=>s.key==='email').value='changed@example.test'}],
 ['manifest',(p:any)=>p.manifest_hash='0'.repeat(64)],
 ['schema',(p:any)=>p.schema_hash='0'.repeat(64)],
 ['schema downgrade',(p:any)=>delete p.schema_hash],
]as const)Deno.test('cloud approval binding: changed '+name+' stops before resume, file writes or engine',async()=>{const p=await fixture();mutate(p);const r=await drive(p);assert(r.final.state==='not_submitted','changed application was submitted');assert(r.effects.resume===0&&r.effects.engine===0,'changed application crossed pre-effects boundary');if(name==='printed answer')assert(r.final.evidence.reason==='APPROVED_APPLICATION_CHANGED','printed-answer tamper lost canonical refusal');});
