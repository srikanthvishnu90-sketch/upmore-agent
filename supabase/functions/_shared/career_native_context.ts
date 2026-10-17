// Owned host projection for native text. Models never author these facts,
// intent, source permissions, logical stamps or the proposed host snapshot.
import {redactIdentity} from './identity_redact.ts';
import {groundedContext} from './career_model_grounded.ts';
import {validateJourneyContractV1} from '../../../packages/career-contracts/journey-contract-v1.ts';
import {interviewContextDigestV1} from '../../../packages/career-contracts/interview-context-compat-v1.ts';
export const nativeCanonical=(x:any):string=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(nativeCanonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+nativeCanonical(x[k])).join(',')+'}';
export async function nativeSha(x:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const copy=(x:any)=>JSON.parse(JSON.stringify(x));
export function nativeInput(raw:any,normalized:string){
 const original=typeof raw==='string'?raw:normalized;if(original.length>4000)throw Error('native_input_too_large');
 const transformations:string[]=[],red=redactIdentity(original);let text=red.text;
 if(red.removed.length)transformations.push('identity_redaction');
 const replace=(pattern:RegExp,value:string,label:string)=>{const next=text.replace(pattern,value);if(next!==text)transformations.push(label);text=next;};
 replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g,'[credential omitted]','credential_redaction');
 replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[contact omitted]','contact_redaction');
 replace(/[\x00-\x08\x0b-\x1f\x7f]/g,' ','control_character_sanitization');
 return {original,text,transformations};
}
export async function nativeRequest(d:any,read:any,previous:any){
 const owner=d.ctx.userId,thread=d.ctx.threadId,epoch=d.loaded.account.epoch||0,at=new Date().toISOString(),version=d.loaded.accountVersion+1;
 if(d.ctx.userId!==owner||d.ctx.threadId!==thread||d.loaded.snapshot?.scope?.userId&&d.loaded.snapshot.scope.userId!==owner)throw Error('owned_context_required');
 if(previous&&(!validateJourneyContractV1('CareerContextSnapshotV1',previous).ok||previous.owner_id!==owner||previous.thread_id!==thread||previous.binding.epoch!==epoch||await interviewContextDigestV1(previous)!==previous.binding.context_sha256))throw Error('native_context_unavailable');
 const input=nativeInput(d.rawMessage,d.message),view=copy(groundedContext(d,read));view.current_request.text=input.text;
 const intent={version:'career_native_intent/v1',user_text:input.text,user_text_sha256:await nativeSha(input.text),original_input_sha256:await nativeSha(input.original),normalized_user_text:nativeInput(d.message,d.message).text,transformations:input.transformations,host_intent:typeof d.out.intent==='string'?d.out.intent:'career_fallback',host_handler:d.out.handler||null,capability_id:'career.advisory_response',source:'owned_deterministic_host',context_phase:'proposed_for_this_turn',expected_binding:{owner_id:owner,thread_id:thread,account_version:d.loaded.accountVersion,thread_revision:d.loaded.revision,epoch}};
 const scope={kind:'thread',owner_id:owner,thread_id:thread},stamp={account_version:version,event_ordinal:0};
 const c:any={contract_version:'career_journey_context/v1',owner_id:owner,thread_id:thread,captured_at:at,binding:{epoch,account_version:version,thread_revision:d.loaded.revision+1,context_sha256:'0'.repeat(64)},facts:[],sources:[],dialogue:[],current_draft:null,goals:[],pending_asks:[],invalidations:copy(previous?.invalidations||[]),tool_status:[],receipts:[],artifacts:[],assessments:[],capabilities:[{capability_id:'career.advisory_response',availability:'available',reason:'Separate server configuration and both paired budget admissions are required; advisory only'}]};
 const base=(id:string,old:any,provenance:any)=>({id,item_version:old?.item_version||0,scope,provenance:old?.provenance||provenance,created:old?.created||stamp,effective:old?.effective||stamp,freshness:'current'});
 const provenance=(id:string,kind='user_report',trust='user_reported',reference='Owned host user-reported evidence')=>({kind,record_id:id,revision:version,reference,trust,observed_at:at});
 const changed:string[]=[];
 for(const f of view.facts){
  const id='native-fact:'+(await nativeSha(nativeCanonical({kind:f.kind,ref:f.source.ref,original:f.source.original_id}))).slice(0,32),old=previous?.facts.find((x:any)=>x.id===id),same=old&&old.value===f.text&&['active','corrected'].includes(old.status)&&['active','corrected'].includes(f.status);
  const row:any={...base(id,same?old:null,provenance(id)),kind:f.kind,status:f.status==='disputed'?'disputed':same?old.status:old?'corrected':'active',value:f.text,source_refs:[]};
  if(old&&!same){row.item_version=old.item_version+1;row.created=old.created;changed.push(id);}c.facts.push(row);f.canonical_ref={id,version:row.item_version};
 }
 for(const old of previous?.facts||[])if(!c.facts.some((x:any)=>x.id===old.id)){
  const row=copy(old);delete row.value;delete row.provenance.excerpt;row.status='withdrawn';row.freshness='revoked';
  if(old.status!=='withdrawn'){row.item_version++;row.effective=stamp;changed.push(row.id);}c.facts.push(row);
 }
 for(const [i,s]of view.untrusted_sources.entries()){
  const id='native-source:'+i,content=nativeCanonical(s.content);if(content.length>12000)throw Error('native_context_too_large');
  const old=previous?.sources.find((x:any)=>x.id===id),same=old?.content===content;
  c.sources.push({...base(id,same?old:null,provenance(id,'user_pasted','untrusted_source','Supplied posting data; not a live-verified opening or a personal fact')),item_version:old&&!same?old.item_version+1:old?.item_version||0,source_kind:'user_pasted_text',content,canonical_url:null,source_sha256:await nativeSha(content),retrieved_at:at,availability:'available'});
  if(old&&!same)changed.push(id);s.canonical_ref={id,version:c.sources.at(-1).item_version};
 }
 for(const [index,h]of view.recent_dialogue.entries()){const id='native-dialogue:'+(await nativeSha(nativeCanonical({index,user:h.user,assistant:h.assistant}))).slice(0,32);c.dialogue.push({...base(id,previous?.dialogue.find((x:any)=>x.id===id),provenance(id,'host_state','host_authoritative','Owned barrier-filtered committed dialogue observed at this fence')),user:h.user,assistant:h.assistant,dependencies:[]});}
 for(const [key,items]of [['goals',view.goals],['pending_asks',view.pending_asks]]as any){for(const text of items){const id='native-'+key+':'+(await nativeSha(text)).slice(0,32);if(c[key].some((x:any)=>x.id===id))continue;c[key].push({...base(id,previous?.[key]?.find((x:any)=>x.id===id),provenance(id,'host_state','host_authoritative','Owned current conversational goal or pending ask')),text,lifecycle:'open',dependencies:[]});}}
 if(view.current_draft){const id='native-current-draft',old=previous?.current_draft,same=old?.text===view.current_draft.text;c.current_draft={...base(id,same?old:null,provenance(id,'host_state','advisory_inference','Previously checked owned draft; not personal evidence')),item_version:old&&!same?old.item_version+1:old?.item_version||0,revision:view.current_draft.revision,text:view.current_draft.text,status:'draft_not_sent',dependencies:[]};}
 if(changed.length){const id='native-change:'+(await nativeSha(d.turnKey)).slice(0,32);c.invalidations.push({...base(id,null,provenance(id,'host_state','host_authoritative','Owned host evidence changed; prior generated claims are not current facts')),reason:'fact_corrected',target_ids:[...new Set(changed)].slice(0,32),effect:'replace',dependency_impact:'targets_and_dependents'});}
 c.binding.context_sha256=await interviewContextDigestV1(c);if(!validateJourneyContractV1('CareerContextSnapshotV1',c).ok)throw Error('invalid_native_context');
 return {version:'career_native_request/v1',intent,context:c,view};
}
