'use strict';
// Synthetic host receipts exercise state/accounting protocol only. No provider.
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./fixtures.cjs'),{session}=require('./scripted-host.cjs');
const C=require('../../packages/career-interview-journey/adapters/context.js');
function outcome(s,request,id,status='failed',budget='settled',patch={}){
  s.snapshot.receipts.push({id,type:'reasoning_outcome',owner_id:s.snapshot.owner_id,thread_id:s.snapshot.thread_id,epoch:s.snapshot.binding.epoch,action_id:request.action_id,input_digest:request.input_digest,request_digest:request.request_digest,request_binding:F.copy(request.expected_binding),validated_binding:C.binding(s.snapshot,s.state.revision),outcome_status:status,failure_kind:'checker_timeout',budget_state:budget,reservation_ref:'synthetic-reservation',usage_receipt_refs:['synthetic-usage'],...patch});
  return s.turn('reasoning_result',{action_id:request.action_id,receipt_id:id});
}
test('detached settlement authenticates the original request and remains passive while paused',()=>{
  const s=session();s.start();s.answer();const request=F.copy(s.state.checkpoint.pending_reasoning);s.turn('pause');const before=F.copy(s.state);
  assert.throws(()=>outcome(s,request,'forged','failed','settled',{input_digest:F.hash('another request')}),/binding mismatch/);
  assert.deepEqual(s.state,before);assert.equal(s.state.checkpoint.outstanding_reasoning.length,1);
  const settled=outcome(s,request,'terminal');assert.equal(settled.proposed_actions.length,0);assert.equal(s.state.status,'paused');assert.equal(s.state.checkpoint.outstanding_reasoning.length,0);
  const delayed=outcome(s,request,'delayed-unknown','unknown','uncertain');assert.equal(delayed.reply_plan.status,'stale_context');assert.equal(s.state.checkpoint.outstanding_reasoning.length,0);assert.equal(s.state.checkpoint.reasoning_recovery.receipt_id,'terminal');
  s.turn('resume');assert.equal(s.answer('An explicit new answer after settlement.').proposed_actions.length,1);
});
for(const kind of ['practice','revision','transfer'])test(`${kind} retry restores its exact guided checkpoint after selecting a different family`,()=>{
  const s=session();s.start();s.answer();s.deliver();s.turn('begin_practice');
  if(kind!=='practice'){s.answer('My contribution was proposing the change.','practice');s.deliver();s.turn('begin_revision');}
  if(kind==='transfer'){s.answer('I proposed it and observed one test batch.','revision');s.deliver();s.turn('begin_transfer');}
  s.answer('The exact saved answer for '+kind+'.',kind);const original=F.copy(s.state.checkpoint),request=F.copy(original.pending_reasoning),text=s.state.attempts.at(-1).text;
  outcome(s,request,'terminal-'+kind);s.turn('select_question',{question_id:'retry-design'});s.state=F.copy(s.state);
  const retry=s.turn('retry_assessment',{outcome_receipt_id:'terminal-'+kind}),input=retry.proposed_actions[0].args.request;
  assert.equal(s.state.checkpoint.active_question.id,original.active_question.id);assert.equal(s.state.checkpoint.next_exercise.id,original.next_exercise.id);assert.equal(s.state.checkpoint.next_exercise.assessment_id,original.next_exercise.assessment_id);assert.equal(input.attempt.text,text);assert.equal(input.attempt.question_id,input.question.id);assert.equal(input.attempt.rubric_id,input.question.rubric.id);
  s.deliver();assert.equal(s.state.stage,'feedback_ready');assert.equal(s.state.checkpoint.outstanding_reasoning.length,0);
});
test('legacy pending checkpoints acquire an outstanding reference before pause and JSON restart',()=>{
  const s=session();s.start();s.answer('LEGACY_ANSWER_BODY');const request=F.copy(s.state.checkpoint.pending_reasoning);
  delete s.state.checkpoint.outstanding_reasoning;const unhashed=F.copy(s.state);delete unhashed.content_sha256;s.state.content_sha256=F.hash(unhashed);
  s.turn('pause');s.state=F.copy(s.state);assert.equal(s.state.checkpoint.outstanding_reasoning[0].request.action_id,request.action_id);assert.doesNotMatch(JSON.stringify(s.state.checkpoint.outstanding_reasoning),/LEGACY_ANSWER_BODY/);
  outcome(s,request,'late-unknown','unknown','uncertain');s.turn('resume');assert.equal(s.answer('A saved additional answer.').reply_plan.status,'blocked');
});
