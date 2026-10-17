// Owner-authorized projection refresh. Never changes fact values, versions,
// provenance/stamps or privacy epoch, and never grants a model dispatch.
import {validateJourneyContractV1} from '../../../packages/career-contracts/journey-contract-v1.ts';
import {interviewContextDigestV1} from '../../../packages/career-contracts/interview-context-compat-v1.ts';
const copy=(x:any)=>JSON.parse(JSON.stringify(x));
const canonical=(x:any):string=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
async function sha(x:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function call(admin:any,name:string,args:any){const r=await admin.rpc(name,args);if(r.error||!r.data)throw Error('storage_unavailable');return copy(r.data);}
export async function refreshInterviewContext(admin:any,userId:string,threadId:string){
 for(let attempt=0;attempt<3;attempt++){
  const loaded=await call(admin,'career_journey_context_refresh_load_v1',{p_user:userId,p_thread:threadId});if(loaded.error)throw Error(loaded.error);
  const old=loaded.context;if(!old)return {context:null,pending_invalidation_ids:[]};
  if(!validateJourneyContractV1('CareerContextSnapshotV1',old).ok||old.owner_id!==userId||old.thread_id!==threadId||await interviewContextDigestV1(old)!==old.binding.context_sha256)throw Error('journey_context_unavailable');
  if(old.binding.epoch!==loaded.binding.epoch)throw Error('privacy_epoch_changed');
  const sameClock=['epoch','account_version','thread_revision'].every(k=>old.binding[k]===loaded.binding[k]),cursor=loaded.cursor;
  if(cursor?.context_sha256===old.binding.context_sha256&&sameClock&&cursor.thread_sha===loaded.basis.thread_sha&&cursor.account_sha===loaded.basis.account_sha)return {context:old,pending_invalidation_ids:cursor.pending_invalidation_ids||[]};
  const unknownBasis=!cursor&&!sameClock,threadChanged=unknownBasis||!!cursor&&cursor.thread_sha!==loaded.basis.thread_sha,accountChanged=unknownBasis||!!cursor&&cursor.account_sha!==loaded.basis.account_sha;
  const next=copy(old),affected:string[]=[];
  const stale=(item:any)=>{if(item?.freshness==='current'&&(item.scope.kind==='account'?accountChanged:threadChanged)){item.freshness='stale';affected.push(item.id);}};
  for(const key of ['facts','sources','dialogue','goals','pending_asks','tool_status','receipts','artifacts','assessments'])next[key].forEach(stale);if(next.current_draft)stale(next.current_draft);
  const at=new Date().toISOString();
  if(affected.length){
   const id='authority:'+await sha(canonical({previous:old.binding.context_sha256,basis:loaded.basis,binding:loaded.binding})),stamp={account_version:loaded.binding.account_version,event_ordinal:0};
   next.invalidations.push({id,item_version:0,scope:{kind:'thread',owner_id:userId,thread_id:threadId},provenance:{kind:'host_state',record_id:id,revision:loaded.binding.account_version,reference:'Owned semantic source authority changed; reconfirm affected evidence.',trust:'host_authoritative',observed_at:at},created:stamp,effective:stamp,freshness:'current',reason:'fact_corrected',target_ids:[...new Set(affected)],effect:'replace',dependency_impact:'targets_and_dependents'});
  }
  next.binding={...loaded.binding,context_sha256:'0'.repeat(64)};next.captured_at=at;next.binding.context_sha256=await interviewContextDigestV1(next);
  if(!validateJourneyContractV1('CareerContextSnapshotV1',next).ok)throw Error('journey_context_unavailable');
  const saved=await call(admin,'career_journey_context_refresh_commit_v1',{p_user:userId,p_thread:threadId,p_expected_hash:old.binding.context_sha256,p_binding:loaded.binding,p_basis:loaded.basis,p_context:next});
  if(saved.error==='revision_conflict')continue;if(saved.error)throw Error(saved.error);
  return {context:saved.context,pending_invalidation_ids:saved.pending_invalidation_ids||[]};
 }
 throw Error('revision_conflict');
}
