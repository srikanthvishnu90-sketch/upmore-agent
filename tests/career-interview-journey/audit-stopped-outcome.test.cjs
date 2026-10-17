'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {session}=require('./scripted-host.cjs'),C=require('../../packages/career-interview-journey/adapters/context.js');
test('late uncertain accounting after user stop remains passive and cannot start a status-read loop',()=>{
  const s=session();s.start();s.answer();const pending=s.state.checkpoint.pending_reasoning;
  const receipt=id=>({id,type:'reasoning_outcome',owner_id:s.snapshot.owner_id,thread_id:s.snapshot.thread_id,epoch:s.snapshot.binding.epoch,action_id:pending.action_id,input_digest:pending.input_digest,request_digest:pending.request_digest,request_binding:pending.expected_binding,validated_binding:C.binding(s.snapshot,s.state.revision),outcome_status:'unknown',failure_kind:'checker_timeout',budget_state:'uncertain',reservation_ref:'synthetic-reservation',usage_receipt_refs:[]});
  s.snapshot.receipts.push(receipt('first-unknown'));s.turn('reasoning_result',{action_id:pending.action_id,receipt_id:'first-unknown'});s.turn('stop');s.snapshot.receipts.push(receipt('late-unknown'));const late=s.turn('reasoning_result',{action_id:pending.action_id,receipt_id:'late-unknown'});
  assert.equal(late.proposed_actions.length,0);assert.equal(s.state.status,'partial_at_user_stop');assert.equal(s.state.checkpoint.reasoning_recovery.budget_state,'uncertain');assert.equal(s.state.assessments.length,0);
});
