'use strict';
// REVIEW-ONLY cross-branch behavior: A's pending publication + B's supervisor.
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./helpers/research-review.cjs');
test('pull supervisor keeps the same captured research active until central publication is confirmed',t=>{
 const f=F.unit(t,{finishFailsOnce:true}),runner=require('../workers/career-browser/pull-runner.cjs').createPullRunner({worker:f.worker,store:f.store,now:()=>F.NOW,maxTasks:1});
 try{
  runner.start();const task=f.store.get(f.queued.id),first=runner.stats();
  console.log(JSON.stringify({evidence:'COMBINED_PENDING_PUBLICATION_SUPERVISOR',afterFirstTick:{runner:first,status:task.status,blocker:task.blocker,publicationPending:task.publicationPending,reads:f.reads(),finishes:f.finishes()},paidCalls:0,actualNetworkCalls:0}));
  assert.equal(task.publicationPending,true);assert.equal(f.reads(),1);
  assert.equal(first.stopped,false,'supervisor stopped with an unconfirmed captured result');assert.equal(first.tasks,0,'unpublished capture consumed the terminal task allowance');
  runner.tick();assert.equal(f.store.get(f.queued.id).publicationPending,false);assert.equal(runner.stats().evidenceReady,1);assert.equal(runner.stats().stopped,true);assert.equal(f.reads(),1);assert.equal(f.finishes(),2);
 }finally{runner.stop();}
});
test('restart restores a pending publication and recovers without another capture',t=>{
 const f=F.unit(t,{finishFailsOnce:true});f.worker.runPending({limit:1});assert.equal(f.store.get(f.queued.id).publicationPending,true);
 const events=[],runner=require('../workers/career-browser/pull-runner.cjs').createPullRunner({worker:f.worker,store:f.store,emit:e=>events.push(e),now:()=>F.NOW,maxTasks:1});
 try{runner.start();assert.ok(events.some(e=>e.event==='checkpoint_requires_review'&&e.taskId===f.queued.id));assert.equal(f.store.get(f.queued.id).publicationPending,false);assert.equal(runner.stats().evidenceReady,1);assert.equal(f.reads(),1);assert.equal(f.finishes(),2);}finally{runner.stop();}
});
test('persistent publication failures retain the existing transition bound and captured result',t=>{
 const f=F.unit(t);f.authority.finish=()=>{throw Object.assign(Error('synthetic publication unavailable'),{code:'TASK_RESULT_UNCONFIRMED'});};
 const runner=require('../workers/career-browser/pull-runner.cjs').createPullRunner({worker:f.worker,store:f.store,now:()=>F.NOW,maxTransitions:1,maxTasks:1});
 try{runner.start();runner.tick();assert.equal(runner.stats().stopped,true);assert.equal(runner.stats().tasks,0);assert.equal(f.store.get(f.queued.id).publicationPending,true);assert.equal(f.reads(),1);}finally{runner.stop();}
});
test('immutable publication recovery does not depend on the pending queue RPC',t=>{
 const f=F.unit(t,{finishFailsOnce:true});f.worker.runPending({limit:1});
 f.authority.pending=()=>{throw Error('synthetic pending queue unavailable');};
 const recovered=f.worker.runPending({limit:1,taskId:f.queued.id});assert.equal(recovered.length,1);assert.equal(f.store.get(f.queued.id).publicationPending,false);assert.equal(f.reads(),1);assert.equal(f.finishes(),2);
});
