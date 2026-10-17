'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('./fixtures.cjs');
const Journey = require('../../packages/domain/interview-journey/index.js');
test('pure start chooses one representative project question within the actual time budget', () => {
  const snapshot = F.snapshot(), before = F.copy(snapshot);
  const t = Journey.planInterviewTurn({ snapshot, state: null, event: F.start() });
  assert.deepEqual(snapshot, before);
  assert.equal(t.next_state.stage, 'awaiting_answer');
  assert.equal(t.next_state.checkpoint.active_question.family, 'project');
  assert.equal(t.proposed_actions.filter(a => a.type === 'ask_question').length, 1);
  assert.ok(t.next_state.plan.items.reduce((s, x) => s + x.minutes, 0) <= 30);
  assert.equal(t.next_state.constraints.interview_at, null);
});
test('pause and serialization preserve checkpoint and same-key retry is deterministic', () => {
  const snapshot = F.snapshot(), start = Journey.planInterviewTurn({ snapshot, state: null, event: F.start() });
  const paused = Journey.planInterviewTurn({ snapshot, state: start.next_state, event: F.event('pause', 'pause', { reason: 'another topic' }) });
  const saved = JSON.parse(JSON.stringify(paused.next_state));
  assert.equal(saved.status, 'paused');
  const resumed = Journey.planInterviewTurn({ snapshot, state: saved, event: F.event('resume', 'resume') });
  assert.deepEqual(resumed.next_state.checkpoint.active_question, start.next_state.checkpoint.active_question);
  assert.deepEqual(Journey.planInterviewTurn({ snapshot, state: resumed.next_state, event: F.event('resume', 'resume') }), resumed);
});
test('foreign snapshot and unsupported external actions never acquire authority', () => {
  const snapshot = F.snapshot(), t = Journey.planInterviewTurn({ snapshot, state: null, event: F.start() });
  const foreign = F.copy(snapshot); foreign.owner_id = 'synthetic-owner-b';
  assert.throws(() => Journey.planInterviewTurn({ snapshot: foreign, state: t.next_state, event: F.event('x', 'resume') }), /owner|scope/);
  const denied = Journey.planInterviewTurn({ snapshot, state: t.next_state, event: F.event('send', 'external_action', { action: 'send' }) });
  assert.equal(denied.reply_plan.status, 'unsupported');
  assert.equal(denied.proposed_actions.length, 0);
});
