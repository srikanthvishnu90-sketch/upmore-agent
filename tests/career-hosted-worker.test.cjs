'use strict';
// STRUCTURAL ONLY: mocked HTTPS, queue, and private IPC helper. No hosting,
// database, Chromium, application, or production credential is used.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {requestRPC,configuration}=require('../workers/career-browser/rpc-client.cjs');
const {createSyncRPCTransport}=require('../workers/career-browser/rpc-transport.cjs');
const {createPullRunner}=require('../workers/career-browser/pull-runner.cjs');
const {fixture}=require('./fixtures/owned-worker-fixture.cjs');
const {createEvidenceCapture}=require('../workers/career-browser/evidence.cjs');
const config={url:'https://synthetic-project.example.test',key:'MOCK-NOT-A-CREDENTIAL'};
test('private RPC transport exposes the exact scoped admission, role-answer and discovery-context reads',async()=>{
 for(const name of ['career_application_admission_history_v1','career_application_batch_answers_v1','career_application_task_context_v1']){
  let count=0;await requestRPC(config,name,{p_user:'SYNTHETIC',p_intent:'a'.repeat(64),p_task:'b'.repeat(32),p_lease:'SYNTHETIC'},{fetch:async url=>{count++;assert.equal(url,config.url+'/rest/v1/rpc/'+name);return new Response(JSON.stringify({records:[],answers:[],context:null}));}});assert.equal(count,1);
 }
});
test('trusted RPC transport restricts endpoint/method and never follows a redirect',async()=>{
 let calls=0;const data=await requestRPC(config,'career_task_account_v1',{p_user:'MOCK-user'},{fetch:async(url,options)=>{calls++;assert.equal(url,config.url+'/rest/v1/rpc/career_task_account_v1');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.headers.authorization,'Bearer '+config.key);return new Response(JSON.stringify({exists:true,account:{version:1,epoch:0}}));}});
 assert.equal(data.account.epoch,0);await assert.rejects(()=>requestRPC(config,'arbitrary_sql',{}, {fetch:()=>calls++}),{code:'RPC_METHOD_REFUSED'});assert.equal(calls,1);
 for(const url of ['http://project.example.test/','https://user:pass@project.example.test/','https://project.example.test/other','https://project.example.test/?token=x'])assert.throws(()=>configuration(url,config.key));
});
test('RPC lost/failed response stays uncertain, attempts once and does not log SQL text',async()=>{
 let calls=0;await assert.rejects(()=>requestRPC(config,'career_task_finish_v1',{},{fetch:async()=>{calls++;throw Error('MOCK response lost after commit');}}),{code:'RPC_OUTCOME_UNCERTAIN'});assert.equal(calls,1);
 await assert.rejects(()=>requestRPC(config,'career_task_claim_v1',{},{fetch:async()=>new Response(JSON.stringify({message:'task authority revoked private payload must not escape'}),{status:400})}),e=>e.code==='TASK_AUTHORITY_REVOKED'&&e.message==='task authority revoked');
 await assert.rejects(()=>requestRPC(config,'career_task_account_v1',{},{maxBytes:8,fetch:async()=>new Response(JSON.stringify({huge:'x'.repeat(100)}))}),{code:'RPC_OUTCOME_UNCERTAIN'});
});
test('synchronous private IPC adapter roundtrip closes its helper and scratch directory',(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-worker-rpc-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const helper=path.join(root,'mock-helper.cjs');fs.writeFileSync(helper,`const fs=require('node:fs'),p=require('node:path'),r=process.argv[2];fs.writeFileSync(p.join(r,'ready'),'');setInterval(()=>{for(const f of fs.readdirSync(r).filter(f=>/^cmd-\\d+\\.json$/.test(f))){const c=JSON.parse(fs.readFileSync(p.join(r,f)));fs.writeFileSync(p.join(r,f.replace('cmd-','resp-')),JSON.stringify({ok:true,data:{name:c.name,owner:c.args.p_user}}));fs.unlinkSync(p.join(r,f));}},5);`);
 const transport=createSyncRPCTransport({...config,stateRoot:root,helperPath:helper,timeoutMs:1000});
 assert.deepEqual(transport.call('career_task_account_v1',{p_user:'MOCK-user'}),{name:'career_task_account_v1',owner:'MOCK-user'});
 assert.throws(()=>transport.call('eval',{}),{code:'RPC_METHOD_REFUSED'});transport.close();assert.throws(()=>transport.call('career_task_account_v1',{}),{code:'RPC_TRANSPORT_CLOSED'});assert.deepEqual(fs.readdirSync(root),['mock-helper.cjs']);
});
test('pull runner requests one task, stops at pilot budget, logs metadata only and opens no server',()=>{
 const events=[];let calls=0,closed=0;
 const runner=createPullRunner({worker:{runPending(options){calls++;assert.equal(options.limit,1);return [{id:'a'.repeat(32),intentId:'b'.repeat(64),status:'completed',profile:{private:'DO_NOT_LOG'},receipt:{private:'DO_NOT_LOG'},token:'DO_NOT_LOG'}];}},store:{list:()=>[]},maxTasks:1,emit:e=>events.push(e),onStop:()=>closed++});
 runner.start();runner.tick();assert.equal(calls,1);assert.equal(closed,1);assert.equal(runner.stats().stopped,true);assert.equal(JSON.stringify(events).includes('DO_NOT_LOG'),false);assert.equal(events.find(e=>e.event==='task_result').taskId,'a'.repeat(32));
});
test('restart reports uncertain checkpoints without requeue; bounded errors stop polling',()=>{
 const task={id:'a'.repeat(32),status:'unknown_outcome',authority:{intentId:'b'.repeat(64)}};const events=[];let calls=0;
 const runner=createPullRunner({worker:{runPending(){calls++;throw Object.assign(Error('private failure'),{code:'RPC_OUTCOME_UNCERTAIN'});}},store:{list:()=>[task.id],get:()=>task},maxErrors:1,emit:e=>events.push(e)});
 runner.start();runner.tick();assert.equal(calls,1);assert.equal(task.status,'unknown_outcome');assert.ok(events.some(e=>e.event==='checkpoint_requires_review'));assert.equal(runner.stats().stopped,true);
});
test('service batch limit is enforced before dispatch and does not widen portal permissions',(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-pull-batch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const f=fixture(root);
 const first=f.worker.receive('user-a',f.input),second=f.worker.receive('user-b',f.input);const results=f.worker.runPending({limit:1});assert.equal(results.length,1);assert.equal(f.store.list().map(id=>f.store.get(id)).filter(t=>t.status==='queued').length,1);assert.equal(f.count().clicks,0);
 assert.throws(()=>f.worker.runPending({limit:0}),{code:'TASK_BATCH_LIMIT_INVALID'});assert.throws(()=>f.worker.receive('user-a',{...f.input,posting:{...f.input.posting,url:'https://job-boards.greenhouse.io/test/jobs/1'}}),{code:'DESTINATION_NOT_REGISTERED'});assert.notEqual(first.id,second.id);
});
test('genuine evidence hook refuses absent screenshot methods/files; no synthetic PNG is created',(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-evidence-absence-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const capture=createEvidenceCapture(root),task={id:'a'.repeat(32)};
 assert.equal(capture.capture(task,{},'form-read').status,'NOT_WIRED');
 assert.equal(capture.capture(task,{screenshot(){}},'filled-review').status,'BLOCKED');
 assert.deepEqual(fs.readdirSync(path.join(root,task.id)),[]);assert.throws(()=>capture.capture(task,{},'arbitrary-stage'),{code:'EVIDENCE_STAGE_INVALID'});
 capture.erase(task.id);assert.equal(fs.existsSync(path.join(root,task.id)),false);
});
test('pull-only entry has no HTTP listener and closes injected resources',(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-pull-entry-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const authority=require('./fixtures/owned-worker-authority.cjs').mockAuthority(root);let closed=0;const events=[];
 const processWorker=require('../workers/career-browser/run.cjs').start({mode:'pull_only',storeRoot:path.join(root,'tasks'),authority,emit:e=>events.push(e),close:()=>closed++,runner:{maxRunMs:1000}});
 assert.equal(processWorker.server,undefined);processWorker.stop();assert.equal(closed,1);assert.equal(processWorker.runner.stats().stopped,true);assert.equal(events[0].event,'worker_start');
});
test('deployment build is deterministic and contains only an explicit source allowlist',(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'worker-package-preflight-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {build}=require('../scripts/career/build-owned-worker.cjs'),a=build(path.join(root,'a.tgz')),b=build(path.join(root,'b.tgz'));assert.equal(a.sha256,b.sha256);
 const {execFileSync}=require('node:child_process');const list=execFileSync('tar',['-tzf',a.output],{encoding:'utf8'});assert.match(list,/worker-manifest.json/);assert.match(list,/rpc-helper.cjs/);assert.equal(/\.env|\.git|node_modules|resume\.(pdf|txt|docx)|operator-config/.test(list),false);
});
test('required real PNG capability blocks a worker before approval/submission when absent',(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-required-evidence-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const f=fixture(root,{evidenceRoot:path.join(root,'evidence'),evidenceRequired:true});const queued=f.worker.receive('user-a',f.input),result=f.worker.prepare('user-a',queued.id);
 assert.equal(result.blocker,'REQUIRED_BROWSER_EVIDENCE_MISSING');assert.equal(result.evidence['form-read'].status,'NOT_WIRED');assert.equal(f.count().clicks,0);assert.notEqual(result.status,'review_ready');
 assert.equal(fs.readdirSync(path.join(root,'evidence')).length,0,'no stand-in PNG or task screenshot folder is generated');
});
