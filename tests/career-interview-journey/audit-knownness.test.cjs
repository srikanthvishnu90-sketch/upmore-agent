'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./fixtures.cjs'),{session}=require('./scripted-host.cjs');
test('counterfactual correction and new time remove only the unknowns that now have supplied evidence',()=>{
  const s=session();s.start({available_minutes:null});assert.ok(s.state.constraints.unknowns.includes('company'));assert.ok(s.state.constraints.unknowns.includes('minutes available now'));
  const target=s.snapshot.facts.find(f=>f.id==='target');target.version=2;target.value={...target.value,company:'Synthetic Tools',stage:'design discussion'};s.snapshot.binding.context_sha256=F.hash('known target revision');s.snapshot.invalidations=[{id:'known-target',kind:'target_changed',evidence_id:'target',previous_version:1}];
  s.turn('context_changed',{invalidation_ids:['known-target'],target_ref:{id:'target',version:2}});s.turn('time_change',{available_minutes:12});
  assert.deepEqual(s.state.constraints.unknowns,[]);const pack=s.turn('build_pack').proposed_actions[0].args.pack;assert.equal(pack.sections.find(s=>s.id==='target').content.at(-1),'Unknowns: ');
});
