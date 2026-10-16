'use strict';
const InterviewJourneyPack = (() => {
  const H=typeof InterviewJourneyHash!=='undefined'?InterviewJourneyHash:require('./hash.js');
  const C=typeof InterviewJourneyContext!=='undefined'?InterviewJourneyContext:require('../../career-interview-journey/adapters/context.js');
  const text = x => typeof x==='string'?x:H.canonical(x);
  const label=x=>String(x).replace(/_/g,' ');
  const references=refs=>refs.map(r=>r.id+'@'+r.version).join(', ')||'none';
  // Escape HTML and Markdown control characters in untrusted user/source text.
  const safe = x => text(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_{}\[\]#!|])/g,'\\$1');
  function build(snapshot,state){
    C.assert(state.owner_id===snapshot.owner_id&&state.thread_id===snapshot.thread_id&&state.epoch===snapshot.binding.epoch,'pack owner/epoch mismatch');
    const refs=state.dependencies.filter(r=>{try{C.resolve(snapshot,r);return true;}catch{return false;}});
    const facts=refs.map(r=>C.resolve(snapshot,r)).filter(r=>snapshot.facts.includes(r));
    const attempts=state.attempts.filter(a=>a.status==='active'&&!a.context_outdated);
    const assessments=state.assessments.filter(a=>a.status==='active'&&attempts.some(t=>t.id===a.attempt_id));
    const drafts=state.drafts.filter(d=>d.status==='active');
    const captures=state.research.filter(r=>r.status==='succeeded'&&refs.some(ref=>ref.id===r.source_ref.id&&ref.version===r.source_ref.version));
    const families=['project','technical','behavioral'];
    const missing=[];
    if(state.role_support!=='early_career_software')missing.push('Full early-career software scope not confirmed');
    if(!state.target)missing.push('Target role not supplied');
    if(state.target&&!state.target.company)missing.push('Company not supplied; role-only preparation');
    if(!state.resume_ref)missing.push('Selected resume not supplied');
    if(state.constraints.available_minutes===null)missing.push('Preparation time not supplied');
    if(captures.length===0)missing.push('Research limited: no verified role/company capture');
    const briefs=state.briefs.filter(b=>b.status==='active'&&b.source_refs.every(r=>refs.some(x=>x.id===r.id&&x.version===r.version)));
    if(!briefs.length)missing.push('Source-backed role/company synthesis not assessed');
    for(const family of families)if(!assessments.some(a=>a.family===family))missing.push(family+' answer not assessed');
    for(const kind of ['practice','revision'])if(!attempts.some(t=>t.kind===kind&&assessments.some(a=>a.attempt_id===t.id)))missing.push(kind+' not assessed');
    if(!state.observations.some(o=>o.kind==='transfer'&&o.assistance==='none'&&o.status==='observed'))missing.push('Unassisted transfer not assessed');
    if(!drafts.length)missing.push('No current evidence-linked answer draft');
    if(state.status==='partial_at_user_stop')missing.push('User stopped before full completion');
    const sections=[
      {id:'target',title:'Target and constraints',content:[state.target?`Role: ${state.target.role||'unknown'}; company: ${state.target.company||'unknown'}; level: ${state.target.level||'unknown'}; stage: ${state.target.stage||'unknown'}`:'Target unknown', 'Resume: '+(state.resume_ref?references([state.resume_ref]):'not supplied'),'Available minutes: '+text(state.constraints.available_minutes),'Interview timing: '+(state.constraints.interview_at?`${state.constraints.interview_at.at}; timezone: ${state.constraints.interview_at.timezone||'not supplied'}`:'not supplied'),'Daily study minutes: '+text(state.constraints.daily_study_minutes),'Unknowns: '+state.constraints.unknowns.join('; ')]},
      {id:'brief',title:'Role and company brief',content:briefs.map(b=>`${b.text}\nLimits: ${b.limits}\nSource refs: ${text(b.source_refs)}; checked advisory synthesis, quality unmeasured.`).concat(captures.length?captures.map(s=>`${s.title} — ${s.final_url} — as of ${s.captured_at} (${s.completeness}, ${s.classification})\n${s.excerpt}\nCapture is evidence of source content, not validated synthesis.`):['Research limited. No verified current capture. Supplied material is identified in the evidence appendix; interview questions below are representative practice.'])},
      {id:'plan',title:'Prioritized preparation plan',content:state.plan.items.map(i=>`${i.competency}: ${i.minutes} minutes. ${i.reason} Evidence: ${text(i.source_refs)}`)},
      {id:'stories',title:'Truthful story bank',content:facts.filter(f=>f.kind==='project'||f.kind==='experience').map(f=>`${f.id}@${f.version}: ${text(f.value)} — source ${text(f.provenance)}`)},
      {id:'answers',title:'Original and revised answers',content:attempts.map(a=>`${a.id} / ${a.question_id} / ${a.kind}; assistance: ${a.assistance}; parent: ${a.parent_attempt_id||'none'}\n${a.text}\nSHA-256: ${a.answer_sha256}`).concat(drafts.map(d=>`Draft ${d.id}@${d.version}; generated wording, not a canonical fact. Attempts: ${d.source_attempt_ids.join(', ')}\n${d.text}`))},
      {id:'feedback',title:'Feedback, practice and transfer',content:assessments.map(a=>`${a.id}; provisional practice judgment by ${a.generator}; ${a.family}\n${a.feedback}\n${a.dimensions.map(d=>`${label(d.id)}: ${label(d.score)}. ${d.rationale} Support: ${d.spans.map(s=>s.quote).join('; ')||d.missing_criterion}. Uncertainty: ${d.uncertainty}`).join('\n')}\nPriority: ${a.priority_fix.text}; uncertainty: ${a.uncertainty}`).concat(state.observations.filter(o=>o.status==='observed').map(o=>`${label(o.kind)}: ${label(o.competency)}; assistance: ${o.assistance}; outcome: ${o.outcome}. ${o.uncertainty} (Attempt ${o.attempt_id})`))},
      {id:'remaining',title:'Remaining preparation and deferrals',content:[`Remaining declared time: ${text(state.plan.remaining_minutes)} minutes. Time spent is user/host reported, never inferred.`,...state.plan.deferrals,...missing]},
      {id:'interviewer_questions',title:'Questions to ask the interviewer',content:['Generic, not company-specific: What would a successful first project look like for someone at this level?','Generic, not company-specific: How does the team review design choices and validate changes?']},
      {id:'logistics',title:'Day-of checklist',content:state.constraints.logistics.length?state.constraints.logistics:['Appointment time, meeting link, interviewer and location have not been supplied. Confirm them from your own invitation.']},
      {id:'evidence',title:'Evidence and version appendix',content:[`Journey ${state.journey_id}, revision ${state.revision}; context ${snapshot.binding.context_sha256}; epoch ${state.epoch}.`,...refs.map(r=>{const item=C.resolve(snapshot,r);return `${r.id}@${r.version}; ${item.trust}; provenance ${text(item.provenance)}`;}),'Assisted revision and unassisted transfer are separate observations. No aggregate mastery or hiring score is calculated.']}
    ];
    for(const s of sections)if(!s.content.length)s.content=['Not yet supplied or assessed.'];
    const pack={schema_version:'interview_prep_pack/v1',owner_id:state.owner_id,thread_id:state.thread_id,journey_id:state.journey_id,journey_revision:state.revision,epoch:state.epoch,target_ref:state.target_ref,resume_ref:state.resume_ref,context_binding:C.binding(snapshot,state.revision),status:missing.length?'partial':'complete',unmet_conditions:missing,source_refs:refs,sections};
    const markdown='# Interview preparation pack\n\nStatus: '+pack.status+'\n\n'+sections.map(s=>'## '+s.title+'\n\n'+s.content.map(safe).join('\n\n')).join('\n\n')+'\n';
    return {pack,markdown,manifest:{mime_type:'text/markdown; charset=utf-8',encoding:'utf-8',byte_length:new TextEncoder().encode(markdown).length,sha256:H.sha256(markdown),structured_sha256:H.sha256(pack),filename:'interview-preparation.md'}};
  }
  function validateReadback(snapshot,state,result){
    const pending=state.checkpoint.pending_artifact; C.assert(pending,'no pending artifact');
    const r=C.receipt(snapshot,result.receipt_id,'artifact_readback');
    const artifact=snapshot.artifacts.find(a=>a.id===r.artifact_id&&a.version===r.artifact_version);
    C.assert(artifact&&artifact.owner_id===state.owner_id&&artifact.thread_id===state.thread_id&&artifact.journey_id===state.journey_id&&artifact.epoch===state.epoch,'artifact owner/journey/epoch mismatch');
    C.assert(r.action_id===pending.action_id&&r.input_digest===pending.input_digest&&r.authorized_open===true&&r.fresh_session===true,'artifact readback proof missing');
    C.assert(r.journey_revision===pending.journey_revision&&state.revision-1===pending.journey_revision&&C.sameBinding(r.validated_binding,C.binding(snapshot,state.revision-1))&&H.canonical(r.target_ref)===H.canonical(state.target_ref)&&H.canonical(r.resume_ref)===H.canonical(state.resume_ref),'stale artifact target/resume/revision');
    C.assert(typeof artifact.content==='string'&&artifact.content.length>0&&artifact.mime_type==='text/markdown; charset=utf-8'&&artifact.encoding==='utf-8','artifact must be readable UTF-8 Markdown bytes');
    C.assert(H.sha256(artifact.content)===pending.sha256&&r.sha256===pending.sha256&&artifact.sha256===pending.sha256&&artifact.byte_length===new TextEncoder().encode(artifact.content).length&&artifact.byte_length===pending.byte_length,'artifact content mismatch');
    return {id:artifact.id,version:artifact.version,sha256:pending.sha256,receipt_id:r.id,readback_status:'verified',partial:pending.partial};
  }
  return {build,validateReadback};
})();
if(typeof module!=='undefined')module.exports=InterviewJourneyPack;
