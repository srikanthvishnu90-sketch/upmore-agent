'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./fixtures.cjs'),C=require('../../packages/career-interview-journey/adapters/context.js');
const {session}=require('./scripted-host.cjs');
function snapshot(){const s=F.snapshot();s.sources.push({...F.copy(s.facts[0]),id:'synthetic-source',kind:'source',trust:'untrusted_source',value:{excerpt:'Synthetic source text.'}});return s;}
// Local validator controls. The separate projected-context-compatibility runner
// consumes A's actual pinned fixture, validator and projection, without substitutes.
for(const collection of ['facts','sources']){
  for(const version of [0,1,Number.MAX_SAFE_INTEGER])test(`${collection} preserve canonical nonnegative safe version ${version}`,()=>{
    const s=snapshot(),row=s[collection][0];row.version=version;const before=JSON.stringify(s);
    assert.doesNotThrow(()=>C.validate(s));assert.equal(C.validate(s),s);assert.equal(C.resolve(s,{id:row.id,version}),row);assert.deepEqual(C.ref(row),{id:row.id,version});assert.equal(JSON.stringify(s),before);
  });
  for(const version of [-1,0.5,'0',null,true,Number.MAX_SAFE_INTEGER+1,NaN,Infinity])test(`${collection} reject invalid evidence version ${String(version)} (${typeof version})`,()=>{
    const s=snapshot();s[collection][0].version=version;assert.throws(()=>C.validate(s),/missing evidence lineage/);
  });
}
for(const violation of ['owner','thread','epoch','inactive'])test(`zero versions retain the ${violation} evidence fence`,()=>{
  const s=F.snapshot(),row=s.facts[0];row.version=0;
  if(violation==='owner')row.owner_id='synthetic-other-owner';
  if(violation==='thread'){row.scope='thread';row.thread_id='synthetic-other-thread';}
  if(violation==='epoch')row.validity.epoch++;
  if(violation==='inactive')row.validity.status='withdrawn';
  assert.throws(()=>C.validate(s),/foreign evidence|old epoch|inactive payload/);assert.throws(()=>C.resolve(s,{id:row.id,version:0}),/missing\/stale/);
});
test('zero references survive reducer start, answer proposal, pause and JSON restart without renumbering',()=>{
  const snapshot=F.snapshot();for(const row of [...snapshot.facts,...snapshot.sources])row.version=0;
  const s=session(snapshot);s.start({target_ref:{id:'target',version:0},resume_ref:{id:'resume',version:0}});assert.equal(s.state.target_ref.version,0);assert.equal(s.state.resume_ref.version,0);assert.ok(s.state.dependencies.every(r=>r.version===0));
  const proposal=s.turn('submit_answer',{text:'I proposed the class project change.',source_refs:[{id:'project',version:0}],scripted:true}).proposed_actions[0];
  assert.equal(proposal.type,'coach_answer');assert.ok(proposal.args.request.evidence.every(r=>r.version===0));assert.deepEqual(s.state.attempts[0].source_refs,[{id:'project',version:0}]);
  s.turn('pause');s.state=F.copy(s.state);s.turn('resume');assert.ok(s.state.checkpoint.outstanding_reasoning[0].request.source_refs.every(r=>r.version===0));assert.throws(()=>C.resolve(s.snapshot,{id:'project',version:1}),/missing\/stale/);
});
