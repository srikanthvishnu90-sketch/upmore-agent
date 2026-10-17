'use strict';
// Batch orchestration reuses the existing eligibility and fact-citation engines.
const Jobs=require('../../packages/domain/121-career-jobs.js');
const Apply=require('../../packages/domain/132-career-apply.js');
const Watch=require('../../packages/domain/151-career-alert-watch.js');
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
function eligibility(t,e,log,now){
 const current=e.currentPosting,posting=current?.posting,observed=Date.parse(current?.observedAt);
 if(!e.scoringProfile||!e.careerProfile||!posting||!/^[a-f0-9]{64}$/.test(current?.sourceSha256||'')||!Number.isFinite(observed)||observed>now||now-observed>300000)return {status:'blocked',code:'CURRENT_ELIGIBILITY_CONTEXT_REQUIRED'};
 if(posting.canonicalKey!==t.spec.posting.canonicalKey||posting.url!==t.spec.posting.url)return {status:'blocked',code:'CURRENT_POSTING_BINDING_CHANGED'};
 if(posting.status!=='open')return {status:'blocked',code:'JOB_CLOSED'};
 for(const k of ['company','title','role','jd_text','location','seniority_band'])if(JSON.stringify(posting[k])!==JSON.stringify(t.spec.posting[k]))return {status:'blocked',code:'CURRENT_POSTING_REVIEW_REQUIRED'};
 const row=Apply.triageBatch([posting],{profile:e.careerProfile,scoringProfile:e.scoringProfile,log})[0];
 if(row.decision!=='apply')return {status:row.decision==='ask'?'awaiting_user':'blocked',code:'ELIGIBILITY_REVIEW_REQUIRED',asks:row.needs_user_input||[],reasons:row.reasons};
 const fit=Jobs.scoreFit(posting,e.scoringProfile),cited=Watch.composeAlert(posting,fit,e.scoringProfile,now);
 if(cited.matched_fact_ids.length<fit.matched_skills.length)return {status:'blocked',code:'CONFIRMED_FIT_EVIDENCE_REQUIRED'};
 return {status:'eligible',sourceSha256:current.sourceSha256,observedAt:current.observedAt,fit:{score:fit.score,bucket:fit.bucket,reasons:fit.reasons,gaps:fit.gaps,fitLines:cited.fit_lines,factIds:cited.matched_fact_ids}};
}
module.exports={questions,applyAnswers,eligibility,digest};
