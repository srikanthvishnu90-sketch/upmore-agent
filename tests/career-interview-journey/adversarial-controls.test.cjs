'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./fixtures.cjs'),{session}=require('./scripted-host.cjs'),C=require('../../packages/career-interview-journey/adapters/context.js');
test('stop dominates subsequent pause controls until an explicit resume',()=>{
  const s=session();s.start();s.turn('pause');s.turn('stop');s.turn('pause');s.turn('stop');assert.equal(s.state.status,'partial_at_user_stop');assert.equal(s.state.checkpoint.interruption_stack.length,1);s.state=F.copy(s.state);s.turn('resume');assert.equal(s.state.status,'active');assert.equal(s.state.checkpoint.interruption_stack.length,0);
});
test('resume consumes legacy duplicate pause frames without rewinding an active selection',()=>{
  const s=session();s.start();s.turn('pause');const frame=F.copy(s.state.checkpoint.interruption_stack[0]);s.state.checkpoint.interruption_stack.push(F.copy(frame),F.copy(frame));const old=F.copy(s.state);delete old.content_sha256;s.state.content_sha256=F.hash(old);s.state=F.copy(s.state);
  s.turn('resume');assert.equal(s.state.checkpoint.interruption_stack.length,0);s.turn('select_question',{question_id:'retry-design'});s.turn('resume');assert.equal(s.state.checkpoint.active_question.id,'retry-design');
});
test('stale evidence permits pause and authenticated settlement while rejecting foreign receipts and content work',()=>{
  const s=session();s.start();s.answer('The original synthetic answer.');const pending=F.copy(s.state.checkpoint.pending_reasoning);s.snapshot.facts.find(f=>f.id==='resume').version++;s.snapshot.binding.thread_revision++;s.snapshot.binding.context_sha256=F.hash('new source awaiting typed invalidation');
  s.turn('pause');assert.equal(s.state.status,'paused');const before=F.copy(s.state);
  const receipt={id:'foreign-stale-settlement',type:'reasoning_outcome',owner_id:'synthetic-foreign-owner',thread_id:s.snapshot.thread_id,epoch:s.snapshot.binding.epoch,action_id:pending.action_id,input_digest:pending.input_digest,request_digest:pending.request_digest,request_binding:pending.expected_binding,validated_binding:C.binding(s.snapshot,s.state.revision),outcome_status:'failed',failure_kind:'checker_timeout',budget_state:'settled',reservation_ref:'synthetic-paired-reservation',usage_receipt_refs:['synthetic-usage']};s.snapshot.receipts.push(receipt);
  assert.throws(()=>s.turn('reasoning_result',{action_id:pending.action_id,receipt_id:receipt.id}),/foreign/);assert.deepEqual(s.state,before);assert.equal(s.state.checkpoint.outstanding_reasoning.length,1);
  s.snapshot.receipts.push({...receipt,id:'owned-stale-settlement',owner_id:s.snapshot.owner_id});const settled=s.turn('reasoning_result',{action_id:pending.action_id,receipt_id:'owned-stale-settlement'});assert.equal(settled.reply_plan.status,'failed');assert.equal(settled.proposed_actions.length,0);assert.equal(s.state.checkpoint.outstanding_reasoning.length,0);assert.equal(s.state.status,'paused');
  const blocked=s.answer('This text must await the typed invalidation.');assert.equal(blocked.reply_plan.status,'stale_context');assert.equal(blocked.proposed_actions.length,0);assert.equal(s.state.attempts.length,1);
});
