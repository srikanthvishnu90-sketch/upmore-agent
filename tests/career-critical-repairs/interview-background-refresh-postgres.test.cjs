'use strict';
// Frozen before repair. Real alerts-store adapter and watch RPCs; actual
// staged interview entry, owned native SQL. No provider or campaign funding.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('./interview-entry-fixture.cjs')();
const PREFIX='career:owner-mutation:';
const count=()=>Number(F.sql(`select count(*)from career_watch_kv where user_id='${F.U}'and key like '${PREFIX}%'`));
const turns=()=>Number(F.sql(`select count(*)from career_watch_kv where user_id='${F.U}'and key like 'career:turn:%'`));
const account=()=>JSON.parse(F.sql(`select value from career_watch_kv where user_id='${F.U}'and key='career:account'`));
const history=user=>'career:reminder-history:'+user;
const queue=user=>'career:reminder-queue:'+user;
async function store(owner=F.U){
 const {createSupabaseStore}=await import('../../scripts/career/alerts-host.mjs');
 return createSupabaseStore({userId:owner,client:{rpc:async(name,args)=>{
  try{return {data:await F.callAsync(name,args),error:null};}
  catch(e){return {data:null,error:{message:e.message}};}
 }}});
}
async function send(a,type,key,extra={},message='Interview preparation'){
 const r=await a.requestBody(F.body(type,key,extra,message));
 assert.equal(r.status,200,JSON.stringify(r.body));return r.body;
}
async function init(t){F.seed();const a=await F.app(t);await send(a,'save_fact','initial',{id:'p',kind:'project',expected_version:null,actual:true},'Actual class calculator.');return a;}
function ordinary(key){
 const h='b'.repeat(64),l=F.call('career_host_load',{p_user:F.U,p_thread:F.T,p_key:key,p_hash:h});
 const r=F.call('career_host_commit',{p_user:F.U,p_thread:F.T,p_key:key,p_hash:h,p_revision:l.revision,p_account_version:l.accountVersion,p_snapshot:l.snapshot,p_patch:{},p_input:'Ordinary owned turn',p_response:{thread_id:F.T,turn_key:key,reply:'Ordinary owned turn saved.',action:null,reminders:[]}});
 assert.ok(r.response);
}
function proposal(loaded){
 const c=structuredClone(loaded.context);c.binding={...loaded.binding,context_sha256:'0'.repeat(64)};
 const hashable=structuredClone(c);delete hashable.captured_at;delete hashable.binding.context_sha256;
 c.binding.context_sha256=F.sha(F.canonical(hashable));
 return {p_user:F.U,p_thread:F.T,p_expected_hash:loaded.context.binding.context_sha256,p_binding:loaded.binding,p_basis:loaded.basis,p_context:c};
}
test('actual multiwrite alert cycles preserve interview read, correction and resume writes without fabricated chat receipts',async t=>{
 const a=await init(t),original=F.context().facts[0],beforeTurns=turns();
 const events=[];
 for(let i=0;i<2;i++){
  const s=await store(),cycle=s.beginCycle();
  await cycle.store.set(`career:jobs:snapshot:board:greenhouse:fixture:${F.U}`,{seen:['controlled-'+i]});
  await cycle.store.set(history(F.U),[{id:'controlled-'+i}]);
  await cycle.commit([]);events.push({account:account(),turns:turns(),witnesses:count()});
 }
 assert.equal(turns(),beforeTurns,'a background cycle must not invent chat receipts');
 assert.equal(account().version,5);
 const read=await a.requestBody(F.body('status','after-cycle')),afterRead=F.context();
 const correction=await a.requestBody(F.body('save_fact','correct',{id:'p',kind:'project',expected_version:0,actual:true},'Actual input validation only.'));
 const resume=await a.requestBody(F.body('save_resume','resume',{id:'r',expected_version:null,actual:true},'Graduation 2027. Class calculator, no deployment.'));
 console.log(JSON.stringify({evidence:'MULTIWRITE_CYCLE_READ_CORRECTION_RESUME_RESPONSES',events,read,correction,resume}));
 for(const r of [read,correction,resume])assert.equal(r.status,200,JSON.stringify(r.body));
 assert.deepEqual(afterRead.facts[0],original);assert.equal(count(),4);
 const fresh=await F.app(t);await send(fresh,'status','fresh');
 assert.equal(F.context().facts.find(f=>f.id==='p').item_version,1);
 assert.equal(F.context().sources[0].content,'Graduation 2027. Class calculator, no deployment.');
 const witnesses=JSON.parse(F.sql(`select jsonb_agg(value order by key)from career_watch_kv where user_id='${F.U}'and key like '${PREFIX}%'`));
 assert.deepEqual(witnesses.map(w=>w.account_version),[2,3,4,5]);
 for(const w of witnesses){assert.equal(w.kind,'career_watch_write/v1');assert.equal(w.owner_id,F.U);assert.equal(w.epoch,0);assert.match(w.key_sha256,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(w).includes('controlled-'));}
 console.log(JSON.stringify({evidence:'ACTUAL_ALERT_STORE_CYCLES_TO_INTERVIEW_ENTRY',events,witnesses,context:F.context(),paidCalls:0}));
});
test('direct alert-store write followed by ordinary host turns cannot leave a permanent counter mismatch',async t=>{
 const a=await init(t),s=await store();await s.set(queue(F.U),[]);ordinary('ordinary');
 await send(a,'status','read');await send(a,'save_fact','repair',{id:'p',kind:'project',expected_version:0,actual:true},'Actual corrected calculator.');
 assert.equal(count(),1);assert.equal(F.context().binding.account_version,4);
});
test('concurrent background and context writes preserve both values after explicit stale-fence retry',async t=>{
 const a=await init(t),s=await store();await s.get(queue(F.U));
 const cmd=F.body('save_fact','concurrent-correct',{id:'p',kind:'project',expected_version:0,actual:true},'Actual concurrent correction.');
 const [background,answer]=await Promise.allSettled([s.set(queue(F.U),[{id:'controlled'}]),a.requestBody(cmd)]);
 if(background.status==='rejected'){const retry=await store();await retry.set(queue(F.U),[{id:'controlled'}]);}
 if(answer.status==='rejected')throw answer.reason;
 assert.ok([200,409].includes(answer.value.status),JSON.stringify(answer.value.body));
 if(answer.value.status===409)assert.equal((await a.requestBody(cmd)).status,200);
 await send(a,'status','concurrent-read');assert.equal(F.context().facts[0].item_version,1);
 assert.equal(F.context().facts[0].value,'Actual concurrent correction.');
 assert.deepEqual(F.call('career_watch_read',{p_user:F.U,p_key:queue(F.U)}).value,[{id:'controlled'}]);assert.equal(count(),1);
});
test('two concurrent alert-store fences admit one write, reject the stale write, and retain its explicit retry',async t=>{
 const a=await init(t),one=await store(),two=await store();await one.get(queue(F.U));await two.get(history(F.U));
 const results=await Promise.allSettled([one.set(queue(F.U),[{id:'q'}]),two.set(history(F.U),[{id:'h'}])]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const failed=results.findIndex(r=>r.status==='rejected'),retry=await store();await retry.set(failed===0?queue(F.U):history(F.U),[{id:failed===0?'q':'h'}]);
 await send(a,'status','two-background-read');assert.equal(count(),2);assert.equal(account().version,3);
});
test('unwitnessed owner edits remain blocked after legitimate background and later host writes',async t=>{
 const a=await init(t),s=await store();await s.set(queue(F.U),[]);await send(a,'status','legitimate');const before=F.context();
 F.sql(`update career_watch_kv set value=jsonb_set(value,'{version}',to_jsonb((value->>'version')::bigint+1))where user_id='${F.U}'and key='career:account'`);
 ordinary('later-host');const another=await store();await another.set(history(F.U),[]);
 assert.equal((await a.requestBody(F.body('status','unwitnessed'))).status,409);
 assert.equal((await a.requestBody(F.body('save_fact','unwitnessed-save',{id:'p',kind:'project',expected_version:0,actual:true},'Cannot bless this counter.'))).status,409);
 assert.deepEqual(F.context(),before);
});
test('a watch commit invalidates an outstanding refresh CAS proposal without overwriting context',async t=>{
 const a=await init(t),s=await store();await s.set(queue(F.U),[]);
 const loaded=F.call('career_journey_context_refresh_load_v1',{p_user:F.U,p_thread:F.T}),args=proposal(loaded),before=F.context();
 const next=await store();await next.set(history(F.U),[]);
 assert.equal(F.call('career_journey_context_refresh_commit_v1',args).error,'revision_conflict');assert.deepEqual(F.context(),before);
 await send(a,'status','cas-current');
});
test('foreign witnesses and client roles cannot authorize an owner context or write mutation journals',async t=>{
 const a=await init(t),foreign=await store(F.V);await foreign.set(queue(F.V),[]);
 F.sql(`update career_watch_kv set value=jsonb_set(value,'{version}','2')where user_id='${F.U}'and key='career:account'`);
 assert.equal((await a.requestBody(F.body('status','foreign-witness'))).status,409);
 const other=await F.app(t,{owner:F.V});assert.equal((await other.requestBody(F.body('status','foreign-thread'))).status,404);
 for(const role of ['anon','authenticated'])assert.throws(()=>F.sql(`select career_watch_write('${F.U}','${queue(F.U)}','[]',2,0)`,role));
 assert.throws(()=>F.call('career_watch_write',{p_user:F.U,p_key:PREFIX+'0:2',p_value:{},p_version:2,p_epoch:0}));assert.equal(count(),0);
});
test('pause and erase retain admission and epoch fences; erasure removes all old mutation witnesses',async t=>{
 const a=await init(t),s=await store();await s.set(queue(F.U),[]);await send(a,'status','before-pause');
 const stale=await store();await stale.get(queue(F.U));assert.equal((await a.request(F.T,'pause career work','pause-owner')).status,200);
 await assert.rejects(stale.set(queue(F.U),[{id:'late'}]));assert.notEqual((await a.requestBody(F.body('start','paused-start',{available_minutes:30}))).status,200);
 assert.equal((await a.request(F.T,'Forget my career profile','erase-owner')).status,200);assert.equal(count(),0);
 await assert.rejects(stale.set(queue(F.U),[{id:'old-epoch'}]));assert.equal(F.sql(`select count(*)from career_watch_kv where key like 'career:journey-context:%'`),'0');
 assert.equal((await a.request(F.T,'resume career work','resume-owner')).status,200);
 await send(a,'save_resume','new-epoch',{id:'r',expected_version:null,actual:true},'Fresh actual resume after erasure.');
 const current=await store();await current.set(queue(F.U),[]);await send(a,'status','new-epoch-read');
 assert.equal(F.context().binding.epoch,1);assert.equal(count(),1);assert.ok(!JSON.stringify(F.context()).includes('Actual class calculator'));
});
test('failed multiwrite cycles roll back background values, account counter and mutation witnesses atomically',async t=>{
 const a=await init(t),before=account(),s=await store(),cycle=s.beginCycle();
 await cycle.store.set(history(F.U),[{id:'rolled-back'}]);await cycle.store.set('zz-invalid',{});await assert.rejects(cycle.commit([]));
 assert.deepEqual(account(),before);assert.equal(count(),0);assert.equal(F.call('career_watch_read',{p_user:F.U,p_key:history(F.U)}).value,null);
 await send(a,'status','after-rollback');
});
test('background profile changes stale account-scoped evidence until explicit repair instead of retagging it fresh',async t=>{
 const a=await init(t),c=F.context();c.facts[0].scope={kind:'account',owner_id:F.U};const h=structuredClone(c);delete h.captured_at;delete h.binding.context_sha256;c.binding.context_sha256=F.sha(F.canonical(h));
 F.sql(`update career_watch_kv set value=${F.q(c)}::jsonb where user_id='${F.U}'and key='career:journey-context:${F.T}'`);
 const s=await store();await s.set('career:watch-profile:'+F.U,{user_id:F.U,facts:[{text:'Changed owned profile source'}]});
 assert.equal((await a.requestBody(F.body('status','profile-changed'))).status,409);assert.equal(F.context().facts[0].freshness,'stale');assert.equal(F.context().facts[0].item_version,0);
 await send(a,'save_fact','explicit-confirm',{id:'p',kind:'project',expected_version:0,actual:true},'Explicit current source confirmation.');await send(a,'status','profile-repaired');
});
