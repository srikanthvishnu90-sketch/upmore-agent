// Default-off actual-entry integration. No provider/test-result adapter here.
import {CareerInterviewJourney as J} from './router_core.career.js';
import {toInterviewContextV1,interviewContextDigestV1} from '../../../packages/career-contracts/interview-context-compat-v1.ts';
import {createCareerPersistence} from './career_persistence.js';
const clone=(v:any)=>JSON.parse(JSON.stringify(v));
const canonical=(x:any):string=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
async function sha(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const uuid=(v:any)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const json=(cors:any,body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json'}});
function command(raw:any){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('invalid_journey_command');
 const fields:Record<string,string[]>={start:['available_minutes','target_ref','resume_ref','mode'],submit_answer:['kind'],pause:[],resume:[],stop:[],build_pack:[],artifact_readback:['receipt_id'],status:[],select_question:['question_id'],run_code:[]};
 if(!Object.hasOwn(fields,raw.type)||Object.keys(raw).some(k=>k!=='type'&&!fields[raw.type].includes(k)))throw Error('invalid_journey_command');
 if(raw.type==='artifact_readback'&&!uuid(raw.receipt_id))throw Error('invalid_journey_command');
 for(const key of ['target_ref','resume_ref'])if(raw[key]!==undefined){const r=raw[key];if(!r||typeof r.id!=='string'||r.id.length>160||!Number.isSafeInteger(r.version)||r.version<0||Object.keys(r).some(k=>!['id','version'].includes(k)))throw Error('invalid_journey_command');}
 if(raw.available_minutes!==undefined&&(!Number.isInteger(raw.available_minutes)||raw.available_minutes<0||raw.available_minutes>1440))throw Error('invalid_journey_command');
 if(raw.mode!==undefined&&!['coaching','mock'].includes(raw.mode))throw Error('invalid_journey_command');
 if(raw.kind!==undefined&&!['initial','revision','practice','transfer'].includes(raw.kind))throw Error('invalid_journey_command');
 if(raw.question_id!==undefined&&(typeof raw.question_id!=='string'||raw.question_id.length>80))throw Error('invalid_journey_command');
 return clone(raw);
}
async function call(admin:any,name:string,args:any){const r=await admin.rpc(name,args);if(r.error)throw Error('storage_unavailable');if(!r.data||r.data.error)throw Error(r.data?.error||'storage_unavailable');return clone(r.data);}
function meta(state:any){return {version:'career_interview_entry/v1',stage:state.stage,status:state.status,revision:state.revision,assessment_status:'not_wired',actual_model_quality:'NOT_RUN'};}
export async function interviewTurn({admin,userId,threadId,turnKey,message,raw,images,cors,note}:any){
 let cmd;try{cmd=command(raw);if(images.length)throw Error('invalid_journey_command');}catch{return json(cors,{error:'invalid_journey_command'},400);}
 if(Deno.env.get('CAREER_JOURNEY_MODE')!=='interview_v1')return json(cors,{error:'not_wired',reply:'Interview preparation is not enabled on this host.',action:null},503);
 const requestHash=await sha(canonical({version:'career_interview_request/v1',message,command:cmd}));
 try{
  const p=createCareerPersistence(admin),loaded=clone(await p.load({userId,threadId,turnKey,requestHash}));
  if(loaded.replay){const current=await call(admin,'career_journey_context_read_v1',{p_user:userId,p_thread:threadId});if(canonical(current.context.binding)!==canonical(loaded.replay.meta?.career_journey?.context_binding))throw Error('journey_context_unavailable');return json(cors,loaded.replay);}
  const read=await call(admin,'career_journey_context_read_v1',{p_user:userId,p_thread:threadId});
  const context=read.context;
  if(context.owner_id!==userId||context.thread_id!==threadId||context.binding.account_version!==loaded.accountVersion||context.binding.thread_revision!==loaded.revision||context.binding.epoch!==(loaded.account.epoch||0))throw Error('journey_context_unavailable');
  const previous=loaded.snapshot?.stores?.interviewJourney||null;
  if(previous){J.validateState(previous);if(previous.owner_id!==userId||previous.thread_id!==threadId||previous.epoch!==context.binding.epoch)throw Error('journey_context_unavailable');}
  if(cmd.type==='status')return json(cors,{thread_id:threadId,turn_key:turnKey,reply:previous?'Your saved interview checkpoint is available. Assessment is not wired on this host.':'No interview journey is saved.',action:null,reminders:[],read_only:true,meta:{career:true,career_journey:previous?meta(previous):null}});
  if(read.paused)throw Error('journey_account_paused');
  const selection=previous?{...(previous.target_ref?{target_ref:previous.target_ref}:{}),...(previous.resume_ref?{resume_ref:previous.resume_ref}:{})}:cmd;
  const projected=await toInterviewContextV1(context,selection),snapshot=clone(projected.snapshot);
  // Availability is derived from both canonical permission and this concrete
  // owned artifact backend. The context-only adapter remains fail-closed.
  if(context.capabilities.some((c:any)=>c.capability_id==='career.create_draft'&&c.availability==='available')){
   snapshot.capabilities=snapshot.capabilities.filter((c:any)=>c.id!=='interview.local_draft.v1');
   snapshot.capabilities.push({id:'interview.local_draft.v1',status:'available',version:1,reason:'Owned atomic UTF-8 artifact backend'});
  }
  if(cmd.type==='artifact_readback'){
   const proof=await call(admin,'career_journey_readback_v1',{p_user:userId,p_thread:threadId,p_receipt:cmd.receipt_id});
   snapshot.receipts.push(proof.receipt);snapshot.artifacts.push(proof.artifact);
  }
  const event:any={...cmd,id:turnKey,at:new Date().toISOString()};
  if(cmd.type==='start')event.journey_id='interview-'+crypto.randomUUID();
  if(cmd.type==='submit_answer')event.text=message;
  const plan=J.planInterviewTurn({snapshot,state:previous,event}),state=plan.next_state;
  const next=clone(context);next.binding.account_version++;next.binding.thread_revision++;next.captured_at=event.at;next.binding.context_sha256=await interviewContextDigestV1(next);
  let artifact:any=null;const actions=[];
  for(const proposal of plan.proposed_actions){
   const canonical_args=canonical(proposal.args);if(await sha(canonical_args)!==proposal.input_digest)throw Error('proposal_digest_mismatch');
   actions.push({proposal,canonical_args});
   if(proposal.type==='create_draft'){
    const {pack,markdown,manifest}=proposal.args;
    if(pack.owner_id!==userId||pack.thread_id!==threadId||pack.journey_id!==state.journey_id||pack.epoch!==context.binding.epoch||manifest.sha256!==await sha(markdown)||manifest.structured_sha256!==await sha(canonical(pack))||manifest.byte_length!==new TextEncoder().encode(markdown).length||manifest.byte_length>262144||manifest.mime_type!=='text/markdown; charset=utf-8'||manifest.encoding!=='utf-8')throw Error('artifact_integrity_failed');
    artifact={id:crypto.randomUUID(),version:1,owner_id:userId,thread_id:threadId,journey_id:state.journey_id,journey_revision:state.revision,epoch:state.epoch,target_ref:state.target_ref,resume_ref:state.resume_ref,action_id:proposal.action_id,input_digest:proposal.input_digest,binding:next.binding,content:markdown,...manifest};
   }
   // No coach/read-source proposal can be admitted by this provider-disabled
   // entry. Their capabilities remain unavailable and B retains exact answers.
   if(!['ask_question','create_draft'].includes(proposal.type))throw Error('unsupported_host_action');
  }
  const savedSnapshot=clone(loaded.snapshot||{v:1,scope:{userId},stores:{}});savedSnapshot.stores=savedSnapshot.stores||{};savedSnapshot.stores.interviewJourney=state;
  const question=plan.proposed_actions.find((a:any)=>a.type==='ask_question')?.args.text;
  let text=plan.reply_plan.text||'Your exact answer is saved. Assessment is not wired on this host.';
  if(cmd.type==='submit_answer')text='Your exact answer is saved without an assessment. Generation and independent checking are not wired on this host.';
  const response={thread_id:threadId,turn_key:turnKey,reply:[note,text,question].filter(Boolean).join('\n'),action:null,reminders:[],meta:{career:true,career_journey:{...meta(state),context_binding:next.binding}},...(artifact?{artifact:{id:artifact.id,sha256:artifact.sha256,byte_length:artifact.byte_length,partial:state.checkpoint.pending_artifact.partial,download_path:'/career/artifacts/'+artifact.id}}:{})};
  const saved=await call(admin,'career_journey_turn_commit_v1',{p_base:{p_user:userId,p_thread:threadId,p_key:turnKey,p_hash:requestHash,p_revision:loaded.revision,p_account_version:loaded.accountVersion,p_snapshot:savedSnapshot,p_patch:{},p_input:message,p_response:response},p_context:next,p_actions:actions,p_artifact:artifact});
  return json(cors,saved.response);
 }catch(e){const reason=e instanceof Error?e.message:'storage_unavailable';const conflict=['turn_key_conflict','revision_conflict','privacy_epoch_changed','journey_context_unavailable'].includes(reason);return json(cors,{error:reason,reply:'I could not confirm a current saved interview result. Reload the owned conversation; no provider call was made.',action:null,turn_key:turnKey},conflict?409:503);}
}
export async function interviewArtifact({admin,userId,id,cors}:any){
 if(Deno.env.get('CAREER_JOURNEY_MODE')!=='interview_v1')return json(cors,{error:'not_wired'},503);
 try{const r=await call(admin,'career_journey_artifact_open_v1',{p_user:userId,p_artifact:id});const a=r.artifact;
  if(a.owner_id!==userId||await sha(a.content)!==a.sha256||new TextEncoder().encode(a.content).length!==a.byte_length)throw Error('artifact_unavailable');
  return new Response(a.content,{headers:{...cors,'content-type':'text/markdown; charset=utf-8','content-disposition':'attachment; filename="interview-preparation.md"','cache-control':'no-store','x-upmore-readback-receipt':r.receipt.id}});
 }catch{return json(cors,{error:'artifact_unavailable'},404);}
}
