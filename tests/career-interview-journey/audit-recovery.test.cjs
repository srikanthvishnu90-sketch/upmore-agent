'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./fixtures.cjs'),{session}=require('./scripted-host.cjs');
const C=require('../../packages/career-interview-journey/adapters/context.js');
function outcome(s,status='failed',failure_kind='checker_rejected',budget_state='settled',id='outcome'){
  const p=s.state.checkpoint.pending_reasoning||s.state.checkpoint.reasoning_recovery?.request;
  s.snapshot.receipts.push({id,type:'reasoning_outcome',owner_id:s.snapshot.owner_id,thread_id:s.snapshot.thread_id,epoch:s.snapshot.binding.epoch,action_id:p.action_id,input_digest:p.input_digest,request_digest:p.request_digest,request_binding:p.expected_binding,validated_binding:C.binding(s.snapshot,s.state.revision),outcome_status:status,failure_kind,budget_state,reservation_ref:'synthetic-paired-reservation',usage_receipt_refs:['synthetic-generation-usage','synthetic-checker-usage']});
  return s.turn('reasoning_result',{action_id:p.action_id,receipt_id:id});
}
test('admitted checker rejection settles pending state and permits one explicitly requested fresh assessment',()=>{
  const s=session();s.start();s.answer('Exact answer before rejection.');const old=s.state.checkpoint.pending_reasoning,candidate=s.candidate();const t=outcome(s);
  assert.equal(t.reply_plan.status,'failed');assert.equal(s.state.checkpoint.pending_reasoning,null);assert.equal(s.state.attempts[0].text,'Exact answer before rejection.');assert.equal(s.state.assessments.length,0);assert.equal(t.proposed_actions.length,0,'failed admission must not auto retry');
  s.turn('retry_assessment',{outcome_receipt_id:'outcome'});assert.equal(s.last.proposed_actions.filter(a=>a.type==='coach_answer').length,1);assert.notEqual(s.state.checkpoint.pending_reasoning.action_id,old.action_id);
  const late=s.turn('model_candidate',{action_id:old.action_id,receipt_id:'late',candidate});assert.equal(late.reply_plan.status,'stale_context');assert.ok(s.state.checkpoint.pending_reasoning);assert.equal(s.state.assessments.length,0);
});
for(const failure of ['generation_failed','checker_failed'])test('admitted '+failure+' preserves original answer and exposes a bounded recovery',()=>{const s=session();s.start();s.answer('Exact user input.');const t=outcome(s,'failed',failure);assert.equal(t.reply_plan.status,'failed');assert.equal(s.state.checkpoint.pending_reasoning,null);assert.equal(t.proposed_actions.length,0);assert.equal(s.state.attempts.length,1);s.answer('A revised account on a new turn.');assert.equal(s.last.proposed_actions.length,1);assert.equal(s.state.attempts.length,2);});
test('admitted timeout remains uncertain, observes the original action and cannot start another pair until a terminal host receipt',()=>{
  const s=session();s.start();s.answer('Original answer awaiting a checker.');const original=s.state.checkpoint.pending_reasoning;const t=outcome(s,'unknown','checker_timeout','uncertain');assert.equal(t.reply_plan.status,'unknown');assert.equal(s.state.checkpoint.pending_reasoning,null);assert.deepEqual(t.proposed_actions.map(a=>a.type),['read_action_status']);
  assert.throws(()=>s.turn('retry_assessment',{outcome_receipt_id:'outcome'}),/uncertain/);s.answer('Additional details are retained while cost is uncertain.');assert.equal(s.last.proposed_actions.length,0);assert.equal(s.state.attempts.length,2);assert.equal(s.state.checkpoint.reasoning_recovery.request.action_id,original.action_id);
  outcome(s,'failed','checker_timeout','settled','reconciled');s.turn('retry_assessment',{outcome_receipt_id:'reconciled'});assert.equal(s.last.proposed_actions[0].type,'coach_answer');
});
test('untrusted outcome fields and foreign or wrong-action receipts cannot release pending admission',()=>{const s=session();s.start();s.answer();const p=s.state.checkpoint.pending_reasoning;assert.throws(()=>s.turn('reasoning_result',{action_id:p.action_id,receipt_id:'forged',outcome_status:'failed',budget_state:'settled'}),/receipt/);assert.equal(s.state.checkpoint.pending_reasoning.action_id,p.action_id);});
module.exports={outcome};
