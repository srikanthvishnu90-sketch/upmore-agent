'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./fixtures.cjs'),{session}=require('./scripted-host.cjs');
const C=require('../../packages/career-interview-journey/adapters/context.js');
function result(s,request,{id,status='unknown',budget='uncertain'}={}){
  s.snapshot.receipts.push({id,type:'reasoning_outcome',owner_id:s.snapshot.owner_id,thread_id:s.snapshot.thread_id,epoch:s.snapshot.binding.epoch,action_id:request.action_id,input_digest:request.input_digest,request_digest:request.request_digest,request_binding:F.copy(request.expected_binding),validated_binding:C.binding(s.snapshot,s.state.revision),outcome_status:status,failure_kind:'checker_timeout',budget_state:budget,reservation_ref:'synthetic-paired-reservation',usage_receipt_refs:['synthetic-usage']});
  return s.turn('reasoning_result',{action_id:request.action_id,receipt_id:id});
}
test('company correction sanitizes a paused practice whose supporting assessment became stale',()=>{
  const s=session();s.start();s.turn('submit_answer',{text:'I proposed the import change; my teammate implemented it.',source_refs:[{id:'project',version:1}],scripted:true});s.deliver(s.candidate({evidence_refs:[{id:'project',version:1}]}));s.turn('begin_practice');s.turn('pause');
  const target=s.snapshot.facts.find(f=>f.id==='target');target.version++;target.value={...target.value,company:'Other Synthetic Tools'};s.snapshot.binding.context_sha256=F.hash('changed company only');s.snapshot.invalidations=[{id:'company-change',kind:'target_changed',evidence_id:target.id,previous_version:1}];
  s.turn('context_changed',{invalidation_ids:['company-change'],target_ref:{id:target.id,version:target.version}});s.state=F.copy(s.state);s.turn('resume');
  assert.throws(()=>s.turn('submit_answer',{kind:'practice',text:'My contribution was the proposal.',scripted:true}),e=>!(e instanceof TypeError)&&/practice.*(?:assessment|exercise|checkpoint)/i.test(e.message),'stale practice must reject before dereferencing an exercise');
  assert.equal(s.state.stage,'awaiting_answer');assert.equal(s.state.attempts[0].status,'active');assert.equal(s.state.attempts[0].context_outdated,false);assert.equal(s.state.assessments[0].status,'stale');assert.equal(s.state.checkpoint.pending_reasoning,null);
  const fresh=s.answer('I proposed the change; I did not implement it.');assert.equal(fresh.proposed_actions[0].args.request.question.id,'project-narrative');
});
test('retrying a failed saved project answer restores its matching question and rubric after an exercise switch',()=>{
  const s=session();s.start();s.answer();const request=F.copy(s.state.checkpoint.pending_reasoning);result(s,request,{id:'failed-project',status:'failed',budget:'settled'});s.turn('select_question',{question_id:'retry-design'});
  const t=s.turn('retry_assessment',{outcome_receipt_id:'failed-project'}),input=t.proposed_actions[0].args.request;
  assert.equal(s.state.checkpoint.active_question.id,'project-narrative');assert.equal(s.state.checkpoint.active_question.rubric.id,input.attempt.rubric_id);assert.equal(input.question.id,s.state.checkpoint.active_question.id);assert.equal(input.question.rubric.id,input.attempt.rubric_id);
  s.deliver();s.turn('begin_practice');assert.equal(s.state.checkpoint.active_question.family,'project');assert.equal(s.state.checkpoint.next_exercise.competency,'personal_contribution');
});
for(const control of ['pause','stop'])for(const unknownFirst of [false,true])test(`${control}: first unknown ${unknownFirst?'before':'after'} control keeps the detached action fenced through restart`,()=>{
  const s=session();s.start();s.answer('ORIGINAL_SYNTHETIC_ANSWER');const request=F.copy(s.state.checkpoint.pending_reasoning),candidate=s.candidate();
  if(unknownFirst)result(s,request,{id:'first-unknown'});s.turn(control);s.state=F.copy(s.state);
  if(!unknownFirst){const unknown=result(s,request,{id:'first-unknown'});assert.equal(unknown.reply_plan.status,'unknown');assert.equal(unknown.proposed_actions.length,0);}
  s.turn('resume');s.turn('select_question',{question_id:'retry-design'});const blocked=s.answer('Additional technical reasoning is retained.');assert.equal(blocked.proposed_actions.length,0);assert.equal(blocked.reply_plan.status,'blocked');assert.equal(s.state.attempts.length,2);assert.equal(s.state.attempts[0].text,'ORIGINAL_SYNTHETIC_ANSWER');
  const terminal=result(s,request,{id:'settled',status:'failed',budget:'settled'});assert.equal(terminal.proposed_actions.length,0);assert.equal(s.state.checkpoint.active_question.id,'retry-design');
  const admitted=s.answer('A new explicitly submitted technical answer.');assert.equal(admitted.proposed_actions.filter(a=>a.type==='coach_answer').length,1);const current=s.state.checkpoint.pending_reasoning.action_id;
  const late=s.turn('model_candidate',{action_id:request.action_id,receipt_id:'old-model-result',candidate});assert.equal(late.reply_plan.status,'stale_context');assert.equal(s.state.checkpoint.pending_reasoning.action_id,current);
});
test('a detached request blocks a fresh pair even before the first outcome exists',()=>{
  const s=session();s.start();s.answer('ANSWER_NOT_ALLOWED_IN_TOMBSTONE');const request=F.copy(s.state.checkpoint.pending_reasoning);s.turn('pause');s.turn('resume');const blocked=s.answer('New details while the first action is unsettled.');
  assert.equal(blocked.proposed_actions.length,0);assert.equal(blocked.reply_plan.status,'blocked');assert.doesNotMatch(JSON.stringify(s.state.checkpoint.outstanding_reasoning),/ANSWER_NOT_ALLOWED_IN_TOMBSTONE/);
  result(s,request,{id:'settled-before-call',status:'blocked',budget:'settled'});assert.equal(s.answer('After a terminal host outcome.').proposed_actions.length,1);
});
module.exports={result};
