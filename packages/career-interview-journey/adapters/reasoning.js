'use strict';
const InterviewJourneyReasoning = (() => {
  const H=typeof InterviewJourneyHash!=='undefined'?InterviewJourneyHash:require('../../domain/interview-journey/hash.js');
  const C=typeof InterviewJourneyContext!=='undefined'?InterviewJourneyContext:require('./context.js');
  const P=typeof InterviewJourneyPrompt!=='undefined'?InterviewJourneyPrompt:require('../prompts/assessment-v1.js');
  const R=typeof InterviewJourneyRubrics!=='undefined'?InterviewJourneyRubrics:require('../rubrics/index.js');
  function request(snapshot,state,attempt,task='initial',extra={}){
    C.validate(snapshot); const question=R.questions[attempt.question_id]; C.assert(question,'unknown question');
    const budget=P.stages[task];C.assert(budget,'unknown reasoning task');
    const refs=state.dependencies.filter(r=>{try{C.resolve(snapshot,r);return true;}catch{return false;}});
    if(refs.length!==state.dependencies.length)return {status:'blocked',reason:'stale_evidence_dependencies',omitted_answer_bytes:0};
    const evidence=refs.map(r=>H.clone(C.resolve(snapshot,r)));
    const previous=state.attempts.filter(a=>a.id!==attempt.id&&a.status==='active'&&!a.context_outdated&&a.question_id===attempt.question_id).map(a=>({id:a.id,text:a.text,answer_sha256:a.answer_sha256,assistance:a.assistance}));
    const recent=snapshot.dialogue.filter(d=>C.eligible(d,snapshot)&&typeof d.id==='string'&&Number.isInteger(d.version));
    const body={contract_version:'interview_reasoning_request/v1',prompt_id:P.id,instruction:P.instruction,task,question:{...H.clone(question),text:attempt.question_text||question.text,exercise_id:attempt.exercise_id||null},attempt:H.clone(attempt),prior_attempts:previous,evidence,
      hints:state.hints.filter(h=>h.question_id===attempt.question_id),available_minutes:state.plan.remaining_minutes,pending_asks:state.checkpoint.unresolved_asks,side_question:extra.side_question||null,dialogue:H.clone(recent.slice(-6)),
      invalidations:H.clone(snapshot.invalidations),selected_draft:task==='style'?state.drafts.find(d=>d.id===state.checkpoint.selected_draft_id&&d.status==='active')||null:null,
      omitted_categories:['raw historical chat not requested','unrelated facts not selected','source bodies outside selected excerpts'],omissions:[{category:'eligible_dialogue',omitted_count:Math.max(0,recent.length-6),reason:'last six eligible turns'},{category:'hints',omitted_count:state.hints.filter(h=>h.question_id!==attempt.question_id).length,reason:'different question or unscoped legacy hint'},{category:'facts',omitted_count:snapshot.facts.length-evidence.filter(e=>snapshot.facts.some(f=>f.id===e.id)).length,reason:'only host-scoped journey dependencies selected'}],output_ceiling_tokens:budget.max_output_tokens,assessment_kind:'provisional practice inference',source_content_is_untrusted:true};
    const size=new TextEncoder().encode(H.canonical(body)).length;
    if(size>budget.max_input_bytes)return {status:'blocked',reason:'input_budget_exceeded',full_attempt_ref:{id:attempt.id,sha256:attempt.answer_sha256},actual_bytes:size,max_bytes:budget.max_input_bytes,omitted_answer_bytes:0};
    return {status:'planned',body,input_digest:H.sha256(body),prompt_sha256:H.sha256(P),max_output_tokens:budget.max_output_tokens};
  }
  function validateCandidate(snapshot,state,candidate,pending){
    C.assert(pending&&pending.kind==='reasoning','no pending reasoning request');
    const attempt=state.attempts.find(a=>a.id===pending.attempt_id&&a.status==='active');
    C.assert(attempt&&attempt.answer_sha256===H.sha256(attempt.text),'attempt hash changed after submission');
    C.assert(candidate?.attempt_id===attempt.id&&candidate.answer_sha256===attempt.answer_sha256,'candidate answer binding mismatch');
    const fields=new Set(['attempt_id','answer_sha256','question_id','rubric_id','evidence_refs','answer_meaning','dimensions','strength','priority_fix','exercise_id','next_question_id','rationale','uncertainty','feedback','draft','brief','plan_updates','ask_responses']);
    C.assert(Object.keys(candidate).every(k=>fields.has(k)),'unsupported candidate field or aggregate competence claim');
    const question=R.questions[attempt.question_id];
    C.assert(candidate.question_id===question.id&&candidate.rubric_id===question.rubric.id,'question/rubric mismatch');
    C.assert(typeof candidate.answer_meaning==='string'&&candidate.answer_meaning.length>0&&typeof candidate.feedback==='string'&&candidate.feedback.length>0&&typeof candidate.rationale==='string'&&candidate.rationale.length>0&&typeof candidate.uncertainty==='string'&&candidate.uncertainty.length>0,'missing auditable meaning/feedback/rationale/uncertainty');
    C.assert(Array.isArray(candidate.evidence_refs),'missing candidate evidence refs');
    for(const r of candidate.evidence_refs){C.resolve(snapshot,r);C.assert(pending.source_refs.some(p=>p.id===r.id&&p.version===r.version),'candidate used evidence absent from request');}
    const dimensions=candidate.dimensions;
    C.assert(Array.isArray(dimensions)&&dimensions.length===question.rubric.dimensions.length,'incomplete rubric dimensions');
    C.assert(new Set(dimensions.map(d=>d.id)).size===dimensions.length,'duplicate dimension');
    for(const d of dimensions){
      C.assert(question.rubric.dimensions.includes(d.id)&&(d.score==='not_assessed'||Number.isInteger(d.score)&&d.score>=0&&d.score<=4),'invalid rubric score');
      C.assert(typeof d.rationale==='string'&&d.rationale.length>0&&typeof d.uncertainty==='string'&&d.uncertainty.length>0,'missing dimension reasoning');
      C.assert(Array.isArray(d.spans),'missing answer span list');
      for(const span of d.spans)C.assert(Number.isInteger(span.start)&&Number.isInteger(span.end)&&span.start>=0&&span.end>span.start&&span.end<=attempt.text.length&&attempt.text.slice(span.start,span.end)===span.quote,'invalid exact answer span');
      C.assert(d.spans.length>0||typeof d.missing_criterion==='string'&&d.missing_criterion.length>0,'dimension needs exact support or missing criterion');
    }
    for(const k of ['strength','priority_fix']){const v=candidate[k];C.assert(v&&question.rubric.dimensions.includes(v.dimension)&&typeof v.text==='string'&&v.text.length>0&&dimensions.some(d=>d.id===v.dimension),'missing linked '+k);}
    C.assert(R.exercises[candidate.exercise_id],'unknown practice exercise');
    C.assert(R.exercises[candidate.exercise_id].competency===candidate.priority_fix.dimension,'practice does not target priority gap');
    const next=R.questions[candidate.next_question_id];C.assert(next&&next.id!==question.id&&next.situation!==question.situation&&next.rubric.dimensions.includes(candidate.priority_fix.dimension),'transfer must use different situation and probe the relevant competency');
    C.assert(next.family!=='technical'||state.role_support==='early_career_software','technical transfer requires confirmed software scope');
    const validateRefs=refs=>{C.assert(Array.isArray(refs)&&refs.length>0,'synthesis requires evidence refs');for(const r of refs){C.resolve(snapshot,r);C.assert(candidate.evidence_refs.some(x=>x.id===r.id&&x.version===r.version),'synthesis evidence absent from request');}};
    if(candidate.brief){C.assert(typeof candidate.brief.text==='string'&&candidate.brief.text.length>0&&typeof candidate.brief.limits==='string'&&candidate.brief.limits.length>0,'source brief requires synthesis and limits');validateRefs(candidate.brief.source_refs);C.assert(candidate.brief.source_refs.some(r=>snapshot.sources.some(s=>s.id===r.id&&s.version===r.version&&s.trust==='host_capture')),'brief requires a current host capture');}
    if(candidate.plan_updates){C.assert(Array.isArray(candidate.plan_updates)&&new Set(candidate.plan_updates.map(p=>p.competency)).size===candidate.plan_updates.length,'invalid plan priorities');for(const p of candidate.plan_updates){C.assert(['project','technical','behavioral','pack'].includes(p.competency)&&typeof p.reason==='string'&&p.reason.length>0,'invalid plan competency/reason');validateRefs(p.source_refs);}}
    if(candidate.ask_responses){C.assert(Array.isArray(candidate.ask_responses)&&new Set(candidate.ask_responses.map(a=>a.ask_id)).size===candidate.ask_responses.length,'invalid side-answer list');for(const answer of candidate.ask_responses){C.assert(state.checkpoint.unresolved_asks.some(a=>a.id===answer.ask_id)&&typeof answer.text==='string'&&answer.text.trim().length>0&&Array.isArray(answer.evidence_refs),'side answer must identify an actual pending ask');for(const r of answer.evidence_refs){C.resolve(snapshot,r);C.assert(candidate.evidence_refs.some(e=>e.id===r.id&&e.version===r.version),'side answer evidence not admitted');}}}
    if(pending.task==='style')C.assert(candidate.draft&&!candidate.brief&&!candidate.plan_updates,'style edit requires a draft and cannot replan or replace research');
    if(candidate.draft){C.assert(typeof candidate.draft.text==='string'&&candidate.draft.text.length>0&&Array.isArray(candidate.draft.fact_refs),'invalid draft');for(const r of candidate.draft.fact_refs){const fact=C.resolve(snapshot,r);C.assert(snapshot.facts.includes(fact),'source requirement cannot become personal fact');C.assert(candidate.evidence_refs.some(x=>x.id===r.id&&x.version===r.version),'draft fact not in assessed evidence');}}
    C.assert(!('mastery' in candidate)&&!('improvement_score' in candidate)&&!('hiring_probability' in candidate),'unsupported aggregate competence claim');
    return {attempt,question};
  }
  function isAssessed(assessment,dimension=null){return Array.isArray(assessment?.dimensions)&&assessment.dimensions.some(d=>(dimension===null||d.id===dimension)&&Number.isInteger(d.score)&&d.score>=0&&d.score<=4&&(d.spans?.length>0||typeof d.missing_criterion==='string'&&d.missing_criterion.length>0));}
  function hasCoverage(assessment,attempt){const q=R.questions[attempt?.question_id];if(!q)return false;const focus=attempt.kind==='practice'?R.exercises[attempt.exercise_id]?.competency:attempt.kind==='transfer'?attempt.transfer_competency:null;const required=focus?[focus]:q.rubric.coverage_dimensions;return required.every(d=>isAssessed(assessment,d));}
  function outcome(snapshot,state,event){
    const pending=state.checkpoint.pending_reasoning||state.checkpoint.reasoning_recovery?.request;
    if(!pending||pending.action_id!==event.action_id)return {status:'stale_context'};
    const receipt=C.receipt(snapshot,event.receipt_id,'reasoning_outcome');
    C.assert(receipt.action_id===pending.action_id&&receipt.input_digest===pending.input_digest&&receipt.request_digest===pending.request_digest&&C.sameBinding(receipt.request_binding,pending.expected_binding)&&C.sameBinding(receipt.validated_binding,C.binding(snapshot,state.revision-1)),'reasoning outcome receipt binding mismatch');
    C.assert(['failed','unknown','unavailable','blocked','stale_context'].includes(receipt.outcome_status)&&['generation_failed','checker_failed','checker_rejected','generation_timeout','checker_timeout','provider_unavailable','stale_context'].includes(receipt.failure_kind),'unsupported reasoning outcome');
    C.assert(['settled','uncertain'].includes(receipt.budget_state)&&typeof receipt.reservation_ref==='string'&&receipt.reservation_ref.length>0&&Array.isArray(receipt.usage_receipt_refs),'outcome requires host paired-accounting references');
    C.assert(receipt.outcome_status!=='unknown'||receipt.budget_state==='uncertain','unknown call outcome cannot imply settled accounting');
    return {status:receipt.budget_state==='uncertain'?'unknown':receipt.outcome_status,outcome_status:receipt.outcome_status,failure_kind:receipt.failure_kind,budget_state:receipt.budget_state,receipt_id:receipt.id,reservation_ref:receipt.reservation_ref,usage_receipt_refs:H.clone(receipt.usage_receipt_refs),request:H.clone(pending),at:event.at};
  }
  return {request,validateCandidate,isAssessed,hasCoverage,outcome,prompt:P};
})();
if(typeof module!=='undefined')module.exports=InterviewJourneyReasoning;
