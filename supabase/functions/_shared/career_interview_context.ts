import {CareerInterviewJourney as J} from './router_core.career.js';
import {createCareerPersistence} from './career_persistence.js';
import {writeInterviewContextV1} from '../../../packages/career-contracts/interview-context-writer-v1.ts';
import {toInterviewContextV1} from '../../../packages/career-contracts/interview-context-compat-v1.ts';
import {refreshInterviewContext} from './career_interview_refresh.ts';
const clone=(x:any)=>JSON.parse(JSON.stringify(x));
const canonical=(x:any):string=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
async function sha(x:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function call(admin:any,name:string,args:any){const r=await admin.rpc(name,args);if(r.error)throw Error('storage_unavailable');if(!r.data||r.data.error)throw Error(r.data?.error||'storage_unavailable');return clone(r.data);}
const json=(cors:any,body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json'}});
export async function interviewContextTurn({admin,userId,threadId,turnKey,message,cmd,cors,note}:any){
 try{
  const refreshed=await refreshInterviewContext(admin,userId,threadId);
  const requestHash=await sha(canonical({version:'career_interview_context_write/v1',command:cmd,message})),p=createCareerPersistence(admin),loaded=clone(await p.load({userId,threadId,turnKey,requestHash}));
  if(loaded.replay){const current=await call(admin,'career_journey_context_load_v2',{p_user:userId,p_thread:threadId});if(!current.context||canonical(current.context.binding)!==canonical(loaded.replay.meta?.career_journey?.context_binding))throw Error('journey_context_unavailable');return json(cors,loaded.replay);}
  if(loaded.account.paused)throw Error('journey_account_paused');
  const read=await call(admin,'career_journey_context_load_v2',{p_user:userId,p_thread:threadId}),at=new Date().toISOString();
  const written=await writeInterviewContextV1(read.context,cmd,{ownerId:userId,threadId,accountVersion:loaded.accountVersion,revision:loaded.revision,epoch:loaded.account.epoch||0,turnKey,at,text:message});
  const savedSnapshot=clone(loaded.snapshot||{v:1,scope:{userId},stores:{}});savedSnapshot.stores=savedSnapshot.stores||{};let state=savedSnapshot.stores.interviewJourney||null;
  if(state){
   J.validateState(state);
   const eligible=(ref:any)=>ref&&written.context.facts.some((f:any)=>f.id===ref.id&&f.item_version===ref.version&&f.freshness==='current'&&['active','corrected'].includes(f.status));
   const selection={...(eligible(state.target_ref)?{target_ref:state.target_ref}:{}),...(eligible(state.resume_ref)?{resume_ref:state.resume_ref}:{}),...(cmd.type==='save_resume'?{resume_ref:written.ref}:{}),...(cmd.kind==='target'?{target_ref:written.ref}:{})};
   // This host-produced context and its explicit invalidation become visible
   // together in the same CAS transaction. No action is executed against this
   // proposed future binding before that transaction commits.
   const projected=await toInterviewContextV1(written.context,selection),snapshot=clone(projected.snapshot);
   const event:any={id:turnKey,type:'context_changed',at,invalidation_ids:snapshot.invalidations.filter((i:any)=>i.provenance.record_id===turnKey||refreshed.pending_invalidation_ids.includes(i.provenance.record_id)).map((i:any)=>i.id),...(cmd.type==='save_resume'?{resume_ref:written.ref}:{}),...(cmd.kind==='target'?{target_ref:written.ref}:{})};
   state=J.planInterviewTurn({snapshot,state,event}).next_state;savedSnapshot.stores.interviewJourney=state;
  }
  const response={thread_id:threadId,turn_key:turnKey,reply:[note,'Your explicit actual statement was saved as user-reported evidence for this interview journey. Dependent feedback is invalidated when its evidence changes. No assessment or provider call was made.'].filter(Boolean).join('\n'),action:null,reminders:[],context_ref:written.ref,meta:{career:true,career_journey:{version:'career_interview_entry/v1',stage:state?.stage||'context_only',status:state?.status||'active',assessment_status:'not_wired',actual_model_quality:'NOT_RUN',context_binding:written.context.binding}}};
  const result=await call(admin,'career_journey_context_commit_v1',{p_base:{p_user:userId,p_thread:threadId,p_key:turnKey,p_hash:requestHash,p_revision:loaded.revision,p_account_version:loaded.accountVersion,p_snapshot:savedSnapshot,p_patch:{},p_input:message,p_response:response},p_expected_context_sha:read.context?.binding.context_sha256||null,p_context:written.context});
  return json(cors,result.response);
 }catch(e){const reason=e instanceof Error?e.message:'storage_unavailable';return json(cors,{error:reason,reply:'I could not confirm a current saved context change. Nothing new was assessed.',action:null},['item_version_conflict','item_kind_conflict','turn_key_conflict','revision_conflict','privacy_epoch_changed','journey_context_unavailable'].includes(reason)?409:503);}
}
