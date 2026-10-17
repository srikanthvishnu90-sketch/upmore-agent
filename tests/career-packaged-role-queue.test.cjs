'use strict';
// Actual unpacked worker entry and durable local files; SYNTHETIC authority and
// portal observations only. Zero browser, network, provider or employer receipt.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
function packaged(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-packaged-queue-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const archive=path.join(root,'worker.tgz');require('../scripts/career/build-owned-worker.cjs').build(archive);const source=path.join(root,'package');fs.mkdirSync(source);execFileSync('tar',['-xzf',archive,'-C',source]);return {root,source};}
function scenario(t,count){
 const {root,source}=packaged(t),{hash}=require(path.join(source,'workers/career-browser/store.cjs'));
 const authority=require(path.join(source,'tests/fixtures/owned-worker-authority.cjs')).mockAuthority(root),ids=[],postings=[],inputs=[],clicks={},opens={};let visible=null;
 const resumePath=path.join(root,'SYNTHETIC.txt');fs.writeFileSync(resumePath,'SYNTHETIC original fixture only');const sha=hash(fs.readFileSync(resumePath));
 // The durable fixture authority exposes completed results exactly once to the
 // packaged polling path. It does not pretend to be the PostgreSQL contract.
 authority.pending=({taskId}={})=>{const d=JSON.parse(fs.readFileSync(path.join(root,'MOCK-authority.json')));return Object.values(d.intents).filter(i=>!i.result&&(!taskId||i.taskId===taskId)&&(!visible||visible.has(i.binding.task_id))).map(i=>({...i}));};
 for(let n=0;n<count;n++){const p={canonicalKey:'SYNTHETIC:'+n,company:'SYNTHETIC company '+n,role:'SYNTHETIC Investment Intern',status:'open',url:'http://localhost:8123/form/'+n};postings.push(p);const id=hash(['owner',p.url]).slice(0,32);ids.push(id);const input={eventId:'prepare_'+n,posting:p,artifactId:'synthetic',resumeSha256:sha};const intentId=authority.register('owner',{action:'prepare',task_id:id,event_id:input.eventId,artifact_id:input.artifactId,resume_sha256:sha,destination:p.url},input);inputs.push({...input,intentId});}
 const start=()=>require(path.join(source,'workers/career-browser/run.cjs')).start({mode:'pull_only',storeRoot:path.join(root,'tasks'),authority,emit(){},runner:{scheduling:'per_role',maxTasks:50,maxTransitions:500},controlledPortals:postings.map(p=>({url:p.url,submitUrl:p.url+'/submit'})),
 resolveEquipment:()=>({userId:'owner',accountVersion:1,privacyEpoch:0,resumePath,profile:{email:'synthetic@example.test',resume:{filename:'SYNTHETIC.txt',sha256:sha}}}),
 boardFactory:opts=>{const n=Number(opts.url.split('/').at(-1)),filled={};return {kind:'browser',browserDriver:true,sandbox:false,host:'localhost',open(){opens[n]=(opens[n]||0)+1;return {ok:true};},form(){return {fields:[{field_id:'email',kind:'standard',profile_key:'email',required:true},{field_id:'resume',kind:'standard',profile_key:'resume',required:true},...(n===1?[{field_id:'unknown',kind:'attestation',required:true,label:'SYNTHETIC missing answer'}]:[])]};},fill(k,v){filled[k]=v;},answers(){return {...filled};},atReview(){return {atFinalReview:true};},armForSubmit(){},submit(){clicks[n]=(clicks[n]||0)+1;return {outcome:'timeout'};},submissionState(){return {unverifiable:true};},close(){}};}});
 return {root,source,authority,ids,inputs,clicks,opens,start,setVisible:ids=>{visible=ids?new Set(ids):null;}};
}
test('packaged per-role runner progresses healthy roles past a held role and UNKNOWN across restart',t=>{
 const f=scenario(t,10);f.setVisible([f.ids[0]]);let running=f.start();try{
  let d=JSON.parse(fs.readFileSync(path.join(f.root,'MOCK-authority.json'))),results=Object.values(d.intents).map(i=>i.result);
  const ready=results.find(r=>r.id===f.ids[0]),a=ready.review;
  f.authority.register('owner',{action:'approve',task_id:ready.id,event_id:'approve_first',payload_sha256:a.payloadSha256,resume_sha256:a.resumeSha256,destination:a.destination});
  running.runner.tick();assert.deepEqual(f.clicks,{0:1});running.stop();f.setVisible(null);running=f.start();for(let n=0;n<11;n++)running.runner.tick();
  assert.equal(running.runner.stats().stopped,false);assert.deepEqual(f.clicks,{0:1});
  d=JSON.parse(fs.readFileSync(path.join(f.root,'MOCK-authority.json')));results=Object.values(d.intents).map(i=>i.result);assert.equal(results.filter(r=>r?.status==='unknown_outcome').length,1);
  assert.equal(results.filter(r=>r?.status==='review_ready').length,9);assert.equal(results.filter(r=>r?.status==='awaiting_user').length,1);
  assert.equal(Object.values(f.opens).reduce((a,b)=>a+b,0),11);assert.equal(Object.keys(f.opens).length,10);
 }finally{running.stop();}
});
test('packaged 100-role preparation uses two bounded windows and restart, without fabricated submissions',t=>{
 const f=scenario(t,100);let running=f.start();try{
  for(let n=0;n<55;n++)running.runner.tick();assert.equal(running.runner.stats().tasks,50);assert.equal(running.runner.stats().stopped,true);running.stop();
  running=f.start();for(let n=0;n<55;n++)running.runner.tick();assert.equal(running.runner.stats().tasks,50);assert.equal(running.runner.stats().stopped,true);
  const d=JSON.parse(fs.readFileSync(path.join(f.root,'MOCK-authority.json'))),results=Object.values(d.intents).map(i=>i.result);
  assert.equal(results.filter(r=>r?.status==='review_ready').length,99);assert.equal(results.filter(r=>r?.status==='awaiting_user').length,1);assert.deepEqual(f.clicks,{});assert.equal(Object.keys(f.opens).length,100);assert.ok(Object.values(f.opens).every(n=>n===1));
 }finally{running.stop();}
});
