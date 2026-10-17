import {CareerApplications as Apps,CareerJobs as Jobs,CareerDiscover as Discover} from './router_core.career.js';
import {redactIdentity} from './identity_redact.ts';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,HASH=/^[a-f0-9]{64}$/,TASK=/^[a-f0-9]{32}$/;
const err=(code,status=409)=>Object.assign(Error(code),{code,status});
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x,allowed)=>object(x)&&Object.keys(x).every(k=>allowed.includes(k));
async function bytesHash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const canonical=x=>Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const applicantRequestHash=value=>bytesHash(new TextEncoder().encode(JSON.stringify(canonical(value))));
function explicitFacts(value){
 if(!keys(value,['workCountry','workAuthorization','needsSponsorship','graduationDate','level','location','education','experienceYears','skills'])||!/^[A-Z]{2}$/.test(value.workCountry||'')||typeof value.needsSponsorship!=='boolean'||!['student','new_grad','experienced'].includes(value.level)||!/^20\d\d-(?:0[1-9]|1[0-2])$/.test(value.graduationDate||'')||!Array.isArray(value.skills)||value.skills.length<1||value.skills.length>20)throw err('INVALID_APPLICATION_FACTS',400);
 for(const k of ['workAuthorization','education'])if(typeof value[k]!=='string'||!value[k].trim()||value[k].length>500)throw err('INVALID_APPLICATION_FACTS',400);
 if(value.location!==undefined&&(typeof value.location!=='string'||value.location.length>300))throw err('INVALID_APPLICATION_FACTS',400);
 if(value.experienceYears!==undefined&&(!Number.isFinite(value.experienceYears)||value.experienceYears<0||value.experienceYears>60))throw err('INVALID_APPLICATION_FACTS',400);
 for(const s of value.skills)if(!keys(s,['name','evidence'])||typeof s.name!=='string'||!s.name.trim()||s.name.length>80||typeof s.evidence!=='string'||!s.evidence.trim()||s.evidence.length>500)throw err('INVALID_APPLICATION_FACTS',400);
 if(new Set(value.skills.map(s=>s.name.trim().toLowerCase())).size!==value.skills.length)throw err('INVALID_APPLICATION_FACTS',400);
 if(redactIdentity(JSON.stringify(value)).removed.length)throw err('INVALID_APPLICATION_FACTS',400);return value;
}
function searchView(s,now){
 const all=s.results||[],ready=all.filter(r=>r.eligibility?.status==='eligible'),held=all.filter(r=>r.eligibility?.status==='awaiting_user'),synthetic=all.some(r=>r.source?.provenance==='synthetic_fixture/v1');
 return {version:'career_application_chat/v1',status:Date.parse(s.expires_at)<=now&&!s.selected_batch?'shortlist_expired':'shortlist',searchId:s.search_id,requested:s.requested,matched:ready.length,shortlist:ready,held,sourceHealth:s.source_health||[],expiresAt:s.expires_at,observedAt:s.created_at,synthetic,originalAsk:s.ask};
}
export function applicationFeeds(feeds){const finance=/\b(?:capital|financial|investments?|securities|bank|equity|jane street|robinhood|coinbase|gemini|ramp)\b/i;return feeds.filter(f=>f.status!=='dead'&&!/demo|test fixture/i.test(f.company||'')).map((f,n)=>({f,n,rank:finance.test(f.company||'')?0:1})).sort((a,b)=>a.rank-b.rank||a.n-b.n).slice(0,16).map(x=>x.f);}
export async function collectApplicationSources({ask,limit,userId,profile,config={},now,interests:providedInterests}){
 const interests=providedInterests||Apps.interests(ask,profile,now),scoring=Apps.scoringProfile(profile),country=Apps.workCountry(profile),metadata=new Map(),health=[],candidates=[];
 const feeds=applicationFeeds(config.feeds||Discover.discoveryPlan().feeds),urls=new Set(feeds.map(f=>f.url));
 const fixtureOrigins=new Set(config.fixtureOrigins||[]),fetcher=config.fetch||fetch;
 async function read(url){
  if(!urls.has(url)||new URL(url).protocol!=='https:')throw Error('UNTRUSTED_APPLICATION_SOURCE');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  try{const r=await fetcher(url,{method:'GET',headers:{accept:'application/json'},redirect:'error',credentials:'omit',signal:controller.signal});if(!r.ok)return {status:r.status,ok:false};
   const reader=r.body?.getReader();if(!reader)throw Error('EMPTY_APPLICATION_SOURCE');let size=0;const chunks=[];
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();throw Error('APPLICATION_SOURCE_SIZE_LIMIT');}chunks.push(value);}}finally{reader.releaseLock();}
   const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}const json=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
   metadata.set(url,{url,sha256:await bytesHash(bytes),observedAt:new Date(now).toISOString(),provenance:fixtureOrigins.size?'synthetic_fixture/v1':'public_ats_snapshot/v1'});return {status:r.status,ok:true,json:async()=>json};
  }finally{clearTimeout(timer);}
 }
 for(let i=0;i<feeds.length;i+=4){
  const rows=await Promise.all(feeds.slice(i,i+4).map(feed=>Jobs.fetchFeed(feed,{fetch:read})));
  for(const row of rows){health.push({url:row.url,provider:row.source,status:row.status,postings:row.postings.length,error:row.error||null,observedAt:new Date(now).toISOString()});
   if(row.status!==200)continue;const source=metadata.get(row.url);if(!source)continue;
   for(const p of row.postings.slice(0,5000)){
    let u;try{u=new URL(p.url);}catch(_){continue;}if(u.protocol!=='https:'&&!fixtureOrigins.has(u.origin))continue;
    if(!p.company||!p.jd_text||Apps.postingCountry(p)!==country)continue;
    const posting={...p,status:'open',canonicalKey:p.job_id,observationProvenance:source.provenance},eligibility=Apps.assess(posting,profile,scoring,interests,{records:[]});
    if(!['eligible','awaiting_user'].includes(eligibility.status))continue;
    candidates.push({posting,eligibility,source});
   }
  }
 }
 const deduped=Jobs.dedupe(candidates.map(c=>c.posting)),kept=new Set(Discover.ghostGuard(deduped,{now}).kept.map(p=>p.job_id));
 const sorted=candidates.filter(c=>kept.has(c.posting.job_id)).sort((a,b)=>(b.eligibility.fit?.score||0)-(a.eligibility.fit?.score||0)||a.posting.job_id.localeCompare(b.posting.job_id)),seen=new Set(),out=[];
 for(const c of sorted){const seat=Jobs.dedupeKey(c.posting);if(seen.has(seat))continue;seen.add(seat);out.push({...c,taskId:(await bytesHash(new TextEncoder().encode(JSON.stringify([userId,c.posting.canonicalKey])))).slice(0,32)});if(out.length>=limit)break;}
 return {results:out,health,interests};
}
// Called only after the existing handler authenticates/owns the thread. Server
// dependencies may inject labeled source fixtures; request JSON cannot do so.
export async function applicationConversation({admin,userId,threadId,turnKey,message,raw,images=/** @type {unknown[]} */([]),config={},now=Date.now()}){
 const parsed=raw===undefined?Apps.command(message):null;if(raw===undefined&&!parsed)return null;
 const response=(status,reply,application,extra={})=>({status,body:{thread_id:threadId,turn_key:turnKey,reply,action:null,reminders:[],application,...extra}});
 try{
  if(images.length)throw err('APPLICATION_TEXT_REQUIRED',400);
  if(raw!==undefined&&(!keys(raw,['action','input'])||!['facts_review','facts_confirm','prepare','review','status','approve','answers','reconcile','refresh'].includes(raw.action)||!object(raw.input)))throw err('INVALID_APPLICATION_COMMAND',400);
  const command=raw||parsed;if(command.action==='invalid')throw err(command.code,400);
  const requestHash=await applicantRequestHash({version:'career_application_turn/v1',threadId,message,command}),nonce='chat_'+(await applicantRequestHash({threadId,turnKey}));
  async function rpc(name,args){let r;try{r=await admin.rpc(name,args);}catch(_){throw err('APPLICATION_STORAGE_UNCERTAIN',503);}if(r?.error){const m=r.error.message||'';throw err(/conflict/.test(m)?'APPLICATION_COMMAND_CONFLICT':/revoked|owned.*missing/.test(m)?'APPLICATION_CONTEXT_REVOKED':/expired|changed/.test(m)?'APPLICATION_REVIEW_CHANGED':/invalid/.test(m)?'INVALID_APPLICATION_COMMAND':'APPLICATION_STORAGE_UNAVAILABLE',/revoked|owned.*missing/.test(m)?403:/invalid/.test(m)?400:/conflict|expired|changed|required/.test(m)?409:503);}if(!object(r?.data))throw err('APPLICATION_STORAGE_UNAVAILABLE',503);if(r.data.error)throw err(r.data.error,/revoked|owned_thread_missing/.test(r.data.error)?403:/conflict|changed|required/.test(r.data.error)?409:503);return r.data;}
  const context=await rpc('career_application_chat_context_v1',{p_user:userId,p_thread:threadId,p_key:turnKey,p_hash:requestHash}),loaded=context.loaded;
  if(loaded?.replay)return {status:200,body:loaded.replay};if(!loaded||!Number.isSafeInteger(loaded.accountVersion))throw err('APPLICATION_STORAGE_UNAVAILABLE',503);
  const profile=loaded.snapshot?.stores?.profile||null,input=command.input||{},version=loaded.accountVersion,epoch=loaded.account?.epoch||0;
  if(command.action==='facts_review'){
   const fields=explicitFacts(input),proposed=Apps.confirmedProfile(profile,fields,'authenticated_application_fact_confirmation/v1:'+turnKey),binding={userId,threadId,requestKey:turnKey,accountVersion:version,privacyEpoch:epoch,profile:proposed,fields},hash=await applicantRequestHash(binding);
   const review=await rpc('career_application_profile_review_v1',{p_user:userId,p_thread:threadId,p_key:turnKey,p_hash:requestHash,p_version:version,p_epoch:epoch,p_review:hash,p_profile:proposed,p_fields:fields});
   return response(200,'Review these application facts. Confirm only the details and evidence you supplied.',{version:'career_application_chat/v1',status:'facts_review',...review,confirmationPhrase:'Confirm application facts '+hash});
  }
  if(command.action==='facts_confirm'){
   const reviewHash=input.reviewHash||command.reviewHash;if(!keys(input,['reviewHash'])||!HASH.test(reviewHash||'')||message!=='Confirm application facts '+reviewHash)throw err('EXACT_APPLICATION_FACT_CONFIRMATION_REQUIRED',409);
   const saved=await rpc('career_application_profile_confirm_v1',{p_base:{p_user:userId,p_thread:threadId,p_key:turnKey,p_hash:requestHash},p_review:reviewHash,p_message:message});if(!saved.response)throw err('APPLICATION_STORAGE_UNCERTAIN',503);return {status:200,body:saved.response};
  }
  if(command.action==='discover'){
   const interests=Apps.interests(command.ask,profile,now),scope=await rpc('career_application_search_scope_v1',{p_user:userId,p_thread:threadId,p_key:turnKey,p_hash:requestHash,p_version:version,p_epoch:epoch,p_interests:interests});const clarification=interests[0]?.filters?.applicationConstraints?.clarification;if(clarification)return response(200,clarification,{version:'career_application_chat/v1',status:'needs_search_clarification',originalAsk:command.ask,question:clarification});
   if(!context.resume)return response(200,'Add or confirm your original resume before preparing applications. I also need your confirmed career facts to judge fit.',{version:'career_application_chat/v1',status:'needs_resume',originalAsk:command.ask,missingFacts:Apps.missingFacts(profile),factDefaults:Apps.factDefaults(profile)});
   const missing=Apps.missingFacts(profile);if(missing.length)return response(200,'I need '+missing.join(', ')+' before I can call these suitable matches. Review your actual facts below; nothing has been invented.',{version:'career_application_chat/v1',status:'needs_facts',originalAsk:command.ask,missingFacts:missing,factDefaults:Apps.factDefaults(profile)});
   if(context.searchReplay){const view=searchView(context.searchReplay,now);return response(200,view.matched+' of '+view.requested+' requested internships have sourced fit evidence. The source timestamps and any held rows are below.',view);}
   const found=await collectApplicationSources({ask:command.ask,limit:command.limit,userId,profile,config,now,interests:scope.interests}),saved=await rpc('career_application_search_store_v1',{p_user:userId,p_thread:threadId,p_key:turnKey,p_hash:requestHash,p_version:version,p_epoch:epoch,p_ask:command.ask,p_limit:command.limit,p_results:found.results,p_health:found.health,p_interests:found.interests}),view=searchView(saved,now);
   return response(200,view.matched+' of '+view.requested+' requested internships have sourced fit evidence. '+(view.matched<view.requested?'I did not pad the list. ':'')+'Review the source links and fit citations before preparing the selected roles.',view);
  }
  if(command.action==='prepare'){
   if(!keys(input,['searchId','taskIds'])||!UUID.test(input.searchId||'')||!Array.isArray(input.taskIds)||!input.taskIds.length||input.taskIds.length>100||input.taskIds.some(id=>!TASK.test(id)))throw err('INVALID_APPLICATION_SELECTION',400);
   const batch=await rpc('career_application_search_prepare_v1',{p_user:userId,p_thread:threadId,p_key:nonce,p_search:input.searchId,p_tasks:input.taskIds});return response(200,'Selected roles are queued for preparation. No submission is approved; check their status and review the exact ready batch.',{version:'career_application_chat/v1',status:'batch',batch});
  }
  let batchId=input.batchId;if(batchId!==undefined&&!UUID.test(batchId))throw err('INVALID_APPLICATION_BATCH',400);
  const reviewHash=input.reviewHash||command.reviewHash,taskId=input.taskId||command.taskId;
  if(!batchId){const lookup=await rpc('career_application_batch_lookup_v1',{p_user:userId,p_thread:threadId,p_review:reviewHash||null,p_task:taskId||null});batchId=lookup.batchId;}
  if(!batchId)return response(200,'This chat has no application batch in the current confirmed context.',{version:'career_application_chat/v1',status:'no_batch'});
  if(command.action==='refresh'){
   if(!keys(input,['batchId']))throw err('INVALID_APPLICATION_COMMAND',400);
   const before=await rpc('career_application_source_refresh_context_v1',{p_user:userId,p_thread:threadId,p_batch:batchId,p_key:nonce,p_hash:requestHash});if(before.replay)return response(200,'Recovered acknowledgement of the earlier source refresh. Refresh batch status for current progress; submission still requires a fresh exact review.',{version:'career_application_chat/v1',status:'batch',batch:before.replay});
   const found=await collectApplicationSources({ask:before.search.ask,limit:100,userId,profile,config,now,interests:before.search.role_interests}),batch=await rpc('career_application_source_refresh_v1',{p_user:userId,p_thread:threadId,p_batch:batchId,p_key:nonce,p_hash:requestHash,p_results:found.results,p_health:found.health});return response(200,'Current sources were checked. Unchanged, unattempted roles are queued for fresh preparation and exact review. Changed or missing postings are held; existing outcomes grant no resend.',{version:'career_application_chat/v1',status:'batch',batch});
  }
  let args={batchId};
  if(command.action==='approve'){if(!keys(input,['batchId','reviewHash'])||!HASH.test(reviewHash||'')||message!=='Approve batch '+reviewHash)throw err('EXACT_BATCH_REVIEW_REQUIRED');args={batchId,reviewHash,message};}
  else if(command.action==='reconcile'){if(!keys(input,['batchId','taskId'])||!TASK.test(taskId||'')||message!=='Reconcile batch role '+taskId)throw err('EXACT_ROLE_READBACK_REQUIRED');args={batchId,taskId,message};}
  else if(command.action==='answers'){if(!keys(input,['batchId','taskId','questionsHash','answers'])||!TASK.test(taskId||'')||!HASH.test(input.questionsHash||'')||!Array.isArray(input.answers)||input.answers.some(a=>!keys(a,['fieldId','questionSha256','value'])||!['string','number','boolean'].includes(typeof a.value)||redactIdentity(String(a.value)).removed.length)||message!=='Confirm answers for '+taskId+' '+input.questionsHash)throw err('EXACT_ROLE_ANSWER_CONFIRMATION_REQUIRED');args={...input,batchId,message};}
  else if(!['review','status'].includes(command.action)||!keys(input,['batchId']))throw err('INVALID_APPLICATION_COMMAND',400);
  const batch=await rpc('career_application_batch_control_v1',{p_user:userId,p_thread:threadId,p_request:nonce,p_action:command.action,p_input:args});
  return response(200,command.action==='approve'?'The exact reviewed roles are approved and queued. Employer acceptance is not yet confirmed.':command.action==='answers'?'Your answers are confirmed only for this role and question set. Preparation resumes; submission still requires a fresh exact review.':command.action==='reconcile'?'Readback is queued. No resubmission is authorized.':command.action==='review'?'Review the exact ready roles and held rows below. Approval covers only this immutable review.':'Here is the authoritative batch status. UNKNOWN does not mean accepted; it grants no resend.',{version:'career_application_chat/v1',status:command.action==='review'?'batch_review':'batch',batch});
 }catch(e){return response(e.status||503,'I could not confirm this application workflow step. '+((e.status||503)===503?'Retry the same request key to recover its acknowledgement.':'Reload the current owned context and review the exact request.'),{version:'career_application_chat/v1',status:'unavailable'},{error:e.code||'APPLICATION_STORAGE_UNAVAILABLE',...((e.status||503)===503?{retrySameRequestKey:true}:{})});}
}
