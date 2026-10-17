'use strict';
// STRUCTURAL_ONLY: actual adapter with a mocked command transport; no browser,
// fabricated PNG, employer, hosting, credential or paid request.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Browser=require('../packages/domain/150-career-portal-browser.js');
const {createPullRunner}=require('../workers/career-browser/pull-runner.cjs');
const {fixture}=require('./fixtures/owned-worker-fixture.cjs');
function adapter(t,text){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-adapter-receipt-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const calls=[];const board=Browser.createBrowserBoard({url:'http://localhost/form',userId:'MOCK-user',evidenceDir:root,submitArmed:true,commandTransport(_id,cmd){calls.push(cmd);switch(cmd.type){case 'open':return {finalUrl:'http://localhost/form'};case 'discover':return {fields:[],observation:{version:'MOCK-observation'}};case 'submit_and_capture':return {clicked:true,text,finalUrl:'http://localhost/receipt',screenshot:path.join(root,'absent.png')};default:return {};}}});
 t.after(()=>board.close());return {board,calls};
}
test('confirmation parser requires an explicit reference label',()=>{
 const source=fs.readFileSync(require.resolve('../packages/domain/150-career-portal-browser.js'),'utf8');
 const body=source.match(/function extractConfirmation\(text\) \{[\s\S]*?\n  \}/)[0];
 const parse=require('node:vm').runInNewContext('('+body+')');
 assert.equal(parse('Application received\nApplication ID: LOCAL-ABC123').confirmationId,'LOCAL-ABC123');
 for(const prose of ['Application received','Application submitted','Confirmation pending','Reference available soon'])assert.equal(parse(prose).confirmationId,null);
});
test('actual 150 adapter extracts explicit application reference, never success prose',t=>{
 const {board}=adapter(t,'Application received\nApplication ID: LOCAL-ABC123');
 board.open();board.form();assert.equal(board.submit().confirmationId,'LOCAL-ABC123');
 assert.equal(board.submissionState().confirmationId,'LOCAL-ABC123');
 assert.throws(()=>board.submit(),{code:'SUBMIT_ALREADY_ATTEMPTED'});
});
test('actual 150 receipt capture binds the private submit capture and refuses absent PNG',t=>{
 const {board,calls}=adapter(t,'Application received\nApplication ID: LOCAL-ABC123');
 assert.equal(typeof board.captureReceiptEvidence,'function');board.open();board.form();board.submit();
 assert.equal(board.captureReceiptEvidence('OTHER-123','/tmp/unused.png').status,'NOT_VERIFIED');
 const capture=board.captureReceiptEvidence('LOCAL-ABC123','/tmp/unused.png');
 assert.equal(capture.status,'BLOCKED');assert.equal(Object.isFrozen(capture),true);
 assert.equal(calls.filter(c=>c.type==='screenshot').length,0,'receipt evidence copies the original capture; never a later page');
});
test('one-application runner remains alive through review, approval uncertainty and reconciliation',()=>{
 let clock=0,n=0,closed=0;const id='a'.repeat(32),options=[];
 const sequence=[[{id,status:'review_ready'}],[],[{id,status:'unknown_outcome'}],[],[{id,status:'completed'}]];
 const runner=createPullRunner({now:()=>clock,worker:{runPending(o){options.push(o);return sequence[n++]||[];}},store:{list:()=>[]},maxTasks:1,onStop:()=>closed++,maxRunMs:10000});
 runner.start();try{assert.equal(runner.stats().stopped,false);for(let i=0;i<4;i++){clock+=1000;runner.tick();}assert.equal(closed,1);assert.equal(runner.stats().tasks,1);assert.equal(runner.stats().stopped,true);assert.ok(options.slice(1).every(o=>o.taskId===id));}finally{runner.stop();}
});
test('idle review checkpoint is purged on ordinary polling after epoch revocation',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-idle-revoke-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const f=fixture(root),task=f.worker.receive('user-a',f.input);assert.equal(f.worker.prepare('user-a',task.id).status,'review_ready');
 f.authority.control('user-a',{epoch:1});f.worker.runPending();
 const saved=f.store.get(task.id);assert.equal(saved.spec,null);assert.equal(saved.review,null);assert.equal(saved.authority,null);assert.equal(saved.blocker,'PRIVACY_EPOCH_REVOKED');assert.equal(f.count().clicks,0);
});
test('browser helper gets a benign environment and managed lifetime, never backend markers',()=>{
 const runtime=require('../workers/career-browser/helper-runtime.cjs');
 const env=runtime.browserEnvironment({PATH:'/bin',HOME:'/tmp/MOCK-home',UPMORE_PLAYWRIGHT_PATH:'/mock/playwright',SUPABASE_SERVICE_ROLE_KEY:'DUMMY_SECRET',UPMORE_SUPABASE_KEY:'DUMMY_SECRET',NODE_OPTIONS:'DUMMY_SECRET',HTTPS_PROXY:'DUMMY_SECRET'},'/tmp/MOCK-scratch');
 assert.equal(env.PATH,'/bin');assert.equal(env.TMPDIR,'/tmp/MOCK-scratch');assert.equal(JSON.stringify(env).includes('DUMMY_SECRET'),false);
 const source=fs.readFileSync(require.resolve('../packages/domain/150-career-portal-browser.js'),'utf8');assert.doesNotMatch(source,/detached:\s*true|\.\.\.process\.env/);
});
test('service calls the actual 150 immutable receipt seam for the exact destination ID',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-service-adapter-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let f,captures=0,submits=0;
 const boardFactory=opts=>{
  const values={};const board=Browser.createBrowserBoard({...opts,commandTransport(_id,cmd){
   if(cmd.type==='open')return {finalUrl:opts.url};
   if(cmd.type==='discover')return {observation:{version:'MOCK-v1'},fields:[{id:'email',name:'email',label:'Email',inputType:'email',required:true,selector:'#email',ref:'email-ref'},{id:'resume',name:'resume',label:'Resume',inputType:'file',required:true,selector:'#resume',ref:'resume-ref'}]};
   if(cmd.type==='fill'){values[cmd.binding.field_id]=cmd.value;return {filled:true};}
   if(cmd.type==='readback')return {answers:values};
   if(cmd.type==='review')return {atFinalReview:true,finalUrl:opts.url};
   if(cmd.type==='verify_payload')return {matches:true};
   if(cmd.type==='submit_and_capture'){
    submits++;const proof={source:'controlled_portal_readback',outcome:'accepted',taskId:opts.scope.taskId,userId:opts.scope.userId,destination:opts.scope.submitUrl,payloadSha256:opts.scope.payloadSha256,resumeSha256:opts.scope.resumeSha256,confirmationId:'LOCAL-ABC123'};
    fs.writeFileSync(f.receiptPath(opts.scope.taskId),JSON.stringify(proof));return {clicked:true,text:'Application received\nApplication ID: LOCAL-ABC123',finalUrl:opts.scope.submitUrl,screenshot:null};
   }return {};
  }});
  const capture=board.captureReceiptEvidence;board.captureReceiptEvidence=(id,target)=>{captures++;assert.equal(id,'LOCAL-ABC123');return capture(id,target);};return board;
 };
 f=fixture(root,{boardFactory,evidenceRoot:path.join(root,'evidence')});const q=f.worker.receive('user-a',f.input),review=f.worker.prepare('user-a',q.id);assert.equal(review.status,'review_ready');
 const done=f.worker.approve('user-a',q.id,f.approval(review));assert.equal(done.status,'completed');assert.equal(submits,1);assert.equal(captures,1);assert.equal(done.evidence['confirmed-receipt'].status,'BLOCKED');assert.equal(done.result.receipt.confirmationId,'LOCAL-ABC123');
});
test('idle revocation purges private evidence but preserves an unknown-submit tombstone',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-unknown-revoke-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const f=fixture(root,{throwAfterClick:true,evidenceRoot:path.join(root,'evidence')}),q=f.worker.receive('user-a',f.input),r=f.worker.prepare('user-a',q.id);assert.equal(f.worker.approve('user-a',q.id,f.approval(r)).status,'unknown_outcome');
 const dir=path.join(root,'evidence',q.id);fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.writeFileSync(path.join(dir,'MOCK-private-state.txt'),'SYNTHETIC PRIVATE');
 f.authority.control('user-a',{epoch:1});f.worker.runPending({taskId:q.id});const saved=f.store.get(q.id);assert.equal(fs.existsSync(dir),false);assert.equal(saved.spec,null);assert.equal(saved.result,null);assert.equal(saved.review,null);assert.deepEqual(saved.evidence,{});assert.equal(saved.status,'unknown_outcome');assert.equal(saved.attempt.fenced,true);assert.equal(f.count().clicks,1);
});
test('runner bounds idle and uncertain waits and preserves the same checkpoint on restart',()=>{
 for(const status of ['review_ready','unknown_outcome']){
  let clock=0,calls=0;const id='a'.repeat(32);const runner=createPullRunner({now:()=>clock,worker:{runPending(o){calls++;assert.equal(o.taskId,id);return [];}},store:{list:()=>[id],get:()=>({id,status})},idleTimeoutMs:1000,uncertainTimeoutMs:1000,maxRunMs:5000});
  runner.start();clock=1000;runner.tick();assert.equal(runner.stats().stopped,true);assert.equal(calls,1);
 }
});
