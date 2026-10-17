// Typed, user-declared evidence only. Does not infer personal facts from chat,
// resumes or model output; host identity, stamps and permissions are not inputs
// supplied by the HTTP caller. No IO and no execution authority.
import {validateJourneyContractV1} from './journey-contract-v1.ts';
import {interviewContextDigestV1} from './interview-context-compat-v1.ts';
const copy=(v:any)=>JSON.parse(JSON.stringify(v));
async function sha(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function writeInterviewContextV1(input:any,command:any,host:any){
 const {ownerId,threadId,accountVersion,revision,epoch,turnKey,at,text}=host;
 if(command.actual!==true||!/^[-A-Za-z0-9_]{1,64}$/.test(command.id||'')||typeof text!=='string'||!text.trim()||text.length>4000)throw Error('invalid_context_write');
 if(input){
  if(!validateJourneyContractV1('CareerContextSnapshotV1',input).ok||input.owner_id!==ownerId||input.thread_id!==threadId||input.binding.account_version!==accountVersion||input.binding.thread_revision!==revision||input.binding.epoch!==epoch||await interviewContextDigestV1(input)!==input.binding.context_sha256)throw Error('journey_context_unavailable');
 }
 const c=input?copy(input):{contract_version:'career_journey_context/v1',owner_id:ownerId,thread_id:threadId,captured_at:at,binding:{epoch,account_version:accountVersion,thread_revision:revision,context_sha256:'0'.repeat(64)},facts:[],sources:[],dialogue:[],current_draft:null,goals:[],pending_asks:[],invalidations:[],tool_status:[],receipts:[],artifacts:[],assessments:[],capabilities:[{capability_id:'career.ask_question',availability:'available',reason:'Owned interview question host'},{capability_id:'career.create_draft',availability:'available',reason:'Owned artifact storage required at execution'},{capability_id:'career.coach_answer',availability:'available',reason:'Separate host configuration and paired budget admission required'}]};
 const old=c.facts.find((f:any)=>f.id===command.id);
 if(command.expected_version!==(old?.item_version??null))throw Error('item_version_conflict');
 const version=old?old.item_version+1:0,stamp={account_version:accountVersion+1,event_ordinal:0};
 const scope=old?.scope||{kind:'thread',owner_id:ownerId,thread_id:threadId};
 if(scope.owner_id!==ownerId||scope.kind==='thread'&&scope.thread_id!==threadId)throw Error('invalid_context_write');
 const provenance={kind:'user_report',record_id:'typed-fact:'+command.id,revision:version,reference:'Explicit actual statement for this interview journey',trust:'user_reported',observed_at:at};
 const base={id:command.id,item_version:version,scope,provenance,created:old?.created||stamp,effective:stamp,freshness:'current'};
 let fact:any,source:any=null,affected=[command.id];
 if(command.type==='save_resume'){
  if(old&&old.kind!=='resume')throw Error('item_kind_conflict');
  const sourceId=old?.source_refs?.[0]||'resume-source:'+command.id,previous=c.sources.find((s:any)=>s.id===sourceId);
  source={...base,id:sourceId,item_version:previous?previous.item_version+1:0,created:previous?.created||stamp,source_kind:'user_pasted_text',content:text,canonical_url:null,retrieved_at:at,availability:'available',source_sha256:await sha(text)};
  source.provenance={...provenance,kind:'user_pasted',record_id:sourceId,revision:source.item_version};
  fact={...base,kind:'resume',status:old?'corrected':'active',value:'User-selected resume',source_refs:[sourceId],provenance:source.provenance};
  c.sources=c.sources.filter((s:any)=>s.id!==sourceId);c.sources.push(source);affected.push(sourceId);
 }else{
  if(!['project','experience','target'].includes(command.kind)||old&&old.kind!==command.kind)throw Error('invalid_context_write');
  fact={...base,kind:command.kind,status:old?'corrected':'active',value:text,source_refs:[]};
  if(command.kind==='target'){
   const previous=c.facts.filter((f:any)=>f.provenance.record_id===provenance.record_id&&f.id!==command.id);affected.push(...previous.map((f:any)=>f.id));
   c.facts=c.facts.filter((f:any)=>!previous.includes(f));
   for(const [key,value]of Object.entries(command.classification||{})){
    if(!['role_family','level','company','stage'].includes(key)||typeof value!=='string'||!value.trim()||value.length>160)throw Error('invalid_context_write');
    const id=command.id+':'+key,prior=previous.find((f:any)=>f.id===id);
    c.facts.push({...base,id,item_version:prior?prior.item_version+1:0,created:prior?.created||stamp,kind:'target_'+key,status:prior?'corrected':'active',value,source_refs:[]});affected.push(id);
   }
  }else if(command.classification!==undefined)throw Error('invalid_context_write');
 }
 c.facts=c.facts.filter((f:any)=>f.id!==command.id);c.facts.push(fact);
 const invalidation={id:'typed-context:'+turnKey,item_version:0,scope:{kind:'thread',owner_id:ownerId,thread_id:threadId},provenance:{kind:'host_state',record_id:turnKey,revision:accountVersion+1,reference:'Typed evidence write',trust:'host_authoritative',observed_at:at},created:stamp,effective:stamp,freshness:'current',reason:source?'source_superseded':'fact_corrected',target_ids:[...new Set(affected)],effect:'replace',dependency_impact:'targets_and_dependents'};
 c.invalidations.push(invalidation);c.binding={epoch,account_version:accountVersion+1,thread_revision:revision+1,context_sha256:'0'.repeat(64)};c.captured_at=at;c.binding.context_sha256=await interviewContextDigestV1(c);
 if(!validateJourneyContractV1('CareerContextSnapshotV1',c).ok)throw Error('invalid_written_context');
 return {context:c,ref:{id:fact.id,version:fact.item_version},invalidation_id:invalidation.id,source_ref:source?{id:source.id,version:source.item_version}:null};
}
