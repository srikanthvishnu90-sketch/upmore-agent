'use strict';
// Synthetic local state only; no browser, network, credential or employer.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createPullRunner}=require('../workers/career-browser/pull-runner.cjs');
const {fixture}=require('./fixtures/owned-worker-fixture.cjs');
test('expired unknown-submit tombstone stays fenced without pinning a new pilot',()=>{
 const old={id:'a'.repeat(32),status:'unknown_outcome',privateExpiredAt:1000,attempt:{fenced:true,receiptKey:'c'.repeat(64),unknown:true}},other='b'.repeat(32);let calls=0;
 const runner=createPullRunner({store:{list:()=>[old.id],get:()=>old},worker:{runPending(options){calls++;assert.equal(options.taskId,undefined);return [{id:other,status:'review_ready'}];}}});
 runner.start();try{assert.equal(calls,1);assert.equal(runner.stats().activeTaskId,other);assert.equal(runner.stats().stopped,false);assert.equal(old.attempt.fenced,true);assert.equal(old.status,'unknown_outcome');}finally{runner.stop();}
});
for(const immediate of [false,true])test((immediate?'explicit shutdown removes fresh':'ordinary polling expires old')+' orphan evidence without deleting task fences',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-orphan-evidence-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const f=fixture(root,{evidenceRoot:path.join(root,'evidence')}),id='a'.repeat(32),dir=path.join(root,'evidence',id);fs.mkdirSync(dir,{mode:0o700});const file=path.join(dir,'SYNTHETIC-PRIVATE.txt');fs.writeFileSync(file,'PRIVATE-MOCK-NOT-PNG');
 const fenceId='b'.repeat(32),attempt={fenced:true,receiptKey:'c'.repeat(64),unknown:true};f.store.put({id:fenceId,userId:'user-a',status:'unknown_outcome',privateExpiredAt:1000,attempt});
 if(!immediate){const old=new Date(Date.now()-900001);fs.utimesSync(file,old,old);f.worker.runPending();}else f.worker.releaseEvidence({immediate:true});
 assert.equal(fs.existsSync(dir),false);assert.deepEqual(f.store.list(),[fenceId]);assert.deepEqual(f.store.get(fenceId).attempt,attempt);assert.equal(f.count().clicks,0);
});
test('real expired uncertain checkpoint keeps polling unrelated work after restart past two minutes',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-expired-pilot-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let clock=1000;const f=fixture(root,{throwAfterClick:true,retentionClock:()=>clock});const q=f.worker.receive('user-a',f.input),r=f.worker.prepare('user-a',q.id);assert.equal(f.worker.approve('user-a',q.id,f.approval(r)).status,'unknown_outcome');clock+=900001;f.worker.runPending();
 let pending=0,runnerClock=0;f.authority.pending=()=>{pending++;return [];};const runner=createPullRunner({worker:f.worker,store:f.store,now:()=>runnerClock});runner.start();try{runnerClock=120001;runner.tick();assert.equal(pending,2);assert.equal(runner.stats().stopped,false);assert.equal(runner.stats().activeTaskId,undefined);assert.equal(f.store.get(q.id).attempt.fenced,true);assert.equal(f.count().clicks,1);}finally{runner.stop();}
});
test('expiry during an active pilot immediately reports a handoff rather than uncertainty timeout',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-active-expiry-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let clock=1000;const f=fixture(root,{throwAfterClick:true,retentionClock:()=>clock});const q=f.worker.receive('user-a',f.input),r=f.worker.prepare('user-a',q.id);f.worker.approve('user-a',q.id,f.approval(r));const events=[],runner=createPullRunner({worker:f.worker,store:f.store,emit:x=>events.push(x)});runner.start();try{clock+=900001;runner.tick();assert.equal(runner.stats().stopped,true);assert.equal(runner.stats().completed,0);assert.equal(runner.stats().handoffs,1);assert.ok(events.some(e=>e.event==='worker_stop'&&e.status==='private_expiry_handoff'));assert.equal(f.count().clicks,1);assert.equal(f.store.get(q.id).attempt.fenced,true);}finally{runner.stop();}
});
