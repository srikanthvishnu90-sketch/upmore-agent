'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {session}=require('./scripted-host.cjs');
test('an assessed unrelated criterion cannot satisfy the question core coverage',()=>{
  const s=session();s.start();s.answer();const c=s.candidate();c.dimensions=c.dimensions.map(d=>d.id==='situation'?d:{...d,score:'not_assessed',spans:[],missing_criterion:'This criterion is still unassessed.'});s.deliver(c);const pack=s.turn('build_pack').proposed_actions[0].args.pack;assert.ok(pack.unmet_conditions.includes('project answer not assessed'));
});
test('transfer records the originally targeted competency rather than a newly suggested gap',()=>{
  const s=session();s.start();s.answer();s.deliver();s.turn('begin_practice');s.answer('I proposed; my teammate built it.','practice');s.deliver();s.turn('begin_revision');s.answer('My contribution was the proposal, not implementation.','revision');s.deliver();s.turn('begin_transfer');s.answer('I cannot yet separate ownership in the new case.','transfer');
  const c=s.candidate();c.dimensions.find(d=>d.id==='personal_contribution').score='not_assessed';c.priority_fix={dimension:'outcome_evidence',text:'Next, clarify outcome evidence.'};c.exercise_id='outcome';s.deliver(c);
  const observation=s.state.observations.find(o=>o.kind==='transfer');assert.equal(observation.competency,'personal_contribution');assert.equal(observation.status,'not_assessed');assert.ok(s.turn('build_pack').proposed_actions[0].args.pack.unmet_conditions.includes('Unassisted transfer not assessed'));
});
