'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./fixtures.cjs'),{savedArtifact}=require('./scripted-host.cjs');
const J=require('../../packages/domain/interview-journey/index.js');
test('a pre-audit saved full pack with only abstentions cannot complete under current coverage policy',()=>{
  // Generated through the exact 53ae74b3 reducer/serializer with explicitly
  // scripted abstention candidates. Frozen JSON avoids a git-history dependency.
  const legacy=F.copy(require('./legacy-abstention-pack.json'));assert.equal(legacy.proposal.args.pack.status,'complete');assert.ok(legacy.state.assessments.every(a=>a.dimensions.every(d=>d.score==='not_assessed')));
  const receipt=savedArtifact(legacy,legacy.proposal);assert.throws(()=>J.planInterviewTurn({snapshot:legacy.snapshot,state:legacy.state,event:F.event('legacy-readback','artifact_readback',{receipt_id:receipt.id})}),/coverage|eligibility/);
});
