'use strict';
// STRUCTURAL_ONLY: synthetic private state and MOCK authority, no network.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createPullRunner}=require('../workers/career-browser/pull-runner.cjs');
const {fixture}=require('./fixtures/owned-worker-fixture.cjs');
for(const status of ['evidence_ready','insufficient_evidence'])test('research '+status+' is terminal without an application-success claim',()=>{
 const runner=createPullRunner({worker:{runPending:()=>[{id:'a'.repeat(32),kind:'public_research/v1',status}]},store:{list:()=>[]},maxTasks:1});
 runner.start();try{const s=runner.stats();assert.equal(s.stopped,true);assert.equal(s.tasks,1);assert.equal(s.completed,0);assert.equal(s.evidenceReady,status==='evidence_ready'?1:0);assert.equal(s.handoffs,status==='insufficient_evidence'?1:0);}finally{runner.stop();}
});
test('post-stop deadline purges private task JSON and frames without RPC access or renewed retention',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-post-stop-private-'));
 let clock=1000;const callbacks=[];
 const f=fixture(root,{throwAfterClick:true,evidenceRoot:path.join(root,'evidence'),retentionClock:()=>clock,retentionSchedule:(fn,ms)=>{callbacks.push({fn,ms});return null;}});
 t.after(()=>{f.worker.releaseEvidence({immediate:true});fs.rmSync(root,{recursive:true,force:true});});
 const q=f.worker.receive('user-a',f.input),review=f.worker.prepare('user-a',q.id);assert.equal(f.worker.approve('user-a',q.id,f.approval(review)).status,'unknown_outcome');
 const before=f.store.get(q.id);assert.equal(before.privateExpiresAt,clock+900000);
 const dir=path.join(root,'evidence',q.id);fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.writeFileSync(path.join(dir,'SYNTHETIC-PRIVATE.txt'),'PRIVATE-SYNTHETIC-NOT-PNG');
 f.worker.releaseEvidence();f.authority.control('user-a',{epoch:1});f.authority.current=()=>{throw Error('RPC resources are closed after stop');};
 clock+=900001;assert.ok(callbacks.length>0);callbacks.at(-1).fn();
 const saved=f.store.get(q.id);assert.equal(saved.spec,null);assert.equal(saved.review,null);assert.equal(saved.result,null);assert.equal(saved.authority,null);assert.equal(saved.status,'unknown_outcome');assert.equal(saved.attempt.fenced,true);assert.equal(fs.existsSync(dir),false);assert.equal(f.count().clicks,1);assert.equal(saved.blocker,'PRIVATE_RETENTION_EXPIRED');
 assert.throws(()=>f.worker.approve('user-a',q.id,f.approval(review)),{code:'PRIVATE_RETENTION_EXPIRED'});assert.throws(()=>f.worker.receive('user-a',f.input),{code:'PRIVATE_RETENTION_EXPIRED'});assert.equal(f.count().clicks,1);
 f.worker.releaseEvidence({immediate:true});
});
test('real local retention timer erases JSON after polling ends with no backend adapter',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-real-json-retention-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const store=require('../workers/career-browser/store.cjs').createFileTaskStore(root),id='a'.repeat(32),task={id,userId:'MOCK-user',status:'evidence_ready',spec:{question:'SYNTHETIC-PRIVATE-QUESTION'},result:{text:'SYNTHETIC-PRIVATE-TEXT'},checkpoints:[]};
 const retention=require('../workers/career-browser/private-retention.cjs').createPrivateRetention({store,ttlMs:100});retention.stamp(task);store.put(task);retention.arm();t.after(()=>retention.cancel());
 await new Promise(r=>setTimeout(r,150));const file=fs.readFileSync(path.join(root,id+'.json'),'utf8');assert.equal(file.includes('SYNTHETIC-PRIVATE'),false);assert.equal(store.get(id).status,'evidence_ready');assert.equal(store.get(id).privateExpiredAt!==undefined,true);
});
test('legacy private JSON gets its deadline from disk age, not a restart extension',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-legacy-json-retention-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const store=require('../workers/career-browser/store.cjs').createFileTaskStore(root),id='a'.repeat(32);
 store.put({id,userId:'MOCK-user',status:'review_ready',spec:{private:'SYNTHETIC-PRIVATE'},checkpoints:[]});const old=new Date(Date.now()-900001);fs.utimesSync(path.join(root,id+'.json'),old,old);
 require('../workers/career-browser/private-retention.cjs').createPrivateRetention({store}).sweep();assert.equal(store.get(id).spec,null);assert.equal(store.get(id).status,'cancelled');
});
test('orphaned atomic JSON scratch from process death expires without a task checkpoint',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-orphan-json-retention-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const store=require('../workers/career-browser/store.cjs').createFileTaskStore(root),file=path.join(root,'a'.repeat(32)+'.json.00000000-0000-4000-8000-000000000001.tmp');
 fs.writeFileSync(file,'SYNTHETIC-PRIVATE-ORPHAN');const old=new Date(Date.now()-900001);fs.utimesSync(file,old,old);require('../workers/career-browser/private-retention.cjs').createPrivateRetention({store}).sweep();assert.equal(fs.existsSync(file),false);
});
test('direct reads enforce an expired private deadline before RPC, even without a poll or timer',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-direct-private-expiry-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let clock=1000;
 const f=fixture(root,{retentionClock:()=>clock}),q=f.worker.receive('user-a',f.input);assert.equal(f.worker.prepare('user-a',q.id).status,'review_ready');clock+=900001;f.authority.current=()=>{throw Error('No RPC after the private deadline');};
 const result=f.worker.get('user-a',q.id);assert.equal(result.review,null);assert.equal(result.result,null);assert.equal(result.blocker,'PRIVATE_RETENTION_EXPIRED');assert.equal(result.status,'cancelled');assert.equal(f.store.get(q.id).spec,null);assert.equal(f.count().clicks,0);
});
test('explicit legacy HTTP worker close purges private JSON and closes resources once',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-legacy-worker-close-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let closed=0;
 const storeRoot=path.join(root,'tasks'),authority=require('./fixtures/owned-worker-authority.cjs').mockAuthority(root),running=require('../workers/career-browser/run.cjs').start({storeRoot,authority,authenticate:()=>null,close:()=>closed++});
 await require('node:events').once(running.server,'listening');const store=require('../workers/career-browser/store.cjs').createFileTaskStore(storeRoot),id='a'.repeat(32);
 store.put({id,userId:'MOCK-user',status:'completed',spec:{private:'SYNTHETIC-PRIVATE'},result:{private:'SYNTHETIC-PRIVATE'},checkpoints:[]});
 await new Promise(resolve=>running.server.close(resolve));assert.equal(closed,1);assert.equal(store.get(id).spec,null);assert.equal(store.get(id).result,null);assert.equal(store.get(id).status,'completed');
});
