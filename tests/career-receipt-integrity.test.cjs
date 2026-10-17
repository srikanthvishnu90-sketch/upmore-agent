'use strict';
// STRUCTURAL ONLY: injected MOCK board/readback, no live employer or browser.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture}=require('./fixtures/owned-worker-fixture.cjs');
const {validControlledReceipt}=require('../workers/career-browser/receipt.cjs');
const patches=[['boolean ID',{confirmationId:true}],['object ID',{confirmationId:{id:'fake'}}],['blank ID',{confirmationId:'   '}],['negative outcome',{outcome:'rejected'}],['pending status',{status:'pending'}],['wrong actual resume hash',{receivedResumeSha256:'b'.repeat(64)}],['wrong actual payload hash',{receivedPayloadSha256:'b'.repeat(64)}],['invalid actual file size',{receivedFileBytes:-1}]];
for(const [label,patch]of patches)test('destination '+label+' stays unknown and cannot cause another submit',(t)=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-receipt-integrity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const options={proofPatch:patch},f=fixture(root,options),queued=f.worker.receive('user-a',f.input),review=f.worker.prepare('user-a',queued.id);
  const result=f.worker.approve('user-a',review.id,f.approval(review));assert.equal(result.status,'unknown_outcome');assert.equal(result.result.receipt,null);assert.equal(f.count().clicks,1);
  assert.throws(()=>f.worker.approve('user-a',review.id,f.approval(review,'new-approval')),{code:'RECONCILE_REQUIRED'});
  assert.equal(f.worker.reconcile('user-a',review.id).status,'unknown_outcome');assert.equal(f.count().clicks,1);
  options.proofPatch=null;assert.equal(f.worker.reconcile('user-a',review.id).status,'completed');assert.equal(f.count().clicks,1,'trusted corrected readback reconciles; no re-click');
});
test('receipt validation is not a client authentication or employer activation mechanism',()=>{
  const task={id:'a'.repeat(32),userId:'user-a',attempt:{destination:'http://localhost/submit',payloadSha256:'b'.repeat(64),resumeSha256:'c'.repeat(64)}};
  const receipt={source:'controlled_portal_readback',taskId:task.id,userId:task.userId,...task.attempt,confirmationId:'LOCAL-RECEIPT',outcome:'accepted'};
  assert.equal(validControlledReceipt(task,receipt),true);
  for(const patch of [{source:'greenhouse_page_capture'},{source:'client_supplied'},{userId:'someone-else'},{destination:'https://job-boards.greenhouse.io/test/jobs/1'}])assert.equal(validControlledReceipt(task,{...receipt,...patch}),false);
  assert.equal(validControlledReceipt(task,[]),false);assert.equal(validControlledReceipt({...task,attempt:null},receipt),false);
});
