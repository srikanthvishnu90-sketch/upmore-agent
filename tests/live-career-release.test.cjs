'use strict';
// Executes the reviewed deployable graph, not the modern trunk router. SQL,
// auth and network transports are doubles; no real channel/model claim.
const {test}=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
if(!vm.SourceTextModule){
 test('reviewed live career release contracts',()=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;const r=spawnSync(process.execPath,['--experimental-vm-modules','--test',__filename],{env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);});
}else{
 const REPO_ROOT=process.env.CASE2_TEST_REPO_ROOT||path.resolve(__dirname,'..');
 const fixture=require('./helpers/live-career-package.cjs');
 const F=require(path.join(REPO_ROOT,'tests/helpers/correction-privacy-fixture.cjs'));
 const ROOT=process.env.CAREER_LIVE_RELEASE_PACKAGE||path.join(REPO_ROOT,'supabase/releases/career-case2-isolation-v1/agent-chat');
 const OWNER=F.OWNERS[0],THREAD=F.THREADS[0],copy=F.copy;
 const starts=(app,message='/start',key='start-1')=>app.request(OWNER,THREAD,message,key);
 const REVIEWED_FILES=[{"path":"src/index.ts","bytes":576,"sha256":"8c3381223b1d795a2e4abe2e0bb0517b23a9c22068a56b1ed51ad5ce7a3d5ca7"},{"path":"src/handler-career.ts","bytes":21635,"sha256":"a2c270d5aec8a5b07f9693f28054c0cdd575487f8f7140c985c480c137259f04"},{"path":"_shared/identity_redact.ts","bytes":5660,"sha256":"831a25411627de10615784bf209c0de304f13b61ad833c7f9769e0795b0d8f83"},{"path":"src/_shared/chat_cors.ts","bytes":778,"sha256":"a2b2d1842471e86573601fe7e31075d8105a432b9d5fa053cfcd12fe591c7796"},{"path":"src/_shared/chat_input.ts","bytes":2034,"sha256":"1929990c0e2f3ce56c59b67b413c6026aab0e15ae6b44daa3578076c17da2662"},{"path":"src/_shared/chat_session.ts","bytes":1326,"sha256":"25aee5ae5b24d3150a8551ebfbe0db98297aed75fbb3a8b0423b52b2b29ec623"},{"path":"_shared/router_core.career.js","bytes":3390379,"sha256":"7339f0c04f1d85ad3242c2a4466605baeab9ca35dc12bbe22e791fac78603033"},{"path":"_shared/career_task_bridge.js","bytes":13402,"sha256":"48be697c55bd4f3952bf0e890e76032020476d27cf3000af7c435a1f927f3880"},{"path":"_shared/career_host.js","bytes":14766,"sha256":"4251a5efc4f2f3eecb6dfa4e5942e9fa6c48f7f746944438856d3cff6ec9ced7"},{"path":"_shared/career_pool.js","bytes":3582,"sha256":"2ac09d226e04b8540dbe8a0d359f266f0bbe8e5624c8aaa7463229a4e0a574d4"},{"path":"_shared/career_persistence.js","bytes":4001,"sha256":"75507cdcbef14440f6e2d0ff7c237a3d3fb12262cb868d0ab33aae55120b3c07"},{"path":"_shared/channel_artifacts.ts","bytes":9343,"sha256":"2d76321add79177dc212176025e739e031217f9152500e34bdc12933754dc05d"}];
test('exact bounded release package retains the reviewed twelve-file graph and source hashes',async()=>{
  const app=await fixture(ROOT),graph=app.graph();
  const files=REVIEWED_FILES.map(f=>f.path).sort();
  assert.deepEqual(graph.filter(p=>!p.startsWith('https:')),files);
  assert.deepEqual(graph.filter(p=>p.startsWith('https:')),['https://deno.land/std@0.208.0/http/server.ts','https://esm.sh/@supabase/supabase-js@2.117.1']);
  for(const f of REVIEWED_FILES){const bytes=fs.readFileSync(path.join(ROOT,f.path));assert.equal(bytes.length,f.bytes,f.path+' bytes');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256,f.path+' SHA256');}
});
test('release integrity refuses an unmanifested test alias in the deploy tree',()=>{
  const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'live-release-extra-'));
  try{
    fs.cpSync(path.dirname(ROOT),temp,{recursive:true});
    fs.writeFileSync(path.join(temp,'agent-chat/_shared/test-alias.ts'),'export {};\n');
    assert.throws(()=>require('../scripts/career/check-live-release.cjs').verifyRelease(temp),/unexpected or missing file/);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('release integrity refuses a source change accompanied by an edited manifest',()=>{
  const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'live-release-digest-'));
  try{
    fs.cpSync(path.dirname(ROOT),temp,{recursive:true});
    const file=path.join(temp,'agent-chat/src/index.ts');fs.appendFileSync(file,'\n// unreviewed change\n');
    const manifest=JSON.parse(fs.readFileSync(path.join(temp,'manifest.json'),'utf8'));
    const row=manifest.functions.find(f=>f.name==='agent-chat').files.find(f=>f.path==='src/index.ts');
    const bytes=fs.readFileSync(file);row.bytes=bytes.length;row.sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(path.join(temp,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    assert.throws(()=>require('../scripts/career/check-live-release.cjs').verifyRelease(temp),/reviewed manifest digest changed/);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('actual normal POST gives /start explicit useful intent without career fact or provider writes',async()=>{
  const app=await fixture(ROOT,{configure(dbs){const db=dbs.get(OWNER);db.state.career.stores.profile._onboarding_pending='roles';db.state.career.stores.statedFacts={facts:[{kind:'target_firm',value:'SYNTHETIC thread firm'}]};db.account={stated_facts:{facts:[{kind:'target_firm',value:'SYNTHETIC account firm'}]}};}});
  const db=app.dbs.get(OWNER),before=copy(db.state.career.stores),account=copy(db.account);
  const result=await starts(app);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.meta.intent,'career_greeting');
  assert.equal(result.body.meta.result_status,'completed');assert.equal(result.body.meta.contained,false);assert.equal(result.body.action,null);
  assert.match(result.body.reply,/Trainee/);assert.match(result.body.reply,/openings/);assert.match(result.body.reply,/resume/);assert.match(result.body.reply,/interview/);
  assert.deepEqual(db.state.career.stores,before);assert.deepEqual(db.account,account);assert.deepEqual(app.calls.commits.map(c=>c.p_patch),[{}]);
  assert.deepEqual(app.calls.requests,[{thread_id:THREAD,turn_key:'start-1',message:'/start'}]);
  assert.deepEqual(app.calls.identityProfileUpserts,[{id:OWNER}],'existing identity bootstrap is separate from career-profile/fact mutation');
  assert.deepEqual(app.calls.network,[]);assert.equal(db.messages.length,2);
});
test('actual warm package repeated greetings and exact replay do not advance pending state or duplicate messages',async()=>{
  const app=await fixture(ROOT,{configure(dbs){const db=dbs.get(OWNER);db.state.career.stores.profile._onboarding_pending='roles';}}),db=app.dbs.get(OWNER),before=copy(db.state.career.stores);
  const first=await starts(app);assert.equal(first.status,200);assert.equal(first.body.meta.intent,'career_greeting');
  const replay=await starts(app);assert.deepEqual(replay.body,first.body);assert.equal(app.calls.commits.length,1);assert.equal(db.messages.length,2);
  const second=await starts(app,'hello','hello-2');assert.equal(second.body.meta.intent,'career_greeting');
  assert.deepEqual(db.state.career.stores,before);assert.deepEqual(app.calls.commits.map(c=>c.p_patch),[{},{}]);assert.equal(db.messages.length,4);
});
test('actual router keeps a substantive greeting-prefixed internship request',async()=>{
  const app=await fixture(ROOT,{configure(dbs){dbs.get(OWNER).state.career={v:1,scope:{userId:OWNER},stores:{}};}});
  const result=await starts(app,'Hi! Find me internships I can apply to this week.','mixed-1');
  assert.equal(result.status,200,JSON.stringify(result.body));assert.notEqual(result.body.meta.intent,'career_greeting');assert.equal(result.body.meta.intent,'career_internship_discovery');
  assert.match(result.body.reply,/no|empty|none|not|haven/i);assert.equal(result.body.action,null);assert.deepEqual(app.calls.network,[]);
});
test('actual mixed orientation and task remains outside the bare greeting route',async()=>{
  const app=await fixture(ROOT,{configure(dbs){dbs.get(OWNER).state.career={v:1,scope:{userId:OWNER},stores:{}};}});
  const result=await starts(app,'What can you do for me? Apply to three jobs.','mixed-task-1');
  assert.equal(result.status,200,JSON.stringify(result.body));assert.notEqual(result.body.meta.intent,'career_greeting');assert.equal(result.body.action,null);
});
test('actual account pause denies /start without correction or provider effects',async()=>{
  const app=await fixture(ROOT,{configure(dbs){dbs.get(OWNER).account={paused:true};}}),db=app.dbs.get(OWNER),before=copy(db.state.career.stores.profile);
  const result=await starts(app);assert.equal(result.status,200);assert.equal(result.body.meta.intent,'career_paused');assert.equal(result.body.action,null);
  assert.deepEqual(db.state.career.stores.profile,before);assert.deepEqual(app.calls.commits.map(c=>c.p_patch),[{}]);assert.deepEqual(app.calls.network,[]);
});
test('actual erase then paused greeting and explicit resume never resurrect saved career profile',async()=>{
  const app=await fixture(ROOT),db=app.dbs.get(OWNER);
  const erased=await starts(app,'forget my career profile','erase-1');assert.equal(erased.status,200);assert.equal(erased.body.meta.intent,'career_profile_erased');assert.equal(db.state.career.stores.profile,undefined);
  const paused=await starts(app,'/start','erase-start-2');assert.equal(paused.body.meta.intent,'career_paused');assert.equal(db.state.career.stores.profile,undefined);
  const resumed=await starts(app,'resume career work','resume-3');assert.equal(resumed.body.meta.intent,'career_resumed');
  const greeted=await starts(app,'/start','post-erase-4');assert.equal(greeted.body.meta.intent,'career_greeting');assert.equal(db.state.career.stores.profile,undefined);
  assert.deepEqual(app.calls.commits.at(-1).p_patch,{});assert.deepEqual(app.calls.network,[]);
});
test('actual owner boundary rejects a foreign thread before career load or commit',async()=>{
  const app=await fixture(ROOT),result=await app.request(OWNER,F.THREADS[1],'/start','foreign-1');
  assert.equal(result.status,404);assert.equal(result.body.error,'Conversation unavailable');
  assert.equal(app.calls.rpc.filter(c=>c.name==='career_host_load').length,0);assert.equal(app.calls.commits.length,0);
  assert.ok([...app.dbs.values()].every(db=>db.messages.length===0));
});
test('actual host rejects a foreign-owner snapshot without publishing its content',async()=>{
  const app=await fixture(ROOT,{configure(dbs){dbs.get(OWNER).options.foreignSnapshot=true;}}),result=await starts(app);
  assert.equal(result.status,503);assert.equal(result.body.error,'storage_unavailable');assert.equal(app.calls.commits.length,0);assert.equal(app.dbs.get(OWNER).messages.length,0);
  assert.doesNotMatch(result.body.reply,/graduation|2027|2028|SYNTHETIC/);
});
test('actual persistence privacy-epoch conflict prevents a greeting response from being committed or published',async()=>{
  const app=await fixture(ROOT,{configure(dbs){dbs.get(OWNER).options.staleCommit=true;}}),db=app.dbs.get(OWNER),before=copy(db.state.career);
  const result=await starts(app);assert.equal(result.status,409);assert.equal(result.body.error,'privacy_epoch_changed');assert.equal(result.body.action,null);
  assert.deepEqual(db.state.career,before);assert.equal(db.messages.length,0);assert.doesNotMatch(result.body.reply,/Hi — I'm Trainee/);
});
test('actual storage failure is truthful and same-key recovery commits greeting once',async()=>{
  const app=await fixture(ROOT,{configure(dbs){dbs.get(OWNER).options.failSave=true;}}),db=app.dbs.get(OWNER),before=copy(db.state.career);
  const failed=await starts(app);assert.equal(failed.status,503);assert.equal(failed.body.error,'storage_unavailable');assert.deepEqual(db.state.career,before);assert.equal(db.messages.length,0);
  db.options.failSave=false;const recovered=await starts(app);assert.equal(recovered.status,200);assert.equal(recovered.body.meta.intent,'career_greeting');assert.equal(db.messages.length,2);
  assert.deepEqual((await starts(app)).body,recovered.body);assert.equal(db.messages.length,2);
});
test('actual fixed sixty-request limiter remains authoritative for /start',async()=>{
  const app=await fixture(ROOT,{configure(dbs){dbs.get(OWNER).options.rateLimited=true;}}),result=await starts(app);
  assert.equal(result.status,429);assert.equal(result.headers['retry-after'],'3600');assert.equal(result.body.error,'rate_limited');
  assert.equal(app.calls.commits.length,0);assert.equal(app.calls.rpc.filter(c=>c.name==='career_host_load').length,0);
});
test('actual same-key different-input conflict cannot alter the settled greeting record',async()=>{
  const app=await fixture(ROOT),db=app.dbs.get(OWNER),first=await starts(app);assert.equal(first.status,200);const before=copy(db.state.career);
  const conflict=await starts(app,'hello','start-1');assert.equal(conflict.status,409);assert.equal(conflict.body.error,'turn_key_conflict');
  assert.deepEqual(db.state.career,before);assert.equal(db.messages.length,2);assert.equal(app.calls.commits.length,1);
});
test('actual warm A correction followed by B greeting does not dispatch or rewrite B profile',async()=>{
  const other=F.OWNERS[1],otherThread=F.THREADS[1];
  const app=await fixture(ROOT,{configure(dbs){dbs.get(other).state.career=F.snapshot(other,F.profile('2031'));}});
  const corrected=await starts(app,F.CORRECT,'correct-A-1');assert.equal(corrected.status,200);assert.equal(corrected.body.meta.intent,'profile_correction');assert.equal(app.dbs.get(OWNER).state.career.stores.profile.constraints.graduationDate,'2028');
  const db=app.dbs.get(other),before=copy(db.state.career.stores),account=copy(db.account);
  const greeted=await app.request(other,otherThread,'/start','start-B-1');assert.equal(greeted.status,200);assert.equal(greeted.body.meta.intent,'career_greeting');
  assert.deepEqual(db.state.career.stores,before);assert.deepEqual(db.account,account);assert.deepEqual(app.calls.commits.at(-1).p_patch,{});
  assert.equal(db.state.career.stores.profile.constraints.graduationDate,'2031');
});
test('actual bare greeting never reconciles conflicting thread facts into the owned account fact record',async()=>{
  const app=await fixture(ROOT,{configure(dbs){const db=dbs.get(OWNER);db.state.career.stores.statedFacts={facts:[{kind:'target_firm',value:'SYNTHETIC thread firm'}]};db.account={stated_facts:{facts:[{kind:'target_firm',value:'SYNTHETIC account firm'}]}};}});
  const db=app.dbs.get(OWNER),account=copy(db.account),stores=copy(db.state.career.stores);
  const result=await starts(app);assert.equal(result.status,200);
  assert.deepEqual(app.calls.commits.map(c=>c.p_patch),[{}]);
  assert.deepEqual(db.account,account);assert.deepEqual(db.state.career.stores,stores);
});
test('actual bare greeting for an empty inventory creates no career profile or fact state',async()=>{
  const app=await fixture(ROOT,{configure(dbs){dbs.get(OWNER).state.career={v:1,scope:{userId:OWNER},stores:{}};}});
  const result=await starts(app);assert.equal(result.status,200);
  assert.deepEqual(app.dbs.get(OWNER).state.career.stores,{});
  assert.deepEqual(app.calls.commits.map(c=>c.p_patch),[{}]);
  assert.equal(result.body.meta.intent,'career_greeting');
});

test('PR90 identical live failure: B2031 never becomes A2028 after shared-default-id correction',async()=>{
  const {onboarding:O,networkCalls}=await fixture.loadOnboarding(ROOT);
  const a=F.profile('2027'),b=F.profile('2031'),before=copy(b);
  assert.equal(O.applyProfileCorrection(a,F.CORRECT).ok,true);
  assert.equal(a.constraints.graduationDate,'2028');
  O.handleChat(F.RECALL,{profile:b});
  assert.equal(b.constraints.graduationDate,'2031','the exact v246 failure changed B2031 into A2028');
  assert.deepEqual(b,before,'read cannot import another profile audit/source/version/dependents');
  assert.deepEqual(networkCalls,[]);
});
for(const collision of ['default-id','name','email'])for(const failSave of [false,true])test(`PR90 actual normal POST interleaved owners ${collision}, A correction ${failSave?'failed':'committed'}`,async()=>{
  const other=F.OWNERS[1],otherThread=F.THREADS[1];
  const app=await fixture(ROOT,{configure(dbs){for(const [owner,db]of dbs)db.state.career=F.snapshot(owner,F.profile(owner===OWNER?'2027':'2031',collision));dbs.get(OWNER).options.failSave=failSave;}});
  const a=app.dbs.get(OWNER),b=app.dbs.get(other),beforeB=copy(b.state.career.stores.profile);
  const correction=await starts(app,F.CORRECT,'privacy-correction-A-1');
  assert.equal(correction.status,failSave?503:200);assert.equal(a.state.career.stores.profile.constraints.graduationDate,failSave?'2027':'2028');
  if(failSave)assert.equal(a.messages.length,0);
  const recallB=await app.request(other,otherThread,F.RECALL,'privacy-recall-B-1');
  assert.equal(recallB.status,200);assert.match(recallB.body.reply,/2031/);assert.doesNotMatch(recallB.body.reply,/2028/);
  assert.deepEqual(b.state.career.stores.profile,beforeB);
  a.options.failSave=false;const beforeA=copy(a.state.career.stores.profile);
  const recallA=await starts(app,F.RECALL,'privacy-recall-A-2');assert.equal(recallA.status,200);
  assert.match(recallA.body.reply,failSave?/2027/:/2028/);assert.deepEqual(a.state.career.stores.profile,beforeA);
  const beforeB2=copy(b.state.career.stores.profile);
  assert.match((await app.request(other,otherThread,F.RECALL,'privacy-recall-B-2')).body.reply,/2031/);
  assert.deepEqual(b.state.career.stores.profile,beforeB2);assert.deepEqual(app.calls.network,[]);
});
test('PR90 committed correction survives fresh exact-package realm through owner-bound JSON and exact replay',async()=>{
  const app=await fixture(ROOT),db=app.dbs.get(OWNER),first=await starts(app,F.CORRECT,'committed-correction-1');
  assert.equal(first.status,200);const committed=copy(db.state.career.stores.profile);
  assert.equal(committed.constraints.graduationDate,'2028');assert.equal(committed.fact_version,1);
  assert.equal(committed.profile_corrections.length,1);assert.equal(committed.facts[0].needs_confirmation,false);assert.equal(committed.dependent_state.rebuilt,true);
  assert.deepEqual((await starts(app,F.CORRECT,'committed-correction-1')).body,first.body);assert.equal(db.messages.length,2);
  assert.deepEqual(db.state.career.stores.profile,committed);
  const fresh=await fixture(ROOT,{configure(dbs){dbs.get(OWNER).state=copy(db.state);dbs.get(OWNER).account=copy(db.account);}});
  const recall=await starts(fresh,F.RECALL,'fresh-recall-2');assert.equal(recall.status,200);assert.match(recall.body.reply,/2028/);
  assert.deepEqual(fresh.dbs.get(OWNER).state.career.stores.profile,committed);assert.deepEqual(fresh.calls.network,[]);
});
test('PR90 deprecated export/reset APIs retain no process-wide correction data and do not erase owned facts',async()=>{
  const {onboarding:O}=await fixture.loadOnboarding(ROOT),p=F.profile();
  assert.equal(O.applyProfileCorrection(p,F.CORRECT).ok,true);const committed=copy(p);
  assert.deepEqual(copy(O.exportCorrectionStore()),[]);O._resetCorrectionStore();assert.deepEqual(copy(p),committed,"reset must preserve the exact durable profile JSON across VM realms");
  assert.deepEqual(copy(O.exportCorrectionStore()),[]);
});
test('PR90 deprecated restore/apply APIs cannot seed an ownerless legacy correction',async()=>{
  const {onboarding:O}=await fixture.loadOnboarding(ROOT);
  const poison=[{key:F.profile().id,graduationDate:'2099',changes:[],audit:[{instruction:'SYNTHETIC foreign correction'}],resume_sources:{active:'foreign'}}];
  assert.equal(O.restoreCorrectionStore(poison),0);assert.deepEqual(copy(O.exportCorrectionStore()),[]);
  const p=F.profile('2031'),before=copy(p);assert.equal(O.applyPersistedCorrections(p),false);assert.deepEqual(p,before);
});
test('PR90 stale and erased profile objects cannot receive process-local replay from actual bundle',async()=>{
  const {onboarding:O}=await fixture.loadOnboarding(ROOT),p=F.profile(),stale=copy(p);
  assert.equal(O.applyProfileCorrection(p,F.CORRECT).ok,true);
  assert.equal(O.applyPersistedCorrections(stale),false);assert.deepEqual(stale,F.profile());
  const erased={id:p.id,basics:copy(p.basics),constraints:{},facts:[]},before=copy(erased);
  O.handleChat(F.RECALL,{profile:erased});assert.deepEqual(erased,before);
  O._resetCorrectionStore();assert.equal(p.constraints.graduationDate,'2028');
});
test('PR90 actual privacy-epoch rejection leaves no correction for later same/foreign-owner reads',async()=>{
  const app=await fixture(ROOT,{configure(dbs){dbs.get(OWNER).options.staleCommit=true;dbs.get(F.OWNERS[1]).state.career=F.snapshot(F.OWNERS[1],F.profile('2031'));}}),a=app.dbs.get(OWNER),b=app.dbs.get(F.OWNERS[1]);
  const rejected=await starts(app,F.CORRECT,'stale-correction-1');assert.equal(rejected.status,409);assert.equal(rejected.body.error,'privacy_epoch_changed');
  assert.equal(a.messages.length,0);assert.equal(a.state.career.stores.profile.constraints.graduationDate,'2027');
  a.options.staleCommit=false;
  assert.match((await starts(app,F.RECALL,'post-stale-A-2')).body.reply,/2027/);
  const before=copy(b.state.career.stores.profile);
  const other=await app.request(F.OWNERS[1],F.THREADS[1],F.RECALL,'post-stale-B-2');assert.match(other.body.reply,/2031/);assert.deepEqual(b.state.career.stores.profile,before);
});
test('PR90 actual erase/resume and later recalls cannot resurrect pre-erase correction evidence',async()=>{
  const app=await fixture(ROOT),db=app.dbs.get(OWNER);
  assert.equal((await starts(app,F.CORRECT,'erase-correct-1')).status,200);
  assert.equal((await starts(app,'forget my career profile','erase-profile-2')).body.meta.intent,'career_profile_erased');
  assert.equal(db.state.career.stores.profile,undefined);assert.equal(db.account.stated_facts,undefined);
  assert.equal((await starts(app,'resume career work','erase-resume-3')).body.meta.intent,'career_resumed');
  for(const key of ['erase-recall-4','erase-recall-5']){
    const recalled=await starts(app,F.RECALL,key);assert.equal(recalled.status,200);assert.doesNotMatch(recalled.body.reply,/2028/);
    const p=db.state.career.stores.profile;
    assert.notEqual(p?.constraints?.graduationDate,'2028');assert.equal(p?.profile_corrections,undefined);assert.equal(p?.resume_sources,undefined);
  }
  assert.deepEqual(app.calls.network,[]);
});

}
