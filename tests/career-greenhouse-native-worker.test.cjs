'use strict';
// Actual service + module149/150 + v2 byte resolver, MODELED browser transport.
// No browser, network or employer acceptance is claimed by this suite.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createWorker}=require('../workers/career-browser/service.cjs');
const {createFileTaskStore,hash}=require('../workers/career-browser/store.cjs');
const Browser=require('../packages/domain/150-career-portal-browser.js');
const {mockAuthority,bindMockTaskClient}=require('./fixtures/owned-worker-authority.cjs');
const {manifest}=require('./fixtures/greenhouse-native/manifest.cjs');
const {equipment}=require('./fixtures/greenhouse-native/equipment.cjs');
function fixture(t,options={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-native-worker-')),authority=mockAuthority(root),e=equipment(path.join(root,'private'),authority),store=createFileTaskStore(path.join(root,'tasks')),m=manifest('http://localhost:1');let submits=0,opens=0,uploads=0;
 t.after(()=>{e.resolver.close();fs.rmSync(root,{recursive:true,force:true});});
 const factory=opts=>{const values={};return Browser.createBrowserBoard({...opts,commandTransport(id,cmd){switch(cmd.type){
  case 'open':opens++;return {ok:true,finalUrl:m.url};
  case 'discover':return {fields:m.fields.map((f,i)=>({...f,ref:'MOCK-ref-'+i})),observation:{version:'MOCK-observation',frame:'main',origin:new URL(m.url).origin,untrusted:true}};
  case 'fill':if(cmd.binding.inputType==='file'){uploads++;assert.deepEqual(fs.readFileSync(cmd.filePath),e.bytes);assert.equal(cmd.contentType,'application/pdf');}values[cmd.binding.field_id]=cmd.value;return {filled:true};
  case 'readback':return {answers:{...values}};
  case 'review':return {atFinalReview:true,finalUrl:m.url};
  case 'verify_payload':return {matches:JSON.stringify({...values,resume_sha256:values.resume.sha256})===JSON.stringify(cmd.payload)};
  case 'submit_and_capture':submits++;return {clicked:true,text:'MODELED native receipt',finalUrl:m.submitUrl,nativeCapture:{status:options.refused?'unknown_outcome':'receipt_observed',confirmationId:options.refused?null:'MODELED-12345',authoritative:false,...(options.refused?{dispatch:{source:'owned_chromium_route_gate',state:'refused_before_dispatch',admittedMutations:0,code:'NATIVE_PAYLOAD_MISMATCH'}}:{})}};
  case 'close':return {};
  default:throw Error('Unexpected MOCK command '+cmd.type);
 }}});};
 const make=(native=m)=>bindMockTaskClient(createWorker({store,authority,nativePortals:[native],resolveEquipment:e.resolver.resolveEquipment,boardFactory:factory,readReceipt:()=>null}),authority);
 const worker=make(),input={eventId:'synthetic-prepare',posting:{canonicalKey:m.canonicalKey,url:m.url,status:'open',company:'MODELED ONLY',role:'Synthetic role'},artifactId:e.artifactId,resumeSha256:e.sha256};
 const approval=r=>({approvedByUser:true,approvalRef:'synthetic-approval',payloadSha256:r.review.payloadSha256,resumeSha256:e.sha256,destination:m.submitUrl});return {root,store,authority,e,m,make,worker,input,approval,count:()=>({submits,opens,uploads})};
}
test('native worker binds exact confirmed names/resume/manifest and keeps receipt-only outcome unknown with a durable fence',t=>{
 const f=fixture(t),q=f.worker.receive(f.e.userId,f.input),review=f.worker.prepare(f.e.userId,q.id);assert.equal(review.status,'review_ready',JSON.stringify(review));
 assert.equal(review.review.payload.first_name,'Synthetic');assert.equal(review.review.payload.last_name,'Native Test');assert.equal(review.review.payload.resume.sha256,f.e.sha256);assert.equal(review.review.artifactVersion,'synthetic-version-1');assert.match(review.review.nativeManifestSha256,/^[a-f0-9]{64}$/);assert.deepEqual(fs.readdirSync(path.join(f.root,'private')),[]);
 const a=f.approval(review),out=f.worker.approve(f.e.userId,q.id,a);assert.equal(out.status,'unknown_outcome');assert.equal(out.result.receipt,null);assert.equal(f.count().submits,1);assert.equal(f.count().uploads,2);assert.equal(f.e.reads(),2);assert.ok(f.store.get(q.id).attempt);assert.deepEqual(fs.readdirSync(path.join(f.root,'private')),[]);
 assert.equal(f.worker.approve(f.e.userId,q.id,a).status,'unknown_outcome');assert.equal(f.worker.reconcile(f.e.userId,q.id).status,'unknown_outcome');assert.equal(f.count().submits,1);
 const restarted=f.make();assert.equal(restarted.prepare(f.e.userId,q.id).status,'unknown_outcome');assert.equal(f.count().submits,1);
});
test('latest confirmed artifact correction before approval blocks before a modeled click',t=>{
 const f=fixture(t),q=f.worker.receive(f.e.userId,f.input),review=f.worker.prepare(f.e.userId,q.id);f.e.records.latestConfirmedArtifact.versionId='new-confirmed-version';const out=f.worker.approve(f.e.userId,q.id,f.approval(review));assert.equal(out.blocker,'LATEST_CONFIRMED_RESUME_REQUIRED');assert.equal(f.count().submits,0);assert.equal(f.count().opens,1);
});
test('changed native manifest after restart invalidates prepared task before opening browser',t=>{
 const f=fixture(t),q=f.worker.receive(f.e.userId,f.input);f.worker.prepare(f.e.userId,q.id);const changed=JSON.parse(JSON.stringify(f.m));changed.fields[0].name='changed_field';const restarted=f.make(changed),r=restarted.prepare(f.e.userId,q.id);assert.equal(r.blocker,'NATIVE_MANIFEST_CHANGED');assert.equal(f.count().opens,1);assert.equal(f.count().submits,0);
});
test('posting identity and specific approval hash are independently enforced',t=>{
 const f=fixture(t);assert.throws(()=>f.worker.receive(f.e.userId,{...f.input,eventId:'synthetic-invalid',posting:{...f.input.posting,canonicalKey:'modeled:different'}}),{code:'NATIVE_POSTING_BINDING_MISMATCH'});
 const q=f.worker.receive(f.e.userId,f.input),r=f.worker.prepare(f.e.userId,q.id);assert.throws(()=>f.worker.approve(f.e.userId,q.id,{...f.approval(r),payloadSha256:hash('wrong')}),{code:'APPROVAL_BINDING_MISMATCH'});assert.equal(f.count().submits,0);
});

test('verified route refusal is reported as diagnostic without clearing the durable submit fence (MODELED transport)',t=>{
 const f=fixture(t,{refused:true}),q=f.worker.receive(f.e.userId,f.input),review=f.worker.prepare(f.e.userId,q.id),a=f.approval(review),out=f.worker.approve(f.e.userId,q.id,a);
 assert.equal(out.status,'unknown_outcome');assert.equal(out.result.nativeDispatchObservation.state,'refused_before_dispatch');assert.ok(f.store.get(q.id).attempt);f.worker.approve(f.e.userId,q.id,a);f.worker.reconcile(f.e.userId,q.id);assert.equal(f.count().submits,1);
});
