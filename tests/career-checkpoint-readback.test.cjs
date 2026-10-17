'use strict';
// Synthetic local checkpoint/authority regression. No portal or employer receipt.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createFileTaskStore}=require('../workers/career-browser/store.cjs');
const {createWorker}=require('../workers/career-browser/service.cjs');
const {mockAuthority}=require('./fixtures/owned-worker-authority.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-checkpoint-loss-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const store=createFileTaskStore(path.join(root,'tasks')),authority=mockAuthority(root),worker=createWorker({store,authority});return {root,store,authority,worker};}
test('missing checkpoint reconciliation uses only its exact grant and publishes unavailable readback',t=>{
 const f=fixture(t),id='a'.repeat(32),intentId=f.authority.register('owner',{action:'reconcile',task_id:id});
 const result=f.worker.reconcile('owner',id,{intentId});
 assert.equal(result.status,'unknown_outcome');assert.equal(result.blocker,'DESTINATION_READBACK_UNAVAILABLE');assert.equal(result.result,null);
 assert.deepEqual(f.store.list(),[],'no private payload or fabricated attempt is reconstructed');
 const central=JSON.parse(fs.readFileSync(path.join(f.root,'MOCK-authority.json')));assert.deepEqual(central.intents[intentId].result,result);assert.deepEqual(central.effects,{});
 assert.deepEqual(f.worker.reconcile('owner',id,{intentId}),result,'identical unavailable result is deterministic');
});
test('checkpoint absence cannot bypass owner, action, task or current-context authority',t=>{
 const f=fixture(t),id='a'.repeat(32),intentId=f.authority.register('owner',{action:'reconcile',task_id:id});
 assert.throws(()=>f.worker.reconcile('foreign',id,{intentId}));
 assert.throws(()=>f.worker.reconcile('owner','b'.repeat(32),{intentId}));
 const prepare=f.authority.register('owner',{action:'prepare',task_id:id});assert.throws(()=>f.worker.reconcile('owner',id,{intentId:prepare}));
 f.authority.control('owner',{epoch:1});assert.throws(()=>f.worker.reconcile('owner',id,{intentId}));assert.deepEqual(f.store.list(),[]);
});
