// Explicit context-only bridge to the unchanged B consumer at 53ae74b3.
// Input must come from the trusted effective-context projection, never client
// JSON or inherited unversioned stores. Validation does not authenticate input.
import { validateJourneyContractV1, type CareerContextSnapshotV1 } from './journey-contract-v1.ts';

const clone=(v:any)=>JSON.parse(JSON.stringify(v));
const canonical=(v:any):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const freeze=(v:any):any=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
async function digest(v:any,raw=false){const bytes=new TextEncoder().encode(raw?v:canonical(v));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function interviewContextDigestV1(snapshot:CareerContextSnapshotV1){const value=clone(snapshot);delete value.captured_at;delete value.binding.context_sha256;return await digest(value);}

type Ref={id:string;version:number};
export async function toInterviewContextV1(input:CareerContextSnapshotV1,selection:{target_ref?:Ref;resume_ref?:Ref}={}){
 if(!validateJourneyContractV1('CareerContextSnapshotV1',input).ok)throw Error('invalid_canonical_context');
 const s=clone(input);
 if(await interviewContextDigestV1(s)!==s.binding.context_sha256)throw Error('context_digest_mismatch');
 const current=(x:any)=>x.freshness==='current'&&Number.isSafeInteger(x.item_version)&&x.item_version>0;
 // A source requirement or assessment cannot become a personal qualification.
 const personal=s.facts.filter((f:any)=>current(f)&&['active','corrected'].includes(f.status)&&['user_report','user_pasted'].includes(f.provenance.kind)&&f.provenance.trust==='user_reported');
 function select(kind:string,ref?:Ref){
  const rows=personal.filter((f:any)=>f.kind===kind);
  if(ref){const row=rows.find((f:any)=>f.id===ref.id&&f.item_version===ref.version);if(!row)throw Error(kind+'_selection_stale_or_foreign');return row;}
  if(rows.length>1)throw Error(kind+'_selection_required');return rows[0]||null;
 }
 const target=select('target',selection.target_ref),resume=select('resume',selection.resume_ref);
 const related=(f:any)=>target&&f.provenance.record_id===target.provenance.record_id&&f.provenance.revision===target.provenance.revision;
 const classification=(kind:string)=>{const rows=personal.filter((f:any)=>f.kind===kind&&related(f));return rows.length===1&&typeof rows[0].value==='string'?rows[0].value:null;};
 const base=(x:any)=>({id:x.id,version:x.item_version,owner_id:s.owner_id,...(x.scope.kind==='thread'?{thread_id:x.scope.thread_id}:{}),scope:x.scope.kind==='account'?'owner':'thread',provenance:clone(x.provenance),trust:x.provenance.trust,validity:{status:'active',epoch:s.binding.epoch},created:clone(x.created),effective:clone(x.effective),freshness:x.freshness});
 const sourceRows=s.sources.filter((x:any)=>current(x)&&x.availability==='available');
 for(const source of sourceRows)if(await digest(source.content,true)!==source.source_sha256)throw Error('source_digest_mismatch');
 const sourceById=new Map<string,any>(sourceRows.map((x:any)=>[x.id,x]));
 const helpers=new Set(['target_role_family','target_level','target_company','target_stage']);
 const facts:any[]=[];
 for(const f of personal){
  if(f.kind==='target'){
   if(f!==target||typeof f.value!=='string')continue;
   facts.push({...base(f),kind:'target',value:{role:f.value,role_family:classification('target_role_family'),level:classification('target_level'),company:classification('target_company'),stage:classification('target_stage')}});
  }else if(f.kind==='resume'){
   if(f!==resume||f.source_refs.length!==1)continue;
   const source=sourceById.get(f.source_refs[0]);
   // Selection must adopt this exact source revision. A newer source cannot
   // retrospectively give old, unversioned selection provenance current status.
   if(!source||f.provenance.record_id!==source.id||f.provenance.revision!==source.item_version)continue;
   // B calls the selected input-document reference artifact_id. It identifies
   // this existing owned source, never a newly saved/downloaded output artifact.
   facts.push({...base(f),kind:'resume',value:{artifact_id:source.id,sha256:source.source_sha256},source_refs:[{id:source.id,version:source.item_version}]});
  }else{
   facts.push({...base(f),kind:helpers.has(f.kind)&&related(f)?'interview_guidance':f.kind,value:clone(f.value??null)});
  }
 }
 const sources=sourceRows.map((x:any)=>({...base(x),kind:'source',trust:'untrusted_source',value:{excerpt:x.content,content_sha256:x.source_sha256,canonical_url:x.canonical_url,source_kind:x.source_kind}}));
 const versions=new Map([...facts,...sources].map(x=>[x.id,x.version]));
 const dependenciesCurrent=(x:any)=>Array.isArray(x.dependencies)&&x.dependencies.every((r:any)=>versions.get(r.item_id)===r.item_version);
 const continuity=(rows:any[],lifecycle=false)=>rows.filter(x=>current(x)&&(!lifecycle||x.lifecycle==='open')&&dependenciesCurrent(x)).map(x=>({...base(x),...clone(x),version:x.item_version,owner_id:s.owner_id,scope:x.scope.kind==='account'?'owner':'thread',validity:{status:'active',epoch:s.binding.epoch}}));
 const targetIds=new Set(personal.filter((f:any)=>f===target||helpers.has(f.kind)&&related(f)).map((f:any)=>f.id));
 const resumeIds=new Set(resume?[resume.id,...resume.source_refs]:[]);
 const invalidationKind=(reason:string,id:string)=>reason==='field_withdrawn'?'withdrawal':reason==='source_superseded'?(resumeIds.has(id)?'resume_replaced':'correction'):reason==='fact_corrected'?(targetIds.has(id)?'target_changed':'correction'):reason==='goal_changed'&&targetIds.has(id)?'target_changed':null;
 const invalidations=s.invalidations.filter(current).flatMap((x:any)=>x.target_ids.flatMap((id:string)=>{const kind=invalidationKind(x.reason,id);return kind?[{...base(x),id:JSON.stringify([x.id,id]),evidence_id:id,kind,effect:x.effect,effective:clone(x.effective)}]:[];}));
 const capNames:any={'career.coach_answer':'interview.coach.v1','career.create_draft':'interview.local_draft.v1'};
 const proofCapabilities=new Set(['interview.coach.v1','interview.local_draft.v1','research.exact_url.v1']);
 const capabilities=s.capabilities.map((c:any)=>{const id=capNames[c.capability_id]||c.capability_id,unwired=proofCapabilities.has(id)&&c.availability==='available';return {id,status:unwired?'not_wired':c.availability,version:1,reason:unwired?'Context-only bridge has no trusted execution/result adapter.':c.reason};});
 if(new Set(capabilities.map((x:any)=>x.id)).size!==capabilities.length)throw Error('capability_alias_conflict');
 const draft=s.current_draft;
 const snapshot={contract_version:'career_journey_context/v1',owner_id:s.owner_id,thread_id:s.thread_id,captured_at:s.captured_at,binding:clone(s.binding),facts,sources,
  dialogue:continuity(s.dialogue).filter((x:any)=>x.dependencies.length>0),current_draft:draft&&current(draft)&&dependenciesCurrent(draft)?{...base(draft),text:draft.text,revision:draft.revision,status:'draft_not_sent',dependencies:clone(draft.dependencies)}:null,
  goals:continuity(s.goals,true),pending_asks:continuity(s.pending_asks,true),invalidations,
  // Canonical receipt metadata is insufficient for B's rich authenticated
  // result receipts. Do not invent semantic/source/artifact proof fields.
  tool_status:[],receipts:[],artifacts:[],assessments:[]};
 return freeze({adapter_version:'canonical_A_to_interview_B/1',snapshot:{...snapshot,capabilities},unavailable_proof_categories:['semantic_candidate','source_capture','artifact_readback','tool_status','assessment']});
}
