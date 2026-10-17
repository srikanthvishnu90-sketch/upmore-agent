'use strict';
// Batch orchestration reuses the existing eligibility and fact-citation engines.
const Jobs=require('../../packages/domain/121-career-jobs.js');
const Apply=require('../../packages/domain/132-career-apply.js');
const Watch=require('../../packages/domain/151-career-alert-watch.js');
const Assign=require('../../packages/domain/152-career-assign.js');
const {hash,fail,clone}=require('./store.cjs');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=v=>hash(canonical(v));
const safeKey=k=>typeof k==='string'&&/^[a-z][a-z0-9_]{0,63}$/.test(k)&&!['constructor','prototype','__proto__'].includes(k);
function questions(session,asks){
 return (asks||[]).map(a=>{
  const field=(session.preparationFields||[]).find(f=>f.field_id===a.field_id);
  return {...a,required:field?.required===true,field:field?clone(field):null,questionSha256:field?digest(field):null,
   answerable:!!field&&field.profile_key!=='resume'&&['standard','screening','free_text','attestation'].includes(field.kind)};
 });
}
function applyAnswers(e,fields,answers){
 const stale=[];
 for(const a of answers){
  if(a.kind==='eligibility')continue;
  const field=fields.find(f=>f.field_id===a.fieldId);
  if(!field||digest(field)!==a.questionSha256){
   stale.push(a.fieldId);
   if(field?.kind==='standard'&&safeKey(field.profile_key)&&field.profile_key!=='resume')delete e.profile[field.profile_key];
   if(['screening','free_text'].includes(field?.kind)&&safeKey(field.question_key)&&e.profile.answers)delete e.profile.answers[field.question_key];
   if(field?.kind==='attestation'&&e.attestations)delete e.attestations[field.field_id];
   continue;
  }
  if(field.kind==='standard'){
   if(!safeKey(field.profile_key)||field.profile_key==='resume')throw fail('UNSUPPORTED_SCOPED_ANSWER');
   e.profile[field.profile_key]=clone(a.value);
  }else if(['screening','free_text'].includes(field.kind)){
   if(!safeKey(field.question_key))throw fail('UNSUPPORTED_SCOPED_ANSWER');
   e.profile.answers ||= {};e.profile.answers[field.question_key]={confirmed:true,value:clone(a.value),...(field.kind==='free_text'?{draft:true}:{})};
  }else if(field.kind==='attestation'){
   if(!safeKey(field.field_id))throw fail('UNSUPPORTED_SCOPED_ANSWER');
   e.attestations ||= {};e.attestations[field.field_id]={explicit:true,value:clone(a.value)};
  }else throw fail('UNSUPPORTED_SCOPED_ANSWER');
 }
 return stale;
}
function eligibilityQuestions(t,e,asks){
 return asks.map(q=>{
  const target=q.missing_fact==='needs_sponsorship'?'needs_sponsorship':['residence_state','residence_location','distance_to_center'].includes(q.missing_fact)?'residence':null;
  const label=target==='residence'?'What is your current city and state of residence? '+q.question:q.question||q.reason||'Review this eligibility requirement.';
  const field={field_id:'eligibility_'+digest({type:q.type,missing:q.missing_fact,restriction:q.restriction}).slice(0,24),kind:'eligibility',target,answerType:target==='needs_sponsorship'?'boolean':'string',label,required:true,sourceQuestion:q,
   scope:{userId:t.userId,taskId:t.id,accountVersion:t.authority?.accountVersion,privacyEpoch:t.privacyEpoch,postingKey:t.spec.posting.canonicalKey,postingSha256:digest(e.currentPosting.posting),sourceSha256:e.currentPosting.sourceSha256}};
  return {field_id:field.field_id,kind:'eligibility',question:label,reason:q.reason,required:true,answerable:!!target,field,questionSha256:digest(field)};
 });
}
function eligibility(t,e,log,now,answers=[]){
 const current=e.currentPosting,posting=current?.posting,observed=Date.parse(current?.observedAt);
 if(!e.scoringProfile||!e.careerProfile||!posting||!/^[a-f0-9]{64}$/.test(current?.sourceSha256||'')||!Number.isFinite(observed)||observed>now||now-observed>300000)return {status:'blocked',code:'CURRENT_ELIGIBILITY_CONTEXT_REQUIRED'};
 if(posting.canonicalKey!==t.spec.posting.canonicalKey||posting.url!==t.spec.posting.url)return {status:'blocked',code:'CURRENT_POSTING_BINDING_CHANGED'};
 if(posting.status!=='open')return {status:'blocked',code:'JOB_CLOSED'};
 for(const k of ['company','title','role','jd_text','location','seniority_band'])if(JSON.stringify(posting[k])!==JSON.stringify(t.spec.posting[k]))return {status:'blocked',code:'CURRENT_POSTING_REVIEW_REQUIRED'};
 const interests=e.roleInterests,families=e.scoringProfile.preferences?.role_families;
 if(!Array.isArray(interests)||!interests.length||!Array.isArray(families)||!families.length)return {status:'blocked',code:'ROLE_INTEREST_CONTEXT_REQUIRED'};
 const roleMatches=interests.filter(i=>i?.role&&Array.isArray(i.filters?.bands)&&i.filters.bands.length&&Assign.matchInterest(posting,i,null).matched);
 if(!families.includes(posting.role_family)||!roleMatches.length)return {status:'blocked',code:'ROLE_TARGET_MISMATCH'};
 const scoring=clone(e.scoringProfile);scoring.constraints ||= {};
 const first=Apply.triageBatch([posting],{profile:e.careerProfile,scoringProfile:scoring,log})[0];
 const observedQuestions=eligibilityQuestions(t,e,first.needs_user_input||[]),applied=[];
 for(const a of answers.filter(a=>a.kind==='eligibility')){
  const q=observedQuestions.find(q=>q.field_id===a.fieldId&&q.questionSha256===a.questionSha256&&q.answerable);if(!q)continue;
  if(a.source!=='user_explicit_role_confirmation'||typeof a.value!==q.field.answerType||(typeof a.value==='string'&&(!a.value.trim()||a.value.length>300)))throw fail('INVALID_ELIGIBILITY_ANSWER');
  if(q.field.target==='needs_sponsorship')scoring.constraints.needs_sponsorship=a.value;
  else if(q.field.target==='residence')scoring.residence=a.value;
  applied.push({fieldId:a.fieldId,questionSha256:a.questionSha256,value:a.value,source:a.source});
 }
 const row=Apply.triageBatch([posting],{profile:e.careerProfile,scoringProfile:scoring,log})[0];
 if(row.decision!=='apply')return {status:row.decision==='ask'?'awaiting_user':'blocked',code:'ELIGIBILITY_REVIEW_REQUIRED',asks:eligibilityQuestions(t,e,row.needs_user_input||[{type:'manual_review',reason:(row.reasons||[]).join('; ')}]),reasons:row.reasons};
 const fit=Jobs.scoreFit(posting,scoring),cited=Watch.composeAlert(posting,fit,scoring,now),facts=e.careerProfile.facts||[];
 if(!fit.matched_skills.length||!cited.matched_fact_ids.length||cited.matched_fact_ids.length<fit.matched_skills.length||cited.matched_fact_ids.some(id=>!facts.some(f=>(f.id||f.fact_id)===id&&f.kind==='skill'&&f.status==='confirmed'&&!f.needs_confirmation&&!f.unproven&&Array.isArray(f.evidence)&&f.evidence.length)))return {status:'blocked',code:'CONFIRMED_FIT_EVIDENCE_REQUIRED'};
 if(fit.bucket==='Reach')return {status:'blocked',code:'MEANINGFUL_FIT_REQUIRED',reasons:fit.reasons,gaps:fit.gaps};
 const proof={sourceSha256:current.sourceSha256,roleInterests:roleMatches.map(i=>({id:i.interest_id,role:i.role,filters:i.filters})),answers:applied,fit:{score:fit.score,bucket:fit.bucket,reasons:fit.reasons,gaps:fit.gaps,fitLines:cited.fit_lines,factIds:cited.matched_fact_ids}};
 return {status:'eligible',...proof,observedAt:current.observedAt,bindingSha256:digest(proof)};
}
module.exports={questions,applyAnswers,eligibility,digest};
