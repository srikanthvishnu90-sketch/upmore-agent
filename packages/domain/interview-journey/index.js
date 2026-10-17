'use strict';
const CareerInterviewJourney = (() => {
  const H=typeof InterviewJourneyHash!=='undefined'?InterviewJourneyHash:require('./hash.js');
  const C=typeof InterviewJourneyContext!=='undefined'?InterviewJourneyContext:require('../../career-interview-journey/adapters/context.js');
  const R=typeof InterviewJourneyRubrics!=='undefined'?InterviewJourneyRubrics:require('../../career-interview-journey/rubrics/index.js');
  const M=typeof InterviewJourneyReasoning!=='undefined'?InterviewJourneyReasoning:require('../../career-interview-journey/adapters/reasoning.js');
  const Research=typeof InterviewJourneyResearch!=='undefined'?InterviewJourneyResearch:require('../../career-interview-journey/adapters/research.js');
  const Pack=typeof InterviewJourneyPack!=='undefined'?InterviewJourneyPack:require('./pack.js');
  const VERSION='interview_journey_state/v1';
  const stages=['intake','research_pending','plan_ready','awaiting_answer','feedback_ready','targeted_practice','awaiting_revision','transfer_check','pack_ready','completed'];
  function roleSupport(target){return target?.role_family==='software_engineering'&&target?.level==='early-career'?'early_career_software':target?.role_family&&target.role_family!=='software_engineering'||target?.level&&target.level!=='early-career'?'unsupported_full_slice':'generic_project_only';}
  function contentHash(s){const copy=H.clone(s);delete copy.content_sha256;return H.sha256(copy);}
  function recordHash(record){const copy=H.clone(record);delete copy.content_sha256;return H.sha256(copy);}
  function validateState(s){
    C.assert(s?.schema_version===VERSION&&stages.includes(s.stage),'invalid journey schema/stage');
    C.assert(s.content_sha256===contentHash(s),'journey state integrity mismatch');
    C.assert(Number.isSafeInteger(s.revision)&&s.revision>0,'invalid journey revision');
    C.assert(s.stage!=='completed'||s.completion?.artifact?.readback_status==='verified'&&s.completion.artifact.partial===false,'completed journey requires verified non-partial artifact readback');
    C.assert(new Set(s.attempts.map(a=>a.id)).size===s.attempts.length,'duplicate attempt');
    for(const a of s.attempts)if(a.status!=='withdrawn')C.assert(a.answer_sha256===H.sha256(a.text),'attempt integrity mismatch');
    for(const a of s.assessments)if(a.status==='active')C.assert(s.attempts.some(t=>t.id===a.attempt_id&&t.answer_sha256===a.answer_sha256&&t.question_id===a.question_id&&t.rubric_id===a.rubric_id),'assessment no longer binds immutable attempt');
    for(const r of [...s.attempts,...s.assessments,...s.drafts,...s.observations,...s.briefs])C.assert(r.owner_id===s.owner_id&&r.thread_id===s.thread_id&&r.journey_id===s.journey_id&&r.epoch===s.epoch&&r.content_sha256===recordHash(r),'record owner/epoch/integrity mismatch');
    C.assert(s.plan.items.every(i=>Number.isInteger(i.minutes)&&i.minutes>0),'invalid plan duration');
    if(s.plan.remaining_minutes!==null)C.assert(s.plan.items.reduce((n,i)=>n+i.minutes,0)<=s.plan.remaining_minutes,'plan exceeds declared budget');
    return s;
  }
  function allocate(s){
    const total=s.constraints.available_minutes, remaining=total===null?null:Math.max(0,total-s.constraints.spent_minutes);
    const template=[['project',20,'Ground a truthful narrative in actual experience.'],['technical',35,'Practice role-relevant correctness and recovery reasoning.'],['behavioral',20,'Separate personal contribution, team decisions and evidence.'],['pack',10,'Review and save current evidence with unassessed gaps explicit.']];
    if(s.role_support!=='early_career_software')template.splice(1,1);
    const priorities=s.plan_priorities||[];template.sort((a,b)=>{const ai=priorities.findIndex(p=>p.competency===a[0]),bi=priorities.findIndex(p=>p.competency===b[0]);return (ai<0?100:ai)-(bi<0?100:bi);});
    const items=[],deferrals=[];
    if(remaining===null)return {remaining_minutes:null,items,deferrals:['Preparation time unknown; ask for minutes now without inferring from the interview date.']};
    let left=remaining;
    for(let i=0;i<template.length;i++){
      const [competency,max,reason]=template[i],fraction=[0.27,0.36,0.23,1][i];
      const minutes=Math.min(max,i===3?left:Math.floor(remaining*fraction),left);
      const priority=priorities.find(p=>p.competency===competency);
      if(minutes>=1){items.push({id:'plan-'+competency,competency,minutes,reason:priority?.reason||reason,source_refs:H.clone(priority?.source_refs||s.dependencies),reason_kind:priority?'checked_advisory_priority':'provisional_slice_coverage'});left-=minutes;}
      if(minutes<max)deferrals.push(competency+': extended work deferred to fit the declared remaining time.');
    }
    deferrals.push('Current company research requires an approved source/capture; missing research does not block experience practice.');
    return {remaining_minutes:remaining,items,deferrals};
  }
  function initial(snapshot,event){
    const target=event.target_ref?C.resolve(snapshot,event.target_ref):null,resume=event.resume_ref?C.resolve(snapshot,event.resume_ref):null;
    C.assert(!target||target.kind==='target','target reference kind mismatch');C.assert(!resume||resume.kind==='resume','resume reference kind mismatch');
    const minutes=event.available_minutes??null;C.assert(minutes===null||Number.isInteger(minutes)&&minutes>=0&&minutes<=1440,'invalid minutes now');
    C.assert(['coaching','mock'].includes(event.mode||'coaching'),'invalid interview mode');
    const dependencies=snapshot.facts.filter(f=>['target','resume','project','experience','interview_guidance'].includes(f.kind)).map(C.ref);
    const s={schema_version:VERSION,owner_id:snapshot.owner_id,thread_id:snapshot.thread_id,journey_id:event.journey_id,epoch:snapshot.binding.epoch,revision:0,created_at:event.at,updated_at:event.at,status:'active',stage:'intake',context_binding:H.clone(snapshot.binding),target_ref:event.target_ref||null,target:target?H.clone(target.value):null,role_support:roleSupport(target?.value),resume_ref:event.resume_ref||null,mode:event.mode||'coaching',dependencies,
      constraints:{available_minutes:minutes,spent_minutes:0,interview_at:event.interview_at||null,daily_study_minutes:event.daily_study_minutes??null,logistics:[],unknowns:[...(!target?['target role']:[]),...(!resume?['selected resume']:[]),...(minutes===null?['minutes available now']:[]),...(!target?.value?.company?['company']:[]),...(!target?.value?.stage?['interview stage']:[])]},
      checkpoint:{active_question:null,active_attempt_id:null,pending_reasoning:null,pending_research:null,pending_artifact:null,interruption_stack:[],unresolved_asks:[],selected_draft_id:null},plan:null,plan_priorities:[],briefs:[],attempts:[],assessments:[],drafts:[],observations:[],hints:[],research:[],invalidations:[],processed_events:[],completion:{artifact:null,unmet_conditions:['No saved/readable artifact']}};
    C.assert(typeof s.journey_id==='string'&&s.journey_id.length>0,'journey id required');s.plan=allocate(s);return s;
  }
  function action(snapshot,s,event,type,args,source_refs=[],capability_id=null){
    const capability=capability_id?C.capability(snapshot,capability_id):{status:'available'};
    if(capability.status!=='available')return {blocked:{status:capability.status,reason:capability.reason,capability_id}};
    const expected_binding=C.binding(snapshot,s.revision-1),input_digest=H.sha256(args),key=H.sha256({journey:s.journey_id,event:event.id,type,input_digest});
    return {proposal:{contract_version:'career_journey_action/v1',action_id:'ij-'+key.slice(0,24),type,owner_id:s.owner_id,thread_id:s.thread_id,expected_binding,idempotency_key:key,input_digest,source_refs:H.clone(source_refs),capability_id,args:H.clone(args),approval_requirement:'host_derived'}};
  }
  function planInterviewTurn({snapshot,state,event}){
    C.validate(snapshot);C.assert(event&&typeof event.id==='string'&&typeof event.type==='string'&&Number.isFinite(Date.parse(event.at)),'invalid host event');
    const digest=H.sha256(event);
    if(state){validateState(state);C.assert(state.owner_id===snapshot.owner_id&&state.thread_id===snapshot.thread_id,'journey owner/thread scope mismatch');
      if(state.last_event?.id===event.id&&state.epoch===snapshot.binding.epoch&&C.sameBinding(state.context_binding,snapshot.binding)){C.assert(state.last_event.input_digest===digest,'same event key changed input');return {expected_binding:H.clone(state.last_event.expected_binding),next_state:H.clone(state),reply_plan:H.clone(state.last_event.reply_plan),proposed_actions:H.clone(state.last_event.proposed_actions)};}}
    let s=state?H.clone(state):initial(snapshot,event);
    C.assert(state||event.type==='start','start event required');
    const expected=C.binding(snapshot,s.revision),actions=[];let reply={status:'planned',text:'',unresolved_asks:[]};
    const emit=(type,args,refs=[],cap=null)=>{const a=action(snapshot,s,event,type,args,refs,cap);if(a.blocked){reply={...reply,...a.blocked};return null;}actions.push(a.proposal);return a.proposal;};
    const ask=(id,stage='awaiting_answer')=>{const q=R.questions[id];C.assert(q,'unknown question');s.stage=stage;s.checkpoint.active_question=H.clone(q);emit('ask_question',{question_id:q.id,text:q.text,representative_practice:true,rubric_id:q.rubric.id});};
    const reasoning=(attempt,task,extra={})=>{Object.assign(attempt,{owner_id:s.owner_id,thread_id:s.thread_id,journey_id:s.journey_id,epoch:s.epoch});attempt.content_sha256=recordHash(attempt);const req=M.request(snapshot,s,attempt,task,extra);if(req.status==='blocked'){reply={status:'blocked',reason:req.reason,text:'The complete answer does not fit the admitted request. Your exact attempt is retained; provide a shorter version or request a separately admitted evidence read.',request:req};return;}
      const a=emit('coach_answer',{request:req.body,prompt_sha256:req.prompt_sha256,max_output_tokens:req.max_output_tokens},s.dependencies,'interview.coach.v1');
      if(a)s.checkpoint.pending_reasoning={kind:'reasoning',action_id:a.action_id,input_digest:a.input_digest,request_digest:req.input_digest,attempt_id:attempt.id,source_refs:H.clone(s.dependencies),expected_binding:a.expected_binding,task,turn_id:event.id};};
    s.revision++;s.updated_at=event.at;s.context_binding=H.clone(snapshot.binding);
    const changesContent=['time_change','context_changed','submit_answer','style_edit','select_question','read_source'].includes(event.type)||(event.type==='model_candidate'&&s.checkpoint.pending_reasoning&&event.action_id===s.checkpoint.pending_reasoning.action_id)||(event.type==='tool_result'&&s.checkpoint.pending_research);
    if(changesContent&&s.completion.artifact){s.completion={artifact:null,unmet_conditions:['Journey changed; build and reopen a current pack']};if(s.stage==='completed'||s.stage==='pack_ready')s.stage='plan_ready';}
    if(state&&snapshot.binding.epoch!==state.epoch){
      C.assert(snapshot.binding.epoch>state.epoch,'context epoch moved backward');
      s=initial(snapshot,{...event,journey_id:state.journey_id,available_minutes:null,mode:state.mode});s.revision=state.revision+1;s.epoch=snapshot.binding.epoch;s.status='cancelled';s.stage='intake';reply={status:'stale_context',text:'Previous journey data belongs to an erased epoch. Start again from current authorized evidence.'};
    }else if(event.type!=='context_changed'&&s.dependencies.some(r=>{try{C.resolve(snapshot,r);return false;}catch{return true;}})){
      s.checkpoint.pending_reasoning=null;s.checkpoint.pending_artifact=null;s.completion={artifact:null,unmet_conditions:['Evidence changed; apply typed invalidations and reopen a current pack']};if(s.stage==='completed')s.stage='plan_ready';reply={status:'stale_context',text:'Evidence versions changed. Apply the host typed invalidation before continuing or creating an artifact.'};
    }else if(state?.processed_events.some(e=>e.id===event.id)){
      const old=state.processed_events.find(e=>e.id===event.id);C.assert(old.input_digest===digest,'same event key changed input');reply={status:'blocked',reason:'already_processed',text:'This event was already processed. Use the host committed replay receipt.'};
    }else if(event.type==='start'){
      C.assert(!state,'journey already started');ask('project-narrative');reply.text='Let’s begin with one real project. These are representative practice questions; company/stage gaps remain explicit.';
      if(s.constraints.available_minutes===null)s.checkpoint.unresolved_asks.push('How many minutes do you have now?');
      if(s.role_support!=='early_career_software'){reply.status=s.role_support==='unsupported_full_slice'?'unsupported':'needs_clarification';reply.text='We can practice your real project. Full role-specific coverage requires a confirmed early-career software target; this module does not infer a role family from a title.';}
    }else if(event.type==='pause'){
      s.checkpoint.interruption_stack.push({stage:s.stage,active_question:s.checkpoint.active_question,active_attempt_id:s.checkpoint.active_attempt_id,unresolved_asks:H.clone(s.checkpoint.unresolved_asks)});s.status='paused';s.checkpoint.pending_reasoning=null;reply.text='Paused. Your question, attempts and unfinished asks are saved.';
    }else if(event.type==='resume'){
      const prior=s.checkpoint.interruption_stack.pop();if(prior)Object.assign(s.checkpoint,prior); // stage belongs to state, not checkpoint
      if(prior){s.stage=prior.stage;delete s.checkpoint.stage;}s.status='active';reply.text='Resuming the saved question and latest valid draft.';
      if(s.checkpoint.active_question)emit('ask_question',{question_id:s.checkpoint.active_question.id,text:s.checkpoint.active_question.text,representative_practice:true});
    }else if(event.type==='stop'){
      s.status='partial_at_user_stop';s.checkpoint.pending_reasoning=null;s.checkpoint.pending_research=null;reply.text='Stopped. Progress is retained; a requested pack will label unfinished work.';
    }else if(event.type==='time_change'){
      C.assert(Number.isInteger(event.available_minutes)&&event.available_minutes>=0&&event.available_minutes<=1440,'invalid minutes now');s.constraints.available_minutes=event.available_minutes;s.plan=allocate(s);reply.text='Future preparation has been reallocated; completed work is retained.';
    }else if(event.type==='context_changed'){
      const ids=event.invalidation_ids||[];C.assert(ids.length>0&&ids.every(id=>snapshot.invalidations.some(i=>i.id===id)),'correction must refer to host typed invalidations');
      const invalidations=snapshot.invalidations.filter(i=>ids.includes(i.id));
      const affected=new Set(invalidations.map(i=>i.evidence_id));C.assert(invalidations.every(i=>['correction','withdrawal','resume_replaced','target_changed'].includes(i.kind)),'unsupported invalidation kind');
      const touches=refs=>(refs||[]).some(r=>affected.has(r.id));
      for(const a of s.attempts)if(touches(a.source_refs)){a.context_outdated=true;if(invalidations.some(i=>i.kind==='withdrawal'&&a.source_refs.some(r=>r.id===i.evidence_id))){delete a.text;a.status='withdrawn';}}
      s.assessments=s.assessments.map(a=>touches(a.source_refs)?invalidations.some(i=>i.kind==='withdrawal')?{id:a.id,version:a.version,status:'withdrawn',attempt_id:a.attempt_id,source_refs:a.source_refs}:{...a,status:'stale'}:a);
      s.drafts=s.drafts.map(d=>touches(d.source_refs||d.fact_refs)?invalidations.some(i=>i.kind==='withdrawal')?{id:d.id,version:d.version,status:'withdrawn',source_attempt_ids:d.source_attempt_ids,fact_refs:d.fact_refs,source_refs:d.source_refs||d.fact_refs}:{...d,status:'stale'}:d);
      s.research=s.research.filter(r=>!r.source_ref||!affected.has(r.source_ref.id));s.observations=s.observations.map(o=>touches(o.source_refs)?{id:o.id,status:'stale',kind:o.kind,source_refs:o.source_refs}:o);
      s.briefs=s.briefs.filter(b=>!touches(b.source_refs));s.plan_priorities=s.plan_priorities.filter(p=>!touches(p.source_refs));
      s.dependencies=s.dependencies.filter(r=>!affected.has(r.id));
      for(const i of invalidations){const fresh=[...snapshot.facts,...snapshot.sources].find(f=>f.id===i.evidence_id);if(fresh)s.dependencies.push(C.ref(fresh));}
      if(event.target_ref){s.target_ref=H.clone(event.target_ref);s.target=H.clone(C.resolve(snapshot,event.target_ref).value);}else if(s.target_ref&&affected.has(s.target_ref.id)){s.target=null;s.target_ref=null;}
      if(event.resume_ref)s.resume_ref=C.ref(C.resolve(snapshot,event.resume_ref));else if(s.resume_ref&&affected.has(s.resume_ref.id))s.resume_ref=null;
      s.checkpoint.selected_draft_id=s.drafts.find(d=>d.id===s.checkpoint.selected_draft_id&&d.status==='active')?.id||null;
      s.checkpoint.pending_reasoning=null;s.checkpoint.pending_artifact=null;delete s.checkpoint.next_exercise;delete s.checkpoint.next_transfer_question_id;
      if(invalidations.some(i=>i.kind==='withdrawal')){s.checkpoint.unresolved_asks=[];s.checkpoint.interruption_stack=[];}
      s.role_support=roleSupport(s.target);if(s.role_support!=='early_career_software'&&s.checkpoint.active_question?.family==='technical')s.checkpoint.active_question=H.clone(R.questions['project-narrative']);s.completion={artifact:null,unmet_conditions:['Context changed; build and reopen a current pack']};s.invalidations.push(...H.clone(invalidations));s.plan=allocate(s);s.status='active';s.stage='awaiting_answer';reply.text='Dependent feedback and drafts are stale. Independent research, time and original non-withdrawn attempts remain available as historical records.';
    }else if(event.type==='submit_answer'){
      C.assert(s.status==='active'&&s.checkpoint.active_question,'no active question');C.assert(!s.checkpoint.pending_reasoning,'one admitted assessment already pending');
      C.assert(typeof event.text==='string'&&event.text.trim().length>0&&['initial','practice','revision','transfer'].includes(event.kind||'initial'),'an explicit answer submission is required');
      if(!event.kind||event.kind==='initial')C.assert(s.stage==='awaiting_answer','initial answer requires awaiting_answer');
      const question=s.checkpoint.active_question;const parent=s.checkpoint.active_attempt_id;
      const attempt={id:s.journey_id+':attempt:'+event.id,version:1,question_id:question.id,question_text:event.kind==='practice'?s.checkpoint.next_exercise.text:question.text,exercise_id:event.kind==='practice'?s.checkpoint.next_exercise.id:null,rubric_id:question.rubric.id,rubric_version:1,kind:event.kind||'initial',text:event.text,answer_sha256:H.sha256(event.text),at:event.at,index:s.attempts.filter(a=>a.question_id===question.id).length+1,parent_attempt_id:parent,assistance:(event.kind==='transfer'||s.mode==='mock'&&!parent)?'none':s.hints.length||event.kind==='revision'||event.kind==='practice'?'coached':'none',source_refs:H.clone(s.dependencies),context_revision:snapshot.binding.thread_revision,scripted:event.scripted===true,status:'active',context_outdated:false};
      if(event.kind==='transfer')C.assert(s.stage==='transfer_check','transfer submission requires a transfer question');
      if(event.kind==='revision')C.assert(s.stage==='awaiting_revision','revision requires an active revision checkpoint');
      if(event.kind==='practice')C.assert(s.stage==='targeted_practice','practice requires a targeted exercise');
      s.attempts.push(attempt);s.checkpoint.active_attempt_id=attempt.id;
      if(event.side_question)s.checkpoint.unresolved_asks.push(event.side_question);
      if(event.minutes_spent!==undefined){C.assert(Number.isInteger(event.minutes_spent)&&event.minutes_spent>=0,'invalid reported time spent');s.constraints.spent_minutes+=event.minutes_spent;s.plan=allocate(s);}
      reasoning(attempt,event.kind==='revision'?'revision':event.kind==='transfer'?'transfer':'initial',{side_question:event.side_question});reply.text='Your exact answer is retained. Assessment awaits the admitted generation/checker pair.';
    }else if(event.type==='model_candidate'){
      const pending=s.checkpoint.pending_reasoning;
      if(!pending||event.action_id!==pending.action_id){reply={status:'stale_context',text:'Late or cancelled assessment ignored.'};}
      else{
        const receipt=C.receipt(snapshot,event.receipt_id,'semantic_candidate');
        C.assert(receipt.action_id===pending.action_id&&receipt.input_digest===pending.input_digest&&receipt.request_digest===pending.request_digest&&receipt.candidate_sha256===H.sha256(event.candidate)&&receipt.verdict==='accepted'&&C.sameBinding(receipt.request_binding,pending.expected_binding)&&C.sameBinding(receipt.validated_binding,C.binding(snapshot,s.revision-1)),'semantic host receipt mismatch');
        for(const ref of pending.source_refs)C.resolve(snapshot,ref);
        const {attempt,question}=M.validateCandidate(snapshot,s,event.candidate,pending),candidate=event.candidate;
        const assessment={...H.clone(candidate),id:s.journey_id+':assessment:'+event.id,version:1,status:'active',family:question.family,source_refs:H.clone(pending.source_refs),generator:receipt.generator,validation_receipt:receipt.id,judgment:'provisional practice inference',at:event.at};delete assessment.draft;s.assessments.push(assessment);
        if(candidate.brief)s.briefs.push({id:assessment.id+':brief',version:1,...H.clone(candidate.brief),status:'active',validation_receipt:receipt.id});
        if(candidate.plan_updates){s.plan_priorities=H.clone(candidate.plan_updates);s.plan=allocate(s);}
        if(candidate.draft){const draft={id:s.journey_id+':draft:'+event.id,version:1,text:candidate.draft.text,source_attempt_ids:[attempt.id],fact_refs:H.clone(candidate.draft.fact_refs),source_refs:H.clone(pending.source_refs),edits:pending.task==='style'?[{purpose:'user requested style revision'}]:[],status:'active',context_revision:snapshot.binding.thread_revision};s.drafts.push(draft);s.checkpoint.selected_draft_id=draft.id;}
        s.checkpoint.pending_reasoning=null;s.checkpoint.unresolved_asks=[];
        if(pending.task==='style'){reply.text=candidate.feedback;}
        else{
          s.stage='feedback_ready';s.checkpoint.next_exercise={...H.clone(R.exercises[candidate.exercise_id]),rationale:candidate.rationale,assessment_id:assessment.id};s.checkpoint.next_transfer_question_id=candidate.next_question_id;
          s.observations.push({id:assessment.id+':observation',kind:attempt.kind==='transfer'?'transfer':attempt.kind==='revision'?'same_question_revision':'initial',competency:candidate.priority_fix.dimension,assistance:attempt.assistance,status:'observed',outcome:'uncertain',attempt_id:attempt.id,assessment_id:assessment.id,source_refs:H.clone(pending.source_refs),uncertainty:candidate.uncertainty,at:event.at});
          reply.text=candidate.feedback;
        }
      }
    }else if(event.type==='begin_practice'){
      C.assert(s.stage==='feedback_ready'&&s.checkpoint.next_exercise,'feedback required before practice');const drill=s.checkpoint.next_exercise;
      if(s.plan.remaining_minutes!==null&&drill.minutes>s.plan.remaining_minutes){reply={status:'blocked',reason:'insufficient_time',text:'This drill exceeds your remaining time. Save a partial pack or change the time budget.'};}
      else{s.stage='targeted_practice';s.hints.push({id:event.id,text:drill.text,exercise_id:drill.id,at:event.at});reply.text=drill.text;emit('ask_question',{question_id:s.checkpoint.active_question.id,exercise_id:drill.id,text:drill.text,representative_practice:true});}
    }else if(event.type==='begin_revision'){
      C.assert(['feedback_ready','targeted_practice'].includes(s.stage)&&!s.checkpoint.pending_reasoning,'practice feedback must settle first');s.stage='awaiting_revision';reply.text='Revise your answer to the original question, addressing the priority gap. Your earlier attempt remains separate.';emit('ask_question',{question_id:s.checkpoint.active_question.id,text:reply.text,representative_practice:true});
    }else if(event.type==='begin_transfer'){
      C.assert(s.stage==='feedback_ready'&&s.attempts.some(a=>a.id===s.checkpoint.active_attempt_id&&a.kind==='revision'),'assessed revision required before transfer');ask(s.checkpoint.next_transfer_question_id,'transfer_check');s.checkpoint.active_attempt_id=null;reply.text='Try a different situation without the rewrite. This checks transfer separately from coached revision.';
    }else if(event.type==='select_question'){
      C.assert(!s.checkpoint.pending_reasoning,'settle/cancel pending assessment first');C.assert(['project-narrative','retry-design','team-decision'].includes(event.question_id),'unknown slice question');
      if(event.question_id==='retry-design'&&s.role_support!=='early_career_software')reply={status:'unsupported',text:'The software reasoning drill requires a confirmed early-career software target. General project practice remains available.'};
      else{s.checkpoint.active_attempt_id=null;ask(event.question_id);reply.text='Switching exercises. Your story bank and previous attempts are retained.';}
    }else if(event.type==='style_edit'){
      const draft=s.drafts.find(d=>d.id===s.checkpoint.selected_draft_id&&d.status==='active');C.assert(draft&&!s.checkpoint.pending_reasoning,'select a current draft before editing');
      const attempt=s.attempts.find(a=>draft.source_attempt_ids.includes(a.id));C.assert(attempt&&attempt.status==='active'&&!attempt.context_outdated,'draft attempt stale');C.assert(typeof event.instruction==='string'&&event.instruction.length>0,'style instruction required');
      s.checkpoint.unresolved_asks.push(event.instruction);reasoning(attempt,'style',{side_question:event.instruction});reply.text='The selected draft is retained while its style edit awaits validation.';
    }else if(event.type==='read_source'){
      C.assert(!s.checkpoint.pending_research,'research already pending');const source=C.resolve(snapshot,event.source_ref);
      C.assert(source.kind==='source'&&source.value?.approved_url&&/^https:\/\//.test(source.value.approved_url),'host-approved source URL required');
      const capability=C.capability(snapshot,'research.exact_url.v1');if(capability.status==='available')C.assert(capability.approved_sources?.some(a=>a.source_id===source.id&&a.version===source.version&&a.url===source.value.approved_url),'source URL lacks host capability approval');
      const a=emit('read_source',{source_ref:C.ref(source),requested_url:source.value.approved_url},[C.ref(source)],'research.exact_url.v1');
      if(a)s.checkpoint.pending_research={kind:'research',action_id:a.action_id,input_digest:a.input_digest,source_ref:C.ref(source),requested_url:source.value.approved_url,validation_revision:s.revision};reply.text='Research state is independent of practice. A queued task is not a captured source.';
    }else if(event.type==='tool_result'){
      const pending=s.checkpoint.pending_research;if(!pending){reply={status:'stale_context',text:'No current research action accepts this callback.'};}
      else{pending.validation_revision=s.revision-1;const result=Research.read(snapshot,event.result,pending);s.research.push(result);reply={status:result.status,text:result.reason||'Readable source capture received. Source synthesis still requires checked reasoning.'};if(result.status==='unknown')emit('read_action_status',{action_id:pending.action_id},[]);if(!['queued','running','unknown'].includes(result.status))s.checkpoint.pending_research=null;if(result.source_ref&&!s.dependencies.some(r=>r.id===result.source_ref.id))s.dependencies.push(result.source_ref);}
    }else if(event.type==='build_pack'){
      C.assert(!s.checkpoint.pending_reasoning,'settle assessment before pack');const built=Pack.build(snapshot,s);const a=emit('create_draft',{kind:'interview_prep_pack',...built},built.pack.source_refs,'interview.local_draft.v1');
      if(a){s.stage='pack_ready';s.checkpoint.pending_artifact={action_id:a.action_id,input_digest:a.input_digest,journey_revision:s.revision,sha256:built.manifest.sha256,byte_length:built.manifest.byte_length,partial:built.pack.status==='partial'};s.completion={artifact:null,unmet_conditions:built.pack.unmet_conditions.concat('Host save, authorized open and fresh-session readback required')};}reply.text='Preparation pack content assembled. Delivery is pending host persistence and readable authorized readback.';
    }else if(event.type==='artifact_readback'){
      const artifact=Pack.validateReadback(snapshot,s,event);s.completion.artifact=artifact;s.checkpoint.pending_artifact=null;
      if(!artifact.partial){s.stage='completed';s.status='active';s.completion.unmet_conditions=[];}else{s.stage='pack_ready';}reply.text=artifact.partial?'Your partial pack was reopened and verified; its remaining gaps are explicit.':'Your current preparation pack was reopened and verified.';
    }else if(event.type==='run_code'){
      reply={status:'not_wired',text:'No approved code-execution runner is wired to this journey. Technical feedback is static text reasoning only.'};
    }else if(event.type==='user_turn'){
      reply={status:'needs_confirmation',text:'Interpret this turn through the host into an explicit answer, style edit, task switch or control event. It has not been graded or used to reset evidence.'};
    }else{reply={status:'unsupported',text:'This journey supports interview preparation only. The preparation checkpoint is preserved.'};}
    s.processed_events.push({id:event.id,input_digest:digest});
    for(const record of [...s.attempts,...s.assessments,...s.drafts,...s.observations,...s.briefs]){Object.assign(record,{owner_id:s.owner_id,thread_id:s.thread_id,journey_id:s.journey_id,epoch:s.epoch});record.content_sha256=recordHash(record);}
    s.last_event={id:event.id,input_digest:digest,expected_binding:expected,reply_plan:H.clone(reply),proposed_actions:H.clone(actions)};
    s.content_sha256=contentHash(s);validateState(s);
    return {expected_binding:expected,next_state:s,reply_plan:reply,proposed_actions:actions};
  }
  return {planInterviewTurn,validateState,contentHash,allocate,version:VERSION};
})();
if(typeof module!=='undefined')module.exports=CareerInterviewJourney;
